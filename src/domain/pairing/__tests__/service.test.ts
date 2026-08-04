import type { RandomBytes } from '../invite-code';
import { isValidCodeFormat } from '../invite-code';
import { buildInvite, INVITE_TTL_MS, mapRedeemResult } from '../service';

const zeros: RandomBytes = (n) => new Uint8Array(n);

describe('buildInvite', () => {
  it('produces a well-formed, unredeemed invite for the given couple', () => {
    const invite = buildInvite({
      coupleId: 'couple-1',
      createdBy: 'user-a',
      now: 1000,
      randomBytes: zeros,
    });
    expect(invite.coupleId).toBe('couple-1');
    expect(invite.createdBy).toBe('user-a');
    expect(invite.redeemedBy).toBeNull();
    expect(isValidCodeFormat(invite.code)).toBe(true);
  });

  it('sets expiry to now + default TTL', () => {
    const invite = buildInvite({
      coupleId: 'c',
      createdBy: 'u',
      now: 5000,
      randomBytes: zeros,
    });
    expect(invite.expiresAt).toBe(5000 + INVITE_TTL_MS);
  });

  it('honours a custom TTL', () => {
    const invite = buildInvite({
      coupleId: 'c',
      createdBy: 'u',
      now: 0,
      randomBytes: zeros,
      ttlMs: 60_000,
    });
    expect(invite.expiresAt).toBe(60_000);
  });
});

describe('mapRedeemResult', () => {
  it('maps OK to success', () => {
    expect(mapRedeemResult('OK')).toEqual({ ok: true });
  });

  it.each([
    'EXPIRED',
    'ALREADY_REDEEMED',
    'SELF_REDEMPTION',
    'REDEEMER_ALREADY_PAIRED',
    'COUPLE_FULL',
    'CODE_NOT_FOUND',
    'NOT_AUTHENTICATED',
  ])('maps known reason %s to a typed failure', (reason) => {
    expect(mapRedeemResult(reason)).toEqual({ ok: false, reason });
  });

  it('maps an unrecognised return to UNKNOWN rather than success', () => {
    expect(mapRedeemResult('SOMETHING_NEW')).toEqual({ ok: false, reason: 'UNKNOWN' });
    expect(mapRedeemResult('')).toEqual({ ok: false, reason: 'UNKNOWN' });
  });
});
