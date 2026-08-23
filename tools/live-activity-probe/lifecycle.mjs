// End-to-end exercise of notify-activity against the live cloud project, using only SYNTHETIC
// tokens for anything destructive.
//
//   node tools/live-activity-probe/lifecycle.mjs
//
// What it proves, and how:
//
//  * **Registration upsert** — register the same synthetic token twice with different environments
//    and show one row, not two, with the second value winning.
//  * **Production routing** — a synthetic token whose row says `production` must be signed with the
//    production key and posted to the production gateway. The distinguishing evidence is the
//    *reason*: a mismatched key/host pair returns 403 BadEnvironmentKeyInToken (which the function
//    counts as `failed`), while a correctly-paired production request with a bogus token returns
//    400 BadDeviceToken (which the function counts as `pruned`). So `pruned` — not `failed` — is
//    what shows the key and the host moved together.
//  * **Prune** — that same row must be gone afterwards, and the real one must survive.
//  * **update / end** — driven against a synthetic update token on a synthetic instance row.
//
// The real registered push-to-start token is read but never written and never deleted.

import { signIn, rest, callFunction } from './lib.mjs';

const SYNTH_TOKEN = 'b'.repeat(64);
const SYNTH_ACTIVITY = 'probe-activity-lifecycle';
const SYNTH_UPDATE_TOKEN = 'c'.repeat(64);

const tail = (t) => (typeof t === 'string' ? `…${t.slice(-6)}` : String(t));
const step = (n, s) => console.log(`\n──── ${n}. ${s}`);

const sam = await signIn('sam');
const alex = await signIn('alex');

async function samTokens() {
  const { body } = await rest(sam, 'live_activity_tokens?select=token,environment,created_at,updated_at&order=updated_at.desc');
  return body;
}
async function samInstances() {
  const { body } = await rest(sam, 'live_activity_instances?select=activity_id,update_token,media_id,started_at,ended_at');
  return body;
}
const show = (rows) => rows.map((r) => ({ ...r, token: r.token && tail(r.token), update_token: r.update_token && tail(r.update_token) }));

/** Exactly what src/domain/activity/repository.ts's `upsert(..., { onConflict })` sends. */
function upsert(session, table, rows, conflict) {
  return rest(session, `${table}?on_conflict=${conflict}`, {
    method: 'POST',
    body: JSON.stringify(rows),
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  });
}

// Clean up anything a previous run left behind (synthetic ids only).
await rest(sam, `live_activity_tokens?token=eq.${SYNTH_TOKEN}`, { method: 'DELETE' });
await rest(sam, `live_activity_instances?activity_id=eq.${SYNTH_ACTIVITY}`, { method: 'DELETE' });

step(0, 'baseline');
console.log('tokens   ', JSON.stringify(show(await samTokens())));
console.log('instances', JSON.stringify(show(await samInstances())));

step(1, 'registerPushToStartToken upsert — same token twice, environment flipped');
const first = await upsert(sam, 'live_activity_tokens', [{ token: SYNTH_TOKEN, user_id: sam.userId, environment: 'sandbox', updated_at: new Date().toISOString() }], 'token');
console.log('insert  ->', first.status, JSON.stringify(show(first.body)));
const second = await upsert(sam, 'live_activity_tokens', [{ token: SYNTH_TOKEN, user_id: sam.userId, environment: 'production', updated_at: new Date().toISOString() }], 'token');
console.log('re-upsert ->', second.status, JSON.stringify(show(second.body)));
const afterUpsert = await samTokens();
console.log('rows now ->', JSON.stringify(show(afterUpsert)));
console.log(`synthetic rows: ${afterUpsert.filter((r) => r.token === SYNTH_TOKEN).length} (expect 1, environment production)`);

step(2, 'notify-activity start — real sandbox token + synthetic production token');
const { body: media } = await rest(alex, `media_items?select=id,type&sender_id=eq.${alex.userId}&order=created_at.desc&limit=1`);
const mediaItemId = media[0].id;
console.log('media item', mediaItemId, media[0].type);
const startRes = await callFunction(alex, 'notify-activity', { mediaItemId, event: 'start' });
console.log('HTTP', startRes.status, startRes.body);

step(3, 'prune — the synthetic production row should be gone, the real one untouched');
const afterStart = await samTokens();
console.log('rows now ->', JSON.stringify(show(afterStart)));
console.log(`synthetic present: ${afterStart.some((r) => r.token === SYNTH_TOKEN)} (expect false)`);
console.log(`real rows: ${afterStart.filter((r) => r.token !== SYNTH_TOKEN).length}`);

step(4, 'registerActivityUpdateToken upsert — synthetic instance row');
const inst = await upsert(sam, 'live_activity_instances', [{ activity_id: SYNTH_ACTIVITY, user_id: sam.userId, update_token: SYNTH_UPDATE_TOKEN }], 'activity_id');
console.log('insert ->', inst.status, JSON.stringify(show(inst.body)));

step(5, 'notify-activity update');
const updateRes = await callFunction(alex, 'notify-activity', { mediaItemId, event: 'update' });
console.log('HTTP', updateRes.status, updateRes.body);
console.log('instances ->', JSON.stringify(show(await samInstances())));

step(6, 'notify-activity end — re-arming the same synthetic instance first');
await rest(sam, `live_activity_instances?activity_id=eq.${SYNTH_ACTIVITY}`, {
  method: 'PATCH',
  body: JSON.stringify({ update_token: SYNTH_UPDATE_TOKEN, ended_at: null }),
});
console.log('re-armed ->', JSON.stringify(show(await samInstances())));
const endRes = await callFunction(alex, 'notify-activity', { event: 'end' });
console.log('HTTP', endRes.status, endRes.body);
console.log('instances ->', JSON.stringify(show(await samInstances())));

step(7, 'automatic event choice — no `event` field, one live addressable instance');
await rest(sam, `live_activity_instances?activity_id=eq.${SYNTH_ACTIVITY}`, {
  method: 'PATCH',
  body: JSON.stringify({ update_token: SYNTH_UPDATE_TOKEN, ended_at: null }),
});
const autoRes = await callFunction(alex, 'notify-activity', { mediaItemId });
console.log('HTTP', autoRes.status, autoRes.body, '(expect event=update — a live row exists)');

step(8, 'cleanup — remove every synthetic row');
await rest(sam, `live_activity_tokens?token=eq.${SYNTH_TOKEN}`, { method: 'DELETE' });
await rest(sam, `live_activity_instances?activity_id=eq.${SYNTH_ACTIVITY}`, { method: 'DELETE' });
console.log('tokens   ', JSON.stringify(show(await samTokens())));
console.log('instances', JSON.stringify(show(await samInstances())));
