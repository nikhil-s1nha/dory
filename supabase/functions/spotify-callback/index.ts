// Public (no JWT — Spotify's browser redirect can't carry one). Spotify sends the user here with
// ?code&state; we look up who `state` belongs to, exchange the code for tokens (client secret stays
// server-side), store them, and bounce the browser back into the app via the bundles:// scheme.

import { serviceClient } from '../_shared/db.ts';
import { exchangeCode } from '../_shared/spotify.ts';

const APP_RETURN = 'bundles://spotify-auth-callback';

/**
 * Bounce the browser back into the app via a real HTTP 302 redirect to the bundles:// scheme.
 * iOS ASWebAuthenticationSession (used by expo-web-browser's openAuthSessionAsync) IGNORES
 * JavaScript- and <meta refresh>-initiated navigations to a custom URL scheme; it only auto-closes
 * on an actual HTTP redirect whose Location is the callback scheme (or a real link tap). So we must
 * return a 302 with Location set to the app scheme. A tiny HTML body is included as a manual fallback.
 */
function backToApp(query: string): Response {
  const target = `${APP_RETURN}?${query}`;
  const targetAttr = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body>
<p style="font:16px -apple-system;padding:24px">Signed in. <a href="${targetAttr}">Return to Bundles</a> if this doesn't happen automatically.</p>
</body></html>`;
  return new Response(html, {
    status: 302,
    headers: { Location: target, 'Content-Type': 'text/html; charset=utf-8' },
  });
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
