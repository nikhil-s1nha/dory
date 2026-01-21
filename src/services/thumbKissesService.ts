/**
 * Thumb Kisses Service
 * Manages synchronized touch events between partners with real-time sync
 */

import {
  thumbKissesCollection,
  generateId,
  getTimestamp,
  thumbKissConverter,
} from './firebase';
import {ThumbKiss} from '@utils/types';
import {FirestoreError, getErrorMessage} from '@utils/errors';
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

/**
 * Record a tap event
 */
export async function recordTap(
  partnershipId: string,
  userId: string,
): Promise<ThumbKiss> {
  try {
    const tapId = generateId();
    const clientNow = new Date().toISOString();

    const tapData: ThumbKiss = {
      id: tapId,
      partnershipId,
      userId,
      // Prefer server timestamps to avoid client clock skew.
      // Firestore resolves these FieldValues on write.
      timestamp: getTimestamp() as unknown as FirebaseFirestoreTypes.Timestamp,
      createdAt: getTimestamp() as unknown as FirebaseFirestoreTypes.Timestamp,
      // Optional client timestamp for local UI/debugging.
      clientTimestamp: clientNow,
    };

    await thumbKissesCollection.doc(tapId).set(tapData);

    // Fetch back the document so callers get resolved server Timestamp values.
    const saved = await thumbKissesCollection.doc(tapId).get();
    const savedData = saved.data();
    return (savedData
      ? ({...savedData, id: saved.id} as ThumbKiss)
      : tapData);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to partner's tap events
 * Returns unsubscribe callback function
 * 
 * Note: Requires Firestore composite index on:
 * - partnershipId (Ascending)
 * - userId (Ascending)  
 * - createdAt (Descending)
 */
export function subscribeToPartnerTaps(
  partnershipId: string,
  partnerUserId: string,
  callback: (tap: ThumbKiss | null) => void,
): () => void {
  const unsubscribe = thumbKissesCollection
    .where('partnershipId', '==', partnershipId)
    .where('userId', '==', partnerUserId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .onSnapshot(
      snapshot => {
        if (!snapshot.empty) {
          const tapDoc = snapshot.docs[0];
          const tap = tapDoc.data() as ThumbKiss;
          callback(tap);
        } else {
          callback(null);
        }
      },
      error => {
        console.error('Partner taps subscription error:', error);
        callback(null);
      },
    );

  return unsubscribe;
}

/**
 * Cleanup old tap events (older than 5 minutes)
 * Prevents collection bloat
 * 
 * Note: Requires Firestore composite index on:
 * - partnershipId (Ascending)
 * - createdAt (Ascending)
 */
export async function cleanupOldTaps(partnershipId: string): Promise<void> {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const oldTapsQuery = await thumbKissesCollection
      .where('partnershipId', '==', partnershipId)
      .where('createdAt', '<', fiveMinutesAgo)
      .get();

    if (oldTapsQuery.empty) {
      return;
    }

    const batch = firestore().batch();
    oldTapsQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  } catch (error: any) {
    // Non-critical error, log but don't throw
    console.error('Error cleaning up old taps:', error);
  }
}
