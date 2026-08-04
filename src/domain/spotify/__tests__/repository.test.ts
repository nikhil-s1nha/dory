import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPartnerNowPlaying, isSpotifyConnected } from '../repository';

/** Chainable fake whose terminal `maybeSingle()` returns a per-table preset. */
function makeClient(presets: {
  now_playing?: unknown;
  profiles?: unknown;
  spotify_accounts?: unknown;
}) {
  const builder = (result: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq']) b[m] = () => b;
    b.maybeSingle = async () => ({ data: result ?? null, error: null });
    return b;
  };
  return {
    from: (t: string) => builder((presets as Record<string, unknown>)[t]),
  } as unknown as SupabaseClient;
}

describe('isSpotifyConnected', () => {
  it('is true when the user has an account row', async () => {
    expect(await isSpotifyConnected(makeClient({ spotify_accounts: { user_id: 'u' } }), 'u')).toBe(true);
  });
  it('is false when there is no row', async () => {
    expect(await isSpotifyConnected(makeClient({}), 'u')).toBe(false);
  });
});

describe('fetchPartnerNowPlaying', () => {
  it('maps a playing partner row + name into name/nowPlaying', async () => {
    const client = makeClient({
      now_playing: {
        user_id: 'partner',
        track_id: 't1',
        title: 'Song',
        artist: 'Artist',
        album_art_url: 'http://art',
        is_playing: true,
      },
      profiles: { display_name: 'Sam' },
    });
    const result = await fetchPartnerNowPlaying(client, 'couple-1', 'me');
    expect(result).toEqual({
      name: 'Sam',
      nowPlaying: { trackId: 't1', title: 'Song', artist: 'Artist', albumArtUrl: 'http://art', isPlaying: true },
    });
  });

  it('returns a null nowPlaying when the partner has a row but no track', async () => {
    const client = makeClient({
      now_playing: { user_id: 'partner', track_id: null, title: null, artist: null, album_art_url: null, is_playing: false },
      profiles: { display_name: 'Sam' },
    });
    const result = await fetchPartnerNowPlaying(client, 'couple-1', 'me');
    expect(result).toEqual({ name: 'Sam', nowPlaying: null });
  });

  it('returns null when there is no partner now_playing row', async () => {
    expect(await fetchPartnerNowPlaying(makeClient({}), 'couple-1', 'me')).toBeNull();
  });

  it('falls back to a default name when the partner profile is missing', async () => {
    const client = makeClient({
      now_playing: { user_id: 'partner', track_id: 't', title: 'S', artist: 'A', album_art_url: null, is_playing: true },
    });
    const result = await fetchPartnerNowPlaying(client, 'couple-1', 'me');
    expect(result?.name).toBe('Your partner');
  });
});
