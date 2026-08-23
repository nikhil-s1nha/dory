/**
 * Keeps the home-screen widget in sync. On app foreground we resolve which content is present
 * (latest photo, latest drawing, partner's now-playing), advance the smart-stack cursor one step
 * (M5 logic), download the chosen item's image into the App Group container, and push it to the
 * widget via updateSnapshot. The widget itself never hits the network — it only reads the local
 * file we place in `widgetsDirectory`.
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
import { advanceStack, INITIAL_CURSOR, type WidgetContentType } from '@/domain/widget/stack';
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
 * Fetch what the partner currently has waiting, without advancing anything.
 *
 * Split out from `syncWidgetOnOpen` so the in-app preview (M7) can rotate over the same content on a
 * timer. Advancing is deliberately *not* part of this: the widget's cursor is persisted and means
 * "one step per app open", while the preview's is in-memory and means "one step per 15 seconds".
 * Fusing them would let the preview scramble the widget's shipped M5 behavior.
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

/**
 * Advance the stack one step and refresh the widget. Call on app foreground for a paired user.
 * Best-effort: any failure (offline, no content) leaves the widget on its last snapshot.
 */
export async function syncWidgetOnOpen(coupleId: string, userId: string): Promise<void> {
  try {
    const { ctx, present } = await loadStackSnapshot(coupleId, userId);

    const stored = await AsyncStorage.getItem(CURSOR_KEY);
    const prevCursor = stored === null ? INITIAL_CURSOR : Number(stored);
    const { cursor, item } = advanceStack(present, prevCursor);

    const props = await buildProps(item, ctx);
    // `_imageDebug` is not read by the widget component — it rides along so the downscale result is
    // visible in the App Group plist, which is the only channel readable from a host machine
    // (Metro logs don't stream here, and devicectl can't reach the ExpoWidgets directory).
    BundlesWidget.updateSnapshot({ ...props, _imageDebug: lastImageDebug } as BundlesWidgetProps);

    // Commit the cursor only once the snapshot it selected is actually on screen. Persisting it
    // before `buildProps` meant a download timeout advanced *past* an item that was never
    // rendered — the partner's photo was skipped, permanently and silently, because the next open
    // would start from the item after it. Leaving the cursor where it is makes the next open retry
    // the same item, which is the behavior a transient failure should have.
    await AsyncStorage.setItem(CURSOR_KEY, String(cursor));
  } catch (error) {
    // Say what broke. The widget still keeps its last good snapshot, but a bare `catch {}` here is
    // how this pipeline became undebuggable three separate times: the symptom is always "the
    // widget looks frozen", and the cause is always a specific step that already knew its name.
    console.warn('[widget-sync] syncWidgetOnOpen failed; widget keeps its last snapshot', error);
  }
}
