/**
 * Widget service
 * Manages iOS widget data synchronization
 */

import {NativeModules, Platform} from 'react-native';
import {CanvasDrawing, Countdown, PhotoPrompt, Partnership} from '@utils/types';

const {WidgetDataBridge} = NativeModules;

/**
 * Update Canvas Widget with latest drawing
 */
export async function updateCanvasWidget(
  canvas: CanvasDrawing,
  partnershipId: string,
): Promise<void> {
  if (Platform.OS !== 'ios' || !WidgetDataBridge) {
    return;
  }

  try {
    // Convert canvas drawing to base64 image
    // This would require rendering the canvas to an image
    // For now, we'll pass the drawing data directly
    let imageBase64 = canvas.thumbnail || canvas.drawingData;
    
    // Strip data-URI prefix if present (e.g., "data:image/png;base64,")
    if (imageBase64 && imageBase64.startsWith('data:')) {
      const commaIndex = imageBase64.indexOf(',');
      if (commaIndex !== -1) {
        imageBase64 = imageBase64.substring(commaIndex + 1);
      }
    }
    
    await WidgetDataBridge.updateCanvasWidget(imageBase64, partnershipId);
  } catch (error) {
    console.error('Failed to update canvas widget:', error);
  }
}

/**
 * Update Countdown Widget with upcoming countdowns
 */
export async function updateCountdownWidget(
  countdowns: Countdown[],
): Promise<void> {
  if (Platform.OS !== 'ios' || !WidgetDataBridge) {
    return;
  }

  try {
    // Filter to only future countdowns, sort by target date, and take top 3
    const now = new Date();
    const sortedCountdowns = countdowns
      .filter(c => new Date(c.targetDate).getTime() > now.getTime())
      .sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())
      .slice(0, 3);

    const countdownsJSON = JSON.stringify(sortedCountdowns);
    await WidgetDataBridge.updateCountdownWidget(countdownsJSON);
  } catch (error) {
    console.error('Failed to update countdown widget:', error);
  }
}

/**
 * Update Daily Photo Widget with partner's latest photo
 */
export async function updateDailyPhotoWidget(
  photoPrompt: PhotoPrompt,
  partnerName: string,
  isUser1: boolean,
): Promise<void> {
  if (Platform.OS !== 'ios' || !WidgetDataBridge) {
    return;
  }

  try {
    // Get partner's photo (opposite of current user)
    const photoURL = isUser1 ? photoPrompt.user2PhotoUrl : photoPrompt.user1PhotoUrl;
    
    if (!photoURL) {
      return;
    }

    await WidgetDataBridge.updateDailyPhotoWidget(
      photoURL,
      photoPrompt.promptText,
      partnerName,
    );
  } catch (error) {
    console.error('Failed to update daily photo widget:', error);
  }
}

/**
 * Reload all widgets
 */
export async function reloadAllWidgets(): Promise<void> {
  if (Platform.OS !== 'ios' || !WidgetDataBridge) {
    return;
  }

  try {
    await WidgetDataBridge.reloadAllWidgets();
  } catch (error) {
    console.error('Failed to reload widgets:', error);
  }
}
