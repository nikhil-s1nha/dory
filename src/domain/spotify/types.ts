/** What one partner is (or was recently) playing, distilled from Spotify's API for the widget. */
export interface NowPlaying {
  trackId: string;
  title: string;
  /** Comma-joined artist names. */
  artist: string;
  /** Album art URL (largest Spotify provides); null if none. */
  albumArtUrl: string | null;
  isPlaying: boolean;
}

/** Spotify OAuth tokens for one user. Stored server-side (see supabase/migrations). */
export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  scope: string;
}
