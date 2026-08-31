import type { SupabaseClient } from '@supabase/supabase-js';

import { WIDGET_ASPECT_RATIO, WIDGET_IMAGE_MAX_DIMENSION } from '@/constants/app-group';

import { centeredCropRect } from '../crop';
import { fetchRecentMedia, getSignedUrl, markSeen, sendImage } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixed-id' }));
/**
 * Records what `sendImage` asks the manipulator to do, and lets a test set the source dimensions.
 * Self-contained because a jest.mock factory runs before the module's own `const`s exist — the
 * recorder therefore rides out on the mocked module rather than a closure variable.
 */
jest.mock('expo-image-manipulator', () => {
  const state = { calls: [] as [string, unknown][], size: { width: 3024, height: 4032 } };
  const rendered = {
    get width() {
      return state.size.width;
    },
    get height() {
      return state.size.height;
    },
    saveAsync: async () => ({ uri: 'file://resized.jpg' }),
  };
  const context = {
    crop: (rect: unknown) => {
      state.calls.push(['crop', rect]);
      return context;
    },
    resize: (size: unknown) => {
      state.calls.push(['resize', size]);
      return context;
    },
    renderAsync: async () => rendered,
  };
  return {
    __state: state,
    ImageManipulator: {
      manipulate: (source: unknown) => {
        state.calls.push(['manipulate', typeof source]);
        return context;
      },
    },
    SaveFormat: { JPEG: 'jpeg' },
  };
});

const manipulator = jest.requireMock('expo-image-manipulator') as {
  __state: { calls: [string, unknown][]; size: { width: number; height: number } };
};

beforeEach(() => {
  manipulator.__state.calls = [];
  manipulator.__state.size = { width: 3024, height: 4032 };
});

// sendImage reads the resized file's bytes via fetch().arrayBuffer().
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })) as never;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const row = {
  id: 'fixed-id',
  couple_id: 'c1',
  sender_id: 'user-a',
  type: 'photo',
  storage_path: 'c1/fixed-id.jpg',
  created_at: '2026-07-22T00:00:00.000Z',
  seen_at: null,
};

