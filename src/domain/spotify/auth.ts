/**
 * Spotify OAuth constants and token-lifetime helpers. The token exchange/refresh themselves run
 * server-side (a Supabase Edge Function holds the client secret and writes tokens) — this module is
 * only the pure, testable pieces the client and function share.
 */

/**
 * Scopes needed to read the partner's playback. Kept minimal on purpose — Spotify's Feb 2026 dev
 * mode removed many endpoints, but the player read scopes remain.
 */
export const SPOTIFY_SCOPES = ['user-read-currently-playing', 'user-read-playback-state'] as const;

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

/**
 * True if the access token is expired or close enough that we should refresh before using it.
 * The skew avoids a request that starts valid but 401s mid-flight.
 */
export function isAccessTokenExpired(
  expiresAt: number,
  now: number,
  skewMs = 60_000,
): boolean {
  return now + skewMs >= expiresAt;
}

/** Compute an absolute expiry (epoch ms) from Spotify's `expires_in` (seconds) at token issue. */
export function expiryFromExpiresIn(expiresInSeconds: number, now: number): number {
  return now + expiresInSeconds * 1000;
}
