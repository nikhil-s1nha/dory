import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureProfileDisplayName } from '../repository';

/**
 * A fake of the two statements the repository issues, recording the update so tests can assert
 * that a name the user already has is never touched.
 */
function makeFakeClient(opts?: {
  existing?: { display_name: string } | null;
  selectError?: unknown;
  throwOnSelect?: boolean;
}) {
  const updates: Record<string, unknown>[] = [];

  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (opts?.throwOnSelect) throw new Error('offline');
                  return {
                    data: opts?.existing === undefined ? { display_name: '' } : opts.existing,
                    error: opts?.selectError ?? null,
                  };
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, updates };
}

describe('ensureProfileDisplayName', () => {
  it('fills in the empty name the signup trigger left behind', async () => {
    const { client, updates } = makeFakeClient();
    await ensureProfileDisplayName(client, 'user-a', '  Ada Lovelace  ');
    expect(updates).toEqual([{ display_name: 'Ada Lovelace' }]);
  });

  it('leaves an existing name alone', async () => {
    // The case that matters: Apple only grants `fullName` once per Apple ID, so a returning user
    // arrives with no name — writing the fallback here would erase the name they actually have.
    const { client, updates } = makeFakeClient({ existing: { display_name: 'Ada' } });
    await ensureProfileDisplayName(client, 'user-a', 'Your partner');
    expect(updates).toEqual([]);
  });

  it('does not write when the read failed, since it cannot know what is there', async () => {
    const { client, updates } = makeFakeClient({ selectError: new Error('nope') });
    await ensureProfileDisplayName(client, 'user-a', 'Ada');
    expect(updates).toEqual([]);
  });

  it('swallows a thrown request rather than failing the sign-in behind it', async () => {
    const { client, updates } = makeFakeClient({ throwOnSelect: true });
    await expect(ensureProfileDisplayName(client, 'user-a', 'Ada')).resolves.toBeUndefined();
    expect(updates).toEqual([]);
  });

  it('does nothing for a blank name', async () => {
    const { client, updates } = makeFakeClient();
    await ensureProfileDisplayName(client, 'user-a', '   ');
    expect(updates).toEqual([]);
  });
});
