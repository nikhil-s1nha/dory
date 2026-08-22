// Cross-matched APNs probes: every (key, gateway) combination we can sign, against a SYNTHETIC
// device token, recording Apple's exact status and response body.
//
// A synthetic token is enough because APNs rejects an environment-mismatched *provider key* before
// it ever looks at the device token — that ordering is itself one of the things this probe records.
// Nothing here can touch the real registered token, and nothing here deletes a database row.
//
//   node tools/live-activity-probe/apns-cross-env.mjs

import { apnsJwt, postApns, teamId, APNS_KEYS } from './lib.mjs';

// 64 hex chars, the shape of a device token, deliberately not anybody's.
const SYNTHETIC = 'a'.repeat(64);

const KEYS = APNS_KEYS;

const payload = JSON.stringify({
  aps: {
    timestamp: Math.floor(Date.now() / 1000),
    event: 'start',
    'content-state': { name: 'BundlesActivity', props: JSON.stringify({ kind: 'photo', title: 'Probe', subtitle: '', imageFile: null, deepLink: 'bundles://media/probe', sentAt: Date.now() }) },
    'attributes-type': 'LiveActivityAttributes',
    attributes: {},
    alert: { title: 'Probe', body: 'probe' },
  },
});

for (const keyEnv of ['sandbox', 'production']) {
  const key = KEYS[keyEnv];
  if (!key.keyId) {
    console.log(`\n### key=${keyEnv}: SKIPPED — key id unknown (set APNS_KEY_ID)`);
    continue;
  }
  const jwt = apnsJwt({ p8Path: key.p8Path, keyId: key.keyId, teamId: teamId() });
  for (const host of ['sandbox', 'production']) {
    const res = await postApns({ host, jwt, deviceToken: SYNTHETIC, payload });
    console.log(`\n### key=${keyEnv} kid=${key.keyId} gateway=${host}`);
    console.log(`    POST ${res.url}  (${res.bytes} byte payload)`);
    console.log(`    HTTP ${res.status}  apns-id ${res.apnsId}`);
    console.log(`    body ${res.body || '(empty)'}`);
  }
}
