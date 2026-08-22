// Does the DEPLOYED notify-activity cap its content state? Ask it.
//
//   node tools/live-activity-probe/oversize-live.mjs
//
// The only user-controlled input on the server's content-state path is `profiles.display_name`, and
// the title is `${display_name} sent you a photo`. Set it long enough that the payload passes 5,120
// bytes — the measured APNs ceiling — and the answer is unambiguous from the response alone:
//
//   sent:1              -> the function capped the state before sending
//   failed:1            -> it did not; APNs refused the oversized payload with 413 PayloadTooLarge
//
// A 413 is never delivered, so this cannot put anything on the device, and 413 is not a dead-token
// reason, so it cannot prune the real registered token either. The display name is restored at the
// end, including if the run throws.

import { signIn, rest, callFunction } from './lib.mjs';

const alex = await signIn('alex');
const { body: before } = await rest(alex, `profiles?select=display_name&id=eq.${alex.userId}`);
const original = before[0].display_name;
console.log('display_name before:', JSON.stringify(original));

const setName = (name) =>
  rest(alex, `profiles?id=eq.${alex.userId}`, { method: 'PATCH', body: JSON.stringify({ display_name: name }) });

try {
  const long = 'x'.repeat(6000);
  console.log('setting display_name to 6000 x -> title would be ~6020 chars, payload ~6.2 KB');
  console.log('PATCH ->', (await setName(long)).status);

  const { body: media } = await rest(alex, `media_items?select=id,type&sender_id=eq.${alex.userId}&order=created_at.desc&limit=1`);
  const res = await callFunction(alex, 'notify-activity', { mediaItemId: media[0].id, event: 'start' });
  console.log('notify-activity ->', res.status, res.body);
  console.log(res.body.includes('"failed":1')
    ? 'VERDICT: the deployed function does NOT cap the content state (APNs refused it).'
    : res.body.includes('"sent":1')
      ? 'VERDICT: the deployed function capped the content state.'
      : 'VERDICT: inconclusive, read the response above.');
} finally {
  console.log('restoring ->', (await setName(original)).status);
  const { body: after } = await rest(alex, `profiles?select=display_name&id=eq.${alex.userId}`);
  console.log('display_name after:', JSON.stringify(after[0].display_name));
}
