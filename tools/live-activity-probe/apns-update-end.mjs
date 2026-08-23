// The `update` and `end` envelopes, byte for byte as notify-activity emits them, put in front of
// real APNs.
//
//   node tools/live-activity-probe/apns-update-end.mjs
//
// There is no real *update* token to address (an update token only exists while an activity is live
// on the phone, and `live_activity_instances` is empty). So each envelope is sent twice:
//
//   * to the real push-to-start token — APNs validates the token and the topic, so a 200 here shows
//     the envelope itself is accepted for delivery. It is NOT a semantically valid update: an
//     `update` event addressed to a push-to-start token is not something ActivityKit will apply.
//   * to a synthetic token — the rejection the Edge Function's prune path actually sees.

import { signIn, rest, apnsJwt, postApns, teamId, APNS_KEYS } from './lib.mjs';

const sam = await signIn('sam');
const { body } = await rest(sam, 'live_activity_tokens?select=token&order=updated_at.desc');
const realToken = body[0].token;
const jwt = apnsJwt({ ...APNS_KEYS.sandbox, teamId: teamId() });

const timestamp = Math.floor(Date.now() / 1000);
const props = JSON.stringify({ kind: 'photo', title: 'Alex sent you a photo', subtitle: '', imageFile: null, deepLink: 'bundles://media/x', sentAt: Date.now() });

const envelopes = {
  update: JSON.stringify({ aps: { timestamp, event: 'update', 'content-state': { name: 'BundlesActivity', props } } }),
  end: JSON.stringify({ aps: { timestamp, event: 'end', 'dismissal-date': timestamp } }),
};

for (const [name, payload] of Object.entries(envelopes)) {
  console.log(`\n### ${name} envelope`);
  console.log(`    ${payload}`);
  for (const [label, deviceToken] of [['real push-to-start token', realToken], ['synthetic token', 'd'.repeat(64)]]) {
    const res = await postApns({ host: 'sandbox', jwt, deviceToken, payload });
    console.log(`    -> ${label} …${deviceToken.slice(-6)}: HTTP ${res.status} ${res.body || '(empty)'}  apns-id ${res.apnsId}`);
  }
}
