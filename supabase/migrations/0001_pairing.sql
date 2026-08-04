-- Migration 0001: accounts + partner pairing (Milestone 1)
--
-- Data model: a `couple` links exactly TWO users. One partner creates an `invite`
-- (opening a couple with themselves in member_a and member_b NULL); the other redeems
-- the code to fill member_b. Every invariant enforced here is mirrored in pure TS at
-- src/domain/pairing for instant client-side feedback — Postgres is the source of truth.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A pairing of exactly two people. "Exactly two" is structural: two columns, no more.
create table public.couples (
  id         uuid primary key default gen_random_uuid(),
  member_a   uuid not null references auth.users (id) on delete cascade,
  member_b   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- A couple can't pair someone with themselves.
  constraint couples_distinct_members check (member_b is null or member_a <> member_b)
);

-- Each user is in at most one couple. Enforced by the app flow + the redeem function;
-- these partial unique indexes make "a user appears in at most one couple" a hard
-- database invariant across whichever slot they occupy.
create unique index couples_unique_member_a on public.couples (member_a);
create unique index couples_unique_member_b on public.couples (member_b)
  where member_b is not null;

-- Public-facing profile, one row per auth user, created on signup by a trigger.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  couple_id    uuid references public.couples (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Single-use, expiring invite codes. code is the shareable secret and the primary key.
create table public.invites (
  code        text primary key,
  couple_id   uuid not null references public.couples (id) on delete cascade,
  created_by  uuid not null references auth.users (id) on delete cascade,
  expires_at  timestamptz not null,
  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index invites_couple_id_idx on public.invites (couple_id);

-- ---------------------------------------------------------------------------
-- Profile auto-creation on signup
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper: the set of user ids that share a couple with the caller (incl. self)
-- ---------------------------------------------------------------------------

-- Used by RLS to answer "can I see this partner's row?" without recursive policy
-- evaluation. SECURITY DEFINER so it reads couples regardless of the caller's own
-- policies; STABLE so the planner can cache it within a statement.
create function public.couple_member_ids(for_user uuid)
returns setof uuid
language sql
stable
security definer set search_path = public
as $$
  select c.member_a from public.couples c
    where c.member_a = for_user or c.member_b = for_user
  union
  select c.member_b from public.couples c
    where (c.member_a = for_user or c.member_b = for_user) and c.member_b is not null;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.couples  enable row level security;
alter table public.invites  enable row level security;

-- Profiles: you can read your own profile and your partner's, and update only your own.
create policy profiles_select_self_or_partner on public.profiles
  for select using (id in (select public.couple_member_ids(auth.uid())) or id = auth.uid());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Couples: visible only to the two members. Inserts must place the caller in member_a
-- (you can only open a couple for yourself). Updates (filling member_b) go exclusively
-- through the redeem_invite function, so no general UPDATE policy is granted.
create policy couples_select_members on public.couples
  for select using (auth.uid() = member_a or auth.uid() = member_b);

create policy couples_insert_self_as_a on public.couples
  for insert with check (auth.uid() = member_a and member_b is null);

-- Invites: the creator can see and manage their own invites. Redemption does NOT need a
-- broad SELECT policy — the redeem_invite function (SECURITY DEFINER) performs the lookup,
-- so a redeemer never reads the invites table directly (codes stay unguessable + private).
create policy invites_select_creator on public.invites
  for select using (auth.uid() = created_by);

create policy invites_insert_creator on public.invites
  for insert with check (auth.uid() = created_by);

create policy invites_delete_creator on public.invites
  for delete using (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- Atomic redemption (authoritative mirror of src/domain/pairing/redemption.ts)
-- ---------------------------------------------------------------------------

-- Runs as SECURITY DEFINER inside a single statement/transaction. Locks the invite row
-- (FOR UPDATE) so two people racing on the last open slot are serialised — exactly one
-- wins, the other gets 'ALREADY_REDEEMED'. Check ORDER matches the TS mirror so the same
-- situation yields the same error code on both client and server.
create function public.redeem_invite(invite_code text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_invite  public.invites%rowtype;
  v_couple  public.couples%rowtype;
  v_paired  boolean;
begin
  if v_uid is null then
    return 'NOT_AUTHENTICATED';
  end if;

  select * into v_invite from public.invites where code = invite_code for update;
  if not found then
    return 'CODE_NOT_FOUND';
  end if;

  if now() >= v_invite.expires_at then
    return 'EXPIRED';
  end if;
  if v_invite.redeemed_by is not null then
    return 'ALREADY_REDEEMED';
  end if;
  if v_invite.created_by = v_uid then
    return 'SELF_REDEMPTION';
  end if;

  select (couple_id is not null) into v_paired from public.profiles where id = v_uid;
  if v_paired then
    return 'REDEEMER_ALREADY_PAIRED';
  end if;

  select * into v_couple from public.couples where id = v_invite.couple_id for update;
  if v_couple.member_b is not null then
    return 'COUPLE_FULL';
  end if;

  -- All checks passed: fill the slot, mark the invite, link both profiles.
  update public.couples set member_b = v_uid where id = v_couple.id;
  update public.invites
    set redeemed_by = v_uid, redeemed_at = now()
    where code = invite_code;
  update public.profiles set couple_id = v_couple.id
    where id in (v_couple.member_a, v_uid);

  return 'OK';
end;
$$;
