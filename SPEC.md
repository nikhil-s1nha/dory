# Build Spec: Long-Distance Relationship Widget App

You are starting in **plan mode**. Do not write implementation code until the planning phase below is complete and you have produced a written architecture plan. Work in staged milestones with verification gates — do not silently advance to the next milestone if the current one doesn't build, typecheck, and pass its tests.

## 1. Product context

This is a small app (built for personal use / a small group of friends, not App Store scale yet) for couples in long-distance relationships. The core value prop: give each partner low-friction "windows" into what the other is doing right now, surfaced primarily through iOS home-screen widgets rather than requiring either person to open the app and scroll. The whole point is that opening your phone and glancing at the home screen should feel like a small connection to your partner.

Three content types feed the widget, in this priority order when more than one is pending: **photo > drawing > music**.

## 2. Architecture decision (resolve this first, in plan mode)

Weigh Expo (React Native) vs. native Swift/SwiftUI for this project, using these specific, current facts rather than generic pros/cons:

- As of Expo SDK 56, `expo-widgets` is stable and lets you build both home-screen widgets and Live Activities as JSX components with no hand-written SwiftUI required for standard layouts (photo display, text, stacks). This removes what used to be the single biggest reason to go native for this kind of app.
- Data sharing between the main app and the widget extension happens via an iOS App Group (shared container), which both the Expo path and the native path need to set up — this part isn't easier in either direction.
- Regardless of Expo vs. native: standard home-screen widgets cannot host live interactive UI (no drawing canvas inside the widget, no in-place gesture handling beyond simple button/toggle App Intents on iOS 17+). Tapping a widget deep-links into the app. Design around this rather than fighting it.
- Regardless of Expo vs. native: iOS controls widget redraw timing via a timeline/budget system. The app cannot force a widget to redraw every 15 seconds just because it's on screen, and cannot detect "the user is currently looking at this widget." Live Activities (lock screen / Dynamic Island) are the one surface that can update more fluidly and even then Apple rate-limits it.
- Spotify's Web API has no push mechanism for "now playing" — it must be polled, which has implications for background refresh and battery, and needs a small backend regardless of client framework.
- This project needs a lightweight backend no matter what: partner pairing, photo/drawing upload and delivery state, push notification dispatch (to trigger widget/timeline reloads), and Spotify OAuth token storage all live server-side, not purely on-device.

Produce a short written recommendation (Expo+expo-widgets, or native Swift, or a hybrid where the main app is Expo and only the widget extension is hand-written Swift) with your reasoning, then get explicit confirmation before proceeding if the answer isn't "continue with the plan as scaffolded."

## 3. Feature specs

### 3.1 Photo

From the home screen, one of the four main buttons opens a low-friction capture flow: camera opens immediately (no gallery browsing, no caption-writing friction), user takes a photo, taps send, done — this should be as close to zero extra taps as possible. The photo uploads, the partner's device receives a push notification that silently triggers a widget timeline reload, and the photo becomes the new top-priority item in the partner's widget stack. Tapping the widget opens the app to a full view of the photo.

### 3.2 Drawing

A canvas screen (finger-drawing, simple color/stroke tools) where the user draws something and sends it as a surprise. It arrives on the partner's widget the same way the photo does (push-triggered timeline reload), showing a static rendering of the drawing. Tapping the drawing widget deep-links into the app, opens the same drawing pre-loaded on the canvas, and lets the partner draw additional strokes on top of it, then send it back — the actual add-a-layer interaction happens inside the app, not inside the widget itself (widgets can't host that). The widget's job is display + a fast on-ramp back into the app.

### 3.3 Music (Spotify)

Both partners connect their Spotify accounts (OAuth). When one partner is playing something, the other's widget can show it: album art, track title, artist, and a line like "{name} is listening to {song}." Since Spotify has no push mechanism, this needs a polling strategy (e.g., poll on a schedule server-side, or poll when the app is foregrounded, and push a widget-reload trigger when the track changes meaningfully). Set expectations that this will be "recently listening," refreshed on an interval, not literally live-live.

### 3.4 Smart stack behavior

Reliable, buildable version: each time the partner's app is opened (or, if going the native-widget route, using an App Group flag that tracks "last shown item"), the widget shows the next item in priority order (photo, then drawing, then music), advancing one step per open, cycling back to the top once all have been seen. This is straightforward to implement and test.

Stretch goal, build only after the above works and is tested: while the user is actively engaged with a Live Activity or the app's own in-app widget preview, rotate through the three content types every ~15 seconds. Treat this as its own milestone gated behind the core stack working, since it depends on Live Activities specifically rather than standard widgets, and don't let it block the rest of the app.

### 3.5 Home screen

Title of the app at the top. Below it, a 2x2 grid of buttons arranged with plus-shaped spacing between them (i.e., a visible cross/gap pattern separating the four quadrants) — three buttons wired to Photo, Drawing, and Music/Spotify-connect respectively, and a fourth left as a visibly-present but non-functional placeholder for a future feature. Below that, a bottom tab bar in the style of Instagram's tab bar, with two tabs for now: Home (this screen) and Shitlist.

### 3.6 Shitlist

A simple checklist, modeled directly on Apple Notes' checklist UX: add an item, tap to check it off (strikethrough or similar), items persist. No categories or extra structure needed for v1.

## 4. Backend & data needs

Plan for: user accounts and partner-pairing (an invite-link or code that links exactly two accounts together), storage for photos and drawings with a sent/seen state, a push notification service to trigger widget/timeline reloads on the receiving device, Spotify OAuth token storage and refresh handling, and an App Group–backed local cache on-device so the widget extension can render the latest state without a network call of its own. For a project this size, prefer a fast-to-stand-up managed backend (e.g. Supabase or Firebase) over building custom infrastructure, and say so explicitly in the plan if you choose otherwise.

## 5. How to execute this build

Work in the following staged milestones. After each milestone: run the linter and typechecker, build the app (simulator build at minimum), write and run tests for anything with real logic (stack priority/advancement logic, pairing logic, checklist CRUD), and do a self-review against that milestone's acceptance criteria before starting the next one. Keep a running PLAN.md/CHANGELOG.md documenting decisions, what was completed, and what was verified at each stage — this is the artifact I'll use to check in on progress.

Suggested milestones: (0) project scaffolding, CI, and the architecture decision from section 2; (1) accounts, partner pairing, and backend skeleton; (2) home screen UI, tab bar, and the Shitlist feature end-to-end; (3) photo capture → send → widget display, fully working on-device/simulator, including the App Group plumbing and push-triggered reload; (4) drawing canvas and the round-trip add-and-return flow; (5) Spotify OAuth and now-playing display; (6) smart-stack priority and open-based advancement; (7) the stretch-goal 15-second live rotation via Live Activities; (8) polish and a final full-flow test pass.

Flag for me, rather than silently deciding, anything with real cost or account implications — an Apple Developer account for TestFlight, Spotify Developer app registration and its API quota terms, and choice of backend hosting and its cost. If at any point a requirement in this spec turns out not to be achievable as literally described on iOS (beyond what's already flagged above), stop and propose the closest compliant approximation instead of quietly reinterpreting scope.
