/**
 * Building and bounding the Live Activity's content state — pure, so all of it is testable without
 * a phone.
 *
 * Three things live here because each of them is a place the feature silently breaks:
 *
 * 1. **The 4 KB budget.** ActivityKit rejects an oversized content state, and `LiveActivity.update`
 *    hands the payload over as `JSON.stringify(props)`. The stringified form is therefore the thing
 *    that must fit, not the object — so that is what we measure.
 * 2. **Image *filenames*, never paths on the wire.** Per the contract, images travel as a name
 *    inside the App Group `ExpoWidgets/` directory. `downloadToAppGroup` deals in `file://` URIs,
 *    so `activityImageFilename` reduces one to the name the contract wants.
 * 3. **Resolving that name back to a URI at render time.** `@expo/ui`'s `Image` reads `uiImage` with
 *    `URL(string:)` + `Data(contentsOf:)` (`node_modules/@expo/ui/ios/ImageView.swift`). A bare
 *    filename has no scheme, so it silently renders nothing — the layout must be handed an absolute
 *    `file://` URI. `toActivityProps` is that translation, and it is the only reason the activity's
 *    props and its content state are not the same object.
 */

import type { StackContext } from '@/lib/widget-sync';
import type { BundlesActivityContentState } from '@/domain/activity/types';
import type { WidgetContentType } from '@/domain/widget/stack';

/** ActivityKit's hard limit on an encoded content state. */
export const ACTIVITY_CONTENT_STATE_MAX_BYTES = 4096;

/**
 * Text caps, applied at construction.
 *
 * Neither line can display anywhere near this much — the Dynamic Island's compact region fits a
 * handful of characters — but a track title is user-controlled data arriving from Spotify, and the
 * only real job here is to keep a pathological one from eating the 4 KB budget.
 */
export const ACTIVITY_TITLE_MAX_CHARS = 96;
export const ACTIVITY_SUBTITLE_MAX_CHARS = 96;

/**
 * Byte length of `value` when UTF-8 encoded.
 *
 * Hand-rolled rather than `Buffer` or `TextEncoder`: this runs in Hermes, where `Buffer` does not
 * exist. Emoji and most non-Latin text cost 3-4 bytes per character, so `string.length` would
 * under-count the budget by up to 4x on exactly the content a couple is most likely to send.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Lead surrogate: one astral character encoded as a pair. 4 bytes, and skip its tail.
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** Exactly what `LiveActivity.update` sends over the bridge. */
export function serializeContentState(state: BundlesActivityContentState): string {
  return JSON.stringify(state);
}

/** Size of the content state as it actually ships. */
export function contentStateByteLength(state: BundlesActivityContentState): number {
  return utf8ByteLength(serializeContentState(state));
}

export function withinContentStateBudget(state: BundlesActivityContentState): boolean {
  return contentStateByteLength(state) <= ACTIVITY_CONTENT_STATE_MAX_BYTES;
}

/**
 * Throw with the measured size when a state would be rejected.
 *
 * ActivityKit's own failure here is opaque, so the check happens on our side of the bridge where
 * the number can be reported.
 */
export function assertWithinContentStateBudget(state: BundlesActivityContentState): void {
  const bytes = contentStateByteLength(state);
  if (bytes > ACTIVITY_CONTENT_STATE_MAX_BYTES) {
    throw new Error(
      `Live Activity content state is ${bytes} bytes, over the ${ACTIVITY_CONTENT_STATE_MAX_BYTES} byte limit`,
    );
  }
}

/** Trim to `max` characters, without a suffix — this is a safety cap, not a display ellipsis. */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * The App Group filename for an image, given whatever `downloadToAppGroup` returned.
 *
 * It returns a full `file:///…/ExpoWidgets/photo-<id>.jpg`; the contract wants `photo-<id>.jpg`.
 * Already-bare names pass through unchanged, and a query string (signed URLs have one) is dropped.
 */
