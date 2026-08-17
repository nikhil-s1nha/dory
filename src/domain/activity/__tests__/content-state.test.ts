import type { StackContext } from '@/lib/widget-sync';

import {
  ACTIVITY_CONTENT_STATE_MAX_BYTES,
  ACTIVITY_TITLE_MAX_CHARS,
  activityContentStateFor,
  activityImageFilename,
  activityMediaId,
  assertWithinContentStateBudget,
  contentStateByteLength,
  joinAppGroupUri,
  makeActivityContentState,
  resolveActivityImageUri,
  serializeContentState,
  toActivityProps,
  utf8ByteLength,
  withinContentStateBudget,
} from '../content-state';
import type { BundlesActivityContentState } from '../types';

const photo = {
  id: 'photo-1',
  coupleId: 'couple-1',
  senderId: 'partner',
  type: 'photo' as const,
  storagePath: 'couple-1/photo-1.jpg',
  createdAt: 1_700_000_000_000,
  seenAt: null,
};

const drawing = { ...photo, id: 'drawing-1', type: 'drawing' as const, createdAt: 1_700_000_001_000 };

const music = {
  trackId: 'track-1',
  title: 'Nightcall',
  artist: 'Kavinsky, Lovefoxxx',
  albumArtUrl: 'https://i.scdn.co/image/abc',
  isPlaying: true,
};

const ctx: StackContext = {
  latestPhoto: photo,
  latestDrawing: drawing,
  music,
  partnerName: 'Alex',
};

const state: BundlesActivityContentState = {
  kind: 'photo',
  title: 'Alex sent you a photo',
  subtitle: '',
  imageFile: 'photo-1.jpg',
  deepLink: 'bundles://media/photo-1',
  sentAt: 1_700_000_000_000,
};

/**
 * An independent UTF-8 length, to check the hand-rolled counter against. `encodeURIComponent`
 * percent-escapes one `%XX` pair per UTF-8 byte, so collapsing each pair to a single character
 * counts bytes. `Buffer` isn't available here — this project has no @types/node.
 */
function utf8LengthByEscaping(value: string): number {
  return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gi, 'x').length;
}

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte per character', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('counts accented Latin as two bytes', () => {
    expect(utf8ByteLength('é')).toBe(2);
  });

  it('counts CJK as three bytes', () => {
    expect(utf8ByteLength('好')).toBe(3);
  });

  it('counts an emoji surrogate pair as four bytes, not six', () => {
    // '💜'.length is 2 in JS; naive per-unit counting would say 6.
    expect(utf8ByteLength('💜')).toBe(4);
  });

  it('agrees with an independent encoder on mixed content', () => {
    const sample = 'Alex 💜 sent 好 a photo — é';
    expect(utf8ByteLength(sample)).toBe(utf8LengthByEscaping(sample));
  });
});

describe('the 4KB budget', () => {
  it('measures the stringified form, which is what LiveActivity.update actually sends', () => {
    expect(contentStateByteLength(state)).toBe(utf8LengthByEscaping(serializeContentState(state)));
  });

  it('accepts an ordinary state', () => {
    expect(withinContentStateBudget(state)).toBe(true);
    expect(() => assertWithinContentStateBudget(state)).not.toThrow();
  });

  it('rejects one over the limit and names the measured size', () => {
    const huge = { ...state, title: 'x'.repeat(ACTIVITY_CONTENT_STATE_MAX_BYTES) };
    expect(withinContentStateBudget(huge)).toBe(false);
    expect(() => assertWithinContentStateBudget(huge)).toThrow(/over the 4096 byte limit/);
  });

  it('counts multi-byte text at its encoded weight, not its JS length', () => {
    // 2000 emoji = 2000 JS chars per surrogate pair rule, but 8000 UTF-8 bytes.
    const emoji = { ...state, title: '💜'.repeat(2000) };
    expect(emoji.title.length).toBeLessThan(ACTIVITY_CONTENT_STATE_MAX_BYTES);
    expect(withinContentStateBudget(emoji)).toBe(false);
  });

  it('keeps every state the builder produces inside the budget', () => {
    const built = makeActivityContentState({ ...state, title: '💜'.repeat(2000), subtitle: '好'.repeat(2000) });
    expect(withinContentStateBudget(built)).toBe(true);
  });
});

describe('makeActivityContentState', () => {
  it('caps both text lines', () => {
    const built = makeActivityContentState({ ...state, title: 'a'.repeat(500), subtitle: 'b'.repeat(500) });
    expect(built.title).toHaveLength(ACTIVITY_TITLE_MAX_CHARS);
    expect(built.subtitle).toHaveLength(96);
  });

  it('leaves ordinary text untouched', () => {
    expect(makeActivityContentState(state)).toEqual(state);
  });
});

describe('activityImageFilename', () => {
  it('reduces a downloadToAppGroup file URI to the App Group filename', () => {
    expect(
      activityImageFilename(
        'file:///private/var/mobile/Containers/Shared/AppGroup/ABC/ExpoWidgets/photo-1.jpg',
      ),
    ).toBe('photo-1.jpg');
  });

  it('passes a bare filename through', () => {
    expect(activityImageFilename('album.jpg')).toBe('album.jpg');
  });

  it('drops a query string, so a signed URL cannot leak into the content state', () => {
    expect(activityImageFilename('https://x.supabase.co/storage/photo-1.jpg?token=secret')).toBe(
      'photo-1.jpg',
    );
  });

  it('is null for nothing', () => {
    expect(activityImageFilename(null)).toBeNull();
    expect(activityImageFilename(undefined)).toBeNull();
    expect(activityImageFilename('')).toBeNull();
  });
});

