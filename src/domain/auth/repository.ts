/**
 * The one profile write the auth flow owns: giving a brand-new Apple account a display name.
 *
 * `public.handle_new_user` creates the profiles row for every signup, but it can only copy a
 * `display_name` out of the user metadata — and an Apple identity token carries no name claim,
 * so an Apple signup lands with `display_name = ''`. This fills it in from the credential.
 *
 * The client is injected (as in domain/pairing/repository) so this unit-tests with no network.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Set the user's display name, but only if they don't already have one.
 *
 * The "only if empty" check is the whole point. Apple grants `fullName` on the first
 * authorization *per Apple ID*, not per account, so a user who deletes and recreates their
 * Bundles account gets a credential with no name — and a blind write would then blank out, or
 * worse overwrite, a name they had since chosen. Reading first also costs nothing: RLS already
 * restricts both statements to `id = auth.uid()`.
 *
 * Best-effort by design: a failure here leaves the row's empty name, which the app already
 * renders as "Your partner". Sign-in must not fail because a cosmetic write did.
 */
export async function ensureProfileDisplayName(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<void> {
  const name = displayName.trim();
  if (!name) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    // On a read failure we don't know whether a name is already there, and guessing risks
    // clobbering it. Leave the row alone.
    if (error) return;
    if (data && typeof data.display_name === 'string' && data.display_name.trim().length > 0) return;

    await supabase.from('profiles').update({ display_name: name }).eq('id', userId);
  } catch {
    // A rejected fetch (offline mid-flight) escapes as a throw rather than an `error` field.
  }
}
