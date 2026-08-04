-- Migration 0006: transient OAuth state for the Spotify connect flow.
--
-- The connect flow can't carry the user's identity through the browser redirect, so `spotify-start`
-- (an authenticated Edge Function) mints a random `state`, records who it belongs to here, and
-- `spotify-callback` looks it up to attribute the returned tokens. Rows are single-use and expire.
-- Written/read only by the Edge Functions (service role); RLS is on with no policies so clients
-- can't touch it.

create table public.spotify_oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.spotify_oauth_states enable row level security;
