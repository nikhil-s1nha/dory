---
name: ios-device-build
description: Build, install, and verify Bundles on Nikhil's physical iPhone — device selection, first-time device registration, Release builds, and confirming the app actually launched. Use this whenever a change needs on-device verification rather than the simulator (widgets, camera, push, anything visual), whenever the user says "put it on my phone" / "build to my device" / "test on the iPhone", and whenever a device build fails with a provisioning, signing, or "No script URL" error. The simulator cannot verify widgets or the camera, so reach for this skill rather than suggesting a simulator run as a substitute.
---

# Building Bundles to a physical iPhone

The simulator can't show widgets (they frequently never appear in its gallery) and has no camera, so
the phone is the only real verification surface. This is the sequence that works, in order. Each step
exists because skipping it produced a specific failure — those are called out so you can recognize
them instead of rediscovering them.

The whole run is: **pick the device → confirm it's actually connected → register it if it's new →
build Release → verify it launched.** Don't report success before the last step.

## 1. Pick the right device — and confirm the tunnel is up

```sh
xcrun devicectl list devices
```

Previously-paired iPhones stay in this list **forever**, and both Expo and `xcodebuild` will happily
target a dead one. Picking the first iPhone you see is the most common way to waste ten minutes: the
last run here targeted a stale iPhone 12 while the actual phone in the room was an iPhone 17.

Take the candidate's identifier from that list and check its real state:

```sh
xcrun devicectl device info details --device <identifier> \
  | grep -iE "udid|tunnelState|ddiServicesAvailable|developerModeStatus"
```

You need `tunnelState: connected` and `ddiServicesAvailable: true`. Anything else means it's the
wrong entry or the phone isn't ready — **do not start a build**, it will fail late and slowly.

Use the **hardware UDID** from that output (`00008150-…`) for every later command, not the list's
identifier column.

If the state is bad, in this order of likelihood:

- **Phone is locked.** By far the most common cause. Get the definitive answer from the DDI mount
  attempt, not from `lockState`:

  ```sh
  xcrun devicectl device info ddiServices --device <identifier>
  ```

  A locked phone fails with `kAMDMobileImageMounterDeviceLocked: The device is locked.` — unambiguous,
  and worth quoting to the user so the ask doesn't sound like a guess. Don't rely on
  `devicectl device info lockState` for this: it reports `passcodeRequired` and `unlockedSinceBoot`,
  which stay `true`/`true` on a phone that is locked *right now*, so it reads as fine when it isn't.

  Then ask for the phone unlocked and on the home screen, with Auto-Lock → Never (Settings → Display
  & Brightness). A device compile is long enough to re-lock mid-install and drop the DDI mount.
- **Cable/pairing hiccup.** Unplug and replug once; tap Trust on the phone if prompted.
- **Developer Mode off** (Settings → Privacy & Security → Developer Mode). Real, but rarely the
  cause — the last time this was blamed, Developer Mode was already on and the phone was just locked.
  Check the device details output before sending the user into Settings.

## 2. Don't re-ask for signing credentials

`DEVELOPMENT_TEAM = K4MBJGZLNY`, automatic style, belongs on all four configurations in
`ios/Bundles.xcodeproj/project.pbxproj`. Verify rather than ask:

```sh
grep -c "DEVELOPMENT_TEAM = K4MBJGZLNY" ios/Bundles.xcodeproj/project.pbxproj   # expect 4
```

**This is now emitted by a config plugin — do not re-apply it by hand.**
`plugins/with-signing-and-versioning.js` (listed in `app.json`) sets `DEVELOPMENT_TEAM` and
`CODE_SIGN_STYLE = Automatic` on every signable target, including `ExpoWidgetsTarget`, on every
prebuild. The count above should be 4 straight out of `expo prebuild`.

The `perl -pi -e` that used to live here is obsolete; running it now just duplicates lines. If the
count *is* wrong after a prebuild, the plugin didn't run — check it is still listed **before**
`expo-widgets` in `app.json` `plugins` (Expo runs mods last-registered-first, so earlier in the
array means later at runtime) rather than patching the pbxproj. See
`.claude/skills/testflight-release/` §3.

**Apple ID vs Team ID** — these get conflated, and the confusion sends people to the wrong fix:

- The **Team ID** (`K4MBJGZLNY`) is the 10-character account identifier baked into the project. It is
  not secret and it is already set. Never ask for it again.
- The **Apple ID** is the login. It has to be signed into Xcode (Xcode → Settings → Accounts) for
  automatic provisioning to talk to Apple. Nothing is pasted anywhere for this.

So: a build failing to *authenticate* or *create profiles* means the Apple ID isn't in Xcode's
Accounts. It does **not** mean the Team ID is wrong. Don't go hunting for a Team ID to fix an
auth error.

The extension's bundle id must be prefixed by the app's (`com.nikhilsinha.bundles` →
`com.nikhilsinha.bundles.widgets`), which it already is.

