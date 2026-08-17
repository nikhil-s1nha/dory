---
name: testflight-release
description: Ship Bundles to TestFlight — cut a release with scripts/release-testflight.sh, drive App Store Connect from scripts/asc.mjs, and decode the failures (Missing Compliance, extension version mismatch, Beta App Review rejections). Use whenever the user says "ship it", "put it on TestFlight", "send a build to my partner", or asks about beta testers, build processing, export compliance, or the App Store Connect API key. Also use when a build uploads but never becomes installable.
---

# Releasing Bundles to TestFlight

One command does the whole local half:

```sh
./scripts/release-testflight.sh
```

Bump → archive → export → upload. Everything after that is App Store Connect, driven by
`scripts/asc.mjs`. **Neither script needs a human in the loop for anything except the one-time
setup in §1** — don't hand the user click-paths for things these scripts already do.

An archive is a ~15-minute arm64 compile. Both scripts are written to fail in seconds rather
than minutes wherever that is possible, so **a fast failure is the script working**, not a
flaky toolchain. Read the message; it names the fix.

## 0. The distinction everything else hangs off: internal vs external

Getting this wrong is the single biggest source of wasted days here, because "TestFlight"
means two quite different products.

| | **Internal** | **External** |
|---|---|---|
| Who | App Store Connect users on the team | any email address |
| Limit | 100 | 10,000 |
| Beta App Review | **none** | **required, 1–2 days** |
| Available | the moment processing finishes | after review approves |
| Needs demo account | no | **yes — this app is behind a login wall** |
| Needs "What to Test" | no | yes |

**For getting a build onto Nikhil's or a partner's phone, use internal.** It is instant and
skips review entirely. The tester has to be added under Users and Access first — an internal
group cannot contain a non-team email, and adding one fails rather than inviting them.

Go external only when the audience genuinely isn't on the team. Then the demo account is not
optional: a reviewer who cannot get past the sign-in screen rejects the build, and that costs
another 1–2 day round trip.

## 1. One-time setup (already done, verify rather than redo)

- **API key** — `.asc-key.p8`, key id `3836475HH2`, role App Manager. Downloads exactly once,
  ever. Gitignored via `*.p8`; never print it.
- **Issuer id** — `.asc-issuer-id`, gitignored. A team-wide UUID from App Store Connect →
  Users and Access → Integrations → App Store Connect API. **It is not the key id.** Passing
  the key id where the issuer belongs is the most common setup mistake and Apple answers it
  with a bare 401 that reads exactly like a broken key; `asc.mjs` checks the shape up front
  so you get a real message instead.
- **App record** — `com.nikhilsinha.bundles` must exist in App Store Connect.

Confirm all three in one call, and do this before anything else:

```sh
node scripts/asc.mjs check
```

### The app record has to be created by hand, once

`node scripts/asc.mjs create-app` registers the bundle id (the API does support that) and
then prints the exact web-UI path with every field filled in. It cannot finish the job:
**the App Store Connect API has never supported creating an app record.** `POST /v1/apps`
returns `FORBIDDEN_ERROR`, "The resource 'apps' does not allow 'CREATE'". That is a permanent
API limitation, not a permissions problem and not something to retry — don't go hunting for a
role or an agreement to fix it.

Two other things only a human can do, both worth checking *before* a build is waiting on them:

- **Agreements, Tax, and Banking** must be Active. A pending Paid Apps agreement surfaces
  later as an unexplained 403.
- **The App Group and its App IDs.** Only the developer portal can create
  `group.com.nikhilsinha.bundles`, and only the Xcode GUI attaches it to both targets. See
  `.claude/skills/ios-device-build/` §2 — the same signing prerequisites apply to archiving.

## 2. Cut the build

```sh
./scripts/release-testflight.sh              # picks the next unused build number
./scripts/release-testflight.sh --build-number 12
./scripts/release-testflight.sh --no-upload  # archive + export, stop before Apple
```

The build number comes from App Store Connect, not from a local counter: a re-used
`CFBundleVersion` is rejected at the very *end* of the upload, after the compile. Offline, it
falls back to `app.json` + 1 and says so.

The script writes the bump into `app.json`, the app `Info.plist`, and the extension
`Info.plist`, and passes `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION` on the command line —
all four, deliberately. See §5 on why the app and the extension must agree.

