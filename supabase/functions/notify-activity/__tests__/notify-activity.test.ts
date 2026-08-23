/**
 * `notify-activity` — the parts that can be proven without a phone.
 *
 * These run the deployed source itself (see `harness.js`), so what they assert is the URL the
 * function really posted to, the `kid` really in the provider JWT, and the bytes really serialized
 * into the request body. Three of those four things are invisible to a code review and were the
 * source of the two most expensive defects in this feature: pairing a key with the wrong gateway
 * (403 BadEnvironmentKeyInToken, which would have made every TestFlight push fail), and shipping a
 * `content-state` ActivityKit cannot decode (silently dropped, nothing logged anywhere).
 */

const { loadNotifyActivity, SANDBOX_MARKER, PRODUCTION_MARKER } = require('./harness');

const SENDER = 'sender-uuid';
const PARTNER = 'partner-uuid';
const COUPLE = { id: 'couple-1', member_a: SENDER, member_b: PARTNER };
const MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const MEDIA = {
  id: MEDIA_ID,
  couple_id: COUPLE.id,
  sender_id: SENDER,
  type: 'photo',
  created_at: '2026-08-20T12:00:00.000Z',
};

type Row = Record<string, unknown>;

function db({
  tokens = [] as Row[],
  instances = [] as Row[],
  displayName = 'Alex' as string | null,
  media = MEDIA as Row | null,
} = {}) {
  return ({ table, single }: { table: string; single: boolean }) => {
    switch (table) {
      case 'media_items':
        return { data: media, error: null };
      case 'couples':
        return { data: single ? COUPLE : [COUPLE], error: null };
      case 'live_activity_instances':
        return { data: instances, error: null };
      case 'live_activity_tokens':
        return { data: tokens, error: null };
      case 'profiles':
        return { data: { display_name: displayName }, error: null };
      default:
        return { data: null, error: null };
    }
  };
}

const sandboxToken = { token: 'tok-sandbox', environment: 'sandbox', updated_at: '2026-08-20T00:00:00Z' };
const productionToken = { token: 'tok-production', environment: 'production', updated_at: '2026-08-19T00:00:00Z' };
const liveInstance = { activity_id: 'activity-1', update_token: 'tok-update' };

const start = { mediaItemId: MEDIA_ID, event: 'start' };

// -------------------------------------------------------------------------------------------
// 1. Key and gateway selection
// -------------------------------------------------------------------------------------------

