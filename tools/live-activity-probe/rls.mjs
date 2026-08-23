// Owner-only RLS on the Live Activity tables, checked from outside the database.
//
//   node tools/live-activity-probe/rls.mjs
//
// This is NOT a substitute for `supabase/tests/verify_live_activity_rls_cloud.sql`, which switches
// Postgres roles and also exercises the device-handover trigger; that one needs the Management API
// and a working personal access token. What it does cover is the property that matters most for a
// leak — a *partner* must see, change and delete nothing — measured through PostgREST as the two
// real seeded accounts, which is exactly the path the app uses.
//
// Every row it touches is synthetic and owned by Sam, so a passing run cannot damage the real
// registered token and a FAILING run cannot either.

import { signIn, rest, ANON_KEY, SUPABASE_URL } from './lib.mjs';

const TOKEN = 'r'.repeat(64);
const ACTIVITY = 'probe-rls-instance';

const sam = await signIn('sam');
const alex = await signIn('alex');

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
};

// --- fixtures, owned by Sam ------------------------------------------------------------------
await rest(sam, `live_activity_tokens?token=eq.${TOKEN}`, { method: 'DELETE' });
await rest(sam, `live_activity_instances?activity_id=eq.${ACTIVITY}`, { method: 'DELETE' });
const mk1 = await rest(sam, 'live_activity_tokens', {
  method: 'POST',
  body: JSON.stringify({ token: TOKEN, user_id: sam.userId, environment: 'sandbox' }),
  headers: { Prefer: 'return=representation' },
});
const mk2 = await rest(sam, 'live_activity_instances', {
  method: 'POST',
  body: JSON.stringify({ activity_id: ACTIVITY, user_id: sam.userId, update_token: 'rls-probe-token' }),
  headers: { Prefer: 'return=representation' },
});
console.log('fixtures ->', mk1.status, mk2.status, '\n');

// --- owner sees their own --------------------------------------------------------------------
const ownTokens = await rest(sam, `live_activity_tokens?select=token&token=eq.${TOKEN}`);
check('owner reads their own push-to-start row', ownTokens.body.length === 1, `${ownTokens.status} ${ownTokens.body.length} row(s)`);
const ownInst = await rest(sam, `live_activity_instances?select=activity_id&activity_id=eq.${ACTIVITY}`);
check('owner reads their own instance row', ownInst.body.length === 1, `${ownInst.status} ${ownInst.body.length} row(s)`);

// --- partner sees nothing --------------------------------------------------------------------
const partnerTokens = await rest(alex, 'live_activity_tokens?select=token,user_id');
check('partner reads no push-to-start rows at all', Array.isArray(partnerTokens.body) && partnerTokens.body.length === 0, `${partnerTokens.status} ${JSON.stringify(partnerTokens.body)}`);
const partnerInst = await rest(alex, 'live_activity_instances?select=activity_id,user_id');
check('partner reads no instance rows at all', Array.isArray(partnerInst.body) && partnerInst.body.length === 0, `${partnerInst.status} ${JSON.stringify(partnerInst.body)}`);

// --- partner cannot write --------------------------------------------------------------------
const stealToken = await rest(alex, `live_activity_tokens?token=eq.${TOKEN}`, {
  method: 'PATCH',
  body: JSON.stringify({ environment: 'production' }),
  headers: { Prefer: 'return=representation' },
});
const afterPatch = await rest(sam, `live_activity_tokens?select=environment&token=eq.${TOKEN}`);
check("partner cannot update the owner's token row", afterPatch.body[0]?.environment === 'sandbox', `PATCH ${stealToken.status} ${JSON.stringify(stealToken.body)}; row still ${JSON.stringify(afterPatch.body)}`);

const delToken = await rest(alex, `live_activity_tokens?token=eq.${TOKEN}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
const afterDel = await rest(sam, `live_activity_tokens?select=token&token=eq.${TOKEN}`);
check("partner cannot delete the owner's token row", afterDel.body.length === 1, `DELETE ${delToken.status} ${JSON.stringify(delToken.body)}; ${afterDel.body.length} row(s) remain`);

const delInst = await rest(alex, `live_activity_instances?activity_id=eq.${ACTIVITY}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
const afterDelInst = await rest(sam, `live_activity_instances?select=activity_id&activity_id=eq.${ACTIVITY}`);
check("partner cannot delete the owner's instance row", afterDelInst.body.length === 1, `DELETE ${delInst.status} ${JSON.stringify(delInst.body)}; ${afterDelInst.body.length} row(s) remain`);

// --- WITH CHECK: nobody may register a row on someone else's behalf ---------------------------
const impersonate = await rest(alex, 'live_activity_tokens', {
  method: 'POST',
  body: JSON.stringify({ token: 'i'.repeat(64), user_id: sam.userId, environment: 'sandbox' }),
});
check('partner cannot insert a token owned by the other user', impersonate.status === 403 || impersonate.status === 401, `${impersonate.status} ${JSON.stringify(impersonate.body)}`);

const impersonateInst = await rest(alex, 'live_activity_instances', {
  method: 'POST',
  body: JSON.stringify({ activity_id: 'probe-rls-impersonate', user_id: sam.userId, update_token: 'x' }),
});
check('partner cannot insert an instance owned by the other user', impersonateInst.status === 403 || impersonateInst.status === 401, `${impersonateInst.status} ${JSON.stringify(impersonateInst.body)}`);

// --- anonymous sees nothing -------------------------------------------------------------------
for (const table of ['live_activity_tokens', 'live_activity_instances']) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: { apikey: ANON_KEY } });
  const body = await res.text();
  check(`anonymous reads nothing from ${table}`, body === '[]' || res.status >= 400, `${res.status} ${body.slice(0, 120)}`);
}

// --- cleanup ------------------------------------------------------------------------------------
await rest(sam, `live_activity_tokens?token=eq.${TOKEN}`, { method: 'DELETE' });
await rest(sam, `live_activity_instances?activity_id=eq.${ACTIVITY}`, { method: 'DELETE' });
await rest(sam, `live_activity_tokens?token=eq.${'i'.repeat(64)}`, { method: 'DELETE' });

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;
