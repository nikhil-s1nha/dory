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
import {Platform} from 'react-native';
import {updateDailyPhotoWidget} from './widgetService';
import {sendPhotoSharedNotification} from './notificationService';

/**
 * Array of diverse photo prompts for daily rotation
 */
const PHOTO_PROMPTS = [
  "Something that made you smile today",
  "Your view right now",
  "Something beautiful you noticed",
  "A moment of gratitude",
  "Something that reminded you of your partner",
  "A small joy from today",
  "Something that made you laugh",
  "A peaceful moment",
  "Something you're grateful for",
  "Your favorite thing about today",
  "A moment that made you happy",
  "Something that inspired you",
  "A beautiful detail you noticed",
  "Something that made your day better",
  "A memory you want to cherish",
];

/**
 * Generate daily prompt text based on date
 * Rotates through prompts based on day of year
 */
function generateDailyPromptText(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const promptIndex = dayOfYear % PHOTO_PROMPTS.length;
  return PHOTO_PROMPTS[promptIndex];
}

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
    const generatedPromptText = promptText || generateDailyPromptText();
    return await createDailyPrompt(partnershipId, generatedPromptText);
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
    const updatedPrompt = updatedDoc.data() as PhotoPrompt;
    
    // Update widget with partner's photo (reuse existing partnership and isUser1)
    const {getUser} = await import('./authService');
    const partnerId = isUser1 ? partnership.userId2 : partnership.userId1;
    const partner = await getUser(partnerId);
    
    await updateDailyPhotoWidget(updatedPrompt, partner.name, isUser1);

    // Send notification to partner (non-blocking)
    try {
      const currentUser = await getUser(userId);
      const senderName = currentUser?.name || 'Your partner';
      await sendPhotoSharedNotification(partnerId, senderName, promptId, partnershipId);
    } catch (error) {
      // Don't fail photo upload if notification fails
      console.error('Error sending photo shared notification:', error);
    }
    
    return updatedPrompt;
  } catch (error: any) {
    const message = getErrorMessage(error);
    if (error instanceof FirestoreError) {
      throw error;
    }
    throw new StorageError(message, error.code || 'unknown', error);
  }
}

/**
 * Get photo prompt by ID
 */
export async function getPhotoPromptById(promptId: string): Promise<PhotoPrompt> {
  try {
    const doc = await photoPromptsCollection.doc(promptId).get();
    if (!doc.exists) {
      throw new FirestoreError('Photo prompt not found', 'not-found');
    }
    return doc.data() as PhotoPrompt;
  } catch (error: any) {
    const message = getErrorMessage(error);
    if (error instanceof FirestoreError) {
      throw error;
    }
    throw new FirestoreError(message, error.code || 'unknown', error);
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
 * Check if both partners have uploaded photos for a prompt
 */
export function checkBothPartnersUploaded(prompt: PhotoPrompt): boolean {
  return !!(prompt.user1PhotoUrl && prompt.user2PhotoUrl);
}

/**
 * Download photo and save to device storage
 * Downloads the image file and saves it to the device gallery/camera roll
 */
export async function downloadPhoto(photoUrl: string): Promise<string> {
  try {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // Import required libraries
      const RNFS = require('react-native-fs').default;
      const {CameraRoll} = require('@react-native-camera-roll/camera-roll');
      const {request, PERMISSIONS, RESULTS} = require('react-native-permissions');

      // Request permissions before saving
      if (Platform.OS === 'android') {
        let permission;
        if (Platform.Version >= 33) {
          // Android 13+ uses WRITE_MEDIA_IMAGES or no permission needed for MediaStore
          // CameraRoll handles MediaStore API which doesn't require WRITE_EXTERNAL_STORAGE on Android 10+
          // But we may need READ_MEDIA_IMAGES if we're reading
          permission = PERMISSIONS.ANDROID.READ_MEDIA_IMAGES;
        } else {
          permission = PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE;
        }
        const permissionResult = await request(permission);
        if (permissionResult !== RESULTS.GRANTED) {
          throw new Error('Storage permission denied');
        }
      } else {
        // iOS - request photo library permission
        const permissionResult = await request(PERMISSIONS.IOS.PHOTO_LIBRARY_ADD_ONLY || PERMISSIONS.IOS.PHOTO_LIBRARY);
        if (permissionResult !== RESULTS.GRANTED) {
          throw new Error('Photo library permission denied');
        }
      }

      // Generate local file path
      const filename = photoUrl.split('/').pop() || `photo_${Date.now()}.jpg`;
      const localPath = `${RNFS.TemporaryDirectoryPath}/${filename}`;

      // Download file from URL
      const downloadResult = await RNFS.downloadFile({
        fromUrl: photoUrl,
        toFile: localPath,
      }).promise;

      if (downloadResult.statusCode !== 200) {
        throw new Error(`Download failed with status ${downloadResult.statusCode}`);
      }

      // Save to gallery/camera roll
      const savedUri = await CameraRoll.save(localPath, {type: 'photo'});

      // Clean up temporary file
      try {
        await RNFS.unlink(localPath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary file:', cleanupError);
      }

      return savedUri;
    }
    
    // Fallback for other platforms
    return photoUrl;
  } catch (error: any) {
    // If libraries are not available, throw error to allow fallback to sharing
    if (error.message?.includes('Cannot find module') || error.code === 'MODULE_NOT_FOUND') {
      throw new Error('Download libraries not installed. Please install react-native-fs, @react-native-camera-roll/camera-roll, and react-native-permissions');
    }
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

/**
 * Subscribe to photo history changes
 */
export function subscribeToPhotoHistory(
  partnershipId: string,
  callback: (prompts: PhotoPrompt[]) => void,
): () => void {
  const unsubscribe = photoPromptsCollection
    .where('partnershipId', '==', partnershipId)
    .orderBy('promptDate', 'desc')
    .onSnapshot(
      snapshot => {
        const prompts = snapshot.docs.map(doc => doc.data() as PhotoPrompt);
        callback(prompts);
      },
      error => {
        console.error('Photo history subscription error:', error);
        callback([]);
      },
    );

  return unsubscribe;
}
