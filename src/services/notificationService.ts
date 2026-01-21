/**
 * Notification Service
 * Comprehensive notification handling for all notification types
 */

import messaging from '@react-native-firebase/messaging';
import {Platform, Alert} from 'react-native';
import {firebaseFirestore, usersCollection, partnershipsCollection} from './firebase';
import {getNotificationSettings} from './notificationSettings';
import type {FirebaseMessagingTypes} from '@react-native-firebase/messaging';

/**
 * Notification data structure
 */
export interface NotificationData {
  type: 'partner_answered' | 'daily_prompt' | 'streak_reminder' | 'photo_shared' | 'game_challenge' | 'message';
  navigationTarget: string;
  navigationParams: string; // JSON stringified params
  partnershipId?: string;
  questionId?: string;
  messageId?: string;
  gameType?: string;
}

/**
 * Initialize notifications for a user
 */
export async function initializeNotifications(userId: string): Promise<void> {
  try {
    // Request permissions
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.warn('Notification permissions not granted');
      return;
    }

    // Get FCM token
    const token = await messaging().getToken();
    if (token) {
      // Save token to user document
      await firebaseFirestore
        .collection('users')
        .doc(userId)
        .update({
          fcmToken: token,
          fcmTokenUpdatedAt: firebaseFirestore.FieldValue.serverTimestamp(),
        });
    }

    // Listen for token refresh
    messaging().onTokenRefresh(async (newToken: string) => {
      await refreshFCMToken(userId, newToken);
    });
  } catch (error: any) {
    console.error('Error initializing notifications:', error);
    // Don't throw - allow app to continue without notifications
  }
}

/**
 * Refresh FCM token
 */
export async function refreshFCMToken(userId: string, newToken?: string): Promise<void> {
  try {
    const token = newToken || (await messaging().getToken());
    if (token) {
      await firebaseFirestore
        .collection('users')
        .doc(userId)
        .update({
          fcmToken: token,
          fcmTokenUpdatedAt: firebaseFirestore.FieldValue.serverTimestamp(),
        });
    }
  } catch (error: any) {
    console.error('Error refreshing FCM token:', error);
  }
}

/**
 * Remove FCM token on logout
 */
export async function removeFCMToken(userId: string): Promise<void> {
  try {
    await messaging().deleteToken();
    await firebaseFirestore
      .collection('users')
      .doc(userId)
      .update({
        fcmToken: firebaseFirestore.FieldValue.delete(),
        fcmTokenUpdatedAt: firebaseFirestore.FieldValue.delete(),
      });
  } catch (error: any) {
    console.error('Error removing FCM token:', error);
  }
}

/**
 * Handle notification received when app is in foreground
 */
export function handleNotificationReceived(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): void {
  console.log('Notification received in foreground:', remoteMessage);
  
  // Show local notification or in-app notification
  if (remoteMessage.notification) {
    Alert.alert(
      remoteMessage.notification.title || 'New Notification',
      remoteMessage.notification.body || '',
      [{text: 'OK'}],
    );
  }
}

/**
 * Handle notification opened (tapped)
 */
export function handleNotificationOpened(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage,
): void {
  console.log('Notification opened:', remoteMessage);
  
  const data = remoteMessage.data as NotificationData;
  if (!data) {
    return;
  }

  // Navigation will be handled in App.tsx using navigationRef
  // This function is called from App.tsx where navigation is available
}

/**
 * Schedule local notification
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data: NotificationData,
  scheduledTime: Date,
): Promise<void> {
  try {
    // Note: For local notifications, you would use a library like @react-native-community/push-notification-ios
    // or @notifee/react-native. For now, this is a placeholder.
    // In production, you would schedule the notification here.
    console.log('Scheduling local notification:', {title, body, data, scheduledTime});
  } catch (error: any) {
    console.error('Error scheduling local notification:', error);
  }
}

/**
 * Send partner answered notification
 */
export async function sendPartnerAnsweredNotification(
  partnerId: string,
  senderName: string,
  questionText: string,
  questionId: string,
  partnershipId: string,
): Promise<void> {
  try {
    const partnerDoc = await usersCollection.doc(partnerId).get();
    const partner = partnerDoc.data();
    const fcmToken = partner?.fcmToken;

    if (!fcmToken) {
      console.warn('Partner has no FCM token');
      return;
    }

    // Check if partner has notifications enabled
    const settings = await getNotificationSettings(partnerId);
    if (!settings.partnerActivityNotifications) {
      return;
    }

    // Note: In production, this would be sent via Firebase Cloud Functions
    // For now, we'll log the notification structure
    const notificationData: NotificationData = {
      type: 'partner_answered',
      navigationTarget: 'QuestionDetail',
      navigationParams: JSON.stringify({
        questionId,
        partnershipId,
      }),
      questionId,
      partnershipId,
    };

    console.log('Partner answered notification:', {
      partnerId,
      title: `${senderName} answered!`,
      body: `Your partner answered: ${questionText.substring(0, 50)}...`,
      data: notificationData,
    });

    // In production, send via cloud function:
    // await sendPushNotification(partnerId, {
    //   notification: {
    //     title: `${senderName} answered!`,
    //     body: `Your partner answered: ${questionText.substring(0, 50)}...`,
    //   },
    //   data: notificationData,
    // });
  } catch (error: any) {
    console.error('Error sending partner answered notification:', error);
  }
}

