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

- **Client wiring** — `@supabase/supabase-js` + AsyncStorage + url-polyfill installed;
  `src/lib/supabase.ts` configures the RN client (AsyncStorage session persistence,
  foreground-tied auto-refresh). Public config in `.env` (from `.env.example`).
- **Pairing repository** — `src/domain/pairing/repository.ts`: `createCoupleWithInvite`
  (opens a couple + mints a CSPRNG invite code via `expo-crypto`) and `redeemInvite` (calls the
  `redeem_invite` RPC, returns a typed outcome). Client injected for testability.

### Verified
- **Backend decision: cloud** free-tier Supabase project (ref `agnslitokcyvkboiklwn`). No Docker.
- Migration `0001_pairing.sql` **applied** to the project via the Management API. Confirmed:
  3 tables, 3 functions, RLS enabled on all three, 7 policies.
- **Live RLS + redemption test passed** against the cloud DB (`tests/verify_rls_cloud.sql`):
  non-partner sees zero couple rows and zero partner profiles (before and after pairing), members
  see their couple, redemption is single-use (third user gets `ALREADY_REDEEMED`). The run rolled
  back cleanly — 0 rows left behind.
- `npm test` — 42/42 pass (12 M0 + 30 pairing). `npm run typecheck`, `npm run lint` — clean.
- iOS app rebuilt with the new native modules (AsyncStorage): Build Succeeded.

### App-facing auth + pairing (completes M1)
- **Session context** — `src/lib/auth-context.tsx`: tracks the Supabase session (via
  `onAuthStateChange`) and the caller's profile (with `coupleId`); `refreshProfile` lets the
  pairing screen flip the app into the paired state immediately after redeeming.
- **Auth gate** — `src/app/_layout.tsx` uses `Stack.Protected` guards so the three states map
  one-to-one: signed out → `/auth`, signed-in-but-unpaired → `/pair`, paired → `(tabs)`. The
  native splash is held until the initial session+profile settles, so no wrong-screen flash.
- **Screens** — `src/app/auth.tsx` (email/password sign in + sign up) and `src/app/pair.tsx`
  (mint an invite code / enter a partner's code, with friendly per-reason error copy). The
  scaffold's Home/Explore screens moved into an authenticated `(tabs)` group.
- `findOutstandingInvite` added to the repository so the pair screen shows an existing code
  instead of minting a duplicate (which the `member_a` unique index would reject).

### Verified (M1 app layer)
- App **builds, boots, and renders** on the simulator with the new native modules
  (`expo-crypto`, `expo-clipboard`): Build Succeeded.
- **Auth screen renders** and the gate works (no session → auth). Screenshot captured.
- **Pair screen renders** end-to-end: injected a real Alex session, the app routed past auth to
  `/pair` (correct gating), and the screen showed "Create a code" — meaning `findOutstandingInvite`
  ran against the **live cloud DB from the running app**, authenticated and RLS-authorized, with
  no runtime errors. This exercises the whole client→Supabase path, not just unit tests.
- `npm test` — 46/46 (30 pairing incl. `findOutstandingInvite`); typecheck + lint clean.

### Test accounts (seeded in the cloud project for on-device testing)
- `alex@dory.app` / `dorytest123` (Alex) and `sam@dory.app` / `dorytest123` (Sam), both
  pre-confirmed and unpaired. Created via SQL (with `auth.identities` + non-null token columns so
  GoTrue accepts them). Delete anytime; they exist only to make the pairing flow testable now.

### ⚠️ Flag — email confirmation blocks real sign-ups (decision needed)
The project has `mailer_autoconfirm: false` and only the default Supabase SMTP, which emails
**only project members** and is rate-limited. So a partner/friend **cannot self-sign-up today** —
the confirmation email never reaches them. Options: (a) enable auto-confirm (simplest for a
personal app; no email verification), (b) configure a real SMTP provider, or (c) switch to
magic-link/OTP. Recommend (a) for now. Not changed yet — it's an auth-security setting on your
project, so it's your call. Doesn't block M1 (verified with seeded accounts); does block real use.
