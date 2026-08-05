/**
 * Keeps the home-screen widget in sync. On app foreground we resolve which content is present
 * (latest photo, latest drawing, partner's now-playing), advance the smart-stack cursor one step
 * (M5 logic), download the chosen item's image into the App Group container, and push it to the
 * widget via updateSnapshot. The widget itself never hits the network — it only reads the local
 * file we place in `widgetsDirectory`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { widgetsDirectory } from 'expo-widgets';

import { WIDGET_RENDER_MAX_DIMENSION } from '@/constants/app-group';

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
async function downloadToAppGroup(url: string, filename: string): Promise<string> {
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
  // Staging lives in the app's OWN cache, not in the App Group. expo-image-manipulator reads the
  // staged file, and pointing it at a path inside the shared container is asking it to reach across
  // a sandbox boundary — which is where the read stopped coming back at all. Only the finished
  // derivative crosses into the App Group, by a move, which is the one operation that has to.
  const staged = new File(Paths.cache, `widget-staging-${stagingSequence++}-${filename}`);
  if (staged.exists) staged.delete();
  await withTimeout('download', STEP_TIMEOUT_MS, File.downloadFileAsync(url, staged, { idempotent: true }));

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
    if (staged.exists) staged.delete();
  }
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
  const media = await fetchRecentMedia(supabase, coupleId, 20);
  const fromPartner = media.filter((m) => m.senderId !== userId);
  const latestPhoto = fromPartner.find((m) => m.type === 'photo') ?? null;
  const latestDrawing = fromPartner.find((m) => m.type === 'drawing') ?? null;
  const partner = await fetchPartnerNowPlaying(supabase, coupleId, userId);
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
    const url = await getSignedUrl(supabase, ctx.latestPhoto.storagePath);
    const file = await downloadToAppGroup(url, `photo-${ctx.latestPhoto.id}.jpg`);
    return { kind: 'photo', imageFile: file, deepLink: `bundles://media/${ctx.latestPhoto.id}` };
  }
  if (item === 'drawing' && ctx.latestDrawing) {
    const url = await getSignedUrl(supabase, ctx.latestDrawing.storagePath);
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
    await AsyncStorage.setItem(CURSOR_KEY, String(cursor));

    const props = await buildProps(item, ctx);
    // `_imageDebug` is not read by the widget component — it rides along so the downscale result is
    // visible in the App Group plist, which is the only channel readable from a host machine
    // (Metro logs don't stream here, and devicectl can't reach the ExpoWidgets directory).
    BundlesWidget.updateSnapshot({ ...props, _imageDebug: lastImageDebug } as BundlesWidgetProps);
  } catch {
    /* leave the widget on its last good snapshot */
  }
}
