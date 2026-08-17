-- Migration 0010: ActivityKit push-to-start tokens + live activity instances (Live Activity lane).
--
-- The partner sends a photo while your phone is in your pocket and nothing of ours is running. iOS
-- 17.2+ *push-to-start* is the only mechanism that can put something on the lock screen from there:
-- APNs wakes the app with enough background runtime to start the Live Activity. That requires two
-- kinds of token, and they are not the same thing:
--
--   * a **push-to-start token** — one per app install per device, issued by
--     `Activity.pushToStartTokenUpdates`. It exists whether or not an activity is running and is
--     what a `start` push is addressed to. `live_activity_tokens` holds these.
--   * an **update token** — issued per *activity* by `activity.pushTokenUpdates`, valid only while
--     that activity lives. `update`/`end` pushes go here. `live_activity_instances` holds these.
--
-- Both rotate at iOS's discretion (see docs/live-activity-contract.md), so every write is an upsert
-- and nothing may assume a token is stable.
--
-- Shaped after 0008_push_tokens.sql, deliberately: same owner-only RLS (a partner must NOT be able
-- to read these — dispatch runs as the service role, so nobody else needs access), same
-- device-handover trigger, same per-row `environment`. Anything couple-scoped here would be a
-- privacy regression relative to 0008, not a convenience.

-- ---------------------------------------------------------------------------
-- live_activity_tokens — "where do I send a `start` push for this user?"
-- ---------------------------------------------------------------------------

create table public.live_activity_tokens (
  -- The push-to-start token is the identity, exactly as device_token is in push_tokens: APNs issues
  -- one per install per device, so it is unique by construction and the app can re-post the same row
  -- on every launch without accumulating duplicates.
  token       text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- THE most breakable value in this whole feature. APNs sandbox and production are separate token
  -- namespaces and separate gateway hosts; a token minted against one is rejected by the other with
  -- 400 BadDeviceToken. It is NOT derivable from a build flag: an Xcode/`expo run:ios` Release build
  -- reports **sandbox** and a TestFlight build of the identical source reports **production**. The
  -- client reads it from the `aps-environment` entitlement (never `__DEV__`) and parks it here; the
  -- Edge Function picks its gateway from this column and never guesses.
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The dispatch query is "every push-to-start token for this user"; the PK doesn't serve it.
create index live_activity_tokens_user_idx on public.live_activity_tokens (user_id);

-- ---------------------------------------------------------------------------
-- live_activity_instances — "which activities are live, and how do I update them?"
-- ---------------------------------------------------------------------------

create table public.live_activity_instances (
  -- ActivityKit's own `activity.id`. Client-generated, so `text` rather than uuid.
  activity_id  text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Nullable, and in practice the row is *born* with it set: ActivityKit's activity id is not
  -- available to JS at start time — expo-widgets surfaces it only on the push-token event
  -- (`PushTokenEvent.activityId`) — so the app upserts activity_id and update_token together when
  -- that event fires. Nothing here may assume the row exists at start. It goes back to null when the
  -- activity ends or APNs declares the token dead: an ended activity must not stay addressable.
  update_token text,
  -- What the activity is currently showing. `on delete set null` and not `cascade`: deleting a photo
  -- must not silently forget that an activity is still on someone's lock screen (we still need the
  -- row to send the `end`).
  media_id     uuid references public.media_items (id) on delete set null,
  started_at   timestamptz not null default now(),
  -- Null while live. Set (rather than deleting the row) so a late `end` push has something to
  -- address and so the history is inspectable when a push goes missing.
  ended_at     timestamptz
);

-- Dispatch only ever asks for a user's *live* activities, so the index is partial: it stays small
-- forever no matter how many activities have come and gone.
create index live_activity_instances_live_idx
  on public.live_activity_instances (user_id)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- One device belongs to one account at a time
-- ---------------------------------------------------------------------------

-- Same hazard as push_tokens, with a sharper edge. A push-to-start token survives sign-out: if Alex
-- signs out and Sam signs in on the same phone, iOS hands the app the *same* token. Left alone the
-- stale row still points at Alex, and Alex's partner would start a Live Activity showing Alex's
-- photos on Sam's lock screen. The client cannot fix this itself — RLS (correctly) forbids Sam from
-- updating a row owned by Alex, so a plain upsert fails outright rather than taking ownership.
-- SECURITY DEFINER so the handover happens regardless of the caller's policies.
--
-- The extra clause beyond 0008: an already-running activity of Alex's is *also* still on that phone,
-- and its update_token still works, so an `update` push addressed to Alex would render Alex's
-- content on Sam's lock screen even after the start-token row has been reassigned. Unlike the token,
-- an instance row carries no device identity, so it cannot be matched to this phone directly. The
-- guard is therefore conservative: close out Alex's live instances only when the handover leaves
-- Alex with **no push-to-start token at all**, i.e. this was the only device we knew about for them,
-- so every live activity of theirs must have been on it. An Alex who still has an iPad registered
-- keeps that iPad's activity running.
create function public.claim_live_activity_token()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  previous_owner uuid;
begin
  delete from public.live_activity_tokens
    where token = new.token and user_id <> new.user_id
    returning user_id into previous_owner;

  if previous_owner is not null
     and not exists (select 1 from public.live_activity_tokens where user_id = previous_owner)
  then
    update public.live_activity_instances
       set ended_at = now(),
           -- Drop the token as well as stamping the end: an ended row must not remain addressable.
           update_token = null
     where user_id = previous_owner
       and ended_at is null;
  end if;

  return new;
end;
$$;

-- BEFORE INSERT: fires ahead of conflict detection, so after the delete the caller's own insert
-- proceeds cleanly instead of colliding with the previous owner's row.
create trigger live_activity_tokens_claim_device
  before insert on public.live_activity_tokens
  for each row execute function public.claim_live_activity_token();

-- ---------------------------------------------------------------------------
-- Row Level Security — owner-only, both tables
-- ---------------------------------------------------------------------------

alter table public.live_activity_tokens enable row level security;
alter table public.live_activity_instances enable row level security;

-- Same idiom as push_tokens (0008) and spotify_accounts (0005): you can read, register, re-register
-- and (on sign-out) delete your own rows, and nobody else's — explicitly including your partner's.
-- The notify-activity Edge Function reads the recipient's rows with the service role, which bypasses
-- RLS, so granting a couple any visibility here would buy nothing and leak a device identifier.
create policy live_activity_tokens_owner on public.live_activity_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy live_activity_instances_owner on public.live_activity_instances
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
