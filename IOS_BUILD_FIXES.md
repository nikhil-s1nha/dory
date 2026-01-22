# iOS Build Fixes Summary

## Xcode Build Settings Configuration

**Important for M1/M2 Macs:** Before building, you must configure Xcode build settings to exclude arm64 architecture for the iOS Simulator. This is a manual UI configuration that cannot be automated.

**See [XCODE_BUILD_SETTINGS.md](./XCODE_BUILD_SETTINGS.md) for detailed step-by-step instructions.**

### Verify Configuration

After manual Xcode configuration, run:
```bash
npm run verify:ios
```

This checks that all build settings were applied correctly.

## Quick Fix Commands

```bash
# Complete clean and rebuild
cd ios
rm -rf Pods Podfile.lock ~/Library/Developer/Xcode/DerivedData
pod repo update
pod install
cd ..
# Then open Xcode and build
```

## Critical Build Errors & Solutions

### ReactCommon Module Redefinition Error
**Problem:** `use_modular_headers!` on line 12 of `ios/Podfile` causes module conflicts with React Native 0.76+ and Xcode 16+.

**Solution:** The `use_modular_headers!` directive has been commented out in the Podfile. This prevents the ReactCommon module redefinition error that was blocking builds. Firebase pods still work correctly without global modular headers.

### Bundle Identifier Conflict
**Problem:** `com.encore.candleapp` is already registered and cannot be used.

**Solution:** The bundle identifier has been changed to `com.nikhilsinha.candleapp` throughout the codebase. After changing the bundle ID, Xcode needs to regenerate provisioning profiles.

### Provisioning Profile Error
**Problem:** After changing bundle ID, Xcode may show provisioning profile errors.

**Solution:** Xcode will automatically regenerate provisioning profiles when you select your Team in the Signing & Capabilities tab. Ensure all targets (main app + 3 widget extensions) use the new bundle ID.

## Issues Fixed

### 1. ✅ Workspace Configuration
- **Fixed:** Removed duplicate `Candle.xcodeproj` entry in `ios/Candle.xcworkspace/contents.xcworkspacedata`
- **Changed:** `location = "self:Candle.xcodeproj"` → `location = "container:Candle.xcodeproj"`

### 2. ✅ AppDelegate.swift
- **Fixed:** Removed `import ReactAppDependencyProvider` (not needed in RN 0.76)
- **Fixed:** Removed `delegate.dependencyProvider = RCTAppDependencyProvider()` assignment
- **Fixed:** Removed FirebaseMessaging imports and push notification code (since Push Notifications are disabled)

### 3. ✅ Podfile
- **Fixed:** Added defensive error handling for `use_native_modules!`
- **Fixed:** Commented out `use_modular_headers!` globally to prevent ReactCommon module conflicts (see section 5 below)
- **Fixed:** Manually added Firebase pods with correct paths:
  - `RNFBApp`
  - `RNFBAuth`
  - `RNFBFirestore`
  - `RNFBStorage`
- **Note:** `RNFBMessaging` is commented out because it's not installed in `node_modules` (but it's in `package.json`)

### 4. ✅ Push Notifications Disabled
- **Fixed:** Commented out `aps-environment` in `ios/Candle/Candle.entitlements`
- **Fixed:** Removed `UIBackgroundModes` for `remote-notification` from `ios/Candle/Info.plist`
- **Reason:** Personal Team development accounts don't support Push Notifications capability

### 5. ✅ React Native 0.76 Compatibility
- **Fixed:** Removed `use_modular_headers!` from global scope (line 12) to prevent ReactCommon module redefinition
- **Note:** This is a known issue with React Native 0.76+ when using Xcode 16.2+ and iOS SDK 26.2
- **Verified:** Firebase pods still work correctly without global modular headers

## Complete Clean Build Process

Before building in Xcode, perform a complete clean to ensure all cached build artifacts are removed:

### 1. Clean CocoaPods cache and reinstall
```bash
cd ios
rm -rf Pods Podfile.lock
pod deintegrate
pod repo update
pod install
```

### 2. Clean Xcode DerivedData
```bash
rm -rf ~/Library/Developer/Xcode/DerivedData
```

### 3. Clean React Native cache (if needed)
```bash
cd ..
npm start -- --reset-cache
```

## Next Steps to Build in Xcode

### 1. Install Dependencies (if needed)
If you haven't already, install npm dependencies:
```bash
cd /Users/NikhilSinha/Downloads/candle/dory
npm install
```

### 2. Install CocoaPods
Run pod install in the iOS directory:
```bash
cd /Users/NikhilSinha/Downloads/candle/dory/ios
pod install
```

**Note:** If you get permission errors, you may need to run:
```bash
sudo chmod -R 755 ~/Library/Caches/CocoaPods
```

