/**
 * Canvas service
 * Manages collaborative canvas drawings with real-time sync
 */

import {
  canvasDrawingsCollection,
  generateId,
  uploadFile,
} from './firebase';
import {CanvasDrawing} from '@utils/types';
import {FirestoreError, StorageError, getErrorMessage} from '@utils/errors';

/**
 * Save canvas drawing
 */
export async function saveCanvas(
  partnershipId: string,
  drawingData: string,
  userId: string,
  thumbnail?: string,
): Promise<CanvasDrawing> {
  try {
    // Set previous canvas as not current
    const previousCanvasQuery = await canvasDrawingsCollection
      .where('partnershipId', '==', partnershipId)
      .where('isCurrent', '==', true)
      .get();

    const updatePromises = previousCanvasQuery.docs.map(doc =>
      doc.ref.update({isCurrent: false}),
    );
    await Promise.all(updatePromises);

    // Create new canvas
    const canvasId = generateId();
    const now = new Date().toISOString();

    const canvasData: CanvasDrawing = {
      id: canvasId,
      partnershipId,
      drawingData,
      thumbnail,
      createdBy: userId,
      createdAt: now,
      isCurrent: true,
    };

    await canvasDrawingsCollection.doc(canvasId).set(canvasData);

    return canvasData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get current canvas
 */
export async function getCurrentCanvas(
  partnershipId: string,
): Promise<CanvasDrawing | null> {
  try {
    const snapshot = await canvasDrawingsCollection
      .where('partnershipId', '==', partnershipId)
      .where('isCurrent', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as CanvasDrawing;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get canvas history
 */
export async function getCanvasHistory(
  partnershipId: string,
): Promise<CanvasDrawing[]> {
  try {
    const snapshot = await canvasDrawingsCollection
      .where('partnershipId', '==', partnershipId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc => doc.data() as CanvasDrawing);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Delete canvas
 */
export async function deleteCanvas(canvasId: string): Promise<void> {
  try {
    await canvasDrawingsCollection.doc(canvasId).delete();
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Download canvas (returns drawing data)
 */
export async function downloadCanvas(canvasId: string): Promise<string> {
  try {
    const canvasDoc = await canvasDrawingsCollection.doc(canvasId).get();
    const canvas = canvasDoc.data() as CanvasDrawing;

    if (!canvas) {
      throw new FirestoreError('Canvas not found', 'not-found');
    }

    return canvas.drawingData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to current canvas changes
 */
export function subscribeToCanvas(
  partnershipId: string,
  callback: (canvas: CanvasDrawing | null) => void,
): () => void {
  const unsubscribe = canvasDrawingsCollection
    .where('partnershipId', '==', partnershipId)
    .where('isCurrent', '==', true)
    .onSnapshot(
      snapshot => {
        if (snapshot.empty) {
          callback(null);
        } else {
          callback(snapshot.docs[0].data() as CanvasDrawing);
        }
      },
      error => {
        console.error('Canvas subscription error:', error);
        callback(null);
      },
    );

  return unsubscribe;
}
