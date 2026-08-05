# Bundles — Build Plan & Decision Log

A personal-scale iOS app for a long-distance couple. Your partner's photo, drawing, or
now-playing track appears on your home screen without either of you opening an app. Widgets
are the product surface; the app is the on-ramp.

This file is the living tracking artifact. Decisions and per-milestone verification land here;
`CHANGELOG.md` records what shipped and what was verified at each stage.

## Architecture decision (resolved)

**Expo + `expo-widgets`** on **Expo SDK 57**, backend on **Supabase**.

- The hard part of this app — pairing, upload, delivery state, push-triggered reload, App Group
  cache, priority stack — is identical under Expo or native Swift. The widget itself only renders
  a photo, a drawing, or album art plus two text lines, squarely inside `expo-widgets`' supported
  layouts. Everything else is materially faster in Expo.
- Not a one-way door: the App Group container (`state.json` + downscaled image files) is a
  versioned seam. If `expo-widgets` disappoints, a hand-written SwiftUI widget reading the same
  container is a contained swap with zero backend or app churn. See `src/constants/app-group.ts`.

### SDK version: 57, not 56

The spec named SDK 56. SDK 57 shipped 2026-06-30 as an explicitly small, non-breaking release
(React Native 0.85→0.86, React unchanged) and `expo-widgets@57.x` tracks it with active releases.
Starting a greenfield project on `latest` avoids owing an immediate upgrade. No spec capability is
affected — widgets/Live Activities stability carries forward from 56.

### Constraints accepted (iOS facts, identical under Swift)

1. No instant widget updates exist — WidgetKit push is budgeted like timeline reloads, and iOS
   drops `content-available` pushes when the app is force-quit. A **visible** notification is the
   reliable channel; the widget catches up on push, foreground, and tap.
2. Widgets can't host a drawing canvas — tap deep-links into the app (already in spec).
3. Spotify is hard-capped at **5 users forever** (owner needs Premium; extended quota needs a
   250k-MAU business). Deprioritized to M6.
4. Widget extensions die at **30MB** — but the real headroom is far lower, because the extension
   shares that budget with the expo-widgets JS runtime. Measured on device: 4.0MB decoded rendered,
   5.5MB did not, and over-budget renders fail *silently* (last snapshot persists, no crash log). The
   widget only ever touches a **≤600px** derivative, capped when writing into the App Group.

### Costs

- Apple Developer Program $99/yr — **purchasing**; enroll now, gates M3. Individual approval 24–48h+.
- Spotify Premium on owner account — needed at M6.
- Supabase free tier; local Xcode builds (no EAS build minutes).

## Milestones

| # | Milestone | Gate |
|---|-----------|------|
| M0 | Scaffolding, CI, architecture decision | ✅ **complete** — lint/typecheck/test green; app builds, boots, and renders on the iOS simulator |
| M1 | Accounts, partner pairing, backend skeleton | ✅ **complete** — live RLS verified on cloud Supabase; auth + pairing screens render and gate correctly on the simulator; 46 tests. One flag: email confirmation blocks real sign-ups (see CHANGELOG) |
| M2 | Home screen, tab bar, Shitlist | ✅ **complete** — home grid + Instagram-style tab bar + shared Shitlist (Apple Notes UX, realtime); RLS verified; rendered on simulator against live data; 64 tests |
| M3 | Photo → widget | 🟡 **built end-to-end; final device confirmation outstanding** — Phase A (media backend + Storage RLS verified live, send/upload end-to-end, capture + full-view) plus Phase B's App Group write and photo widget, verified on device by screenshot. Push dispatch and the tap deep-link are now **built, gate-green and deployed** (migration applied, `notify-partner` live, RLS verified by `BUNDLES_PUSH_RLS_OK`); neither has yet been *observed* working on the phone |
| M4 | Drawing canvas + round-trip | 🟡 **built end-to-end; final device confirmation outstanding** — Phase A (Skia canvas + tools, tested stroke model, send via media pipeline, round-trip preload) plus the drawing widget rendering on device. The `bundles://draw?base=<id>` round-trip entry point is now live in the widget tree via `widgetURL`, but the tap itself is unconfirmed on device |
| M5 | Smart-stack priority & advancement | ✅ **complete** — pure selection/advancement (priority photo>drawing>music, per-open cycling), 15 tests; cursor persistence, per-open delivery, and on-screen rendering of photo, drawing and music all **verified on device** by screenshot. The frozen-widget bug was decoded-bitmap size in the extension — fixed in `c186227`, see [WIDGET-FREEZE.md](./WIDGET-FREEZE.md) |
| M6 | Spotify OAuth + now-playing | ✅ **complete** — verified live end-to-end 2026-07-24: owner registered the redirect URI, real OAuth round-trip, 2-min cron poller tracked a real song change, and the partner sees album art + "Alex is listening to …" with tokens still owner-only. Now-playing also **renders on the widget on device** (M5). Minor: a dev-only "view warnings" toast on the Music screen |
| M7 | Stretch: 15s rotation | ✅ **complete** — built as spec 3.4's in-app preview and **verified on the simulator**: photo, then drawing 15s later, in priority order. The Live Activity branch is not achievable; see [the M7 note](#m7--why-the-live-activity-branch-was-not-built) for the evidence. 23 new tests |
| M8 | Polish + full-flow pass | 🟡 **in progress** — docs reconciled; a full flow pass on device is the remaining work |

