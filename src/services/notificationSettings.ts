/**
 * Notification Settings Service
 * Manages notification preferences and permissions
 */

import {firebaseFirestore} from './firebase';
import type {NotificationSettings} from '@utils/types';
import {Platform, PermissionsAndroid, Alert} from 'react-native';

import messaging from '@react-native-firebase/messaging';
import {initializeNotifications, scheduleLocalNotification} from './notificationService';

const DEFAULT_SETTINGS: NotificationSettings = {
  pushEnabled: false,
  dailyPromptReminder: false,
  dailyQuestionReminder: false,
  streakReminder: false,
  partnerActivityNotifications: false,
  preferredNotificationTime: '09:00',
};

/**
 * Get notification settings for a user
 */
export async function getNotificationSettings(
  userId: string,
): Promise<NotificationSettings> {
  try {
    const settingsDoc = await firebaseFirestore
      .collection('users')
      .doc(userId)
      .collection('settings')
      .doc('notifications')
      .get();

    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      return {
        ...DEFAULT_SETTINGS,
        ...data,
      } as NotificationSettings;
    }

    // Return default settings if none exist
    return DEFAULT_SETTINGS;
  } catch (error: any) {
    console.error('Error getting notification settings:', error);
    throw new Error(`Failed to get notification settings: ${error.message}`);
  }
}

/**
 * Update notification settings for a user
 */
export async function updateNotificationSettings(
  userId: string,
  settings: Partial<NotificationSettings>,
): Promise<void> {
  try {
    const settingsRef = firebaseFirestore
      .collection('users')
      .doc(userId)
      .collection('settings')
      .doc('notifications');

    const currentSettings = await getNotificationSettings(userId);

    await settingsRef.set(
      {
        ...settings,
        updatedAt: firebaseFirestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    // If push notifications are enabled, register for remote notifications
    if (settings.pushEnabled) {
      await registerForRemoteNotifications(userId);
    } else if (settings.pushEnabled === false) {
      // If push notifications are explicitly disabled, unregister
      await unregisterFromRemoteNotifications(userId);
    }

    // Handle daily prompt reminder scheduling
    if (settings.dailyPromptReminder !== undefined) {
      if (settings.dailyPromptReminder) {
        const preferredTime = settings.preferredNotificationTime || currentSettings.preferredNotificationTime;
        await scheduleDailyPromptReminder(userId, preferredTime);
      } else {
        await cancelScheduledNotifications(userId);
      }
    }

    // If preferred time changed and reminders are enabled, reschedule
    if (settings.preferredNotificationTime && currentSettings.dailyPromptReminder) {
      await scheduleDailyPromptReminder(userId, settings.preferredNotificationTime);
    }
  } catch (error: any) {
    console.error('Error updating notification settings:', error);
    throw new Error(`Failed to update notification settings: ${error.message}`);
  }
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      return enabled;
    } else {
      // Android
      if (Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      // Android < 33 doesn't require runtime permission
      return true;
    }
  } catch (error: any) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

/**
 * Get notification permission status without requesting
 */
export async function getNotificationPermissionStatus(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().hasPermission();
      return (
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL
      );
    } else {
      // Android
      if (Platform.Version >= 33) {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      // Android < 33 doesn't require runtime permission
      return true;
    }
  } catch (error: any) {
    console.error('Error checking notification permission status:', error);
    return false;
  }
}

/**
 * Schedule daily prompt reminder at preferred time
 */
export async function scheduleDailyPromptReminder(
  userId: string,
  preferredTime: string,
): Promise<void> {
  try {
    // Parse preferred time (format: "HH:mm")
    const [hours, minutes] = preferredTime.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    // Get daily prompt text (would be fetched from partnership)
    // For now, use a placeholder
    const promptText = "Time to answer today's question!";

    await scheduleLocalNotification(
      'Daily Question Ready',
      promptText,
      {
        type: 'daily_prompt',
        navigationTarget: 'MainTabs',
        navigationParams: JSON.stringify({screen: 'Connect'}),
      },
      scheduledTime,
    );
  } catch (error: any) {
    console.error('Error scheduling daily prompt reminder:', error);
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelScheduledNotifications(userId: string): Promise<void> {
  try {
    // Note: Implementation depends on local notification library
    // This is a placeholder for canceling scheduled notifications
    console.log('Canceling scheduled notifications for user:', userId);
  } catch (error: any) {
    console.error('Error canceling scheduled notifications:', error);
  }
}

/**
 * Register for remote notifications and save FCM token
 */
async function registerForRemoteNotifications(userId: string): Promise<void> {
  try {
    // Request permissions first
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      throw new Error('Notification permissions not granted');
    }

    // Initialize notifications (handles token registration)
    await initializeNotifications(userId);
  } catch (error: any) {
    console.error('Error registering for remote notifications:', error);
    throw new Error(
      `Failed to register for notifications: ${error.message}`,
    );
  }
}

/**
 * Unregister from remote notifications
 */
export async function unregisterFromRemoteNotifications(
  userId: string,
): Promise<void> {
  try {
    const {removeFCMToken} = await import('./notificationService');
    await removeFCMToken(userId);
    await cancelScheduledNotifications(userId);
  } catch (error: any) {
    console.error('Error unregistering from notifications:', error);
    throw new Error(
      `Failed to unregister from notifications: ${error.message}`,
    );
  }
}

/**
 * Schedule streak reminder notification
 * Sends reminder if streak is at risk (<6 hours remaining)
 */
export async function scheduleStreakReminder(
  userId: string,
  partnershipId: string,
  partnerName: string,
  hoursRemaining: number,
): Promise<void> {
  try {
    const settings = await getNotificationSettings(userId);
    
    // Only send reminder if streak reminders are enabled
    if (!settings.streakReminder) {
      return;
    }

    // Only send reminder if streak is at risk (<6 hours remaining)
    if (hoursRemaining >= 6) {
      return;
    }

    // Send streak reminder notification
    const {sendStreakReminderNotification} = await import('./notificationService');
    await sendStreakReminderNotification(userId, partnerName, hoursRemaining);
  } catch (error: any) {
    console.error('Error scheduling streak reminder:', error);
    // Don't throw - reminders are non-critical
  }
}

/**
 * Check and send streak reminders based on partnership status
 * Should be called periodically (e.g., hourly) via background task
 */
export async function checkAndSendStreakReminders(
  userId: string,
  partnershipId: string,
  partnerName: string,
  lastActivityDate: string,
): Promise<void> {
  try {
    if (!lastActivityDate) {
      return;
    }

    // Calculate hours remaining
    const lastActivity = new Date(lastActivityDate);
    const now = new Date();
    const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
    const hoursRemaining = 24 - hoursSinceActivity;

    // Only check if streak is active (<24 hours)
    if (hoursRemaining > 0 && hoursRemaining < 24) {
      await scheduleStreakReminder(
        userId,
        partnershipId,
        partnerName,
        hoursRemaining,
      );
    }
  } catch (error: any) {
    console.error('Error checking streak reminders:', error);
    // Don't throw - this is a background check
  }
}