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
- Simulator build — **blocked, not failed.** `xcodebuild` cannot resolve any iOS
  Simulator destination because Xcode 26.6's iOS 26.5 *platform component* isn't fully
  installed (the `iphonesimulator26.5` SDK is on disk, but Xcode 26 gates iOS destination
  resolution on the downloadable platform being installed). Every destination form —
  booted-sim UDID, `platform=iOS Simulator,name=…,OS=18.2`, explicit `-sdk iphonesimulator`
  — collapses to the "iOS 26.5 is not installed" device placeholder. This is a one-time
  local toolchain provisioning step (`xcodebuild -downloadPlatform iOS`, multi-GB), not a
  defect in the app. Flagged to owner for the download decision before proceeding.

### Flagged / follow-ups
- **Apple Developer Program enrollment should start now** — it hard-gates M3 and can take 24–48h+.
- Shitlist private-vs-shared interpretation to confirm at M2 (defaulting to private).
