# Changelog

Per-milestone record of what was built and what was **verified**. See `PLAN.md` for the plan.

## Backend audit — the whole Supabase side re-verified live (2026-08-31)

No code changed. This entry exists because the 2026-08-23 "Still open" block asserted two things
that a live check falsifies, and a stale blocker is more expensive than no blocker: it had this
project believing the backend needed work before TestFlight when it did not.

### Corrected
- 🔴 **The Management API token was never dead.** `GET /v1/projects/agnslitokcyvkboiklwn` returns
  **200**. The `401 Unauthorized` recorded on 2026-08-23 was transient, not an expired token, and
  nothing had to be re-issued. Every check below ran on the token already in
  `.supabase-access-token`.
- 🔴 **The content-state cap *was* deployed.** The deployed `notify-activity` bundle
  (`GET /functions/notify-activity/body`, v6) contains `CONTENT_STATE_MAX_BYTES`,
  `SENDER_NAME_MAX_CHARS` and `boundContentState`. The deploy is stamped 2026-08-23T10:02:31Z; the
  cap commit `9830a36` is stamped 2026-08-22T23:24:30Z — the deploy is *after* the commit. The
  earlier note read the two timestamps in the wrong order.

### Verified live against the cloud project
- **All five RLS suites pass**, each returning its sentinel: `BUNDLES_RLS_OK`,
  `BUNDLES_SHITLIST_RLS_OK`, `BUNDLES_MEDIA_RLS_OK`, `BUNDLES_PUSH_RLS_OK` (which carries the
  device-handover trigger assertion the stale note called unre-verified) and
  `BUNDLES_ACTIVITY_RLS_OK`.
- **RLS is enabled on all 12 public tables.** `spotify_oauth_states` holds 0 policies *by design* —
  RLS on with no policy is deny-all to clients, and only the service role touches it.
- **No source-to-deploy drift in any of the five Edge Functions.** Two deploy timestamps predate
  their last commit, and both are deploy-then-commit rather than drift, confirmed by grepping the
  deployed bundles rather than trusting the dates: `notify-partner` (deployed 2 min before commit
  `faa51c9`) contains `APNS_KEY_P8_PRODUCTION`, `APNS_KEY_ID_PRODUCTION` and
  `BadEnvironmentKeyInToken`, so the dual-key fix is live; `spotify-start` and `spotify-poll`
  (deployed 2026-07-23, first committed 2026-08-01 in `f027b71`, never modified since) match their
  source literals. **Checking a deploy by timestamp alone would have reported drift on three
  functions that have none.**
- **All 15 function secrets present**, including both APNs pairs
  (`APNS_KEY_P8`/`APNS_KEY_ID` and `APNS_KEY_P8_PRODUCTION`/`APNS_KEY_ID_PRODUCTION`).
- **The Spotify poller is healthy**: `cron.job` 1 active on `*/2 * * * *`, and 60 of 60 runs in the
  trailing two hours succeeded, latest 2026-08-31T12:46Z.
- Trunk gates green at 308 tests, 27 suites: `lint`, `typecheck`, `test`.

### Consequence
The backend is not a TestFlight blocker and never was. The two real blockers are unchanged and both
are outside Supabase: the App Store Connect app record (`POST /v1/apps` refuses by design) and
`Settings → Developer → Enable UI Automation` on the device for the Live Activity render proof.

## Live Activity backend, verified server-side (2026-08-23)

A test pass over everything in the push/backend stack that can be settled without owning the phone's
screen. Trunk 267 → 307 tests. Probes live in `tools/live-activity-probe/`; each one prints the raw
APNs status and body it measured, so a claim here can be re-run rather than believed.

### Found by doing
- 🔴 **A 200 from APNs does not validate the Live Activity envelope.** One field changed at a time
  against the *real* registered token: `attributes` omitted, `alert` omitted, `props` sent as a
  nested object, and `attributes-type: "BundlesActivity"` **all returned 200**. A wrong topic
  returned `400 DeviceTokenNotForTopic` and a wrong push type `400 InvalidPushType`. So a 200 proves
  the device token, the topic and the push type — and nothing about the body, which ActivityKit
  parses on the device. **This falsifies the claim in the previous CHANGELOG entry and in PLAN.md**
  that the earlier `sent:1` confirmed all five envelope properties; both are corrected.
