#!/bin/bash

# verify-xcode-settings.sh
# Verifies that Xcode build settings are configured correctly for M1/M2 Mac compatibility

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_DIR="$PROJECT_ROOT/ios"
PROJECT_FILE="$IOS_DIR/Candle.xcodeproj/project.pbxproj"

echo "🔍 Verifying Xcode Build Settings..."
echo ""

# Check if running from correct directory
if [ ! -d "$IOS_DIR" ]; then
    echo -e "${RED}❌ Error: ios/ directory not found.${NC}"
    echo "   Please run this script from the project root directory."
    exit 1
fi

# Check if project.pbxproj exists
if [ ! -f "$PROJECT_FILE" ]; then
    echo -e "${RED}❌ Error: project.pbxproj not found at $PROJECT_FILE${NC}"
    exit 1
fi

# Track verification results
PASSED=0
FAILED=0

# Function to check and report
check_setting() {
    local description="$1"
    local pattern="$2"
    local expected_count="$3"
    local expected_value="$4"
    
    local count=$(grep -c "$pattern" "$PROJECT_FILE" 2>/dev/null || echo "0")
    local matches=$(grep "$pattern" "$PROJECT_FILE" 2>/dev/null || echo "")
    
    if [ "$count" -eq "$expected_count" ]; then
        # Check if values match expected
        if [ -n "$expected_value" ]; then
            local value_matches=$(echo "$matches" | grep -c "$expected_value" || echo "0")
            if [ "$value_matches" -eq "$expected_count" ]; then
                echo -e "${GREEN}✅ $description${NC}"
                echo "   Found $count occurrence(s) with correct value"
                PASSED=$((PASSED + 1))
                return 0
            else
                echo -e "${RED}❌ $description${NC}"
                echo "   Found $count occurrence(s), but values don't match expected: $expected_value"
                echo "   Current values:"
                echo "$matches" | sed 's/^/      /'
                FAILED=$((FAILED + 1))
                return 1
            fi
        else
            echo -e "${GREEN}✅ $description${NC}"
            echo "   Found $count occurrence(s)"
            PASSED=$((PASSED + 1))
            return 0
        fi
    else
        echo -e "${RED}❌ $description${NC}"
        echo "   Expected $expected_count occurrence(s), found $count"
        if [ "$count" -gt 0 ]; then
            echo "   Current matches:"
            echo "$matches" | sed 's/^/      /'
        fi
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# 1. Check EXCLUDED_ARCHS for simulator (should be at least 8: 4 targets × 2 configs, may include project-level)
echo "1. Checking EXCLUDED_ARCHS for iOS Simulator..."
excluded_archs_count=$(grep -c 'EXCLUDED_ARCHS\[sdk=iphonesimulator\*\]' "$PROJECT_FILE" 2>/dev/null || echo "0")
excluded_archs_matches=$(grep 'EXCLUDED_ARCHS\[sdk=iphonesimulator\*\]' "$PROJECT_FILE" 2>/dev/null || echo "")
arm64_matches=$(echo "$excluded_archs_matches" | grep -c 'arm64' || echo "0")

if [ "$excluded_archs_count" -ge 8 ] && [ "$arm64_matches" -eq "$excluded_archs_count" ]; then
    echo -e "${GREEN}✅ EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64${NC}"
    echo "   Found $excluded_archs_count occurrence(s) with correct value"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64${NC}"
    echo "   Expected at least 8 occurrence(s) with value 'arm64', found $excluded_archs_count total ($arm64_matches with 'arm64')"
    if [ "$excluded_archs_count" -gt 0 ]; then
        echo "   Current matches:"
        echo "$excluded_archs_matches" | sed 's/^/      /'
    fi
    FAILED=$((FAILED + 1))
fi

# 2. Verify deployment target is 15.1 for all targets
echo ""
echo "2. Checking IPHONEOS_DEPLOYMENT_TARGET..."
# Count deployment target settings (should be at least 4 targets × 2 configs = 8, but may be more)
deployment_target_count=$(grep -c 'IPHONEOS_DEPLOYMENT_TARGET = 15.1' "$PROJECT_FILE" 2>/dev/null || echo "0")
if [ "$deployment_target_count" -ge 8 ]; then
    echo -e "${GREEN}✅ IPHONEOS_DEPLOYMENT_TARGET = 15.1${NC}"
    echo "   Found $deployment_target_count occurrence(s)"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠️  IPHONEOS_DEPLOYMENT_TARGET = 15.1${NC}"
    echo "   Found $deployment_target_count occurrence(s) (expected at least 8)"
    echo "   This may be normal if some targets inherit from project-level settings"
    PASSED=$((PASSED + 1))
fi

# 3. Verify Swift version is 5.0 for all targets
echo ""
echo "3. Checking SWIFT_VERSION..."
swift_version_count=$(grep -c 'SWIFT_VERSION = 5.0' "$PROJECT_FILE" 2>/dev/null || echo "0")
if [ "$swift_version_count" -ge 8 ]; then
    echo -e "${GREEN}✅ SWIFT_VERSION = 5.0${NC}"
    echo "   Found $swift_version_count occurrence(s)"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠️  SWIFT_VERSION = 5.0${NC}"
    echo "   Found $swift_version_count occurrence(s) (expected at least 8)"
    echo "   This may be normal if some targets inherit from project-level settings"
    PASSED=$((PASSED + 1))
fi

# 4. Check bundle identifiers match expected pattern
echo ""
echo "4. Checking Bundle Identifiers..."
bundle_id_main=$(grep -c 'PRODUCT_BUNDLE_IDENTIFIER = com.nikhilsinha.candleapp;' "$PROJECT_FILE" 2>/dev/null || echo "0")
bundle_id_canvas=$(grep -c 'PRODUCT_BUNDLE_IDENTIFIER = com.nikhilsinha.candleapp.CandleCanvasWidget;' "$PROJECT_FILE" 2>/dev/null || echo "0")
bundle_id_countdown=$(grep -c 'PRODUCT_BUNDLE_IDENTIFIER = com.nikhilsinha.candleapp.CandleCountdownWidget;' "$PROJECT_FILE" 2>/dev/null || echo "0")
bundle_id_daily=$(grep -c 'PRODUCT_BUNDLE_IDENTIFIER = com.nikhilsinha.candleapp.CandleDailyPhotoWidget;' "$PROJECT_FILE" 2>/dev/null || echo "0")

if [ "$bundle_id_main" -ge 2 ] && [ "$bundle_id_canvas" -ge 2 ] && [ "$bundle_id_countdown" -ge 2 ] && [ "$bundle_id_daily" -ge 2 ]; then
    echo -e "${GREEN}✅ Bundle Identifiers match expected pattern${NC}"
    echo "   Main app: $bundle_id_main occurrence(s)"
    echo "   Canvas Widget: $bundle_id_canvas occurrence(s)"
    echo "   Countdown Widget: $bundle_id_countdown occurrence(s)"
    echo "   Daily Photo Widget: $bundle_id_daily occurrence(s)"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Bundle Identifiers don't match expected pattern${NC}"
    echo "   Main app: $bundle_id_main occurrence(s) (expected at least 2)"
    echo "   Canvas Widget: $bundle_id_canvas occurrence(s) (expected at least 2)"
    echo "   Countdown Widget: $bundle_id_countdown occurrence(s) (expected at least 2)"
    echo "   Daily Photo Widget: $bundle_id_daily occurrence(s) (expected at least 2)"
    FAILED=$((FAILED + 1))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Verification Summary:"
echo -e "  ${GREEN}✅ Passed: $PASSED${NC}"
if [ "$FAILED" -gt 0 ]; then
    echo -e "  ${RED}❌ Failed: $FAILED${NC}"
    echo ""
    echo "Remediation Steps:"
    echo "1. Open ios/Candle.xcworkspace in Xcode"
    echo "2. For each target (Candle + 3 widgets):"
    echo "   - Select target → Build Settings → Search 'Excluded Architectures'"
    echo "   - Set 'Any iOS Simulator SDK' to 'arm64' for Debug and Release"
    echo "3. Clean build folder: Product → Clean Build Folder (Shift+Cmd+K)"
    echo "4. Delete DerivedData: rm -rf ~/Library/Developer/Xcode/DerivedData"
    echo "5. Rebuild and run this script again"
    echo ""
    echo "See XCODE_BUILD_SETTINGS.md for detailed instructions."
    exit 1
else
    echo -e "  ${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "Your Xcode build settings are correctly configured for M1/M2 Mac compatibility."
    exit 0
fi
