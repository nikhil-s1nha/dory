---
name: widget-debugging
description: Diagnose the expo-widgets home-screen widget — blank renders, containerBackground errors, silently-empty App Group containers, the 'widget' directive transform, and what can and cannot be verified on the simulator. Use when the widget doesn't render or shows stale/no data.
---

# Debugging the Dory widget

The pipeline is: app foreground → `useWidgetSync` → `syncWidgetOnOpen` (`src/lib/widget-sync.ts`)
downloads the chosen image into the App Group container → `DoryWidget.updateSnapshot(props)` →
WidgetKit renders `widgets/dory-widget.tsx`. The widget itself never touches the network.

## Ground truth is the App Group container, not the logs

`console.log` from the app frequently does not stream to Metro in this setup. Don't build a debug
loop on it. Instead:

- Screenshot the app (a redbox will otherwise look like "the sync silently did nothing").
- Inspect the container on disk: `group.com.nikhilsinha.dory/ExpoWidgets/` should hold
  `photo-<id>.jpg` / `drawing-<id>.jpg` / `album.jpg` plus the snapshot `.plist`.

`syncWidgetOnOpen` ends in a bare `catch { /* leave last good snapshot */ }`, which swallows the real
error. If the container is empty and nothing crashed, temporarily add stage-by-stage logging plus
`catch (e) { console.log('[widget-sync] ERROR', String(e)) }` — then remove it once fixed.

## On a physical device, read the props WidgetKit was actually handed

You can't screenshot a home-screen widget from the CLI, but you don't need to — the exact props are
readable off the device, which beats reasoning from pixels:

```sh
DEV=<device-identifier>   # from `xcrun devicectl list devices`
xcrun devicectl device copy from --device $DEV \
  --domain-type appGroupDataContainer --domain-identifier group.com.nikhilsinha.dory \
  --source Library/Preferences/group.com.nikhilsinha.dory.plist --destination /tmp/w.plist
plutil -convert json -o - /tmp/w.plist | jq '.__expo_widgets_DoryWidget_timeline[0]'
```

That yields `{props: {kind, imageFile, deepLink, title…}, timestamp}` — the stack item, the exact
`media_items` row (via `deepLink`), and the App Group file path. Note the images live under
`ExpoWidgets/` in that container; a plain `devicectl device info files` listing of the group root
doesn't show them, so don't conclude the container is empty from that alone.

You can also drive the sync yourself instead of asking the user to tap:

```sh
xcrun devicectl device process launch --device $DEV --terminate-existing --activate com.nikhilsinha.dory
```

Each cold launch fires `useWidgetSync`'s mount sync → `advanceStack` → `updateSnapshot`.

**Always check `timestamp`, not just `kind`.** `syncWidgetOnOpen` swallows every error in its bare
`catch` and leaves the previous snapshot in place, so a failed sync returns a perfectly plausible
plist. An unchanged `timestamp` between rounds means the sync did **not** run — treating that as a
result will have you "confirm" behaviour that never executed.

Two artifacts of driving it this way, so you don't misread them as product bugs:

- `--terminate-existing` SIGKILLs the app, which can land before React Native flushes
  `AsyncStorage.setItem(CURSOR_KEY, …)` to disk. The cursor then replays and you see the same item
  twice in a row. Real backgrounding doesn't hit this nearly as often.
- Give the app ~8-10s between launch and reading the plist: the sync does a network fetch, a signed-URL
  round trip, and an image download before it calls `updateSnapshot`.

## Simulated `now_playing` has a ~2 minute lifespan

`supabase/migrations/0007_spotify_poll_cron.sql` schedules the `spotify-poll` Edge Function on pg_cron
**every 2 minutes**, and it overwrites `now_playing` for every user. Hand-seeded music rows get reset
to `track_id = null` on the next tick, which drops `music` out of the stack's present-items list and
silently changes the rotation arithmetic (three items to two, so the cursor lands somewhere else than
you predicted). If you need music present for longer than a couple of minutes, connect a real Spotify
account or pause the cron job — don't debug the widget for it.

