/**
 * Four-in-a-Row Game Screen
 * Connect Four style game
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {GameHeader, GameResultModal} from '@components/games';
import {createGameState, subscribeToGameState, updateGameState, endGameSession} from '@services/gameStateService';
import {saveGameScore} from '@services/gameScoreService';
import {recordActivity} from '@services/streaks';
import {getUserById} from '@services/authService';
import {MainStackParamList, FourInARowState} from '@utils/types';
import {theme} from '@theme';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'FourInARow'>;

const ROWS = 6;
const COLS = 7;
const CELL_SIZE = Dimensions.get('window').width / 8;

// Helper functions
const createEmptyBoard = (): number[][] => {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
};

const getAvailableRow = (col: number, board: number[][]): number => {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === 0) {
      return row;
    }
  }
  return -1;
};

const checkWinner = (board: number[][], player: number): boolean => {
  // Check horizontal
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col <= COLS - 4; col++) {
      if (
        board[row][col] === player &&
        board[row][col + 1] === player &&
        board[row][col + 2] === player &&
        board[row][col + 3] === player
      ) {
        return true;
      }
    }
  }

  // Check vertical
  for (let row = 0; row <= ROWS - 4; row++) {
    for (let col = 0; col < COLS; col++) {
      if (
        board[row][col] === player &&
        board[row + 1][col] === player &&
        board[row + 2][col] === player &&
        board[row + 3][col] === player
      ) {
        return true;
      }
    }
  }

  // Check diagonal (top-left to bottom-right)
  for (let row = 0; row <= ROWS - 4; row++) {
    for (let col = 0; col <= COLS - 4; col++) {
      if (
        board[row][col] === player &&
        board[row + 1][col + 1] === player &&
        board[row + 2][col + 2] === player &&
        board[row + 3][col + 3] === player
      ) {
        return true;
      }
    }
  }

  // Check diagonal (top-right to bottom-left)
  for (let row = 0; row <= ROWS - 4; row++) {
    for (let col = 3; col < COLS; col++) {
      if (
        board[row][col] === player &&
        board[row + 1][col - 1] === player &&
        board[row + 2][col - 2] === player &&
        board[row + 3][col - 3] === player
      ) {
        return true;
      }
    }
  }

  return false;
};

const isBoardFull = (board: number[][]): boolean => {
  return board[0].every(cell => cell !== 0);
};

export const FourInARowScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [gameState, setGameState] = useState<FourInARowState | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [isLoading, setIsLoading] = useState(true);
  const [showResultModal, setShowResultModal] = useState(false);

  useEffect(() => {
    if (!user || !partnership) {
      navigation.goBack();
      return;
    }

    const initializeGame = async () => {
      try {
        setIsLoading(true);
        const partnerId = user.id === partnership.userId1 
          ? partnership.userId2 
          : partnership.userId1;
        
        const partner = await getUserById(partnerId);
        if (partner) {
          setPartnerName(partner.name);
        }

        const initialState: FourInARowState = {
          board: createEmptyBoard(),
          currentPlayerId: user.id,
          player1Id: user.id,
          player2Id: partnerId,
          isDraw: false,
        };

        const newGameState = await createGameState(
          partnership.id,
          'four_in_a_row',
          initialState,
        );
        setGameId(newGameState.id);
        setGameState(initialState);

        const unsubscribe = subscribeToGameState(newGameState.id, (state) => {
          if (state) {
            const gameStateData = state.state as FourInARowState;
            setGameState(gameStateData);

            if (gameStateData.winnerId || gameStateData.isDraw) {
              setShowResultModal(true);
            }
          }
        });

        setIsLoading(false);
        return unsubscribe;
      } catch (error) {
        console.error('Error initializing game:', error);
        setIsLoading(false);
      }
    };

    const unsubscribe = initializeGame();
    return () => {
      if (unsubscribe) {
        unsubscribe.then(unsub => unsub());
      }
    };
  }, []);

  const handleColumnPress = async (col: number) => {
    if (!gameId || !gameState || !user || !partnership) return;

    if (gameState.currentPlayerId !== user.id) {
      return; // Not your turn
    }

    const row = getAvailableRow(col, gameState.board);
    if (row === -1) {
      return; // Column is full
    }

    const player = user.id === gameState.player1Id ? 1 : 2;
    const newBoard = gameState.board.map(r => [...r]);
    newBoard[row][col] = player;

    const hasWon = checkWinner(newBoard, player);
    const isDraw = !hasWon && isBoardFull(newBoard);

    const newState: FourInARowState = {
      ...gameState,
      board: newBoard,
      currentPlayerId: hasWon || isDraw 
        ? gameState.currentPlayerId 
        : (gameState.currentPlayerId === gameState.player1Id 
            ? gameState.player2Id 
            : gameState.player1Id),
      winnerId: hasWon ? user.id : gameState.winnerId,
      isDraw: isDraw,
    };

    await updateGameState(gameId, {state: newState});

    if (hasWon || isDraw) {
      try {
        if (hasWon) {
          await saveGameScore({
            gameType: 'four_in_a_row',
            partnershipId: partnership.id,
            userId: user.id,
            score: 100,
          });
        }
        await endGameSession(gameId, hasWon ? user.id : undefined);
        await recordActivity(partnership.id);
      } catch (error) {
        console.error('Error saving score:', error);
      }
    }
  };

  const handlePlayAgain = () => {
    setShowResultModal(false);
    // Reset game
    if (gameId && gameState && user && partnership) {
      const partnerId = user.id === partnership.userId1 
        ? partnership.userId2 
        : partnership.userId1;
      const initialState: FourInARowState = {
        board: createEmptyBoard(),
        currentPlayerId: user.id,
        player1Id: user.id,
        player2Id: partnerId,
        isDraw: false,
      };
      updateGameState(gameId, {state: initialState});
    }
  };

  if (isLoading || !gameState) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const isMyTurn = gameState.currentPlayerId === user?.id;
  const isPlayer1 = user?.id === gameState.player1Id;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GameHeader
        title="Four-in-a-Row"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.content}>
        <Text style={styles.turnText}>
          {isMyTurn ? 'Your Turn' : `${partnerName}'s Turn`}
        </Text>

        <View style={styles.boardContainer}>
          {gameState.board.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map((cell, colIndex) => (
                <TouchableOpacity
                  key={`${rowIndex}-${colIndex}`}
                  style={[
                    styles.cell,
                    cell === 1 && styles.cellPlayer1,
                    cell === 2 && styles.cellPlayer2,
                  ]}
                  onPress={() => handleColumnPress(colIndex)}
                  disabled={!isMyTurn || cell !== 0}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendCircle, styles.cellPlayer1]} />
            <Text style={styles.legendText}>
              {isPlayer1 ? 'You' : partnerName}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendCircle, styles.cellPlayer2]} />
            <Text style={styles.legendText}>
              {isPlayer1 ? partnerName : 'You'}
            </Text>
          </View>
        </View>
      </View>

      <GameResultModal
        visible={showResultModal}
        winner={gameState.winnerId || (gameState.isDraw ? 'draw' : undefined)}
        scores={[
          {userId: gameState.player1Id, score: gameState.winnerId === gameState.player1Id ? 100 : 0, name: isPlayer1 ? 'You' : partnerName},
          {userId: gameState.player2Id, score: gameState.winnerId === gameState.player2Id ? 100 : 0, name: isPlayer1 ? partnerName : 'You'},
        ]}
        onPlayAgain={handlePlayAgain}
        onClose={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.base,
    alignItems: 'center',
  },
  turnText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  boardContainer: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.base,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    backgroundColor: theme.colors.background,
    margin: 2,
  },
  cellPlayer1: {
    backgroundColor: theme.colors.primary,
  },
  cellPlayer2: {
    backgroundColor: theme.colors.secondary,
  },
  legend: {
    flexDirection: 'row',
    gap: theme.spacing.xl,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  legendCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  legendText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
});
