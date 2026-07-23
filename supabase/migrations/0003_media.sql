-- Migration 0003: media items (photos now, drawings in M4) + private Storage (Milestone 3).
--
-- A media item is one photo/drawing sent from one partner to the other. Files live in a private
-- Storage bucket under `<couple_id>/<item_id>.<ext>`; the row records who sent what, when, and
-- whether it's been seen. Everything is couple-scoped by RLS, consistent with 0001/0002.

create table public.media_items (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  sender_id    uuid not null references auth.users (id) on delete set null,
  type         text not null check (type in ('photo', 'drawing')),
  -- Path within the `media` bucket: '<couple_id>/<id>.jpg'. Kept explicit so the widget-cache
  -- writer and the full-view screen resolve the same object without guessing.
  storage_path text not null,
  created_at   timestamptz not null default now(),
  -- Null until the recipient has opened it; drives "new" badges and delivery state.
  seen_at      timestamptz
);

create index media_items_couple_created_idx
  on public.media_items (couple_id, created_at desc);

alter table public.media_items enable row level security;

-- Couple members can read all of their couple's media.
create policy media_select_members on public.media_items
  for select using (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
  );

-- A member can send (insert) media as themselves into their couple.
create policy media_insert_sender on public.media_items
  for insert with check (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
    and sender_id = auth.uid()
  );

-- Either member can mark items seen (update). Deleting is allowed for housekeeping.
create policy media_update_members on public.media_items
  for update using (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
  );

create policy media_delete_members on public.media_items
  for delete using (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
  );

-- Live delivery: recipient's app learns of a new item over Realtime (belt-and-suspenders with the
-- push that will trigger the widget reload in Phase B).
alter publication supabase_realtime add table public.media_items;

-- ---------------------------------------------------------------------------
-- Private Storage bucket for the actual image bytes
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Object path is '<couple_id>/<...>'. A user may touch an object only when the leading path
-- segment is a couple they belong to. (storage.foldername(name))[1] is that first segment.
create policy media_objects_select on storage.objects
  for select using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in (
      select id::text from public.couples where auth.uid() in (member_a, member_b)
    )
  );

create policy media_objects_insert on storage.objects
  for insert with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in (
      select id::text from public.couples where auth.uid() in (member_a, member_b)
    )
  );

create policy media_objects_delete on storage.objects
  for delete using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in (
      select id::text from public.couples where auth.uid() in (member_a, member_b)
    )
  );
