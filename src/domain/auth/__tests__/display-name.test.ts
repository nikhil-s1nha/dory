import { deriveAppleDisplayName, FALLBACK_DISPLAY_NAME } from '../display-name';

/**
 * The fallback ladder exists because Apple's `fullName` is a one-shot: whatever this function
 * returns on the very first authorization is the name the partner sees forever. Each rung is a
 * case that really happens — a user who granted the name, one who withheld it, and one who also
 * chose "Hide My Email" and so has nothing readable at all.
 */
describe('deriveAppleDisplayName', () => {
  it('prefers the granted name', () => {
    expect(
      deriveAppleDisplayName({ givenName: 'Ada', familyName: 'Lovelace' }, 'ada@example.com'),
    ).toBe('Ada Lovelace');
  });

  it('accepts a partial name rather than falling through', () => {
    expect(deriveAppleDisplayName({ givenName: 'Ada', familyName: null }, null)).toBe('Ada');
    expect(deriveAppleDisplayName({ givenName: '  ', familyName: 'Lovelace' }, null)).toBe(
      'Lovelace',
    );
  });

  it('falls back to the email local part when the name scope was denied', () => {
    expect(deriveAppleDisplayName(null, 'ada.lovelace@example.com')).toBe('ada.lovelace');
  });

  it('ignores a private-relay address, whose local part is random hex', () => {
    expect(deriveAppleDisplayName(null, 'x7fj2k9q1p@privaterelay.appleid.com')).toBe(
      FALLBACK_DISPLAY_NAME,
    );
    // Apple's relay domain is case-insensitive; a capitalised one must not sneak through.
    expect(deriveAppleDisplayName(null, 'X7FJ@PrivateRelay.AppleID.com')).toBe(
      FALLBACK_DISPLAY_NAME,
    );
  });

  it('ignores a local part with no letters in it', () => {
    expect(deriveAppleDisplayName(null, '12345@example.com')).toBe(FALLBACK_DISPLAY_NAME);
    expect(deriveAppleDisplayName(null, '@example.com')).toBe(FALLBACK_DISPLAY_NAME);
  });

  it('never returns an empty string, whatever Apple withholds', () => {
    expect(deriveAppleDisplayName(null, null)).toBe(FALLBACK_DISPLAY_NAME);
    expect(deriveAppleDisplayName({ givenName: null, familyName: null }, '')).toBe(
      FALLBACK_DISPLAY_NAME,
    );
  });
});
