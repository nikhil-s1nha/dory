-- pgTAP test for Milestone 1: pairing RLS + atomic redemption.
--
-- Run with the Supabase CLI:  supabase test db
-- (requires Docker; the local stack applies supabase/migrations first).
--
-- Encodes the M1 acceptance criteria:
--   * a non-partner cannot read a couple's rows (the RLS check the spec calls out)
--   * the two members CAN read their couple
--   * redemption is single-use: the third user to arrive is rejected

begin;
select plan(7);

-- --- Fixtures: three users in auth.users; the profile trigger fills public.profiles ---
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

-- Helper: assume the identity of a given user for subsequent statements, so auth.uid()
-- and RLS evaluate as that user (mirrors how Supabase sets the JWT claim per request).
create or replace function tests.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function tests.act_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;

-- --- A opens a couple and an invite ---
select tests.act_as('00000000-0000-0000-0000-00000000000a');

insert into public.couples (id, member_a)
  values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000000a');

insert into public.invites (code, couple_id, created_by, expires_at)
  values ('TESTCODE', '00000000-0000-0000-0000-0000000c0001',
          '00000000-0000-0000-0000-00000000000a', now() + interval '1 hour');

-- A can see their own couple.
select is(
  (select count(*)::int from public.couples where id = '00000000-0000-0000-0000-0000000c0001'),
  1, 'member A can read their couple'
);

-- --- B redeems successfully ---
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select is(public.redeem_invite('TESTCODE'), 'OK', 'B redeems the invite');

-- B can now see the couple; both profiles are linked.
select is(
  (select count(*)::int from public.couples where id = '00000000-0000-0000-0000-0000000c0001'),
  1, 'member B can read the couple after redeeming'
);

-- --- The core RLS assertion: C is not a member and sees nothing ---
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select is(
  (select count(*)::int from public.couples where id = '00000000-0000-0000-0000-0000000c0001'),
  0, 'non-partner C cannot read the couple row'
);

-- C also cannot read either partner's profile.
select is(
  (select count(*)::int from public.profiles
     where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  0, 'non-partner C cannot read the partners'' profiles'
);

-- --- Redemption is single-use: C arriving third is rejected ---
select is(public.redeem_invite('TESTCODE'), 'ALREADY_REDEEMED',
  'third user C is rejected — invite already redeemed');

-- A brand-new invite for a full couple would still reject C via COUPLE_FULL; verify the
-- redeemer-already-paired path too by having B (now paired) try another code.
select tests.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.invites (code, couple_id, created_by, expires_at)
  values ('SECONDCD', '00000000-0000-0000-0000-0000000c0001',
          '00000000-0000-0000-0000-00000000000a', now() + interval '1 hour');
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select is(public.redeem_invite('SECONDCD'), 'REDEEMER_ALREADY_PAIRED',
  'an already-paired user cannot redeem another invite');

select finish();
rollback;
