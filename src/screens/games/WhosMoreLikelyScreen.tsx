/**
 * Who's More Likely Game Screen
 * Voting game where partners vote on scenarios
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {GameHeader} from '@components/games';
import {createGameState, subscribeToGameState, updateGameState} from '@services/gameStateService';
import {saveGameScore} from '@services/gameScoreService';
import {recordActivity} from '@services/streaks';
import {getUserById} from '@services/authService';
import {MainStackParamList, WhosMoreLikelyState} from '@utils/types';
import {theme} from '@theme';
import promptsData from '@data/games/whosMoreLikelyPrompts.json';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'WhosMoreLikely'>;

export const WhosMoreLikelyScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [gameState, setGameState] = useState<WhosMoreLikelyState | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [isLoading, setIsLoading] = useState(true);
  const [isRevealed, setIsRevealed] = useState(false);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const fadeAnim = new Animated.Value(0);

  const prompts = promptsData as string[];

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
        const initialState: WhosMoreLikelyState = {
          currentPromptIndex: 0,
          agreements: 0,
          disagreements: 0,
          round: 1,
          prompts: shuffledPrompts.slice(0, 10),
        };

        const newGameState = await createGameState(
          partnership.id,
          'whos_more_likely',
          initialState,
        );
        setGameId(newGameState.id);
        setGameState(initialState);

        const unsubscribe = subscribeToGameState(newGameState.id, (state) => {
          if (state) {
            const gameStateData = state.state as WhosMoreLikelyState;
            setGameState(gameStateData);
            
            // Check if both voted
            if (gameStateData.user1Vote && gameStateData.user2Vote && !isRevealed) {
              setIsRevealed(true);
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
              }).start();
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

  const handleVote = async (vote: string) => {
    if (!gameId || !gameState || !user || !partnership) return;

    const isUser1 = user.id === partnership.userId1;
    const updateKey = isUser1 ? 'user1Vote' : 'user2Vote';

    await updateGameState(gameId, {
      state: {
        ...gameState,
        [updateKey]: vote,
      },
    });
  };

  const handleNextQuestion = async () => {
    if (!gameId || !gameState || !user || !partnership) return;

    const isAgreement = gameState.user1Vote === gameState.user2Vote;
    const newAgreements = isAgreement ? gameState.agreements + 1 : gameState.agreements;
    const newDisagreements = !isAgreement ? gameState.disagreements + 1 : gameState.disagreements;
    const newRound = gameState.round + 1;
    const newRoundsCompleted = roundsCompleted + 1;

    setRoundsCompleted(newRoundsCompleted);

    // Record activity after 3 rounds
    if (newRoundsCompleted === 3) {
      try {
        await recordActivity(partnership.id);
      } catch (error) {
        console.error('Error recording activity:', error);
      }
    }

    // Save score after each round
    try {
      await saveGameScore({
        gameType: 'whos_more_likely',
        partnershipId: partnership.id,
        userId: user.id,
        score: newAgreements,
        metadata: {
          disagreements: newDisagreements,
          round: newRound,
        },
      });
    } catch (error) {
      console.error('Error saving score:', error);
    }

    if (newRound <= gameState.prompts.length) {
      const newState: WhosMoreLikelyState = {
        ...gameState,
        currentPromptIndex: gameState.currentPromptIndex + 1,
        agreements: newAgreements,
        disagreements: newDisagreements,
        round: newRound,
        user1Vote: undefined,
        user2Vote: undefined,
      };
      await updateGameState(gameId, {state: newState});
      setIsRevealed(false);
      fadeAnim.setValue(0);
    } else {
      // Game complete
      navigation.goBack();
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
  const hasVoted = user?.id === partnership?.userId1
    ? !!gameState.user1Vote
    : !!gameState.user2Vote;
  const bothVoted = !!gameState.user1Vote && !!gameState.user2Vote;
  const isAgreement = gameState.user1Vote === gameState.user2Vote;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GameHeader
        title="Who's More Likely"
        onBack={() => navigation.goBack()}
        showScore
        score={gameState.agreements}
      />

      <View style={styles.content}>
        <View style={styles.promptContainer}>
          <Text style={styles.promptText}>{currentPrompt}</Text>
        </View>

        {!bothVoted ? (
          <View style={styles.votingContainer}>
            <TouchableOpacity
              style={[styles.voteButton, hasVoted && styles.voteButtonDisabled]}
              onPress={() => handleVote('user1')}
              disabled={hasVoted}>
              <Text style={styles.voteButtonText}>
                {user?.id === partnership?.userId1 ? 'You' : user?.name}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.voteButton, hasVoted && styles.voteButtonDisabled]}
              onPress={() => handleVote('user2')}
              disabled={hasVoted}>
              <Text style={styles.voteButtonText}>
                {user?.id === partnership?.userId1 ? partnerName : 'You'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View style={[styles.resultContainer, {opacity: fadeAnim}]}>
            <Text style={styles.resultTitle}>
              {isAgreement ? 'You Agree! 🎉' : "You Don't Agree 😄"}
            </Text>
            <View style={styles.scoreContainer}>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Agreements:</Text>
                <Text style={styles.scoreValue}>{gameState.agreements}</Text>
              </View>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Disagreements:</Text>
                <Text style={styles.scoreValue}>{gameState.disagreements}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleNextQuestion}>
              <Text style={styles.nextButtonText}>Next Question</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
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
    justifyContent: 'center',
  },
  promptContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
  },
  promptText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  votingContainer: {
    gap: theme.spacing.base,
  },
  voteButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  voteButtonDisabled: {
    opacity: 0.5,
  },
  voteButtonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
  resultContainer: {
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  scoreContainer: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  scoreLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  scoreValue: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  nextButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  nextButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
});
