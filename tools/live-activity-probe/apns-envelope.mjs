// What does APNs actually validate in a Live Activity envelope?
//
// Runs the contract's exact `start` payload against the REAL registered push-to-start token, then a
// set of single-field mutations, recording Apple's exact status and body for each. Read-only with
// respect to the database: it never registers, updates or deletes a row, so the device lane's token
// survives untouched.
//
//   node tools/live-activity-probe/apns-envelope.mjs
//
// Everything that comes back 200 here is only "APNs did not object" — ActivityKit decodes the body
// on the device, and a push APNs accepts can still be dropped silently. Say so in any report.

import { signIn, rest, apnsJwt, postApns, teamId, APNS_KEYS } from './lib.mjs';

const sam = await signIn('sam');
const tokens = await rest(sam, 'live_activity_tokens?select=token,environment&order=updated_at.desc');
const row = tokens.body?.[0];
if (!row) throw new Error('no push-to-start token registered');
if (row.environment !== 'sandbox') throw new Error(`expected a sandbox token, got ${row.environment}`);
const deviceToken = row.token;
console.log(`real push-to-start token …${deviceToken.slice(-6)} (${deviceToken.length} chars), environment ${row.environment}\n`);

const jwt = apnsJwt({ ...APNS_KEYS.sandbox, teamId: teamId() });
const timestamp = Math.floor(Date.now() / 1000);

const props = (extra = '') => JSON.stringify({
  kind: 'photo',
  title: `Alex sent you a photo${extra}`,
  subtitle: '',
  imageFile: null,
  deepLink: 'bundles://media/00000000-0000-4000-8000-000000000000',
  sentAt: Date.now(),
});

/** Byte-for-byte the shape docs/live-activity-contract.md specifies. */
const contractStart = {
  aps: {
    timestamp,
    event: 'start',
    'content-state': { name: 'BundlesActivity', props: props() },
    'attributes-type': 'LiveActivityAttributes',
    attributes: {},
    alert: { title: 'Alex', body: 'sent you a photo' },
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

const cases = [];

cases.push(['contract envelope, exactly as specified', contractStart]);

{ const p = clone(contractStart); delete p.aps.attributes; cases.push(['attributes OMITTED', p]); }
{ const p = clone(contractStart); p.aps['content-state'].props = JSON.parse(props()); cases.push(['props as a nested OBJECT, not a string', p]); }
{ const p = clone(contractStart); p.aps['attributes-type'] = 'BundlesActivity'; cases.push(['attributes-type = BundlesActivity (the wrong guess)', p]); }
{ const p = clone(contractStart); delete p.aps.alert; cases.push(['alert OMITTED', p]); }
{ const p = clone(contractStart); p.aps['content-state'].props = props(' ' + 'x'.repeat(4200)); cases.push(['props over the 4 KB content-state ceiling', p]); }

for (const [label, payload] of cases) {
  const body = JSON.stringify(payload);
  const res = await postApns({ host: 'sandbox', jwt, deviceToken, payload: body });
  console.log(`### ${label}`);
  console.log(`    payload ${res.bytes} bytes; content-state.props ${JSON.stringify(payload.aps['content-state']?.props ?? null).length - 2} chars`);
  console.log(`    HTTP ${res.status}  apns-id ${res.apnsId}  body ${res.body || '(empty)'}\n`);
}

// The controls that give the 200s above their meaning: which headers does APNs actually check?
console.log('--- header controls (same body, one header changed) ---\n');
const headerCases = [
  ['apns-topic = the plain bundle id', { topic: 'com.nikhilsinha.bundles' }],
  ['apns-push-type = alert', { pushType: 'alert' }],
];
for (const [label, overrides] of headerCases) {
  const res = await postApns({ host: 'sandbox', jwt, deviceToken, payload: JSON.stringify(contractStart), ...overrides });
  console.log(`### ${label}`);
  console.log(`    HTTP ${res.status}  apns-id ${res.apnsId}  body ${res.body || '(empty)'}\n`);
}

// Where does APNs stop accepting a payload? ActivityKit's ceiling is 4 KB; if APNs enforced it, an
// oversized content state would be a loud failure instead of a silent one on the device.
console.log('--- payload size ladder ---\n');
for (const pad of [3000, 4200, 5000, 6000, 8000]) {
  const p = clone(contractStart);
  p.aps['content-state'].props = props(' ' + 'x'.repeat(pad));
  const res = await postApns({ host: 'sandbox', jwt, deviceToken, payload: JSON.stringify(p) });
  console.log(`### payload ${res.bytes} bytes -> HTTP ${res.status} ${res.body || '(empty)'}`);
}
