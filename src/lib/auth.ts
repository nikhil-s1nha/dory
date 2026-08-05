/**
 * Thin wrappers over Supabase email auth. They normalise the two libraries' return shapes to
 * `{ error }` so screens can `if (error) show(error.message)` without touching the client
 * directly. Session state itself is tracked in auth-context, not here.
 */

import { unregisterDevicePushToken } from './push';
import { supabase } from './supabase';

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  return { error };
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

export async function signOut() {
  // Drop this device's push row *before* signing out: the delete is protected by RLS on
  // `user_id = auth.uid()`, so it can only succeed while the session is still valid. Skipping it
  // would leave the next person to hold this phone receiving the previous user's notifications.
  // Best-effort — `unregisterDevicePushToken` swallows its own failures rather than block sign-out.
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (userId) await unregisterDevicePushToken(supabase, userId);

  const { error } = await supabase.auth.signOut();
  return { error };
}
