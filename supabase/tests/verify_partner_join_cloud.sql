-- Verifies the two backend halves of "if one partner pairs, both get sent through", plus the
-- shortened invite code. Runnable as ONE script via the Supabase Management API (no pgTAP, no
-- local stack). Setup runs as postgres, assertions run as the `authenticated` role with per-user
-- JWT claims, so RLS is exercised exactly as the app hits it. On success it raises the sentinel
-- 'BUNDLES_RLS_OK', which aborts the DO block and rolls every test row back.
--
-- What it pins down:
--   1. public.couples is in the supabase_realtime publication — without it the pairing screen's
--      postgres_changes subscription is accepted and then never fires (migration 0011).
--   2. The *inviting* partner A can read couples.member_b for their own couple, before and after
--      redemption. This is the read isCoupleComplete() polls; if RLS hid it, A could never learn
--      that B had joined and the screen could not flip.
--   3. A 6-character code (the new CODE_LENGTH) redeems.
--   4. An 8-character code minted before the shortening still redeems — nothing in the schema or
--      the redeem function constrains code length, and it must stay that way.
--   5. A stranger still sees nothing, before or after pairing.
do $$
declare
  a1  uuid := gen_random_uuid();  -- inviter, new 6-char code
  b1  uuid := gen_random_uuid();  -- redeemer of the 6-char code
  a2  uuid := gen_random_uuid();  -- inviter, legacy 8-char code
  b2  uuid := gen_random_uuid();  -- redeemer of the legacy code
  c   uuid := gen_random_uuid();  -- unrelated third user
  cp1 uuid := gen_random_uuid();
  cp2 uuid := gen_random_uuid();
  vis  int;
  mb   uuid;
  res  text;
begin
  -- --- 1. the publication, checked before anything else: it is a server config, not test data ---
  select count(*) into vis
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couples';
  if vis <> 1 then
    raise exception 'FAIL: public.couples is not in the supabase_realtime publication';
  end if;

  -- --- setup as postgres (bypasses insert policies; we are testing SELECT RLS + redemption) ---
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         u.id || '@bundles.test', '', now(), now(), now()
  from (values (a1), (b1), (a2), (b2), (c)) as u(id);
  -- handle_new_user has now created a public.profiles row for each.

  insert into public.couples (id, member_a) values (cp1, a1), (cp2, a2);
  insert into public.invites (code, couple_id, created_by, expires_at) values
    ('K7RQ2M',   cp1, a1, now() + interval '1 hour'),   -- 6 symbols: the length we mint today
    ('BNDSTEST', cp2, a2, now() + interval '1 hour');   -- 8 symbols: minted before CODE_LENGTH dropped

  set role authenticated;

  -- --- 2a. inviter A1 sees their own couple with the slot still open ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  select count(*) into vis from public.couples where id = cp1;
  if vis <> 1 then raise exception 'FAIL: inviter A1 saw % couple row(s), wanted 1', vis; end if;
  select member_b into mb from public.couples where id = cp1;
  if mb is not null then raise exception 'FAIL: member_b already set before redemption'; end if;

  -- --- 3. B1 redeems the 6-character code ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  select public.redeem_invite('K7RQ2M') into res;
  if res <> 'OK' then raise exception 'FAIL: 6-char redeem returned %', res; end if;

  -- --- 2b. THE fix: A1 can now read the filled slot. This is what isCoupleComplete() polls. ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  select member_b into mb from public.couples where id = cp1;
  if mb is distinct from b1 then
    raise exception 'FAIL: inviter A1 read member_b = %, wanted %', mb, b1;
  end if;
  -- ...and A1's own profile now carries the couple, which is what the root gate reads.
  select count(*) into vis from public.profiles where id = a1 and couple_id = cp1;
  if vis <> 1 then raise exception 'FAIL: inviter A1 profile was not linked to the couple'; end if;

  -- --- 4. a legacy 8-character code still redeems; length is the lookup's business, not a rule ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', b2, 'role', 'authenticated')::text, true);
  select public.redeem_invite('BNDSTEST') into res;
  if res <> 'OK' then raise exception 'FAIL: legacy 8-char redeem returned %', res; end if;

  -- --- 5. a stranger sees neither couple, paired or not ---
  perform set_config('request.jwt.claims',
    json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into vis from public.couples where id in (cp1, cp2);
  if vis <> 0 then raise exception 'FAIL: stranger C could read % couple row(s)', vis; end if;

  reset role;
  -- All assertions held. Abort to roll back every test row.
  raise exception 'BUNDLES_RLS_OK';
end $$;
