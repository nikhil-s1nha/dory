// The now-playing poller. Called on a schedule by pg_cron (protected by a shared secret). For each
// connected user it refreshes the access token if needed, reads currently-playing, and upserts
// now_playing (which the partner reads). No push here yet — that lands in the widget's Phase B.

import { serviceClient } from '../_shared/db.ts';
import { parseNowPlaying, refreshAccessToken } from '../_shared/spotify.ts';

const REFRESH_SKEW_MS = 60_000;

Deno.serve(async (req) => {
  if (req.headers.get('x-poll-secret') !== Deno.env.get('POLL_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }

  const svc = serviceClient();
  const { data: accounts, error } = await svc
    .from('spotify_accounts')
    .select('user_id, access_token, refresh_token, expires_at');
  if (error) return new Response(`db error: ${error.message}`, { status: 500 });

  let polled = 0;
  for (const acc of accounts ?? []) {
    try {
      let accessToken = acc.access_token as string;

      // Refresh if the token is expired or close to it.
      if (Date.now() + REFRESH_SKEW_MS >= new Date(acc.expires_at).getTime()) {
        const refreshed = await refreshAccessToken(acc.refresh_token);
        accessToken = refreshed.access_token;
        await svc
          .from('spotify_accounts')
          .update({
            access_token: accessToken,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', acc.user_id);
      }

      const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // 204 = nothing playing; 200 with a body = a track (or a non-track context → parse null).
      const np = res.status === 200 ? parseNowPlaying(await res.json()) : null;

      const { data: profile } = await svc
        .from('profiles')
        .select('couple_id')
        .eq('id', acc.user_id)
        .maybeSingle();
      if (!profile?.couple_id) continue; // unpaired — nothing to show a partner

      await svc.from('now_playing').upsert({
        user_id: acc.user_id,
        couple_id: profile.couple_id,
        track_id: np?.trackId ?? null,
        title: np?.title ?? null,
        artist: np?.artist ?? null,
        album_art_url: np?.albumArtUrl ?? null,
        is_playing: np?.isPlaying ?? false,
        updated_at: new Date().toISOString(),
      });
      polled++;
    } catch (e) {
      console.error('poll error for', acc.user_id, String(e));
    }
  }

  return new Response(JSON.stringify({ polled }), { headers: { 'Content-Type': 'application/json' } });
});
