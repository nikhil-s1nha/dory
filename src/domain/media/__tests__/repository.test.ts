import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRecentMedia, getSignedUrl, markSeen, sendImage } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixed-id' }));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: () => ({
      resize: () => ({
        renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file://resized.jpg' }) }),
      }),
    }),
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

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
