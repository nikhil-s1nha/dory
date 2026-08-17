import {
  describePairingError,
  errorCode,
  isNetworkFailure,
  isUniqueViolation,
} from '../errors';

/** The literal object supabase-js hands back when `couples.member_a` is already taken. */
const memberASlotTaken = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "couples_member_a_key"',
  details: 'Key (member_a)=(user-a) already exists.',
};

describe('errorCode', () => {
  it('reads the SQLSTATE off a database rejection', () => {
    expect(errorCode(memberASlotTaken)).toBe('23505');
  });

  it('is undefined for anything that is not a coded database error', () => {
    expect(errorCode(new Error('boom'))).toBeUndefined();
    expect(errorCode('boom')).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode({ code: 500 })).toBeUndefined();
  });
});

describe('isUniqueViolation', () => {
  it('recognises the member_a slot collision the pairing screen has to recover from', () => {
    expect(isUniqueViolation(memberASlotTaken)).toBe(true);
  });

  it('does not fire on other database errors', () => {
    expect(isUniqueViolation({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isUniqueViolation(new Error('network down'))).toBe(false);
  });
});

describe('isNetworkFailure', () => {
  it('recognises the request that never left the device', () => {
    expect(isNetworkFailure(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkFailure({ message: 'Failed to fetch' })).toBe(true);
  });

  it('does not claim a server rejection is a network problem', () => {
    expect(isNetworkFailure(memberASlotTaken)).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
  });
});

describe('describePairingError', () => {
  // The whole point: the raw constraint name must never reach the screen.
  it('never surfaces the Postgres text for a unique violation', () => {
    const message = describePairingError(memberASlotTaken, 'Could not create an invite.');
    expect(message).not.toMatch(/duplicate key|unique constraint|member_a/);
    expect(message).toMatch(/already started pairing/i);
  });

  it('explains an RLS rejection in terms of the session', () => {
    expect(describePairingError({ code: '42501', message: 'permission denied for table couples' }, 'x')).toMatch(
      /sign out and back in/i,
    );
  });

  it('names a connection problem as one', () => {
    expect(describePairingError(new TypeError('Network request failed'), 'x')).toMatch(
      /check your network/i,
    );
  });

  it('falls back to the caller copy rather than the raw message', () => {
    expect(describePairingError(new Error('PGRST116: some internal detail'), 'Could not load your invite.')).toBe(
      'Could not load your invite.',
    );
    expect(describePairingError('nonsense', 'Could not load your invite.')).toBe(
      'Could not load your invite.',
    );
  });
});
