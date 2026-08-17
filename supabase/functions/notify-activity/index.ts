// Authenticated. The ActivityKit half of a send: puts the partner's photo/drawing on the *lock
// screen* of a phone where nothing of ours is running, via iOS 17.2+ push-to-start. Sibling of
// `notify-partner`, which sends the visible alert; that one is deployed and proven and is not
// touched here beyond a guarded fire-and-forget call into this function.
//
// Request body (POST, JSON) — one of:
//   { "mediaItemId": "<uuid>" }                     start or update, chosen automatically
//   { "mediaItemId": "<uuid>", "event": "start" }   force a push-to-start
//   { "mediaItemId": "<uuid>", "event": "update" }  force an update of live activities
//   { "event": "end" }                              end every live activity of the partner's
//
// As in `notify-partner`, the *only* caller-supplied identity is a media id. The sender is the JWT,
// the item must actually be the sender's, and the couple and recipient are re-derived from the row —
// so this cannot be used to push an activity onto a stranger's partner's lock screen. The `end`
// form takes no id at all and resolves the couple from the caller's membership.
//
// Response: { "event": "start"|"update"|"end"|"none", "sent": n, "failed": n, "pruned": n }  (200)
//   `event: "none"` means there was nobody addressable — no partner, or no registered token. That is
//   a normal outcome, not an error, and must stay a 200 because the caller is fire-and-forget.
//
// Environment (Supabase function secrets) — identical to notify-partner:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — injected by the platform
//   APNS_KEY_P8 / APNS_KEY_ID       — the SANDBOX .p8 PEM and its 10-char Key ID
//   APNS_KEY_P8_PRODUCTION / APNS_KEY_ID_PRODUCTION — the PRODUCTION pair. Neither key works on the
//     other environment; see the signing-slot comment below for the measured proof.
//   APNS_TEAM_ID  — shared by both keys
//   APNS_FORCE_ENVIRONMENT — optional 'sandbox' | 'production' override of every row's environment,
//     which now switches the signing key as well as the gateway
//
// The ES256 signer below is a deliberate copy of notify-partner's, not an import of a shared module.
// That code is battle-tested against real APNs and its one subtle property — Web Crypto's raw r‖s
// signature is the JWS format, and DER-encoding it (what every OpenSSL example does) yields a token
// APNs rejects as InvalidProviderToken — is exactly the kind of thing a refactor quietly breaks.
// Duplication here is cheaper than putting the working alert path at risk.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { serviceClient, jsonHeaders } from '../_shared/db.ts';

// A Live Activity push is addressed to a DIFFERENT topic from a normal alert: the app's bundle id
// with the `.push-type.liveactivity` suffix. Sending the activity payload to the plain bundle id
// fails, and so does sending an alert to this one.
const APNS_TOPIC = 'com.nikhilsinha.bundles.push-type.liveactivity';

// APNs matches `attributes-type` against the *Swift struct name* of the ActivityAttributes, and
// expo-widgets declares exactly one for the whole app (node_modules/expo-widgets/ios/Widgets/
// WidgetLiveActivity.swift):
//
//   struct LiveActivityAttributes: ActivityAttributes {
//     public struct ContentState: Codable, Hashable { var name: String; var props: String }
//   }
//
// So this is a fixed string that never varies per activity, and the ContentState has just two
// String fields. Sending 'BundlesActivity' here — the obvious guess, and what the first draft of the
// contract said — produces a push ActivityKit cannot decode and silently drops.
const ATTRIBUTES_TYPE = 'LiveActivityAttributes';

// `name` is expo-widgets' routing key: `getLiveActivityNodes(forName:props:)` uses it to pick which
// registered layout renders. It must equal the name the app passed to `createLiveActivity`.
const ACTIVITY_NAME = 'BundlesActivity';

const APNS_HOSTS = {
  // Anything installed by Xcode / `expo run:ios` registers against SANDBOX; only TestFlight and the
  // App Store hand out production tokens. Sending to the wrong host returns 400 BadDeviceToken.
  sandbox: 'api.sandbox.push.apple.com',
  production: 'api.push.apple.com',
} as const;

