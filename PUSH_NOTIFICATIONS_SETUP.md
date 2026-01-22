# Push Notifications Setup Guide

## Current Status: Disabled for Personal Team Development

Push notifications have been temporarily disabled because **Personal Teams** (free Apple Developer accounts) do not support the Push Notifications capability.

## What This Means

- ✅ The app will build and run successfully
- ✅ All other features will work normally
- ❌ Remote push notifications will not work
- ❌ Firebase Cloud Messaging remote notifications will not work
- ✅ Local notifications will still work

## To Re-enable Push Notifications

When you're ready to use push notifications (requires a **paid Apple Developer account**):

### 1. Update Entitlements File
Edit `ios/Candle/Candle.entitlements` and uncomment:
```xml
<key>aps-environment</key>
<string>development</string>
```

### 2. Update Info.plist
Edit `ios/Candle/Info.plist` and uncomment:
```xml
<key>UIBackgroundModes</key>
<array>
	<string>remote-notification</string>
</array>
```

### 3. In Xcode
1. Select your project in Xcode
2. Go to "Signing & Capabilities" tab
3. Make sure you're using a **paid Apple Developer account** (not Personal Team)
4. Click "+ Capability" and add "Push Notifications"
5. Xcode will automatically create the provisioning profile

## Alternative: Test on Simulator

For development and testing, you can:
- Use the iOS Simulator (push notifications work differently but you can test the app flow)
- Test on a physical device without push notifications enabled
- Use local notifications for testing notification UI

## Notes

- Firebase Messaging will still initialize, but remote notifications won't be delivered
- The app will function normally for all other features
- You can develop and test the app without push notifications
