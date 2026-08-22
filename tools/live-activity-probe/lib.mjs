// Shared helpers for the Live Activity backend probes.
//
// These talk to the same cloud Supabase project the app does, using the *publishable* anon key and
// the seeded test accounts (CHANGELOG, "Test accounts"). Nothing here needs the service role, and
// nothing here prints a secret: the APNs .p8 files are read, never echoed.

import { readFileSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http2 from 'node:http2';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..');

export const SUPABASE_URL = 'https://agnslitokcyvkboiklwn.supabase.co';
export const ANON_KEY = 'sb_publishable_tPH6p4JpADofyZHyx3tcvw_5l9PuvWo';

export const ACCOUNTS = {
  sam: { email: 'sam@dory.app' },
  alex: { email: 'alex@dory.app' },
};
const TEST_PASSWORD = 'dorytest123';

export async function signIn(who) {
  const account = ACCOUNTS[who];
  if (!account) throw new Error(`unknown account ${who}`);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: TEST_PASSWORD }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`sign-in failed for ${who}: ${JSON.stringify(body)}`);
  return { jwt: body.access_token, userId: body.user.id, email: account.email };
}

/** PostgREST as a signed-in user — i.e. subject to exactly the RLS the app is subject to. */
export async function rest(session, path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${session.jwt}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

export async function callFunction(session, name, payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${session.jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

// ---------------------------------------------------------------------------------------------
// Raw APNs, so a key and a host can be paired deliberately — which the Edge Function refuses to do
// by design. This is the only way to measure the cross-environment restriction.
// ---------------------------------------------------------------------------------------------

const HOSTS = { sandbox: 'api.sandbox.push.apple.com', production: 'api.push.apple.com' };

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * ES256 provider JWT. Node's `createSign` emits DER, which APNs rejects as InvalidProviderToken —
 * `dsaEncoding: 'ieee-p1363'` is the raw r||s form the JWS spec (and APNs) want. Same trap the
 * Edge Function's comment documents for Web Crypto.
 */
export function apnsJwt({ p8Path, keyId, teamId }) {
  const key = readFileSync(p8Path, 'utf8');
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${claims}`);
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64url(sig)}`;
}

export const APNS_TOPIC_ACTIVITY = 'com.nikhilsinha.bundles.push-type.liveactivity';

/**
 * Post a raw payload and return the exact status, headers and body APNs replied with.
 *
 * node:http2, not `fetch`: APNs speaks HTTP/2 only, and undici's fetch negotiates HTTP/1.1 and dies
 * with `HPE_INVALID_CONSTANT` on the SETTINGS frame that comes back.
 */
export function postApns({ host, jwt, deviceToken, payload, topic = APNS_TOPIC_ACTIVITY, pushType = 'liveactivity', priority = '10' }) {
  const authority = `https://${HOSTS[host] ?? host}`;
  const path = `/3/device/${deviceToken}`;
  return new Promise((resolve, reject) => {
    const client = http2.connect(authority);
    client.on('error', reject);
    const req = client.request({
      ':method': 'POST',
      ':path': path,
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': pushType,
      'apns-priority': priority,
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      'content-type': 'application/json',
    });
    let status = 0;
    let apnsId = null;
    let body = '';
    req.on('response', (headers) => {
      status = headers[':status'];
      apnsId = headers['apns-id'] ?? null;
    });
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      client.close();
      resolve({
        url: `${authority}/3/device/…${deviceToken.slice(-6)}`,
        status,
        apnsId,
        body,
        bytes: Buffer.byteLength(payload),
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

/**
 * Where the gitignored local secrets (`.apns-key*.p8`, `.apple-team-id`) live.
 *
 * Not necessarily this checkout: `git worktree add` copies tracked files only, so a worktree has no
 * copy of them. `git rev-parse --git-common-dir` points at the primary checkout's `.git`, whose
 * parent is where they are. `BUNDLES_SECRETS_DIR` overrides for anyone whose layout differs.
 */
export const SECRETS_DIR = (() => {
  if (process.env.BUNDLES_SECRETS_DIR) return process.env.BUNDLES_SECRETS_DIR;
  if (existsSync(join(REPO, '.apns-key.p8'))) return REPO;
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' }).trim();
  return dirname(common);
})();

export function teamId() {
  return readFileSync(join(SECRETS_DIR, '.apple-team-id'), 'utf8').trim();
}

/**
 * The two APNs auth keys. A **Key ID is an identifier, not a secret** — it is the `kid` header of
 * every provider JWT and is recoverable from the file Apple hands you (`AuthKey_<KEYID>.p8`); the
 * `.p8` beside it is the secret, and it is gitignored and never printed. The production one is
 * already written down in docs/live-activity-contract.md.
 *
 * Neither key works on the other environment — see the cross-matched probe.
 */
export const APNS_KEYS = {
  sandbox: { p8Path: join(SECRETS_DIR, '.apns-key.p8'), keyId: process.env.APNS_KEY_ID || '79DA5Q3X2T' },
  production: { p8Path: join(SECRETS_DIR, '.apns-key-universal.p8'), keyId: process.env.APNS_KEY_ID_PRODUCTION || '8323H4JG5F' },
};
