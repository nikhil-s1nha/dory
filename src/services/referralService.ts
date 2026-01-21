/**
 * Referral Service
 * Handles referral code generation, tracking, and reward management
 */

import {
  referralsCollection,
  usersCollection,
  generateId,
  getTimestamp,
  referralConverter,
} from './firebase';
import {Referral, ReferralStats, ReferralRewards} from '@utils/types';
import {sendReferralNotification} from './notificationService';

/**
 * Generate unique 8-character alphanumeric referral code
 */
export function generateReferralCode(userId: string): string {
  // Use first 4 chars of userId + random 4 chars for uniqueness
  const userIdPrefix = userId.substring(0, 4).toUpperCase();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let randomSuffix = '';
  for (let i = 0; i < 4; i++) {
    randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Return without dashes (will be formatted for display)
  return `${userIdPrefix}${randomSuffix}`;
}

/**
 * Create new referral entry in Firestore
 * Note: This creates a referral code ownership record. Usage records are created separately.
 */
export async function createReferral(userId: string): Promise<Referral> {
  try {
    // Check if user already has a referral code on their user document
    const userDoc = await usersCollection.doc(userId).get();
    const user = userDoc.data();
    
    if (user?.referralCode) {
      // User already has a referral code, return it
      // Find the original referral document if it exists
      const existingReferral = await referralsCollection
        .where('referrerId', '==', userId)
        .where('referralCode', '==', user.referralCode)
        .limit(1)
        .get();

      if (!existingReferral.empty) {
        const existing = existingReferral.docs[0].data() as Referral;
        return {
          ...existing,
          id: existingReferral.docs[0].id,
        };
      }
      
      // If referral document doesn't exist but code does, create it
      const now = new Date().toISOString();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      const referralId = generateId();
      const referralData: Referral = {
        id: referralId,
        referrerId: userId,
        referralCode: user.referralCode,
        status: 'pending',
        rewardGranted: false,
        createdAt: now,
        expiresAt: expiresAt.toISOString(),
      };
      
      await referralsCollection.doc(referralId).set(referralData);
      return referralData;
    }

    // Generate unique code (without dashes for storage)
    let code = generateReferralCode(userId).replace(/-/g, '');
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure code is unique (check both referrals collection and user documents)
    while (attempts < maxAttempts) {
      const existingCodeInReferrals = await referralsCollection
        .where('referralCode', '==', code)
        .limit(1)
        .get();
      
      const existingCodeInUsers = await usersCollection
        .where('referralCode', '==', code)
        .limit(1)
        .get();

      if (existingCodeInReferrals.empty && existingCodeInUsers.empty) {
        break; // Code is unique
      }

      code = generateReferralCode(userId).replace(/-/g, '');
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique referral code');
    }

    // Create expiration date (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const now = new Date().toISOString();
    const referralId = generateId();

    const referralData: Referral = {
      id: referralId,
      referrerId: userId,
      referralCode: code,
      status: 'pending',
      rewardGranted: false,
      createdAt: now,
      expiresAt: expiresAt.toISOString(),
    };

    await referralsCollection.doc(referralId).set(referralData);

    // Update user document with referral code (persistent ownership)
    await usersCollection.doc(userId).update({
      referralCode: code,
    });

    return referralData;
  } catch (error: any) {
    throw new Error(`Failed to create referral: ${error.message}`);
  }
}

/**
 * Normalize referral code (remove dashes, uppercase)
 */
function normalizeReferralCode(code: string): string {
  return code.replace(/-/g, '').toUpperCase();
}

/**
 * Get referral by code
 * Returns the referral code ownership record (not usage records)
 */
export async function getReferralByCode(
  code: string,
): Promise<Referral | null> {
  try {
    const normalizedCode = normalizeReferralCode(code);
    
    // First check referrals collection
    const query = await referralsCollection
      .where('referralCode', '==', normalizedCode)
      .limit(1)
      .get();

    if (!query.empty) {
      const doc = query.docs[0];
      return {
        ...doc.data(),
        id: doc.id,
      } as Referral;
    }
    
    // If not found in referrals, check user documents (for backward compatibility)
    const userQuery = await usersCollection
      .where('referralCode', '==', normalizedCode)
      .limit(1)
      .get();
    
    if (!userQuery.empty) {
      const userDoc = userQuery.docs[0];
      const user = userDoc.data();
      // Create a referral record from user data
      const now = new Date().toISOString();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      return {
        id: userDoc.id,
        referrerId: user.id,
        referralCode: normalizedCode,
        status: 'pending',
        rewardGranted: false,
        createdAt: now,
        expiresAt: expiresAt.toISOString(),
      } as Referral;
    }

    return null;
  } catch (error: any) {
    throw new Error(`Failed to get referral by code: ${error.message}`);
  }
}

/**
 * Get all referral usage records for a user
 * Returns all instances where the user's referral code was used
 */
export async function getUserReferrals(userId: string): Promise<Referral[]> {
  try {
    // Get all referral usage records where this user is the referrer
    // These are the individual usage instances, not the code ownership
    // Use client-side filtering to avoid index requirements
    const allQuery = await referralsCollection
      .where('referrerId', '==', userId)
      .get();
    
    const referrals = allQuery.docs
      .map(doc => ({
        ...doc.data(),
        id: doc.id,
      }))
      .filter(r => r.referredUserId && r.status === 'completed') as Referral[];
    
    // Sort by completedAt descending
    referrals.sort((a, b) => {
      const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bDate - aDate;
    });

    return referrals;
  } catch (error: any) {
    throw new Error(`Failed to get user referrals: ${error.message}`);
  }
}

/**
 * Calculate referral statistics
 * Counts usage records (completed referrals) to allow multiple referrals per code
 */
export async function getReferralStats(
  userId: string,
): Promise<ReferralStats> {
  try {
    // Get all referral usage records (completed referrals)
    const referrals = await getUserReferrals(userId);

    // All referrals returned are completed usage records
    const totalReferrals = referrals.length;
    const completedReferrals = totalReferrals; // All are completed
    const pendingReferrals = 0; // Usage records are only created when completed
    const totalRewardsEarned = referrals.filter(r => r.rewardGranted).length;

    // Get current reward status
    const userDoc = await usersCollection.doc(userId).get();
    const user = userDoc.data();
    const rewards = user?.referralRewards as ReferralRewards | undefined;
    let currentReward: string | undefined;

    if (rewards) {
      if (rewards.freeMonths > 0) {
        currentReward = `${rewards.freeMonths} free month${rewards.freeMonths > 1 ? 's' : ''}`;
      } else if (rewards.streakRestores > 0) {
        currentReward = `${rewards.streakRestores} streak restore${rewards.streakRestores > 1 ? 's' : ''}`;
      }
    }

    return {
      totalReferrals,
      completedReferrals,
      pendingReferrals,
      totalRewardsEarned,
      currentReward,
    };
  } catch (error: any) {
    throw new Error(`Failed to get referral stats: ${error.message}`);
  }
}

/**
 * Mark referral as completed when referred user pairs
 * Creates a new referral usage record for each completion
 * @param referralCodeOrId - The referral code (string) or referral document ID
 * @param referredUserId - The user ID who used the referral code
 */
export async function markReferralCompleted(
  referralCodeOrId: string,
  referredUserId: string,
): Promise<void> {
  try {
    let referral: Referral | null = null;
    
    // Check if it's a referral code (8 chars) or a document ID
    const normalizedCode = normalizeReferralCode(referralCodeOrId);
    if (normalizedCode.length === 8) {
      // It's a referral code
      referral = await getReferralByCode(normalizedCode);
    } else {
      // It's a document ID (for backward compatibility)
      const referralDoc = await referralsCollection.doc(referralCodeOrId).get();
      if (referralDoc.exists) {
        referral = {
          ...referralDoc.data(),
          id: referralDoc.id,
        } as Referral;
      }
    }

    if (!referral) {
      throw new Error('Referral not found');
    }

    // Prevent self-referral
    if (referral.referrerId === referredUserId) {
      throw new Error('Cannot use your own referral code');
    }

    // Check if referral code is expired
    if (referral.expiresAt) {
      const expiresAt = new Date(referral.expiresAt);
      if (expiresAt < new Date()) {
        throw new Error('Referral code has expired');
      }
    }

    // Check if this specific user has already used this referral code
    const existingUsage = await referralsCollection
      .where('referrerId', '==', referral.referrerId)
      .where('referralCode', '==', referral.referralCode)
      .where('referredUserId', '==', referredUserId)
      .where('status', '==', 'completed')
      .limit(1)
      .get();

    if (!existingUsage.empty) {
      // This user has already used this referral code
      return;
    }

    const now = new Date().toISOString();

    // Create a new referral usage record (not update the original)
    const usageRecordId = generateId();
    const usageRecord: Referral = {
      id: usageRecordId,
      referrerId: referral.referrerId,
      referralCode: referral.referralCode,
      referredUserId,
      status: 'completed',
      rewardGranted: false,
      createdAt: now,
      completedAt: now,
      expiresAt: referral.expiresAt,
    };

    await referralsCollection.doc(usageRecordId).set(usageRecord);

    // Grant reward to referrer
    await grantReferralReward(usageRecordId);
  } catch (error: any) {
    throw new Error(`Failed to mark referral completed: ${error.message}`);
  }
}

/**
 * Grant reward to referrer
 */
export async function grantReferralReward(referralId: string): Promise<void> {
  try {
    const referralRef = referralsCollection.doc(referralId);
    const referralDoc = await referralRef.get();

    if (!referralDoc.exists) {
      throw new Error('Referral not found');
    }

    const referral = referralDoc.data() as Referral;

    if (referral.rewardGranted) {
      return; // Reward already granted
    }

    if (referral.status !== 'completed') {
      throw new Error('Referral must be completed before granting reward');
    }

    // Get referrer user
    const referrerDoc = await usersCollection.doc(referral.referrerId).get();
    if (!referrerDoc.exists) {
      throw new Error('Referrer not found');
    }

    const referrer = referrerDoc.data();
    const currentRewards = (referrer?.referralRewards as ReferralRewards) || {
      freeMonths: 0,
      streakRestores: 0,
    };

    // Grant reward (1 free month per referral)
    const updatedRewards: ReferralRewards = {
      freeMonths: currentRewards.freeMonths + 1,
      streakRestores: currentRewards.streakRestores,
    };

    // Update user with reward
    await usersCollection.doc(referral.referrerId).update({
      referralRewards: updatedRewards,
    });

    // Mark reward as granted
    await referralRef.update({
      rewardGranted: true,
      rewardType: 'free_month',
    });

    // Send notification to referrer
    await sendReferralNotification(
      referral.referrerId,
      'Your friend joined Candle! You earned 1 free month 🎉',
    );
  } catch (error: any) {
    throw new Error(`Failed to grant referral reward: ${error.message}`);
  }
}

/**
 * Apply referral reward (extend subscription, etc.)
 */
export async function applyReferralReward(
  userId: string,
  rewardType: 'free_month' | 'premium_feature',
): Promise<void> {
  try {
    const userDoc = await usersCollection.doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const user = userDoc.data();
    const rewards = (user?.referralRewards as ReferralRewards) || {
      freeMonths: 0,
      streakRestores: 0,
    };

    if (rewardType === 'free_month') {
      if (rewards.freeMonths <= 0) {
        throw new Error('No free months available');
      }

      // Apply free month (extend subscription by 30 days)
      // This would integrate with your subscription service
      // For now, we'll just decrement the count
      const updatedRewards: ReferralRewards = {
        freeMonths: rewards.freeMonths - 1,
        streakRestores: rewards.streakRestores,
      };

      await usersCollection.doc(userId).update({
        referralRewards: updatedRewards,
      });
    }
  } catch (error: any) {
    throw new Error(`Failed to apply referral reward: ${error.message}`);
  }
}

/**
 * Real-time subscription to user referral usage records
 */
export function subscribeToUserReferrals(
  userId: string,
  callback: (referrals: Referral[]) => void,
): () => void {
  const unsubscribe = referralsCollection
    .where('referrerId', '==', userId)
    .onSnapshot(
      snapshot => {
        // Filter to only completed usage records and sort by completedAt
        const referrals = snapshot.docs
          .map(doc => ({
            ...doc.data(),
            id: doc.id,
          }))
          .filter(r => r.referredUserId && r.status === 'completed') as Referral[];
        
        // Sort by completedAt descending
        referrals.sort((a, b) => {
          const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return bDate - aDate;
        });
        
        callback(referrals);
      },
      error => {
        console.error('Error subscribing to referrals:', error);
      },
    );

  return unsubscribe;
}

/**
 * Check if referral code is valid
 * Only validates code existence and expiry, not completion status
 * (Codes can be used multiple times by different users)
 */
export async function validateReferralCode(code: string): Promise<boolean> {
  try {
    const normalizedCode = normalizeReferralCode(code);
    
    // Check format (should be 8 characters after normalization)
    if (normalizedCode.length !== 8) {
      return false;
    }

    const referral = await getReferralByCode(normalizedCode);
    if (!referral) {
      return false;
    }

    // Check if expired
    if (referral.expiresAt) {
      const expiresAt = new Date(referral.expiresAt);
      if (expiresAt < new Date()) {
        return false;
      }
    }

    // Code is valid if it exists and is not expired
    // No need to check completion status - codes can be reused
    return true;
  } catch (error) {
    return false;
  }
}
