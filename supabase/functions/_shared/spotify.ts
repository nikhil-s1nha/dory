// Shared Spotify OAuth + API helpers for the Edge Functions (Deno runtime). The client secret is
// read from the function environment (a Supabase secret) and never leaves the server.

export const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';

export function spotifyConfig() {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!clientId || !clientSecret || !supabaseUrl) throw new Error('missing Spotify/Supabase env');
  // Must exactly match the redirect URI registered in the Spotify app.
  const redirectUri = `${supabaseUrl}/functions/v1/spotify-callback`;
  return { clientId, clientSecret, redirectUri };
}

function basicAuth(clientId: string, clientSecret: string) {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function tokenRequest(params: Record<string, string>) {
  const { clientId, clientSecret } = spotifyConfig();
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`spotify token ${res.status}: ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}

/** Exchange an authorization code for tokens (the connect flow). */
export function exchangeCode(code: string) {
  const { redirectUri } = spotifyConfig();
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

/** Refresh an access token (the poller, when the current one is near expiry). */
export function refreshAccessToken(refreshToken: string) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

/** Minimal parse of GET /v1/me/player/currently-playing → the fields we store. Null when idle. */
export function parseNowPlaying(body: unknown): {
  trackId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  isPlaying: boolean;
} | null {
  if (!body || typeof body !== 'object') return null;
  // deno-lint-ignore no-explicit-any
  const b = body as any;
  const item = b.item;
  if (!item?.id || !item?.name) return null;
  const images = (item.album?.images ?? []) as { url?: string; width?: number }[];
  const largest = images.reduce<{ url?: string; width?: number } | null>(
    (best, img) => (best && (best.width ?? 0) >= (img.width ?? 0) ? best : img),
    null,
  );
  return {
    trackId: item.id,
    title: item.name,
    artist: (item.artists ?? []).map((a: { name?: string }) => a.name).filter(Boolean).join(', '),
    albumArtUrl: largest?.url ?? null,
    isPlaying: b.is_playing ?? false,
  };
}
