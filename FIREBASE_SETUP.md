# Firebase Setup Guide

This guide will walk you through setting up Firebase for the Candle app.

## Prerequisites

- Firebase account (free tier is sufficient)
- Firebase project created
- iOS and Android apps registered in Firebase Console

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Name your project "Candle" (or your preferred name)
4. Follow the setup wizard to create the project

## Step 2: Add iOS App

1. In Firebase Console, click the iOS icon to add an iOS app
2. Enter the bundle ID: `com.encore.candleapp` (from `ios/Candle/Info.plist`)
3. Download `GoogleService-Info.plist`
4. Place the file in `ios/Candle/` directory
5. Make sure it's added to the Xcode project (drag and drop into Xcode)

## Step 3: Add Android App

1. In Firebase Console, click the Android icon to add an Android app
2. Enter the package name: `com.encore.candleapp` (from `android/app/build.gradle`)
3. Download `google-services.json`
4. Place the file in `android/app/` directory

## Step 4: Enable Firebase Services

### Enable Authentication

1. Go to Firebase Console → Authentication
2. Click "Get started"
3. Enable "Email/Password" sign-in method
4. Save

### Enable Firestore Database

1. Go to Firebase Console → Firestore Database
2. Click "Create database"
3. Start in **test mode** for development (you'll configure security rules later)
4. Choose a location (select closest to your users)
5. Click "Enable"

### Enable Cloud Storage

1. Go to Firebase Console → Storage
2. Click "Get started"
3. Start in **test mode** for development
4. Use the same location as Firestore
5. Click "Done"

## Step 5: Configure Environment Variables

1. Create a `.env` file in the project root (if it doesn't exist)
2. Add your Firebase configuration values:

```env
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

You can find these values in:
- Firebase Console → Project Settings → General → Your apps
- Or in `GoogleService-Info.plist` (iOS) and `google-services.json` (Android)

**Note:** For React Native, the native configuration files (`GoogleService-Info.plist` and `google-services.json`) are the primary source of configuration. The `.env` file is optional but can be used for additional configuration if needed.

## Step 6: Install Dependencies

Dependencies are already installed. If you need to reinstall:

```bash
npm install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore @react-native-firebase/storage
```

For iOS, install CocoaPods:

```bash
cd ios && pod install && cd ..
```

## Step 7: Configure Security Rules

### Firestore Security Rules

Go to Firebase Console → Firestore Database → Rules and paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to get user ID
    function getUserId() {
      return request.auth.uid;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated() && (userId == getUserId() || isPartner(userId));
      allow write: if isAuthenticated() && userId == getUserId();
      
      // Helper function to check if user is partner
      function isPartner(userId) {
        let partnership = get(/databases/$(database)/documents/partnerships/$(getPartnershipId(userId))).data;
        return partnership.userId1 == userId || partnership.userId2 == userId;
      }
      
      function getPartnershipId(userId) {
        // This is simplified - you may need to adjust based on your data structure
        return userId;
      }
    }
    
    // Partnerships collection
    match /partnerships/{partnershipId} {
      allow read: if isAuthenticated() && 
        (resource.data.userId1 == getUserId() || resource.data.userId2 == getUserId());
      allow create: if isAuthenticated();
      allow update: if isAuthenticated() && 
        (resource.data.userId1 == getUserId() || resource.data.userId2 == getUserId());
    }
    
    // Questions collection (read-only for all authenticated users)
    match /questions/{questionId} {
      allow read: if isAuthenticated();
      allow write: if false; // Questions are managed separately
    }
    
    // Answers collection
    match /answers/{answerId} {
      allow read: if isAuthenticated() && 
        (resource.data.userId == getUserId() || isPartnerInAnswer(resource.data.partnershipId));
      allow create: if isAuthenticated() && request.resource.data.userId == getUserId();
      allow update: if isAuthenticated() && 
        (resource.data.userId == getUserId() || isPartnerInAnswer(resource.data.partnershipId));
      
      function isPartnerInAnswer(partnershipId) {
        let partnership = get(/databases/$(database)/documents/partnerships/$(partnershipId)).data;
        return partnership.userId1 == getUserId() || partnership.userId2 == getUserId();
      }
    }
    
    // Messages collection
    match /messages/{messageId} {
      allow read: if isAuthenticated() && isPartnerInMessage(resource.data.partnershipId);
      allow create: if isAuthenticated() && 
        request.resource.data.senderId == getUserId() && 
        isPartnerInMessage(request.resource.data.partnershipId);
      allow update: if isAuthenticated() && resource.data.senderId == getUserId();
      
      function isPartnerInMessage(partnershipId) {
        let partnership = get(/databases/$(database)/documents/partnerships/$(partnershipId)).data;
        return partnership.userId1 == getUserId() || partnership.userId2 == getUserId();
      }
    }
    
    // Canvas drawings collection
    match /canvasDrawings/{canvasId} {
      allow read: if isAuthenticated() && isPartnerInCanvas(resource.data.partnershipId);
      allow create, update, delete: if isAuthenticated() && isPartnerInCanvas(resource.data.partnershipId);
      
      function isPartnerInCanvas(partnershipId) {
        let partnership = get(/databases/$(database)/documents/partnerships/$(partnershipId)).data;
        return partnership.userId1 == getUserId() || partnership.userId2 == getUserId();
      }
    }
    
    // Countdowns collection
    match /countdowns/{countdownId} {
      allow read: if isAuthenticated() && isPartnerInCountdown(resource.data.partnershipId);
      allow create, update, delete: if isAuthenticated() && isPartnerInCountdown(resource.data.partnershipId);
      
      function isPartnerInCountdown(partnershipId) {
        let partnership = get(/databases/$(database)/documents/partnerships/$(partnershipId)).data;
        return partnership.userId1 == getUserId() || partnership.userId2 == getUserId();
      }
    }
    
    // Game scores collection
    match /gameScores/{scoreId} {
      allow read: if isAuthenticated() && isPartnerInGame(resource.data.partnershipId);
      allow create: if isAuthenticated() && request.resource.data.userId == getUserId();
      
      function isPartnerInGame(partnershipId) {
        let partnership = get(/databases/$(database)/documents/partnerships/$(partnershipId)).data;
        return partnership.userId1 == getUserId() || partnership.userId2 == getUserId();
      }
    }
    
    // Photo prompts collection
    match /photoPrompts/{promptId} {
      allow read: if isAuthenticated() && isPartnerInPhoto(resource.data.partnershipId);
      allow create, update: if isAuthenticated() && isPartnerInPhoto(resource.data.partnershipId);
      
      function isPartnerInPhoto(partnershipId) {
        let partnership = get(/databases/$(database)/documents/partnerships/$(partnershipId)).data;
        return partnership.userId1 == getUserId() || partnership.userId2 == getUserId();
      }
    }
  }
}
```

### Cloud Storage Security Rules

Go to Firebase Console → Storage → Rules and paste:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Messages media
    match /partnerships/{partnershipId}/messages/{messageId}/{filename} {
      allow read: if request.auth != null && isPartner(partnershipId);
      allow write: if request.auth != null && isPartner(partnershipId);
      
      function isPartner(partnershipId) {
        return firestore.get(/databases/(default)/documents/partnerships/$(partnershipId)).data.userId1 == request.auth.uid ||
               firestore.get(/databases/(default)/documents/partnerships/$(partnershipId)).data.userId2 == request.auth.uid;
      }
    }
    
    // Photo prompts
    match /partnerships/{partnershipId}/photos/{promptId}/{userId}/{filename} {
      allow read: if request.auth != null && isPartner(partnershipId);
      allow write: if request.auth != null && isPartner(partnershipId) && userId == request.auth.uid;
      
      function isPartner(partnershipId) {
        return firestore.get(/databases/(default)/documents/partnerships/$(partnershipId)).data.userId1 == request.auth.uid ||
               firestore.get(/databases/(default)/documents/partnerships/$(partnershipId)).data.userId2 == request.auth.uid;
      }
    }
    
    // Canvas drawings
    match /partnerships/{partnershipId}/canvas/{canvasId}/{filename} {
      allow read: if request.auth != null && isPartner(partnershipId);
      allow write: if request.auth != null && isPartner(partnershipId);
      
      function isPartner(partnershipId) {
        return firestore.get(/databases/(default)/documents/partnerships/$(partnershipId)).data.userId1 == request.auth.uid ||
               firestore.get(/databases/(default)/documents/partnerships/$(partnershipId)).data.userId2 == request.auth.uid;
      }
    }
  }
}
```

## Step 8: Test the Setup

### Manual Testing Checklist

1. **Authentication**
   - [ ] Create a user account
   - [ ] Sign in with email/password
   - [ ] Sign out
   - [ ] Reset password (check email)

2. **Partnership**
   - [ ] Create a partnership (generates invite code)
   - [ ] Accept partnership invitation with invite code
   - [ ] Verify partnership status changes to 'active'

3. **Questions & Answers**
   - [ ] Fetch questions
   - [ ] Submit an answer
   - [ ] Verify real-time sync when partner answers
   - [ ] Verify answers are revealed when both partners answer

4. **Messaging**
   - [ ] Send a text message
   - [ ] Send a photo message
   - [ ] Verify real-time message delivery
   - [ ] Add reaction to message

5. **Canvas**
   - [ ] Draw on canvas
   - [ ] Verify real-time canvas sync
   - [ ] View canvas history

6. **Photo Prompts**
   - [ ] Get daily photo prompt
   - [ ] Upload photo for prompt
   - [ ] Verify partner sees uploaded photo

7. **Countdowns**
   - [ ] Create a countdown
   - [ ] View countdowns list
   - [ ] Update countdown
   - [ ] Delete countdown

8. **Game Scores**
   - [ ] Save a game score
   - [ ] View leaderboard
   - [ ] View user statistics

## Troubleshooting

### Common Issues

#### iOS Build Errors

**Issue:** `FirebaseApp.configure()` not found
- **Solution:** Make sure `GoogleService-Info.plist` is added to Xcode project and Firebase pods are installed (`cd ios && pod install`)

**Issue:** Module not found errors
- **Solution:** Clean build folder in Xcode (Cmd+Shift+K) and rebuild

#### Android Build Errors

**Issue:** `google-services` plugin not applied
- **Solution:** Make sure `google-services.json` is in `android/app/` and the plugin is applied in `android/app/build.gradle`

**Issue:** Build fails with dependency conflicts
- **Solution:** Update `android/build.gradle` with correct Google Services version

#### Runtime Errors

**Issue:** "Permission denied" errors
- **Solution:** Check Firestore and Storage security rules are properly configured

**Issue:** Authentication not working
- **Solution:** Verify Email/Password is enabled in Firebase Console → Authentication → Sign-in method

**Issue:** Real-time listeners not updating
- **Solution:** Check network connection and verify Firestore is enabled with proper rules

#### Network Connectivity

**Issue:** Offline mode not working
- **Solution:** Firestore offline persistence is enabled by default. Check that `firestore().settings({ persistence: true })` is called in `firebase.ts`

### Getting Help

- Check [React Native Firebase Documentation](https://rnfirebase.io/)
- Check [Firebase Documentation](https://firebase.google.com/docs)
- Review error messages in console/logs
- Check Firebase Console for service status

## Next Steps

After setup is complete:

1. Seed the `questions` collection with question data
2. Test all features end-to-end
3. Monitor Firebase Console for usage and errors
4. Set up Firebase Analytics (optional)
5. Configure push notifications (optional)

## Security Notes

- **Never commit** `.env` file or `GoogleService-Info.plist` / `google-services.json` with real credentials to public repositories
- Use Firebase App Check for additional security in production
- Regularly review and update security rules
- Monitor Firebase Console for suspicious activity
