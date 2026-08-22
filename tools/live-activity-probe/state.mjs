// Read the Live Activity tables as each seeded test user, through PostgREST — i.e. under exactly the
// RLS the app runs under. Prints only token *tails*, never a whole device token.
//
//   node tools/live-activity-probe/state.mjs

import { signIn, rest } from './lib.mjs';

const tail = (t) => (typeof t === 'string' ? `…${t.slice(-6)} (${t.length} chars)` : String(t));

for (const who of ['sam', 'alex']) {
  const session = await signIn(who);
  console.log(`\n=== ${who} (${session.email}) user_id=${session.userId} ===`);

  const tokens = await rest(session, 'live_activity_tokens?select=token,user_id,environment,created_at,updated_at');
  console.log('live_activity_tokens ->', tokens.status);
  for (const row of Array.isArray(tokens.body) ? tokens.body : [tokens.body]) {
    if (row && row.token) console.log('  ', tail(row.token), row.environment, 'user', row.user_id, 'updated', row.updated_at);
    else console.log('  ', JSON.stringify(row));
  }

  const inst = await rest(session, 'live_activity_instances?select=activity_id,user_id,update_token,media_id,started_at,ended_at');
  console.log('live_activity_instances ->', inst.status);
  for (const row of Array.isArray(inst.body) ? inst.body : [inst.body]) {
    if (row && row.activity_id) {
      console.log('  ', row.activity_id, 'update_token', row.update_token ? tail(row.update_token) : null,
        'media', row.media_id, 'ended', row.ended_at, 'user', row.user_id);
    } else console.log('  ', JSON.stringify(row));
  }

  const couples = await rest(session, 'couples?select=id,member_a,member_b');
  console.log('couples ->', couples.status, JSON.stringify(couples.body));

  const media = await rest(session, `media_items?select=id,type,sender_id,created_at&sender_id=eq.${session.userId}&order=created_at.desc&limit=3`);
  console.log('own media_items ->', media.status, JSON.stringify(media.body));

  const profile = await rest(session, `profiles?select=id,display_name&id=eq.${session.userId}`);
  console.log('profile ->', profile.status, JSON.stringify(profile.body));
}
