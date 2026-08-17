/**
 * Supabase-backed pairing operations — the thin layer that turns the pure domain logic
 * (buildInvite, mapRedeemResult) into real database calls. The heavy invariants live in
 * Postgres (RLS + redeem_invite); this file only orchestrates and shapes results.
 *
 * The Supabase client is injected rather than imported so these functions unit-test against
 * a fake client with no network. Production callers pass the singleton from src/lib/supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getRandomBytes } from 'expo-crypto';
import { buildInvite, mapRedeemResult, type RedeemOutcome } from './service';
import type { Invite, Profile } from './types';

/** A CSPRNG byte source for invite codes, backed by expo-crypto on device. */
const secureRandomBytes = (n: number): Uint8Array => getRandomBytes(n);

/**
 * The result of reading a profile — three answers, not two.
 *
 * "There is no such row" and "we could not find out" look identical if both collapse to `null`,
 * and the app gates its entire navigation on `profile.coupleId`. Collapsing them meant one failed
 * request at launch presented a paired couple with the pairing screen, with no way back short of
 * relaunching. Callers must decide what an `error` means; only `ok` is evidence about pairing.
 */
export type ProfileFetch =
  | { status: 'ok'; profile: Profile | null }
  | { status: 'error'; error: unknown };

/**
 * Read the caller's own row from public.profiles. Never throws: transient failures come back as
 * `{ status: 'error' }` so the caller can retry rather than act on a wrong answer.
 */
export async function fetchProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileFetch> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, couple_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { status: 'error', error };
    if (!data) return { status: 'ok', profile: null };
    return {
      status: 'ok',
      profile: { id: data.id, displayName: data.display_name, coupleId: data.couple_id },
    };
  } catch (error) {
    // supabase-js surfaces most failures through `error`, but a rejected fetch (airplane mode
    // mid-flight) still escapes as a throw. Same answer either way: we don't know.
    return { status: 'error', error };
  }
}

/** Whether two profile reads describe the same user in the same pairing state. */
export function sameProfile(a: Profile | null, b: Profile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.displayName === b.displayName && a.coupleId === b.coupleId;
}

export interface CreateInviteResult {
  coupleId: string;
  invite: Invite;
}

export interface OutstandingInvite {
  coupleId: string;
  code: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/**
 * Find the caller's still-open invite, if any. A user can be `member_a` of at most one couple
 * (unique index), and if that couple were full they'd be paired and off this screen — so any
 * couple they own here is awaiting a partner. Returns its latest unredeemed code so the pairing
 * screen shows the existing invite instead of minting a duplicate (which the unique index rejects).
 */
export async function findOutstandingInvite(
  supabase: SupabaseClient,
  currentUserId: string,
): Promise<OutstandingInvite | null> {
  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('id')
    .eq('member_a', currentUserId)
    .maybeSingle();
  if (coupleError) throw coupleError;
  if (!couple) return null;

  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('code, expires_at')
    .eq('couple_id', couple.id)
    .is('redeemed_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inviteError) throw inviteError;
  if (!invite) return null;

  return {
    coupleId: couple.id,
    code: invite.code,
    expiresAt: new Date(invite.expires_at).getTime(),
  };
}

/**
 * Open a new couple for the current user (slot A) and mint an invite for the open slot B.
 * Two inserts: the couple, then the invite. RLS guarantees the caller can only place
 * themselves in member_a. Throws on any database error so callers surface it to the user.
 */
export async function createCoupleWithInvite(
  supabase: SupabaseClient,
  currentUserId: string,
  now: number,
): Promise<CreateInviteResult> {
  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .insert({ member_a: currentUserId })
    .select('id')
    .single();
  if (coupleError) throw coupleError;

  const invite = buildInvite({
    coupleId: couple.id,
    createdBy: currentUserId,
    now,
    randomBytes: secureRandomBytes,
  });

  const { error: inviteError } = await supabase.from('invites').insert({
    code: invite.code,
    couple_id: invite.coupleId,
    created_by: invite.createdBy,
    expires_at: new Date(invite.expiresAt).toISOString(),
  });
  if (inviteError) throw inviteError;

  return { coupleId: couple.id, invite };
}

/**
 * Redeem an invite code via the authoritative redeem_invite RPC and translate its single
 * string return into a typed outcome. Network/RPC errors throw; domain rejections (expired,
 * already-redeemed, …) come back as { ok: false, reason }.
 */
export async function redeemInvite(
  supabase: SupabaseClient,
  code: string,
): Promise<RedeemOutcome> {
  const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code });
  if (error) throw error;
  return mapRedeemResult(typeof data === 'string' ? data : String(data));
}
