/**
 * Countdown service
 * Manages countdown timers for special dates
 */

import {
  countdownsCollection,
  generateId,
} from './firebase';
import {Countdown} from '@utils/types';
import {FirestoreError, getErrorMessage} from '@utils/errors';
import {updateCountdownWidget} from './widgetService';

/**
 * Create a countdown
 */
export async function createCountdown(
  countdown: Omit<Countdown, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Countdown> {
  try {
    const countdownId = generateId();
    const now = new Date().toISOString();

    const countdownData: Countdown = {
      ...countdown,
      id: countdownId,
      createdAt: now,
      updatedAt: now,
    };

    await countdownsCollection.doc(countdownId).set(countdownData);
    
    // Update widget
    const allCountdowns = await getCountdowns(countdown.partnershipId);
    await updateCountdownWidget(allCountdowns);

    return countdownData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get all countdowns for a partnership
 */
export async function getCountdowns(
  partnershipId: string,
): Promise<Countdown[]> {
  try {
    const snapshot = await countdownsCollection
      .where('partnershipId', '==', partnershipId)
      .orderBy('targetDate', 'asc')
      .get();

    return snapshot.docs.map(doc => doc.data() as Countdown);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Update a countdown
 */
export async function updateCountdown(
  countdownId: string,
  updates: Partial<Countdown>,
): Promise<Countdown> {
  try {
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await countdownsCollection.doc(countdownId).update(updateData);

    const updatedDoc = await countdownsCollection.doc(countdownId).get();
    const updatedCountdown = updatedDoc.data() as Countdown;
    
    // Update widget
    const allCountdowns = await getCountdowns(updatedCountdown.partnershipId);
    await updateCountdownWidget(allCountdowns);
    
    return updatedCountdown;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Delete a countdown
 */
export async function deleteCountdown(countdownId: string): Promise<void> {
  try {
    // Get countdown to get partnershipId before deleting
    const countdownDoc = await countdownsCollection.doc(countdownId).get();
    const countdown = countdownDoc.data() as Countdown;
    
    await countdownsCollection.doc(countdownId).delete();
    
    // Update widget
    if (countdown) {
      const allCountdowns = await getCountdowns(countdown.partnershipId);
      await updateCountdownWidget(allCountdowns);
    }
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to countdown changes
 */
export function subscribeToCountdowns(
  partnershipId: string,
  callback: (countdowns: Countdown[]) => void,
): () => void {
  const unsubscribe = countdownsCollection
    .where('partnershipId', '==', partnershipId)
    .orderBy('targetDate', 'asc')
    .onSnapshot(
      snapshot => {
        const countdowns = snapshot.docs.map(doc => doc.data() as Countdown);
        callback(countdowns);
      },
      error => {
        console.error('Countdown subscription error:', error);
        callback([]);
      },
    );

  return unsubscribe;
}
