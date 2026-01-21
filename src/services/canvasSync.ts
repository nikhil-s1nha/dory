/**
 * Canvas Sync Service
 * Manages real-time canvas synchronization with debouncing and caching
 */

import {saveCanvas, subscribeToCanvas} from './canvasService';
import {CanvasDrawing} from '@utils/types';

let syncTimeout: NodeJS.Timeout | null = null;
let lastSyncedData: string | null = null;

/**
 * Debounced function to sync canvas drawing
 * Batches rapid drawing updates into single Firestore write
 */
export async function syncCanvasDrawing(
  partnershipId: string,
  drawingData: string,
  userId: string,
  backgroundColor?: string,
  canvasWidth?: number,
  canvasHeight?: number,
): Promise<CanvasDrawing> {
  return new Promise((resolve, reject) => {
    // Clear existing timeout
    if (syncTimeout) {
      clearTimeout(syncTimeout);
    }

    // Update last synced data
    lastSyncedData = drawingData;

    // Set new timeout for debounced sync
    syncTimeout = setTimeout(async () => {
      try {
        // Generate thumbnail from drawing data
        const thumbnail = await generateThumbnail(drawingData, backgroundColor);
        
        // Save to Firestore
        const canvas = await saveCanvas(
          partnershipId,
          drawingData,
          userId,
          thumbnail,
          backgroundColor,
          canvasWidth,
          canvasHeight,
        );
        resolve(canvas);
      } catch (error) {
        reject(error);
      } finally {
        syncTimeout = null;
        lastSyncedData = null;
      }
    }, 500); // 500ms debounce delay
  });
}

/**
 * Subscribe to canvas updates with local caching
 */
export function subscribeToCanvasUpdates(
  partnershipId: string,
  callback: (drawing: CanvasDrawing | null) => void,
): () => void {
  let lastDrawingData: string | null = null;

  const unsubscribe = subscribeToCanvas(partnershipId, (drawing) => {
    // Only trigger callback if drawing data actually changed
    if (drawing) {
      if (drawing.drawingData !== lastDrawingData) {
        lastDrawingData = drawing.drawingData;
        callback(drawing);
      }
    } else {
      lastDrawingData = null;
      callback(null);
    }
  });

  return unsubscribe;
}

/**
 * Generate thumbnail from drawing data
 * Creates a 200x200px base64 encoded PNG
 */
export async function generateThumbnail(drawingData: string, backgroundColor?: string): Promise<string> {
  try {
    // Import Skia dynamically to avoid issues if not installed
    const {Skia} = require('@shopify/react-native-skia');
    
    // Parse drawing data (assuming it's JSON string of paths)
    const paths = JSON.parse(drawingData);
    
    // Create surface for thumbnail
    const surface = Skia.Surface.Make(200, 200);
    if (!surface) {
      throw new Error('Failed to create thumbnail surface');
    }

    const canvas = surface.getCanvas();
    
    // Determine background color
    let bgColor = '#000000'; // Default black
    if (backgroundColor === 'white') {
      bgColor = '#FFFFFF';
    } else if (backgroundColor === 'beige') {
      bgColor = '#FFF8F0';
    }
    
    canvas.clear(Skia.Color(bgColor));

    // Draw all paths
    paths.forEach((pathData: any) => {
      const path = Skia.Path.MakeFromSVGString(pathData.path);
      if (path) {
        const paint = Skia.Paint();
        paint.setColor(Skia.Color(pathData.color || '#FFFFFF'));
        paint.setStrokeWidth(pathData.strokeWidth || 5);
        paint.setStyle(Skia.PaintStyle.Stroke);
        paint.setStrokeCap(Skia.StrokeCap.Round);
        paint.setStrokeJoin(Skia.StrokeJoin.Round);
        canvas.drawPath(path, paint);
      }
    });

    // Convert to image and encode as base64
    const image = surface.makeImageSnapshot();
    const data = image.encodeToBase64();
    surface.dispose();

    return `data:image/png;base64,${data}`;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    // Return empty thumbnail on error
    return '';
  }
}

/**
 * Cancel pending sync operation
 */
export function cancelPendingSync(): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  lastSyncedData = null;
}
