/**
 * Turning what Apple hands back at sign-in into the display name the partner sees.
 *
 * Apple returns `fullName` only on the **first** authorization for a given Apple ID. Every later
 * sign-in — including a reinstall — carries `fullName: null`, and there is no API to ask again;
 * the user would have to revoke the app under Settings > Apple Account > Sign in with Apple. So
 * the name is captured on that one pass or never, which is why this is a pure function with
 * explicit fallbacks rather than a prompt: making the user type a name is exactly the friction
 * Sign in with Apple exists to remove.
 *
 * The last-resort string is deliberately the same one `domain/spotify/repository` already
 * substitutes for an empty `display_name`, so a nameless account reads no differently to the
 * partner than it did before.
 */

/** What a nameless Apple account is called until the user renames themselves. */
export const FALLBACK_DISPLAY_NAME = 'Your partner';

/** Apple's private-relay domain — its local part is random hex, never a usable name. */
const PRIVATE_RELAY_DOMAIN = '@privaterelay.appleid.com';

/** The subset of `AppleAuthenticationFullName` that carries an actual name. */
export interface AppleNameParts {
  givenName?: string | null;
  familyName?: string | null;
}

/**
 * Best available name for an Apple credential: the granted name, else the local part of a real
 * email address, else the fallback.
 *
 * The given/family join is used rather than `AppleAuthentication.formatFullName`, which is a
 * native call and would drag the iOS module into a pure domain unit — the locale-aware ordering
 * it buys is not worth an untestable dependency for two fields.
 */
export function deriveAppleDisplayName(
  fullName: AppleNameParts | null | undefined,
  email: string | null | undefined,
): string {
  const parts = [fullName?.givenName, fullName?.familyName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0);
  if (parts.length > 0) return parts.join(' ');

  const address = email?.trim() ?? '';
  if (address && !address.toLowerCase().endsWith(PRIVATE_RELAY_DOMAIN)) {
    const localPart = address.slice(0, address.indexOf('@')).trim();
    // Guard against an address that is all punctuation or digits: "7f2a1c" is worse than the
    // fallback, and worse still is the empty string an address like "@example.com" would yield.
    if (/\p{L}/u.test(localPart)) return localPart;
  }

  return FALLBACK_DISPLAY_NAME;
}