**Automatic signing from the command line does NOT register App Groups.** This was previously
recorded here as auto-handled; it isn't, and the rename to Bundles proved it over two failed builds.
`xcodebuild`/`expo run:ios` will not create an App Group identifier, and when the group is missing it
silently falls back to the wildcard `iOS Team Provisioning Profile: *`, which supports neither App
Groups nor Push. The failure reads as seven signing errors:

```
Provisioning Profile "iOS Team Provisioning Profile: *" does not support the App Groups capability.
Provisioning profile "…" doesn't include the aps-environment and com.apple.security.application-groups entitlements.
```

Retrying the build does not help. Fix it once, per bundle id:

1. Create the group in the portal — [Identifiers → App Groups](https://developer.apple.com/account/resources/identifiers/list/applicationGroup)
   → ＋ → App Groups → identifier `group.com.nikhilsinha.bundles`. Only the *portal* can create this.
2. Open `ios/Bundles.xcworkspace` in the **Xcode GUI** and visit Signing & Capabilities for **both**
   the `Bundles` and `ExpoWidgetsTarget` targets. The GUI registers the App IDs and attaches App
   Groups (plus Push on the app target); the command line will not do this for you.

Confirm real profiles exist before rebuilding — this takes seconds and saves a full arm64 compile:

```sh
find ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles -name "*.mobileprovision" -mmin -120 \
  | while read -r f; do security cms -D -i "$f" | grep -q "group.com.nikhilsinha.bundles" && echo "$f"; done
```

Expect two: `com.nikhilsinha.bundles` (with `aps-environment`) and `com.nikhilsinha.bundles.widgets`
(without — push is app-target only, by design).

## 3. If the phone has never been built to before, register it explicitly

Don't ask the user whether the phone has been built to before — they often won't remember, and you
can just look:

```sh
xcrun devicectl device info apps --device <identifier> | grep -i bundles
```

If Bundles is already installed, the device is already on the team's device list and this whole step is
a no-op — skip straight to §4. Only run the registration pass when it's absent.

A device Apple has never seen fails like this, on **both** targets:

```
Provisioning profile "…com.nikhilsinha.bundles.widgets" doesn't include the currently selected device
Provisioning profile "…com.nikhilsinha.bundles" doesn't include the currently selected device
```

The instinct is to retry, on the theory that the failed pass registered the device and the next one
will pick up the updated profile. **That does not work** — it was tried and produced a byte-identical
failure. Root cause: `expo run:ios` passes `-allowProvisioningUpdates` but not
`-allowProvisioningDeviceRegistration` (Xcode 13+), so the UDID is never added to the team at all.

Call `xcodebuild` directly, once, with the flag Expo omits:

```sh
xcodebuild \
  -workspace ios/Bundles.xcworkspace \
  -scheme Bundles \
  -configuration Release \
  -destination "id=<UDID>" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build
```

This adds the UDID to the team's device list and regenerates **both** profiles to include it. It's a
full first-time arm64 compile, so it's slow — that's expected, not a hang. Once it succeeds, the
device is registered permanently and `expo run:ios` works normally from then on. You only ever do
this per new phone.

macOS may show a "codesign wants to sign using key in your keychain" prompt during this — tell the
user to click **Always Allow** before starting, so it doesn't block the build unattended.

## 4. Build Release — never debug

```sh
npx expo run:ios --device <UDID> --configuration Release
```

`expo-dev-client` is not installed in this project, so a debug device build is a plain React Native
debug build: it looks for Metro at whatever LAN IP was baked in at build time. On a phone there's no
localhost fallback (localhost is the phone), and the Mac's IP shifts between sessions. The result is
a red bar on launch:

```
No script URL provided. Make sure the packager is running …
unsanitizedScriptURLString = (null)
```

Release embeds `main.jsbundle` in the app, so it runs standalone — no Metro, no tether, survives
Wi-Fi changes. That is also how the app genuinely runs, which is what you want to be verifying.
Signing and APNs behaviour are unaffected by the configuration (development installs still register
against **sandbox** APNs either way).

Don't try to fix "No script URL" by chasing Metro networking. The fix is the Release rebuild.

If Fast Refresh on device ever becomes worth it, that requires installing `expo-dev-client` and a
native rebuild — a deliberate change to the project, not something to do mid-debug.

## 5. Verify it actually launched — this is the step that ends the task

**Don't wait for `expo run:ios` to exit.** Even in Release it starts Metro and sits on
`Waiting on http://localhost:8081` forever, so a backgrounded build task never completes and there is
no completion notification coming. Drive off the log (`Build Succeeded` → `Installing …` →
`✔ Complete 100%`) and the process check below, then kill the task — a Release build has an embedded
bundle and needs no Metro at all.

A green build is not a running app. Before the rebuild, capture what's running:

```sh
xcrun devicectl device info processes --device <UDID> | grep -i bundles
```

After the install completes, run it again. You're looking for two entries with **new PIDs**:

- `…/Bundles.app/Bundles` — the app
- `…/Bundles.app/PlugIns/ExpoWidgetsTarget.appex/ExpoWidgetsTarget` — the widget extension

The PID comparison matters: the old build's processes can still be running, so unchanged PIDs mean
the install didn't land even though the build passed. Same-PID output is a failure, not a pass.

Interpreting the result:

- **App process present with a new PID** → the install landed and the app launched. This is the bar.
- **App present, extension missing** → usually just means no widget is currently placed on the home
  screen, so WidgetKit hasn't spawned the extension. Don't loop waiting for it; ask the user to
  add the widget (long-press home screen → ＋ → search Bundles), then re-check.
- **Neither present** → the install didn't take, or the app is sitting behind the Untrusted Developer
  gate. See the decoder below.

Only after the app process is confirmed do you report success — and say what you actually observed
("Bundles running on device, PID 1100, new container") rather than "build succeeded." If you can't
confirm it, say that plainly instead of implying the deploy worked.

One thing the process check can't see: what's on the screen. When the change being verified is
visual — a widget render, a screen fix — the process check proves delivery, not correctness. Don't
treat a running process as evidence the UI is right.

**Photograph it yourself with `tools/widget-shot/` rather than asking the user** (see the CLAUDE.md
section): `./shoot.sh` walks the home-screen pages and prints the props the app delivered alongside
the picture, `testOpenDeepLink` shows where a `bundles://` URL actually lands, and
`testCaptureNotificationCenter` shows whether a push arrived. Fall back to asking a human only for
things the harness genuinely can't reach — physically tapping a widget, or the camera.

## 6. Failure decoder

| Symptom | Cause | Fix |
|---|---|---|
| `tunnelState: unavailable`, `ddiServicesAvailable: false` | Phone locked (usually), or you picked a stale device entry | Unlock + Auto-Lock Never; confirm you're on the right entry |
| `doesn't include the currently selected device` | New device never registered; retrying won't help | The `xcodebuild` registration pass in §3 |
| Auth / profile-creation failure | Apple ID not signed into Xcode | Xcode → Settings → Accounts → ＋ (not a Team ID problem) |
| `No script URL provided … (null)` | Debug build with no dev-client and no reachable Metro | Rebuild `--configuration Release` |
| "Untrusted Developer" on first launch | Cert not yet trusted on the phone | Settings → General → VPN & Device Management → the Apple ID → Trust, reopen Bundles |
| Background build task exits **144** | A superseded build or a killed Metro — a signal, not a failure | Ignore the code; confirm via the process check in §5 |
| Widget still renders the old thing after a fixed build installs | A placed widget holds stale extension state | Long-press the widget → Remove → re-add |

## 7. After a widget-extension change

A native Swift change — including the patch-package patch to `expo-widgets` that supplies
`containerBackground` — needs a full extension recompile; a JS re-bundle alone won't carry it. And a
widget already on the home screen must be removed and re-added, or it keeps showing the previous
render. Both of these masked a *working* fix during the containerBackground debugging. See
`.claude/skills/widget-debugging/` for diagnosing what the widget is actually rendering.

## 8. Push / APNs notes

- The APNs `.p8` auth key downloads **exactly once, ever**. It lives at gitignored `.apns-key.p8`;
  the Key ID is recoverable from the original filename (`AuthKey_<KEYID>.p8`).
- **A key is not necessarily account-wide.** This section used to claim one key "covers both sandbox
  and production." That is false, and believing it nearly shipped a TestFlight build with every push
  silently dead. When you create a key, Apple offers an environment restriction, and a restricted key
  returns `403 InvalidProviderToken` against the other gateway — not a warning, a hard rejection.
  This account now holds two, restricted in *opposite* directions:

  | Key | Environment | Gateway it works against |
  |---|---|---|
  | the original `.apns-key.p8` | Sandbox only | `api.sandbox.push.apple.com` |
  | `8323H4JG5F` | Production only | `api.push.apple.com` |

  Apple caps you at two keys per account, so this pair cannot simply be replaced with one unrestricted
  key without revoking one first. `supabase/functions/notify-activity/` therefore holds both and picks
  per request from the token row's `environment` column, with a per-key JWT cache.
- Builds installed by `expo run:ios` — Debug **or** Release — register against **sandbox** APNs. A
  TestFlight or App Store build registers against **production**. This is why the bug above was
  invisible: every install to date was sandbox, so the production key was never exercised.
- A `400 BadDeviceToken` says nothing about the rest of your request. APNs validates the device token
  *before* the topic, push type, and body, so a malformed payload and a correct one produce the same
  response against a stale token. A control probe in this project confirmed it: a stripped body, an
  oversized body, a foreign topic, and a wrong push type all returned identical `BadDeviceToken`.
  Never read that status as evidence the envelope is right.
- The Push Notifications capability belongs **only on the main app target**, not the widget
  extension. The extension needs App Groups alone — it reads the shared container and never receives
  a push. Its absence under `ExpoWidgetsTarget` is correct by design, not a misconfiguration.

## When Bash is unavailable

If tool calls start failing on the harness side (the command classifier has gone down mid-build
here), don't idle. Hand over the exact commands prefixed with `!` so the output lands back in the
conversation:

```
! xcrun devicectl list devices | grep -i iphone
! npx expo run:ios --device <UDID> --configuration Release
```

Then keep driving from the pasted output, and take the build back over when the tool recovers.
