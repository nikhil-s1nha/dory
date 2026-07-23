-- Self-contained RLS check for media items + the private Storage bucket (Milestone 3). Runnable as
-- one script via the Management API or psql. Verifies a partner sees the couple's media rows AND
-- storage objects while a non-member sees neither and cannot write under the couple's path.
-- Raises the sentinel 'DORY_MEDIA_RLS_OK' on success (rolls back).
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a2';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  c uuid := '00000000-0000-0000-0000-0000000000c2';
  cpl uuid := '00000000-0000-0000-0000-00000c000032';
  mid uuid := gen_random_uuid();
  vis int;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', a,'authenticated','authenticated','a2@dory.test','',now(),now(),now()),
         ('00000000-0000-0000-0000-000000000000', b,'authenticated','authenticated','b2@dory.test','',now(),now(),now()),
         ('00000000-0000-0000-0000-000000000000', c,'authenticated','authenticated','c2@dory.test','',now(),now(),now());
  insert into public.couples (id, member_a, member_b) values (cpl, a, b);
  update public.profiles set couple_id = cpl where id in (a,b);

  -- A sends a photo: media row + storage object under '<couple>/...'.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  set role authenticated;
  insert into public.media_items (id, couple_id, sender_id, type, storage_path)
    values (mid, cpl, a, 'photo', cpl || '/' || mid || '.jpg');
  insert into storage.objects (bucket_id, name, owner) values ('media', cpl || '/' || mid || '.jpg', a);

  -- B (partner) sees both.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  select count(*) into vis from public.media_items where couple_id = cpl;
  if vis <> 1 then raise exception 'FAIL: partner B sees % media rows', vis; end if;
  select count(*) into vis from storage.objects where bucket_id='media' and name like cpl || '/%';
  if vis <> 1 then raise exception 'FAIL: partner B sees % objects', vis; end if;

  -- C (non-member) sees neither and cannot write under the couple path.
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role','authenticated')::text, true);
  select count(*) into vis from public.media_items where couple_id = cpl;
  if vis <> 0 then raise exception 'FAIL: non-member C sees % media rows', vis; end if;
  select count(*) into vis from storage.objects where bucket_id='media' and name like cpl || '/%';
  if vis <> 0 then raise exception 'FAIL: non-member C sees % objects', vis; end if;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('media', cpl || '/sneaky.jpg', c);
    raise exception 'FAIL: non-member C wrote an object under the couple path';
  exception when insufficient_privilege or check_violation then null;
  end;

  reset role;
  raise exception 'DORY_MEDIA_RLS_OK';
end $$;
