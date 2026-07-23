import type { SupabaseClient } from '@supabase/supabase-js';
import { addItem, deleteItem, fetchItems, setItemChecked } from '../repository';

// Deterministic ids so the optimistic item is assertable.
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixed-uuid-123' }));

/**
 * A chainable, awaitable fake: every builder method returns the same object, which resolves to a
 * preset `{ data, error }`. Records inserts/updates/deletes for assertion. Enough for the thin
 * repository (select→eq→order, insert, update→eq, delete→eq) without modelling PostgREST.
 */
function makeClient(opts?: { data?: unknown; error?: unknown }) {
  const calls = {
    from: [] as string[],
    insert: [] as Record<string, unknown>[],
    update: [] as Record<string, unknown>[],
    deleted: false,
    lastEq: undefined as [string, unknown] | undefined,
  };
  const result = { data: opts?.data ?? null, error: opts?.error ?? null };
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    insert: (v: Record<string, unknown>) => {
      calls.insert.push(v);
      return builder;
    },
    update: (v: Record<string, unknown>) => {
      calls.update.push(v);
      return builder;
    },
    delete: () => {
      calls.deleted = true;
      return builder;
    },
    eq: (col: string, val: unknown) => {
      calls.lastEq = [col, val];
      return builder;
    },
    then: (resolve: (r: typeof result) => void) => resolve(result),
  };
  const client = {
    from: (t: string) => {
      calls.from.push(t);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('addItem', () => {
  it('inserts with the generated id and returns an optimistic, unchecked item', async () => {
    const { client, calls } = makeClient();
    const item = await addItem(client, {
      coupleId: 'c1',
      text: 'buy milk',
      createdBy: 'user-a',
      now: 1000,
    });

    expect(item).toEqual({
      id: 'fixed-uuid-123',
      text: 'buy milk',
      isChecked: false,
      createdBy: 'user-a',
      createdAt: 1000,
    });
    expect(calls.insert[0]).toEqual({
      id: 'fixed-uuid-123',
      couple_id: 'c1',
      text: 'buy milk',
      created_by: 'user-a',
    });
  });

  it('throws when the insert errors', async () => {
    const { client } = makeClient({ error: new Error('rls denied') });
    await expect(
      addItem(client, { coupleId: 'c1', text: 'x', createdBy: 'u', now: 0 }),
    ).rejects.toThrow('rls denied');
  });
});

describe('fetchItems', () => {
  it('maps rows to domain items', async () => {
    const iso = '2026-07-22T00:00:00.000Z';
    const { client } = makeClient({
      data: [{ id: 'a', text: 'hi', is_checked: true, created_by: 'u', created_at: iso }],
    });
    const items = await fetchItems(client, 'c1');
    expect(items).toEqual([
      { id: 'a', text: 'hi', isChecked: true, createdBy: 'u', createdAt: new Date(iso).getTime() },
    ]);
  });

  it('throws on error', async () => {
    const { client } = makeClient({ error: new Error('boom') });
    await expect(fetchItems(client, 'c1')).rejects.toThrow('boom');
  });
});

describe('setItemChecked / deleteItem', () => {
  it('updates the checked flag for the given id', async () => {
    const { client, calls } = makeClient();
    await setItemChecked(client, 'item-9', true);
    expect(calls.update[0]).toEqual({ is_checked: true });
    expect(calls.lastEq).toEqual(['id', 'item-9']);
  });

  it('deletes the given id', async () => {
    const { client, calls } = makeClient();
    await deleteItem(client, 'item-9');
    expect(calls.deleted).toBe(true);
    expect(calls.lastEq).toEqual(['id', 'item-9']);
  });
});
