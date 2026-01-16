/**
 * Photo Prompt service
 * Manages daily photo prompts and photo uploads
 */

import {
  photoPromptsCollection,
  generateId,
  uploadFile,
} from './firebase';
import {PhotoPrompt} from '@utils/types';
import {FirestoreError, StorageError, getErrorMessage} from '@utils/errors';

/**
 * Create daily photo prompt
 */
export async function createDailyPrompt(
  partnershipId: string,
  promptText: string,
): Promise<PhotoPrompt> {
  try {
    const promptId = generateId();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const now = new Date().toISOString();

    const promptData: PhotoPrompt = {
      id: promptId,
      partnershipId,
      promptText,
      promptDate: today,
      createdAt: now,
    };

    await photoPromptsCollection.doc(promptId).set(promptData);

    return promptData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get today's photo prompt or create one if it doesn't exist
 */
export async function getDailyPrompt(
  partnershipId: string,
  promptText?: string,
): Promise<PhotoPrompt> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Try to find today's prompt
    const snapshot = await photoPromptsCollection
      .where('partnershipId', '==', partnershipId)
      .where('promptDate', '==', today)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return snapshot.docs[0].data() as PhotoPrompt;
    }

    // Create new prompt if it doesn't exist
    const defaultPrompt =
      promptText || 'Capture a moment that made you smile today';
    return await createDailyPrompt(partnershipId, defaultPrompt);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Upload photo for a prompt
 */
export async function uploadPhoto(
  promptId: string,
  userId: string,
  photoUri: string,
  partnershipId: string,
): Promise<PhotoPrompt> {
  try {
    // Upload photo to Storage
    const path = `partnerships/${partnershipId}/photos/${promptId}/${userId}/${Date.now()}.jpg`;
    const photoUrl = await uploadFile(photoUri, path);

    // Get prompt to determine which user field to update
    const promptDoc = await photoPromptsCollection.doc(promptId).get();
    const prompt = promptDoc.data() as PhotoPrompt;

    if (!prompt) {
      throw new FirestoreError('Prompt not found', 'not-found');
    }

    // Get partnership to determine user1 vs user2
    const {getPartnership} = await import('./partnershipService');
    const partnership = await getPartnership(prompt.partnershipId);
    
    if (!partnership) {
      throw new FirestoreError('Partnership not found', 'not-found');
    }

    const isUser1 = partnership.userId1 === userId;
    const now = new Date().toISOString();

    const updateData: any = {};
    if (isUser1) {
      updateData.user1PhotoUrl = photoUrl;
      updateData.user1UploadedAt = now;
    } else {
      updateData.user2PhotoUrl = photoUrl;
      updateData.user2UploadedAt = now;
    }

    await photoPromptsCollection.doc(promptId).update(updateData);

    const updatedDoc = await photoPromptsCollection.doc(promptId).get();
    return updatedDoc.data() as PhotoPrompt;
  } catch (error: any) {
    const message = getErrorMessage(error);
    if (error instanceof FirestoreError) {
      throw error;
    }
    throw new StorageError(message, error.code || 'unknown', error);
  }
}

/**
 * Get photo history
 */
export async function getPhotoHistory(
  partnershipId: string,
): Promise<PhotoPrompt[]> {
  try {
    const snapshot = await photoPromptsCollection
      .where('partnershipId', '==', partnershipId)
      .orderBy('promptDate', 'desc')
      .get();

    return snapshot.docs.map(doc => doc.data() as PhotoPrompt);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Download photo (returns photo URL)
 */
export async function downloadPhoto(photoUrl: string): Promise<string> {
  try {
    // For now, just return the URL
    // In a real implementation, you might want to download and save to device
    return photoUrl;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new StorageError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to photo prompt changes
 */
export function subscribeToPhotoPrompt(
  promptId: string,
  callback: (prompt: PhotoPrompt | null) => void,
): () => void {
  const unsubscribe = photoPromptsCollection
    .doc(promptId)
    .onSnapshot(
      snapshot => {
        if (snapshot.exists) {
          callback(snapshot.data() as PhotoPrompt);
        } else {
          callback(null);
        }
      },
      error => {
        console.error('Photo prompt subscription error:', error);
        callback(null);
      },
    );

  return unsubscribe;
}
