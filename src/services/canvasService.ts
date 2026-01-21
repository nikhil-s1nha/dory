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
import {updateCanvasWidget} from './widgetService';

/**
 * Save canvas drawing
 */
export async function saveCanvas(
  partnershipId: string,
  drawingData: string,
  userId: string,
  thumbnail?: string,
  backgroundColor?: string,
  canvasWidth?: number,
  canvasHeight?: number,
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
      backgroundColor,
      metadata: {
        backgroundColor,
        canvasWidth,
        canvasHeight,
      },
    };

    await canvasDrawingsCollection.doc(canvasId).set(canvasData);
    
    // Update widget
    await updateCanvasWidget(canvasData, partnershipId);

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
 * Download canvas to device (saves to Photos app)
 */
export async function downloadCanvasToDevice(
  canvasId: string,
  drawingData: string,
): Promise<void> {
  try {
    // Import CameraRoll dynamically
    const {CameraRoll} = require('@react-native-community/cameraroll');
    const {Skia} = require('@shopify/react-native-skia');
    const RNFS = require('react-native-fs');

    // Get canvas metadata to retrieve background color
    const canvasDoc = await canvasDrawingsCollection.doc(canvasId).get();
    const canvas = canvasDoc.data() as CanvasDrawing;
    const backgroundColor = canvas?.backgroundColor || canvas?.metadata?.backgroundColor;

    // Parse drawing data
    const paths = JSON.parse(drawingData);

    // Create surface for image (use larger size for better quality)
    const surface = Skia.Surface.Make(800, 800);
    if (!surface) {
      throw new Error('Failed to create image surface');
    }

    const canvasSurface = surface.getCanvas();
    
    // Determine background color
    let bgColor = '#000000'; // Default black
    if (backgroundColor === 'white') {
      bgColor = '#FFFFFF';
    } else if (backgroundColor === 'beige') {
      bgColor = '#FFF8F0';
    }
    
    canvasSurface.clear(Skia.Color(bgColor));

    // Draw all paths
    paths.forEach((pathData: any) => {
      try {
        const path = Skia.Path.MakeFromSVGString(pathData.path);
        if (path) {
          const paint = Skia.Paint();
          paint.setColor(Skia.Color(pathData.color || '#FFFFFF'));
          paint.setStrokeWidth(pathData.strokeWidth || 5);
          paint.setStyle(Skia.PaintStyle.Stroke);
          paint.setStrokeCap(Skia.StrokeCap.Round);
          paint.setStrokeJoin(Skia.StrokeJoin.Round);
          canvasSurface.drawPath(path, paint);
        }
      } catch (pathError) {
        console.warn('Error drawing path:', pathError);
        // Continue with other paths
      }
    });

    // Convert to image
    const image = surface.makeImageSnapshot();
    const pngData = image.encodeToBase64();
    surface.dispose();

    // Save to temporary file
    const tempPath = `${RNFS.CachesDirectoryPath}/canvas_${canvasId}.png`;
    await RNFS.writeFile(tempPath, pngData, 'base64');

    // Save to Photos
    await CameraRoll.save(tempPath, {type: 'photo'});

    // Clean up temp file
    try {
      await RNFS.unlink(tempPath);
    } catch (unlinkError) {
      // Non-critical, just log
      console.warn('Error cleaning up temp file:', unlinkError);
    }
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new StorageError(`Failed to save canvas to device: ${message}`, error);
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