### 3. Open in Xcode
Open the workspace (not the project):
```bash
open ios/Candle.xcworkspace
```

### 4. Configure Code Signing
1. Select the **Candle** project in the navigator
2. Select the **Candle** target
3. Go to **Signing & Capabilities** tab
4. Select your **Team** (Personal Team is fine)
5. Ensure **Bundle Identifier** is set to `com.nikhilsinha.candleapp`
   - **Important:** Do not use `com.encore.candleapp` as it's already registered and will show "Failed Registering Bundle Identifier" error
6. Verify all targets (main app + 3 widget extensions) have correct bundle IDs:
   - Main app: `com.nikhilsinha.candleapp`
   - Widget extensions: Should follow the pattern `com.nikhilsinha.candleapp.widgetname`
7. Select the same **Team** for all targets
8. Xcode will automatically create provisioning profiles for the new bundle ID

### 5. Clean and Build
1. **Clean Build Folder:** `Product → Clean Build Folder` (Shift+Cmd+K)
2. **Build:** `Product → Build` (Cmd+B)
3. **Run:** `Product → Run` (Cmd+R)

## Optional: Re-enable Push Notifications

If you later get a paid Apple Developer account and want to enable Push Notifications:

1. **Uncomment in `ios/Candle/Candle.entitlements`:**
   ```xml
   <key>aps-environment</key>
   <string>development</string>
   ```

2. **Add to `ios/Candle/Info.plist`:**
   ```xml
   <key>UIBackgroundModes</key>
   <array>
       <string>remote-notification</string>
   </array>
   ```

3. **Uncomment in `ios/Podfile`:**
   ```ruby
   pod 'RNFBMessaging', :path => '../node_modules/@react-native-firebase/messaging'
   ```

4. **Update `ios/Candle/AppDelegate.swift`** to add back Messaging imports and setup

5. Run `pod install` again

6. In Xcode, add the **Push Notifications** capability in **Signing & Capabilities**

## Pre-Build Verification Checklist

Before attempting to build, verify the following:

- [ ] `use_modular_headers!` is commented out in `ios/Podfile`
- [ ] Bundle ID is `com.nikhilsinha.candleapp` in all targets
- [ ] **App Groups removed** - Not supported on Personal Teams (free Apple Developer accounts)
- [ ] **Push Notifications removed** - Not supported on Personal Teams
- [ ] `pod install` completed without errors
- [ ] Xcode workspace (not project) is opened
- [ ] Signing team selected for all 4 targets (main app + 3 widgets)
- [ ] DerivedData cleared

## Troubleshooting Common Errors

### "could not build module '_AvailabilityInternal'"
**Cause:** This error cascades from the ReactCommon module redefinition error.

**Solution:** Ensure `use_modular_headers!` is commented out in `ios/Podfile` (line 12). Then perform a complete clean build (see "Complete Clean Build Process" section above).

### "No profiles for 'com.encore.candleapp'"
**Cause:** The old bundle identifier is still referenced somewhere in the project.

**Solution:** 
1. Change bundle ID in Xcode project settings to `com.nikhilsinha.candleapp`
2. Verify all targets (main app + 3 widget extensions) use the new bundle ID
3. Clean build folder and rebuild

### Build still failing after clean
**Solution:** 
1. Open Xcode
2. Go to **Preferences** → **Locations** → **Derived Data**
3. Click the arrow to open in Finder
4. Delete the entire DerivedData folder
5. Close and reopen Xcode
6. Clean build folder (Shift+Cmd+K) and rebuild

### Widget build errors
**Cause:** App Groups are not available on Personal Teams (free Apple Developer accounts).

**Solution:** 
- App Groups have been removed from the project for Personal Team compatibility
- Widgets will not be able to share data with the main app without App Groups
- To re-enable widgets with data sharing, you need a paid Apple Developer account:
  1. Add App Groups capability in Xcode (Signing & Capabilities)
  2. Update widget code to use `UserDefaults(suiteName: "group.com.nikhilsinha.candleapp.widgets")`
  3. Update entitlements files to include the App Group

## Current Status

✅ ReactCommon module conflict resolved (removed global modular headers)
✅ Bundle identifier changed to `com.nikhilsinha.candleapp`
✅ All widget bundle IDs updated
✅ App Groups removed for Personal Team compatibility
✅ Push Notifications disabled for Personal Team compatibility
✅ All Xcode configuration errors should be resolved
✅ Project configured for Personal Team (free Apple Developer account)
✅ Firebase pods manually linked
✅ Workspace structure fixed
✅ AppDelegate cleaned up for RN 0.76

⚠️ **Action Required**: Create new Firebase iOS app with bundle ID `com.nikhilsinha.candleapp` and download `GoogleService-Info.plist` to `ios/Candle/`

The project should now build successfully in Xcode!
