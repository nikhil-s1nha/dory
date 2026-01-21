/**
 * Draw Duel Game Screen
 * Drawing competition game
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {GameHeader, GameTimer, GameResultModal} from '@components/games';
import {Canvas} from '@components/Canvas';
import {createGameState, subscribeToGameState, updateGameState, endGameSession} from '@services/gameStateService';
import {saveGameScore} from '@services/gameScoreService';
import {recordActivity} from '@services/streaks';
import {getUserById} from '@services/authService';
import {MainStackParamList, DrawDuelState} from '@utils/types';
import {theme} from '@theme';
import promptsData from '@data/games/drawDuelPrompts.json';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'DrawDuel'>;

interface DrawPrompt {
  prompt: string;
  difficulty: string;
}

export const DrawDuelScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [gameState, setGameState] = useState<DrawDuelState | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [isLoading, setIsLoading] = useState(true);
  const [drawingData, setDrawingData] = useState<string>('');
  const [timeRemaining, setTimeRemaining] = useState(45);
  const [showVoting, setShowVoting] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [hasSubmittedDrawing, setHasSubmittedDrawing] = useState(false);
  const [timerKey, setTimerKey] = useState(0);

  const prompts = promptsData as DrawPrompt[];

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

        const shuffledPrompts = [...prompts].sort(() => Math.random() - 0.5);
        const initialState: DrawDuelState = {
          round: 1,
          currentPromptIndex: 0,
          user1Wins: 0,
          user2Wins: 0,
          prompts: shuffledPrompts.slice(0, 3),
        };

        const newGameState = await createGameState(
          partnership.id,
          'draw_duel',
          initialState,
        );
        setGameId(newGameState.id);
        setGameState(initialState);
        setTimeRemaining(45);

        const unsubscribe = subscribeToGameState(newGameState.id, (state) => {
          if (state) {
            const gameStateData = state.state as DrawDuelState;
            setGameState(gameStateData);

            // Set showVoting when both drawings are present
            if (gameStateData.user1Drawing && gameStateData.user2Drawing) {
              setShowVoting(true);
            }

            if (gameStateData.user1Vote && gameStateData.user2Vote) {
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

  const handleTimeUp = async () => {
    if (!gameId || !gameState || !user || !partnership) return;

    const isUser1 = user.id === partnership.userId1;
    const updateKey = isUser1 ? 'user1Drawing' : 'user2Drawing';
    
    setHasSubmittedDrawing(true);

    // Use merge update to avoid overwriting concurrent updates
    await updateGameState(gameId, {
      state: {
        ...gameState,
        [updateKey]: drawingData,
        timeRemaining: 0,
      },
    }, true);
  };

  const handleVote = async (vote: 'user1' | 'user2') => {
    if (!gameId || !gameState || !user || !partnership) return;

    const isUser1 = user.id === partnership.userId1;
    const updateKey = isUser1 ? 'user1Vote' : 'user2Vote';

    // Use merge update to avoid overwriting concurrent updates
    await updateGameState(gameId, {
      state: {
        ...gameState,
        [updateKey]: vote,
      },
    }, true);
  };

  const handleNextRound = async () => {
    if (!gameId || !gameState || !user || !partnership) return;

    const isUser1 = user.id === partnership.userId1;
    const user1Won = gameState.user1Vote === 'user1' && gameState.user2Vote === 'user1';
    const user2Won = gameState.user1Vote === 'user2' && gameState.user2Vote === 'user2';

    const newUser1Wins = user1Won ? gameState.user1Wins + 1 : gameState.user1Wins;
    const newUser2Wins = user2Won ? gameState.user2Wins + 1 : gameState.user2Wins;
    const newRound = gameState.round + 1;

    if (newRound > 3) {
      // Game complete
      try {
        const myWins = isUser1 ? newUser1Wins : newUser2Wins;
        await saveGameScore({
          gameType: 'draw_duel',
          partnershipId: partnership.id,
          userId: user.id,
          score: myWins,
        });
        await recordActivity(partnership.id);
        await endGameSession(gameId);
      } catch (error) {
        console.error('Error saving score:', error);
      }
      navigation.goBack();
    } else {
      const newState: DrawDuelState = {
        ...gameState,
        round: newRound,
        currentPromptIndex: gameState.currentPromptIndex + 1,
        user1Drawing: undefined,
        user2Drawing: undefined,
        user1Vote: undefined,
        user2Vote: undefined,
        user1Wins: newUser1Wins,
        user2Wins: newUser2Wins,
        timeRemaining: 45,
      };
      await updateGameState(gameId, {state: newState});
      setDrawingData('');
      setShowVoting(false);
      setTimeRemaining(45);
      setHasSubmittedDrawing(false);
      setTimerKey(prev => prev + 1); // Reset timer by changing key
      setShowResultModal(false);
    }
  };

  if (isLoading || !gameState) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const currentPrompt = gameState.prompts[gameState.currentPromptIndex];
  const isUser1 = user?.id === partnership?.userId1;
  const myWins = isUser1 ? gameState.user1Wins : gameState.user2Wins;
  const partnerWins = isUser1 ? gameState.user2Wins : gameState.user1Wins;

  if (showVoting) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <GameHeader
          title="Draw Duel"
          onBack={() => navigation.goBack()}
        />
        <View style={styles.votingContainer}>
          <Text style={styles.votingTitle}>Vote for the best drawing!</Text>
          <View style={styles.drawingContainer}>
            <View style={styles.drawingBox}>
              <Text style={styles.drawingLabel}>
                {isUser1 ? 'Your Drawing' : partnerName + "'s Drawing"}
              </Text>
              {gameState.user1Drawing && (
                <Canvas
                  partnershipId={`game-${gameId}-display-1`}
                  userId={user!.id}
                  initialDrawingData={gameState.user1Drawing}
                  editable={false}
                  size="small"
                />
              )}
            </View>
            <View style={styles.drawingBox}>
              <Text style={styles.drawingLabel}>
                {isUser1 ? partnerName + "'s Drawing" : 'Your Drawing'}
              </Text>
              {gameState.user2Drawing && (
                <Canvas
                  partnershipId={`game-${gameId}-display-2`}
                  userId={user!.id}
                  initialDrawingData={gameState.user2Drawing}
                  editable={false}
                  size="small"
                />
              )}
            </View>
          </View>
          <View style={styles.voteButtons}>
            <TouchableOpacity
              style={styles.voteButton}
              onPress={() => handleVote('user1')}>
              <Text style={styles.voteButtonText}>Vote Left</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.voteButton}
              onPress={() => handleVote('user2')}>
              <Text style={styles.voteButtonText}>Vote Right</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GameHeader
        title="Draw Duel"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.content}>
        <View style={styles.promptContainer}>
          <Text style={styles.promptText}>Draw: {currentPrompt.prompt}</Text>
        </View>

        <View style={styles.canvasContainer}>
          <Canvas
            partnershipId={`game-${gameId}-${user!.id}`}
            userId={user!.id}
            onSave={setDrawingData}
            editable={!hasSubmittedDrawing}
            size="medium"
          />
        </View>

        <View style={styles.scoresContainer}>
          <Text style={styles.scoreText}>You: {myWins}</Text>
          <Text style={styles.scoreText}>{partnerName}: {partnerWins}</Text>
        </View>

        <GameTimer
          key={timerKey}
          duration={45}
          onComplete={handleTimeUp}
          paused={false}
        />
      </View>

      <GameResultModal
        visible={showResultModal}
        winner={
          gameState.user1Vote === 'user1' && gameState.user2Vote === 'user1'
            ? partnership.userId1
            : gameState.user1Vote === 'user2' && gameState.user2Vote === 'user2'
            ? partnership.userId2
            : 'draw'
        }
        scores={[
          {userId: partnership.userId1, score: gameState.user1Wins, name: isUser1 ? 'You' : partnerName},
          {userId: partnership.userId2, score: gameState.user2Wins, name: isUser1 ? partnerName : 'You'},
        ]}
        onPlayAgain={handleNextRound}
        onClose={() => {
          if (gameState.round > 3) {
            navigation.goBack();
          } else {
            handleNextRound();
          }
        }}
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
  },
  promptContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.base,
    alignItems: 'center',
  },
  promptText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  canvasContainer: {
    flex: 1,
    marginBottom: theme.spacing.base,
  },
  scoresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.base,
  },
  scoreText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  votingContainer: {
    flex: 1,
    padding: theme.spacing.base,
  },
  votingTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  drawingContainer: {
    flexDirection: 'row',
    gap: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  drawingBox: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.sm,
  },
  drawingLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  voteButtons: {
    flexDirection: 'row',
    gap: theme.spacing.base,
  },
  voteButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  voteButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
});
