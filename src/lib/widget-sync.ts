/**
 * Keeps the home-screen widget in sync. On app foreground we resolve which content is present
 * (latest photo, latest drawing, partner's now-playing), pick the next item in the shuffle cycle,
 * download its image into the App Group container, and push it to the widget via updateSnapshot.
 * The widget itself never hits the network — it only reads the local file we place in
 * `widgetsDirectory`.
 *
 * **Every entry point funnels through one serialized queue.** There are three callers —
 * `useWidgetSync` on mount, `useWidgetSync` on foreground, and `usePush` when a notification lands —
 * and they genuinely overlap: each run takes seconds of network. Left unserialized, two runs read
 * the same cursor and either both write the same next step (one advance for two runs) or, if the
 * first commits before the second reads, walk *two* steps for a single app open. Two steps over the
 * two items the bug was reported against lands back on the item already showing, which is exactly
 * what "I have to foreground twice before anything changes" was. See `runQueued` below.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { widgetsDirectory } from 'expo-widgets';

import { ACTIVITY_RENDER_MAX_DIMENSION, WIDGET_RENDER_MAX_DIMENSION } from '@/constants/app-group';

import BundlesWidget, { type BundlesWidgetProps } from '../../widgets/bundles-widget';
import { fetchPartnerNowPlaying } from '@/domain/spotify/repository';
import { fetchRecentMedia, getSignedUrl } from '@/domain/media/repository';
import type { MediaItem } from '@/domain/media/types';
import type { NowPlaying } from '@/domain/spotify/types';
import {
  parseCursor,
  selectionOrder,
  type SelectionIntent,
  type WidgetContentType,
  type WidgetCursor,
} from '@/domain/widget/stack';
import { supabase } from '@/lib/supabase';

const CURSOR_KEY = 'bundles.widget.cursor';

/** What the last downscale produced, surfaced through the widget props for on-device diagnosis. */
let lastImageDebug: string | undefined;

/** Same idea for the Live Activity derivative, surfaced through the dev control's status line. */
let lastActivityImageDebug: string | undefined;

/** What `deriveActivityImage` last produced — the only channel that reaches a device screenshot. */
export function activityImageDebug(): string | undefined {
  return lastActivityImageDebug;
}

/** Makes each in-flight download's staging file unique, so concurrent syncs can't collide. */
let stagingSequence = 0;

/**
 * Fail a step rather than let it hang forever.
 *
 * Every caller here already treats an error as "leave the widget on its last snapshot", but none of
 * them can recover from a promise that simply never settles: the sync sits pending, the in-app
 * preview never leaves its loading state, and nothing anywhere says why. A bounded wait turns that
 * silent limbo into the ordinary failure path, and names the step that stalled.
 */
