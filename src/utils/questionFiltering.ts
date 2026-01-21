/**
 * Question filtering and adaptive algorithm utilities
 */

import {Question} from '@utils/types';
import {loadAllQuestions, getRandomQuestion as getRandomFromLoader} from './questionLoader';
import {getPartnership} from '@services/partnershipService';

export interface QuestionFilters {
  category?: string;
  deckId?: string;
  excludeIds?: string[];
  type?: Question['type'];
}

/**
 * Filter questions based on criteria
 */
export function filterQuestions(
  questions: Question[],
  filters: QuestionFilters,
): Question[] {
  let filtered = [...questions];

  if (filters.category) {
    filtered = filtered.filter(q => q.category === filters.category);
  }

  if (filters.deckId) {
    filtered = filtered.filter(q => q.deckId === filters.deckId);
  }

  if (filters.excludeIds && filters.excludeIds.length > 0) {
    filtered = filtered.filter(q => !filters.excludeIds!.includes(q.id));
  }

  if (filters.type) {
    filtered = filtered.filter(q => q.type === filters.type);
  }

  return filtered;
}

/**
 * Get adaptive question based on user preferences and skip history
 */
export async function getAdaptiveQuestion(
  partnershipId: string,
  userId: string,
): Promise<Question | null> {
  try {
    const partnership = await getPartnership(partnershipId);
    if (!partnership) {
      return null;
    }

    const skippedIds = partnership.skippedQuestionIds || [];
    const allQuestions = loadAllQuestions();

    // Filter out skipped questions
    const availableQuestions = allQuestions.filter(
      q => !skippedIds.includes(q.id),
    );

    if (availableQuestions.length === 0) {
      // Reset skip list if all questions are skipped
      return allQuestions[Math.floor(Math.random() * allQuestions.length)];
    }

    // Analyze skip patterns
    const skipPatterns = analyzeSkipPatterns(partnership, skippedIds);
    
    // Weight questions based on preferences
    const weightedQuestions = availableQuestions.map(question => ({
      question,
      weight: calculateQuestionWeight(question, skipPatterns),
    }));

    // Sort by weight (highest first)
    weightedQuestions.sort((a, b) => b.weight - a.weight);

    // Return top weighted question (or random from top 3 for variety)
    const topQuestions = weightedQuestions.slice(0, 3);
    const selected = topQuestions[Math.floor(Math.random() * topQuestions.length)];
    
    return selected.question;
  } catch (error) {
    console.error('Error getting adaptive question:', error);
    // Fallback to random question
    const allQuestions = loadAllQuestions();
    if (allQuestions.length === 0) return null;
    return allQuestions[Math.floor(Math.random() * allQuestions.length)];
  }
}

interface SkipPatterns {
  skippedCategories: Record<string, number>;
  skippedTypes: Record<string, number>;
  totalSkips: number;
}

/**
 * Analyze skip patterns from partnership data
 */
function analyzeSkipPatterns(
  partnership: any,
  skippedIds: string[],
): SkipPatterns {
  const allQuestions = loadAllQuestions();
  const skippedQuestions = allQuestions.filter(q => skippedIds.includes(q.id));

  const skippedCategories: Record<string, number> = {};
  const skippedTypes: Record<string, number> = {};
  
  skippedQuestions.forEach(question => {
    skippedCategories[question.category] =
      (skippedCategories[question.category] || 0) + 1;
    skippedTypes[question.type] = (skippedTypes[question.type] || 0) + 1;
  });

  return {
    skippedCategories,
    skippedTypes,
    totalSkips: skippedIds.length,
  };
}

/**
 * Calculate weight for a question based on skip patterns
 * Higher weight = more likely to be shown
 */
function calculateQuestionWeight(
  question: Question,
  skipPatterns: SkipPatterns,
): number {
  let weight = 100; // Base weight

  // Reduce weight if this category is frequently skipped
  const categorySkips = skipPatterns.skippedCategories[question.category] || 0;
  if (categorySkips > 0) {
    const categorySkipRatio = categorySkips / skipPatterns.totalSkips;
    weight -= categorySkipRatio * 30; // Reduce by up to 30 points
  }

  // Reduce weight if this type is frequently skipped
  const typeSkips = skipPatterns.skippedTypes[question.type] || 0;
  if (typeSkips > 0) {
    const typeSkipRatio = typeSkips / skipPatterns.totalSkips;
    weight -= typeSkipRatio * 20; // Reduce by up to 20 points
  }

  // Boost weight for underrepresented categories
  // (This is a simple heuristic - in production you'd track answered questions too)
  const categoryFrequency = skipPatterns.skippedCategories[question.category] || 0;
  if (categoryFrequency === 0 && skipPatterns.totalSkips > 0) {
    weight += 15; // Boost rarely-skipped categories
  }

  return Math.max(0, weight); // Ensure non-negative
}

/**
 * Track question interaction for future personalization
 */
export async function trackQuestionInteraction(
  partnershipId: string,
  questionId: string,
  action: 'answered' | 'skipped',
): Promise<void> {
  try {
    const partnership = await getPartnership(partnershipId);
    if (!partnership) {
      return;
    }

    // Update partnership document with interaction data
    // This would ideally track both answered and skipped questions
    // For now, we'll update the skippedQuestionIds if skipped
    if (action === 'skipped') {
      const skippedIds = partnership.skippedQuestionIds || [];
      if (!skippedIds.includes(questionId)) {
        // This is handled by skipQuestion service, but we can add additional tracking here
        // For example, track timestamps, categories, etc. for better personalization
      }
    }
    // In a production app, you'd also track answered questions
    // to understand what users engage with
  } catch (error) {
    console.error('Error tracking question interaction:', error);
  }
}
