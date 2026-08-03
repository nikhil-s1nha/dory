# Dory

Expo SDK 57 (RN 0.86) iOS app for long-distance couples: a partner's photo, drawing, or now-playing track on a home-screen widget via `expo-widgets` + an iOS App Group, backed by Supabase.
Product spec: [SPEC.md](./SPEC.md). Status: [PLAN.md](./PLAN.md), [CHANGELOG.md](./CHANGELOG.md).

## Commands

- `npm run lint` / `npm run typecheck` / `npm test` — run all three; fixing a lint error routinely breaks types (and vice versa).
- `npm run ios` — simulator build. `npx expo prebuild` first if you added a native module or config plugin; JS-only changes need nothing but a Metro reload.
- `npx expo run:ios --device <udid> --configuration Release` — device build. First run on a *new* device fails signing; see `.claude/skills/ios-device-build/`.

## Commits

- One commit per verified unit of work, with lint/typecheck/test green — never a whole milestone in one, never a red gate.
- Conventional format: `feat/fix/chore(scope): summary`. Work on `expoApproach`; `main` is an empty root commit and stays clean.

## Build / environment gotchas

- `expo run:ios` "failed to activate Simulator window" **after** a successful compile is not a build failure — install with `xcrun simctl install` + `launch`.
- Background build tasks exiting **144** are signals (superseded build, killed Metro), not failures. Confirm via the install, not the exit code.
- `xcodebuild` listing *zero* simulator destinations means the iOS platform component is missing (`xcodebuild -downloadPlatform iOS`, ~8.5 GB) — not a simulator-selection problem. Don't kill it for looking hung.
- `expo prebuild` silently rewrites `package.json` scripts; diff before committing. Never install a native dep while a native build is in flight — batch them into one rebuild.
- Reinstalling/rebooting the simulator wipes the app container, including the injected test session — re-inject before testing.
- Metro `console.log` frequently doesn't stream here. Screenshot the app and inspect the App Group container on disk instead.
- `react-test-renderer` must match the exact React version Expo pins, or CI's `npm ci` breaks.

## Widget gotchas — see `.claude/skills/widget-debugging/`

- `babel.config.js` must exist. Without it the `'widget'` directive transform doesn't run and `createWidget` throws "2nd argument cannot be cast to String".
- The `'widget'` directive serializes only the component **function body** — module-scope constants are out of scope inside the widget runtime (`ReferenceError`).
- `containerBackground` is applied by a patch-package patch to `expo-widgets` (expo/expo#46200); a JS-level modifier alone does not satisfy WidgetKit. Regenerate patches excluding `ExpoWidgets.bundle`.
- After any change to the widget extension, long-press the widget → Remove → re-add; a placed widget holds stale extension state.
- Widgets often never appear in the **simulator's** widget gallery (Apple-documented). Verify the data pipeline on the simulator, visuals on device. The simulator also has no camera.
- **Widget images must be ≤600px on the long edge** (`WIDGET_RENDER_MAX_DIMENSION`). The extension
  shares a ~30MB budget with the expo-widgets **JS runtime**, so the real headroom is far less than
  30MB: measured on device, 4.0MB decoded rendered and 5.5MB did not. An over-budget render fails
  **silently** — no crash, no jetsam entry, no red box. WidgetKit just keeps displaying the last good
  snapshot, which reads exactly like "the widget is frozen". The cap is applied when writing into the
  App Group (`downloadToAppGroup`), not only at upload, so already-stored media is fixed too.
- Widget props carry an `_imageDebug` field the component ignores. It exists because the App Group
  plist is the *only* channel readable from the host — Metro logs don't stream, and `devicectl`'s
  app-group domain exposes only the `Library` subtree, never `ExpoWidgets/`.

## Backend / accounts — see `.claude/skills/supabase-ops/`

- No Docker or local Supabase stack: SQL is applied via the Management API. `P0001: DORY_RLS_OK` is the *success* sentinel of the RLS verification scripts.
- Redirect URI registered with Spotify is the HTTPS Edge Function URL, never `dory://` — custom schemes are rejected under Spotify's 2025 rules.
- Secrets arrive via `! pbpaste > .file`; add the `.gitignore` entry **before** writing the file, and never print the contents.

## Working style (corrections given more than once)

- Reproduce the user's literal interaction before declaring a UI bug fixed — a "same render path" proxy is not proof (the CoreGraphics NaN bug was declared fixed twice while still broken).
- After ~3 failed attempts at flaky simulator UI automation, web-search for a known platform bug instead of iterating.
- Verify on the simulator yourself before asking the user to test on their phone.
- Ask for credentials **all at once**, with click-paths; flag cost/account prerequisites (Apple Program, Spotify Premium) and macOS Privacy & Security toggles *before* a step needs them.
- Don't suppress `react-hooks/set-state-in-effect` — restructure to `const run = async () => {…}; run();` / `void fn()`.
- Never guess an Expo API surface. Read the installed `.d.ts` or the versioned docs (`docs.expo.dev/versions/v57.0.0/`) first — `@expo/ui/swift-ui`, `expo-file-system`, and `expo-image-manipulator` all bit us.
- `lineHeight` on a **multiline** `TextInput` makes iOS pass NaN to CoreGraphics — style rows with padding instead.
