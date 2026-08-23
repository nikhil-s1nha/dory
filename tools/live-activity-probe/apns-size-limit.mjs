// Bisect the exact byte at which APNs starts refusing a `liveactivity` payload.
//
// This matters because ActivityKit's own content-state ceiling is 4 KB. Anything APNs accepts above
// that is delivered to the device and dropped there with nothing logged — the silent-failure window.
//
//   node tools/live-activity-probe/apns-size-limit.mjs

import { signIn, rest, apnsJwt, postApns, teamId, APNS_KEYS } from './lib.mjs';

const sam = await signIn('sam');
const { body } = await rest(sam, 'live_activity_tokens?select=token&order=updated_at.desc');
const deviceToken = body[0].token;
const jwt = apnsJwt({ ...APNS_KEYS.sandbox, teamId: teamId() });

/** Build a payload of exactly `target` bytes by padding the props string. */
function payloadOfSize(target) {
  const build = (pad) => JSON.stringify({
    aps: {
      timestamp: Math.floor(Date.now() / 1000),
      event: 'start',
      'content-state': { name: 'BundlesActivity', props: JSON.stringify({ kind: 'photo', title: 'A'.repeat(pad), subtitle: '', imageFile: null, deepLink: 'bundles://media/x', sentAt: 1 }) },
      'attributes-type': 'LiveActivityAttributes',
      attributes: {},
      alert: { title: 'A', body: 'b' },
    },
  });
  let pad = target - build(0).length;
  let out = build(pad);
  while (out.length > target && pad > 0) out = build(--pad);
  while (out.length < target) out = build(++pad);
  return out;
}

let lo = 4000; // known-accepted
let hi = 5401; // known-rejected
while (hi - lo > 1) {
  const mid = Math.floor((lo + hi) / 2);
  const payload = payloadOfSize(mid);
  const res = await postApns({ host: 'sandbox', jwt, deviceToken, payload });
  console.log(`${res.bytes} bytes -> HTTP ${res.status} ${res.body || '(empty)'}`);
  if (res.status === 200) lo = res.bytes; else hi = res.bytes;
}
console.log(`\nlargest accepted: ${lo} bytes; smallest refused: ${hi} bytes`);