describe('resolving a filename back to a URI for the layout', () => {
  const dir = 'file:///AppGroup/ABC/ExpoWidgets/';

  it('joins over the trailing slash widgetsDirectory always has', () => {
    expect(joinAppGroupUri(dir, 'photo-1.jpg')).toBe('file:///AppGroup/ABC/ExpoWidgets/photo-1.jpg');
  });

  it('joins when the separator is missing on both sides', () => {
    expect(joinAppGroupUri('file:///AppGroup/ABC/ExpoWidgets', 'photo-1.jpg')).toBe(
      'file:///AppGroup/ABC/ExpoWidgets/photo-1.jpg',
    );
  });

  it('is null with no image or no App Group container', () => {
    expect(resolveActivityImageUri(dir, null)).toBeNull();
    expect(resolveActivityImageUri(null, 'photo-1.jpg')).toBeNull();
  });

  it('gives the layout an absolute file:// URI — a bare name renders nothing on iOS', () => {
    const props = toActivityProps(state, dir);
    expect(props.imageFile).toBe('file:///AppGroup/ABC/ExpoWidgets/photo-1.jpg');
    // Everything else is carried through untouched.
    expect(props.title).toBe(state.title);
    expect(props.deepLink).toBe(state.deepLink);
  });

  it('leaves a text-only frame text-only', () => {
    expect(toActivityProps({ ...state, imageFile: null }, dir).imageFile).toBeNull();
  });

  /**
   * Load-bearing for the native patch, not just for the UI: `patches/expo-widgets+57.0.6.patch`
   * reads `props.deepLink` in Swift on every frame and applies it as the activity's `widgetURL`.
   * Drop the field here and the Lock Screen tap silently goes back to opening the app root — the
   * exact defect 5ee973d fixed for the home-screen widget.
   */
  it('carries deepLink into the props the native side reads for the tap target', () => {
    expect(toActivityProps(state, dir).deepLink).toBe('bundles://media/photo-1');
    expect(toActivityProps({ ...state, imageFile: null }, null).deepLink).toBe(
      'bundles://media/photo-1',
    );
  });

  it('keeps every deep link the stack can produce intact through the props conversion', () => {
    const links = [
      'bundles://media/photo-1',
      'bundles://draw?base=drawing-1',
      'bundles://music',
    ];
    for (const deepLink of links) {
      expect(toActivityProps({ ...state, deepLink }, dir).deepLink).toBe(deepLink);
    }
  });
});

describe('activityContentStateFor', () => {
  it('builds the photo state with the widget’s deep link and the item’s send time', () => {
    expect(activityContentStateFor('photo', ctx, 'photo-1.jpg')).toEqual({
      kind: 'photo',
      title: 'Alex sent you a photo',
      subtitle: '',
      imageFile: 'photo-1.jpg',
      deepLink: 'bundles://media/photo-1',
      sentAt: photo.createdAt,
    });
  });

  it('opens a drawing on the canvas, pre-loaded, exactly as the widget does', () => {
    expect(activityContentStateFor('drawing', ctx, 'drawing-1.jpg')).toEqual({
      kind: 'drawing',
      // Same wording the Edge Functions send, deliberately — see content-state.ts.
      title: 'Alex drew you something',
      subtitle: '',
      imageFile: 'drawing-1.jpg',
      deepLink: 'bundles://draw?base=drawing-1',
      sentAt: drawing.createdAt,
    });
  });

  it('puts the track on line one and the artist on line two', () => {
    const built = activityContentStateFor('music', ctx, 'album.jpg');
    expect(built).toMatchObject({
      kind: 'music',
      title: 'Nightcall',
      subtitle: 'Kavinsky, Lovefoxxx',
      imageFile: 'album.jpg',
      deepLink: 'bundles://music',
    });
  });

  it('accepts a text-only state — the frame a push-started activity renders first', () => {
    expect(activityContentStateFor('photo', ctx, null)?.imageFile).toBeNull();
  });

  it('is null when the named item is not actually present', () => {
    expect(activityContentStateFor('music', { ...ctx, music: null }, null)).toBeNull();
    expect(activityContentStateFor('photo', { ...ctx, latestPhoto: null }, null)).toBeNull();
    expect(activityContentStateFor(null, ctx, null)).toBeNull();
  });

  it('caps a hostile track title from Spotify', () => {
    const long = { ...ctx, music: { ...music, title: 'z'.repeat(1000) } };
    const built = activityContentStateFor('music', long, null);
    expect(built?.title).toHaveLength(ACTIVITY_TITLE_MAX_CHARS);
    expect(withinContentStateBudget(built!)).toBe(true);
  });
});

describe('activityMediaId', () => {
  it('is the media_items row for a photo or drawing', () => {
    expect(activityMediaId('photo', ctx)).toBe('photo-1');
    expect(activityMediaId('drawing', ctx)).toBe('drawing-1');
  });

  it('is null for music, which has no media_items row', () => {
    expect(activityMediaId('music', ctx)).toBeNull();
    expect(activityMediaId(null, ctx)).toBeNull();
  });
});