export function activityImageFilename(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const withoutQuery = uri.split('?')[0].split('#')[0];
  const name = withoutQuery.split('/').pop();
  return name ? name : null;
}

/** Join the App Group directory URI and a filename, tolerating a missing or doubled separator. */
export function joinAppGroupUri(directory: string, filename: string): string {
  const base = directory.endsWith('/') ? directory.slice(0, -1) : directory;
  const name = filename.startsWith('/') ? filename.slice(1) : filename;
  return `${base}/${name}`;
}

/**
 * The absolute `file://` URI the layout can actually read, or null when there is no image or no
 * container (`widgetsDirectory` is null if the App Group entitlement is missing).
 */
export function resolveActivityImageUri(
  directory: string | null | undefined,
  filename: string | null,
): string | null {
  if (!directory || !filename) return null;
  return joinAppGroupUri(directory, filename);
}

/** What the layout renders: the content state with its image name resolved to a readable URI. */
export type BundlesActivityProps = Omit<BundlesActivityContentState, 'imageFile'> & {
  /** Absolute `file://` URI inside the App Group, or null for a text-only frame. */
  imageFile: string | null;
};

export function toActivityProps(
  state: BundlesActivityContentState,
  directory: string | null | undefined,
): BundlesActivityProps {
  return { ...state, imageFile: resolveActivityImageUri(directory, state.imageFile) };
}

/** Assemble a content state with both text lines capped. The only constructor callers should use. */
export function makeActivityContentState(
  state: BundlesActivityContentState,
): BundlesActivityContentState {
  return {
    ...state,
    title: truncate(state.title, ACTIVITY_TITLE_MAX_CHARS),
    subtitle: truncate(state.subtitle, ACTIVITY_SUBTITLE_MAX_CHARS),
  };
}

/**
 * The content state for one smart-stack item, or null when that item isn't actually present.
 *
 * The wording and the deep links deliberately match `syncWidgetOnOpen`'s: the activity and the
 * widget are the same product, and a tap on either must land on the same screen. Photos and
 * drawings carry an empty subtitle — the layout renders the age from `sentAt` in its place, which
 * is what that field is for.
 */
export function activityContentStateFor(
  item: WidgetContentType | null,
  ctx: StackContext,
  imageFile: string | null,
): BundlesActivityContentState | null {
  if (item === 'photo' && ctx.latestPhoto) {
    return makeActivityContentState({
      kind: 'photo',
      title: `${ctx.partnerName} sent you a photo`,
      subtitle: '',
      imageFile,
      deepLink: `bundles://media/${ctx.latestPhoto.id}`,
      sentAt: ctx.latestPhoto.createdAt,
    });
  }
  if (item === 'drawing' && ctx.latestDrawing) {
    return makeActivityContentState({
      kind: 'drawing',
      title: `${ctx.partnerName} sent you a drawing`,
      subtitle: '',
      // A drawing opens the canvas pre-loaded, ready to draw back (spec 3.2) — as the widget does.
      imageFile,
      deepLink: `bundles://draw?base=${ctx.latestDrawing.id}`,
      sentAt: ctx.latestDrawing.createdAt,
    });
  }
  if (item === 'music' && ctx.music) {
    return makeActivityContentState({
      kind: 'music',
      title: ctx.music.title,
      subtitle: ctx.music.artist,
      imageFile,
      deepLink: 'bundles://music',
      // Music has no send time — it's a live state, so "sent" is now.
      sentAt: Date.now(),
    });
  }
  return null;
}

/** The `media_items` row an activity state refers to, for `live_activity_instances.media_id`. */
export function activityMediaId(item: WidgetContentType | null, ctx: StackContext): string | null {
  if (item === 'photo') return ctx.latestPhoto?.id ?? null;
  if (item === 'drawing') return ctx.latestDrawing?.id ?? null;
  return null;
}
