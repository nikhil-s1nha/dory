/**
 * Client access for Spotify. The connect flow is a server round-trip (the `spotify-start` Edge
 * Function returns the authorize URL; the browser redirect lands on `spotify-callback` which stores
 * tokens), so this file only kicks that off and reads state back. The poller writes `now_playing`;
 * here we read the *partner's* row to show what they're listening to.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NowPlaying } from './types';

/** Ask the server for the Spotify authorize URL (mints a state tied to the caller). */
export async function startSpotifyConnect(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.functions.invoke('spotify-start');
  if (error) throw error;
  return (data as { url: string }).url;
}

/** Whether the current user has connected Spotify (owns a spotify_accounts row). */
export async function isSpotifyConnected(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('spotify_accounts')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function disconnectSpotify(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from('spotify_accounts').delete().eq('user_id', userId);
  if (error) throw error;
}

export interface PartnerNowPlaying {
  name: string;
  nowPlaying: NowPlaying | null;
}

interface NowPlayingRow {
  user_id: string;
  track_id: string | null;
  title: string | null;
  artist: string | null;
  album_art_url: string | null;
  is_playing: boolean;
}

/** The partner's current track (or null if idle / not connected), plus their display name. */
export async function fetchPartnerNowPlaying(
  supabase: SupabaseClient,
  coupleId: string,
  myUserId: string,
): Promise<PartnerNowPlaying | null> {
  const { data, error } = await supabase
    .from('now_playing')
    .select('user_id, track_id, title, artist, album_art_url, is_playing')
    .eq('couple_id', coupleId)
    .neq('user_id', myUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as NowPlayingRow;
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', row.user_id)
    .maybeSingle();

  const nowPlaying: NowPlaying | null = row.track_id
    ? {
        trackId: row.track_id,
        title: row.title ?? '',
        artist: row.artist ?? '',
        albumArtUrl: row.album_art_url,
        isPlaying: row.is_playing,
      }
    : null;

  return { name: profile?.display_name || 'Your partner', nowPlaying };
}
