/**
 * Question loader utility
 * Loads question data from JSON files
 */

import {Question} from '@utils/types';

export interface DeckMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  questionCount: number;
}

// Import question data
import deepQuestions from '../data/questions/deep/questions.json';
import lightheartedQuestions from '../data/questions/lighthearted/questions.json';
import nostalgiaQuestions from '../data/questions/nostalgia/questions.json';
import futureQuestions from '../data/questions/future_planning/questions.json';
import gratitudeQuestions from '../data/questions/gratitude/questions.json';
import growthQuestions from '../data/questions/growth/questions.json';
import gtkyQuestions from '../data/questions/get_to_know_you/questions.json';
import seasonalQuestions from '../data/questions/seasonal/questions.json';
import decksMetadata from '../data/questions/decks.json';

// Map categories to question arrays
const questionsByCategory: Record<string, Question[]> = {
  deep: deepQuestions as Question[],
  lighthearted: lightheartedQuestions as Question[],
  nostalgia: nostalgiaQuestions as Question[],
  future_planning: futureQuestions as Question[],
  gratitude: gratitudeQuestions as Question[],
  growth: growthQuestions as Question[],
  get_to_know_you: gtkyQuestions as Question[],
  seasonal: seasonalQuestions as Question[],
};

/**
 * Load questions by category
 */
export function loadQuestionsByCategory(category: string): Question[] {
  return questionsByCategory[category] || [];
}

/**
 * Load all questions from all categories
 */
export function loadAllQuestions(): Question[] {
  return Object.values(questionsByCategory).flat();
}

/**
 * Get deck metadata
 */
export function getDeckMetadata(): DeckMetadata[] {
  return decksMetadata as DeckMetadata[];
}

/**
 * Load questions by deck ID
 */
export function loadQuestionsByDeck(deckId: string): Question[] {
  const allQuestions = loadAllQuestions();
  return allQuestions.filter(q => q.deckId === deckId);
}

/**
 * Get a random question from a specific category or deck
 */
export function getRandomQuestion(
  category?: string,
  deckId?: string,
  excludeIds: string[] = [],
): Question | null {
  let questions: Question[];

  if (deckId) {
    questions = loadQuestionsByDeck(deckId);
  } else if (category) {
    questions = loadQuestionsByCategory(category);
  } else {
    questions = loadAllQuestions();
  }

  // Filter out excluded questions
  const availableQuestions = questions.filter(
    q => !excludeIds.includes(q.id),
  );

  if (availableQuestions.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * availableQuestions.length);
  return availableQuestions[randomIndex];
}
