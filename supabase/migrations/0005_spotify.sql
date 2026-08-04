-- Migration 0005: Spotify accounts + now-playing cache (Milestone 6 / spec 3.3).
--
-- Each partner connects Spotify; tokens are stored server-side and refreshed by an Edge Function.
-- A poller (Edge Function, service role) writes each user's current track into now_playing, which
-- the *partner* reads (couple-scoped) to show "{name} is listening to {song}". Spotify has no push,
-- so this is polled, not live — "recently listening," refreshed on an interval.

-- OAuth tokens, one row per user. Owner-scoped: only you can see/manage your own; the partner never
-- reads these. The poller/refresh functions use the service role (which bypasses RLS).
create table public.spotify_accounts (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text not null default '',
  updated_at    timestamptz not null default now()
);

alter table public.spotify_accounts enable row level security;

create policy spotify_accounts_owner on public.spotify_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Latest known playback for a user, readable by their partner. Written only by the poller (service
-- role); no client write policy, so RLS default-deny keeps clients read-only here.
create table public.now_playing (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  couple_id     uuid not null references public.couples (id) on delete cascade,
  track_id      text,
  title         text,
  artist        text,
  album_art_url text,
  is_playing    boolean not null default false,
  updated_at    timestamptz not null default now()
);

create index now_playing_couple_idx on public.now_playing (couple_id);

alter table public.now_playing enable row level security;

-- Both members of the couple can read either partner's now-playing row.
create policy now_playing_select_members on public.now_playing
  for select using (
    couple_id in (select id from public.couples where auth.uid() in (member_a, member_b))
  );

-- Partner learns of track changes over Realtime (in addition to the push that reloads the widget).
alter publication supabase_realtime add table public.now_playing;
