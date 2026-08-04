/**
 * Pure helpers for Spotify "now playing": turn the currently-playing API payload into our compact
 * NowPlaying, and decide whether a change is worth pushing a widget reload for. Spotify has no push
 * — a server poller fetches on an interval — so `hasMeaningfulChange` is what keeps us from
 * reloading the widget (and burning its budget) on every progress tick.
 */

import type { NowPlaying } from './types';

/** Minimal shape of GET /v1/me/player/currently-playing that we read. */
interface CurrentlyPlayingResponse {
  is_playing?: boolean;
  item?: {
    id?: string;
    name?: string;
    artists?: { name?: string }[];
    album?: { images?: { url?: string; width?: number }[] };
  } | null;
}

/**
 * Parse the currently-playing payload. Returns null when nothing is playing — that's a 204 (no
 * body) upstream, or a body with no `item` (e.g. a private session or a non-track context). The
 * largest album image is chosen (Spotify sorts largest first, but we pick by width to be safe).
 */
export function parseCurrentlyPlaying(body: unknown): NowPlaying | null {
  if (!body || typeof body !== 'object') return null;
  const res = body as CurrentlyPlayingResponse;
  const item = res.item;
  if (!item || !item.id || !item.name) return null;

  const images = item.album?.images ?? [];
  const largest = images.reduce<{ url?: string; width?: number } | null>(
    (best, img) => (best && (best.width ?? 0) >= (img.width ?? 0) ? best : img),
    null,
  );

  return {
    trackId: item.id,
    title: item.name,
    artist: (item.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
    albumArtUrl: largest?.url ?? null,
    isPlaying: res.is_playing ?? false,
  };
}

/**
 * Whether the widget should be reloaded. True when the track changed, playback started/stopped, or
 * play/pause flipped — NOT for mere progress within the same track. This is the gate for pushing a
 * reload on a meaningful change only.
 */
export function hasMeaningfulChange(prev: NowPlaying | null, next: NowPlaying | null): boolean {
  if (!prev && !next) return false;
  if (!prev || !next) return true; // started or stopped
  return prev.trackId !== next.trackId || prev.isPlaying !== next.isPlaying;
}
