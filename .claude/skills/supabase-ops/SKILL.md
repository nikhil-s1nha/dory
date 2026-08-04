---
name: supabase-ops
description: Run SQL, apply migrations, verify RLS, deploy Edge Functions, and handle secrets against the cloud Supabase project — with no Docker and no local stack. Use for any backend change in supabase/.
---

# Supabase operations (cloud project, no Docker)

The project targets a free-tier cloud project (ref `agnslitokcyvkboiklwn`). There is **no Docker and
no local Supabase stack** on this machine, so the standard `supabase start` / `supabase db push` /
`supabase test db` workflow is unavailable. See also `supabase/README.md`.

## Applying migrations and running SQL

POST the SQL to the Management API with the Personal Access Token in the gitignored
`.supabase-access-token` (never printed, never committed):

```sh
TOKEN=$(tr -d '[:space:]' < .supabase-access-token)
REF=agnslitokcyvkboiklwn
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query: .}' supabase/migrations/0001_pairing.sql)"
```

## Verifying RLS — `BUNDLES_RLS_OK` is success

`supabase/tests/verify_*_cloud.sql` switch Postgres roles to exercise RLS as each user, then roll
their own test data back by raising a sentinel exception on the final line. So a **successful** run
returns the Postgres error `P0001: BUNDLES_RLS_OK`. Any *other* error is a real failure. Don't "fix" the
sentinel.

When writing new verification SQL, generate ids with `gen_random_uuid()` rather than hand-typing
sentinel UUIDs — a hand-typed one with non-hex characters fails the cast and looks like an RLS bug.

## Edge Functions

`supabase functions deploy` needs the CLI and a PAT but **not** Docker (Docker is only for local
serve/build). Function secrets (Spotify client id/secret, the poller shared secret) are set as
Supabase function secrets — never committed.

Migrations are committed to git, so a secret must never appear in one. `0007_spotify_poll_cron.sql`
reads the poller secret from Supabase **Vault** at call time; the Vault entry is created out-of-band.
The poller returns 403 without it.

Deno Edge Functions are excluded from the app's `tsconfig.json` and `eslint.config.js` — they use Deno
globals and `npm:` imports and never run in the RN runtime. Keep them excluded.

## Auth quirks

- New Supabase projects ship `mailer_autoconfirm: false`, and the default Supabase SMTP only emails
  *project members* and is rate-limited — so a real partner never receives a confirmation email.
  Auto-confirm was enabled via the Management API, but flag any auth-security change to the owner
  rather than flipping it silently.
- After changing an auth setting, config propagation lags. Re-probe before concluding it failed, and
  read the *raw* response — the session is a top-level field, not nested.
- Hand-seeding `auth.users` for tests is fiddly: each row needs a matching `auth.identities` record
  (GoTrue requires it, or sign-in returns no token), token columns must be `''` not `NULL` (else
  "Database error querying schema"), and `auth.users.email` has no plain unique constraint so
  `ON CONFLICT (email)` errors.
- The anon key is the newer `sb_publishable_...` format. It is public by design — RLS, not key
  secrecy, guards the data.

## Injecting a session into the simulator

There is no tap injection for headless verification, so to reach an auth-gated screen: mint a real
session through the auth API, then write it into the simulator app's AsyncStorage
(`RCTAsyncLocalStorage_V1` directory; large values go in an md5-named file with a `manifest.json`
pointer) and relaunch. **Any reinstall or simulator reboot wipes the container** — re-inject before
testing again.

## Secrets handling

Ask the user to run `! pbpaste > .some-secret-file`. Add the `.gitignore` entry **first** — the
Spotify client secret landed in the working tree uncommitted-but-committable because the pattern was
added afterwards. Verify with `git status`. Read secrets without printing them; check only shape
(e.g. `sbp_` prefix) and length.