function withTimeout<T>(label: string, ms: number, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`widget-sync: ${label} timed out after ${ms}ms`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Generous enough for a slow connection, short enough that a stalled step doesn't wedge the widget. */
const STEP_TIMEOUT_MS = 20_000;

/**
 * Download `url` into the App Group under `filename`, downscaled to a size the widget extension can
 * actually decode; return its uri.
 *
 * The downscale is the whole point. The extension shares a ~30MB budget with the expo-widgets JS
 * runtime, and a 1200px image (~7.7MB decoded) is enough to push a render over it. When that
 * happens nothing announces itself — no crash, no log — WidgetKit just keeps showing the previous
 * snapshot. Capping here rather than at upload also repairs media already sitting in Storage.
 */
/**
 * Downloads currently in flight, keyed by the App Group filename they're writing.
 *
 * `useWidgetSync` and `useWidgetPreview` both mount in the (tabs) layout and ask for the *same*
 * files at the same moment. Left alone they each download, resize and re-encode the same image, and
 * then race on the final move — which iOS rejects with `NSFileWriteFileExistsError` (Err516), since
 * checking `target.exists` before moving is a time-of-check/time-of-use gap that both callers win.
 * Sharing one promise per filename removes the collision by removing the duplicate work.
 */
const inFlight = new Map<string, Promise<string>>();

function downloadToAppGroup(url: string, filename: string): Promise<string> {
  const existing = inFlight.get(filename);
  if (existing) return existing;

  const work = downloadToAppGroupUncoordinated(url, filename).finally(() => {
    inFlight.delete(filename);
  });
  inFlight.set(filename, work);
  return work;
}

async function downloadToAppGroupUncoordinated(url: string, filename: string): Promise<string> {
  const dir = new Directory(widgetsDirectory);
  // The App Group container exists from the entitlement, but this subdirectory does not until
  // something writes it — and downloading into a missing directory throws. That makes the very
  // first sync after a fresh install fail silently, leaving the widget (and the in-app preview)
  // empty until some later run happens to find the directory already there. Idempotent, so this is
  // a no-op on every subsequent call.
  dir.create({ intermediates: true, idempotent: true });

  const target = new File(dir, filename);

  // Download beside the target first: the original is what we measure, and only the downscaled
  // derivative should ever appear under the name the widget reads.
  //
  // The staging name carries a per-call sequence number because two syncs genuinely do overlap —
  // `useWidgetSync` and `useWidgetPreview` both mount in the (tabs) layout, and `syncWidgetOnOpen`
  // additionally re-runs on every AppState 'active'. Two of them racing on one fixed staging path
  // made the download reject with `DestinationAlreadyExists`, which this module then swallowed,
  // leaving the widget silently empty. `idempotent` covers the leftovers of a run that died before
  // its cleanup.
  // Staging stays *inside* the App Group, beside the target. It was briefly moved to the app's own
  // cache on the theory that expo-image-manipulator couldn't read across the container boundary;
  // the logs disproved that (AppleJPEG decodes the staged file happily) and the change quietly
  // turned the final `move` into a cross-container one, which is far likelier to be rejected. Keep
  // every file on one volume and let only the unique name solve the collision.
  const staged = new File(dir, `staging-${stagingSequence++}-${filename}`);
  if (staged.exists) staged.delete();
  await withTimeout('download', STEP_TIMEOUT_MS, File.downloadFileAsync(url, staged, { idempotent: true }));

  // `File.move` MUTATES the instance to point at its new location, so after a successful move
  // `staged` *is* the target — and the cleanup below would delete the file it just put in place.
  let movedIntoPlace = false;

  try {
    const source = await withTimeout(
      'measure',
      STEP_TIMEOUT_MS,
      ImageManipulator.manipulate(staged.uri).renderAsync(),
    );
    const { width, height } = source;
    const longEdge = Math.max(width, height);
    const decodedMb = ((width * height * 4) / 1024 / 1024).toFixed(1);

    // Already small enough — don't re-encode and lose quality for nothing. Covers square images too,
    // where either edge is the long one.
    if (longEdge <= WIDGET_RENDER_MAX_DIMENSION) {
      // Clear the target immediately before the move, not at the top of the function: a concurrent
      // sync may have written it in between, and moving onto an existing file fails.
      if (target.exists) target.delete();
      await staged.move(target);
      movedIntoPlace = true;
      lastImageDebug = `${width}x${height} ${decodedMb}MB kept`;
      return target.uri;
    }

    // Constrain whichever edge is longer; expo-image-manipulator derives the other from the ratio.
    const context = ImageManipulator.manipulate(staged.uri);
    const scaled =
      width >= height
        ? context.resize({ width: WIDGET_RENDER_MAX_DIMENSION })
        : context.resize({ height: WIDGET_RENDER_MAX_DIMENSION });

    const rendered = await withTimeout('resize', STEP_TIMEOUT_MS, scaled.renderAsync());
    const saved = await withTimeout(
      'encode',
      STEP_TIMEOUT_MS,
      rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG }),
    );
    if (target.exists) target.delete();
    await new File(saved.uri).move(target);

    const outMb = ((rendered.width * rendered.height * 4) / 1024 / 1024).toFixed(1);
    lastImageDebug = `${width}x${height} ${decodedMb}MB -> ${rendered.width}x${rendered.height} ${outMb}MB`;
    return target.uri;
  } finally {
    if (!movedIntoPlace && staged.exists) staged.delete();
  }
}

