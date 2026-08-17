#!/usr/bin/env bash
#
# Bundles -> TestFlight, end to end: bump, archive, export, upload.
#
#   ./scripts/release-testflight.sh                 # auto build number, full run
#   ./scripts/release-testflight.sh --build-number 12
#   ./scripts/release-testflight.sh --no-upload     # archive + export only
#   ./scripts/release-testflight.sh --clean         # clean before archiving
#
# An archive of this app is roughly a 15-minute compile. Every check in the preflight and
# post-archive sections exists so a mistake costs seconds instead of that. Nothing is
# assumed to be true because it was true last time.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SCHEME="Bundles"
WORKSPACE="ios/Bundles.xcworkspace"
APP_TARGET_DIR="ios/Bundles"
WIDGET_TARGET_DIR="ios/ExpoWidgetsTarget"
APP_BUNDLE_ID="com.nikhilsinha.bundles"
TEAM_ID="K4MBJGZLNY"
ASC_KEY_ID="${ASC_KEY_ID:-3836475HH2}"
KEY_SRC="$REPO_ROOT/.asc-key.p8"
ISSUER_FILE="$REPO_ROOT/.asc-issuer-id"

BUILD_DIR="$REPO_ROOT/build/testflight"
ARCHIVE_PATH="$BUILD_DIR/$SCHEME.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"
EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"

PLISTBUDDY=/usr/libexec/PlistBuddy

BUILD_NUMBER=""
DO_UPLOAD=1
DO_CLEAN=0

