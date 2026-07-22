# Backend (Supabase)

Partner pairing, accounts, and (later) photo/drawing delivery and Spotify tokens live here.
This directory holds the database as code: versioned migrations and their tests.

## Layout

- `migrations/0001_pairing.sql` — accounts, couples, invites; RLS enforcing exactly-two
  membership; the `redeem_invite` SECURITY DEFINER function (authoritative pairing logic).
- `tests/0001_pairing_rls_test.sql` — pgTAP test for the RLS + redemption acceptance criteria,
  including the spec's "a non-partner cannot read a couple's rows."

The same invariants are mirrored in pure TypeScript at `src/domain/pairing/` for instant
client-side UX; Postgres is the source of truth.

## Running it — a decision is needed (⚠️ real cost)

Neither the Supabase CLI nor Docker is installed on this machine, so the live RLS test and the
end-to-end pairing flow can't be exercised yet. Two paths:

1. **Local stack (Docker Desktop + Supabase CLI).** `supabase start` runs the full stack in
   Docker; `supabase test db` runs the pgTAP suite. Best for iterating on schema/RLS offline.
   Cost: Docker Desktop is a large install with its own licensing terms for larger orgs (free
   for personal use / small teams).

2. **Cloud project (free tier).** Create a project at supabase.com, link it (`supabase link`),
   push migrations (`supabase db push`), and run the app against it. No Docker. Needs the
   project URL + anon key wired into the app (see below). Free tier comfortably fits a couple.

Either way the migrations and tests here are the artifact; the choice only affects where they run.

## App wiring (pending, filled in once a project exists)

The app reads its Supabase URL and anon key from environment/config (`EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`). The typed client lives at `src/lib/supabase.ts` and is added
in the same change that installs `@supabase/supabase-js` (deferred so it lands with one native
rebuild rather than interrupting the M0 simulator build).
