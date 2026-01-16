/**
 * Question and Answer service
 * Manages questions, answers, and real-time answer sync
 */

import {
  questionsCollection,
  answersCollection,
  generateId,
  getTimestamp,
  firebaseFirestore,
} from './firebase';
import type {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import {getPartnership} from './partnershipService';
import {Question, Answer, Partnership} from '@utils/types';
import {FirestoreError, getErrorMessage} from '@utils/errors';
import {getPartnership} from './partnershipService';

/**
 * Get questions with optional filtering
 */
export async function getQuestions(
  deckId?: string,
  category?: string,
): Promise<Question[]> {
  try {
    let query: FirebaseFirestoreTypes.Query = questionsCollection;

    if (deckId) {
      query = query.where('deckId', '==', deckId);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as Question);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get random question excluding skipped ones
 */
export async function getRandomQuestion(
  partnershipId: string,
  excludeIds: string[] = [],
): Promise<Question | null> {
  try {
    // Get partnership to check skipped questions
    const partnership = await getPartnership(partnershipId);
    const skippedIds = [
      ...(partnership?.skippedQuestionIds || []),
      ...excludeIds,
    ];

    // Get all questions
    const allQuestions = await getQuestions();

    // Filter out skipped questions
    const availableQuestions = allQuestions.filter(
      q => !skippedIds.includes(q.id),
    );

    if (availableQuestions.length === 0) {
      return null;
    }

    // Return random question
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    return availableQuestions[randomIndex];
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get daily question (deterministic based on date)
 */
export async function getDailyQuestion(
  partnershipId: string,
): Promise<Question | null> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const seed = parseInt(today.replace(/-/g, ''), 10);

    // Get all questions
    const allQuestions = await getQuestions();

    if (allQuestions.length === 0) {
      return null;
    }

    // Use date as seed for deterministic selection
    const questionIndex = seed % allQuestions.length;
    return allQuestions[questionIndex];
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Submit an answer
 */
export async function submitAnswer(
  answer: Omit<Answer, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Answer> {
  try {
    const answerId = generateId();
    const now = new Date().toISOString();

    const answerData: Answer = {
      ...answer,
      id: answerId,
      isRevealed: false,
      createdAt: now,
      updatedAt: now,
    };

    await answersCollection.doc(answerId).set(answerData);

    // Check if both partners have answered
    const answers = await getAnswers(answer.questionId, answer.partnershipId);
    if (answers.length === 2) {
      // Both partners have answered, reveal answers
      await revealAnswers(answer.questionId, answer.partnershipId);
    }

    return answerData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get answers for a question
 */
export async function getAnswers(
  questionId: string,
  partnershipId: string,
): Promise<Answer[]> {
  try {
    const snapshot = await answersCollection
      .where('questionId', '==', questionId)
      .where('partnershipId', '==', partnershipId)
      .get();

    return snapshot.docs.map(doc => doc.data() as Answer);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Update an answer
 */
export async function updateAnswer(
  answerId: string,
  updates: Partial<Answer>,
): Promise<Answer> {
  try {
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await answersCollection.doc(answerId).update(updateData);

    const updatedDoc = await answersCollection.doc(answerId).get();
    return updatedDoc.data() as Answer;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Add reaction to an answer
 */
export async function addReaction(
  answerId: string,
  reaction: {userId: string; emoji: string; createdAt: string},
): Promise<Answer> {
  try {
    const answerDoc = await answersCollection.doc(answerId).get();
    const answer = answerDoc.data() as Answer;

    const reactions = answer.reactions || [];
    const updatedReactions = [...reactions, reaction];

    return await updateAnswer(answerId, {reactions: updatedReactions});
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Reveal answers for a question
 */
export async function revealAnswers(
  questionId: string,
  partnershipId: string,
): Promise<void> {
  try {
    const answers = await getAnswers(questionId, partnershipId);

    const updatePromises = answers.map(answer =>
      answersCollection.doc(answer.id).update({
        isRevealed: true,
        updatedAt: new Date().toISOString(),
      }),
    );

    await Promise.all(updatePromises);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to answer updates
 */
export function subscribeToAnswers(
  questionId: string,
  partnershipId: string,
  callback: (answers: Answer[]) => void,
): () => void {
  const unsubscribe = answersCollection
    .where('questionId', '==', questionId)
    .where('partnershipId', '==', partnershipId)
    .onSnapshot(
      snapshot => {
        const answers = snapshot.docs.map(doc => doc.data() as Answer);
        callback(answers);
      },
      error => {
        console.error('Answer subscription error:', error);
        callback([]);
      },
    );

  return unsubscribe;
}

/**
 * Skip a question (add to skipped list)
 */
export async function skipQuestion(
  partnershipId: string,
  questionId: string,
): Promise<void> {
  try {
    const partnership = await getPartnership(partnershipId);
    if (!partnership) {
      throw new FirestoreError('Partnership not found', 'not-found');
    }

    const skippedIds = partnership.skippedQuestionIds || [];
    if (!skippedIds.includes(questionId)) {
      await partnershipsCollection.doc(partnershipId).update({
        skippedQuestionIds: [...skippedIds, questionId],
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}
