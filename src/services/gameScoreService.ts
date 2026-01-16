/**
 * Game Score service
 * Manages game scores and leaderboards
 */

import {
  gameScoresCollection,
  generateId,
} from './firebase';
import {GameScore} from '@utils/types';
import {FirestoreError, getErrorMessage} from '@utils/errors';

/**
 * Save a game score
 */
export async function saveGameScore(
  score: Omit<GameScore, 'id' | 'playedAt'>,
): Promise<GameScore> {
  try {
    const scoreId = generateId();
    const now = new Date().toISOString();

    const scoreData: GameScore = {
      ...score,
      id: scoreId,
      playedAt: now,
    };

    await gameScoresCollection.doc(scoreId).set(scoreData);

    return scoreData;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get game scores for a partnership
 */
export async function getGameScores(
  partnershipId: string,
  gameType?: string,
): Promise<GameScore[]> {
  try {
    let query = gameScoresCollection.where(
      'partnershipId',
      '==',
      partnershipId,
    );

    if (gameType) {
      query = query.where('gameType', '==', gameType) as any;
    }

    const snapshot = await query.orderBy('playedAt', 'desc').get();

    return snapshot.docs.map(doc => doc.data() as GameScore);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get leaderboard for a specific game type
 */
export async function getLeaderboard(
  partnershipId: string,
  gameType: string,
): Promise<GameScore[]> {
  try {
    const snapshot = await gameScoresCollection
      .where('partnershipId', '==', partnershipId)
      .where('gameType', '==', gameType)
      .orderBy('score', 'desc')
      .get();

    return snapshot.docs.map(doc => doc.data() as GameScore);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get user statistics for a game type
 */
export async function getUserStats(
  userId: string,
  gameType: string,
): Promise<{
  bestScore: number;
  totalGames: number;
  averageScore: number;
  wins: number;
  losses: number;
}> {
  try {
    const snapshot = await gameScoresCollection
      .where('userId', '==', userId)
      .where('gameType', '==', gameType)
      .get();

    const scores = snapshot.docs.map(doc => doc.data() as GameScore);

    if (scores.length === 0) {
      return {
        bestScore: 0,
        totalGames: 0,
        averageScore: 0,
        wins: 0,
        losses: 0,
      };
    }

    const userScores = scores.map(s => s.score);
    const bestScore = Math.max(...userScores);
    const totalGames = scores.length;
    const averageScore =
      userScores.reduce((sum, score) => sum + score, 0) / totalGames;

    // For win/loss calculation, we need to compare with partner's scores
    // This is a simplified version - you may need to adjust based on game logic
    let wins = 0;
    let losses = 0;

    // Get all scores for the same partnerships
    const partnershipIds = [...new Set(scores.map(s => s.partnershipId))];
    for (const partnershipId of partnershipIds) {
      const partnershipScores = await getGameScores(partnershipId, gameType);
      const userBest = Math.max(
        ...partnershipScores.filter(s => s.userId === userId).map(s => s.score),
      );
      const partnerBest = Math.max(
        ...partnershipScores
          .filter(s => s.userId !== userId)
          .map(s => s.score),
      );

      if (userBest > partnerBest) {
        wins++;
      } else if (partnerBest > userBest) {
        losses++;
      }
    }

    return {
      bestScore,
      totalGames,
      averageScore: Math.round(averageScore * 100) / 100,
      wins,
      losses,
    };
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to game scores
 */
export function subscribeToGameScores(
  partnershipId: string,
  gameType: string,
  callback: (scores: GameScore[]) => void,
): () => void {
  const unsubscribe = gameScoresCollection
    .where('partnershipId', '==', partnershipId)
    .where('gameType', '==', gameType)
    .orderBy('playedAt', 'desc')
    .onSnapshot(
      snapshot => {
        const scores = snapshot.docs.map(doc => doc.data() as GameScore);
        callback(scores);
      },
      error => {
        console.error('Game score subscription error:', error);
        callback([]);
      },
    );

  return unsubscribe;
}