// APNs rejects a provider token regenerated more often than once every 20 minutes
// (TooManyProviderTokenUpdates) and refuses one older than an hour (ExpiredProviderToken).
const APNS_JWT_TTL_MS = 50 * 60 * 1000;

// A lock-screen activity about a photo is worthless a day later. Same reasoning as the alert path.
const APNS_EXPIRATION_SECONDS = 60 * 60;

type MediaType = 'photo' | 'drawing';
type ApnsEnvironment = keyof typeof APNS_HOSTS;
type ActivityEvent = 'start' | 'update' | 'end';

/**
 * Mirrors `BundlesActivityContentState` in src/domain/activity/types.ts. It does NOT travel as a
 * nested object: expo-widgets' ContentState carries it JSON-*stringified* in `props`. The 4 KB
 * ActivityKit ceiling therefore applies to the escaped string, which is bigger than the object —
 * one more reason `imageFile` is a filename and never bytes.
 */
type BundlesActivityContentState = {
  kind: 'photo' | 'drawing' | 'music';
  title: string;
  subtitle: string;
  imageFile: string | null;
  deepLink: string;
  sentAt: number;
};

type MediaRow = { id: string; couple_id: string; sender_id: string; type: string; created_at: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ONE SIGNING SLOT PER ENVIRONMENT — not one global slot.
 *
 * The project holds two APNs auth keys and **neither is universal**. Proven against real APNs, both
 * directions, on 2026-08-16/17:
 *
 *   APNS_KEY_P8 (original)             production -> 403 BadEnvironmentKeyInToken, sandbox -> works
 *   APNS_KEY_P8_PRODUCTION (8323H4JG5F) sandbox   -> 403 BadEnvironmentKeyInToken, production -> works
 *
 * So the key is as environment-specific as the host is, and the two must move together. Module
 * scope survives between invocations on a warm isolate, which is the whole point of caching:
 * importing the key and signing a JWT per notification would both waste CPU and trip APNs' update
 * limit. But a *single* cache slot across two keys is a trap — after the first mint, every request
 * regardless of environment would be handed whichever key's JWT got there first, and the symptom
 * would not appear until the 50-minute window turned over. Keyed by environment, that cannot happen.
 */
type SigningSlot = { key: CryptoKey | null; jwt: { token: string; mintedAt: number } | null };
const signingSlots: Record<ApnsEnvironment, SigningSlot> = {
  sandbox: { key: null, jwt: null },
  production: { key: null, jwt: null },
};

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

/** The .p8 + Key ID for one environment. Team ID is shared — both keys are on the same team. */
function apnsCredentials(environment: ApnsEnvironment): { p8: string; keyId: string; teamId: string } {
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const p8 = environment === 'production'
    ? Deno.env.get('APNS_KEY_P8_PRODUCTION')
    : Deno.env.get('APNS_KEY_P8');
  const keyId = environment === 'production'
    ? Deno.env.get('APNS_KEY_ID_PRODUCTION')
    : Deno.env.get('APNS_KEY_ID');
  if (!p8 || !keyId || !teamId) throw new Error(`missing APNs env for ${environment}`);
  return { p8, keyId, teamId };
}

async function apnsAuthToken(environment: ApnsEnvironment): Promise<string> {
  const slot = signingSlots[environment];
  if (slot.jwt && Date.now() - slot.jwt.mintedAt < APNS_JWT_TTL_MS) return slot.jwt.token;

  const { p8, keyId, teamId } = apnsCredentials(environment);

  slot.key ??= await crypto.subtle.importKey(
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
    slot.key,
    new TextEncoder().encode(signingInput),
  );

  const token = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  slot.jwt = { token, mintedAt: Date.now() };
  return token;
}

function alertBody(type: MediaType): string {
  return type === 'photo' ? 'sent you a photo' : 'drew you something';
}

/** Same URL the widget and the alert path use, so a tap lands in the same place from any surface. */
function deepLinkFor(type: MediaType, mediaItemId: string): string {
  return type === 'drawing' ? `bundles://draw?base=${mediaItemId}` : `bundles://media/${mediaItemId}`;
}

/** Last 6 characters only — enough to correlate a failure with a row, useless if the logs leak. */
function tokenTail(token: string): string {
  return `…${token.slice(-6)}`;
}

/** A token APNs says will never work again, so the row should go rather than fail forever. */
function isDeadToken(status: number, reason: string): boolean {
  return status === 410 || (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic'));
}

/** APNs explains itself in a JSON body: {"reason":"BadDeviceToken"}. Empty on some 5xx. */
async function apnsReason(res: Response): Promise<string> {
  return await res.text().then(
    (text) => {
      try {
        return (JSON.parse(text)?.reason as string) ?? '';
      } catch {
        return text.slice(0, 120);
      }
    },
    () => '',
  );
}

type ApnsResult = { ok: boolean; status: number; reason: string; environment: ApnsEnvironment };

/**
 * The one place a host and a signing key are chosen, and they are chosen from the SAME argument.
 * That is the whole defence against the mismatch: there is no way to call this with a production
 * key against the sandbox host, because neither is passed in — both are derived from `environment`.
 * Mixing them is precisely the 403 BadEnvironmentKeyInToken this change exists to prevent.
 */
async function postToApns(
  environment: ApnsEnvironment,
  deviceToken: string,
  payload: string,
  expiration: string,
): Promise<ApnsResult> {
  const apnsJwt = await apnsAuthToken(environment);
  const res = await fetch(`https://${APNS_HOSTS[environment]}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${apnsJwt}`,
      'apns-topic': APNS_TOPIC,
      // Not 'alert'. A liveactivity push carries no user-visible alert of its own except the one
      // required inside `aps` on a start, and APNs rejects the payload under the wrong push type.
      'apns-push-type': 'liveactivity',
      // 10 = deliver immediately. ActivityKit also accepts 5 (throttled); a partner's photo landing
      // on the lock screen is the entire feature, so it goes at 10.
      'apns-priority': '10',
      'apns-expiration': expiration,
      'content-type': 'application/json',
    },
    body: payload,
  });
  if (res.ok) {
    // Drain so the connection can be reused; an unread body leaks in Deno.
    await res.body?.cancel().catch(() => undefined);
    return { ok: true, status: res.status, reason: '', environment };
  }
  return { ok: false, status: res.status, reason: await apnsReason(res), environment };
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

  let body: { event?: unknown; mediaItemId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: jsonHeaders });
  }

  const requestedEvent = body.event;
  if (requestedEvent !== undefined && requestedEvent !== 'start' && requestedEvent !== 'update' && requestedEvent !== 'end') {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: jsonHeaders });
  }
  const mediaItemId = typeof body.mediaItemId === 'string' ? body.mediaItemId : undefined;
  // A non-string, or a string that isn't a uuid, is a client bug — reject rather than 404 later, so
  // the caller finds out it is malformed and not merely unlucky.
  if (body.mediaItemId !== undefined && (!mediaItemId || !UUID_RE.test(mediaItemId))) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: jsonHeaders });
  }
  // Every event except `end` needs something to show.
  if (requestedEvent !== 'end' && !mediaItemId) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: jsonHeaders });
  }

  const svc = serviceClient();

  // ---------------------------------------------------------------------------------------------
  // Who is this for? Never the body's word for it.
  // ---------------------------------------------------------------------------------------------
  let coupleId: string | null = null;
  let item: MediaRow | null = null;

  if (mediaItemId) {
    // The item is the authority for who/what/which couple. Requiring sender_id = caller stops anyone
    // from using this function to put an activity on a stranger's partner's lock screen.
    const { data, error } = await svc
      .from('media_items')
      .select('id, couple_id, sender_id, type, created_at')
      .eq('id', mediaItemId)
      .maybeSingle();
    if (error) return new Response(JSON.stringify({ error: 'db_error' }), { status: 500, headers: jsonHeaders });
    if (!data || data.sender_id !== user.id) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: jsonHeaders });
    }
    item = data as MediaRow;
    coupleId = item.couple_id;
  } else {
    // `end` carries no id, so membership is the only thing to go on.
    const { data, error } = await svc
      .from('couples')
      .select('id')
      .or(`member_a.eq.${user.id},member_b.eq.${user.id}`)
      .maybeSingle();
    if (error) return new Response(JSON.stringify({ error: 'db_error' }), { status: 500, headers: jsonHeaders });
    coupleId = data?.id ?? null;
  }

  if (!coupleId) {
    return new Response(JSON.stringify({ event: 'none', sent: 0, failed: 0, pruned: 0 }), { headers: jsonHeaders });
  }

  const { data: couple } = await svc
    .from('couples')
    .select('member_a, member_b')
    .eq('id', coupleId)
    .maybeSingle();
  const partnerId = couple?.member_a === user.id ? couple?.member_b : couple?.member_a;
  // Unpaired, or the couple still has an empty member_b slot — nothing to show, and not an error.
  if (!partnerId || partnerId === user.id) {
    return new Response(JSON.stringify({ event: 'none', sent: 0, failed: 0, pruned: 0 }), { headers: jsonHeaders });
  }

  // ---------------------------------------------------------------------------------------------
  // start vs update: does the recipient already have something on their lock screen?
  // ---------------------------------------------------------------------------------------------
  // An `update` must go to that activity's own update token; a `start` goes to the device's
  // push-to-start token. They are different tokens with different lifetimes, so the choice is made
  // from the database, not from the caller.
  //
  // Only rows that are actually *addressable* count, and nothing here assumes a row exists just
  // because an activity was started: the app cannot learn ActivityKit's activity id until the
  // push-token event fires, so the row appears at that moment, already carrying its update_token.
  // Until then the recipient looks tokenless and we send a start — which can briefly duplicate an
  // activity on the lock screen, and the app can end the spare. The alternative, letting an
  // unaddressable row suppress starts, would let one crashed launch disable the feature forever
  // with nothing to see anywhere.
  const { data: liveRows, error: liveError } = await svc
    .from('live_activity_instances')
    .select('activity_id, update_token')
    .eq('user_id', partnerId)
    .is('ended_at', null)
    .not('update_token', 'is', null);
  if (liveError) return new Response(JSON.stringify({ error: 'db_error' }), { status: 500, headers: jsonHeaders });
  const live = liveRows ?? [];

  const event: ActivityEvent =
    requestedEvent === 'end' ? 'end'
    : requestedEvent === 'start' ? 'start'
    : requestedEvent === 'update' ? 'update'
    : live.length > 0 ? 'update'
    : 'start';

  // Push-to-start tokens for the recipient. Needed for a `start`, and needed even for an
  // `update`/`end`: see the environment note below.
  const { data: startTokens, error: tokenError } = await svc
    .from('live_activity_tokens')
    .select('token, environment, updated_at')
    .eq('user_id', partnerId)
    .order('updated_at', { ascending: false });
  if (tokenError) return new Response(JSON.stringify({ error: 'db_error' }), { status: 500, headers: jsonHeaders });

  const forcedEnvironment = Deno.env.get('APNS_FORCE_ENVIRONMENT') as ApnsEnvironment | undefined;

  // The single most breakable value in this system. For a `start` it comes straight off the token
  // row, which the client filled in from the `aps-environment` entitlement — the same path
  // notify-partner has proven on hardware.
  //
  // An update/end token has no environment of its own: `live_activity_instances` is written by the
  // app as `registerActivityUpdateToken(activityId, token)` and adding a third argument would break
  // the app-lane contract. It is inferred from the recipient's most recently updated push-to-start
  // row instead — the update token was necessarily issued on a device that also registered a
  // push-to-start token — and, because that is an inference rather than a fact, an update that comes
  // back BadDeviceToken is retried once against the other gateway before the row is written off.
  const inferredEnvironment: ApnsEnvironment =
    forcedEnvironment ?? ((startTokens?.[0]?.environment as ApnsEnvironment | null) ?? 'sandbox');

  // ---------------------------------------------------------------------------------------------
  // Payload
  // ---------------------------------------------------------------------------------------------
  let contentState: BundlesActivityContentState | null = null;
  let alert: { title: string; body: string } | null = null;

  if (item) {
    const { data: senderProfile } = await svc
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    // display_name defaults to '' at signup (0001), so fall back rather than title an activity with
    // nothing.
    const senderName = senderProfile?.display_name?.trim() || 'Your partner';
    const mediaType = item.type as MediaType;

    contentState = {
      kind: mediaType,
      title: `${senderName} ${alertBody(mediaType)}`,
      subtitle: '',
      // Deliberately null. The image is not in the recipient's App Group yet — push-to-start wakes
      // the app only at push time — so the first frame is the text state and the app fills in the
      // filename with a *local* update once it has downloaded. See "Ordering problem" in the
      // contract. Putting bytes here would also blow the 4 KB content-state limit.
      imageFile: null,
      deepLink: deepLinkFor(mediaType, item.id),
      sentAt: Date.parse(item.created_at) || Date.now(),
    };
    alert = { title: senderName, body: alertBody(mediaType) };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const expiration = String(timestamp + APNS_EXPIRATION_SECONDS);

  /**
   * expo-widgets' ContentState is `{ name: String, props: String }` — `props` is a STRING holding
   * JSON, not a nested object. Handing ActivityKit an object here makes the Codable decode fail and
   * the push is dropped with nothing logged anywhere, which is indistinguishable from "push-to-start
   * doesn't work".
   */
  function wireContentState(): { name: string; props: string } | null {
    return contentState === null ? null : { name: ACTIVITY_NAME, props: JSON.stringify(contentState) };
  }

  function payloadFor(kind: ActivityEvent): string {
    if (kind === 'end') {
      // No `content-state` on an end: we would have to invent one, and a state the Swift struct
      // cannot decode makes iOS drop the push — which would leave the activity stuck on the lock
      // screen, the exact opposite of the intent. Omitting it keeps the last content for the brief
      // dismissal window. `dismissal-date` in the present tells the system to take it away now;
      // without it an ended activity lingers for up to four hours.
      return JSON.stringify({ aps: { timestamp, event: 'end', 'dismissal-date': timestamp } });
    }
    if (kind === 'start') {
      return JSON.stringify({
        aps: {
          timestamp,
          event: 'start',
          'content-state': wireContentState(),
          'attributes-type': ATTRIBUTES_TYPE,
          // Empty, not omitted. APNs requires the `attributes` key on a `start` event, and
          // expo-widgets' shared `LiveActivityAttributes` declares no fields at all — so `{}` is the
          // only value that both satisfies APNs and decodes. There is nowhere to put `coupleId`:
          // if the activity ever needs it, it goes inside the stringified props by contract change,
          // not here.
          attributes: {},
          // REQUIRED. iOS silently drops a start push with no alert — there is no error anywhere,
          // the activity simply never appears, which reads exactly like "push-to-start is broken".
          alert,
        },
      });
    }
    return JSON.stringify({ aps: { timestamp, event: 'update', 'content-state': wireContentState() } });
  }

  // Pre-flight the credentials for every environment this request will actually touch, so a missing
  // or malformed secret is a loud 500 instead of a silent per-row `failed`. `postToApns` mints
  // on demand and caches, so this is a warm-up, not a second code path — and the retry may still
  // reach an environment not listed here, which fails that one row and is caught below.
  const environmentsInPlay = new Set<ApnsEnvironment>(
    event === 'start'
      ? (startTokens ?? []).map((row) =>
          forcedEnvironment ?? ((row.environment as ApnsEnvironment | null) ?? 'sandbox'))
      : [inferredEnvironment],
  );
  for (const environment of environmentsInPlay) {
    try {
      await apnsAuthToken(environment);
    } catch (e) {
      console.error('apns auth token failed for', environment, String(e));
      return new Response(JSON.stringify({ error: 'apns_auth_failed' }), { status: 500, headers: jsonHeaders });
    }
  }

  let sent = 0;
  let failed = 0;
  let pruned = 0;

  // Sequential, not Promise.all: a couple has at most a handful of devices, and one dead token must
  // never take the others down with it.
  if (event === 'start') {
    if (!startTokens?.length) {
      return new Response(JSON.stringify({ event: 'none', sent: 0, failed: 0, pruned: 0 }), { headers: jsonHeaders });
    }
    const payload = payloadFor('start');
    for (const row of startTokens) {
      const token = row.token as string;
      const environment: ApnsEnvironment =
        forcedEnvironment ?? ((row.environment as ApnsEnvironment | null) ?? 'sandbox');
      try {
        const res = await postToApns(environment, token, payload, expiration);
        if (res.ok) {
          sent++;
        } else if (isDeadToken(res.status, res.reason)) {
          // No cross-gateway retry here on purpose: this environment is a recorded fact from the
          // entitlement, so a rejection means the token really is dead, and retrying the other host
          // would hide a genuine registration bug behind an accidental success.
          await svc.from('live_activity_tokens').delete().eq('token', token);
          pruned++;
          console.error('activity dead push-to-start token pruned', tokenTail(token), environment, res.status, res.reason);
        } else {
          failed++;
          console.error('activity start failed', tokenTail(token), environment, res.status, res.reason);
        }
      } catch (e) {
        failed++;
        console.error('activity start request error', tokenTail(token), String(e));
      }
    }
    return new Response(JSON.stringify({ event, sent, failed, pruned }), { headers: jsonHeaders });
  }

  // update / end — addressed to each live activity's own token.
  if (!live.length) {
    return new Response(JSON.stringify({ event: 'none', sent: 0, failed: 0, pruned: 0 }), { headers: jsonHeaders });
  }
  const payload = payloadFor(event);
  for (const row of live) {
    const activityId = row.activity_id as string;
    const token = row.update_token as string;
    try {
      // The first attempt is the authoritative one; the retry may only *improve* the outcome, never
      // replace it. That rule was earned: when the project had only a Sandbox-only key, every
      // production-gateway retry came back 403 BadEnvironmentKeyInToken — not a dead token — and
      // letting that win turned a prunable 400 BadDeviceToken into a permanent `failed`, so dead
      // update tokens accumulated forever. The rule still holds now that both keys exist, because a
      // retry can still fail for reasons that say nothing about the token.
      //
      // The retry swaps the ENVIRONMENT, which now swaps the signing key as well as the host —
      // `postToApns` derives both from that one argument. Retrying the other host with the first
      // host's key would be guaranteed to 403, which would make this whole path decorative.
      const first = await postToApns(inferredEnvironment, token, payload, expiration);
      let res = first;
      if (!first.ok && isDeadToken(first.status, first.reason) && !forcedEnvironment) {
        const other: ApnsEnvironment = inferredEnvironment === 'sandbox' ? 'production' : 'sandbox';
        console.error('activity update retrying on other gateway+key', tokenTail(token), inferredEnvironment, '->', other);
        try {
          const retry = await postToApns(other, token, payload, expiration);
          if (retry.ok) res = retry;
          else console.error('activity update retry also failed', tokenTail(token), other, retry.status, retry.reason);
        } catch (e) {
          // Most likely the other environment's credentials are missing. Never fatal: `first` stands.
          console.error('activity update retry could not be attempted', tokenTail(token), other, String(e));
        }
      }

      if (res.ok) {
        sent++;
        // An `end` that APNs accepted is the end of the activity as far as we are concerned; leaving
        // the row addressable would let a later update resurrect content on a lock screen.
        if (event === 'end') {
          await svc
            .from('live_activity_instances')
            .update({ ended_at: new Date().toISOString(), update_token: null })
            .eq('activity_id', activityId);
        } else if (item) {
          await svc.from('live_activity_instances').update({ media_id: item.id }).eq('activity_id', activityId);
        }
      } else if (isDeadToken(res.status, res.reason)) {
        // The activity is gone (dismissed, or the app was reinstalled). Close the row rather than
        // deleting it: the same "keep the history, drop the address" rule the handover trigger uses.
        await svc
          .from('live_activity_instances')
          .update({ ended_at: new Date().toISOString(), update_token: null })
          .eq('activity_id', activityId);
        pruned++;
        console.error('activity dead update token pruned', tokenTail(token), res.environment, res.status, res.reason);
      } else {
        failed++;
        console.error('activity', event, 'failed', tokenTail(token), res.environment, res.status, res.reason);
      }
    } catch (e) {
      failed++;
      console.error('activity', event, 'request error', tokenTail(token), String(e));
    }
  }

  return new Response(JSON.stringify({ event, sent, failed, pruned }), { headers: jsonHeaders });
});
