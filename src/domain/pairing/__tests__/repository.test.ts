import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidCodeFormat } from '../invite-code';
import { createCoupleWithInvite, redeemInvite } from '../repository';

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
