-- Self-contained RLS check for live_activity_tokens + live_activity_instances (0010, the Live
-- Activity push-to-start lane). Runnable as one script via the Management API or psql. Verifies that
-- an owner sees only their own rows, that a *partner* sees nothing at all (dispatch is service-role,
-- so a couple needs no visibility here — the same property 0008 gets right and every couple-scoped
-- table would get wrong), that an unrelated user sees nothing, and that the claim trigger hands a
-- device over — token *and* live activities — when a second account signs in on the same phone.
-- Raises the sentinel 'BUNDLES_ACTIVITY_RLS_OK' on success (rolls back).
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  cpl uuid := gen_random_uuid();
  -- One physical phone, handed from A to B; other_device is a second device of A's (an iPad),
  -- present to prove the handover does not close activities that were never on the shared phone.
  shared_device text := 'pts-shared-' || gen_random_uuid();
  other_device text := 'pts-other-' || gen_random_uuid();
  -- ActivityKit ids are client-generated strings, not uuids.
  act_phone text := 'activity-phone-' || gen_random_uuid();
  act_pad text := 'activity-pad-' || gen_random_uuid();
  vis int;
  owner_id uuid;
  ended timestamptz;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', a,'authenticated','authenticated','a-'||a||'@bundles.test','',now(),now(),now()),
         ('00000000-0000-0000-0000-000000000000', b,'authenticated','authenticated','b-'||b||'@bundles.test','',now(),now(),now()),
         ('00000000-0000-0000-0000-000000000000', c,'authenticated','authenticated','c-'||c||'@bundles.test','',now(),now(),now());
  -- A and B are partners. C is in no couple at all: the "stranger" case.
  insert into public.couples (id, member_a, member_b) values (cpl, a, b);
  update public.profiles set couple_id = cpl where id in (a,b);

  -- -------------------------------------------------------------------------
  -- Owner reads their own rows
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  set role authenticated;
  insert into public.live_activity_tokens (token, user_id, environment) values (shared_device, a, 'sandbox');
  insert into public.live_activity_instances (activity_id, user_id, update_token) values (act_phone, a, 'upd-'||act_phone);

  select count(*) into vis from public.live_activity_tokens where user_id = a;
  if vis <> 1 then raise exception 'FAIL: A sees % of their own token rows', vis; end if;
  select count(*) into vis from public.live_activity_instances where user_id = a;
  if vis <> 1 then raise exception 'FAIL: A sees % of their own instance rows', vis; end if;

  -- A cannot register a token or an activity *as* someone else, even their own partner.
  begin
    insert into public.live_activity_tokens (token, user_id) values (other_device, b);
    raise exception 'FAIL: A inserted a push-to-start token owned by B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.live_activity_instances (activity_id, user_id) values ('spoofed-'||act_phone, b);
    raise exception 'FAIL: A inserted an activity owned by B';
  exception when insufficient_privilege then null;
  end;

  -- -------------------------------------------------------------------------
  -- The PARTNER reads nothing
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  select count(*) into vis from public.live_activity_tokens where user_id = a;
  if vis <> 0 then raise exception 'FAIL: partner B sees % of A''s push-to-start rows', vis; end if;
  select count(*) into vis from public.live_activity_instances where user_id = a;
  if vis <> 0 then raise exception 'FAIL: partner B sees % of A''s activity rows', vis; end if;

  -- ...and cannot delete them either (an unprivileged delete matches no rows rather than erroring).
  delete from public.live_activity_tokens where user_id = a;
  delete from public.live_activity_instances where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  select count(*) into vis from public.live_activity_tokens where user_id = a;
  if vis <> 1 then raise exception 'FAIL: partner B deleted A''s push-to-start row'; end if;
  select count(*) into vis from public.live_activity_instances where user_id = a;
  if vis <> 1 then raise exception 'FAIL: partner B deleted A''s activity row'; end if;

  -- -------------------------------------------------------------------------
  -- A NON-MEMBER reads nothing
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role','authenticated')::text, true);
  select count(*) into vis from public.live_activity_tokens;
  if vis <> 0 then raise exception 'FAIL: unrelated user C sees % push-to-start rows', vis; end if;
  select count(*) into vis from public.live_activity_instances;
  if vis <> 0 then raise exception 'FAIL: unrelated user C sees % activity rows', vis; end if;

  -- -------------------------------------------------------------------------
  -- Device handover: B signs in on the phone A was using
  -- -------------------------------------------------------------------------
  -- First give A a second device with its own running activity. It must SURVIVE the handover — the
  -- iPad was never handed to anyone.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  insert into public.live_activity_tokens (token, user_id, environment) values (other_device, a, 'production');
  insert into public.live_activity_instances (activity_id, user_id, update_token) values (act_pad, a, 'upd-'||act_pad);

  -- B signs in on the shared phone. The BEFORE INSERT trigger drops A's row, which RLS alone could
  -- never let B do — without it B would inherit A's Live Activities on that device.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  insert into public.live_activity_tokens (token, user_id, environment) values (shared_device, b, 'sandbox');

  reset role;
  select count(*) into vis from public.live_activity_tokens where token = shared_device;
  if vis <> 1 then raise exception 'FAIL: % rows hold the same push-to-start token', vis; end if;
  select user_id into owner_id from public.live_activity_tokens where token = shared_device;
  if owner_id <> b then raise exception 'FAIL: handover left the device owned by the previous user'; end if;

  -- A still has the iPad registered, so nothing of A's is closed: the handover cannot prove the
  -- phone's activity was the one running.
  select ended_at into ended from public.live_activity_instances where activity_id = act_phone;
  if ended is not null then raise exception 'FAIL: handover ended an activity while A still had another device'; end if;

  -- Now A loses the iPad too (sign-out drops the row), and B signs in on the phone again — this time
  -- the handover is unambiguous, so every live activity of A's must be closed and de-addressed.
  delete from public.live_activity_tokens where token = other_device;
  delete from public.live_activity_tokens where token = shared_device;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  set role authenticated;
  insert into public.live_activity_tokens (token, user_id, environment) values (shared_device, a, 'sandbox');
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  insert into public.live_activity_tokens (token, user_id, environment) values (shared_device, b, 'sandbox');

  reset role;
  select count(*) into vis from public.live_activity_instances where user_id = a and ended_at is null;
  if vis <> 0 then raise exception 'FAIL: % of A''s activities are still live after a full handover', vis; end if;
  select count(*) into vis from public.live_activity_instances where user_id = a and update_token is not null;
  if vis <> 0 then raise exception 'FAIL: % of A''s ended activities are still addressable by push', vis; end if;

  raise exception 'BUNDLES_ACTIVITY_RLS_OK';
end $$;