### "ios/ is out of date with app.json" means run prebuild

The preflight refuses to compile when the generated project doesn't carry the current release
config. It checks the three things `expo prebuild` is responsible for and names whichever is
missing. The fix is always the same:

```sh
npx expo prebuild --platform ios --clean
(cd ios && pod install)
```

**`--clean` matters.** expo-widgets writes the extension's build settings *only* when it
creates the target, and early-returns if the target already exists — so a prebuild over an
existing `ios/` can leave `ExpoWidgetsTarget` with stale or absent settings while everything
looks fine.

## 3. Native config lives in app.json — never in ios/

`/ios` is gitignored and regenerated, and prebuild silently drops hand edits. Everything
below is expressed in `app.json` or in `plugins/`, and re-applied on every prebuild.

- **`ios.infoPlist.ITSAppUsesNonExemptEncryption: false`** — verified correct: the binary
  uses only expo-crypto random bytes and HTTPS/TLS, both exempt. Without it *every* build
  stalls in App Store Connect asking for export compliance and reaches no tester at all.
- **`ios.buildNumber` / `version`** → `CFBundleVersion` / `CFBundleShortVersionString`. The
  release script owns the bump; don't hand-edit them mid-release.
- **`ios.privacyManifests`** — natively supported in SDK 57, and merged with the manifests the
  pods ship, so it only needs to declare what nothing else does: UserDefaults **`1C8F.1`**
  (the *App Group* variant, which expo-widgets' `WidgetsStorage` uses and no dependency
  declares), FileTimestamp `C617.1`, and the six data types the app collects — email, name,
  photos/videos, other user content, device id, user id. All linked to identity, none used
  for tracking; there are no analytics or ad SDKs in this app.
- **`plugins/with-signing-and-versioning.js`** — puts `DEVELOPMENT_TEAM = K4MBJGZLNY` and
  `CODE_SIGN_STYLE = Automatic` on **every** signable target. **This replaces the
  `perl -pi -e` in `.claude/skills/ios-device-build/` §2** — that hack is obsolete; don't run
  it. It exists because core Expo's `withDevelopmentTeam` runs *before* expo-widgets creates
  the extension (mods run last-registered-first) and so never reaches it.
- **`plugins/with-widget-privacy-manifest.js`** — the extension is a separately linked binary
  and Expo's built-in privacy plugin only covers the app target.

Both plugins are listed **first** in `app.json` `plugins`. That is not cosmetic: Expo chains
mods last-registered-first, so **earlier in the array means later at runtime**. Move them
after `expo-widgets` and they run before the widget target exists and silently do nothing.
They warn loudly if that happens.

## 4. After the upload: processing

The build is not installable when the upload finishes.

```sh
node scripts/asc.mjs build-status <build-number>
```

- **Doesn't appear at all** for the first minute or two. Normal — don't conclude the upload
  failed.
- **`PROCESSING`** — 5–30 minutes, occasionally hours. Nothing to do.
- **`VALID`** — internal testers have it now.
- **`FAILED` / `INVALID`** — Apple emails the reason and repeats it on the build page. You
  cannot re-upload the same build number; fix, bump, archive again.

Then, once it's VALID:

```sh
node scripts/asc.mjs groups
node scripts/asc.mjs create-group --name "Internal" --internal
node scripts/asc.mjs add-tester namnik100@gmail.com "Internal"
```

For external testing only:

```sh
node scripts/asc.mjs test-info --build <build-number>   # demo account + What to Test
node scripts/asc.mjs submit-review <build-number>
node scripts/asc.mjs review-status <build-number>
```

`test-info` sets the seeded demo account `alex@dory.app` / `dorytest123` (already paired, so
the widget has content) plus reviewer notes explaining that the feature to look at is a
*home-screen widget* — a reviewer who never adds the widget sees an app that appears to do
very little. `submit-review` pre-checks the build state, export compliance, and What to Test,
because each of those otherwise comes back as an opaque 409.

## 5. Failure decoder

