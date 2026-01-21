/**
 * Messaging service
 * Handles real-time messaging between partners
 */

import {
  messagesCollection,
  partnershipsCollection,
  firebaseStorage,
  generateId,
  uploadFile,
} from './firebase';
import {Message, Reaction} from '@utils/types';
import {FirestoreError, StorageError, getErrorMessage} from '@utils/errors';
import {updatePartnership} from './partnershipService';
import {sendMessageNotification} from './notificationService';

/**
 * Send a message
 */
export async function sendMessage(
  message: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Message> {
  try {
    const messageId = generateId();
    const now = new Date().toISOString();

    const messageData: Message = {
      ...message,
      id: messageId,
      createdAt: now,
      updatedAt: now,
    };

    await messagesCollection.doc(messageId).set(messageData);

    // Send notification to partner (non-blocking)
    try {
      await sendMessageNotification(message.partnershipId, message.senderId, message.type, messageId);
    } catch (error) {
      // Don't fail message send if notification fails
      console.error('Error sending message notification:', error);
    }

    return messageData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get messages for a partnership
 */
export async function getMessages(
  partnershipId: string,
  limit: number = 50,
  lastMessageId?: string,
): Promise<Message[]> {
  try {
    let query = messagesCollection
      .where('partnershipId', '==', partnershipId)
      .orderBy('createdAt', 'asc')
      .limit(limit);

    // If lastMessageId is provided, start after that message for pagination
    if (lastMessageId) {
      const lastMessageDoc = await messagesCollection.doc(lastMessageId).get();
      if (lastMessageDoc.exists) {
        query = query.startAfter(lastMessageDoc);
      }
    }

    const snapshot = await query.get();

    return snapshot.docs.map(doc => doc.data() as Message);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Upload media for a message
 */
export async function uploadMessageMedia(
  uri: string,
  type: 'photo' | 'voice',
  partnershipId: string,
  messageId: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  try {
    const extension = type === 'photo' ? 'jpg' : 'm4a';
    const path = `partnerships/${partnershipId}/messages/${messageId}/${Date.now()}.${extension}`;
    
    // Upload file (onProgress callback support depends on uploadFile implementation)
    // For now, return URL. Metadata extraction can be added later if needed
    return await uploadFile(uri, path);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new StorageError(message, error.code || 'unknown', error);
  }
}

/**
 * Add reaction to a message
 */
export async function addMessageReaction(
  messageId: string,
  reaction: Reaction,
): Promise<Message> {
  try {
    const messageDoc = await messagesCollection.doc(messageId).get();
    const message = messageDoc.data() as Message;

    if (!message) {
      throw new FirestoreError('Message not found', 'not-found');
    }

    const reactions = message.reactions || [];
    const updatedReactions = [...reactions, reaction];

    await messagesCollection.doc(messageId).update({
      reactions: updatedReactions,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await messagesCollection.doc(messageId).get();
    return updatedDoc.data() as Message;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Delete a message (soft delete)
 */
export async function deleteMessage(messageId: string): Promise<void> {
  try {
    await messagesCollection.doc(messageId).update({
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to messages
 */
export function subscribeToMessages(
  partnershipId: string,
  callback: (messages: Message[]) => void,
  limit: number = 50,
): () => void {
  const unsubscribe = messagesCollection
    .where('partnershipId', '==', partnershipId)
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .onSnapshot(
      snapshot => {
        const messages = snapshot.docs.map(doc => doc.data() as Message);
        callback(messages);
      },
      error => {
        console.error('Message subscription error:', error);
        callback([]);
      },
    );

  return unsubscribe;
}

/**
 * Remove reaction from a message
 */
export async function removeMessageReaction(
  messageId: string,
  userId: string,
): Promise<Message> {
  try {
    const messageDoc = await messagesCollection.doc(messageId).get();
    const message = messageDoc.data() as Message;

    if (!message) {
      throw new FirestoreError('Message not found', 'not-found');
    }

    const reactions = message.reactions || [];
    const updatedReactions = reactions.filter(r => r.userId !== userId);

    await messagesCollection.doc(messageId).update({
      reactions: updatedReactions,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await messagesCollection.doc(messageId).get();
    return updatedDoc.data() as Message;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Mark message as read (future enhancement for read receipts)
 */
export async function markMessageAsRead(
  messageId: string,
  userId: string,
): Promise<void> {
  try {
    const messageDoc = await messagesCollection.doc(messageId).get();
    const message = messageDoc.data() as Message;

    if (!message) {
      throw new FirestoreError('Message not found', 'not-found');
    }

    // Add read receipts to message (future enhancement)
    const readReceipts = message.readReceipts || {};
    readReceipts[userId] = new Date().toISOString();

    await messagesCollection.doc(messageId).update({
      readReceipts,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get messages related to a specific question
 */
export async function getMessagesByQuestionId(
  questionId: string,
  partnershipId: string,
  limit: number = 50,
): Promise<Message[]> {
  try {
    const snapshot = await messagesCollection
      .where('partnershipId', '==', partnershipId)
      .where('questionId', '==', questionId)
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as Message);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Set typing indicator
 */
export async function setTyping(
  partnershipId: string,
  userId: string,
  isTyping: boolean,
): Promise<void> {
  try {
    const partnershipDoc = await partnershipsCollection.doc(partnershipId).get();
    const partnership = partnershipDoc.data();

    if (!partnership) {
      throw new FirestoreError('Partnership not found', 'not-found');
    }

    const typingUsers = partnership.typingUsers || [];
    let updatedTypingUsers: string[];

    if (isTyping) {
      updatedTypingUsers = typingUsers.includes(userId)
        ? typingUsers
        : [...typingUsers, userId];
    } else {
      updatedTypingUsers = typingUsers.filter(id => id !== userId);
    }

    await updatePartnership(partnershipId, {
      typingUsers: updatedTypingUsers,
    });
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}
