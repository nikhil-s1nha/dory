/**
 * Thin wrappers over Supabase email auth. They normalise the two libraries' return shapes to
 * `{ error }` so screens can `if (error) show(error.message)` without touching the client
 * directly. Session state itself is tracked in auth-context, not here.
 */

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
  const { error } = await supabase.auth.signOut();
  return { error };
}
