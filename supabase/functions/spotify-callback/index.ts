// Public (no JWT — Spotify's browser redirect can't carry one). Spotify sends the user here with
// ?code&state; we look up who `state` belongs to, exchange the code for tokens (client secret stays
// server-side), store them, and bounce the browser back into the app via the dory:// scheme.

import { serviceClient } from '../_shared/db.ts';
import { exchangeCode } from '../_shared/spotify.ts';

const APP_RETURN = 'dory://spotify-auth-callback';

/** Return an HTML page that navigates back to the app (reliable across the in-app auth browser). */
function backToApp(query: string): Response {
  const target = `${APP_RETURN}?${query}`;
  const targetJs = JSON.stringify(target);
  const targetAttr = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  // Fire the redirect as early and by as many mechanisms as possible so the in-app auth browser
  // auto-closes with no user tap: an inline <script> at the very top of the document runs first,
  // and a <meta http-equiv="refresh"> in the <head> covers the case where script is blocked.
  const html = `<!doctype html><html><head>
<script>location.replace(${targetJs})</script>
<meta http-equiv="refresh" content="0;url=${targetAttr}">
<meta name="viewport" content="width=device-width">
</head><body>
<p style="font:16px -apple-system;padding:24px">Signed in. <a href="${targetAttr}">Return to Dory</a> if this doesn't happen automatically.</p>
<script>location.replace(${targetJs})</script>
</body></html>`;
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