describe('key + gateway selection', () => {
  it('signs a sandbox row with the sandbox key and posts it to the sandbox gateway', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }) });
    const res = await fn.post(start);

    expect(res.body).toEqual({ event: 'start', sent: 1, failed: 0, pruned: 0 });
    expect(fn.apnsCalls).toHaveLength(1);
    expect(fn.apnsCalls[0].url).toBe('https://api.sandbox.push.apple.com/3/device/tok-sandbox');
    expect(fn.apnsCalls[0].jwtHeader).toEqual({ alg: 'ES256', kid: 'SANDBOXKEY' });
    expect(fn.importedKeys).toEqual([SANDBOX_MARKER]);
  });

  it('signs a production row with the production key and posts it to the production gateway', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [productionToken] }) });
    const res = await fn.post(start);

    expect(res.body).toEqual({ event: 'start', sent: 1, failed: 0, pruned: 0 });
    expect(fn.apnsCalls[0].url).toBe('https://api.push.apple.com/3/device/tok-production');
    expect(fn.apnsCalls[0].jwtHeader).toEqual({ alg: 'ES256', kid: 'PRODKEY123' });
    expect(fn.importedKeys).toEqual([PRODUCTION_MARKER]);
  });

  /**
   * The case that would have shipped broken. Two devices of the same user in different
   * environments, in one request: each row must get its own host AND its own key, and the JWT
   * minted for the first must not be handed to the second.
   */
  it('pairs host and key per row when both environments are in one request', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken, productionToken] }) });
    const res = await fn.post(start);

    expect(res.body.sent).toBe(2);
    const byHost = Object.fromEntries(fn.apnsCalls.map((c: any) => [new URL(c.url).host, c]));
    expect(byHost['api.sandbox.push.apple.com'].jwtHeader.kid).toBe('SANDBOXKEY');
    expect(byHost['api.push.apple.com'].jwtHeader.kid).toBe('PRODKEY123');
    expect(fn.importedKeys.sort()).toEqual([PRODUCTION_MARKER, SANDBOX_MARKER].sort());
    // Two distinct provider tokens, not one reused across environments.
    expect(fn.apnsCalls[0].jwt).not.toBe(fn.apnsCalls[1].jwt);
  });

  it('caches the JWT per environment — one key import and one JWT for two same-environment rows', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken, { ...sandboxToken, token: 'tok-sandbox-2' }] }),
    });
    await fn.post(start);

    expect(fn.importedKeys).toEqual([SANDBOX_MARKER]);
    expect(fn.apnsCalls[0].jwt).toBe(fn.apnsCalls[1].jwt);
  });

  it('puts the team id in the provider JWT claims', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }) });
    await fn.post(start);
    expect(fn.apnsCalls[0].jwtClaims.iss).toBe('TEAMID1234');
  });

  it('APNS_FORCE_ENVIRONMENT overrides the row, moving the key with the host', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken] }),
      env: { APNS_FORCE_ENVIRONMENT: 'production' },
    });
    await fn.post(start);

    expect(fn.apnsCalls[0].url).toBe('https://api.push.apple.com/3/device/tok-sandbox');
    expect(fn.apnsCalls[0].jwtHeader.kid).toBe('PRODKEY123');
    expect(fn.importedKeys).toEqual([PRODUCTION_MARKER]);
  });

  it('treats a row with no environment as sandbox', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [{ token: 'tok-null', environment: null }] }) });
    await fn.post(start);
    expect(fn.apnsCalls[0].url).toBe('https://api.sandbox.push.apple.com/3/device/tok-null');
    expect(fn.apnsCalls[0].jwtHeader.kid).toBe('SANDBOXKEY');
  });

  it('fails loudly, not per-row, when the environment in play has no credentials', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [productionToken] }),
      env: { APNS_KEY_P8_PRODUCTION: undefined },
    });
    const res = await fn.post(start);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'apns_auth_failed' });
    expect(fn.apnsCalls).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------------------------
// 2. The wire envelope
// -------------------------------------------------------------------------------------------

