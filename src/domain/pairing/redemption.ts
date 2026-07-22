/**
 * Pure validation for redeeming an invite. This runs client-side for instant feedback;
 * the authoritative check is the Postgres `redeem_invite` function (SECURITY DEFINER),
 * which re-runs these same rules inside a transaction so two people racing on the last
 * open slot can't both win. Keep the two in lockstep — the ordering of checks here matches
 * the SQL so the surfaced error is the same on both paths.
 */

import type { Couple, Invite, Profile, RedemptionResult } from './types';

export interface RedemptionContext {
  invite: Invite;
  /** The couple the invite points at (its current occupancy matters). */
  couple: Couple;
  /** The user attempting to redeem. */
  redeemer: Profile;
  /** Current time in epoch milliseconds (injected for deterministic tests). */
  now: number;
}

/**
 * Decide whether `redeemer` may redeem `invite`. Checks are ordered most-fundamental
 * first so the returned reason is the most meaningful one when several apply at once
 * (e.g. an expired, already-redeemed invite reports EXPIRED).
 */
export function validateRedemption({
  invite,
  couple,
  redeemer,
  now,
}: RedemptionContext): RedemptionResult {
  if (now >= invite.expiresAt) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (invite.redeemedBy !== null) {
    return { ok: false, reason: 'ALREADY_REDEEMED' };
  }
  if (invite.createdBy === redeemer.id) {
    return { ok: false, reason: 'SELF_REDEMPTION' };
  }
  if (redeemer.coupleId !== null) {
    return { ok: false, reason: 'REDEEMER_ALREADY_PAIRED' };
  }
  // The couple's second slot is already taken (a third user arriving after B redeemed,
  // or any state where B is filled without the invite being marked — defence in depth).
  if (couple.memberB !== null) {
    return { ok: false, reason: 'COUPLE_FULL' };
  }
  return { ok: true };
}
