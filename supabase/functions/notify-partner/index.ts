// Authenticated. Called by the *sender's* app right after a photo or drawing lands in media_items:
// resolves the caller's partner and pushes them a visible APNs alert ("Alex sent you a photo"),
// carrying the item id so the app can deep-link to it and refresh the home-screen widget.
//
// Request body (POST, JSON):
//   { "type": "photo" | "drawing", "mediaItemId": "<uuid of the media_items row>" }
// The sender is taken from the JWT, never from the body, and the item must actually be theirs.
//
// Response: { "sent": <number>, "failed": <number>, "pruned": <number> }  (200)
//   `pruned` counts device rows APNs reported as dead, which this function deletes.
//
// Environment (Supabase function secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — injected by the platform
//   APNS_KEY_P8   — the full PEM contents of the .p8 auth key (gitignored .apns-key.p8)
//   APNS_KEY_ID   — the 10-char Key ID (the <KEYID> in the AuthKey_<KEYID>.p8 filename)
//   APNS_TEAM_ID  — the Apple Developer Team ID
//   APNS_FORCE_ENVIRONMENT — optional escape hatch, 'sandbox' | 'production'. When set it overrides
//     every row's push_tokens.environment, for when a build registers against a host that doesn't
//     match what the client reported.
//
// Raw APNs over HTTP/2 via fetch, not the Expo push service: this project owns its .p8 key and has
// no EAS credential setup, so there is nothing to gain from an intermediary that would need the key
// uploaded to it anyway.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { serviceClient, jsonHeaders } from '../_shared/db.ts';

/** Must match expo.ios.bundleIdentifier in app.json — APNs rejects a topic that isn't the app's. */
const APNS_TOPIC = 'com.nikhilsinha.bundles';

const APNS_HOSTS = {
  // Anything installed by Xcode / `expo run:ios` registers against SANDBOX; only TestFlight and the
  // App Store hand out production tokens. Sending to the wrong host returns 400 BadDeviceToken.
  sandbox: 'api.sandbox.push.apple.com',
  production: 'api.push.apple.com',
} as const;

// APNs rejects a provider token regenerated more often than once every 20 minutes (TooManyProviderTokenUpdates)
// and refuses one older than an hour (ExpiredProviderToken). 50 minutes sits safely inside both.
const APNS_JWT_TTL_MS = 50 * 60 * 1000;

// A "you got a photo" alert is worthless a day later; if the phone is off this long, drop it rather
// than have APNs deliver stale news when it comes back.
const APNS_EXPIRATION_SECONDS = 60 * 60;

type MediaType = 'photo' | 'drawing';
type ApnsEnvironment = keyof typeof APNS_HOSTS;

// Module scope survives between invocations on a warm isolate, which is the whole point: importing
// the key and signing a JWT per notification would both waste CPU and trip APNs' update limit.
let signingKey: CryptoKey | null = null;
let cachedJwt: { token: string; mintedAt: number } | null = null;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8Base64Url(text: string): string {
  return base64Url(new TextEncoder().encode(text));
}

/**
 * PEM → the DER pkcs8 bytes Web Crypto wants. Supabase secrets round-trip through shell/JSON, so a
 * key pasted in can arrive with literal backslash-n instead of real newlines; normalise before
 * stripping whitespace, otherwise the armour lines survive and the base64 decode fails.
 */
