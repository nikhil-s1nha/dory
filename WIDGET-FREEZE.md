# Investigation: the home-screen widget is frozen on one snapshot

> # ✅ RESOLVED 2026-08-03 — decoded bitmap size. Fixed in `c186227`.
>
> **Cause.** The widget extension shares its ~30MB budget with the expo-widgets **JS runtime**, so
> usable headroom is far below 30MB. An over-budget render fails **silently** — no crash, no jetsam
> entry, no red box — and WidgetKit keeps displaying the last good snapshot. That presents exactly as
> "the widget is frozen", which is what sent this investigation down several wrong paths.
>
> **Measured threshold** (decoded = width × height × 4):
>
> | Object | Decoded before | Rendered before | After downscale | Renders now |
> |---|---|---|---|---|
> | `10a39452` | 1024×1024 → **4.0MB** | ✅ | 600×600, 1.4MB | ✅ |
> | `fb31616a` | 1200×1200 → 5.5MB | ❌ | 600×600, 1.4MB | ✅ |
> | `4f6148a4` | 1200×1738 → 8.0MB | ❌ | 415×600, 0.9MB | ✅ |
> | `3c3cc075` | 1200×2422 → **11.1MB** | ❌ | 298×600, 0.7MB | ✅ |
>
> The cutoff is between 4.0MB and 5.5MB. The app logo rendered all along purely because it was the
> smallest decoded image in the bucket — that coincidence is what made this look like a
> music-versus-photo problem for hours.
>
> **Fix.** Cap the long edge at `WIDGET_RENDER_MAX_DIMENSION = 600` when writing into the App Group
> (`downloadToAppGroup`), not only at upload — so media already in Storage is repaired.
> `WIDGET_IMAGE_MAX_DIMENSION` lowered 1200 → 600 to match. Handles portrait, landscape and square,
> and skips re-encoding anything already under the cap.
>
> **Verified on device**, each by a home-screen screenshot showing the correct image, via
> `tools/widget-shot/`. File size is *not* a usable proxy — an 82KB object rendered while a 49KB one
> did not; only pixel dimensions matter.
>
> Everything below is the investigation history, including several theories that were raised and
> falsified. Kept deliberately: the dead ends are the expensive part to rediscover.

> ## ROOT CAUSE NARROWED 2026-08-03 15:30 — it is PER-FILE, not per-branch
>
> The photo branch **works**. Proven on device: pointing Alex's latest photo at storage object
> `10a39452` and parking the cursor there rendered the image on the home screen. So
> `aspectRatio` + `clipped`, App Group image loading, and the whole photo render path are fine —
> the modifier theory in the box below is **dead**.
>
> What actually predicts success is *which file*:
>
> | Storage object | Bytes | cacheControl | Renders? |
> |---|---|---|---|
> | `10a39452` (app logo) | 82 KB | `no-cache` | **yes** |
> | `fb31616a` (photo) | 49 KB | `max-age=3600` | no |
> | `4f6148a4` (drawing) | 69 KB | `max-age=3600` | no |
> | `3c3cc075` (photo) | 585 KB | `max-age=3600` | no |
>
> **File size is explicitly not the predictor** — 82 KB renders while 49 KB does not. `10a39452` is
> also the only object in the bucket with `no-cache`, and the only one not uploaded through the app.
>
> **Leading hypothesis: decoded pixel dimensions.** Everything uploaded through the app is resized to
> `WIDGET_IMAGE_MAX_DIMENSION = 1200` on the long edge (`src/domain/media/repository.ts:57`), i.e.
> ~1200×1600 → **~7.7 MB decoded**. The app logo is small and square (~1 MB decoded). 7.7 MB sounds
> safe against the 30 MB extension ceiling, but expo-widgets runs a **whole JS runtime inside the
> widget extension**, sharing that budget. A render that exceeds it fails silently — no crash log —
> and WidgetKit keeps the previous snapshot, which is exactly the observed behaviour.
>
> Note `repository.ts:38-42` already says the 1200 cap exists *because* of the 30 MB ceiling. The
> intent was right; the number is likely just too generous.
>
> **Proposed fix (also the test):** downscale the copy written into the App Group inside
> `downloadToAppGroup` (`src/lib/widget-sync.ts`), rather than only lowering
> `WIDGET_IMAGE_MAX_DIMENSION` — lowering the constant only affects *future* uploads and leaves every
> stored object broken. A medium widget is ~338×158 pt (~1014×474 px @3x), so a 600 px long edge is
> ample and decodes to under 2 MB. If the photo then renders, the hypothesis is confirmed.
>
> Caution when implementing: read the installed `expo-file-system` `.d.ts` for the `File` copy/move
> surface first. I burned time guessing at it — CLAUDE.md warns about exactly this.
>
> **Also ruled out this round:** refresh budget / latency. With props parked on `photo` and the app
> left closed, four captures over 2+ minutes never rendered it, while a *music* snapshot written 40
> seconds earlier had rendered fine. Delivery is not the issue; a specific render fails.