/**
 * Write a Live-Activity-sized copy of an image already sitting in the App Group, and return its URI.
 *
 * **Why a second file rather than reusing the widget's.** ActivityKit requires an image asset to be
 * no larger than the presentation that draws it (`ACTIVITY_RENDER_MAX_DIMENSION` carries the quote
 * and the measurement). The widget's 600px derivative is 3-30x the size of every frame in
 * `widgets/bundles-activity.tsx`, and ActivityKit's response to that is to draw a flat grey box —
 * no error, no log, and a perfectly successful `start`. The home-screen widget renders the same
 * file correctly at the same moment, which is exactly what makes the failure so hard to read.
 *
 * Named `activity-<widget filename>` so the two derivatives of one media item sit side by side in
 * the container and neither can be mistaken for the other. Always regenerated rather than cached on
 * existence: `album.jpg` keeps one name while its contents change with the track, so an
 * exists-check would pin the activity to the first album art ever seen.
 *
 * Shares `inFlight` with `downloadToAppGroup` (different key, same map) because the activity path
 * and `useWidgetSync` genuinely overlap on foreground, and two writers racing on one target path is
 * how this module previously produced `NSFileWriteFileExistsError`.
 */
export function deriveActivityImage(sourceUri: string): Promise<string> {
  const base = sourceUri.split('?')[0].split('#')[0].split('/').pop() ?? '';
  const filename = `activity-${base}`;
  const existing = inFlight.get(filename);
  if (existing) return existing;

  const work = deriveActivityImageUncoordinated(sourceUri, filename).finally(() => {
    inFlight.delete(filename);
  });
  inFlight.set(filename, work);
  return work;
}

async function deriveActivityImageUncoordinated(sourceUri: string, filename: string): Promise<string> {
  const dir = new Directory(widgetsDirectory);
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, filename);

  const source = await withTimeout(
    'activityMeasure',
    STEP_TIMEOUT_MS,
    ImageManipulator.manipulate(sourceUri).renderAsync(),
  );
  const { width, height } = source;

  // Already inside the budget — hand back the widget's own file rather than re-encoding it. Album
  // art in particular often arrives small enough, and an upscale would only cost quality.
  if (Math.max(width, height) <= ACTIVITY_RENDER_MAX_DIMENSION) {
    lastActivityImageDebug = `${width}x${height} kept`;
    return sourceUri;
  }

  const context = ImageManipulator.manipulate(sourceUri);
  const scaled =
    width >= height
      ? context.resize({ width: ACTIVITY_RENDER_MAX_DIMENSION })
      : context.resize({ height: ACTIVITY_RENDER_MAX_DIMENSION });
  const rendered = await withTimeout('activityResize', STEP_TIMEOUT_MS, scaled.renderAsync());
  const saved = await withTimeout(
    'activityEncode',
    STEP_TIMEOUT_MS,
    rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG }),
  );
  if (target.exists) target.delete();
  await new File(saved.uri).move(target);

  lastActivityImageDebug = `${width}x${height} -> ${rendered.width}x${rendered.height}`;
  return target.uri;
}

export interface StackContext {
  latestPhoto: MediaItem | null;
  latestDrawing: MediaItem | null;
  music: NowPlaying | null;
  partnerName: string;
}

/** Everything the stack needs to render: the content itself, plus which types are actually present. */
export interface StackSnapshot {
  ctx: StackContext;
  present: WidgetContentType[];
}

/**
 * How the last `loadStackSnapshot` arrived at its `present` list, as one short string.
 *
 * An `empty` snapshot has two completely different causes that look identical on the home screen:
 * the partner genuinely hasn't sent anything, or the couple *has* media and the partner-only filter
 * removed all of it (which is what a single-account test setup produces, since both "sides" share
 * one `senderId`). This distinguishes them without a debugger — it rides to the device in the
 * snapshot props, the only channel readable from a host machine.
 */
let lastSourceDebug: string | undefined;

/**
 * Fetch what the partner currently has waiting, without advancing anything.
 *
 * Split out from `syncWidgetOnOpen` so the in-app preview (M7) can rotate over the same content on a
 * timer. Selecting is deliberately *not* part of this: the widget's cursor is persisted and means
 * "one step per app open", while the preview's is in-memory and means "one step per 15 seconds".
 * Fusing them would let the preview scramble the widget's shipped behavior.
 */