describe('the APNs request', () => {
  it('carries the Live Activity topic, push type, priority and a one-hour expiration', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }) });
    await fn.post(start);
    const { headers, payload } = fn.apnsCalls[0];

    expect(headers['apns-topic']).toBe('com.nikhilsinha.bundles.push-type.liveactivity');
    expect(headers['apns-push-type']).toBe('liveactivity');
    expect(headers['apns-priority']).toBe('10');
    expect(Number(headers['apns-expiration']) - payload.aps.timestamp).toBe(3600);
    expect(headers['content-type']).toBe('application/json');
  });

  it('sends the start envelope the contract specifies', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }) });
    await fn.post(start);
    const { aps } = fn.apnsCalls[0].payload;

    // The literal Swift struct name expo-widgets declares — never the activity's own name.
    expect(aps['attributes-type']).toBe('LiveActivityAttributes');
    // Present and empty, not omitted: APNs requires the key on a start.
    expect(Object.prototype.hasOwnProperty.call(aps, 'attributes')).toBe(true);
    expect(aps.attributes).toEqual({});
    // Required, or iOS drops the start with nothing logged.
    expect(aps.alert).toEqual({ title: 'Alex', body: 'sent you a photo' });
    expect(aps.event).toBe('start');
    expect(typeof aps.timestamp).toBe('number');

    // `props` is a JSON *string*, not a nested object — expo-widgets' ContentState is
    // { name: String, props: String } and a nested object fails the Codable decode.
    expect(aps['content-state'].name).toBe('BundlesActivity');
    expect(typeof aps['content-state'].props).toBe('string');
    expect(JSON.parse(aps['content-state'].props)).toEqual({
      kind: 'photo',
      title: 'Alex sent you a photo',
      subtitle: '',
      imageFile: null,
      deepLink: `bundles://media/${MEDIA_ID}`,
      sentAt: Date.parse(MEDIA.created_at),
    });
  });

  it('links a drawing to the canvas, pre-loaded, with the shipped wording', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken], media: { ...MEDIA, type: 'drawing' } }),
    });
    await fn.post(start);
    const state = JSON.parse(fn.apnsCalls[0].payload.aps['content-state'].props);

    expect(state.kind).toBe('drawing');
    expect(state.title).toBe('Alex drew you something');
    expect(state.deepLink).toBe(`bundles://draw?base=${MEDIA_ID}`);
    expect(fn.apnsCalls[0].payload.aps.alert.body).toBe('drew you something');
  });

  it('falls back to "Your partner" rather than titling an activity with an empty name', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], displayName: '   ' }) });
    await fn.post(start);
    expect(fn.apnsCalls[0].payload.aps.alert.title).toBe('Your partner');
  });

  it('sends the update envelope with no attributes and no alert', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], instances: [liveInstance] }) });
    await fn.post({ mediaItemId: MEDIA_ID, event: 'update' });
    const { aps } = fn.apnsCalls[0].payload;

    expect(aps.event).toBe('update');
    expect(typeof aps['content-state'].props).toBe('string');
    expect(Object.prototype.hasOwnProperty.call(aps, 'attributes')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(aps, 'attributes-type')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(aps, 'alert')).toBe(false);
    // Addressed to the activity's own update token, never the push-to-start token.
    expect(fn.apnsCalls[0].url).toBe('https://api.sandbox.push.apple.com/3/device/tok-update');
  });

  it('sends the end envelope with no content-state and a dismissal date in the present', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], instances: [liveInstance] }) });
    await fn.post({ event: 'end' });
    const { aps } = fn.apnsCalls[0].payload;

    expect(aps.event).toBe('end');
    expect(Object.prototype.hasOwnProperty.call(aps, 'content-state')).toBe(false);
    expect(aps['dismissal-date']).toBe(aps.timestamp);
  });

  it('chooses update over start when the recipient already has an addressable activity', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], instances: [liveInstance] }) });
    const res = await fn.post({ mediaItemId: MEDIA_ID });
    expect(res.body.event).toBe('update');
  });

  it('chooses start when there is nothing addressable', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }) });
    const res = await fn.post({ mediaItemId: MEDIA_ID });
    expect(res.body.event).toBe('start');
  });
});

// -------------------------------------------------------------------------------------------
// 3. Token lifecycle
// -------------------------------------------------------------------------------------------

describe('dead tokens', () => {
  const deletes = (fn: any) => fn.writes.filter((w: any) => w.op === 'delete');
  const updates = (fn: any) => fn.writes.filter((w: any) => w.op === 'update');

  it.each([
    ['400 BadDeviceToken', { status: 400, reason: 'BadDeviceToken' }],
    ['400 DeviceTokenNotForTopic', { status: 400, reason: 'DeviceTokenNotForTopic' }],
    ['410 Unregistered', { status: 410, reason: 'Unregistered' }],
  ])('deletes the push-to-start row on %s', async (_label, reply) => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }), apns: () => reply });
    const res = await fn.post(start);

    expect(res.body).toEqual({ event: 'start', sent: 0, failed: 0, pruned: 1 });
    expect(deletes(fn)).toEqual([
      expect.objectContaining({ table: 'live_activity_tokens', filters: [['eq', 'token', 'tok-sandbox']] }),
    ]);
  });

  /**
   * The 403 must NOT prune. It says the provider key was wrong for the gateway, which is a
   * deployment fault; deleting the row would destroy a perfectly good token and require the user to
   * relaunch the app to get another one.
   */
  it('does not delete anything on 403 BadEnvironmentKeyInToken', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken] }),
      apns: () => ({ status: 403, reason: 'BadEnvironmentKeyInToken' }),
    });
    const res = await fn.post(start);

    expect(res.body).toEqual({ event: 'start', sent: 0, failed: 1, pruned: 0 });
    expect(fn.writes).toEqual([]);
  });

  it('never retries a start on the other gateway — the row\'s environment is a recorded fact', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken] }),
      apns: () => ({ status: 400, reason: 'BadDeviceToken' }),
    });
    await fn.post(start);
    expect(fn.apnsCalls).toHaveLength(1);
  });

  it('one dead token does not stop the others', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken, { ...sandboxToken, token: 'tok-live' }] }),
      apns: (call: any) => (call.url.endsWith('tok-sandbox') ? { status: 410, reason: 'Unregistered' } : { status: 200 }),
    });
    const res = await fn.post(start);
    expect(res.body).toEqual({ event: 'start', sent: 1, failed: 0, pruned: 1 });
  });

  it('closes — never deletes — an instance whose update token is dead', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken], instances: [liveInstance] }),
      apns: () => ({ status: 400, reason: 'BadDeviceToken' }),
    });
    const res = await fn.post({ mediaItemId: MEDIA_ID, event: 'update' });

    expect(res.body).toEqual({ event: 'update', sent: 0, failed: 0, pruned: 1 });
    expect(deletes(fn)).toEqual([]);
    const [write] = updates(fn);
    expect(write.table).toBe('live_activity_instances');
    expect(write.payload.update_token).toBeNull();
    expect(typeof write.payload.ended_at).toBe('string');
    expect(write.filters).toEqual([['eq', 'activity_id', 'activity-1']]);
  });
});

