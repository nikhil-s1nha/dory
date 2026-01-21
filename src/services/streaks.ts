/**
 * Streak Service
 * Manages streak validation, increment, milestones, restoration, and monitoring
 */

import {differenceInHours, differenceInMinutes, isSameDay, parseISO} from 'date-fns';
import {getPartnership, incrementStreak, resetStreak, updatePartnership, subscribeToPartnership} from './partnershipService';
import {getAnswers} from './questionService';
import {partnershipsCollection, usersCollection} from './firebase';
import {Partnership} from '@utils/types';
import {FirestoreError, getErrorMessage} from '@utils/errors';
import {sendStreakReminderNotification} from './notificationService';

/**
 * Streak status result
 */
export interface StreakStatus {
  isActive: boolean;
  hoursRemaining: number;
  shouldReset: boolean;
}

/**
 * Milestone information
 */
export interface MilestoneInfo {
  isMilestone: boolean;
  type: string;
  message: string;
}

/**
 * Check streak status and validate if it should continue
 */
export async function checkStreakStatus(
  partnershipId: string,
): Promise<StreakStatus> {
  try {
    const partnership = await getPartnership(partnershipId);
    if (!partnership || !partnership.lastActivityDate) {
      return {
        isActive: false,
        hoursRemaining: 0,
        shouldReset: false,
      };
    }

    // Treat streakCount 0 as inactive regardless of lastActivityDate
    if (partnership.streakCount === 0) {
      return {
        isActive: false,
        hoursRemaining: 0,
        shouldReset: false,
      };
    }

    const lastActivityDate = parseISO(partnership.lastActivityDate);
    const now = new Date();
    const hoursSinceActivity = differenceInHours(now, lastActivityDate);

    // If more than 24 hours passed without activity, streak should reset
    if (hoursSinceActivity >= 24) {
      // Auto-reset streak if needed
      const shouldReset = partnership.streakCount > 0;
      if (shouldReset && partnership.streakRestoreUsed !== true) {
        // Store previous streak before resetting (for restore feature)
        await updatePartnership(partnershipId, {
          previousStreakCount: partnership.streakCount,
          streakRestoreAvailable: true,
        });
      }
      if (shouldReset) {
        await resetStreak(partnershipId);
      }

      return {
        isActive: false,
        hoursRemaining: 0,
        shouldReset: true,
      };
    }

    // Calculate hours remaining until streak expires
    const hoursRemaining = 24 - hoursSinceActivity;

    // Check if streak needs reminder (<6 hours remaining)
    // Note: In production, this would be handled by a cloud function or background task
    // For now, we'll check when this function is called
    if (hoursRemaining < 6 && hoursRemaining > 0) {
      // Send reminder notification (non-blocking)
      try {
        const {getUser} = await import('./authService');
        const partnerId = partnership.userId1 || partnership.userId2;
        const partner = partnerId ? await getUser(partnerId) : null;
        const partnerName = partner?.name || 'your partner';

        // Get both user IDs to send reminders
        if (partnership.userId1) {
          await sendStreakReminderNotification(
            partnership.userId1,
            partnerName,
            hoursRemaining,
          );
        }
        if (partnership.userId2) {
          await sendStreakReminderNotification(
            partnership.userId2,
            partnerName,
            hoursRemaining,
          );
        }
      } catch (error) {
        // Don't fail streak check if notification fails
        console.error('Error sending streak reminder notification:', error);
      }
    }

    return {
      isActive: true,
      hoursRemaining: Math.max(0, hoursRemaining),
      shouldReset: false,
    };
  } catch (error: any) {
    console.error('Error checking streak status:', error);
    return {
      isActive: false,
      hoursRemaining: 0,
      shouldReset: false,
    };
  }
}

/**
 * Record activity and increment streak if conditions are met
 */