> ## ⚠️ UPDATE 2026-08-03 14:50 — THE FREEZE NO LONGER REPRODUCES
>
> A screenshot harness now exists (`tools/widget-shot/`, see §11) that photographs the phone's home
> screen, so the widget can be inspected without a human looking at it. Using it, the widget was
> observed cycling through **three different renders** — "Mr. Blue Sky" → "TALLER / Clinton K…" →
> "a thousand years / Christina Perri" — each matching what the database said was playing.
>
> **So WidgetKit does repaint, and §5's leading hypothesis is dead:** the "a thousand years" card
> renders *album art*, which is an image loaded from the same App Group directory that photos and
> drawings use. Image loading from the container demonstrably works.
>
> **What changed in between:** Spotify got connected, so `now_playing` now holds real, continuously
> refreshed data instead of the null rows that the pg_cron poller kept restoring. Music is therefore
> always present in the stack.
>
> ## CONFIRMED 2026-08-03 15:10 — the widget renders music, and *only* music
>
> Six capture cycles across two phases, each with the delivered props recorded alongside the render:
>
> | Cycle | Props delivered | Rendered on screen |
> |---|---|---|
> | A1 | `drawing` | music — a thousand years |
> | A2 | `music` | music — All I Want |
> | A3 | `photo` | music — All I Want |
> | B1 | `drawing` | music — All I Want |
> | B2 | `music` | music — Everybody Talks |
> | B3 | `photo` | music — Everybody Talks |
>
> **Photo and drawing never reach the screen.** When their props are delivered, WidgetKit keeps
> showing the last successful render, which is always the most recent music card. Music itself
> repaints reliably — B2 rendered a brand-new track in the same cycle its props were written, giving
> a **refresh latency under ~20–30s** from `updateSnapshot` to on-screen.
>
> **The two render paths differ only in their modifiers** (`widgets/bundles-widget.tsx`):
> - music album art — `resizable()`, `frame({width:56,height:56})`, `clipShape(...)` → **renders**
> - photo/drawing — `resizable()`, `aspectRatio({contentMode:'fill'})`, `clipped(true)` → **never renders**
>
> Both `aspectRatio` and `clipped` *are* registered natively
> (`@expo/ui/ios/Modifiers/ViewModifierRegistry.swift:1847,1851`), so they aren't simply missing —
> but note our call passes only `{contentMode:'fill'}` with no ratio value, which is worth checking
> against `AspectRatioModifier`'s expected params.
>
> **Image size is ruled out.** Every object in the `media` bucket is ≤0.56 MB and the ones in play are
> 50–70 KB — nowhere near the 30MB extension ceiling. Combined with the jetsam evidence below, §7.1
> is dead. And music's album art proves App Group image loading works in general.
>
> **Next experiment:** swap the photo/drawing branch to music's working modifier set
> (`frame` + `clipShape` instead of `aspectRatio` + `clipped`), rebuild, and capture. If the photo
> then renders, it's the modifiers; if not, it's something about the file itself. One build settles it.
>
> Everything below this box predates the harness — read it as history, not current state.

**Status:** downgraded from "frozen" to "unconfirmed for image branches", 2026-08-03.

**One-line symptom:** the app delivers new widget props correctly and WidgetKit is told to reload,
but the placed widget keeps rendering a snapshot from ~03:00 UTC on 2026-08-03 — surviving prop
updates, an extension process restart, and a widget remove/re-add.

---

## 1. What the user sees

The widget shows the music card — **"Mr. Blue Sky" / "Electric Light Orchestra"** — and never
changes. Opening Bundles repeatedly does nothing. Removing the widget and adding it back does nothing.

That music card corresponds to exactly one snapshot ever written, at timestamp `1785725976043`. Every
snapshot written since has been `photo` or `drawing`, and none of them has appeared on screen.

