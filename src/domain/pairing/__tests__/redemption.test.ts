import { validateRedemption, type RedemptionContext } from '../redemption';
import type { Couple, Invite, Profile } from '../types';

const NOW = 1_000_000;

function makeContext(overrides: {
  invite?: Partial<Invite>;
  couple?: Partial<Couple>;
  redeemer?: Partial<Profile>;
  now?: number;
}): RedemptionContext {
  const invite: Invite = {
    code: 'ABCDEFGH',
    coupleId: 'couple-1',
    createdBy: 'user-a',
    expiresAt: NOW + 60_000,
    redeemedBy: null,
    ...overrides.invite,
  };
  const couple: Couple = {
    id: 'couple-1',
    memberA: 'user-a',
    memberB: null,
    ...overrides.couple,
  };
  const redeemer: Profile = {
    id: 'user-b',
    displayName: 'B',
    coupleId: null,
    ...overrides.redeemer,
  };
  return { invite, couple, redeemer, now: overrides.now ?? NOW };
}

describe('validateRedemption', () => {
  it('accepts an unpaired second user redeeming a fresh invite', () => {
    expect(validateRedemption(makeContext({})).ok).toBe(true);
  });

  it('rejects an expired invite', () => {
    const result = validateRedemption(
      makeContext({ invite: { expiresAt: NOW - 1 } }),
    );
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('treats the exact expiry instant as expired (half-open window)', () => {
    const result = validateRedemption(
      makeContext({ invite: { expiresAt: NOW } }),
    );
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('rejects an already-redeemed invite', () => {
    const result = validateRedemption(
      makeContext({ invite: { redeemedBy: 'someone-else' } }),
    );
    expect(result).toEqual({ ok: false, reason: 'ALREADY_REDEEMED' });
  });

  it('rejects the inviter redeeming their own code', () => {
    const result = validateRedemption(
      makeContext({ redeemer: { id: 'user-a' } }),
    );
    expect(result).toEqual({ ok: false, reason: 'SELF_REDEMPTION' });
  });

  it('rejects a redeemer who is already paired', () => {
    const result = validateRedemption(
      makeContext({ redeemer: { coupleId: 'couple-99' } }),
    );
    expect(result).toEqual({ ok: false, reason: 'REDEEMER_ALREADY_PAIRED' });
  });

  it('rejects when the couple already has a second member (third-user guard)', () => {
    // Anomalous state: slot B filled but invite not marked. Defence in depth.
    const result = validateRedemption(
      makeContext({ couple: { memberB: 'user-c' } }),
    );
    expect(result).toEqual({ ok: false, reason: 'COUPLE_FULL' });
  });

  describe('check ordering when multiple failures apply', () => {
    it('reports EXPIRED before ALREADY_REDEEMED', () => {
      const result = validateRedemption(
        makeContext({ invite: { expiresAt: NOW - 1, redeemedBy: 'x' } }),
      );
      expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
    });

    it('reports ALREADY_REDEEMED before SELF_REDEMPTION', () => {
      const result = validateRedemption(
        makeContext({ invite: { redeemedBy: 'x' }, redeemer: { id: 'user-a' } }),
      );
      expect(result).toEqual({ ok: false, reason: 'ALREADY_REDEEMED' });
    });

    it('reports SELF_REDEMPTION before REDEEMER_ALREADY_PAIRED', () => {
      const result = validateRedemption(
        makeContext({ redeemer: { id: 'user-a', coupleId: 'couple-1' } }),
      );
      expect(result).toEqual({ ok: false, reason: 'SELF_REDEMPTION' });
    });
  });
});