| Symptom | Cause | Fix |
|---|---|---|
| TestFlight shows **"Missing Compliance"**, no tester can install | `ITSAppUsesNonExemptEncryption` never reached the built Info.plist | `asc.mjs set-compliance <n>` unblocks *this* build; fix properly with `expo prebuild` so app.json's value lands |
| Upload rejected: **CFBundleVersion in your extension must match the app's** | the appex and app disagree | `expo prebuild --clean`, re-archive. The release script now compares them in the archive and stops *before* uploading |
| Upload rejected: **bundle version must be higher** | build number already used | re-run with `--build-number <higher>` |
| Upload rejected: **no suitable application record** | no app record for the bundle id | `asc.mjs create-app`, then finish it in the web UI (§1) |
| Archive fails: **does not support the App Groups capability** / missing `aps-environment` | App Group not attached to the App IDs; the command line cannot attach it | portal + Xcode GUI, `.claude/skills/ios-device-build/` §2. Retrying the build never helps |
| Archive fails to authenticate or create profiles | Apple ID not in Xcode → Settings → Accounts | add it. **Not** a Team ID problem — `K4MBJGZLNY` is already correct |
| Export fails on `method` | `app-store` was renamed | must be `app-store-connect` on Xcode 15+ (the script already uses it) |
| `altool`: **Unable to authenticate** | wrong issuer id, or key not staged | the script stages the key itself; check `.asc-issuer-id` |
| **401** from `asc.mjs` | the token was rejected — issuer id, key id, revoked key, or Mac clock skew | never a permissions problem; the request never reached the account |
| **403** from `asc.mjs` | authenticated but not allowed — role too low, unsigned agreement, or an operation the API doesn't support at all | re-minting the token cannot help |
| **409** from `asc.mjs` | state conflict — already exists, build still processing, required review field missing | Apple's `detail` is usually literally the fix |
| Processing fails citing a **marketing icon** | 1024px icon missing from the compiled catalog | `app.json` `ios.icon` is `./assets/expo.icon` (an Icon Composer bundle whose raster layer is already 1024×1024); `assets/images/icon.png` is a flat 1024 fallback |
| Beta App Review **rejected** | almost always the reviewer couldn't sign in, or couldn't find the feature | `asc.mjs test-info` — demo account and notes. Re-submitting often needs no new build |

## 6. Things worth knowing before they bite

- **`altool --upload-app` is deprecated** in favour of `--upload-package`. It still works in
  Xcode 26.6 (altool 26.40.1) and `--apiKey`/`--apiIssuer` are still accepted alongside the
  newer `--api-key`/`--api-issuer` — both spellings were checked against the installed
  binary. When it finally goes, `--upload-package` additionally requires `--apple-id`,
  `--bundle-id`, `--bundle-version` and `--bundle-short-version-string`; the script prints
  exactly that if it sees the flag rejected.
- **`altool` cannot be handed a path to the key.** It searches a fixed set of directories for
  `AuthKey_<KEYID>.p8`. The script copies it to `~/.appstoreconnect/private_keys/` at run
  time, mode 600, and leaves it there for subsequent runs. Never ask the user to place it.
- The issuer id appears in `altool`'s argv, so it is visible in `ps` during an upload. It is
  an identifier rather than a credential — the `.p8` is the secret — but don't paste it into
  logs.
- **Internal testers still need the TestFlight app** and have to accept the emailed invite.
  A build being VALID is not the same as it being on a phone.
- Build numbers are per marketing version, but Apple treats the whole
  `CFBundleShortVersionString` + `CFBundleVersion` pair as unique. Bumping `version` in
  `app.json` resets nothing; keep letting the script pick the number.
- Once an external build of a given marketing version is approved, later builds of the *same*
  version usually skip review. The first one of each version is the slow one.

## 7. What has never been executed

Written and checked, but not yet run against real hardware or a real archive:

- The whole `release-testflight.sh` archive/export path has only run against a stubbed
  `xcodebuild`. Every check, branch, and failure message was exercised; no Swift has been
  compiled by it.
- Both config plugins were run against a copy of the real `project.pbxproj` and produced the
  expected result idempotently — but **`expo prebuild` itself has not been re-run** since
  they were added. Until it has, `ios/` does not contain any of §3, and the preflight will
  correctly refuse to build.
- Everything in `asc.mjs` past authentication is unverified against a live account: the JWT
  and the error handling were confirmed by a real 401 from Apple, but no call has yet
  succeeded, so no response shape has been seen.
