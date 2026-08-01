---
name: ios-device-build
description: Build and install Dory on a physical iPhone — device selection, first-time provisioning, Release vs debug builds, and APNs key handling. Use when a change needs on-device verification (widgets, camera, push) rather than the simulator.
---

# Building Dory to a physical iPhone

The simulator cannot verify widgets (they often never appear in its widget gallery), the camera, or
push. Those all need the device. This is the sequence that works.

## 1. Pick the right device

```sh
xcrun devicectl list devices
```

Stale, previously-paired iPhones stay in this list forever and Expo will happily target one. Only
trust an entry whose `tunnelState` is `connected`; `tunnelState: unavailable` /
`ddiServicesAvailable: false` means it's the wrong entry (or the phone is locked).

- Keep the phone **unlocked** for the whole install — set Auto-Lock → Never first. A locked phone
  will not establish the developer tunnel.
- Developer Mode must be on (Settings → Privacy & Security → Developer Mode), but it is rarely the
  actual cause of a failure; check the device list first.

## 2. First build to a *new* device: register it explicitly

`npx expo run:ios --device <udid>` fails with:

```
Provisioning profile "...com.nikhilsinha.dory.widgets" doesn't include the currently selected device
```

Root cause: Expo passes `-allowProvisioningUpdates` but **not** `-allowProvisioningDeviceRegistration`
(Xcode 13+), so a device Apple has never seen is never added to the team. Retrying the same command
does nothing. Invoke `xcodebuild` directly **once** with the explicit flag to register the UDID and
regenerate both profiles (app + widget extension), then `expo run:ios` works normally forever after.

Note both targets need profiles — the widget extension bundle id **must** be prefixed by the app's
(`com.nikhilsinha.dory` → `com.nikhilsinha.dory.widgets`). App IDs and App Groups auto-register
through Xcode automatic signing; you do not create them by hand in the developer portal.

## 3. Build Release, not debug

```sh
npx expo run:ios --device <udid> --configuration Release
```

`expo-dev-client` is not installed, so a debug build is a plain RN debug build: it looks for Metro at
the Mac's LAN IP baked in at build time. On device there is no localhost fallback, and the Mac's IP
shifts between sessions — you get a red bar reading
`No script URL provided ... unsanitizedScriptURLString = (null)`.

Release embeds `main.jsbundle`, so the app runs standalone with no Metro tether. Signing and APNs
sandbox behaviour are unaffected by the configuration.

## 4. After a widget-extension change

A widget already placed on the home screen holds stale extension state and may keep showing the old
render (e.g. "Please adopt containerBackground API") after a fixed build installs. Long-press the
widget → Remove, then re-add it. A native Swift change (including the patched `expo-widgets`) needs a
full extension recompile — a JS re-bundle is not enough.

## 5. Push / APNs

- The APNs `.p8` auth key downloads **exactly once, ever**. It lives at gitignored `.apns-key.p8`.
  The Key ID is recoverable from the original filename (`AuthKey_<KEYID>.p8`).
- One key is account-wide, never expires, and covers both sandbox and production. Development builds
  register against **sandbox** APNs.
- The **Push Notifications capability belongs only on the main app target**, not the widget
  extension. The extension only needs App Groups — it reads the shared container and never receives a
  push. Its absence under the widget target is correct, not a misconfiguration.

## When Bash is unavailable

If tool calls start failing on the harness side, hand the user exact commands to run with the `!`
prefix (e.g. `! xcrun devicectl list devices | grep -i iphone`) so the output comes back into the
conversation, rather than idling.
