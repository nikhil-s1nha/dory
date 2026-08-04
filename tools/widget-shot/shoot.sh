#!/bin/bash
# Photograph the iPhone home screen (and optionally open Bundles first), then print where the PNG
# landed and what the widget's props say — so a render can be compared against what the app
# actually delivered.
#
# Usage:
#   ./shoot.sh              # just capture the home screen
#   ./shoot.sh open         # open Bundles (advancing the stack), then capture
#
# Requires: phone unlocked + plugged in. See ../../.claude/skills/ios-device-build/ if it can't
# reach the device.
set -uo pipefail

REPO=$(cd "$(dirname "$0")/../.." && pwd)
DEV_UDID=00008150-001065A41445401C                      # hardware UDID, for xcodebuild
DEV_ID=32482374-396E-5305-8C73-6AB7A47827B5             # CoreDevice identifier, for devicectl
GROUP=group.com.nikhilsinha.bundles
OUT="${WIDGET_SHOT_OUT:-/tmp/widget-shot}"

TEST=testCaptureHomeScreen
[ "${1:-}" = "open" ] && TEST=testOpenBundlesThenCaptureHomeScreen

STAMP=$(date +%Y%m%d-%H%M%S)
RESULT="$OUT/$STAMP.xcresult"
SHOTS="$OUT/$STAMP"
mkdir -p "$OUT"

echo "→ running $TEST on device…"
xcodebuild test \
  -project "$REPO/tools/widget-shot/WidgetShot.xcodeproj" \
  -scheme WidgetShotUITests \
  -destination "id=$DEV_UDID" \
  -resultBundlePath "$RESULT" \
  -allowProvisioningUpdates \
  -only-testing:WidgetShotUITests/WidgetShotUITests/$TEST \
  > "$OUT/$STAMP.log" 2>&1

if [ $? -ne 0 ]; then
  echo "✗ test failed — last lines of $OUT/$STAMP.log:"
  grep -iE "error|failed|locked" "$OUT/$STAMP.log" | tail -5
  exit 1
fi

xcrun xcresulttool export attachments --path "$RESULT" --output-path "$SHOTS" > /dev/null 2>&1

# Downscale so the images are quick to open/read; keep the originals alongside.
for f in "$SHOTS"/*.png; do
  [ -e "$f" ] || continue
  sips -Z 1100 "$f" --out "${f%.png}_small.png" > /dev/null 2>&1
done

echo "✓ screenshots:"
ls -1 "$SHOTS"/*_small.png 2>/dev/null

# Correlate the picture with what the app actually handed WidgetKit. A mismatch between these two
# is the whole bug: props say one thing, the screen shows another.
xcrun devicectl device copy from --device "$DEV_ID" \
  --domain-type appGroupDataContainer --domain-identifier "$GROUP" \
  --source "Library/Preferences/$GROUP.plist" --destination "$SHOTS/widget.plist" > /dev/null 2>&1

if [ -f "$SHOTS/widget.plist" ]; then
  echo "✓ props the app delivered:"
  plutil -convert json -o - "$SHOTS/widget.plist" \
    | jq -c '.__expo_widgets_BundlesWidget_timeline[0] | {kind:.props.kind, title:.props.title, deepLink:.props.deepLink, ts:.timestamp}'
fi