Note the significance of *which* item it froze on: **music is the only branch of `BundlesWidget` that
renders no image.** Photo and drawing both render `<Image uiImage={props.imageFile}>` from a
`file://` path in the App Group. That asymmetry is the strongest clue available.

---

## 2. Environment (as parked)

| Thing | Value |
|---|---|
| Device | iPhone 17, iOS 26.5.2 |
| Hardware UDID (for `expo run:ios`) | `00008150-001065A41445401C` |
| devicectl identifier (for `devicectl`) | `32482374-396E-5305-8C73-6AB7A47827B5` |
| App bundle id | `com.nikhilsinha.bundles` |
| App Group | `group.com.nikhilsinha.bundles` |
| App Group container UUID on device | `86A0078D-EDBE-4EF6-A66A-254814C2097F` |
| Installed build | Release, from commit `a0aee19` |
| Bundle container | `7C6E7159-702E-40DF-AA26-E403BDF5EF30` |
| Signed in on phone as | `sam@bundles.app` (user `7660b01e-…`) |
| Partner | `alex@bundles.app` (user `06a28969-…`), couple `99ca5d54-…` |

There is a stale **iPhone 12** in `devicectl list devices` permanently marked `unavailable`. Ignore
it; the iPhone 17 is the real device.

---

## 3. What is PROVEN

Each of these was verified directly on the device. Don't redo them.

### 3.1 The app delivers new props correctly

`updateSnapshot` writes to the App Group `UserDefaults` plist, and its timestamp advances on every
app open — including the user's own manual opens, not just scripted ones. Verified across 11 scripted
cold launches plus several manual opens.

```sh
DEV=32482374-396E-5305-8C73-6AB7A47827B5
xcrun devicectl device copy from --device $DEV \
  --domain-type appGroupDataContainer --domain-identifier group.com.nikhilsinha.bundles \
  --source Library/Preferences/group.com.nikhilsinha.bundles.plist --destination /tmp/w.plist
plutil -convert json -o - /tmp/w.plist | jq '.__expo_widgets_BundlesWidget_timeline[0]'
```

This is the single most useful tool in this investigation: it shows the exact props WidgetKit was
handed — `kind`, `imageFile`, `deepLink`, and a `timestamp`.

**Always check `timestamp`, not just `kind`.** `syncWidgetOnOpen` swallows every error in a bare
`catch` and leaves the previous snapshot intact, so a failed sync returns a completely plausible
plist. An unchanged timestamp means the sync did not run. This bit me once already.

### 3.2 The stack logic and rotation are correct

Across 11 launches all three kinds reached the plist — `music`, `photo`, `drawing` — cycling in
priority order with advancing timestamps. So `src/domain/widget/stack.ts`, the AsyncStorage cursor
(`bundles.widget.cursor`), and the App Group write are all sound.

### 3.3 WidgetKit *is* being told to reload

Traced through the library:

```
JS  BundlesWidget.updateSnapshot(props)
 └─ node_modules/expo-widgets/src/Widgets.ts:56
      this.nativeWidgetObject.updateTimeline([{ timestamp: Date.now(), props }])
 └─ node_modules/expo-widgets/ios/WidgetObject.swift:15  updateTimeline(entries:)
      writes __expo_widgets_BundlesWidget_timeline, then calls self.reload()
 └─ WidgetObject.swift:12  WidgetCenter.shared.reloadTimelines(ofKind: name)
```

So "the app never notifies WidgetKit" is **ruled out**.

One thing *not* yet checked: whether `name` (`"BundlesWidget"`) actually matches the `kind:` string the
generated widget extension registers with WidgetKit. If those differ, `reloadTimelines(ofKind:)` is a
silent no-op. **This is worth 10 minutes** — see §7.2.

### 3.4 The extension restarts, and doesn't crash

Extension PID moved `2993` → `3061` across the remove/re-add, so it is not a frozen process. And
there are no crash logs:

```sh
xcrun devicectl device info files --device $DEV --domain-type systemCrashLogs | grep -iE "widget|expo|Bundles"
```

returned nothing.

### 3.5 Timeline shape is not the problem

The stored timeline always has **exactly one entry**, whose date is `timestamp/1000` — i.e. the
moment it was written, always in the past. So this is not a "future-dated entry that WidgetKit is
waiting for" situation. The provider uses `policy: .atEnd`
(`node_modules/expo-widgets/ios/Widgets/TimelineProvider.swift:34`).

---

## 4. Corrections — things I concluded and then had to retract