export async function loadStackSnapshot(coupleId: string, userId: string): Promise<StackSnapshot> {
  // The widget is a window into what *the partner* is doing (spec 3.1/3.2: a sent item "becomes
  // the new top-priority item in the partner's widget stack"). `fetchRecentMedia` is couple-scoped,
  // so it also returns our own sends — filter them out, or the widget shows you your own photo
  // back and a partner who has gone quiet looks like a broken widget.
  // Bounded like every other step here: these are network reads on a screen that renders whatever
  // they return, so an unanswered request would otherwise leave the widget and the preview waiting
  // forever with nothing to show and nothing logged.
  const media = await withTimeout('fetchRecentMedia', STEP_TIMEOUT_MS, fetchRecentMedia(supabase, coupleId, 20));
  const fromPartner = media.filter((m) => m.senderId !== userId);
  const latestPhoto = fromPartner.find((m) => m.type === 'photo') ?? null;
  const latestDrawing = fromPartner.find((m) => m.type === 'drawing') ?? null;
  const partner = await withTimeout(
    'fetchPartnerNowPlaying',
    STEP_TIMEOUT_MS,
    fetchPartnerNowPlaying(supabase, coupleId, userId),
  );
  const music = partner?.nowPlaying ?? null;

  const present: WidgetContentType[] = [];
  if (latestPhoto) present.push('photo');
  if (latestDrawing) present.push('drawing');
  if (music) present.push('music');

  lastSourceDebug = `media=${media.length} partner=${fromPartner.length} music=${music ? 'yes' : 'no'}`;

  return {
    ctx: { latestPhoto, latestDrawing, music, partnerName: partner?.name ?? 'Your partner' },
    present,
  };
}

/** Turn the chosen stack item into widget props, downloading its image into the App Group. */
export async function buildProps(
  item: WidgetContentType | null,
  ctx: StackContext,
): Promise<BundlesWidgetProps> {
  if (item === 'photo' && ctx.latestPhoto) {
    const url = await withTimeout(
      'signPhoto',
      STEP_TIMEOUT_MS,
      getSignedUrl(supabase, ctx.latestPhoto.storagePath),
    );
    const file = await downloadToAppGroup(url, `photo-${ctx.latestPhoto.id}.jpg`);
    return { kind: 'photo', imageFile: file, deepLink: `bundles://media/${ctx.latestPhoto.id}` };
  }
  if (item === 'drawing' && ctx.latestDrawing) {
    const url = await withTimeout(
      'signDrawing',
      STEP_TIMEOUT_MS,
      getSignedUrl(supabase, ctx.latestDrawing.storagePath),
    );
    const file = await downloadToAppGroup(url, `drawing-${ctx.latestDrawing.id}.jpg`);
    // Tapping a drawing opens the canvas pre-loaded, ready to draw back (spec 3.2).
    return { kind: 'drawing', imageFile: file, deepLink: `bundles://draw?base=${ctx.latestDrawing.id}` };
  }
  if (item === 'music' && ctx.music) {
    const imageFile = ctx.music.albumArtUrl
      ? await downloadToAppGroup(ctx.music.albumArtUrl, 'album.jpg')
      : undefined;
    return {
      kind: 'music',
      imageFile,
      title: ctx.music.title,
      subtitle: ctx.music.artist,
      caption: `${ctx.partnerName} is listening to ${ctx.music.title}`,
      deepLink: 'bundles://music',
    };
  }
  return { kind: 'empty' };
}

/** What kicked a sync off. Rides to the device in `_trigger`, so a capture says *why* it ran. */
export type WidgetSyncTrigger = 'mount' | 'foreground' | 'push' | 'manual';

export interface WidgetSyncOptions {
  /** Surfaced as `_trigger` in the snapshot. Defaults to 'manual'. */
  trigger?: WidgetSyncTrigger;
  /**
   * Move on to the next item in the cycle. Defaults to true — the shuffle's whole contract is "one
   * app open, one step". Pass false to re-render whatever is already showing with fresher content.
   */
  advance?: boolean;
  /**
   * Jump straight to this item instead of cycling, because it is what just arrived. Only a push
   * knows this; it beats shuffling, which would announce a new photo by showing yesterday's drawing.
   */
  show?: WidgetContentType | null;
}

interface SyncRequest {
  coupleId: string;
  userId: string;
  trigger: WidgetSyncTrigger;
  advance: boolean;
  show: WidgetContentType | null;
}

/** Counts every snapshot handed to WidgetKit, persisted so it keeps counting across relaunches. */
const SYNC_COUNT_KEY = 'bundles.widget.syncCount';

/** Memoised so the counter costs one read per process, not one per sync. */
let syncCount: number | null = null;

