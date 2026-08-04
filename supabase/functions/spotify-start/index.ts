// Authenticated. Called by the app to begin the Spotify connect flow: mints a one-time `state`
// tied to the caller, then returns the Spotify authorize URL for the app to open in a browser.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { serviceClient, jsonHeaders } from '../_shared/db.ts';
import { spotifyConfig, SPOTIFY_SCOPES } from '../_shared/spotify.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

  // Resolve the caller from their JWT.
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await asUser.auth.getUser();
  if (error || !user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

  const state = crypto.randomUUID();
  const svc = serviceClient();
  const { error: insertError } = await svc.from('spotify_oauth_states').insert({ state, user_id: user.id });
  if (insertError) return new Response(JSON.stringify({ error: 'state_failed' }), { status: 500, headers: jsonHeaders });

  const { clientId, redirectUri } = spotifyConfig();
  const url = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
  })}`;

  return new Response(JSON.stringify({ url }), { headers: jsonHeaders });
});
