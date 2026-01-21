/**
 * Partnership service
 * Manages partnership connections and real-time sync
 */

import {
  partnershipsCollection,
  usersCollection,
  generateId,
  getTimestamp,
  partnershipConverter,
} from './firebase';
import {usePartnershipStore} from '@store/partnershipSlice';
import {Partnership} from '@utils/types';
import {FirestoreError, getErrorMessage} from '@utils/errors';
import {markReferralCompleted} from './referralService';

/**
 * Generate a unique 6-digit invite code
 */
function generateInviteCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create a new partnership
 */
export async function createPartnership(userId: string): Promise<Partnership> {
  try {
    const partnershipId = generateId();
    const now = new Date().toISOString();
    const inviteCode = generateInviteCode();

    const partnershipData: Partnership = {
      id: partnershipId,
      userId1: userId,
      userId2: '',
      status: 'pending',
      streakCount: 0,
      lastActivityDate: '', // Leave empty until first activity is recorded
      inviteCode,
      skippedQuestionIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await partnershipsCollection.doc(partnershipId).set(partnershipData);

    // Update Zustand store
    usePartnershipStore.getState().setPartnership(partnershipData);

    return partnershipData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Accept partnership invitation
 */
export async function acceptInvite(
  inviteCode: string,
  userId: string,
): Promise<Partnership> {
  try {
    // Find partnership by invite code
    const partnershipQuery = await partnershipsCollection
      .where('inviteCode', '==', inviteCode)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (partnershipQuery.empty) {
      throw new FirestoreError(
        'Invalid invite code',
        'not-found',
      );
    }

    const partnershipDoc = partnershipQuery.docs[0];
    const partnershipId = partnershipDoc.id;

    // Update partnership
    await partnershipsCollection.doc(partnershipId).update({
      userId2: userId,
      status: 'active',
      updatedAt: new Date().toISOString(),
    });

    // Fetch updated partnership
    const updatedDoc = await partnershipsCollection.doc(partnershipId).get();
    const partnership = updatedDoc.data() as Partnership;

    // Check if user has a referral code and mark referral as completed
    let referralId: string | null = null;
    try {
      const userDoc = await usersCollection.doc(userId).get();
      const user = userDoc.data();
      referralId = (user as any)?.referralId;

      if (referralId) {
        // Mark referral as completed (referralId can be either a code or document ID)
        await markReferralCompleted(referralId, userId);
      }
    } catch (error) {
      // Don't fail pairing if referral completion fails
      console.error('Error completing referral:', error);
    } finally {
      // Always clear referralId from user document, even if referral completion failed
      if (referralId) {
        try {
          await usersCollection.doc(userId).update({
            referralId: null,
          });
        } catch (error) {
          console.error('Error clearing referralId:', error);
        }
      }
    }

    // Update Zustand store
    usePartnershipStore.getState().setPartnership(partnership);

    return partnership;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get partnership by ID
 */
export async function getPartnership(
  partnershipId: string,
): Promise<Partnership | null> {
  try {
    const doc = await partnershipsCollection.doc(partnershipId).get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() as Partnership;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get user's partnership
 */
export async function getUserPartnership(
  userId: string,
): Promise<Partnership | null> {
  try {
    const partnershipQuery = await partnershipsCollection
      .where('userId1', '==', userId)
      .get();

    if (!partnershipQuery.empty) {
      return partnershipQuery.docs[0].data() as Partnership;
    }

    const partnershipQuery2 = await partnershipsCollection
      .where('userId2', '==', userId)
      .get();

    if (!partnershipQuery2.empty) {
      return partnershipQuery2.docs[0].data() as Partnership;
    }

    return null;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Update partnership
 */
export async function updatePartnership(
  partnershipId: string,
  updates: Partial<Partnership>,
): Promise<Partnership> {
  try {
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await partnershipsCollection.doc(partnershipId).update(updateData);

    const updatedDoc = await partnershipsCollection.doc(partnershipId).get();
    const partnership = updatedDoc.data() as Partnership;

    // Update Zustand store
    usePartnershipStore.getState().setPartnership(partnership);

    return partnership;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Increment streak count
 */
export async function incrementStreak(
  partnershipId: string,
): Promise<Partnership> {
  try {
    const partnership = await getPartnership(partnershipId);
    if (!partnership) {
      throw new FirestoreError('Partnership not found', 'not-found');
    }

    return await updatePartnership(partnershipId, {
      streakCount: partnership.streakCount + 1,
      lastActivityDate: new Date().toISOString(),
    });
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Reset streak count
 */
export async function resetStreak(
  partnershipId: string,
): Promise<Partnership> {
  try {
    return await updatePartnership(partnershipId, {
      streakCount: 0,
      lastActivityDate: new Date().toISOString(),
    });
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Record canvas activity
 */
export async function recordCanvasActivity(
  partnershipId: string,
): Promise<void> {
  try {
    await updatePartnership(partnershipId, {
      lastCanvasActivityDate: new Date().toISOString(),
    });
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to partnership changes
 */
export function subscribeToPartnership(
  partnershipId: string,
  callback: (partnership: Partnership | null) => void,
): () => void {
  const unsubscribe = partnershipsCollection
    .doc(partnershipId)
    .onSnapshot(
      snapshot => {
        if (snapshot.exists) {
          const partnership = snapshot.data() as Partnership;
          usePartnershipStore.getState().setPartnership(partnership);
          callback(partnership);
        } else {
          callback(null);
        }
      },
      error => {
        console.error('Partnership subscription error:', error);
        callback(null);
      },
    );

  return unsubscribe;
}