- 🔴 **APNs accepts `liveactivity` payloads up to 5,120 bytes, ActivityKit accepts 4,096.** Bisected
  against the real gateway: 5,120 → 200, 5,121 → `413 PayloadTooLarge`. Anything the server emits in
  that 1 KB window is accepted by Apple, delivered, and dropped on the phone with nothing logged.
  `notify-activity` had **no server-side cap** — proven live, not inferred: a 6,000-character
  `display_name` (user-controlled, unbounded in 0001) made the deployed function answer
  `{"event":"start","sent":0,"failed":1,"pruned":0}`. Now capped, mirroring the client's constants.
- The full key × gateway matrix re-measured, both directions, with real response bodies:
  matched pairs `400 BadDeviceToken`, crossed pairs `403 BadEnvironmentKeyInToken`. The 403 arrives
  *before* the device token is examined, which is why a synthetic token is enough to measure it.

### Verified
- **Key selection** — 40 tests that load `notify-activity/index.ts` itself (babel-stripped, ambients
  replaced by spies) and assert the URL it posted to, the `kid` in the provider JWT it signed with,
  and the exact bytes it serialized. Covers per-row pairing when both environments appear in one
  request, the per-environment JWT cache, `APNS_FORCE_ENVIRONMENT`, the start/update/end envelopes,
  the prune rules, and the cross-gateway retry swapping the key with the host.
- **Live, against the cloud project**: registration upsert (one row, second value wins); a start with
  a real sandbox token *and* a synthetic **production** token →
  `{"event":"start","sent":1,"failed":0,"pruned":1}`, the `pruned` proving the production key and
  the production gateway moved together; the synthetic row gone afterwards and the real one intact;
  `update` and `end` both `pruned:1` with `ended_at` stamped and `update_token` nulled.
- **RLS, black-box**: 11/11 through PostgREST as the two seeded accounts — owner sees their own,
  partner sees `[]` on both tables, partner's update and delete of an owner row change nothing,
  inserting a row owned by someone else is `403 42501`, anonymous sees `[]`.

### Still open
- ~~`supabase/tests/verify_live_activity_rls_cloud.sql` could **not** be run: the Management API
  personal access token in `.supabase-access-token` now returns `401 Unauthorized`. The role-switching
  half of the RLS check and the device-handover trigger assertions are therefore unre-verified since
  2026-08-16, and the content-state cap above is **committed but not deployed**.~~
  **Closed 2026-08-31** — the 401 was transient and the cap was in fact already deployed. See the
  backend audit entry at the top of this file.

## Live Activities + TestFlight infrastructure (2026-08-16)

Built by four parallel agents in separate git worktrees, integrated through one serialised device
lane (one iPhone, one Xcode — that cannot be parallelised). Trunk went from 151 tests to 267.

### Built
- **Live Activities, push-to-start** — `widgets/bundles-activity.tsx` (lock screen + Dynamic Island
  compact/minimal/expanded), `src/domain/activity/*`, `src/hooks/use-live-activity.ts`,
  `supabase/migrations/0010_live_activity_tokens.sql`, `supabase/functions/notify-activity/`.
  Contract pinned up front in `docs/live-activity-contract.md`.
- **TestFlight pipeline** — `scripts/asc.mjs` (zero-dep App Store Connect client),
  `scripts/release-testflight.sh`, `plugins/with-signing-and-versioning.js`,
  `plugins/with-widget-privacy-manifest.js`, `.claude/skills/testflight-release/`.
- **Defect sweep** — auth resilience, widget cursor ordering, Shitlist optimistic reverts, camera
  error handling, preview loading state, CI triggers.

### Verified
- **On real hardware:** push-to-start token registered with `environment: sandbox` from the
  entitlement; a real start push returned `{"event":"start","sent":1,"failed":0}` from APNs.
- **Live on the cloud DB:** `BUNDLES_ACTIVITY_RLS_OK` — owner-only, partner reads nothing, device
  handover reassigns.
