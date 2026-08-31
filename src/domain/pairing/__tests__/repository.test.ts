import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidCodeFormat } from '../invite-code';
import {
  createCoupleWithInvite,
  fetchProfile,
  findOutstandingInvite,
  isCoupleComplete,
  redeemInvite,
  sameProfile,
} from '../repository';

/**
 * A hand-rolled fake of the slice of the Supabase client the repository touches. It records
 * inserts and RPC calls so tests can assert the shapes, and lets each step be forced to error.
 * The `insert` result is both awaitable (for the bare invites insert) and chainable through
 * `.select().single()` (for the couple insert) — matching supabase-js's fluent builder.
 */
function makeFakeClient(opts?: {
  coupleInsert?: { data?: { id: string }; error?: unknown };
  inviteInsertError?: unknown;
  rpcReturn?: unknown;
  rpcError?: unknown;
}) {
  const calls = {
    inserts: [] as { table: string; values: Record<string, unknown> }[],
    rpc: [] as { fn: string; args: Record<string, unknown> }[],
  };

  const client = {
    from(table: string) {
      return {
        insert(values: Record<string, unknown>) {
          calls.inserts.push({ table, values });
          const result =
            table === 'couples'
              ? { data: opts?.coupleInsert?.data ?? { id: 'couple-generated' }, error: opts?.coupleInsert?.error ?? null }
              : { data: null, error: opts?.inviteInsertError ?? null };
          return {
            select() {
              return { single: async () => result };
            },
            then(resolve: (r: typeof result) => void) {
              resolve(result);
            },
          };
        },
      };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.rpc.push({ fn, args });
      return { data: opts?.rpcReturn ?? 'OK', error: opts?.rpcError ?? null };
    },
  };

  return { client: client as unknown as SupabaseClient, calls };
}

describe('createCoupleWithInvite', () => {
  it('inserts the couple then a well-formed invite and returns both', async () => {
    const { client, calls } = makeFakeClient({ coupleInsert: { data: { id: 'couple-1' } } });
    const result = await createCoupleWithInvite(client, 'user-a', 1000);

    expect(result.coupleId).toBe('couple-1');
    expect(result.invite.createdBy).toBe('user-a');
    expect(result.invite.coupleId).toBe('couple-1');
    expect(isValidCodeFormat(result.invite.code)).toBe(true);

    // Couple inserted with the caller in member_a; invite carries the couple id + a future expiry.
    expect(calls.inserts[0]).toEqual({ table: 'couples', values: { member_a: 'user-a' } });
    expect(calls.inserts[1].table).toBe('invites');
    expect(calls.inserts[1].values.couple_id).toBe('couple-1');
    expect(typeof calls.inserts[1].values.expires_at).toBe('string');
  });

  it('propagates a couple-insert error and never inserts an invite', async () => {
    const { client, calls } = makeFakeClient({ coupleInsert: { error: new Error('rls denied') } });
    await expect(createCoupleWithInvite(client, 'user-a', 0)).rejects.toThrow('rls denied');
    expect(calls.inserts.some((c) => c.table === 'invites')).toBe(false);
  });

  it('propagates an invite-insert error', async () => {
    const { client } = makeFakeClient({ inviteInsertError: new Error('duplicate code') });
    await expect(createCoupleWithInvite(client, 'user-a', 0)).rejects.toThrow('duplicate code');
  });
});

/**
 * Fake for the read paths: a chainable query builder whose filter/order/limit methods are no-ops
 * and whose `maybeSingle()` resolves to a per-table preset. Enough to exercise findOutstandingInvite
 * without modelling PostgREST semantics.
 */
function makeSelectClient(presets: {
  couple?: { data?: { id: string } | null; error?: unknown };
  invite?: { data?: { code: string; expires_at: string } | null; error?: unknown };
}) {
  const builder = (result: { data: unknown; error: unknown }) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) b[m] = () => b;
    b.maybeSingle = async () => result;
    return b;
  };
  const client = {
    from(table: string) {
      if (table === 'couples') return builder({ data: presets.couple?.data ?? null, error: presets.couple?.error ?? null });
      return builder({ data: presets.invite?.data ?? null, error: presets.invite?.error ?? null });
    },
  };
  return client as unknown as SupabaseClient;
}

describe('findOutstandingInvite', () => {
  it('returns null when the user owns no couple', async () => {
    const client = makeSelectClient({ couple: { data: null } });
    expect(await findOutstandingInvite(client, 'user-a')).toBeNull();
  });

  it('returns null when the couple exists but has no open invite', async () => {
    const client = makeSelectClient({ couple: { data: { id: 'c1' } }, invite: { data: null } });
    expect(await findOutstandingInvite(client, 'user-a')).toBeNull();
  });

  it('returns the outstanding code with a parsed expiry', async () => {
    const iso = '2026-07-22T00:00:00.000Z';
    const client = makeSelectClient({
      couple: { data: { id: 'c1' } },
      invite: { data: { code: 'ABCDEFGH', expires_at: iso } },
    });
    expect(await findOutstandingInvite(client, 'user-a')).toEqual({
      coupleId: 'c1',
      code: 'ABCDEFGH',
      expiresAt: new Date(iso).getTime(),
    });
  });

  it('propagates a lookup error', async () => {
    const client = makeSelectClient({ couple: { error: new Error('rls denied') } });
    await expect(findOutstandingInvite(client, 'user-a')).rejects.toThrow('rls denied');
  });
});