Note `fetchPartnerNowPlaying` keys off `track_id`, not `is_playing`: a paused track with a `track_id`
still counts as present.

## The four failure modes we actually hit

**1. `createWidget` throws "the 2nd argument cannot be cast to String".**
The `'widget'` directive is a Babel transform (`babel-preset-expo`'s `widgets-plugin`) that replaces
the component with a string bundle reference. With no `babel.config.js` the plugin isn't guaranteed
to run and the raw function reaches native. `babel.config.js` exists for exactly this reason — do not
delete it, and clear the Metro cache after touching it.

**2. `ReferenceError: Can't find variable: <X>` inside the widget.**
The directive serializes only the component's **function body**. Module-scope constants declared above
the component are not in scope in the widget runtime. Everything the widget reads must live inside the
`DoryWidget` function body (this is why the colour constants sit there).

**3. "Please adopt containerBackground API" instead of a render.**
iOS 17+ requires the **top-level** view WidgetKit renders to declare a container background.
expo-widgets never applies one (expo/expo#46200), and a JS-level `containerBackground` modifier on an
inner node is never seen at the top level. Fixed by `patches/expo-widgets+57.0.6.patch`, which splits
`WidgetsEntryView.body` into a `@ViewBuilder content` and wraps it with an availability-guarded
`.containerBackground(for: .widget)`. It auto-applies via the `postinstall` script.

If you regenerate that patch: `patch-package` will also capture the generated `ExpoWidgets.bundle`
build artifact inside `node_modules/expo-widgets`, producing a ~149KB patch. Remove the artifact
first so the patch stays the ~31 lines of Swift it should be.

**4. The widget never appears in the simulator's widget gallery.**
This is an Apple-documented Simulator bug ("widgets might not appear in the widget gallery when using
Simulator"), not your code and not your UI automation. Reboot + reinstall does not help. Deployment
target mismatch is the *other* known cause — ours are all 16.4, so it's ruled out. Verify the data
pipeline on the simulator; verify rendering on a physical device (see `ios-device-build`).

Corollary: don't burn turns on coordinate-clicking the gallery open. That loop was explicitly called
out as a rabbit hole — search for the platform bug first.

## Known open issue — now narrowed to the repaint alone

The smart stack (photo → drawing → music, one step per app open) computes correctly *and delivers*.
Verified on device by the plist method above across 11 cold launches: all three kinds reached
WidgetKit with advancing timestamps, cycling in priority order. So `stack.ts`, the AsyncStorage cursor
(`dory.widget.cursor`, starting at `-1`), the App Group write, and `updateSnapshot` are all sound —
rule them out rather than re-investigating them.

What remains unverified is only whether the *live* home-screen widget visibly repaints when new props
land, since WidgetKit owns timing via its refresh budget and nothing on the CLI can observe the
rendered widget. Candidate fixes if it proves not to: call `reload()` rather than only
`updateSnapshot`, move to a real `updateTimeline`, and/or advance the cursor on app **background** so
the next glance is already fresh (today it advances on foreground — i.e. while the user is looking at
the app, not the widget).

Separately, note what the stack shows is **partner-only** media (spec 3.1/3.2). `fetchRecentMedia` is
couple-scoped and returns your own sends too, so `syncWidgetOnOpen` filters by `senderId` — without
that filter the widget shows you your own photo back, and a quiet partner looks like a broken widget.

## macOS automation, if you do need to drive the simulator

- AppleScript/System Events needs **Automation** permission (keystrokes) — enough to dismiss iOS's
  "Open in Dory?" alert on a `simctl openurl` deep link, since "Open" is the default button.
- Coordinate **clicking** through System Events additionally needs **Accessibility** permission and
  otherwise fails with `-25204`. Posting a synthetic mouse event through CoreGraphics from Python
  `ctypes` works without it.
- Flag either permission to the user *before* the step that needs it.