Recorded so nobody re-derives them.

**"The widget only shows the partner's content, so your own uploads can never appear."** Wrong at the
time. `fetchRecentMedia` is couple-scoped with no sender filter, so the widget was showing the
viewer's own media back to them. That *was* a real bug, now fixed in `a0aee19` and verified on device
(with Sam's photo strictly newer than Alex's, the widget correctly kept showing Alex's).

**"`ExpoWidgets/` doesn't exist in the App Group container."** Not safe. It's true that
`devicectl device info files --subdirectory ExpoWidgets` fails while a control (`Library/Preferences`)
succeeds, and that `devicectl device copy from` on that path fails with a bogus-looking
`File paths cannot contain '..'`. **But** `WidgetsModule.swift:48-60` defines `widgetsDirectory` as a
`Constant` that calls `createDirectory(withIntermediateDirectories: true)` every time JS reads it, so
the directory is created on access. The devicectl failures are most likely a limitation of the
app-group domain view, not proof of absence. **Do not build on the "missing directory" theory without
confirming it from inside the app** (§6 does exactly that).

---

## 5. The leading hypothesis

**WidgetKit falls back to the last successfully rendered view when the extension fails to produce
one, and the image-rendering branches are failing.**

Fits:
- Frozen specifically on music, the only text-only branch
- Photo/drawing both depend on loading a `file://` image
- No crash (a render failure isn't necessarily a crash)
- Survives re-add (a fresh add still can't render the image, so the cached render persists)

**The awkward fact:** a photo *did* render successfully around 02:50, before the build-2 reinstall at
~02:57. So whatever breaks image rendering either arrived with that reinstall or is intermittent. Any
theory has to account for that. Candidates: the reinstall changed the app-group container's file
state; or the older image file survived while newer downloads don't land; or the download now fails
silently and the stale path is being reused.

---

## 6. THE NEXT EXPERIMENT (do this first)

Everything real is being swallowed by the bare `catch` in `syncWidgetOnOpen`, and Metro `console.log`
does not stream reliably in this setup. So make the app report its own state through the one channel
that is provably readable: **the widget props themselves.**

### 6.1 Instrument `src/lib/widget-sync.ts`

Temporarily extend `downloadToAppGroup` to report what actually landed, and surface the swallowed
error. Something like:

```ts
async function downloadToAppGroup(url: string, filename: string): Promise<string> {
  const dir = new Directory(widgetsDirectory);
  const target = new File(dir, filename);
  if (target.exists) target.delete();
  await File.downloadFileAsync(url, target);
  // TEMP DIAGNOSTIC: does the file actually exist after the download, and how big is it?
  console.log('[widget-sync]', filename, 'exists=', target.exists, 'size=', target.size);
  return target.uri;
}
```

and in `syncWidgetOnOpen`, replace the bare catch so failures become visible in the plist:

```ts
} catch (e) {
  // TEMP DIAGNOSTIC: surface the swallowed error through the only readable channel.
  BundlesWidget.updateSnapshot({
    kind: 'music',                      // text-only branch: renders without an image
    title: 'ERR',
    subtitle: String(e).slice(0, 120),
    caption: 'diagnostic build',
  });
}
```

Using the `music` branch for the error is deliberate — it's the branch known to render.

Even better if you have the appetite: add the diagnostic fields to the **success** path too, e.g.
pass `subtitle: \`exists=${exists} size=${size}\`` on a music-kind snapshot, so one launch tells you
whether the image file is real without needing an error at all.

### 6.2 Build and read it

```sh
npx expo run:ios --device 00008150-001065A41445401C --configuration Release
```

Verify the install actually landed (bundle container UUID must change — see
`.claude/skills/ios-device-build/` §5), then drive launches and read the plist:

```sh
xcrun devicectl device process launch --device $DEV --terminate-existing --activate com.nikhilsinha.bundles
# wait ~8-10s for fetch + signed URL + download
# then pull and inspect the plist as in §3.1
```

### 6.3 How to read the outcome

| Result | Meaning | Next move |
|---|---|---|
| `exists=false` or `size=0` | The download isn't landing; props point at a phantom file | Fix the write path — check `widgetsDirectory` resolution and whether `downloadFileAsync` silently no-ops |
| `exists=true`, sensible size, **but widget still frozen** | The file is fine; the failure is in rendering or in WidgetKit's reload | Go to §7 |
| An `ERR` card appears on the widget | Two wins at once: you have the real exception text, **and** it proves WidgetKit *can* still repaint | Fix the exception |
| The `ERR` card never appears even though you know it threw | WidgetKit genuinely is not repainting at all | Go to §7.2 first |

That last row is the cleanest signal in the whole plan: the diagnostic build doubles as a repaint
test, because an `ERR` card showing up *is* a successful repaint.

---

## 7. If the file turns out to be fine

In rough priority order.

### 7.1 Image size / extension memory
Widget extensions are killed at **30MB**. A full-resolution JPEG decoded in the extension can blow
that, and the symptom is a silent failure to render with no crash log. PLAN.md already records the
intent that "the widget only ever touches a ≤1200px derivative" — **verify that's actually being
enforced**, because `downloadToAppGroup` currently downloads whatever the signed URL returns, at full
size. This is my second-favourite hypothesis after §5 and it fits the no-crash-log fact well.

### 7.2 `reloadTimelines(ofKind:)` kind mismatch
Confirm the string in `WidgetCenter.shared.reloadTimelines(ofKind: name)` — where `name` is
`"BundlesWidget"` — matches the `kind:` the generated extension registers. Look in the generated
extension source under `ios/ExpoWidgetsTarget/` and in the `expo-widgets` config in `app.json`. A
mismatch makes every reload a silent no-op. Cheap to check, and it would explain the freeze without
any image involvement — though it would *not* explain the re-add doing nothing.

### 7.3 `uiImage` path format
Props carry a `file:///…` URI. Check whether expo-widgets' `Image uiImage` expects a URI or a plain
filesystem path. If it wants a path, strip the scheme. Read the installed `.d.ts` rather than
guessing — per CLAUDE.md, guessing Expo API surface has bitten this project repeatedly.

### 7.4 Fall back to forcing a repaint
If delivery is provably fine and the widget still won't repaint, the candidate fixes from the
original known-issue note still stand: call `reload()` explicitly rather than relying on
`updateSnapshot`; move to a real `updateTimeline` with a couple of future-dated entries; and/or
advance the cursor on app **background** instead of foreground, so the next glance is already fresh.

---

## 8. Tooling recipes

```sh
DEV=32482374-396E-5305-8C73-6AB7A47827B5
GROUP=group.com.nikhilsinha.bundles

# Is the device actually reachable? (needs the phone UNLOCKED — a locked phone can't mount the DDI)
xcrun devicectl device info details --device $DEV | grep -iE "tunnelState|ddiServicesAvailable"
xcrun devicectl device info ddiServices --device $DEV     # definitive "device is locked" error

# What the widget was handed
xcrun devicectl device copy from --device $DEV \
  --domain-type appGroupDataContainer --domain-identifier $GROUP \
  --source Library/Preferences/$GROUP.plist --destination /tmp/w.plist
plutil -convert json -o - /tmp/w.plist | jq '.__expo_widgets_BundlesWidget_timeline[0]'

# Drive a cold open (fires useWidgetSync -> advanceStack -> updateSnapshot)
xcrun devicectl device process launch --device $DEV --terminate-existing --activate com.nikhilsinha.bundles

# Did an install actually land? (bundle container UUID must change; new PIDs alone aren't proof)
xcrun devicectl device info processes --device $DEV | grep -i bundles
```

A ready-made loop lives in the scratchpad script `verify_rotation.sh` (launch → wait → pull plist →
print props, N times). Recreate it from §8 if the scratchpad is gone; it's ~30 lines.

**Two artifacts of driving it this way**, so they aren't mistaken for product bugs:
- `--terminate-existing` SIGKILLs the app, which can land before React Native flushes
  `AsyncStorage.setItem(CURSOR_KEY, …)`. The cursor then replays and you see the same item twice.
- Allow 8–10s between launch and reading the plist: the sync does a network fetch, a signed-URL round
  trip, and an image download before calling `updateSnapshot`.

---

## 9. Test data currently in the database

All in couple `99ca5d54-…`. Created during this session; delete freely.

| id | type | sender | created |
|---|---|---|---|
| `3182aba9-…` | photo | alex | 02:49 |
| `ecb34654-…` | photo | alex | 02:58 |
| `996a9f71-…` | drawing | alex | 02:58 |
| `93909160-…` | photo | sam | 03:01 (the sender-filter discriminating test) |

They reuse image objects already in the `media` bucket — no new Storage uploads were made.

**`now_playing` is empty and will stay that way.** `supabase/migrations/0007_spotify_poll_cron.sql`
runs `spotify-poll` on pg_cron **every 2 minutes** and overwrites `now_playing` for every user, so a
hand-seeded track dies within ~2 minutes. That's why music vanished from the stack mid-test. To keep
music present, either connect a real Spotify account for Alex or pause the cron job. Note
`fetchPartnerNowPlaying` keys off `track_id`, not `is_playing`.

---

## 10. Scope note: "real-time rotation" is not this bug

Worth stating so it doesn't get conflated. SPEC.md §18: *"iOS controls widget redraw timing via a
timeline/budget system. The app cannot force a widget to redraw every 15 seconds."* Timed rotation is
SPEC.md §42 — a **stretch goal gated behind Live Activities** (milestone M7), and it applies to the
lock screen / Dynamic Island, not the home-screen widget.

What's built is SPEC.md §40, *advance one step per app open*. Separately, there is **no push path at
all** — `supabase/functions/` contains only the three Spotify functions, and `useWidgetSync` fires
only on mount and `AppState → 'active'`. So with the app closed nothing updates, by construction.
Building the APNs Edge Function (credentials are already staged: `.apns-key.p8`, Team ID
`K4MBJGZLNY`, Key ID) is the outstanding piece of M3/M4 Phase B and the real fix for "it should
update when my partner sends something". PLAN.md's accepted constraint #1 applies: `content-available`
pushes are dropped when the app is force-quit, so **a visible notification is the reliable trigger**.

---

## 11. The screenshot harness — verifying the widget without a human

`tools/widget-shot/` photographs the phone's home screen and prints what the app delivered, so a
render can be compared against the props that produced it.

```sh
tools/widget-shot/shoot.sh          # capture the home screen (all pages)
tools/widget-shot/shoot.sh open     # open Bundles first (advances the stack), then capture
```

It prints the PNG paths and the widget's current props. Phone must be unlocked and plugged in.

**Why XCUITest and not something simpler.** `devicectl` has no screenshot command. libimobiledevice's
`idevicescreenshot` needs the legacy developer disk image, which Xcode stops shipping after iOS 16.4;
on iOS 26 the `screenshotr` service is refused outright — confirmed empirically, not just from the
bug report. macOS `log stream` has no `--device` flag, so device logs aren't reachable either.
XCUITest works because the test runs *on* the device, and `XCUIScreen.main.screenshot()` captures
Springboard along with everything else.

**Why it lives outside `ios/`.** That directory is regenerated by `npx expo prebuild`, which would
delete a test target added to the app project. The project here is generated from `project.yml` by
`xcodegen` (`cd tools/widget-shot && xcodegen generate`) rather than a hand-edited `pbxproj`, so
`WidgetShot.xcodeproj` is disposable and gitignored.

**It captures every home-screen page, deliberately.** Two failed approaches, both of which silently
photograph the wrong page and look like "the widget disappeared": `springboard.activate()` returns to
whichever page was last shown (worked once by luck), and pressing home jumps to page one (where the
widget may not be). Page numbering also shifts between runs — swiping past the last page lands on the
App Library. Capturing everything and reading all of them is more reliable than trying to locate the
widget in Springboard's opaque accessibility tree.

**Reading the results.** Attachment names (`home-pageN`, `after-open-pageN`, `in-app`) are in the
`manifest.json` beside the PNGs, since the exported filenames are UUIDs.

### Also worth knowing

`JetsamEvent-*.ips` files under the `systemCrashLogs` domain record memory kills. Grepping crash logs
for a process name misses them entirely — they're named by date. Pulling the one from the original
test window showed `ExpoWidgetsTarget` at `reason: long-idle-exit`, ~12MB, well under the 30MB
ceiling, and every other widget extension on the phone showed the same. **That rules out a memory
kill** and demotes §7.1.

```sh
xcrun devicectl device info files --device $DEV --domain-type systemCrashLogs | grep -i jetsam
xcrun devicectl device copy from --device $DEV --domain-type systemCrashLogs \
  --source JetsamEvent-<stamp>.ips --destination /tmp/jetsam.ips
```

### Unrelated oddity spotted along the way

`now_playing` currently holds the **same track for both Sam and Alex** (`a thousand years`, identical
timestamps to the millisecond). Either one Spotify account is linked to both users or the poller
writes every row from one source. Worth a look — the widget is supposed to show the *partner's*
track, and right now the two are indistinguishable so a bug here would be invisible.
