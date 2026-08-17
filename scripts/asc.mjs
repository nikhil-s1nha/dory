#!/usr/bin/env node
// App Store Connect API client for Bundles — zero dependencies, Node 20+.
//
// Auth is an ES256 JWT signed with the .p8 private key (node:crypto only).
// The issuer id is read at runtime from `.asc-issuer-id`; nothing here is hardcoded
// that would need editing when the key is rotated.
//
//   node scripts/asc.mjs help
//
// Every failure path prints what the HTTP status actually means for App Store Connect.
// 401 / 403 / 409 look similar and mean completely different things — see explainStatus().

import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Defaults. Everything is overridable by env so nothing has to be edited here.
// ---------------------------------------------------------------------------

const KEY_ID = process.env.ASC_KEY_ID || '3836475HH2';
const KEY_PATH = process.env.ASC_KEY_PATH || join(REPO_ROOT, '.asc-key.p8');
const ISSUER_PATH = process.env.ASC_ISSUER_PATH || join(REPO_ROOT, '.asc-issuer-id');
const BUNDLE_ID = process.env.ASC_BUNDLE_ID || 'com.nikhilsinha.bundles';
const APP_NAME = process.env.ASC_APP_NAME || 'Bundles';
const PRIMARY_LOCALE = process.env.ASC_PRIMARY_LOCALE || 'en-US';
const SKU = process.env.ASC_SKU || 'BUNDLES0001';

// Beta App Review contact + demo account. The demo account is a seeded throwaway
// (see CHANGELOG "Seeded test accounts"); external review WILL be rejected without it
// because the app is behind a login wall.
const REVIEW = {
  contactEmail: process.env.ASC_CONTACT_EMAIL || 'namnik100@gmail.com',
  contactFirstName: process.env.ASC_CONTACT_FIRST_NAME || 'Nikhil',
  contactLastName: process.env.ASC_CONTACT_LAST_NAME || 'Sinha',
  contactPhone: process.env.ASC_CONTACT_PHONE || '',
  demoAccountName: process.env.ASC_DEMO_ACCOUNT || 'alex@dory.app',
  demoAccountPassword: process.env.ASC_DEMO_PASSWORD || 'dorytest123',
  demoAccountRequired: true,
  notes:
    process.env.ASC_REVIEW_NOTES ||
    [
      'Bundles is a two-person app: you and your partner share a home-screen widget.',
      '',
      'Sign in with the demo account above (email + password, no email confirmation needed).',
      'It is already paired with a second seeded account, so the widget has content.',
      '',
      'To see the main feature: after signing in, add the "Bundles" widget to the home',
      'screen (long-press home screen -> + -> search "Bundles"). Sending a photo, a',
      'drawing, or connecting Spotify from the app updates that widget.',
      '',
      'Camera permission is used only for sending a photo to your partner.',
      'Spotify is optional and requires a Spotify account; skip it to review the rest.',
    ].join('\n'),
};

const BETA_DESCRIPTION =
  process.env.ASC_BETA_DESCRIPTION ||
  [
    'Bundles puts a little window into your partner\'s day on your home screen:',
    'a photo, a drawing, or whatever they are listening to right now.',
    '',
    'Pair with one person, send them something, and it shows up on their widget.',
  ].join('\n');

const WHATS_NEW =
  process.env.ASC_WHATS_NEW ||
  [
    'First TestFlight build.',
    '',
    'Please check: pairing with a partner, sending a photo and a drawing,',
    'and that the home-screen widget updates within a minute or two.',
    'Add the widget from the home screen (long-press -> + -> "Bundles").',
  ].join('\n');

const API = 'https://api.appstoreconnect.apple.com';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** An error we have already explained to the user; main() prints .message and exits 1. */
class AscError extends Error {}

function die(message) {
  throw new AscError(message);
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

function assertIssuerShape(issuer, source) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuer)) {
    die(
      `${source} does not look like an issuer id: ${JSON.stringify(issuer)}\n` +
        `Expected a UUID, e.g. 57246542-96fe-1a63-e053-0824d011072a.\n` +
        `The usual mix-up is passing the *Key ID* (${KEY_ID}) as the issuer. They are\n` +
        `different things: the key id names one key, the issuer id names the whole team.\n` +
        `Apple answers that mistake with a bare 401, which reads like a broken key.`
    );
  }
  return issuer;
}