/** Fake covering the table builder (insert/select/eq/order/limit/update) and the storage API. */
function makeClient(opts?: {
  tableResult?: { data?: unknown; error?: unknown };
  uploadError?: unknown;
  signedUrl?: string;
  signedError?: unknown;
}) {
  const calls = {
    uploads: [] as { path: string; contentType?: string }[],
    insert: [] as Record<string, unknown>[],
    update: [] as Record<string, unknown>[],
    lastEq: undefined as [string, unknown] | undefined,
    signedFor: undefined as string | undefined,
  };
  const tableResult = { data: opts?.tableResult?.data ?? null, error: opts?.tableResult?.error ?? null };
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => tableResult,
    insert: (v: Record<string, unknown>) => {
      calls.insert.push(v);
      return builder;
    },
    update: (v: Record<string, unknown>) => {
      calls.update.push(v);
      return builder;
    },
    eq: (c: string, v: unknown) => {
      calls.lastEq = [c, v];
      return builder;
    },
    then: (resolve: (r: typeof tableResult) => void) => resolve(tableResult),
  };
  const client = {
    from: () => builder,
    storage: {
      from: () => ({
        upload: async (path: string, _bytes: ArrayBuffer, o: { contentType?: string }) => {
          calls.uploads.push({ path, contentType: o?.contentType });
          return { data: null, error: opts?.uploadError ?? null };
        },
        createSignedUrl: async (path: string) => {
          calls.signedFor = path;
          return {
            data: { signedUrl: opts?.signedUrl ?? 'https://signed/url' },
            error: opts?.signedError ?? null,
          };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('sendImage', () => {
  it('uploads the resized jpeg under the couple path and inserts the row', async () => {
    const { client, calls } = makeClient({ tableResult: { data: row } });
    const item = await sendImage(client, {
      coupleId: 'c1',
      senderId: 'user-a',
      type: 'photo',
      localUri: 'file://original.heic',
      now: 1000,
    });

    expect(calls.uploads[0]).toEqual({ path: 'c1/fixed-id.jpg', contentType: 'image/jpeg' });
    expect(calls.insert[0]).toEqual({
      id: 'fixed-id',
      couple_id: 'c1',
      sender_id: 'user-a',
      type: 'photo',
      storage_path: 'c1/fixed-id.jpg',
    });
    expect(item.id).toBe('fixed-id');
    expect(item.storagePath).toBe('c1/fixed-id.jpg');
    expect(item.seenAt).toBeNull();
  });

  it('crops to the widget frame and bounds the long edge, in that order', async () => {
    const { client } = makeClient({ tableResult: { data: row } });
    await sendImage(client, {
      coupleId: 'c1',
      senderId: 'user-a',
      type: 'photo',
      localUri: 'file://original.heic',
      now: 1000,
    });

    // The crop is the same rectangle the on-screen guide was drawn from — that identity is the
    // whole promise of the guide.
    const crop = manipulator.__state.calls.find(([kind]) => kind === 'crop');
    expect(crop?.[1]).toEqual(centeredCropRect(3024, 4032, WIDGET_ASPECT_RATIO));

    // Constraining `width` alone used to leave a portrait capture's *height* over the widget's
    // budget, so `downloadToAppGroup` had to re-encode it a second time later.
    const resize = manipulator.__state.calls.find(([kind]) => kind === 'resize');
    const bounded = Object.values(resize?.[1] as Record<string, number>);
    expect(bounded).toEqual([WIDGET_IMAGE_MAX_DIMENSION]);

    // Cropping after the downscale would sample the wrong pixels.
    const order = manipulator.__state.calls.map(([kind]) => kind);
    expect(order.indexOf('crop')).toBeLessThan(order.indexOf('resize'));
  });

  it('skips the crop for an image already at the widget ratio, and never upscales', async () => {
    // A drawing: made on a WIDGET_ASPECT_RATIO canvas and already under the cap.
    manipulator.__state.size = { width: 400, height: 400 };
    const { client } = makeClient({ tableResult: { data: row } });
    await sendImage(client, {
      coupleId: 'c1',
      senderId: 'user-a',
      type: 'drawing',
      localUri: 'file://drawing.png',
      now: 1000,
    });

    expect(manipulator.__state.calls.map(([kind]) => kind)).not.toContain('crop');
    expect(manipulator.__state.calls.map(([kind]) => kind)).not.toContain('resize');
  });

  it('throws (and does not insert a row) when the upload fails', async () => {
    const { client, calls } = makeClient({ uploadError: new Error('storage denied') });
    await expect(
      sendImage(client, { coupleId: 'c1', senderId: 'u', type: 'photo', localUri: 'file://x', now: 0 }),
    ).rejects.toThrow('storage denied');
    expect(calls.insert).toHaveLength(0);
  });
});

describe('fetchRecentMedia', () => {
  it('maps rows to items', async () => {
    const { client } = makeClient({ tableResult: { data: [row] } });
    const items = await fetchRecentMedia(client, 'c1');
    expect(items[0]).toEqual({
      id: 'fixed-id',
      coupleId: 'c1',
      senderId: 'user-a',
      type: 'photo',
      storagePath: 'c1/fixed-id.jpg',
      createdAt: new Date(row.created_at).getTime(),
      seenAt: null,
    });
  });
});

describe('getSignedUrl', () => {
  it('returns the signed url for the path', async () => {
    const { client, calls } = makeClient({ signedUrl: 'https://x/y.jpg' });
    expect(await getSignedUrl(client, 'c1/fixed-id.jpg')).toBe('https://x/y.jpg');
    expect(calls.signedFor).toBe('c1/fixed-id.jpg');
  });

  it('throws on error', async () => {
    const { client } = makeClient({ signedError: new Error('no such object') });
    await expect(getSignedUrl(client, 'c1/missing.jpg')).rejects.toThrow('no such object');
  });
});

describe('markSeen', () => {
  it('writes seen_at as ISO for the id', async () => {
    const { client, calls } = makeClient();
    await markSeen(client, 'fixed-id', Date.parse('2026-07-22T12:00:00.000Z'));
    expect(calls.update[0]).toEqual({ seen_at: '2026-07-22T12:00:00.000Z' });
    expect(calls.lastEq).toEqual(['id', 'fixed-id']);
  });
});
