# Xcode Build Settings Configuration Guide

## Introduction

This document provides comprehensive instructions for configuring Xcode build settings required for M1/M2 Mac compatibility with React Native. These settings must be configured manually through the Xcode UI, as they cannot be fully automated via configuration files.

**Why manual configuration?** Xcode build settings for architecture exclusions require UI-based configuration to ensure proper inheritance and compatibility across all build configurations and targets.

## Prerequisites

Before configuring build settings, ensure you have:

- ✅ **Xcode 14.0+** installed and updated
- ✅ **CocoaPods** installed (`sudo gem install cocoapods`)
- ✅ **Project dependencies** installed:
  - `npm install` completed in project root
  - `pod install` completed in `ios/` directory
- ✅ **Xcode workspace** can be opened without errors

## Step-by-Step Configuration Guide

### 1. Open the Xcode Workspace

Navigate to the iOS directory and open the workspace:

```bash
cd /Users/NikhilSinha/Downloads/candle/dory/ios
open Candle.xcworkspace
```

**Important:** Always open the `.xcworkspace` file, not the `.xcodeproj` file. The workspace includes CocoaPods dependencies.

### 2. Navigate to Build Settings

1. In Xcode's **Project Navigator** (left sidebar), select the `Candle` project (blue icon at the top)
2. In the main editor area, under the **TARGETS** section, select the `Candle` target
3. Click the **Build Settings** tab at the top of the editor
4. In the search bar (top right of Build Settings), type: `Excluded Architectures`

### 3. Configure Excluded Architectures for Candle Target

1. Locate the **Excluded Architectures** row and click the disclosure triangle (▶) to expand it
2. Under **Debug** configuration:
   - Find the row **Any iOS Simulator SDK**
   - Double-click the value field (currently empty or showing a different value)
   - Enter: `arm64`
   - Press Enter to confirm
3. Under **Release** configuration:
   - Find the row **Any iOS Simulator SDK**
   - Double-click the value field
   - Enter: `arm64`
   - Press Enter to confirm

### 4. Configure Widget Targets

Repeat the configuration for all three widget targets:

#### CandleCanvasWidget
1. Select `CandleCanvasWidget` target in TARGETS section
2. Go to **Build Settings** tab
3. Search for `Excluded Architectures`
4. Set **Any iOS Simulator SDK** to `arm64` for both **Debug** and **Release** configurations

#### CandleCountdownWidget
1. Select `CandleCountdownWidget` target in TARGETS section
2. Go to **Build Settings** tab
3. Search for `Excluded Architectures`
4. Set **Any iOS Simulator SDK** to `arm64` for both **Debug** and **Release** configurations

#### CandleDailyPhotoWidget
1. Select `CandleDailyPhotoWidget` target in TARGETS section
2. Go to **Build Settings** tab
3. Search for `Excluded Architectures`
4. Set **Any iOS Simulator SDK** to `arm64` for both **Debug** and **Release** configurations

### 5. Visual Representation

After configuration, the Build Settings should show:

```
Excluded Architectures
  ├─ Any iOS Simulator SDK
  │   ├─ Debug: arm64
  │   └─ Release: arm64
```

This should be configured for all 4 targets:
- ✅ Candle
- ✅ CandleCanvasWidget
- ✅ CandleCountdownWidget
- ✅ CandleDailyPhotoWidget

### 6. Clean and Rebuild

After configuring all targets:

1. **Clean Build Folder:**
   - Menu: `Product` → `Clean Build Folder` (or press `Shift+Cmd+K`)

2. **Close Xcode**

