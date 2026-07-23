# Dory — Build Plan & Decision Log

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
4. Widget extensions die at **30MB** — the widget only ever touches a ≤1200px derivative.

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
| M3 | Photo → widget (⚠️ needs Apple acct) | 🟡 **Phase A done** — media backend + Storage (RLS verified live), send/upload path (verified end-to-end), capture + full-view screens (rendered on sim). Phase B (App Group, expo-widgets widget, push) staged until Apple enrollment clears |
| M4 | Drawing canvas + round-trip | 🟡 **Phase A done** — Skia canvas + tools, pure stroke model (tested), send via media pipeline, round-trip base-image preload verified on sim. Phase B (drawing widget, push) batched with M3's — see CHANGELOG |
| M5 | Smart-stack priority & advancement | ✅ **logic complete** — pure selection/advancement (priority photo>drawing>music, per-open cycling), 15 tests. App-Group cursor persistence + widget render land in Phase B |
| M6 | Spotify OAuth + now-playing (⚠️ needs Premium + dev app) | 🟡 **foundation done** — now-playing logic + token helpers (12 tests) + schema (owner-scoped tokens, couple-scoped now_playing) applied. OAuth flow + Edge Functions + UI blocked on Spotify credentials |
| M7 | Stretch: 15s Live Activity rotation | pending |
| M8 | Polish + full-flow pass | pending |

Ordering note: Spotify (spec M5) and smart stack (spec M6) are swapped per the deprioritization.

## Verification discipline (every milestone)

`npm run lint && npm run typecheck && npm test`, then a simulator build, then a self-review against
that milestone's acceptance criteria. No advancing on a red gate. Logic with real behavior gets real
tests: pairing (M1), checklist CRUD (M2), drawing composite/export (M4), smart stack (M5), token
refresh (M6).

## Resolved interpretation (M2)

Shitlist is **shared between the two partners** (owner's call) — one couple-scoped list both
edit, with Realtime sync. See `supabase/migrations/0002_shitlist.sql`.