export async function recordActivity(
  partnershipId: string,
  questionId?: string,
): Promise<{streakIncremented: boolean; milestone?: MilestoneInfo}> {
  try {
    const partnership = await getPartnership(partnershipId);
    if (!partnership) {
      throw new FirestoreError('Partnership not found', 'not-found');
    }

    // If no questionId provided, we can't check if both answered
    if (!questionId) {
      // Just update lastActivityDate without incrementing
      await updatePartnership(partnershipId, {
        lastActivityDate: new Date().toISOString(),
      });
      return {streakIncremented: false};
    }

    // Check if both partners have answered today's question
    const answers = await getAnswers(questionId, partnershipId);
    if (answers.length < 2) {
      // Both partners haven't answered yet
      return {streakIncremented: false};
    }

    const lastActivityDate = partnership.lastActivityDate
      ? parseISO(partnership.lastActivityDate)
      : null;
    const now = new Date();
    const today = now;

    // Check if we've already incremented streak today
    // Allow increment when streakCount is 0 even if lastActivityDate is today (for new partnerships)
    if (lastActivityDate && isSameDay(lastActivityDate, today) && partnership.streakCount > 0) {
      // Already recorded activity today, don't increment again
      return {streakIncremented: false};
    }

    // Both partners answered and it's a new day, increment streak
    await incrementStreak(partnershipId);

    // Check for milestone
    const newStreakCount = partnership.streakCount + 1;
    const milestone = checkMilestone(newStreakCount);

    return {
      streakIncremented: true,
      milestone: milestone.isMilestone ? milestone : undefined,
    };
  } catch (error: any) {
    console.error('Error recording activity:', error);
    throw new FirestoreError(
      `Failed to record activity: ${getErrorMessage(error)}`,
      error.code || 'unknown',
      error,
    );
  }
}

/**
 * Check if current streak count is a milestone
 */
export function checkMilestone(streakCount: number): MilestoneInfo {
  const milestones = [
    {days: 3, type: '3-day', message: '🔥 3-day streak! You\'re on fire!'},
    {days: 7, type: '7-day', message: '🌟 7-day streak! Amazing week!'},
    {days: 30, type: '30-day', message: '💫 30-day streak! A full month!'},
    {days: 90, type: '90-day', message: '🎉 90-day streak! 3 months strong!'},
    {days: 180, type: '180-day', message: '🏆 180-day streak! Half a year!'},
    {days: 365, type: '365-day', message: '👑 365-day streak! A full year!'},
  ];

  const milestone = milestones.find(m => m.days === streakCount);

  if (milestone) {
    return {
      isMilestone: true,
      type: milestone.type,
      message: milestone.message,
    };
  }

  return {
    isMilestone: false,
    type: '',
    message: '',
  };
}

/**
 * Restore streak using free restore feature
 */
export async function restoreStreak(
  partnershipId: string,
): Promise<{success: boolean; message: string}> {
  try {
    const partnership = await getPartnership(partnershipId);
    if (!partnership) {
      throw new FirestoreError('Partnership not found', 'not-found');
    }

    // Check if restoration is available
    if (!partnership.streakRestoreAvailable || partnership.streakRestoreUsed) {
      return {
        success: false,
        message: 'Streak restore is not available',
      };
    }

    const previousStreak = partnership.previousStreakCount || 0;

    if (previousStreak === 0) {
      return {
        success: false,
        message: 'No previous streak to restore',
      };
    }

    // Restore previous streak count and mark restore as used
    await updatePartnership(partnershipId, {
      streakCount: previousStreak,
      streakRestoreUsed: true,
      streakRestoreAvailable: false,
      lastActivityDate: new Date().toISOString(),
    });

    return {
      success: true,
      message: `Streak restored to ${previousStreak} days!`,
    };
  } catch (error: any) {
    console.error('Error restoring streak:', error);
    return {
      success: false,
      message: `Failed to restore streak: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Get time remaining until streak expires
 */
export function getTimeRemaining(lastActivityDate: string): string {
  try {
    const lastActivity = parseISO(lastActivityDate);
    const now = new Date();
    // Use minute-based calculation to avoid truncation
    const minutesSinceActivity = differenceInMinutes(now, lastActivity);
    const totalMinutesRemaining = 24 * 60 - minutesSinceActivity;

    if (totalMinutesRemaining <= 0) {
      return 'Streak expired';
    }

    // Derive accurate hours and minutes from the full minute count
    const wholeHours = Math.floor(totalMinutesRemaining / 60);
    const remainingMinutes = totalMinutesRemaining % 60;

    if (wholeHours >= 1) {
      if (remainingMinutes > 0) {
        return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} left`;
      }
      return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''} left`;
    }

    // Less than 1 hour remaining
    return `${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} left`;
  } catch (error) {
    console.error('Error calculating time remaining:', error);
    return 'Unknown';
  }
}

/**
 * Subscribe to real-time streak status updates
 */
export function subscribeToStreakStatus(
  partnershipId: string,
  callback: (status: StreakStatus) => void,
): () => void {
  const unsubscribe = subscribeToPartnership(partnershipId, async partnership => {
    if (partnership) {
      const status = await checkStreakStatus(partnershipId);
      callback(status);
    } else {
      callback({
        isActive: false,
        hoursRemaining: 0,
        shouldReset: false,
      });
    }
  });

  return unsubscribe;
}