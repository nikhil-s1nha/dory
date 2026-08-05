-- Self-contained RLS check for push_tokens (Milestone 3/4 push dispatch). Runnable as one script
-- via the Management API or psql. Verifies a user owns only their own device rows, that a *partner*
-- cannot read them (the Edge Function uses the service role, so partners need no access at all), and
-- that the claim trigger hands a device over when a second account signs in on the same phone.
-- Raises the sentinel 'BUNDLES_PUSH_RLS_OK' on success (rolls back).
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  cpl uuid := gen_random_uuid();
  -- One physical phone, handed from A to B; C is a different device entirely.
  shared_device text := 'apns-token-shared-' || gen_random_uuid();
  other_device text := 'apns-token-other-' || gen_random_uuid();
  vis int;
  owner_id uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', a,'authenticated','authenticated','a3@bundles.test','',now(),now(),now()),
         ('00000000-0000-0000-0000-000000000000', b,'authenticated','authenticated','b3@bundles.test','',now(),now(),now()),
         ('00000000-0000-0000-0000-000000000000', c,'authenticated','authenticated','c3@bundles.test','',now(),now(),now());
  insert into public.couples (id, member_a, member_b) values (cpl, a, b);
  update public.profiles set couple_id = cpl where id in (a,b);

  -- A registers this phone.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  set role authenticated;
  insert into public.push_tokens (device_token, user_id) values (shared_device, a);

  select count(*) into vis from public.push_tokens where user_id = a;
  if vis <> 1 then raise exception 'FAIL: A sees % of their own rows', vis; end if;

  -- A cannot register a token *as* someone else, even their own partner.
  begin
    insert into public.push_tokens (device_token, user_id) values (other_device, b);
    raise exception 'FAIL: A inserted a token owned by B';
  exception when insufficient_privilege then null;
  end;

  -- B is A's PARTNER and still sees nothing: notifications are dispatched by the service role, so
  -- there is no reason for either half of a couple to read the other's device tokens.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  select count(*) into vis from public.push_tokens where user_id = a;
  if vis <> 0 then raise exception 'FAIL: partner B sees % of A''s token rows', vis; end if;

  -- ...and cannot delete them either (an unprivileged delete matches no rows rather than erroring).
  delete from public.push_tokens where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  select count(*) into vis from public.push_tokens where user_id = a;
  if vis <> 1 then raise exception 'FAIL: partner B deleted A''s token row'; end if;

  -- Device handover: B signs in on the same phone. The BEFORE INSERT trigger drops A's row, which
  -- RLS alone could never let B do — without it B would inherit A's notifications on that device.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  insert into public.push_tokens (device_token, user_id) values (shared_device, b);

  reset role;
  select count(*) into vis from public.push_tokens where device_token = shared_device;
  if vis <> 1 then raise exception 'FAIL: % rows hold the same device token', vis; end if;
  select user_id into owner_id from public.push_tokens where device_token = shared_device;
  if owner_id <> b then raise exception 'FAIL: handover left the device owned by the previous user'; end if;

  raise exception 'BUNDLES_PUSH_RLS_OK';
end $$;
