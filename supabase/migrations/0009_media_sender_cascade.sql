-- media_items.sender_id was declared `not null references auth.users (id) on delete set null`.
-- Those two clauses contradict each other: deleting a user makes Postgres try to NULL the column,
-- which the not-null constraint then rejects. The effect is that **any account that has ever sent a
-- photo or drawing cannot be deleted at all** — the delete fails with 23502 rather than doing
-- anything sensible. Found while tearing down test accounts, not by reading the schema.
--
-- Cascade is the right resolution here rather than making the column nullable: a media item with no
-- sender has no meaning in a two-person app (the widget filters strictly on `senderId`, and every
-- RLS policy on this table is written in terms of it). Deleting your account should take the things
-- you sent with it.
--
-- Note for whoever wires up account deletion properly: this cleans up the *rows*, not the objects
-- in the `media` Storage bucket. Those still need their own sweep.
alter table public.media_items
  drop constraint if exists media_items_sender_id_fkey;

alter table public.media_items
  add constraint media_items_sender_id_fkey
  foreign key (sender_id) references auth.users (id) on delete cascade;