Ordering note: Spotify (spec M5) and smart stack (spec M6) are swapped per the deprioritization.

## Phase B (widgets) — reconciled 2026-08-04

M3/M4 were written as "Phase A done, Phase B staged until Apple enrollment clears." Enrollment
cleared and **most of Phase B shipped under the M5 device-verification push** (`d9e03c4` →
`c186227`) without the table being updated. What is actually true:

**Delivered and verified on device** (home-screen screenshot via `tools/widget-shot/`):

- App Group entitlement + container write — `src/lib/widget-sync.ts` (`downloadToAppGroup`), the
  seam declared in `src/constants/app-group.ts`.
- One `expo-widgets` widget — `widgets/bundles-widget.tsx` — rendering photo, drawing, music, and
  an empty state.
- Smart-stack wiring (M5 Phase B): cursor persistence, advance-one-step-per-open, AppState refresh
  — `src/hooks/use-widget-sync.ts`, wired into `(tabs)/_layout.tsx`.
- Three defects found only on device: `containerBackground` via a native `patch-package` patch
  (`8d03a41`), partner-only filtering so you don't see your own sends (`a0aee19`), and the
  600px App Group downscale that fixed the silent frozen-widget failure (`c186227`,
  [WIDGET-FREEZE.md](./WIDGET-FREEZE.md)).

**Both formerly-outstanding pieces were built on 2026-08-04:**

1. **Push dispatch — built and deployed.** `push_tokens` (owner-only RLS, plus a trigger that hands
   a device over when a second account signs in on it) and the `notify-partner` Edge Function are
   live on the cloud project; RLS is verified by `BUNDLES_PUSH_RLS_OK`. Delivery is **raw APNs**
   over HTTP/2 with the project's own `.p8` key rather than Expo's push service, which this project
   has no EAS credentials for. Registration stores the native token from `getDevicePushTokenAsync`;
   sandbox-vs-production is read from the `aps-environment` entitlement, *not* `__DEV__` (a Release
   build installed by Xcode is still sandbox, and that is how this app reaches the phone).
   `src/lib/push.ts`, `src/hooks/use-push.ts`, mounted beside `useWidgetSync`.
2. **Widget tap deep-link — applied.** `widgetURL` now sits on the root of each rendering branch
   (SwiftUI honours exactly one per hierarchy), so the spec 3.2 round-trip entry point is reachable.

**What is still unproven:** neither has been *observed* on the phone. The build that verified the
deep-link change is installed, but the widget must be removed and re-added before a tap means
anything, and the push path additionally needs a build carrying the registration code. Written and
gate-green is not the same as delivered, and this list should not be marked ✅ until someone has
watched a notification arrive and a widget tap land.

## M7 — why the Live Activity branch was not built

Spec 3.4's stretch goal names two surfaces: "while the user is actively engaged with a Live Activity
**or the app's own in-app widget preview**". The preview branch is built; the Live Activity branch
was investigated and rejected on evidence. SPEC.md §5 asks for exactly this to be surfaced rather
than quietly reinterpreted.

- **The rate limit is not the blocker,** contrary to the obvious assumption. Apple's budget language
  is scoped word-for-word to *ActivityKit push notifications*, and `Activity.update(_:)` is
  documented for foreground and background use with no stated frequency cap. The only documented
  local limit is a 4 KB content-state size. `NSSupportsLiveActivitiesFrequentUpdates` is likewise
  push-only by Apple's own wording.
- **Visibility is the blocker.** Apple's HIG: "Your Live Activity appears in the Dynamic Island
  **while your app isn't in use**." The foreground is the only place a 15-second *local* rotation can
  be driven from, and it is precisely where the surface isn't shown; background the app so it becomes
  visible and the JS runtime suspends, stopping the rotation. Driving it by push instead would need
  240 pushes/hour against a budget whose documented recovery is "up to 24 hours".
- **There is also no "actively engaged" signal** — iOS exposes no API for "the user is looking at
  this", which PLAN.md and SPEC.md already concede for widgets.

⚠️ The visibility claim is Apple *design guidance*, not an API contract. It has not been falsified on
device here. If someone wants the Live Activity branch, that ~20-minute check is where to start.

## Verification discipline (every milestone)

`npm run lint && npm run typecheck && npm test`, then a simulator build, then a self-review against
that milestone's acceptance criteria. No advancing on a red gate. Logic with real behavior gets real
tests: pairing (M1), checklist CRUD (M2), drawing composite/export (M4), smart stack (M5), token
refresh (M6).

## Resolved interpretation (M2)

Shitlist is **shared between the two partners** (owner's call) — one couple-scoped list both
edit, with Realtime sync. See `supabase/migrations/0002_shitlist.sql`.
