/**
 * The four contract writes, checked against the column names in
 * `docs/live-activity-contract.md`. These are the names the backend lane's migration and dispatcher
 * are built against, so a drift here is a silent "the push never arrives".
 */

import {
  recordActivityEnded,
  recordActivityStarted,
  registerActivityUpdateToken,
  registerPushToStartToken,
} from '../repository';

/**
 * Mutated per test to walk the branches. Every read happens inside a closure the factory only
 * *defines*, so the hoisted `jest.mock` never touches this before it is initialized.
 */
const mockDb = {
  user: { id: 'user-a' } as { id: string } | null,
  authError: null as unknown,
  writeError: null as unknown,
  calls: {
    tables: [] as string[],
    upserts: [] as { values: Record<string, unknown>; options?: { onConflict?: string } }[],
    updates: [] as Record<string, unknown>[],
    eqs: [] as [string, unknown][],
  },
};

jest.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {
    upsert: (values: Record<string, unknown>, options?: { onConflict?: string }) => {
      mockDb.calls.upserts.push({ values, options });
      return builder;
    },
    update: (values: Record<string, unknown>) => {
      mockDb.calls.updates.push(values);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      mockDb.calls.eqs.push([column, value]);
      return builder;
    },
    then: (resolve: (r: { data: null; error: unknown }) => void) =>
      resolve({ data: null, error: mockDb.writeError }),
  };
  return {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: mockDb.user }, error: mockDb.authError }),
      },
      from: (table: string) => {
        mockDb.calls.tables.push(table);
        return builder;
      },
    },
  };
});

beforeEach(() => {
  mockDb.user = { id: 'user-a' };
  mockDb.authError = null;
  mockDb.writeError = null;
  mockDb.calls = { tables: [], upserts: [], updates: [], eqs: [] };
});

describe('registerPushToStartToken', () => {
  it('upserts on the token, with the owner and the environment it was minted in', async () => {
    await registerPushToStartToken('pts-token', 'sandbox');

    expect(mockDb.calls.tables).toEqual(['live_activity_tokens']);
    expect(mockDb.calls.upserts).toEqual([
      {
        values: {
          token: 'pts-token',
          user_id: 'user-a',
          environment: 'sandbox',
          updated_at: expect.any(String),
        },
        options: { onConflict: 'token' },
      },
    ]);
  });

  it('stores production when that is what the entitlement said', async () => {
    await registerPushToStartToken('pts-token', 'production');
    expect(mockDb.calls.upserts[0].values.environment).toBe('production');
  });

  it('leaves created_at to the database and stamps updated_at itself', async () => {
    await registerPushToStartToken('pts-token', 'sandbox');
    const values = mockDb.calls.upserts[0].values;
    expect(values).not.toHaveProperty('created_at');
    expect(Date.parse(values.updated_at as string)).not.toBeNaN();
  });

  it('refuses to write an ownerless token', async () => {
    mockDb.user = null;
    await expect(registerPushToStartToken('pts-token', 'sandbox')).rejects.toThrow(
      /no signed-in user/,
    );
    expect(mockDb.calls.upserts).toHaveLength(0);
  });

  it('throws when the write fails, so the caller can log it', async () => {
    mockDb.writeError = new Error('rls denied');
    await expect(registerPushToStartToken('pts-token', 'sandbox')).rejects.toThrow('rls denied');
  });
});

describe('registerActivityUpdateToken', () => {
  it('writes the id and the token together — the only moment both are known', async () => {
    await registerActivityUpdateToken('activity-1', 'update-token');

    expect(mockDb.calls.tables).toEqual(['live_activity_instances']);
    expect(mockDb.calls.upserts).toEqual([
      {
        values: {
          activity_id: 'activity-1',
          user_id: 'user-a',
          update_token: 'update-token',
        },
        options: { onConflict: 'activity_id' },
      },
    ]);
  });

  it('does not touch media_id, so a token refresh cannot blank what the row is showing', async () => {
    await registerActivityUpdateToken('activity-1', 'update-token');
    expect(mockDb.calls.upserts[0].values).not.toHaveProperty('media_id');
  });
});

describe('recordActivityStarted', () => {
  it('upserts the instance with what it is showing', async () => {
    await recordActivityStarted('activity-1', 'media-9');

    expect(mockDb.calls.upserts[0]).toEqual({
      values: {
        activity_id: 'activity-1',
        user_id: 'user-a',
        media_id: 'media-9',
        ended_at: null,
      },
      options: { onConflict: 'activity_id' },
    });
  });

  it('accepts a null media_id — music has no media_items row', async () => {
    await recordActivityStarted('activity-1', null);
    expect(mockDb.calls.upserts[0].values.media_id).toBeNull();
  });

  it('clears ended_at, so a reused activity id counts as live again', async () => {
    await recordActivityStarted('activity-1', null);
    expect(mockDb.calls.upserts[0].values.ended_at).toBeNull();
  });

  it('does not touch update_token, so recording content cannot drop the token', async () => {
    await recordActivityStarted('activity-1', 'media-9');
    expect(mockDb.calls.upserts[0].values).not.toHaveProperty('update_token');
  });
});

describe('recordActivityEnded', () => {
  it('stamps ended_at on that one row, and never inserts', async () => {
    await recordActivityEnded('activity-1');

    expect(mockDb.calls.tables).toEqual(['live_activity_instances']);
    expect(mockDb.calls.upserts).toHaveLength(0);
    expect(mockDb.calls.updates).toHaveLength(1);
    expect(Date.parse(mockDb.calls.updates[0].ended_at as string)).not.toBeNaN();
    expect(mockDb.calls.eqs).toEqual([['activity_id', 'activity-1']]);
  });

  it('throws when the write fails', async () => {
    mockDb.writeError = new Error('offline');
    await expect(recordActivityEnded('activity-1')).rejects.toThrow('offline');
  });
});