/** The number the *next* landed snapshot will carry. Reading it does not consume it. */
async function peekSyncCount(): Promise<number> {
  if (syncCount === null) {
    const stored = Number(await AsyncStorage.getItem(SYNC_COUNT_KEY));
    syncCount = Number.isFinite(stored) && stored >= 0 ? stored : 0;
  }
  return syncCount + 1;
}

/**
 * Consume it, once the snapshot carrying it is actually with WidgetKit.
 *
 * Split from the read so a snapshot write that throws doesn't burn a number: the counter is only
 * useful if consecutive captures differing by more than one *means* something, and a silent gap
 * every time `updateSnapshot` failed would make it mean nothing.
 */
async function commitSyncCount(count: number): Promise<void> {
  syncCount = count;
  await AsyncStorage.setItem(SYNC_COUNT_KEY, String(count));
}

/** The single follow-up slot behind the run in flight, and the run itself. Both null when idle. */
let queuedRequest: SyncRequest | null = null;
let queue: Promise<void> | null = null;

/**
 * Fold a request that arrived mid-run into the one follow-up slot.
 *
 * The slot is *replaced*, not appended to, so anything the waiting request was going to do has to
 * be carried across explicitly — an advance in particular. Dropping it here is not a lost
 * optimisation, it is a lost app open: push (no advance) → the user foregrounds (advance) → a
 * second push (no advance) would otherwise overwrite the foreground's step with the second push's,
 * and the open the user actually made produces nothing. Which is the bug this file exists to fix.
 *
 * Note what is *not* decided here: whether the advance is redundant. That depends on whether the
 * run in flight actually lands one, which is not knowable yet — see `drain`.
 */
function coalesce(incoming: SyncRequest): SyncRequest {
  return {
    ...incoming,
    advance: incoming.advance || (queuedRequest?.advance ?? false),
    // A named item is never dropped: it is the reason the follow-up exists at all.
    show: incoming.show ?? queuedRequest?.show ?? null,
  };
}

/**
 * Advance the shuffle one step and refresh the widget. Call on app foreground for a paired user.
 * Best-effort: any failure (offline, no content) leaves the widget on its last snapshot.
 *
 * Serialized. A call arriving while another is working does not start a second run — it lands in a
 * single follow-up slot that replaces whatever was already waiting, so a burst of triggers can
 * never pile up into a burst of cursor advances. The returned promise settles when the queue drains.
 */
export function syncWidgetOnOpen(
  coupleId: string,
  userId: string,
  options: WidgetSyncOptions = {},
): Promise<void> {
  const request: SyncRequest = {
    coupleId,
    userId,
    trigger: options.trigger ?? 'manual',
    advance: options.advance ?? true,
    show: options.show ?? null,
  };

  if (queue) {
    queuedRequest = coalesce(request);
    return queue;
  }

  // Assigned after `drain` has already started, which is safe only because `drain` cannot settle —
  // or yield to another `syncWidgetOnOpen` call — before its first `await`, several statements in.
  // Nothing between here and there may become synchronous.
  const drained = drain(request);
  queue = drained;
  return drained;
}

/**
 * Run requests one at a time until the follow-up slot is empty.
 *
 * The slot holds at most one request, so this cannot grow unbounded however many triggers fire — a
 * hundred foregrounds during one slow run collapse into exactly one extra pass.
 *
 * The teardown lives here rather than in a `.finally` on the returned promise, so that draining the
 * slot and reopening the gate happen in the same synchronous block. Attached to the promise
 * instead, there is a microtask-wide window after the loop exits in which `queue` is still set: a
 * request arriving in it would be filed into a slot nobody is going to read, and then wiped.
 */
async function drain(first: SyncRequest): Promise<void> {
  let request: SyncRequest | null = first;
  let advanceLanded = false;
  try {
    // `runSync` swallows its own failures, so this loop only ends when the slot is empty.
    while (request) {
      advanceLanded = (await runSync(request)) || advanceLanded;
      request = queuedRequest;
      queuedRequest = null;

      // One burst, one step — but only once a step has actually *landed*. Suppressing the
      // follow-up because an advance was merely attempted is how an offline or unbuildable run
      // used to eat an app open outright: the cursor never moved and the retry had already been
      // stripped of its permission to move it. The follow-up still runs either way; this only
      // decides whether it is allowed to take a second step.
      if (request && advanceLanded) request = { ...request, advance: false };
    }
  } catch (error) {
    // `runSync` is total, so getting here means the queue itself broke rather than a sync. Every
    // caller is a fire-and-forget `void syncWidgetOnOpen(...)`, and an unhandled rejection in React
    // Native is a redbox over a screen that has nothing to do with the widget.
    console.warn('[widget-sync] the sync queue failed', error);
  } finally {
    queuedRequest = null;
    queue = null;
  }
}

