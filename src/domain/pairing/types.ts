/**
 * Partner-pairing domain model.
 *
 * A `Couple` links exactly two users. One partner creates an `Invite` (which opens
 * a couple with themselves in slot A and slot B empty); the other redeems the code
 * to fill slot B. These types are storage-agnostic on purpose — the same invariants
 * are enforced twice: here in pure TypeScript for instant UX feedback, and again in
 * Postgres (RLS + a SECURITY DEFINER redeem function) as the actual source of truth.
 * See supabase/migrations for the server-side mirror.
 */

/** A user's identity. `coupleId` is null until they are paired. */
export interface Profile {
  id: string;
  displayName: string;
  coupleId: string | null;
}

/** A pairing of exactly two users. `memberB` is null while the invite is outstanding. */
export interface Couple {
  id: string;
  memberA: string;
  memberB: string | null;
}

/** A shareable, single-use, expiring code that fills the open slot of a couple. */
export interface Invite {
  code: string;
  coupleId: string;
  /** The user who created the invite (occupies the couple's slot A). */
  createdBy: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  /** Set once redeemed; null while outstanding. */
  redeemedBy: string | null;
}

/** Why a redemption attempt was rejected. Mirrors the server-side redeem function. */
export type RedemptionError =
  | 'EXPIRED'
  | 'ALREADY_REDEEMED'
  | 'SELF_REDEMPTION'
  | 'REDEEMER_ALREADY_PAIRED'
  | 'COUPLE_FULL';

export type RedemptionResult =
  | { ok: true }
  | { ok: false; reason: RedemptionError };
