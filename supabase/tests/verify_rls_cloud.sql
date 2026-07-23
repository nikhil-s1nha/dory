-- Self-contained RLS + redemption verification, runnable as ONE script via the Supabase
-- Management API (no pgTAP, no local stack). Runs setup as postgres, then switches to the
-- authenticated role with per-user JWT claims to exercise RLS exactly as the app would.
-- On success it raises the sentinel 'DORY_RLS_OK', which aborts the DO block and rolls back
-- all test rows — so verification leaves the database untouched.
do $$
declare
  a   uuid := '00000000-0000-0000-0000-0000000000aa';
  b   uuid := '00000000-0000-0000-0000-0000000000bb';
  c   uuid := '00000000-0000-0000-0000-0000000000cc';
  cpl uuid := '00000000-0000-0000-0000-0000000c0001';
  vis int;
  res text;
begin
  -- --- setup as postgres (bypasses insert policies; we're testing SELECT RLS + redemption) ---
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated',
     'a@dory.test', '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated',
     'b@dory.test', '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', c, 'authenticated', 'authenticated',
     'c@dory.test', '', now(), now(), now());
  -- handle_new_user trigger has now created public.profiles for a, b, c.

  insert into public.couples (id, member_a) values (cpl, a);
  insert into public.invites (code, couple_id, created_by, expires_at)
    values ('DORYTST1', cpl, a, now() + interval '1 hour');

  -- --- as non-partner C: must see ZERO couple rows (the core RLS assertion) ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set role authenticated;
  select count(*) into vis from public.couples where id = cpl;
  if vis <> 0 then raise exception 'FAIL: non-partner C could read % couple row(s)', vis; end if;

  -- C also cannot read the partners' profiles.
  select count(*) into vis from public.profiles where id in (a, b);
  if vis <> 0 then raise exception 'FAIL: non-partner C could read % profile(s)', vis; end if;

  -- --- as member A: must see exactly their couple ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into vis from public.couples where id = cpl;
  if vis <> 1 then raise exception 'FAIL: member A saw % couple row(s), wanted 1', vis; end if;

  -- --- as B: redeem succeeds ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select public.redeem_invite('DORYTST1') into res;
  if res <> 'OK' then raise exception 'FAIL: B redeem returned %', res; end if;

  -- --- as non-partner C after pairing: still ZERO, and redeeming again is rejected ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into vis from public.couples where id = cpl;
  if vis <> 0 then raise exception 'FAIL: C could read the couple after pairing'; end if;

  select public.redeem_invite('DORYTST1') into res;
  if res <> 'ALREADY_REDEEMED' then
    raise exception 'FAIL: third-user redeem returned %, wanted ALREADY_REDEEMED', res;
  end if;

  reset role;
  -- All assertions held. Abort to roll back every test row.
  raise exception 'DORY_RLS_OK';
end $$;