/** Resolves to whether this run actually committed a *step* — see `drain`. */
async function runSync(request: SyncRequest): Promise<boolean> {
  try {
    const { ctx, present } = await loadStackSnapshot(request.coupleId, request.userId);
    const lastShown = parseCursor(await AsyncStorage.getItem(CURSOR_KEY));

    // `show` only wins while the item it names is actually here. `selectionOrder` tolerates an
    // absent one by falling through to the cycle — which would quietly turn `advance: false` into
    // an advance, and a push is the one caller that must never spend the user's next step. A push
    // *does* race its own content (replication lag; the Spotify poller nulling now_playing between
    // the send and the read), so this is the common case, not the exotic one.
    const named = request.show && present.includes(request.show) ? request.show : null;
    const intent: SelectionIntent = named
      ? { kind: 'show', item: named }
      : request.advance
        ? { kind: 'advance' }
        : { kind: 'stay' };
    const order = selectionOrder(present, lastShown, intent);

    // Nothing present at all is a real, renderable state — commit it so the widget stops showing
    // content the partner has since deleted, and so the debug fields say *why* it is empty.
    if (order.length === 0) {
      await commit({ kind: 'empty' }, null, lastShown, present, request);
      return false;
    }

    // First choice first, then the rest of the cycle. A single unbuildable item (a signed URL that
    // 404s, a download that times out) used to wedge the shuffle forever: the cursor is only
    // committed once a snapshot lands, so the next open picked the same broken item and failed the
    // same way. Falling through shows *something* new and moves the cursor past the wreckage.
    let lastError: unknown;
    for (const candidate of order) {
      let props: BundlesWidgetProps;
      try {
        props = await buildProps(candidate, ctx);
      } catch (error) {
        lastError = error;
        console.warn(`[widget-sync] could not build "${candidate}"; trying the next item`, error);
        continue;
      }
      // Deliberately outside the try: only *building* an item is worth retrying with another item.
      // A failing `commit` means the snapshot write or the cursor write broke, and carrying on
      // round the loop would hand WidgetKit a second snapshot for one sync.
      await commit(props, candidate, lastShown, present, request);
      return intent.kind === 'advance';
    }
    throw lastError;
  } catch (error) {
    // Say what broke. The widget still keeps its last good snapshot, but a bare `catch {}` here is
    // how this pipeline became undebuggable three separate times: the symptom is always "the
    // widget looks frozen", and the cause is always a specific step that already knew its name.
    console.warn('[widget-sync] syncWidgetOnOpen failed; widget keeps its last snapshot', error);
  }
  return false;
}

/**
 * Hand a snapshot to WidgetKit, then — and only then — remember what it showed.
 *
 * Committing the cursor before the snapshot landed meant a download timeout moved *past* an item
 * that was never rendered: the partner's photo was skipped, permanently and silently, because the
 * next open started from the item after it.
 *
 * The `_`-prefixed fields are diagnostics. The widget component ignores every one of them; they
 * exist because the App Group plist is the only channel readable from a host machine (Metro logs
 * don't stream here, and devicectl can't reach the ExpoWidgets directory). `_syncCount` in
 * particular is what makes "one foreground, one step" provable rather than asserted: two
 * consecutive captures must differ by exactly one.
 */
async function commit(
  props: BundlesWidgetProps,
  shown: WidgetContentType | null,
  lastShown: WidgetCursor,
  present: readonly WidgetContentType[],
  request: SyncRequest,
): Promise<void> {
  const count = await peekSyncCount();

  BundlesWidget.updateSnapshot({
    ...props,
    _imageDebug: lastImageDebug,
    _syncCount: count,
    _cursor: `${lastShown ?? 'none'}->${shown ?? 'none'}`,
    _present: present.join(',') || 'none',
    _source: lastSourceDebug,
    _trigger: request.trigger,
    _syncedAt: new Date().toISOString(),
  });

  await commitSyncCount(count);
  if (shown) await AsyncStorage.setItem(CURSOR_KEY, shown);
}
