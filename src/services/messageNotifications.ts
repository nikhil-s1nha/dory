/**
 * Message Notifications Service
 * Handles push notifications for new messages
 */

import {partnershipsCollection, usersCollection} from './firebase';
import {getNotificationSettings} from './notificationSettings';
import {FirestoreError, getErrorMessage} from '@utils/errors';

/**
 * Send push notification for a new message
 */
export async function sendMessageNotification(
  partnershipId: string,
  senderId: string,
  messageType: string,
): Promise<void> {
  try {
    // Get partnership to find partner user ID
    const partnershipDoc = await partnershipsCollection.doc(partnershipId).get();
    const partnership = partnershipDoc.data();

    if (!partnership) {
      throw new FirestoreError('Partnership not found', 'not-found');
    }

    // Determine partner user ID
    const partnerId =
      partnership.userId1 === senderId
        ? partnership.userId2
        : partnership.userId1;

    if (!partnerId) {
      console.warn('No partner ID found for message notification');
      return;
    }

    // Check if partner has notifications enabled
    const partnerSettings = await getNotificationSettings(partnerId);
    if (!partnerSettings.partnerActivityNotifications) {
      // Partner has disabled notifications
      return;
    }

    // Get partner user data (for name in notification)
    const partnerDoc = await usersCollection.doc(partnerId).get();
    const partner = partnerDoc.data();

    // Get sender user data
    const senderDoc = await usersCollection.doc(senderId).get();
    const sender = senderDoc.data();

    // Build notification message based on type
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

    // Send push notification
    // Note: Actual push notification implementation would go here
    // This is a placeholder that would integrate with Firebase Cloud Messaging
    // or another push notification service
    
    // Example structure:
    // await sendPushNotification({
    //   userId: partnerId,
    //   title: 'New Message',
    //   body: notificationBody,
    //   data: {
    //     type: 'message',
    //     partnershipId,
    //     messageType,
    //   },
    // });

    console.log('Message notification (placeholder):', {
      partnerId,
      title: 'New Message',
      body: notificationBody,
      data: {
        type: 'message',
        partnershipId,
        messageType,
      },
    });
  } catch (error: any) {
    // Don't fail message send if notification fails
    console.error('Error sending message notification:', error);
  }
}
