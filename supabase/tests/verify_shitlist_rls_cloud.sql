-- Self-contained RLS check for the shared Shitlist (Milestone 2). Runnable as one script via the
-- Management API or psql. Verifies both partners see the couple's items while a non-member sees
-- none and cannot insert. Raises the sentinel 'BUNDLES_SHITLIST_RLS_OK' on success (rolls back).
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b1';
  c uuid := '00000000-0000-0000-0000-0000000000c1';
  cpl uuid := '00000000-0000-0000-0000-00000c000021';
  vis int;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', a,'authenticated','authenticated','a1@bundles.test','',now(),now(),now()),
         ('00000000-0000-0000-0000-000000000000', b,'authenticated','authenticated','b1@bundles.test','',now(),now(),now()),
         ('00000000-0000-0000-0000-000000000000', c,'authenticated','authenticated','c1@bundles.test','',now(),now(),now());
  insert into public.couples (id, member_a, member_b) values (cpl, a, b);
  update public.profiles set couple_id = cpl where id in (a,b);

  -- A (member) adds an item and sees it.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  set role authenticated;
  insert into public.shitlist_items (couple_id, text, created_by) values (cpl, 'take out the trash', a);
  select count(*) into vis from public.shitlist_items where couple_id = cpl;
  if vis <> 1 then raise exception 'FAIL: member A sees % items, want 1', vis; end if;

  -- B (partner) sees the shared item.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  select count(*) into vis from public.shitlist_items where couple_id = cpl;
  if vis <> 1 then raise exception 'FAIL: partner B sees % items, want 1', vis; end if;

  -- C (non-member) sees nothing and cannot insert into the couple's list.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role','authenticated')::text, true);
  select count(*) into vis from public.shitlist_items where couple_id = cpl;
  if vis <> 0 then raise exception 'FAIL: non-member C sees % items, want 0', vis; end if;
  begin
    insert into public.shitlist_items (couple_id, text, created_by) values (cpl, 'sneaky', c);
    raise exception 'FAIL: non-member C was allowed to insert';
  exception when insufficient_privilege or check_violation then null;
  end;

  reset role;
  raise exception 'BUNDLES_SHITLIST_RLS_OK';
end $$;