function readIssuerId() {
  if (process.env.ASC_ISSUER_ID) {
    return assertIssuerShape(process.env.ASC_ISSUER_ID.trim(), 'ASC_ISSUER_ID');
  }
  if (!existsSync(ISSUER_PATH)) {
    die(
      `No issuer id.\n` +
        `  Looked for: ${ISSUER_PATH}\n` +
        `  and the env var ASC_ISSUER_ID.\n\n` +
        `The issuer id is a UUID shared by every key on the team. Get it from\n` +
        `App Store Connect -> Users and Access -> Integrations -> App Store Connect API.\n` +
        `It is printed once at the top of the page as "Issuer ID".\n\n` +
        `Then:  printf %s '<uuid>' > ${ISSUER_PATH}`
    );
  }
  const issuer = readFileSync(ISSUER_PATH, 'utf8').trim();
  if (!issuer) die(`${ISSUER_PATH} is empty. It should contain just the issuer UUID.`);
  return assertIssuerShape(issuer, ISSUER_PATH);
}

function loadPrivateKey() {
  if (!existsSync(KEY_PATH)) {
    die(
      `No App Store Connect private key at ${KEY_PATH}.\n` +
        `It downloads exactly once, from Users and Access -> Integrations -> App Store Connect API.\n` +
        `If it is lost, revoke the key and generate a new one (then update ASC_KEY_ID).`
    );
  }
  const pem = readFileSync(KEY_PATH, 'utf8');
  try {
    return createPrivateKey(pem);
  } catch (err) {
    die(
      `${KEY_PATH} is not a private key Node can read (${err.message}).\n` +
        `Expected a PKCS#8 EC P-256 key: a file beginning "-----BEGIN PRIVATE KEY-----".\n` +
        `Check it was not mangled by a copy/paste (it must keep its newlines).`
    );
  }
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * Mint an ES256 JWT for App Store Connect.
 * Apple rejects any token whose exp is more than 20 minutes past iat; 15 leaves headroom
 * for a slow clock. `scope` is optional for team keys, so it is omitted.
 */
function mintToken() {
  const issuer = readIssuerId();
  const key = loadPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const payload = { iss: issuer, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  // JWS wants the raw r||s pair, not the ASN.1 DER sequence node emits by default.
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

let cachedToken = null;
function token() {
  if (!cachedToken) cachedToken = mintToken();
  return cachedToken;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function explainStatus(status, errors) {
  const codes = errors.map((e) => e.code || '').join(' ');
  switch (status) {
    case 401:
      return (
        `401 UNAUTHORIZED — App Store Connect rejected the token itself.\n` +
        `This is never a permissions problem; the request never got as far as your account.\n` +
        `In order of likelihood:\n` +
        `  1. The issuer id is wrong. It is a UUID, team-wide, NOT the key id (${KEY_ID}).\n` +
        `     Currently reading it from: ${process.env.ASC_ISSUER_ID ? 'env ASC_ISSUER_ID' : ISSUER_PATH}\n` +
        `  2. The key id does not match the .p8. The file downloads as AuthKey_<KEYID>.p8 —\n` +
        `     the KEYID in that original filename is the one to use.\n` +
        `  3. The key was revoked in Users and Access -> Integrations.\n` +
        `  4. This Mac's clock is off by minutes. Check: date -u`
      );
    case 403:
      return (
        `403 FORBIDDEN — the token was accepted; the account is not allowed to do this.\n` +
        `Re-minting the token will not help. Usual causes:\n` +
        `  - The API key's role is too low. This key is App Manager, which cannot accept\n` +
        `    agreements or manage users — only the Account Holder can.\n` +
        `  - The resource does not support the operation at all. Apple returns\n` +
        `    FORBIDDEN_ERROR "The resource 'x' does not allow 'CREATE'" for this; it is a\n` +
        `    permanent API limitation, not something to retry (see 'create-app').\n` +
        `  - An unsigned agreement. Agreements, Tax, and Banking must show "Active" before\n` +
        `    TestFlight and app records work.`
      );
    case 404:
      return (
        `404 NOT_FOUND — that id or path does not exist for this team.\n` +
        `If you expected an app here, the app record may not have been created yet:\n` +
        `  node scripts/asc.mjs apps`
      );
    case 409:
      return (
        `409 CONFLICT — the request was valid and authorized but fights the current state.\n` +
        `This is the most informative App Store Connect error: the "detail" above is usually\n` +
        `literally the fix. Common ones here:\n` +
        `  - creating something that already exists (a beta group, a tester, a bundle id)\n` +
        `  - submitting a build that is still PROCESSING, or that has no export-compliance answer\n` +
        `  - beta review submission missing required fields (demo account, contact info,\n` +
        `    beta app description, or "what to test" on the build)` +
        (codes.includes('ENTITY_ERROR')
          ? `\n  The ENTITY_ERROR code means a specific field was rejected — see "source" above.`
          : '')
      );
    case 422:
      return `422 UNPROCESSABLE — the JSON shape was right but a value was not acceptable. See "source" above for which field.`;
    case 429:
      return `429 TOO MANY REQUESTS — App Store Connect rate limit. Wait a minute and retry; do not tighten a poll loop.`;
    default:
      if (status >= 500) {
        return `${status} — App Store Connect is failing on its side. Retry in a few minutes; check https://developer.apple.com/system-status/`;
      }
      return `${status} — unexpected status.`;
  }
}

async function request(method, path, body) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  // Minted outside the try: a missing issuer id or an unreadable key is a configuration
  // error with its own explanation, and wrapping it in "Network error" buries the real
  // message under a misleading one.
  const bearer = token();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    die(`Network error calling ${method} ${url}: ${err.message}\nNo request reached Apple; nothing changed.`);
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* Apple occasionally returns an HTML error page; fall through to the raw body. */
    }
  }

  if (!res.ok) {
    const errors = json?.errors ?? [];
    const rendered = errors.length
      ? errors
          .map((e) => {
            const where = e.source?.pointer || e.source?.parameter;
            return `  [${e.status || res.status}/${e.code || '?'}] ${e.title || ''}\n` +
              `      ${e.detail || '(no detail)'}` +
              (where ? `\n      source: ${where}` : '');
          })
          .join('\n')
      : `  (no errors array; raw body: ${text.slice(0, 500) || '<empty>'})`;
    die(`${method} ${url} failed.\n\n${rendered}\n\n${explainStatus(res.status, errors)}`);
  }

  return json;
}

/** GET, following `links.next` so callers never silently see only the first page. */
async function getAll(path) {
  const items = [];
  let included = [];
  let next = path;
  while (next) {
    const page = await request('GET', next);
    if (Array.isArray(page?.data)) items.push(...page.data);
    else if (page?.data) items.push(page.data);
    if (Array.isArray(page?.included)) included = included.concat(page.included);
    next = page?.links?.next ?? null;
  }
  return { items, included };
}

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

async function findApp({ required = true } = {}) {
  const { items } = await getAll(
    `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&fields[apps]=name,bundleId,sku,primaryLocale&limit=200`
  );
  // filter[bundleId] is a prefix-ish match on some Apple builds, so confirm exactly.
  const app = items.find((a) => a.attributes?.bundleId === BUNDLE_ID);
  if (!app && required) {
    die(
      `No app record for ${BUNDLE_ID} on this team.\n` +
        (items.length
          ? `Apps that did come back for that filter: ${items.map((a) => a.attributes?.bundleId).join(', ')}\n`
          : '') +
        `Create it first:  node scripts/asc.mjs create-app`
    );
  }
  return app ?? null;
}

async function findBuild(app, version) {
  const { items } = await getAll(
    `/v1/builds?filter[app]=${app.id}&filter[version]=${encodeURIComponent(version)}` +
      `&fields[builds]=version,uploadedDate,processingState,expired,usesNonExemptEncryption,minOsVersion` +
      `&include=preReleaseVersion&limit=200`
  );
  const build = items.find((b) => b.attributes?.version === version);
  if (!build) {
    die(
      `No build with CFBundleVersion "${version}" for ${BUNDLE_ID}.\n` +
        `Note this is the *build number* (CFBundleVersion), not the marketing version.\n` +
        `A just-uploaded build takes a minute or two to appear at all. See what is there:\n` +
        `  node scripts/asc.mjs builds`
    );
  }
  return build;
}

async function findGroup(app, name) {
  const { items } = await getAll(
    `/v1/betaGroups?filter[app]=${app.id}&fields[betaGroups]=name,isInternalGroup,publicLinkEnabled,hasAccessToAllBuilds&limit=200`
  );
  const group = items.find((g) => g.attributes?.name === name);
  if (!group) {
    die(
      `No beta group named "${name}".\n` +
        `Groups that exist: ${items.map((g) => `"${g.attributes?.name}"`).join(', ') || '(none)'}\n` +
        `Create it:  node scripts/asc.mjs create-group --name "${name}" --internal`
    );
  }
  return group;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[arg.slice(2)] = argv[++i];
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const commands = {};

commands.check = {
  summary: 'Verify the key, issuer id, and team access actually work.',
  async run() {
    // /v1/apps is the cheapest authenticated read that also proves team scope.
    const { items } = await getAll('/v1/apps?fields[apps]=name,bundleId&limit=200');
    console.log(`Auth OK. Key ${KEY_ID} reached App Store Connect and can see ${items.length} app(s).`);
    const mine = items.find((a) => a.attributes?.bundleId === BUNDLE_ID);
    console.log(
      mine
        ? `App record for ${BUNDLE_ID} exists (id ${mine.id}, "${mine.attributes.name}").`
        : `No app record for ${BUNDLE_ID} yet — run: node scripts/asc.mjs create-app`
    );
  },
};

commands.apps = {
  summary: 'List every app record on the team.',
  async run() {
    const { items } = await getAll(
      '/v1/apps?fields[apps]=name,bundleId,sku,primaryLocale&limit=200'
    );
    if (!items.length) {
      console.log('No app records on this team at all.');
      console.log('If that is a surprise, the API key may belong to a different team.');
      return;
    }
    for (const a of items) {
      const at = a.attributes ?? {};
      const mark = at.bundleId === BUNDLE_ID ? ' <- this project' : '';
      console.log(`${a.id}  ${at.bundleId}  "${at.name}"  sku=${at.sku}  locale=${at.primaryLocale}${mark}`);
    }
    if (!items.some((a) => a.attributes?.bundleId === BUNDLE_ID)) {
      console.log(`\nNothing for ${BUNDLE_ID}. Create it:  node scripts/asc.mjs create-app`);
    }
  },
};

commands['create-app'] = {
  summary: 'Register the bundle id, then create the app record (see the caveat it prints).',
  async run({ flags }) {
    const name = flags.name || APP_NAME;
    const sku = flags.sku || SKU;
    const locale = flags.locale || PRIMARY_LOCALE;

    const existing = await findApp({ required: false });
    if (existing) {
      console.log(
        `App record already exists: id ${existing.id}, "${existing.attributes.name}" (${BUNDLE_ID}). Nothing to do.`
      );
      return;
    }

    // The bundle id must exist in the developer portal first. This part IS creatable
    // over the API, unlike the app record.
    const { items: bundleIds } = await getAll(
      `/v1/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}&limit=200`
    );
    if (bundleIds.some((b) => b.attributes?.identifier === BUNDLE_ID)) {
      console.log(`Bundle id ${BUNDLE_ID} is already registered in the developer portal.`);
    } else {
      console.log(`Registering bundle id ${BUNDLE_ID} in the developer portal...`);
      await request('POST', '/v1/bundleIds', {
        data: {
          type: 'bundleIds',
          attributes: { identifier: BUNDLE_ID, name, platform: 'IOS' },
        },
      });
      console.log('Registered.');
    }

    console.log(`Attempting to create the app record for ${BUNDLE_ID}...`);
    try {
      const created = await request('POST', '/v1/apps', {
        data: {
          type: 'apps',
          attributes: { bundleId: BUNDLE_ID, name, primaryLocale: locale, sku },
        },
      });
      console.log(`Created app record id ${created?.data?.id}.`);
    } catch (err) {
      if (!(err instanceof AscError)) throw err;
      console.error(err.message);
      console.error(
        '\n' +
          '-----------------------------------------------------------------------\n' +
          'If that failed with FORBIDDEN_ERROR "The resource \'apps\' does not allow\n' +
          "'CREATE'\", it is not a misconfiguration and not a permissions problem you\n" +
          'can fix: the App Store Connect API has never supported creating an app\n' +
          'record. Allowed operations on /v1/apps are GET_COLLECTION, GET_INSTANCE,\n' +
          'UPDATE. The record has to be created once, by hand, in the web UI:\n' +
          '\n' +
          '  https://appstoreconnect.apple.com/apps  ->  +  ->  New App\n' +
          '\n' +
          `    Platforms:      iOS\n` +
          `    Name:           ${name}          (must be globally unique on the App Store)\n` +
          `    Primary Language: ${locale}\n` +
          `    Bundle ID:      ${BUNDLE_ID}   (appears in the menu only once the bundle id\n` +
          `                    above is registered — which this command just did)\n` +
          `    SKU:            ${sku}          (private; any stable string)\n` +
          `    User Access:    Full Access\n` +
          '\n' +
          'That is a one-time step. Everything after it in this script is automated.\n' +
          'Then re-run:  node scripts/asc.mjs apps\n' +
          '-----------------------------------------------------------------------'
      );
      process.exitCode = 1;
    }
  },
};

commands.builds = {
  summary: 'List recent builds and their processing state.',
  async run({ flags }) {
    const app = await findApp();
    const limit = Number(flags.limit || 20);
    const page = await request(
      'GET',
      `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=${limit}` +
        `&fields[builds]=version,uploadedDate,processingState,expired,usesNonExemptEncryption` +
        `&include=preReleaseVersion&fields[preReleaseVersions]=version`
    );
    const builds = page?.data ?? [];
    if (!builds.length) {
      console.log(`No builds uploaded for ${BUNDLE_ID} yet.`);
      console.log('Upload one with:  ./scripts/release-testflight.sh');
      return;
    }
    const versions = new Map(
      (page.included ?? [])
        .filter((i) => i.type === 'preReleaseVersions')
        .map((i) => [i.id, i.attributes?.version])
    );
    for (const b of builds) {
      const at = b.attributes ?? {};
      const marketing = versions.get(b.relationships?.preReleaseVersion?.data?.id) ?? '?';
      const compliance =
        at.usesNonExemptEncryption === null || at.usesNonExemptEncryption === undefined
          ? ' MISSING-COMPLIANCE'
          : '';
      console.log(
        `${marketing} (${at.version})  ${at.processingState}${at.expired ? ' EXPIRED' : ''}${compliance}  ${at.uploadedDate}  id=${b.id}`
      );
    }
  },
};

commands['next-build-number'] = {
  summary: 'Print one more than the highest build number App Store Connect has seen.',
  async run() {
    const app = await findApp();
    const { items } = await getAll(
      `/v1/builds?filter[app]=${app.id}&fields[builds]=version&limit=200`
    );
    // App Store Connect rejects a re-used CFBundleVersion outright, and it does so at the
    // very end of an upload. Asking it what it already has is far cheaper than finding out.
    const highest = items.reduce((max, b) => {
      const n = Number.parseInt(b.attributes?.version ?? '', 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    // Bare number on stdout: this is meant to be captured by release-testflight.sh.
    console.log(String(highest + 1));
  },
};

commands['build-status'] = {
  summary: 'Poll one build by CFBundleVersion and explain the state it is in.',
  usage: 'build-status <build-number>',
  async run({ positional }) {
    const version = positional[0];
    if (!version) die('Usage: node scripts/asc.mjs build-status <build-number>');
    const app = await findApp();
    const build = await findBuild(app, version);
    const at = build.attributes ?? {};
    console.log(`Build ${version} (id ${build.id})`);
    console.log(`  uploaded:        ${at.uploadedDate}`);
    console.log(`  processingState: ${at.processingState}`);
    console.log(`  expired:         ${at.expired}`);
    console.log(`  usesNonExemptEncryption: ${JSON.stringify(at.usesNonExemptEncryption)}`);
    console.log('');

    switch (at.processingState) {
      case 'PROCESSING':
        console.log('Still processing. Normal; typically 5-30 minutes, occasionally hours.');
        console.log('Nothing to do but wait — re-run this command.');
        break;
      case 'VALID':
        console.log('Processed and installable. Internal testers can get it right now.');
        break;
      case 'FAILED':
        console.log('Processing FAILED. Apple emails the reason to the account holder; the');
        console.log('same text is on the build page in App Store Connect -> TestFlight.');
        console.log('Common causes: a missing/invalid marketing icon, an unsupported');
        console.log('architecture, or an entitlement the provisioning profile does not carry.');
        console.log('This needs a new build with a *higher* build number — you cannot reupload.');
        break;
      case 'INVALID':
        console.log('Marked INVALID: the binary was rejected after upload. Same remedy as FAILED —');
        console.log('read the email, fix, bump the build number, re-upload.');
        break;
      default:
        console.log(`Unrecognised state ${at.processingState}.`);
    }

    if (at.usesNonExemptEncryption === null || at.usesNonExemptEncryption === undefined) {
      console.log('');
      console.log('EXPORT COMPLIANCE IS UNANSWERED for this build. TestFlight will show');
      console.log('"Missing Compliance" and refuse to distribute it to anyone.');
      console.log('The cause is ITSAppUsesNonExemptEncryption missing from the built Info.plist —');
      console.log('check app.json ios.infoPlist and that the archive was made after that change.');
      console.log('To unblock this specific build without rebuilding:');
      console.log(`  node scripts/asc.mjs set-compliance ${version}`);
    }
  },
};

commands['set-compliance'] = {
  summary: 'Answer export compliance (false) for a build whose Info.plist key was missing.',
  usage: 'set-compliance <build-number>',
  async run({ positional }) {
    const version = positional[0];
    if (!version) die('Usage: node scripts/asc.mjs set-compliance <build-number>');
    const app = await findApp();
    const build = await findBuild(app, version);
    await request('PATCH', `/v1/builds/${build.id}`, {
      data: { type: 'builds', id: build.id, attributes: { usesNonExemptEncryption: false } },
    });
    console.log(`Build ${version}: usesNonExemptEncryption set to false.`);
    console.log('This is a per-build patch. Fix ITSAppUsesNonExemptEncryption in app.json so');
    console.log('the next build does not need it.');
  },
};

commands.groups = {
  summary: 'List beta groups, internal and external.',
  async run() {
    const app = await findApp();
    const { items } = await getAll(
      `/v1/betaGroups?filter[app]=${app.id}&fields[betaGroups]=name,isInternalGroup,publicLinkEnabled,hasAccessToAllBuilds&limit=200`
    );
    if (!items.length) {
      console.log('No beta groups. Create one:  node scripts/asc.mjs create-group --name "Internal" --internal');
      return;
    }
    for (const g of items) {
      const at = g.attributes ?? {};
      console.log(
        `${g.id}  "${at.name}"  ${at.isInternalGroup ? 'INTERNAL (no review, instant)' : 'EXTERNAL (needs Beta App Review)'}` +
          `  allBuilds=${at.hasAccessToAllBuilds}  publicLink=${at.publicLinkEnabled}`
      );
    }
  },
};

commands['create-group'] = {
  summary: 'Create a beta group. --internal for team members, --external for everyone else.',
  usage: 'create-group --name <name> [--internal | --external]',
  async run({ flags }) {
    const name = flags.name;
    if (!name) die('Usage: node scripts/asc.mjs create-group --name <name> [--internal|--external]');
    if (!flags.internal && !flags.external) {
      die(
        'Say which kind of group this is: --internal or --external.\n' +
          '  --internal: members must already be App Store Connect users on the team.\n' +
          '              No Beta App Review, builds available the moment processing finishes.\n' +
          '  --external: any email address, up to 10,000. Requires Beta App Review (1-2 days)\n' +
          '              and demo credentials via `test-info`.'
      );
    }
    const app = await findApp();
    const isInternal = Boolean(flags.internal);
    const created = await request('POST', '/v1/betaGroups', {
      data: {
        type: 'betaGroups',
        attributes: {
          name,
          isInternalGroup: isInternal,
          // Internal groups auto-receive every processed build; that is the whole point.
          hasAccessToAllBuilds: isInternal,
        },
        relationships: { app: { data: { type: 'apps', id: app.id } } },
      },
    });
    console.log(`Created ${isInternal ? 'internal' : 'external'} group "${name}" (id ${created?.data?.id}).`);
  },
};

commands['add-tester'] = {
  summary: 'Invite a tester by email into a group (creates the tester if new).',
  usage: 'add-tester <email> <group-name>',
  async run({ positional }) {
    const [email, groupName] = positional;
    if (!email || !groupName) {
      die('Usage: node scripts/asc.mjs add-tester <email> <group-name>');
    }
    const app = await findApp();
    const group = await findGroup(app, groupName);

    const { items: existing } = await getAll(
      `/v1/betaTesters?filter[email]=${encodeURIComponent(email)}&fields[betaTesters]=email,firstName,lastName&limit=200`
    );
    const already = existing.find(
      (t) => (t.attributes?.email || '').toLowerCase() === email.toLowerCase()
    );

    if (already) {
      // The tester exists on the team already; just attach them to this group.
      await request('POST', `/v1/betaGroups/${group.id}/relationships/betaTesters`, {
        data: [{ type: 'betaTesters', id: already.id }],
      });
      console.log(`Existing tester ${email} added to "${groupName}".`);
    } else {
      await request('POST', '/v1/betaTesters', {
        data: {
          type: 'betaTesters',
          attributes: { email },
          relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } },
        },
      });
      console.log(`Invited ${email} to "${groupName}".`);
    }

    if (group.attributes?.isInternalGroup) {
      console.log(
        'Internal group: this only works if that email is already an App Store Connect user\n' +
          'on the team (Users and Access). If it is not, the call above 409s or the tester\n' +
          'never receives anything — add them as a user first, then re-run.'
      );
    }
    console.log('The tester gets an email; they need the TestFlight app to accept it.');
  },
};

commands['test-info'] = {
  summary: 'Set beta description, feedback email, and the Beta App Review demo account.',
  usage: 'test-info [--build <build-number>]',
  async run({ flags }) {
    const app = await findApp();

    // 1. Beta App Review detail — where the demo account lives. Its id is the app id,
    //    but read it through the relationship rather than assuming that.
    const detail = await request('GET', `/v1/apps/${app.id}/betaAppReviewDetail`);
    const detailId = detail?.data?.id;
    if (!detailId) {
      die(
        `App ${app.id} has no betaAppReviewDetail. That resource is created by Apple alongside\n` +
          `the app record, so its absence usually means the app record is brand new — wait a\n` +
          `minute and retry.`
      );
    }
    await request('PATCH', `/v1/betaAppReviewDetails/${detailId}`, {
      data: {
        type: 'betaAppReviewDetails',
        id: detailId,
        attributes: {
          contactEmail: REVIEW.contactEmail,
          contactFirstName: REVIEW.contactFirstName,
          contactLastName: REVIEW.contactLastName,
          ...(REVIEW.contactPhone ? { contactPhone: REVIEW.contactPhone } : {}),
          demoAccountName: REVIEW.demoAccountName,
          demoAccountPassword: REVIEW.demoAccountPassword,
          demoAccountRequired: REVIEW.demoAccountRequired,
          notes: REVIEW.notes,
        },
      },
    });
    console.log(`Beta App Review detail updated (demo account ${REVIEW.demoAccountName}, required=true).`);

    // 2. Beta app localization — the TestFlight description + feedback email.
    //    External testing is blocked without a description.
    const { items: locs } = await getAll(
      `/v1/apps/${app.id}/betaAppLocalizations?fields[betaAppLocalizations]=locale,description,feedbackEmail&limit=200`
    );
    const loc = locs.find((l) => l.attributes?.locale === PRIMARY_LOCALE);
    const attributes = {
      description: BETA_DESCRIPTION,
      feedbackEmail: REVIEW.contactEmail,
    };
    if (loc) {
      await request('PATCH', `/v1/betaAppLocalizations/${loc.id}`, {
        data: { type: 'betaAppLocalizations', id: loc.id, attributes },
      });
      console.log(`Beta app localization (${PRIMARY_LOCALE}) updated.`);
    } else {
      await request('POST', '/v1/betaAppLocalizations', {
        data: {
          type: 'betaAppLocalizations',
          attributes: { ...attributes, locale: PRIMARY_LOCALE },
          relationships: { app: { data: { type: 'apps', id: app.id } } },
        },
      });
      console.log(`Beta app localization (${PRIMARY_LOCALE}) created.`);
    }

    // 3. "What to Test" is per build, not per app. Only settable once a build exists.
    if (flags.build) {
      const build = await findBuild(app, String(flags.build));
      const { items: buildLocs } = await getAll(
        `/v1/builds/${build.id}/betaBuildLocalizations?fields[betaBuildLocalizations]=locale,whatsNew&limit=200`
      );
      const buildLoc = buildLocs.find((l) => l.attributes?.locale === PRIMARY_LOCALE);
      if (buildLoc) {
        await request('PATCH', `/v1/betaBuildLocalizations/${buildLoc.id}`, {
          data: { type: 'betaBuildLocalizations', id: buildLoc.id, attributes: { whatsNew: WHATS_NEW } },
        });
        console.log(`"What to Test" updated on build ${flags.build}.`);
      } else {
        await request('POST', '/v1/betaBuildLocalizations', {
          data: {
            type: 'betaBuildLocalizations',
            attributes: { locale: PRIMARY_LOCALE, whatsNew: WHATS_NEW },
            relationships: { build: { data: { type: 'builds', id: build.id } } },
          },
        });
        console.log(`"What to Test" set on build ${flags.build}.`);
      }
    } else {
      console.log('No --build given, so "What to Test" (per build) was not set.');
      console.log('Beta App Review needs it. Re-run with:  test-info --build <build-number>');
    }
  },
};

commands['submit-review'] = {
  summary: 'Submit a build for Beta App Review (external testing only).',
  usage: 'submit-review <build-number>',
  async run({ positional }) {
    const version = positional[0];
    if (!version) die('Usage: node scripts/asc.mjs submit-review <build-number>');
    const app = await findApp();
    const build = await findBuild(app, version);
    const at = build.attributes ?? {};

    // Pre-flight. Every one of these produces a 409 that is hard to read after the fact.
    if (at.processingState !== 'VALID') {
      die(
        `Build ${version} is ${at.processingState}, not VALID. Beta App Review can only be\n` +
          `submitted for a fully processed build. Poll first:\n` +
          `  node scripts/asc.mjs build-status ${version}`
      );
    }
    if (at.usesNonExemptEncryption === null || at.usesNonExemptEncryption === undefined) {
      die(
        `Build ${version} has no export-compliance answer, which blocks submission.\n` +
          `  node scripts/asc.mjs set-compliance ${version}`
      );
    }
    const { items: buildLocs } = await getAll(
      `/v1/builds/${build.id}/betaBuildLocalizations?fields[betaBuildLocalizations]=locale,whatsNew&limit=200`
    );
    if (!buildLocs.some((l) => l.attributes?.whatsNew)) {
      die(
        `Build ${version} has no "What to Test" text, which Beta App Review requires.\n` +
          `  node scripts/asc.mjs test-info --build ${version}`
      );
    }

    await request('POST', '/v1/betaAppReviewSubmissions', {
      data: {
        type: 'betaAppReviewSubmissions',
        relationships: { build: { data: { type: 'builds', id: build.id } } },
      },
    });
    console.log(`Build ${version} submitted for Beta App Review.`);
    console.log('Turnaround is usually 1-2 days. Internal testers are unaffected and already');
    console.log('have this build. Watch for the result by email, or:');
    console.log('  node scripts/asc.mjs review-status ' + version);
  },
};

commands['review-status'] = {
  summary: 'Show the Beta App Review state of a build.',
  usage: 'review-status <build-number>',
  async run({ positional }) {
    const version = positional[0];
    if (!version) die('Usage: node scripts/asc.mjs review-status <build-number>');
    const app = await findApp();
    const build = await findBuild(app, version);
    const res = await request('GET', `/v1/builds/${build.id}/betaAppReviewSubmission`);
    const state = res?.data?.attributes?.betaReviewState;
    if (!state) {
      console.log(`Build ${version} has never been submitted for Beta App Review.`);
      console.log('Only external testing needs it. Internal testers can install it already.');
      return;
    }
    console.log(`Build ${version}: betaReviewState = ${state}`);
    const notes = {
      WAITING_FOR_REVIEW: 'Queued. Nothing to do.',
      IN_REVIEW: 'A reviewer has it now. This is when a missing demo account bites.',
      REJECTED: 'Rejected. The reason is in App Store Connect -> TestFlight and by email. Fix, then re-submit (a new build is not always required).',
      APPROVED: 'Approved. External groups can install it, and future builds of the same marketing version usually skip review.',
    };
    if (notes[state]) console.log(`  ${notes[state]}`);
  },
};

commands.help = {
  summary: 'Show this help.',
  async run() {
    console.log('App Store Connect client for Bundles.\n');
    console.log('  node scripts/asc.mjs <command> [args]\n');
    for (const [name, cmd] of Object.entries(commands)) {
      console.log(`  ${(cmd.usage || name).padEnd(34)} ${cmd.summary}`);
    }
    console.log('\nCredentials:');
    console.log(`  key id     ${KEY_ID}                (env ASC_KEY_ID)`);
    console.log(`  key file   ${KEY_PATH}   (env ASC_KEY_PATH)`);
    console.log(`  issuer id  ${ISSUER_PATH}  (env ASC_ISSUER_ID)`);
    console.log(`  bundle id  ${BUNDLE_ID}     (env ASC_BUNDLE_ID)`);
  },
};

// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const name = argv[0];
  if (!name || name === '--help' || name === '-h') {
    await commands.help.run({ flags: {}, positional: [] });
    return;
  }
  const cmd = commands[name];
  if (!cmd) {
    console.error(`Unknown command "${name}".\n`);
    await commands.help.run({ flags: {}, positional: [] });
    process.exitCode = 1;
    return;
  }
  await cmd.run(parseFlags(argv.slice(1)));
}

main().catch((err) => {
  if (err instanceof AscError) {
    console.error(`\n${err.message}\n`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