/**
 * Fake for the couples read behind isCoupleComplete: a chainable builder whose maybeSingle()
 * resolves to one preset row.
 */
function makeCoupleClient(preset: {
  data?: { member_b: string | null } | null;
  error?: unknown;
}) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) b[m] = () => b;
  b.maybeSingle = async () => ({ data: preset.data ?? null, error: preset.error ?? null });
  return { from: () => b } as unknown as SupabaseClient;
}

/**
 * The signal the *inviting* partner polls for. Partner B's redemption happens entirely on the
 * server, so this read is the only way A's device learns that the couple filled up.
 */
describe('isCoupleComplete', () => {
  it('is false while the second slot is still open', async () => {
    expect(await isCoupleComplete(makeCoupleClient({ data: { member_b: null } }), 'c1')).toBe(false);
  });

  it('is true once the partner has taken the second slot', async () => {
    expect(await isCoupleComplete(makeCoupleClient({ data: { member_b: 'user-b' } }), 'c1')).toBe(
      true,
    );
  });

  it('is false when the row is not visible at all', async () => {
    expect(await isCoupleComplete(makeCoupleClient({ data: null }), 'c1')).toBe(false);
  });

  // A dropped request must not read as "your partner hasn't arrived" — a poll that swallowed
  // errors would sit on the pairing screen forever and look exactly like the bug it fixes.
  it('throws on a read failure rather than reporting an open slot', async () => {
    const client = makeCoupleClient({ error: new Error('network down') });
    await expect(isCoupleComplete(client, 'c1')).rejects.toThrow('network down');
  });
});

/**
 * Fake for the profiles read. `throws` models the case supabase-js does *not* fold into `error`:
 * a rejected fetch, which is exactly what a network blip at launch looks like.
 */
function makeProfileClient(preset: {
  data?: { id: string; display_name: string; couple_id: string | null } | null;
  error?: unknown;
  throws?: unknown;
}) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) b[m] = () => b;
  b.maybeSingle = async () => {
    if (preset.throws) throw preset.throws;
    return { data: preset.data ?? null, error: preset.error ?? null };
  };
  return { from: () => b } as unknown as SupabaseClient;
}

describe('fetchProfile', () => {
  it('returns the mapped profile when the row exists', async () => {
    const client = makeProfileClient({
      data: { id: 'user-a', display_name: 'Ada', couple_id: 'couple-1' },
    });
    expect(await fetchProfile(client, 'user-a')).toEqual({
      status: 'ok',
      profile: { id: 'user-a', displayName: 'Ada', coupleId: 'couple-1' },
    });
  });

  it('reports an absent row as ok-with-no-profile, not as an error', async () => {
    const client = makeProfileClient({ data: null });
    expect(await fetchProfile(client, 'user-a')).toEqual({ status: 'ok', profile: null });
  });

  // The whole point of the three-way result: a paired user whose read failed must not be
  // indistinguishable from a user who has no profile row, because the root layout routes on it.
  it('reports a query error as an error, never as an absent profile', async () => {
    const boom = new Error('network down');
    const result = await fetchProfile(makeProfileClient({ error: boom }), 'user-a');
    expect(result).toEqual({ status: 'error', error: boom });
  });

  it('reports a thrown/rejected request as an error rather than propagating it', async () => {
    const boom = new Error('Network request failed');
    const result = await fetchProfile(makeProfileClient({ throws: boom }), 'user-a');
    expect(result).toEqual({ status: 'error', error: boom });
  });
});

describe('sameProfile', () => {
  const base = { id: 'user-a', displayName: 'Ada', coupleId: 'couple-1' };

  it('is true for equal values and for two absent profiles', () => {
    expect(sameProfile(base, { ...base })).toBe(true);
    expect(sameProfile(null, null)).toBe(true);
  });

  it('is false when the pairing state changes — the field the whole app gates on', () => {
    expect(sameProfile(base, { ...base, coupleId: null })).toBe(false);
    expect(sameProfile(base, null)).toBe(false);
    expect(sameProfile(null, base)).toBe(false);
  });
});

describe('redeemInvite', () => {
  it('maps an OK RPC return to success and passes the code through', async () => {
    const { client, calls } = makeFakeClient({ rpcReturn: 'OK' });
    expect(await redeemInvite(client, 'ABCDEFGH')).toEqual({ ok: true });
    expect(calls.rpc[0]).toEqual({ fn: 'redeem_invite', args: { invite_code: 'ABCDEFGH' } });
  });

  it('maps a domain rejection to a typed failure', async () => {
    const { client } = makeFakeClient({ rpcReturn: 'ALREADY_REDEEMED' });
    expect(await redeemInvite(client, 'ABCDEFGH')).toEqual({ ok: false, reason: 'ALREADY_REDEEMED' });
  });

  it('throws on an RPC transport error', async () => {
    const { client } = makeFakeClient({ rpcError: new Error('network down') });
    await expect(redeemInvite(client, 'ABCDEFGH')).rejects.toThrow('network down');
  });
});
