# Changelog

Per-milestone record of what was built and what was **verified**. See `PLAN.md` for the plan.

## Shitlist rework — fluid Apple Notes editing + NaN fix

**2026-07-23.** Addressed two issues reported from on-device testing.

- **CoreGraphics NaN on item creation — fixed.** Root cause was the `expo-symbols` `SymbolView`
  used for the checkbox circles (a known source of the "invalid numeric value (NaN)" CoreGraphics
  warning). Replaced with plain `View`-based checkboxes; also swapped the `FlatList` for a
  `ScrollView` (short lists, and it plays better with per-row `TextInput` focus). Verified: adding
  a row (via live Realtime insert, the same render path) produces **no** CoreGraphics NaN in the
  simulator syslog.
- **Fluid editing, modeled on Apple Notes.** Each item is now an inline, multiline `TextInput`
  (cursor moves anywhere, text wraps like normal text). **Return** adds a new item (implemented by
  splitting on the newline so it doesn't fight the keyboard); **Return on an empty item ends the
  list**; **Backspace on an empty item** deletes it and moves focus to the previous row. Tapping
  the circle checks it (strikethrough, stays in place — Apple's default "manual" sort). Edits are
  optimistic and debounced (500ms) to the server; the Realtime subscription skips the row you're
  actively editing so a partner's echo doesn't yank your cursor. Behaviors referenced from Apple's
  Notes checklist docs. Out of scope for v1 (per spec "no extra structure"): swipe-to-indent and
  drag-to-reorder.
- Domain: `sortItems` now orders oldest-first (checklist grows downward); added `setText` reducer
  and `setItemText` repository write. Migration `0004` relaxes the text length floor so empty
  items can exist while being edited.
- Verified: rendered on the simulator against live data (including the partner's items syncing in
  over Realtime from a real device); `npm test` 85/85; typecheck + lint clean.

## M4 — Drawing canvas + round-trip (Phase A)

**In progress.** The canvas, tools, send, and the round-trip preload are built and verified on the
simulator; the drawing **widget** and **push** are Phase B, batched with M3's (pending Apple
enrollment). Actual finger-strokes are best confirmed on a device (the simulator has no touch-drag
automation available here), but the stroke model is unit-tested and the canvas renders.

### Built (Phase A)
- **Pure drawing model** — `src/domain/drawing/state.ts`: strokes + in-progress stroke with
  `beginStroke`/`extendStroke`/`endStroke`/`undo`/`clear`/`isEmpty`, and `strokeToSvgPath`
  (points → SVG path string Skia renders). 11 unit tests.
- **Canvas screen** — `src/app/draw.tsx` (replaces the M2 stub): a `@shopify/react-native-skia`
  canvas with finger drawing via `react-native-gesture-handler` `Gesture.Pan`, a color palette
  and three stroke widths, Clear, and Send. Send snapshots the canvas (`makeImageSnapshot` →
  base64 PNG → data URI) and ships it as a `type: 'drawing'` item through the **same M3 media
  pipeline** (downscale/upload/record/deliver).
- **Round-trip** — opening `dory:///draw?base=<mediaId>` loads that drawing as a Skia background
  layer; new strokes composite on top; Send snapshots base + strokes into a new drawing sent back.
  This is the deep-link a drawing widget/notification will trigger (spec 3.2). Header reads
  "Draw back" in this mode.

### Verified (Phase A)
- **Rendered on the simulator**: the canvas + full toolbar (palette, widths, Clear) render with no
  errors; the round-trip **base image loads into the canvas from a live signed URL** — proving
  `fetchMediaById` + `getSignedUrl` + Skia `useImage` work at runtime. Screenshots captured.
- Fixed a real bug found on-device: Skia's `<Canvas>` has no `onLayout`; size is now measured from
  a wrapping `View`.
- `npm test` — 83/83 (+11 drawing); typecheck + lint clean.

### Phase B (shared with M3, pending Apple enrollment)
- Drawing widget: static render of the latest drawing; tap → `dory:///draw?base=<id>` (round-trip).
- Push dispatch to trigger the widget reload + the visible "…drew you something" notification.

## M3 — Photo → widget (Phase A)

**In progress.** The capture→send→deliver→view path is built and verified; the widget itself, the
App Group cache write, and push-triggered reload are **Phase B**, staged until the Apple Developer
enrollment clears (App Groups + push entitlements require the paid account). The iOS simulator also
has no camera, so live capture is only fully exercised on a device.

### Built (Phase A)
- **Media backend** — `supabase/migrations/0003_media.sql`: `media_items` (photo/drawing, sender,
  storage path, seen state) couple-scoped with RLS; a **private `media` Storage bucket** with
  path-based object policies (a user may only touch objects under `<their-couple-id>/…`); Realtime
  enabled on the table.
- **Media domain** — `src/domain/media/`: `mediaStoragePath` (pure), and a repository —
  `sendImage` (downscale to ≤1200px JPEG via expo-image-manipulator → upload → insert row),
  `fetchRecentMedia`, `fetchMediaById`, `getSignedUrl` (private bucket), `markSeen`. Downscaling
  keeps bytes under the widget's 30MB ceiling end-to-end.
- **Capture screen** — `src/app/photo.tsx`: camera opens immediately (permission-gated), shutter →
  review (retake/send) → `sendImage` → back. Low-friction per spec 3.1.
- **Full-view screen** — `src/app/media/[id].tsx`: the widget's deep-link target
  (`dory:///media/<id>`) and in-app viewer; resolves a signed URL, displays the image, marks seen.
- Camera permission wired via the `expo-camera` config plugin in `app.json`.

### Verified (Phase A)
- Media + Storage RLS **verified live** (`tests/verify_media_rls_cloud.sql`): partner sees the
  couple's rows AND objects; non-member sees neither and cannot write under the couple path.
- **Full send/receive data path verified end-to-end against live Storage** (REST, as alex→sam):
  authorized upload (200) → row insert (201) → partner signs a URL and downloads → **200, byte-exact**
  (284/284); non-member sign blocked.
- **Rendered on the simulator**: full-view screen displays a real seeded photo (private object via
  signed URL, deep-linked); capture screen shows the camera UI + shutter (feed black on sim — no
  camera). Screenshots captured.
- `npm test` — 72/72 (+ media path & repository suites); typecheck + lint clean.

### Phase B — pending Apple enrollment
- App Group entitlement + container write (the widget-cache seam in `src/constants/app-group.ts`).
- `expo-widgets` widget: render the latest photo, tap → `dory:///media/<id>`. (First real
  expo-widgets test; App-Group `state.json` keeps a Swift fallback cheap if needed.)
- Push dispatch (Edge Function) to trigger the widget timeline reload on the recipient's device,
  plus the visible "…sent you a photo" notification (the reliable channel).

## M2 — Home screen, tab bar, Shitlist

**Completed 2026-07-22.**

### Built
- **Shared Shitlist backend** — `supabase/migrations/0002_shitlist.sql`: `shitlist_items` scoped
  to a couple, RLS so only the two members can read/write, and the table added to the Realtime
  publication so a partner's edits sync live. Decision: the list is **shared** between partners
  (owner's call), not private.
- **Shitlist domain** — `src/domain/shitlist/`: a pure list-state reducer (`upsertItem`,
  `upsertMany`, `setChecked`, `removeItem`, `sortItems` — newest first, id tie-break) that
  reconciles optimistic edits, fetches, and Realtime echoes by id; plus a repository (fetch / add
  with client-generated id / check / delete / `subscribeToItems`).
- **Home screen** — `src/app/(tabs)/index.tsx`: "Dory" title over a 2x2 button grid whose uniform
  gaps form the spec's visible plus/cross channel. Photo, Drawing, Music tiles navigate to their
  flows; the fourth ("Soon") is a visible, disabled placeholder. `HomeButton` component.
- **Instagram-style tab bar** — `src/app/(tabs)/_layout.tsx` on expo-router's headless `Tabs`
  (the classic Tabs navigator was dropped in SDK 57): slim bar, hairline top border, SF Symbol
  that weights up when active, small label. Tabs: Home, Shitlist.
- **Shitlist screen** — `src/app/(tabs)/shitlist.tsx`: Apple Notes checklist UX — add at top, tap
  to check (filled circle + strikethrough), long-press to delete, all optimistic with revert on
  error, and a live Realtime subscription for the partner's changes.
- **Feature stubs** — `photo`/`draw`/`music` routes render a shared `ComingSoon` placeholder
  (real flows arrive M3–M5), registered as modal screens under the paired guard.

### Verified
- Shitlist RLS **verified live** on the cloud DB (`tests/verify_shitlist_rls_cloud.sql`): both
  partners see the shared list; a non-member sees nothing and cannot insert.
- **Rendered on the simulator against live data** (paired alex+sam, seeded items): home grid with
  the plus gap + placeholder; tab bar switching Home↔Shitlist; Shitlist showing the couple's items
  with a checked item struck through. Screenshots captured. No runtime errors.
- `npm test` — 64/64 (M0–M1 + 18 shitlist); typecheck + lint clean.


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

### Auth: email confirmation resolved
The project shipped with `mailer_autoconfirm: false` + only default SMTP (emails project members
only), which would have blocked partners/friends from signing up. **Resolved: enabled
auto-confirm** (`mailer_autoconfirm: true`) at the owner's direction — appropriate because the
user base is a closed, small sample, so email verification adds friction without meaningful benefit.
Sign-up now yields an immediate session; verified via a throwaway probe account (since deleted).
If the audience ever widens, revisit with a real SMTP provider or magic-link/OTP.