/**
 * Send daily prompt notification
 */
export async function sendDailyPromptNotification(
  userId: string,
  promptText: string,
): Promise<void> {
  try {
    const userDoc = await usersCollection.doc(userId).get();
    const user = userDoc.data();
    const fcmToken = user?.fcmToken;

    if (!fcmToken) {
      return;
    }

    const settings = await getNotificationSettings(userId);
    if (!settings.dailyPromptReminder) {
      return;
    }

    const notificationData: NotificationData = {
      type: 'daily_prompt',
      navigationTarget: 'MainTabs',
      navigationParams: JSON.stringify({screen: 'Connect'}),
    };

    console.log('Daily prompt notification:', {
      userId,
      title: 'Daily Question Ready',
      body: promptText,
      data: notificationData,
    });
  } catch (error: any) {
    console.error('Error sending daily prompt notification:', error);
  }
}

/**
 * Send streak reminder notification
 */
export async function sendStreakReminderNotification(
  userId: string,
  partnerName: string,
  hoursRemaining: number,
): Promise<void> {
  try {
    const userDoc = await usersCollection.doc(userId).get();
    const user = userDoc.data();
    const fcmToken = user?.fcmToken;

    if (!fcmToken) {
      return;
    }

    const settings = await getNotificationSettings(userId);
    if (!settings.streakReminder) {
      return;
    }

    const notificationData: NotificationData = {
      type: 'streak_reminder',
      navigationTarget: 'MainTabs',
      navigationParams: JSON.stringify({screen: 'Connect'}),
    };

    console.log('Streak reminder notification:', {
      userId,
      title: 'Streak About to Expire!',
      body: `Your streak is about to expire! Answer today's question with ${partnerName} to keep it alive.`,
      data: notificationData,
    });
  } catch (error: any) {
    console.error('Error sending streak reminder notification:', error);
  }
}

/**
 * Send photo shared notification
 */
export async function sendPhotoSharedNotification(
  partnerId: string,
  senderName: string,
  promptId: string,
  partnershipId: string,
): Promise<void> {
  try {
    const partnerDoc = await usersCollection.doc(partnerId).get();
    const partner = partnerDoc.data();
    const fcmToken = partner?.fcmToken;

    if (!fcmToken) {
      return;
    }

    const settings = await getNotificationSettings(partnerId);
    if (!settings.partnerActivityNotifications) {
      return;
    }

    const notificationData: NotificationData = {
      type: 'photo_shared',
      navigationTarget: 'PhotoDetail',
      navigationParams: JSON.stringify({
        promptId,
      }),
      promptId,
      partnershipId,
    };

    console.log('Photo shared notification:', {
      partnerId,
      title: 'New Photo Shared',
      body: `${senderName} shared a photo with you!`,
      data: notificationData,
    });
  } catch (error: any) {
    console.error('Error sending photo shared notification:', error);
  }
}

/**
 * Send game challenge notification
 */
export async function sendGameChallengeNotification(
  partnerId: string,
  senderName: string,
  gameType: string,
): Promise<void> {
  try {
    const partnerDoc = await usersCollection.doc(partnerId).get();
    const partner = partnerDoc.data();
    const fcmToken = partner?.fcmToken;

    if (!fcmToken) {
      return;
    }

    const settings = await getNotificationSettings(partnerId);
    if (!settings.partnerActivityNotifications) {
      return;
    }

    const gameNames: {[key: string]: string} = {
      whosMoreLikely: "Who's More Likely",
      anagrams: 'Anagrams',
      whatYouSaying: 'What You Saying',
      fourInARow: 'Four in a Row',
      drawDuel: 'Draw Duel',
      perfectPair: 'Perfect Pair',
      stickerGenerator: 'Sticker Generator',
    };

    const gameRouteNames: {[key: string]: string} = {
      whosMoreLikely: 'WhosMoreLikely',
      anagrams: 'Anagrams',
      whatYouSaying: 'WhatYouSaying',
      fourInARow: 'FourInARow',
      drawDuel: 'DrawDuel',
      perfectPair: 'PerfectPair',
      stickerGenerator: 'StickerGenerator',
    };

    const gameName = gameNames[gameType] || gameType;
    const routeName = gameRouteNames[gameType] || gameType;

    const notificationData: NotificationData = {
      type: 'game_challenge',
      navigationTarget: routeName,
      navigationParams: JSON.stringify({}),
      gameType,
    };

    console.log('Game challenge notification:', {
      partnerId,
      title: 'Game Challenge!',
      body: `${senderName} started a game of ${gameName}!`,
      data: notificationData,
    });
  } catch (error: any) {
    console.error('Error sending game challenge notification:', error);
  }
}