function pkcs8FromPem(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function apnsAuthToken(): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.mintedAt < APNS_JWT_TTL_MS) return cachedJwt.token;

  const p8 = Deno.env.get('APNS_KEY_P8');
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  if (!p8 || !keyId || !teamId) throw new Error('missing APNs env');

  signingKey ??= await crypto.subtle.importKey(
    'pkcs8',
    pkcs8FromPem(p8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const header = utf8Base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = utf8Base64Url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${claims}`;
  // Web Crypto emits the raw r||s pair, which is exactly the JWS/APNs format. DER-encoding it (what
  // most OpenSSL-based examples do) produces a token APNs rejects as InvalidProviderToken.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(signingInput),
  );

  const token = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  cachedJwt = { token, mintedAt: Date.now() };
  return token;
}

function alertBody(type: MediaType): string {
  return type === 'photo' ? 'sent you a photo' : 'drew you something';
}

/** Last 6 characters only — enough to correlate a failure with a row, useless if the logs leak. */
function tokenTail(deviceToken: string): string {
  return `…${deviceToken.slice(-6)}`;
}

/** A token APNs says will never work again, so the row should go rather than fail forever. */
function isDeadToken(status: number, reason: string): boolean {
  return status === 410 || (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic'));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

  // Resolve the caller from their JWT.
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await asUser.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

  let body: { type?: string; mediaItemId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: jsonHeaders });
  }
  const mediaItemId = body.mediaItemId;
  if (!mediaItemId || (body.type !== 'photo' && body.type !== 'drawing')) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: jsonHeaders });
  }

  const svc = serviceClient();

  // The item is the authority for who/what/which couple: the body's `type` is only a hint, and the
  // couple is never taken from the request at all. Requiring sender_id = caller stops anyone from
  // using this function to spray notifications at a stranger's partner.
  const { data: item, error: itemError } = await svc
    .from('media_items')
    .select('id, couple_id, sender_id, type')
    .eq('id', mediaItemId)
    .maybeSingle();
  if (itemError) return new Response(JSON.stringify({ error: 'db_error' }), { status: 500, headers: jsonHeaders });
  if (!item || item.sender_id !== user.id) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: jsonHeaders });
  }

  const { data: couple } = await svc
    .from('couples')
    .select('member_a, member_b')
    .eq('id', item.couple_id)
    .maybeSingle();
  const partnerId = couple?.member_a === user.id ? couple?.member_b : couple?.member_a;
  // Unpaired, or the couple still has an empty member_b slot — nothing to notify, and not an error.
  if (!partnerId || partnerId === user.id) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, pruned: 0 }), { headers: jsonHeaders });
  }

  const { data: senderProfile } = await svc
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  // display_name defaults to '' at signup (0001), so fall back rather than title an alert with nothing.
  const title = senderProfile?.display_name?.trim() || 'Your partner';

  const { data: tokens, error: tokenError } = await svc
    .from('push_tokens')
    .select('device_token, environment')
    .eq('user_id', partnerId);
  if (tokenError) return new Response(JSON.stringify({ error: 'db_error' }), { status: 500, headers: jsonHeaders });
  if (!tokens?.length) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, pruned: 0 }), { headers: jsonHeaders });
  }

  const mediaType = item.type as MediaType;
  const payload = JSON.stringify({
    aps: {
      alert: { title, body: alertBody(mediaType) },
      sound: 'default',
    },
    // Namespaced so it can't collide with anything Apple adds to the payload. expo-notifications
    // hands the whole userInfo dictionary to the app, so the client reads data.bundles.*:
    // mediaType/mediaItemId drive both the tap destination and the widget refresh.
    //
    // A drawing deep-links to the canvas, not the photo viewer — tapping it is the entry point to
    // the spec 3.2 round-trip (draw on top, send it back), and it must agree with the URL the
    // widget itself uses in widget-sync.ts. The client routes on mediaType and treats this as
    // documentation, but a wrong value here would be a trap for the next reader.
    bundles: {
      mediaType,
      mediaItemId: item.id,
      coupleId: item.couple_id,
      deepLink:
        mediaType === 'drawing'
          ? `bundles://draw?base=${item.id}`
          : `bundles://media/${item.id}`,
    },
  });

  let apnsJwt: string;
  try {
    apnsJwt = await apnsAuthToken();
  } catch (e) {
    console.error('apns auth token failed:', String(e));
    return new Response(JSON.stringify({ error: 'apns_auth_failed' }), { status: 500, headers: jsonHeaders });
  }

  const forcedEnvironment = Deno.env.get('APNS_FORCE_ENVIRONMENT') as ApnsEnvironment | undefined;
  const expiration = String(Math.floor(Date.now() / 1000) + APNS_EXPIRATION_SECONDS);

  let sent = 0;
  let failed = 0;
  let pruned = 0;

  // Sequential, not Promise.all: a couple has at most a handful of devices, and one dead token must
  // never take the others down with it.
  for (const row of tokens) {
    const deviceToken = row.device_token as string;
    const environment: ApnsEnvironment =
      forcedEnvironment ?? ((row.environment as ApnsEnvironment | null) ?? 'sandbox');

    try {
      const res = await fetch(`https://${APNS_HOSTS[environment]}/3/device/${deviceToken}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${apnsJwt}`,
          'apns-topic': APNS_TOPIC,
          'apns-push-type': 'alert',
          // 10 = deliver immediately. Correct for an alert; APNs rejects it for background pushes.
          'apns-priority': '10',
          'apns-expiration': expiration,
          'content-type': 'application/json',
        },
        body: payload,
      });

      if (res.ok) {
        sent++;
        continue;
      }

      // APNs explains itself in a JSON body: {"reason":"BadDeviceToken"}. Empty on some 5xx.
      const reason = await res.text().then(
        (text) => {
          try {
            return (JSON.parse(text)?.reason as string) ?? '';
          } catch {
            return text.slice(0, 120);
          }
        },
        () => '',
      );

      if (isDeadToken(res.status, reason)) {
        await svc.from('push_tokens').delete().eq('device_token', deviceToken);
        pruned++;
        console.error('apns dead token pruned', tokenTail(deviceToken), res.status, reason);
      } else {
        failed++;
        console.error('apns send failed', tokenTail(deviceToken), res.status, reason);
      }
    } catch (e) {
      failed++;
      console.error('apns request error', tokenTail(deviceToken), String(e));
    }
  }

  return new Response(JSON.stringify({ sent, failed, pruned }), { headers: jsonHeaders });
});
