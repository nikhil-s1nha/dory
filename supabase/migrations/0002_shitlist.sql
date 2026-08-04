-- Migration 0002: Shitlist — a shared checklist scoped to a couple (Milestone 2).
--
-- Both partners see and edit ONE list. Every item carries the couple_id; RLS lets a user touch
-- only rows belonging to the couple they're a member of. Realtime is enabled so an add/check on
-- one partner's phone shows up on the other's.

create table public.shitlist_items (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 500),
  is_checked boolean not null default false,
  created_by uuid not null references auth.users (id) on delete set null,
  -- Sort key: newest items sort to the top (Apple Notes adds at the top). Monotonic via clock.
  created_at timestamptz not null default now()
);

create index shitlist_items_couple_created_idx
  on public.shitlist_items (couple_id, created_at desc);

alter table public.shitlist_items enable row level security;

-- A member of the couple can do anything to that couple's items. couple_member_ids (from 0001)
-- resolves the caller's partner set; simpler here to check membership directly against couples.
create policy shitlist_select_members on public.shitlist_items
  for select using (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
  );

create policy shitlist_insert_members on public.shitlist_items
  for insert with check (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
    and created_by = auth.uid()
  );

create policy shitlist_update_members on public.shitlist_items
  for update using (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
  );

create policy shitlist_delete_members on public.shitlist_items
  for delete using (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
  );

-- Live sync between partners: publish row changes for this table over Realtime.
alter publication supabase_realtime add table public.shitlist_items;
