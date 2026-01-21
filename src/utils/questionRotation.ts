/**
 * Question rotation utilities
 * Ensures fresh content monthly
 */

import {loadAllQuestions, Question} from './questionLoader';

/**
 * Get question IDs for current month (deterministic rotation)
 */
export function getMonthlyRotation(): string[] {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();
  
  // Create seed from year and month for deterministic selection
  const seed = year * 12 + month;
  
  const allQuestions = loadAllQuestions();
  if (allQuestions.length === 0) {
    return [];
  }

  // Use seed to shuffle questions deterministically
  const shuffled = deterministicShuffle(allQuestions, seed);
  
  // Return first 50 question IDs for the month
  return shuffled.slice(0, 50).map(q => q.id);
}

/**
 * Deterministic shuffle using seed
 */
function deterministicShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  let currentSeed = seed;
  
  // Simple seeded random number generator
  const seededRandom = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };

  // Fisher-Yates shuffle with seeded random
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Check if questions should be rotated (new month)
 */
export function shouldRotateQuestions(): boolean {
  // This would typically check against stored last rotation date
  // For now, we'll always use current month's rotation
  // In production, store last rotation date in AsyncStorage or Firestore
  return true;
}

/**
 * Get questions for current rotation period
 */
export function getRotationQuestions(): Question[] {
  const rotationIds = getMonthlyRotation();
  const allQuestions = loadAllQuestions();
  
  return allQuestions.filter(q => rotationIds.includes(q.id));
}
