// Public (no JWT — Spotify's browser redirect can't carry one). Spotify sends the user here with
// ?code&state; we look up who `state` belongs to, exchange the code for tokens (client secret stays
// server-side), store them, and bounce the browser back into the app via the dory:// scheme.

import { serviceClient } from '../_shared/db.ts';
import { exchangeCode } from '../_shared/spotify.ts';

const APP_RETURN = 'dory://spotify-auth-callback';

/** Return an HTML page that navigates back to the app (reliable across the in-app auth browser). */
function backToApp(query: string): Response {
  const target = `${APP_RETURN}?${query}`;
  const html = `<!doctype html><meta name="viewport" content="width=device-width">
<script>location.replace(${JSON.stringify(target)})</script>
<p style="font:16px -apple-system;padding:24px">You can return to Dory now. <a href="${target}">Tap here</a> if it doesn't happen automatically.</p>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const authError = url.searchParams.get('error');

  if (authError || !code || !state) return backToApp(`error=${encodeURIComponent(authError ?? 'missing_code')}`);

  const svc = serviceClient();
  const { data: stateRow } = await svc
    .from('spotify_oauth_states')
    .select('user_id')
    .eq('state', state)
    .maybeSingle();
  if (!stateRow) return backToApp('error=bad_state');

  try {
    const tokens = await exchangeCode(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const { error: upsertError } = await svc.from('spotify_accounts').upsert({
      user_id: stateRow.user_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
      expires_at: expiresAt,
      scope: tokens.scope ?? '',
      updated_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;
    await svc.from('spotify_oauth_states').delete().eq('state', state);
    return backToApp('ok=1');
  } catch (_e) {
    return backToApp('error=exchange_failed');
  }
});
