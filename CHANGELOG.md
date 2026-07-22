# Changelog

Per-milestone record of what was built and what was **verified**. See `PLAN.md` for the plan.

## M0 — Scaffolding, CI, architecture decision

**Completed 2026-07-22.**

### Decisions
- Architecture: Expo + `expo-widgets`, backend Supabase. Rationale in `PLAN.md`.
- Pinned to **Expo SDK 57** (spec said 56; 57 is a non-breaking superset and current `latest`).
- App identity: name `Dory`, slug `dory`, bundle id `com.nikhilsinha.dory`, scheme `dory`.

### Built
- Expo SDK 57 app scaffolded via `create-expo-app` (default template: expo-router, TypeScript
  strict, `src/` layout). Project renamed from `scaffold` to `dory`.
- App Group seam defined in `src/constants/app-group.ts` — the single app↔widget contract, with
  the container identifier, state filename/version, and the 30MB-driven image dimension cap.
- Test harness: `jest-expo` + `@testing-library/react-native`. `react-test-renderer` pinned to
  19.2.3 to satisfy React's exact-version peer requirement.
- Scripts: `lint`, `typecheck` (`tsc --noEmit`), `test` (jest).
- CI: `.github/workflows/ci.yml` runs lint + typecheck + test on push/PR to main (`npm ci`).
- `types/globals.d.ts` for CSS-module imports so `tsc` matches Metro's resolution.

### Verified
- `npm test` — 3/3 pass. First test (`app-group.test.ts`) guards the app-group constants against
  drift from `app.json`, since drift there surfaces as a silently-empty widget on device.
- `npm run typecheck` — clean.
- `npm run lint` — clean (one documented `set-state-in-effect` disable on Expo's own web
  hydration hook).
- `npm ci --dry-run` — lockfile resolves cleanly, so CI's `npm ci` will not hit the peer conflict.
- `expo prebuild` — succeeded; native `ios/` project + CocoaPods generated cleanly (0 errors, 0 warnings at planning).
- Simulator build — **verified.** Builds, boots, and renders the app on iPhone 15 Pro
  (iOS 18 simulator): full native compile (React Native + Hermes from source), install via
  `simctl`, launch, Metro bundle (1678 modules), and the UI renders with the tab bar.
  - Required a one-time toolchain fix first: Xcode 26.6 uses the iOS 26.5 SDK, and Xcode 26
    gates *all* iOS destination resolution (simulator included) on the downloadable iOS
    platform component being installed. It wasn't, so every destination collapsed to an
    "iOS 26.5 is not installed" placeholder. Resolved with `xcodebuild -downloadPlatform iOS`
    (~8.5 GB, owner-approved). Not an app defect — pure local provisioning.
  - Note: `expo run:ios` compiles + installs fine but fails at the final *Simulator window
    activation* step in this headless environment; installing + launching via `simctl`
    sidesteps that and is how the boot was verified.

### Flagged / follow-ups
- **Apple Developer Program enrollment should start now** — it hard-gates M3 and can take 24–48h+.
- Shitlist private-vs-shared interpretation to confirm at M2 (defaulting to private).

---

## M1 — Accounts, partner pairing, backend skeleton

**In progress.** Domain logic + schema complete and tested; live backend verification and
client wiring pending a backend-tooling decision (below).

### Built
- **Pure pairing domain** (`src/domain/pairing/`), storage-agnostic and fully unit-tested:
  - `types.ts` — Profile / Couple / Invite model; a couple is "exactly two" by structure.
  - `invite-code.ts` — code generation over a confusable-free base32 alphabet (no 0/O/1/I/L),
    unbiased via rejection sampling, with an injected RNG so it's deterministic in tests.
  - `redemption.ts` — the invite-redemption invariants (expired / already-redeemed /
    self-redeem / redeemer-already-paired / couple-full), ordered so the surfaced error is
    the most meaningful when several apply.
  - `service.ts` — `buildInvite` (code + 24h expiry) and `mapRedeemResult` (RPC string → typed
    outcome; unrecognised returns become UNKNOWN, never a silent success).
- **Database as code** (`supabase/migrations/0001_pairing.sql`):
  - `profiles` / `couples` / `invites` tables; profile auto-created on signup by trigger.
  - "Exactly two members" enforced structurally (two columns) + partial unique indexes so a
    user can occupy at most one couple slot across all couples.
  - RLS: couples and profiles visible only to the two members; invites readable only by their
    creator (redeemers never read the table — the redeem function does the lookup).
  - `redeem_invite` — SECURITY DEFINER, row-locking, authoritative mirror of the TS invariants;
    two people racing the last slot are serialised so exactly one wins.
- **RLS acceptance test** (`supabase/tests/0001_pairing_rls_test.sql`, pgTAP): encodes
  "a non-partner cannot read a couple's rows," members-can-read, and single-use redemption.

### Verified
- `npm test` — 36/36 pass (12 M0 + 24 new pairing tests). `npm run typecheck` and
  `npm run lint` — clean.
- pgTAP RLS test is written but **not yet executed** — see decision below.

### Flagged — decision needed before M1 closes (⚠️ real cost)
- No Supabase CLI or Docker locally, so the live RLS test and end-to-end pairing can't run yet.
  Choose: (a) **local stack** via Docker Desktop + Supabase CLI, or (b) **cloud** free-tier
  Supabase project. Details in `supabase/README.md`. The migrations/tests are ready either way;
  the choice only determines where they execute and provides the URL/anon key to wire the client.
- `@supabase/supabase-js` client (`src/lib/supabase.ts`) intentionally deferred to land with the
  backend decision in one native rebuild (AsyncStorage is a native module).
