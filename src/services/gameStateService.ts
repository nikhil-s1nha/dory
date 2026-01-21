/**
 * Game State Service
 * Manages turn-based and real-time game state using Firestore
 */

import {gameStatesCollection, generateId, getTimestamp} from './firebase';
import {GameState} from '@utils/types';
import {FirestoreError, getErrorMessage} from '@utils/errors';

let debounceTimers: Map<string, NodeJS.Timeout> = new Map();
const DEBOUNCE_DELAY = 300; // milliseconds

/**
 * Create a new game state
 */
export async function createGameState(
  partnershipId: string,
  gameType: GameState['gameType'],
  initialState: any,
): Promise<GameState> {
  try {
    const gameId = generateId();
    const now = new Date().toISOString();

    const gameState: GameState = {
      id: gameId,
      partnershipId,
      gameType,
      state: initialState,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await gameStatesCollection.doc(gameId).set(gameState);

    return gameState;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Update game state (with debouncing for rapid updates)
 * @param gameId - The game state document ID
 * @param updates - Partial game state updates
 * @param useMerge - If true, merge nested state objects instead of replacing them
 */
export async function updateGameState(
  gameId: string,
  updates: Partial<GameState>,
  useMerge: boolean = false,
): Promise<void> {
  try {
    // For critical updates that need immediate persistence, skip debouncing
    if (useMerge && updates.state) {
      // Get current state first
      const currentDoc = await gameStatesCollection.doc(gameId).get();
      if (currentDoc.exists) {
        const currentState = currentDoc.data() as GameState;
        const currentStateData = currentState.state as any;
        const newStateData = updates.state as any;
        
        // Merge state objects
        const mergedState = {
          ...currentStateData,
          ...newStateData,
        };
        
        // Immediate update for merge operations
        await gameStatesCollection.doc(gameId).update({
          state: mergedState,
          updatedAt: new Date().toISOString(),
        });
        return;
      }
    }

    // Clear existing debounce timer for this game
    const existingTimer = debounceTimers.get(gameId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(async () => {
      try {
        const updateData = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await gameStatesCollection.doc(gameId).update(updateData);
        debounceTimers.delete(gameId);
      } catch (error: any) {
        console.error('Error updating game state:', error);
        debounceTimers.delete(gameId);
      }
    }, DEBOUNCE_DELAY);

    debounceTimers.set(gameId, timer);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Get current game state
 */
export async function getGameState(gameId: string): Promise<GameState | null> {
  try {
    const doc = await gameStatesCollection.doc(gameId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as GameState;
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}

/**
 * Subscribe to real-time game state updates
 */
export function subscribeToGameState(
  gameId: string,
  callback: (gameState: GameState | null) => void,
): () => void {
  const unsubscribe = gameStatesCollection.doc(gameId).onSnapshot(
    snapshot => {
      if (snapshot.exists) {
        callback(snapshot.data() as GameState);
      } else {
        callback(null);
      }
    },
    error => {
      console.error('Game state subscription error:', error);
      callback(null);
    },
  );

  return unsubscribe;
}

/**
 * End game session and save final scores
 */
export async function endGameSession(
  gameId: string,
  winnerId?: string,
  scores?: {userId1: string; score1: number; userId2: string; score2: number},
): Promise<void> {
  try {
    const updateData: Partial<GameState> = {
      isActive: false,
      updatedAt: new Date().toISOString(),
    };

    if (winnerId) {
      updateData.winnerId = winnerId;
    }

    await gameStatesCollection.doc(gameId).update(updateData);
  } catch (error: any) {
    const message = getErrorMessage(error);
    throw new FirestoreError(message, error.code || 'unknown', error);
  }
}
