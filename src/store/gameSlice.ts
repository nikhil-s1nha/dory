/**
 * Game state slice
 * Manages local game state for active game sessions
 */

import {create} from 'zustand';
import {GameState} from '@utils/types';

interface GameSliceState {
  currentGameId: string | null;
  gameType: GameState['gameType'] | null;
  gameState: any | null;
  isMyTurn: boolean;
  setGameSession: (gameId: string, gameType: GameState['gameType'], gameState: any) => void;
  updateGameState: (updates: any) => void;
  clearGameSession: () => void;
}

export const useGameStore = create<GameSliceState>(set => ({
  currentGameId: null,
  gameType: null,
  gameState: null,
  isMyTurn: false,
  setGameSession: (gameId, gameType, gameState) =>
    set({
      currentGameId: gameId,
      gameType,
      gameState,
    }),
  updateGameState: updates =>
    set(state => ({
      gameState: state.gameState ? {...state.gameState, ...updates} : updates,
    })),
  clearGameSession: () =>
    set({
      currentGameId: null,
      gameType: null,
      gameState: null,
      isMyTurn: false,
    }),
}));