describe('the cross-gateway retry on an update', () => {
  it('swaps the key as well as the host', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken], instances: [liveInstance] }),
      apns: (_call: any, index: number) => (index === 0 ? { status: 400, reason: 'BadDeviceToken' } : { status: 200 }),
    });
    const res = await fn.post({ mediaItemId: MEDIA_ID, event: 'update' });

    expect(fn.apnsCalls).toHaveLength(2);
    expect(fn.apnsCalls[0].url).toBe('https://api.sandbox.push.apple.com/3/device/tok-update');
    expect(fn.apnsCalls[0].jwtHeader.kid).toBe('SANDBOXKEY');
    expect(fn.apnsCalls[1].url).toBe('https://api.push.apple.com/3/device/tok-update');
    expect(fn.apnsCalls[1].jwtHeader.kid).toBe('PRODKEY123');
    expect(res.body).toEqual({ event: 'update', sent: 1, failed: 0, pruned: 0 });
  });

  it('may only improve the outcome — a failed retry leaves the first verdict standing', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken], instances: [liveInstance] }),
      apns: (_call: any, index: number) =>
        index === 0 ? { status: 400, reason: 'BadDeviceToken' } : { status: 403, reason: 'BadEnvironmentKeyInToken' },
    });
    const res = await fn.post({ mediaItemId: MEDIA_ID, event: 'update' });
    expect(res.body).toEqual({ event: 'update', sent: 0, failed: 0, pruned: 1 });
  });

  it('does not retry when APNS_FORCE_ENVIRONMENT pinned the environment', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken], instances: [liveInstance] }),
      env: { APNS_FORCE_ENVIRONMENT: 'sandbox' },
      apns: () => ({ status: 400, reason: 'BadDeviceToken' }),
    });
    await fn.post({ mediaItemId: MEDIA_ID, event: 'update' });
    expect(fn.apnsCalls).toHaveLength(1);
  });

  it('infers the update gateway from the most recently updated push-to-start row', async () => {
    const fn = loadNotifyActivity({
      // The function orders by updated_at desc, so the first row is the most recent one.
      query: db({ tokens: [productionToken, sandboxToken], instances: [liveInstance] }),
    });
    await fn.post({ mediaItemId: MEDIA_ID, event: 'update' });
    expect(fn.apnsCalls[0].url).toBe('https://api.push.apple.com/3/device/tok-update');
    expect(fn.apnsCalls[0].jwtHeader.kid).toBe('PRODKEY123');
  });
});

// -------------------------------------------------------------------------------------------
// 4. Authorization and input validation
// -------------------------------------------------------------------------------------------

