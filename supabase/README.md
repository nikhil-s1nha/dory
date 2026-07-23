# Backend (Supabase)

Partner pairing, accounts, and (later) photo/drawing delivery and Spotify tokens live here.
This directory holds the database as code: versioned migrations and their tests.

## Layout

- `migrations/0001_pairing.sql` — accounts, couples, invites; RLS enforcing exactly-two
  membership; the `redeem_invite` SECURITY DEFINER function (authoritative pairing logic).
- `tests/0001_pairing_rls_test.sql` — pgTAP test for the RLS + redemption acceptance criteria,
  including the spec's "a non-partner cannot read a couple's rows." For a local stack.
- `tests/verify_rls_cloud.sql` — the same acceptance criteria as a single self-contained script
  (no pgTAP), runnable against the cloud project via the Management API or psql. It switches
  Postgres roles to exercise RLS as each user, then rolls itself back via a sentinel exception
  so it leaves no data. This is what was run to verify M1 against the live project.

The same invariants are mirrored in pure TypeScript at `src/domain/pairing/` for instant
client-side UX; Postgres is the source of truth.

## Current setup: cloud project

The app targets a free-tier cloud project (ref `agnslitokcyvkboiklwn`). Migrations are applied and
the RLS acceptance test has been run against it (see verification below). No Docker/local stack.

### Applying migrations / running SQL (Management API)

Without the Supabase CLI installed, migrations are applied by POSTing the SQL to the Management
API `.../database/query` endpoint with a Personal Access Token kept in the gitignored file
`.supabase-access-token` (never committed, never printed). To re-apply or run the verification:

```sh
TOKEN=$(tr -d '[:space:]' < .supabase-access-token)
REF=agnslitokcyvkboiklwn
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query: .}' supabase/migrations/0001_pairing.sql)"
```

A `success` run of `tests/verify_rls_cloud.sql` returns the error `P0001: DORY_RLS_OK` — that
sentinel is intentional (it rolls the test data back); any other error is a real failure.

### Future option: local stack

If offline iteration is ever wanted, install the Supabase CLI + Docker Desktop and run
`supabase start` / `supabase test db` (which runs `tests/0001_pairing_rls_test.sql`). Docker is a
large install; not needed for the current cloud workflow.

## App wiring

The client (`src/lib/supabase.ts`) reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
from `.env` (copy `.env.example`). These are public by design — RLS, not key secrecy, guards data.