3. **Delete DerivedData:**
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData
   ```

4. **Reopen Xcode workspace:**
   ```bash
   open ios/Candle.xcworkspace
   ```

5. **Build the project:**
   - Menu: `Product` → `Build` (or press `Cmd+B`)

## Verification

### Command Line Verification

After manual configuration, verify the settings were applied correctly:

```bash
cd ios
grep 'EXCLUDED_ARCHS\[sdk=iphonesimulator\*\]' Candle.xcodeproj/project.pbxproj
```

**Expected output:** You should see 8 occurrences (4 targets × 2 configurations) showing:
```
"EXCLUDED_ARCHS[sdk=iphonesimulator*]" = arm64;
```

### Automated Verification Script

Run the verification script:

```bash
npm run verify:ios
```

This script checks:
- ✅ EXCLUDED_ARCHS settings (should be 8 occurrences of `arm64`)
- ✅ Deployment target is 15.1 for all targets
- ✅ Swift version is 5.0 for all targets
- ✅ Bundle identifiers match expected pattern

### Xcode UI Verification

1. Open `ios/Candle.xcworkspace` in Xcode
2. Select any target → Build Settings → Search "Excluded Architectures"
3. Verify **Any iOS Simulator SDK** shows `arm64` for both Debug and Release
4. Repeat for all 4 targets

## Troubleshooting

### Settings Don't Apply

**Problem:** Changes made in Xcode UI don't persist or don't appear in `project.pbxproj`

**Solution:**
1. Ensure you're editing the correct target (not the project-level settings)
2. Make sure you're setting the value for **Any iOS Simulator SDK** specifically
3. Close and reopen Xcode
4. Clean build folder and DerivedData
5. Verify in `project.pbxproj` using the grep command above

### Reset to Defaults

If you need to reset the Excluded Architectures setting:

1. In Xcode Build Settings, find **Excluded Architectures**
2. Select the value field
3. Press Delete to clear the value
4. Press Enter to confirm (this sets it back to empty/default)

### Common Errors

#### "Building for iOS Simulator, but linking in an object file built for iOS"
**Cause:** EXCLUDED_ARCHS not set correctly or not applied to all targets

**Solution:**
- Verify all 4 targets have `arm64` excluded for simulator
- Clean build folder and DerivedData
- Rebuild project

#### "No such module 'ReactCommon'"
**Cause:** This is a separate issue related to modular headers. See [IOS_BUILD_FIXES.md](./IOS_BUILD_FIXES.md)

**Solution:** Ensure `use_modular_headers!` is commented out in `ios/Podfile`

#### Build succeeds but app crashes on simulator
**Cause:** Architecture mismatch between app and dependencies

**Solution:**
- Verify EXCLUDED_ARCHS is set for all targets
- Run `pod install` again
- Clean and rebuild

## Technical Background

### Why Exclude arm64 for Simulator?

On Apple Silicon (M1/M2) Macs, the iOS Simulator runs natively on arm64 architecture. However, React Native and some dependencies may have architecture conflicts when building for the simulator. By excluding arm64 for the simulator, Xcode will:

1. Build the app for x86_64 architecture (Intel-based simulator)
2. Use Rosetta 2 translation to run on Apple Silicon Macs
3. Avoid architecture conflicts with React Native dependencies

### Rosetta 2 Translation

Rosetta 2 is Apple's translation layer that allows x86_64 apps to run on Apple Silicon Macs. When you exclude arm64 for the simulator:

- The app is built for x86_64 (Intel)
- Rosetta 2 automatically translates it to run on M1/M2 Macs
- Performance impact is minimal for development
- Device builds are unaffected (they still build for arm64)

### Impact on Device Builds

**Important:** Excluding arm64 for the simulator does NOT affect device builds. When building for a physical iOS device:

- The app builds for arm64 (native Apple Silicon)
- No Rosetta translation is used
- Full performance and compatibility
- App Store builds work normally

The `[sdk=iphonesimulator*]` condition ensures this setting only applies to simulator builds.

## Quick Reference Checklist

Use this checklist to ensure all targets are configured:

- [ ] **Candle** target
  - [ ] Debug → Any iOS Simulator SDK = `arm64`
  - [ ] Release → Any iOS Simulator SDK = `arm64`
- [ ] **CandleCanvasWidget** target
  - [ ] Debug → Any iOS Simulator SDK = `arm64`
  - [ ] Release → Any iOS Simulator SDK = `arm64`
- [ ] **CandleCountdownWidget** target
  - [ ] Debug → Any iOS Simulator SDK = `arm64`
  - [ ] Release → Any iOS Simulator SDK = `arm64`
- [ ] **CandleDailyPhotoWidget** target
  - [ ] Debug → Any iOS Simulator SDK = `arm64`
  - [ ] Release → Any iOS Simulator SDK = `arm64`
- [ ] Clean build folder (Shift+Cmd+K)
- [ ] Delete DerivedData
- [ ] Rebuild project (Cmd+B)
- [ ] Verify with `npm run verify:ios`

## Additional Resources

- [IOS_BUILD_FIXES.md](./IOS_BUILD_FIXES.md) - Complete iOS build troubleshooting guide
- [README.md](./README.md) - Project setup and installation instructions
- [React Native Architecture Documentation](https://reactnative.dev/docs/architecture/overview)

## Environment Configuration

The `ios/.xcode.env` file configures the build environment for Xcode. This ensures consistent Node.js binary detection across different developer setups.

**For nvm users:** The NODE_BINARY auto-detection should work automatically. If you encounter issues, create `ios/.xcode.env.local` with your specific Node path.

See the `ios/.xcode.env` file for configuration options.