describe('who may push what', () => {
  it('401s without an Authorization header', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }) });
    const res = await fn.post(start, {});
    expect(res.status).toBe(401);
  });

  it('404s on someone else\'s media id', async () => {
    const fn = loadNotifyActivity({
      query: db({ tokens: [sandboxToken], media: { ...MEDIA, sender_id: 'a-stranger' } }),
    });
    const res = await fn.post(start);
    expect(res.status).toBe(404);
    expect(fn.apnsCalls).toHaveLength(0);
  });

  it.each([
    ['a non-uuid media id', { mediaItemId: 'not-a-uuid' }],
    ['a non-string media id', { mediaItemId: 42 }],
    ['an unknown event', { mediaItemId: MEDIA_ID, event: 'restart' }],
    ['no media id on a start', { event: 'start' }],
  ])('400s on %s', async (_label, body) => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }) });
    const res = await fn.post(body);
    expect(res.status).toBe(400);
  });

  it('is a 200 "none", not an error, when nobody is addressable', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [] }) });
    const res = await fn.post(start);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ event: 'none', sent: 0, failed: 0, pruned: 0 });
  });
});

// -------------------------------------------------------------------------------------------
// 5. The 4 KB content-state ceiling
// -------------------------------------------------------------------------------------------

/**
 * ActivityKit refuses a content state over 4 KB, but APNs does not: measured against the real
 * gateway on 2026-08-23, a `liveactivity` payload is accepted up to 5,120 bytes and refused with
 * 413 PayloadTooLarge from 5,121. So anything the server emits between those two limits is accepted
 * by Apple, delivered to the phone, and dropped by ActivityKit with nothing logged anywhere.
 *
 * The client caps its own states (`src/domain/activity/content-state.ts`). The server path had no
 * cap at all, and its title is built from `profiles.display_name`, which is user-controlled.
 */
describe('the 4 KB content-state ceiling', () => {
  const propsOf = (fn: any) => fn.apnsCalls[0].payload.aps['content-state'].props;

  it('keeps the serialized props inside 4096 bytes however long the display name is', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], displayName: 'x'.repeat(20_000) }) });
    const res = await fn.post(start);

    expect(res.body.sent).toBe(1);
    expect(new TextEncoder().encode(propsOf(fn)).length).toBeLessThanOrEqual(4096);
  });

  it('measures UTF-8 bytes, not JS string length', async () => {
    // 2,000 emoji are 4,000 JS characters but 8,000 UTF-8 bytes.
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], displayName: '💜'.repeat(2000) }) });
    await fn.post(start);
    expect(new TextEncoder().encode(propsOf(fn)).length).toBeLessThanOrEqual(4096);
  });

  it('still sends something renderable rather than dropping the push', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], displayName: 'x'.repeat(20_000) }) });
    await fn.post(start);
    const state = JSON.parse(propsOf(fn));

    expect(state.kind).toBe('photo');
    expect(state.deepLink).toBe(`bundles://media/${MEDIA_ID}`);
    expect(state.title.length).toBeGreaterThan(0);
  });

  /**
   * The window that matters. 4,300 characters of display name produced a ~4.4 KB props string,
   * which real APNs accepted with a 200 — over ActivityKit's 4 KB limit and under Apple's 5,120.
   * That push is delivered and silently discarded on the device. Before the cap, this failed.
   */
  it('never emits a payload in the window APNs accepts but ActivityKit drops', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], displayName: 'x'.repeat(4300) }) });
    await fn.post(start);
    expect(new TextEncoder().encode(fn.apnsCalls[0].body).length).toBeLessThan(4096);
  });

  it('caps the required alert too, which is built from the same display name', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken], displayName: 'x'.repeat(20_000) }) });
    await fn.post(start);
    expect(fn.apnsCalls[0].payload.aps.alert.title.length).toBeLessThanOrEqual(40);
  });

  it('leaves an ordinary state untouched', async () => {
    const fn = loadNotifyActivity({ query: db({ tokens: [sandboxToken] }) });
    await fn.post(start);
    expect(JSON.parse(propsOf(fn)).title).toBe('Alex sent you a photo');
  });
});
