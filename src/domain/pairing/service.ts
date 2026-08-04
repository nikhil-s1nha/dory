/**
 * Client-side pairing orchestration that stays pure (no network, no Supabase import) so it
 * unit-tests without a backend. The two halves:
 *
 *  - buildInvite: assemble a fresh Invite (code + expiry) for a newly opened couple.
 *  - mapRedeemResult: translate the redeem_invite RPC's string return into a typed result.
 *
 * The redeem RPC (supabase/migrations/0001_pairing.sql) is authoritative; this module never
 * re-decides redemption, it only shapes inputs and interprets outputs.
 */

import { generateInviteCode, type RandomBytes } from './invite-code';
import type { Invite, RedemptionError } from './types';

/** Invites are short-lived by design — a pairing handshake happens in one sitting. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface BuildInviteParams {
  coupleId: string;
  createdBy: string;
  /** Current time, epoch ms (injected for deterministic tests). */
  now: number;
  randomBytes: RandomBytes;
  /** Override the default TTL if ever needed; defaults to INVITE_TTL_MS. */
  ttlMs?: number;
}

/** Build the Invite record for a freshly created couple whose slot B is still open. */
export function buildInvite(params: BuildInviteParams): Invite {
  const ttl = params.ttlMs ?? INVITE_TTL_MS;
  return {
    code: generateInviteCode(params.randomBytes),
    coupleId: params.coupleId,
    createdBy: params.createdBy,
    expiresAt: params.now + ttl,
    redeemedBy: null,
  };
}

/** Outcomes the redeem RPC can report beyond the shared domain rejections. */
export type RedeemOutcome =
  | { ok: true }
  | { ok: false; reason: RedemptionError | 'CODE_NOT_FOUND' | 'NOT_AUTHENTICATED' | 'UNKNOWN' };

type FailureReason = Exclude<RedeemOutcome, { ok: true }>['reason'];

const KNOWN_REASONS: ReadonlySet<FailureReason> = new Set<FailureReason>([
  'EXPIRED',
  'ALREADY_REDEEMED',
  'SELF_REDEMPTION',
  'REDEEMER_ALREADY_PAIRED',
  'COUPLE_FULL',
  'CODE_NOT_FOUND',
  'NOT_AUTHENTICATED',
]);

/**
 * Interpret the RPC's single-string return. 'OK' → success; any known reason → typed
 * failure; anything unexpected → UNKNOWN rather than silently treating it as success.
 */
export function mapRedeemResult(rpcReturn: string): RedeemOutcome {
  if (rpcReturn === 'OK') return { ok: true };
  if ((KNOWN_REASONS as ReadonlySet<string>).has(rpcReturn)) {
    return { ok: false, reason: rpcReturn as FailureReason };
  }
  return { ok: false, reason: 'UNKNOWN' };
}