/**
 * Send message notification (enhanced version)
 */
export async function sendMessageNotification(
  partnershipId: string,
  senderId: string,
  messageType: string,
  messageId: string,
): Promise<void> {
  try {
    // Get partnership to find partner user ID
    const partnershipDoc = await partnershipsCollection.doc(partnershipId).get();
    const partnership = partnershipDoc.data();

    if (!partnership) {
      return;
    }

    const partnerId =
      partnership.userId1 === senderId
        ? partnership.userId2
        : partnership.userId1;

    if (!partnerId) {
      return;
    }

    const partnerDoc = await usersCollection.doc(partnerId).get();
    const partner = partnerDoc.data();
    const fcmToken = partner?.fcmToken;

    if (!fcmToken) {
      return;
    }

    const settings = await getNotificationSettings(partnerId);
    if (!settings.partnerActivityNotifications) {
      return;
    }

    const senderDoc = await usersCollection.doc(senderId).get();
    const sender = senderDoc.data();
    const senderName = sender?.name || 'Your partner';

    let notificationBody = '';
    switch (messageType) {
      case 'photo':
        notificationBody = `${senderName} sent a photo`;
        break;
      case 'voice':
        notificationBody = `${senderName} sent a voice message`;
        break;
      case 'text':
      default:
        notificationBody = `${senderName} sent a message`;
        break;
    }

    const notificationData: NotificationData = {
      type: 'message',
      navigationTarget: 'Chat',
      navigationParams: JSON.stringify({
        partnershipId,
        questionId: '', // Optional
      }),
      partnershipId,
      messageId,
    };

    console.log('Message notification:', {
      partnerId,
      title: 'New Message',
      body: notificationBody,
      data: notificationData,
    });
  } catch (error: any) {
    console.error('Error sending message notification:', error);
  }
}

/**
 * Setup background message handler
 */
export function setupBackgroundMessageHandler(): void {
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('Message handled in background:', remoteMessage);
    // Process notification data
    // Update badge count, local storage, etc.
  });
}

/**
 * Setup notification listeners
 */
export function setupNotificationListeners(): {
  unsubscribeForeground: () => void;
  unsubscribeNotificationOpened: () => void;
} {
  // Foreground message handler
  const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
    handleNotificationReceived(remoteMessage);
  });

  // Notification opened handler (when app is in background)
  const unsubscribeNotificationOpened = messaging().onNotificationOpenedApp(
    remoteMessage => {
      handleNotificationOpened(remoteMessage);
    },
  );

  return {
    unsubscribeForeground,
    unsubscribeNotificationOpened,
  };
}

/**
 * Send referral notification
 */
export async function sendReferralNotification(
  userId: string,
  message: string,
): Promise<void> {
  try {
    const userDoc = await usersCollection.doc(userId).get();
    const user = userDoc.data();
    const fcmToken = user?.fcmToken;

    if (!fcmToken) {
      return;
    }

    const settings = await getNotificationSettings(userId);
    if (!settings.partnerActivityNotifications) {
      return;
    }

    const notificationData: NotificationData = {
      type: 'message',
      navigationTarget: 'Referral',
      navigationParams: JSON.stringify({}),
    };

    console.log('Referral notification:', {
      userId,
      title: 'Referral Reward!',
      body: message,
      data: notificationData,
    });
  } catch (error: any) {
    console.error('Error sending referral notification:', error);
  }
}

/**
 * Send test notification (for debugging)
 */
export async function sendTestNotification(
  userId: string,
  type: NotificationData['type'],
): Promise<void> {
  try {
    const userDoc = await usersCollection.doc(userId).get();
    const user = userDoc.data();
    const fcmToken = user?.fcmToken;

    if (!fcmToken) {
      console.warn('User has no FCM token');
      return;
    }

    const testData: NotificationData = {
      type,
      navigationTarget: 'MainTabs',
      navigationParams: JSON.stringify({}),
    };

    console.log('Test notification:', {
      userId,
      title: 'Test Notification',
      body: `This is a test ${type} notification`,
      data: testData,
    });
  } catch (error: any) {
    console.error('Error sending test notification:', error);
  }
}