- **CI green on real code for the first time** (run 31997502502, 1m11s). The workflow triggered only
  on `main` — an empty root commit — so every prior "CI green" claim was local-only.
- `expo prebuild` + a full Release device build with both config plugins.

### Found by doing, not by reading
- 🔴 **Both APNs keys are environment-restricted, in opposite directions.** The existing key returns
  `403 BadEnvironmentKeyInToken` on production; a replacement returns the same on *sandbox*. Neither
  is universal, and Apple caps an account at two. **TestFlight would have shipped with all push
  silently dead** — including the already-working alert path, which had never hit it because every
  install to date is a sandbox build. Fixed by holding both keys and selecting per request from the
  token row's `environment`, with a per-key JWT cache (a single cache slot would have crossed the
  keys after the first 50-minute window).
- 🔴 **APNs validates the device token BEFORE the topic, push type and body.** A controlled probe —
  payload stripped, 5,212-byte payload, foreign topic, wrong push type — returned an identical
  `400 BadDeviceToken` in all four cases. This *falsified an earlier claim in this session* that a
  `BadDeviceToken` response proved the envelope was accepted. It proved only the provider JWT. The
  envelope stayed unproven until a real device token returned 200.
- **`.widgetURL()` was applied only inside expo-widgets' `dynamicIsland:` closure**, so a
  lock-screen tap had no link at all, `update()` couldn't change it, and a push-started activity
  never got one. Patched to derive the URL from the content state's `deepLink`, which fixes all
  three at once. `patches/expo-widgets+57.0.6.patch`, 31 → 91 lines.
- **The widget extension's privacy manifest resolved to a doubled path.** `ExpoWidgetsTarget`'s
  PBXGroup carries a `path`, the app's `Bundles` group does not — so copying the app target's
  shape yields `ExpoWidgetsTarget/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` and the build dies.
  Only a real compile catches this.
- **`expo-application` was declared in `package.json` but absent from the lockfile**, which makes
  `npm ci` fail. Invisible until CI actually ran — which it never had.
- **A widget-cursor bug of the same class the CHANGELOG already documents three times**: the cursor
  was persisted *before* the snapshot was built, so a failed download advanced past an item that was
  never rendered, silently. Now committed only after the snapshot lands. Proven by restoring the old
  ordering and watching the new tests fail.
- Cross-lane copy drift: the server's push-started frame said "drew you something" while the app's
  local update said "sent you a drawing" — a one-word flicker on every drawing.

### Two self-inflicted, recorded because they cost time
- Creating the worktrees *inside* the repo made jest discover all five checkouts (755 tests instead
  of 151). Fixed with ignore patterns — and the first fix was itself wrong: unanchored patterns match
  absolute paths, so a run started *inside* a worktree matched its own rootDir and reported "No files
  found", making every lane's gate **silently vacuous**. Now anchored to `<rootDir>`.
- A monitor written as "wait until count != 0" exited on a transient curl failure returning `null`,
  which read as a result. It wasn't.

### Still open
- **On-screen rendering of the Live Activity is unconfirmed.** `testLiveActivityVisibility` is
  written and committed; it needs `Settings → Developer → Enable UI Automation` on the device.
- **TestFlight upload** is blocked on the App Store Connect app record, which `POST /v1/apps` refuses
  by design (read/update only — a permanent API limitation, not a permissions problem).

## Push dispatch, widget tap, and the M7 stretch goal

