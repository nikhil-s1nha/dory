-- Migration 0008: APNs device tokens for push dispatch (Milestone 3/4 Phase B).
--
-- When one partner sends a photo or drawing the other's phone must be told, so the widget can be
-- refreshed without the app being opened. iOS drops `content-available` (silent) pushes when the app
-- has been force-quit, so the reliable channel is a *visible* alert — see PLAN.md constraint 1. That
-- alert is sent by the `notify-partner` Edge Function, which needs the recipient's raw APNs device
-- tokens; this table is where the app parks them after `expo-notifications` registration.
--
-- Deliberately NOT couple-scoped: unlike media_items/now_playing, a partner never reads these rows.
-- The Edge Function runs as the service role (bypasses RLS), so the tokens stay owner-only. A leaked
-- token isn't catastrophic on its own (APNs still requires the signing key), but it identifies a
-- device and there is no reason to expose it.

-- One row per device. The device token is the identity: APNs issues exactly one per app install per
-- device, so it is globally unique by construction and makes `upsert` on registration natural — the
-- app can post the same row on every launch without accumulating duplicates. A user may hold several
-- rows (phone + iPad + a reinstall that rotated the token).
create table public.push_tokens (
  device_token text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Only iOS ships today; the column exists so an Android/FCM row is an insert, not a migration.
  platform     text not null default 'ios' check (platform in ('ios')),
  -- APNs sandbox and production are separate token namespaces: a token minted by a development
  -- install is *invalid* against api.push.apple.com and vice versa. Per-row rather than per-project
  -- because both kinds coexist — Nikhil's Xcode/`expo run:ios` builds register against sandbox while
  -- a TestFlight build of the same app registers against production. The client reports which one it
  -- got; 'sandbox' is the default because every install to date is a development build.
  environment  text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The send path is "give me every token for this user", and device_token (the PK) doesn't serve it.
create index push_tokens_user_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------------------
-- One device belongs to one account at a time
-- ---------------------------------------------------------------------------

-- A device token survives sign-out: if Alex signs out and Sam signs in on the same phone, iOS hands
-- the app the *same* token. Left alone, the stale row would keep pointing at Alex and Alex's partner
-- would push "sent you a photo" onto Sam's lock screen. Reassigning the row can't be left to the
-- client either — RLS (correctly) forbids Sam from updating a row owned by Alex, so a plain upsert
-- would fail outright. SECURITY DEFINER so the handover happens regardless of the caller's policies.
create function public.claim_push_token()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.push_tokens
    where device_token = new.device_token and user_id <> new.user_id;
  return new;
end;
$$;

-- BEFORE INSERT: fires ahead of conflict detection, so after the delete the caller's own insert
-- proceeds cleanly instead of colliding with the previous owner's row.
create trigger push_tokens_claim_device
  before insert on public.push_tokens
  for each row execute function public.claim_push_token();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.push_tokens enable row level security;

-- Owner-only, same idiom as spotify_accounts (0005): you can read, register, re-register and (on
-- sign-out) delete your own device rows, and nobody else's — not even your partner's. The
-- notify-partner function reads the partner's tokens with the service role.
create policy push_tokens_owner on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
