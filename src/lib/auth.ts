/**
 * Thin wrappers over Supabase auth. They normalise the libraries' return shapes to `{ error }`
 * so screens can `if (error) show(error.message)` without touching the client directly. Session
 * state itself is tracked in auth-context, not here.
 *
 * Sign in with Apple is the primary path (email+password was too much friction to create an
 * account for); the email pair below it is the fallback for anyone without an Apple ID.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { ensureProfileDisplayName } from '@/domain/auth/repository';
import { deriveAppleDisplayName } from '@/domain/auth/display-name';
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

/**
 * `canceled` is separated from `error` because dismissing Apple's sheet is a decision, not a
 * failure — surfacing "The operation was canceled" under the button reads like the app broke.
 */
export interface AppleSignInResult {
  canceled: boolean;
  error: { message: string } | null;
}

/** expo-apple-authentication rejects with this `CodedError` code when the user dismisses the sheet. */
const CANCELED = 'ERR_REQUEST_CANCELED';

function codeOf(thrown: unknown): string | undefined {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  const code = (thrown as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function messageOf(thrown: unknown, fallback: string): string {
  return thrown instanceof Error && thrown.message ? thrown.message : fallback;
}

/**
 * Native Sign in with Apple, exchanged for a Supabase session.
 *
 * The identity token goes straight to `signInWithIdToken` — no browser round-trip, so no Services
 * ID, key or redirect URI is involved; Supabase only needs the app's bundle identifier in the
 * Apple provider's client ids to accept the token's `aud`.
 *
 * No `nonce` is sent. Apple's token then carries no nonce claim for Supabase to check, which is
 * safe here precisely because the token never leaves the device-to-Supabase hop: there is no
 * redirect an attacker could replay a token into.
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (thrown) {
    if (codeOf(thrown) === CANCELED) return { canceled: true, error: null };
    return { canceled: false, error: { message: messageOf(thrown, 'Apple sign-in failed.') } };
  }

  if (!credential.identityToken) {
    return { canceled: false, error: { message: 'Apple did not return an identity token.' } };
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) return { canceled: false, error };

  // Capture the name now or never: this credential is the only one that will ever carry it.
  // Deliberately awaited — auth-context reads the profile as soon as the session lands, and a
  // write that raced that read would show the fallback name until the next foreground.
  const userId = data.user?.id;
  if (userId) {
    await ensureProfileDisplayName(
      supabase,
      userId,
      deriveAppleDisplayName(credential.fullName, credential.email),
    );
  }

  return { canceled: false, error: null };
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