**Built 2026-08-04.** Closes the two pieces the Phase B entry below lists as "Not built", and
settles the M7 stretch goal. Three branches / two stacked PRs: `feat/widget-deep-link` (#5),
`feat/push-dispatch` (#6), `feat/m7-widget-preview`.

### Built
- **The widget's tap deep-link now fires** — `widgets/bundles-widget.tsx`. `widgetURL` is applied to
  the root of each rendering branch; SwiftUI honours exactly one per view hierarchy, so it does not
  go on the children, and the empty state gets none. The `bundles://draw?base=<id>` round-trip entry
  point of spec 3.2 is reachable for the first time.
- **Push dispatch** — the largest gap named in `PLAN.md`.
  - `supabase/migrations/0008_push_tokens.sql`: `push_tokens` keyed on the device token, owner-only
    RLS, plus a BEFORE INSERT trigger that hands a device over when a second account signs in on it
    (RLS alone cannot express that delete, and without it the previous user's alerts follow the phone).
  - `supabase/functions/notify-partner/index.ts`: signs an ES256 APNs JWT with the project's `.p8`
    (Web Crypto, raw r‖s — APNs rejects DER), caches it for 50 minutes, and posts a **visible** alert
    to each of the partner's tokens. **Raw APNs, not Expo's push service** — this project owns its key
    and has no EAS credential setup. Takes only a media id and re-derives sender/couple/type from the
    row, so a caller cannot notify someone else's partner. Prunes dead tokens on 410/`BadDeviceToken`.
  - `src/lib/push.ts` / `src/hooks/use-push.ts`: registration, foreground presentation, widget refresh
    on arrival, and routing on tap (photo → full view, drawing → canvas preloaded, music → music).
    Sandbox-vs-production comes from the `aps-environment` entitlement via `expo-application`, **not**
    `__DEV__` — a Release build installed by Xcode is still sandbox, which is exactly how this app
    reaches the phone, so `__DEV__` would get every current install backwards.
  - Sign-out drops the device row *before* `auth.signOut()`, while RLS still permits the delete.
- **M7 — the in-app widget preview** (`src/components/widget-preview.tsx`,
  `src/hooks/use-widget-preview.ts`, `src/domain/widget/rotation.ts`, `deep-link.ts`): rotates
  photo → drawing → music every 15s on the home screen, below the 2×2 grid. It mirrors the widget's
  own SwiftUI tree against the same ≤600px App Group files, and cannot literally reuse the widget
  component — babel rewrites a `'widget'`-directive function into a *string literal*, so it isn't
  callable in the app bundle.

### Verified
- `lint` + `typecheck` clean; **150 tests, 16 suites** (was 118) — 19 covering push registration
  (row mapping, idempotent upsert, permission-declined, simulator, empty-token) and 23 covering
  rotation and deep-link parsing.
- **Live against the cloud project:** migration applied, `notify-partner` deployed with its three
  secrets, and the function returns 401 to an unauthenticated call. RLS verified by
  `BUNDLES_PUSH_RLS_OK` — including the property most easily got wrong here, that a *partner* has no
  read access at all (dispatch is service-role, so the couple-scoped visibility every other table
  grants would be wrong), and that the handover trigger reassigns a shared device.
- Release build compiled and installed on the iPhone 17 (app + widget extension both on new PIDs).

### Found by running it, not reading it (simulator, 2026-08-04)
Verified with a seeded test couple (created, exercised through RLS, and deleted afterwards):
- 🔴 **Every image was deleted from the App Group immediately after being placed there.**
  `File.move()` *mutates* the instance to point at its new location, so after `staged.move(target)`
  the `staged` object **is** the target — and the `finally` cleanup deleted the file it had just put
  in place. Not an edge case: `WIDGET_IMAGE_MAX_DIMENSION` and `WIDGET_RENDER_MAX_DIMENSION` are
  both 600, so every image the app uploads is already within the cap and always takes the "already
  small enough" branch, the one that moves rather than re-encodes. **The widget has therefore been
  unable to show any newly-sent media since the 600px cap shipped** (`c186227`) — which looks
  exactly like an empty widget, and is invisible to tests. The resize path builds a separate `File`
  from `saveAsync`'s output and was never affected, which is why older, larger media hid it.
  Found by streaming the simulator's `os_log`, not by reading the code.
- **The App Group subdirectory was never created.** `downloadToAppGroup` wrote into
  `widgetsDirectory` without ensuring it existed, and downloading into a missing directory throws.
  Proven, not guessed: after adding an idempotent `create`, the directory appeared in the `bundles`
  App Group container, which had been empty since the rename. **The first sync after any fresh
  install has been failing silently** — for the widget as much as the preview.
- **`media_items.sender_id` was `not null` with `on delete set null`** (`0003_media.sql:10`) — a
  self-contradiction that made it impossible to delete any account that had ever sent a photo or
  drawing (Postgres `23502`). Fixed to `on delete cascade` in `0009_media_sender_cascade.sql`,
  applied and confirmed by a delete that now succeeds.
- **Concurrent syncs collided on a fixed staging filename.** `downloadToAppGroup` staged every
  download at `staging-<name>`, so two overlapping calls raced and the second threw
  `DestinationAlreadyExists` (`FileSystemDownload.swift:160`) — swallowed, leaving the widget empty.
  **Not preview-specific:** `syncWidgetOnOpen` re-runs on every AppState `active`, so two quick
  foregrounds could already collide; mounting the preview beside `useWidgetSync` just made it happen
  every launch. Staging names are now per-call, the download is idempotent, and the target is
  cleared immediately before the move instead of at the top of the function.
- **Push asked for notification permission before checking for real hardware**, burning the one-shot
  iOS prompt on a simulator that can never receive a token. (Note: `Device.isDevice` still appears
  to report `true` on this simulator, so the prompt persists there — the guard is correct, the
  signal isn't reliable.)
- **The preview rendered an indefinite black rectangle** when its load failed, instead of the empty
  state.

### Verified on the physical device (2026-08-05)
Driven from `tools/widget-shot/` — no human thumb involved.
- ✅ **Push, end to end.** Simulated the partner sending a photo (admin-generated session, real
  upload, real `media_items` row), invoked `notify-partner` as them → `{"sent":1,"failed":0}` → the
  phone shows **"Alex — sent you a photo"** in Notification Center. The APNs JWT, the sandbox
  gateway choice and the visible-alert payload are all confirmed against real APNs.
- ✅ **Token registration on hardware.** `push_tokens` holds a 64-char APNs token for the signed-in
  user with `environment: sandbox` — which is the entitlement-based detection getting it right. A
  `__DEV__` check would have written `production` here and delivery would have failed.
- ✅ **The widget tap.** `bundles://draw?base=<id>` opens the canvas **with the partner's drawing
  preloaded**, ready to draw back — the spec 3.2 round-trip, working for the first time.
  `bundles://music` opens the music screen. This required a real fix; see below.
- ✅ **The widget renders what the app delivered.** Props said `kind: music, title: "Yellow"`, and
  the home screen showed album art + "Yellow" + "Coldplay" + "Alex is listening to …". Advancing the
  stack (drawing → music) changed both together, so render tracks props.

### Fixed here, found only on the device
- 🔴 **Deep links were dropped on cold start.** The feature screens sit behind
  `Stack.Protected guard={paired}`, and `paired` is false until the session and profile load — so a
  widget tap resolved its URL against a navigator that had no `/draw`, `/media/[id]` or `/music`
  yet. The route was discarded and the app landed on the tab home. Not a URL-format problem: both
  the two- and three-slash spellings failed identically. The launch URL is now replayed once the
  app can show it (`src/hooks/use-deep-link-replay.ts`).
- ✅ **M7 rotation is verified on the simulator.** With a seeded partner's photo and drawing, the
  preview showed the photo, then the drawing 15 seconds later, in priority order. Screenshots taken
  17s apart.

  Getting there uncovered the most serious bug of this whole pass — see below.

  Worth knowing: the simulator is a usable harness for this after all — sessions can be injected at
  `Library/Application Support/<bundle-id>/RCTAsyncLocalStorage_V1` (**not** `Documents/`, which is
  where older RN AsyncStorage kept it), and a swallowed error can be surfaced by temporarily
  rendering it into the preview's own props. That trick is what caught the staging-file race.

### Rejected, with evidence
- **The Live Activity branch of spec 3.4** was not built. Not for the expected reason: Apple's rate
  limit is scoped word-for-word to ActivityKit *push* notifications, and local `Activity.update(_:)`
  has no documented frequency cap. The blocker is that a Live Activity is shown "while your app
  isn't in use" — the foreground, the only place a 15s local rotation can run, is where it isn't
  visible. Spec 3.4 offers the in-app preview as an equal alternative, which is what was built. The
  visibility claim is HIG guidance rather than an API contract and has not been falsified on device.

## Phase B — the home-screen widget (M3 + M4 + M5 widget half)

**Shipped 2026-07-25 → 2026-08-03; recorded here 2026-08-04.** Apple enrollment cleared and Phase B
was built during the M5 device-verification push, but this changelog was never updated — six commits
(`d9e03c4` → `c186227`) went unrecorded. Written up now from the commits and the device evidence.

### Built
- **Widget target + App Group** (`d9e03c4`): `expo-widgets@57` configured in `app.json` — App Group
  `group.com.nikhilsinha.bundles`, widget bundle `com.nikhilsinha.bundles.widgets`, push entitlement,
  one `BundlesWidget` across small/medium/large.
- **The widget** — `widgets/bundles-widget.tsx`: renders the current smart-stack item from props
  pushed via `updateSnapshot` — photo/drawing full-bleed, music as album art + title + artist +
  caption, plus an empty state. Images are read from the App Group (`Image uiImage`); **the widget
  never touches the network**.
- **App-side sync** (`0d5d46d`) — `src/lib/widget-sync.ts`: on foreground, resolve the current item
  via the M5 stack logic, download its image into the App Group, `updateSnapshot`.
  `src/hooks/use-widget-sync.ts` (wired into `(tabs)/_layout.tsx`) advances the stack one step per
  open (spec 3.4) and refreshes on `AppState` active. This completes **M5's Phase B wiring**.
- **`babel.config.js`** — without it `babel-preset-expo` doesn't run, the `'widget'` directive isn't
  transformed, and `createWidget` throws "2nd argument cannot be cast to String".

### Fixed (all three found only on a physical device)
- **`containerBackground`** (`a856a1c`, `8d03a41`): iOS 17+ refuses to render a widget that doesn't
  declare its background. The `@expo/ui` JS modifier isn't seen at WidgetKit's required top level
  (expo/expo#46200), so it's applied by a **`patch-package` patch** to `expo-widgets`'
  `WidgetsEntryView`. Also moved the `BG`/`TEXT`/`MUTED` constants *inside* the component — the
  `'widget'` directive serializes only the function body, so module-scope consts throw
  `ReferenceError` in the widget runtime.
- **Own sends leaking into the stack** (`a0aee19`): `fetchRecentMedia` is couple-scoped, so the
  widget showed you your own photo back. Filtered by `senderId` per spec 3.1/3.2 — the widget is a
  window into *the partner*.
- **The frozen widget** (`c186227`): every image except the app logo failed to render. Cause was
  **decoded bitmap size** — the extension shares its ~30MB budget with the expo-widgets JS runtime,
  and an over-budget render fails *silently*, leaving WidgetKit on the last good snapshot. Measured
  on device: 4.0MB decoded rendered, 5.5MB did not. Fixed by capping the long edge at
  `WIDGET_RENDER_MAX_DIMENSION = 600` when writing into the App Group — not only at upload — so
  media already in Storage is repaired. Full history in [WIDGET-FREEZE.md](./WIDGET-FREEZE.md).
- Device polish (`a856a1c`): photo Send label was white-on-white; drawing canvas got a solid black
  Skia `<Fill>` + white default stroke + a visible toolbar; drawing Send no longer hangs (write the
  snapshot to a temp file and pass a `file://` URI instead of a giant data URI, which stalled
  `expo-image-manipulator` on device); the Spotify callback page auto-redirects into the app.

### Verified
- **On device, by home-screen screenshot** (`tools/widget-shot/`): photo, drawing, and music all
  render, and the per-open cursor advances through them. This is the definitive check — widgets
  frequently never appear in the *simulator's* widget gallery (Apple-documented).
- On simulator: extension compiles, the babel transform works, sync writes `photo-<id>.jpg` into
  the App Group and `updateSnapshot` writes the snapshot plist.
- 118/118 tests; typecheck + lint clean at each commit.

### Not built — Phase B is not finished
> **Superseded 2026-08-04.** Both items below were built; see the entry at the top of this file.

- **Push dispatch: no code exists.** `expo-notifications` is installed and the entitlement is on,
  but there is no token registration, no notification handler, and no push Edge Function. The
  widget therefore refreshes **only on app foreground**, and the visible "…sent you a photo" /
  "…drew you something" notification — the *reliable* channel per the constraint in `PLAN.md` —
  is absent. Spec 3.1/3.2 are not yet met.
- **The widget's tap deep-link never fires.** `buildProps` computes `deepLink` for every branch and
  `BundlesWidgetProps` declares it, but no branch of the widget tree applies a `widgetURL` modifier,
  so the prop is inert. Tapping opens the app wherever it was rather than
  `bundles://media/<id>` / `bundles://draw?base=<id>`, which breaks the spec 3.2 round-trip entry
  point even though both destination screens already work.

## M6 — Spotify OAuth + now-playing (foundation)

**In progress.** The pure logic and schema are built; the OAuth flow, Edge Functions, and
now-playing UI are blocked on Spotify credentials (below).

### Built
- **Spotify domain** (`src/domain/spotify/`): `parseCurrentlyPlaying` (currently-playing payload →
  compact `NowPlaying`, largest album image, null when nothing/again a non-track), `hasMeaningfulChange`
  (reload the widget only on track change or play/pause — never on mere progress, so we don't burn
  the widget budget polling), and token-lifetime helpers (`isAccessTokenExpired` with skew,
  `expiryFromExpiresIn`) + `SPOTIFY_SCOPES`. 12 unit tests.
- **Schema** (`supabase/migrations/0005_spotify.sql`): `spotify_accounts` (tokens, **owner-scoped**
  RLS — the partner never reads them; the poller uses the service role) and `now_playing`
  (couple-scoped read so the partner sees your track; client-read-only, written by the poller).
  Realtime enabled on `now_playing`.

### Verified
- Migration applied to the cloud project (2 tables, 2 policies, realtime on `now_playing`).
  `now_playing` uses the same couple-scoped RLS already verified in M2/M3.
- `npm test` — 112/112; typecheck + lint clean.

### Built — full OAuth + poller + UI (2026-07-23)
- **Edge Functions** (`supabase/functions/`, deployed): `spotify-start` (authenticated — mints a
  state tied to the caller, returns the authorize URL), `spotify-callback` (public — exchanges the
  code with the client secret, stores tokens, bounces back to the app via `bundles://`), `spotify-poll`
  (secret-gated — refreshes tokens as needed, reads currently-playing, upserts `now_playing`).
  Client id/secret + a poller secret live as Supabase function secrets; never in the repo.
- **Cron** (`0006` state table, `0007` schedule): `pg_cron` calls `spotify-poll` every 2 min via
  `pg_net`, with the shared secret read from **Vault** (not committed).
- **Connect architecture**: server-side token exchange (secret never touches the app). Redirect URI
  is the **HTTPS callback function** (`…/functions/v1/spotify-callback`) — Spotify tightened custom-
  scheme rules in 2025, so HTTPS is used; the `bundles://` scheme only bounces the browser back.
- **App** — `src/domain/spotify/repository.ts` (start connect, connection status, disconnect, read
  partner's now-playing) and `src/app/music.tsx`: "Connect Spotify" flow via `openAuthSessionAsync`,
  and the partner's now-playing card ("{name} is listening to {song}"), live via Realtime.

### Verified
- Functions deployed and smoke-tested live: `spotify-poll` returns `{polled:0}` with the secret and
  **403 without it**; `spotify-callback` bounces to `bundles://…?error=missing_code`; `spotify-start`
  (with a real user JWT) returns a valid authorize URL and creates the state row. Cron job scheduled
  and active.
- Music screen **rendered on the simulator** against live data: empty now-playing state + "Connect
  Spotify" (Alex not yet connected, no partner track). Repository calls hit the live DB cleanly.
- `npm test` — 118/118 (Spotify domain + repository); typecheck + lint clean.

### ✅ Verified LIVE end-to-end (2026-07-24)
Owner registered the redirect URI and connected a real Spotify account (as Alex). Confirmed the
whole chain with real data:
- OAuth round-trip completed; tokens stored; `spotify_accounts` row valid with the right scopes.
- The 2-min cron poller captured Alex's real current track and updated it on a song change
  (Cariad → All I Want) — polling + refresh working.
- **From the partner (Sam), the Music screen shows the album art, title, artist, and "Alex is
  listening to All I Want"** — the spec's exact copy. RLS confirmed: Sam reads Alex's `now_playing`
  but **cannot** read Alex's tokens (owner-only).

Spec 3.3 delivered in-app. Widget display of now-playing landed in Phase B and **renders on device**
(see the Phase B section at the top), so M6 is complete.
Minor: a dev-only "view warnings" toast appeared on the Music screen — non-blocking, to check later.

## M5 — Smart-stack priority & advancement (logic)

**Completed 2026-07-23.** The pure selection logic; App-Group cursor persistence and the widget
render land in Phase B (with the widgets).

### Built
- `src/domain/widget/stack.ts`: `WIDGET_PRIORITY` (photo > drawing > music), `orderedPresent`,
  `itemAtCursor` (render current), `advanceStack` (advance one step per app open, cycling),
  `cursorForType` (jump to a freshly-pushed item), and `INITIAL_CURSOR` so the first open shows
  the top-priority item. Tolerant of stale/out-of-range cursors (wraps instead of crashing).

### Verified
- `npm test` — 15 stack tests: priority ordering for every subset; photo→drawing→music cycling
  across opens; single-item and empty cases; content arriving/shrinking mid-cycle; cursor
  wraparound. typecheck + lint clean.

### Phase B wiring (with the widgets)
- ✅ On app open: read the cursor from the App Group, `advanceStack`, write it back + the resolved
  item for the widget. Delivered in `0d5d46d` (`src/lib/widget-sync.ts`,
  `src/hooks/use-widget-sync.ts`); cycling verified on device.
- ⬜ On a push for a new item: `cursorForType` so the widget jumps straight to it. Blocked on push,
  which is still unbuilt — `cursorForType` exists and is tested, but nothing calls it.

## Shitlist rework — fluid Apple Notes editing + NaN fix

**2026-07-23.** Addressed two issues reported from on-device testing.

- **CoreGraphics NaN on item creation — fixed (real cause: `lineHeight` on a multiline
  `TextInput`).** The first pass wrongly blamed `SymbolView`; that swap (→ `View`-based checkboxes,
  `FlatList` → `ScrollView`) was worthwhile but didn't stop the error, because the NaN fires during
  **text layout on focus/edit**, not on render. The actual trigger is a known React Native iOS bug:
  a `lineHeight` in a multiline `TextInput`'s style makes iOS pass NaN to CoreGraphics. Removed
  `lineHeight` from the item input (row alignment now comes from padding + the checkbox's marginTop).
  **Verified by reproducing the exact flow**: drove the simulator to tap "Add an item", which
  created + autofocused a new item, then typed into it — the syslog shows **no** CoreGraphics NaN
  (previously this threw). Reproduction used a synthetic mouse click (CoreGraphics event via ctypes)
  since the item text is drawn pixels, not an accessible control.
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
- **Round-trip** — opening `bundles:///draw?base=<mediaId>` loads that drawing as a Skia background
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

### Phase B (shared with M3) — partially delivered, see the Phase B section at the top
- ✅ Drawing widget: static render of the latest drawing — verified on device.
- ⬜ Tap → `bundles://draw?base=<id>` (the round-trip): `deepLink` is computed but inert in the widget.
- ⬜ Push dispatch + the visible "…drew you something" notification — **not built**.

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
  (`bundles:///media/<id>`) and in-app viewer; resolves a signed URL, displays the image, marks seen.
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

### Phase B — mostly delivered, see the Phase B section at the top
- ✅ App Group entitlement + container write (the widget-cache seam in `src/constants/app-group.ts`).
- ✅ `expo-widgets` widget rendering the latest photo — verified on device.
- ⬜ Tap → `bundles://media/<id>`: the `deepLink` prop is computed but never applied in the widget.
- ⬜ Push dispatch (Edge Function) + the visible "…sent you a photo" notification — **not built**.

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
- **Home screen** — `src/app/(tabs)/index.tsx`: "Bundles" title over a 2x2 button grid whose uniform
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
- App identity: name `Bundles`, slug `bundles`, bundle id `com.nikhilsinha.bundles`, scheme `bundles`.

### Built
- Expo SDK 57 app scaffolded via `create-expo-app` (default template: expo-router, TypeScript
  strict, `src/` layout). Project renamed from `scaffold` to `bundles`.
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