# --------------------------------------------------------------------------------------
# Output helpers
# --------------------------------------------------------------------------------------

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    \033[32mok\033[0m  %s\n' "$*"; }

# Each argument after the title is printed as its own indented line; arguments containing
# newlines are indented line by line. Uses "$@" rather than an array because macOS still
# ships bash 3.2, where expanding an empty array under `set -u` is itself an error.
fail() {
  local title="$1"
  shift
  printf '\n\033[31mFAILED:\033[0m %s\n' "$title" >&2
  if [[ $# -gt 0 ]]; then printf '%s\n' "$@" | sed 's/^/  /' >&2; fi
  printf '\n' >&2
  exit 1
}

# --------------------------------------------------------------------------------------
# Arguments
# --------------------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-number) BUILD_NUMBER="${2:-}"; shift 2 ;;
    --no-upload)    DO_UPLOAD=0; shift ;;
    --clean)        DO_CLEAN=1; shift ;;
    -h|--help)      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              fail "Unknown argument: $1" "Run with --help." ;;
  esac
done

# --------------------------------------------------------------------------------------
# 1. Preflight
# --------------------------------------------------------------------------------------

step "Preflight"

[[ "$(uname -s)" == "Darwin" ]] || fail "This only runs on macOS." "Archiving an iOS app needs Xcode."
command -v xcodebuild >/dev/null || fail "xcodebuild not on PATH." "Install Xcode and run: sudo xcode-select -s /Applications/Xcode.app"
command -v xcrun >/dev/null      || fail "xcrun not on PATH."

if [[ ! -d "$WORKSPACE" ]]; then
  fail "No $WORKSPACE." \
    "/ios is gitignored, so a fresh clone has no native project yet. Generate it:" \
    "" \
    "  npx expo prebuild --platform ios" \
    "  (cd ios && pod install)"
fi

[[ -f "$KEY_SRC" ]] || fail "No App Store Connect key at .asc-key.p8." \
  "It downloads exactly once, from App Store Connect ->" \
  "Users and Access -> Integrations -> App Store Connect API."

if [[ -n "${ASC_ISSUER_ID:-}" ]]; then
  ISSUER_ID="$ASC_ISSUER_ID"
elif [[ -f "$ISSUER_FILE" ]]; then
  ISSUER_ID="$(tr -d '[:space:]' < "$ISSUER_FILE")"
else
  fail "No issuer id." \
    "It is the team-wide UUID at the top of App Store Connect ->" \
    "Users and Access -> Integrations -> App Store Connect API." \
    "It is NOT the key id ($ASC_KEY_ID)." \
    "" \
    "  printf %s '<uuid>' > .asc-issuer-id"
fi
[[ -n "$ISSUER_ID" ]] || fail ".asc-issuer-id is empty."

ok "Xcode $(xcodebuild -version 2>/dev/null | head -1 | awk '{print $2}' || echo '?'), key $ASC_KEY_ID, issuer present"

# --- The native project must reflect the current app.json ----------------------------
#
# This is the check that matters most. `expo prebuild` is what turns app.json into the
# Xcode project, and everything below assumes it has run since the release config was
# added. Discovering otherwise costs a full archive plus a TestFlight round trip:
# a missing ITSAppUsesNonExemptEncryption shows up only as "Missing Compliance" in
# App Store Connect, twenty minutes after the mistake.

STALE=""
APP_INFO_PLIST="$APP_TARGET_DIR/Info.plist"

if ! "$PLISTBUDDY" -c "Print :ITSAppUsesNonExemptEncryption" "$APP_INFO_PLIST" >/dev/null 2>&1; then
  STALE+="- ITSAppUsesNonExemptEncryption missing from $APP_INFO_PLIST (app.json ios.infoPlist)"$'\n'
fi
if [[ "$(grep -c "DEVELOPMENT_TEAM = $TEAM_ID;" ios/Bundles.xcodeproj/project.pbxproj || true)" -lt 4 ]]; then
  STALE+="- fewer than 4 'DEVELOPMENT_TEAM = $TEAM_ID' entries in project.pbxproj (plugins/with-signing-and-versioning)"$'\n'
fi
if [[ ! -f "$WIDGET_TARGET_DIR/PrivacyInfo.xcprivacy" ]]; then
  STALE+="- $WIDGET_TARGET_DIR/PrivacyInfo.xcprivacy missing (plugins/with-widget-privacy-manifest)"$'\n'
fi

if [[ -n "$STALE" ]]; then
  fail "ios/ is out of date with app.json." \
    "${STALE%$'\n'}" \
    "" \
    "Regenerate the native project, then re-run this script:" \
    "" \
    "  npx expo prebuild --platform ios --clean" \
    "  (cd ios && pod install)" \
    "" \
    "--clean matters: expo-widgets only writes the extension's build settings when it" \
    "creates the target, so a prebuild over an existing ios/ can leave them stale."
fi
ok "ios/ carries the release config from app.json"

# --------------------------------------------------------------------------------------
# 2. Version and build number
# --------------------------------------------------------------------------------------

step "Version"

MARKETING_VERSION="$(node -e 'process.stdout.write(require("./app.json").expo.version)')"
[[ -n "$MARKETING_VERSION" ]] || fail "app.json has no expo.version."

if [[ -z "$BUILD_NUMBER" ]]; then
  info "Asking App Store Connect for the next unused build number..."
  # A re-used CFBundleVersion is rejected at the very end of the upload, after the archive.
  # If ASC is unreachable, fall back to app.json + 1 rather than blocking the release.
  if BUILD_NUMBER="$(node scripts/asc.mjs next-build-number 2>/dev/null)" && [[ "$BUILD_NUMBER" =~ ^[0-9]+$ ]]; then
    ok "next unused build number is $BUILD_NUMBER"
  else
    BUILD_NUMBER="$(node -e 'process.stdout.write(String((parseInt(require("./app.json").expo.ios.buildNumber,10)||0)+1))')"
    info "Could not reach App Store Connect; falling back to app.json + 1 = $BUILD_NUMBER."
    info "If the upload is rejected as a duplicate, re-run with --build-number <higher>."
  fi
fi
[[ "$BUILD_NUMBER" =~ ^[0-9]+$ ]] || fail "Build number must be a positive integer, got: $BUILD_NUMBER"

info "marketing version $MARKETING_VERSION, build $BUILD_NUMBER"

# app.json is the durable source of truth: the next prebuild reads it from here.
node -e '
  const fs = require("fs");
  const json = JSON.parse(fs.readFileSync("app.json", "utf8"));
  json.expo.ios.buildNumber = process.argv[1];
  fs.writeFileSync("app.json", JSON.stringify(json, null, 2) + "\n");
' "$BUILD_NUMBER"

# The generated Info.plists hold literal values, so app.json alone would not reach this
# build without another prebuild. Patch both. The app and the extension MUST agree:
# a mismatch is rejected on upload with "The value of CFBundleVersion in your extension
# must match the app's" — after the archive, which is the expensive way to learn it.
for plist in "$APP_TARGET_DIR/Info.plist" "$WIDGET_TARGET_DIR/Info.plist"; do
  [[ -f "$plist" ]] || fail "Expected $plist to exist."
  "$PLISTBUDDY" -c "Set :CFBundleVersion $BUILD_NUMBER" "$plist"
  "$PLISTBUDDY" -c "Set :CFBundleShortVersionString $MARKETING_VERSION" "$plist"
done
ok "app.json, app Info.plist and extension Info.plist all set to $MARKETING_VERSION ($BUILD_NUMBER)"

# --------------------------------------------------------------------------------------
# 3. Archive
# --------------------------------------------------------------------------------------

step "Archive"

mkdir -p "$BUILD_DIR"
rm -rf "$ARCHIVE_PATH" "$EXPORT_DIR"

ARCHIVE_ACTIONS=(archive)
[[ $DO_CLEAN -eq 1 ]] && ARCHIVE_ACTIONS=(clean archive)

info "This is a full Release compile for arm64 and takes many minutes. It is not hung."

# CURRENT_PROJECT_VERSION / MARKETING_VERSION are passed as well as written into the
# plists above: the extension is built with GENERATE_INFOPLIST_FILE=YES, and which of the
# two sources wins there has varied between Xcode releases. Setting both removes the question.
set +e
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  "${ARCHIVE_ACTIONS[@]}"
ARCHIVE_STATUS=$?
set -e

if [[ $ARCHIVE_STATUS -ne 0 || ! -d "$ARCHIVE_PATH" ]]; then
  fail "xcodebuild archive failed (exit $ARCHIVE_STATUS)." \
    "Read the last error above, then check these in order:" \
    "" \
    "  'does not support the App Groups capability' / 'doesn't include the ... entitlements'" \
    "      The App Group is not attached to the App IDs. The command line cannot do this." \
    "      Open ios/Bundles.xcworkspace in the Xcode GUI, visit Signing & Capabilities for" \
    "      BOTH Bundles and ExpoWidgetsTarget. See .claude/skills/ios-device-build/." \
    "" \
    "  'No signing certificate' / failure to create profiles" \
    "      The Apple ID is not signed into Xcode -> Settings -> Accounts. This is not a" \
    "      Team ID problem; the Team ID ($TEAM_ID) is already correct." \
    "" \
    "  a Swift compile error in ExpoWidgetsTarget" \
    "      A real code failure. Fix it, then re-run."
fi
ok "archived to $ARCHIVE_PATH"

# --------------------------------------------------------------------------------------
# 4. Verify the archive before spending an upload on it
# --------------------------------------------------------------------------------------

step "Verify archive"

APP_IN_ARCHIVE="$ARCHIVE_PATH/Products/Applications/$SCHEME.app"
APPEX_IN_ARCHIVE="$APP_IN_ARCHIVE/PlugIns/ExpoWidgetsTarget.appex"

[[ -d "$APP_IN_ARCHIVE" ]] || fail "No $SCHEME.app inside the archive." "The archive is malformed; re-run with --clean."

plist_get() { "$PLISTBUDDY" -c "Print :$2" "$1/Info.plist" 2>/dev/null || true; }

APP_BUILD="$(plist_get "$APP_IN_ARCHIVE" CFBundleVersion)"
[[ "$APP_BUILD" == "$BUILD_NUMBER" ]] || fail \
  "The archived app has CFBundleVersion '$APP_BUILD', expected '$BUILD_NUMBER'." \
  "Something re-wrote the version during the build. Check that ExportOptions keeps" \
  "manageAppVersionAndBuildNumber false and that Xcode's own agile versioning is off."

COMPLIANCE="$(plist_get "$APP_IN_ARCHIVE" ITSAppUsesNonExemptEncryption)"
[[ "$COMPLIANCE" == "false" ]] || fail \
  "ITSAppUsesNonExemptEncryption is '$COMPLIANCE' in the archived app, expected 'false'." \
  "Without it every TestFlight build stalls on 'Missing Compliance' and reaches no tester." \
  "It comes from app.json ios.infoPlist; re-run npx expo prebuild."

[[ -f "$APP_IN_ARCHIVE/PrivacyInfo.xcprivacy" ]] || fail \
  "The archived app has no PrivacyInfo.xcprivacy." \
  "It comes from app.json ios.privacyManifests; re-run npx expo prebuild."

if [[ -d "$APPEX_IN_ARCHIVE" ]]; then
  APPEX_BUILD="$(plist_get "$APPEX_IN_ARCHIVE" CFBundleVersion)"
  APPEX_SHORT="$(plist_get "$APPEX_IN_ARCHIVE" CFBundleShortVersionString)"
  APP_SHORT="$(plist_get "$APP_IN_ARCHIVE" CFBundleShortVersionString)"
  [[ "$APPEX_BUILD" == "$APP_BUILD" ]] || fail \
    "Version mismatch: app CFBundleVersion '$APP_BUILD', extension '$APPEX_BUILD'." \
    "App Store Connect rejects this on upload. Re-run npx expo prebuild --clean so the" \
    "extension picks up CURRENT_PROJECT_VERSION, then archive again."
  [[ "$APPEX_SHORT" == "$APP_SHORT" ]] || fail \
    "Version mismatch: app CFBundleShortVersionString '$APP_SHORT', extension '$APPEX_SHORT'." \
    "Same remedy as above."
  if [[ ! -f "$APPEX_IN_ARCHIVE/PrivacyInfo.xcprivacy" ]]; then
    info "note: the widget extension has no PrivacyInfo.xcprivacy."
    info "      Not fatal, but Apple may email an ITMS-91053 warning about it."
  fi
  ok "app and extension agree on $APP_SHORT ($APP_BUILD)"
else
  info "note: no ExpoWidgetsTarget.appex in the archive — this build ships without the widget."
fi

# The 1024px marketing icon lives in the compiled asset catalog. Its absence is not a build
# error; it surfaces as an App Store Connect processing failure long after the upload.
if [[ -f "$APP_IN_ARCHIVE/Assets.car" ]]; then
  if xcrun assetutil --info "$APP_IN_ARCHIVE/Assets.car" 2>/dev/null | grep -q '"AppIcon"'; then
    ok "AppIcon present in the compiled asset catalog"
  else
    info "note: no AppIcon found in Assets.car. If processing fails with a missing"
    info "      marketing icon, check app.json ios.icon (./assets/expo.icon)."
  fi
fi

# --------------------------------------------------------------------------------------
# 5. Export
# --------------------------------------------------------------------------------------

step "Export"

cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <!-- Xcode would otherwise silently pick its own build number, defeating every check above. -->
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
PLIST

set +e
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates
EXPORT_STATUS=$?
set -e

if [[ $EXPORT_STATUS -ne 0 ]]; then
  fail "xcodebuild -exportArchive failed (exit $EXPORT_STATUS)." \
    "'method' must be app-store-connect on Xcode 15+; the older spelling 'app-store' is" \
    "rejected. If the error mentions a distribution certificate, the Apple ID in Xcode ->" \
    "Settings -> Accounts needs an Apple Distribution certificate for team $TEAM_ID —" \
    "click Manage Certificates -> + -> Apple Distribution."
fi

IPA="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' | head -1)"
[[ -n "$IPA" && -f "$IPA" ]] || fail "Export produced no .ipa in $EXPORT_DIR."
ok "exported $(basename "$IPA") ($(du -h "$IPA" | cut -f1))"

if [[ $DO_UPLOAD -eq 0 ]]; then
  step "Stopping before upload (--no-upload)"
  info "$IPA"
  exit 0
fi

# --------------------------------------------------------------------------------------
# 6. Upload
# --------------------------------------------------------------------------------------

step "Upload to App Store Connect"

# altool does not take a path to the key. It looks for AuthKey_<KEYID>.p8 in a fixed set of
# directories; ~/.appstoreconnect/private_keys is the canonical one. Place it here rather
# than asking a human to, and keep it private.
KEY_DIR="$HOME/.appstoreconnect/private_keys"
KEY_DEST="$KEY_DIR/AuthKey_${ASC_KEY_ID}.p8"
mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"
cp "$KEY_SRC" "$KEY_DEST"
chmod 600 "$KEY_DEST"
ok "key staged at ~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"

set +e
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" \
  --apiIssuer "$ISSUER_ID"
UPLOAD_STATUS=$?
set -e

if [[ $UPLOAD_STATUS -ne 0 ]]; then
  fail "altool upload failed (exit $UPLOAD_STATUS)." \
    "The archive is fine and is still at $ARCHIVE_PATH — you do not need to rebuild." \
    "Re-upload after fixing with:" \
    "" \
    "  xcrun altool --upload-app -f '$IPA' -t ios --apiKey $ASC_KEY_ID --apiIssuer <issuer>" \
    "" \
    "Common causes:" \
    "  'Unable to authenticate'      wrong issuer id, or the key is not at" \
    "                                ~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8" \
    "  'The bundle version must be higher'  this build number was used before;" \
    "                                re-run with --build-number <higher>" \
    "  'No suitable application record'     no app record for $APP_BUNDLE_ID yet;" \
    "                                run: node scripts/asc.mjs create-app" \
    "  'unrecognized option --upload-app'   altool finally dropped the deprecated flag." \
    "                                Switch to --upload-package (it additionally needs" \
    "                                --apple-id, --bundle-id, --bundle-version and" \
    "                                --bundle-short-version-string)."
fi

# --------------------------------------------------------------------------------------

step "Uploaded"
cat <<NEXT
    Build $MARKETING_VERSION ($BUILD_NUMBER) is with Apple. It is not installable yet —
    processing takes 5-30 minutes and the build does not appear at all for the first minute.

      node scripts/asc.mjs build-status $BUILD_NUMBER

    Once it reads VALID:

      Internal testers          already have it, no review, nothing more to do.
      External testers          node scripts/asc.mjs test-info --build $BUILD_NUMBER
                                node scripts/asc.mjs submit-review $BUILD_NUMBER

    See .claude/skills/testflight-release/ for the internal/external distinction and
    the failure decoder.
NEXT
