/**
 * What You Saying Game Screen
 * Describe and guess game
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {GameHeader, GameTimer} from '@components/games';
import {createGameState, subscribeToGameState, updateGameState} from '@services/gameStateService';
import {saveGameScore} from '@services/gameScoreService';
import {recordActivity} from '@services/streaks';
import {getUserById} from '@services/authService';
import {MainStackParamList, WhatYouSayingState} from '@utils/types';
import {theme} from '@theme';
import wordsData from '@data/games/whatYouSayingWords.json';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'WhatYouSaying'>;

interface GameWord {
  word: string;
  difficulty: string;
}

export const WhatYouSayingScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [gameState, setGameState] = useState<WhatYouSayingState | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [isLoading, setIsLoading] = useState(true);
  const [guess, setGuess] = useState('');
  const [hint, setHint] = useState('');

  const words = wordsData as GameWord[];

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

        const shuffledWords = [...words].sort(() => Math.random() - 0.5);
        const isUser1 = user.id === partnership.userId1;
        const initialState: WhatYouSayingState = {
          round: 1,
          currentWordIndex: 0,
          describerId: isUser1 ? user.id : partnerId,
          guesserId: isUser1 ? partnerId : user.id,
          user1Correct: 0,
          user2Correct: 0,
          words: shuffledWords.slice(0, 5),
        };

        const newGameState = await createGameState(
          partnership.id,
          'what_you_saying',
          initialState,
        );
        setGameId(newGameState.id);
        setGameState(initialState);

        const unsubscribe = subscribeToGameState(newGameState.id, (state) => {
          if (state) {
            const gameStateData = state.state as WhatYouSayingState;
            setGameState(gameStateData);
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

  const handleGuess = async () => {
    if (!gameId || !gameState || !user || !partnership || !guess.trim()) return;

    const currentWord = gameState.words[gameState.currentWordIndex];
    const isCorrect = guess.trim().toUpperCase() === currentWord.word.toUpperCase();

    if (isCorrect) {
      const isUser1 = user.id === partnership.userId1;
      const isGuesser = user.id === gameState.guesserId;
      
      if (isGuesser) {
        const newUser1Correct = isUser1 
          ? gameState.user1Correct + 1 
          : gameState.user1Correct;
        const newUser2Correct = !isUser1 
          ? gameState.user2Correct + 1 
          : gameState.user2Correct;

        const newState: WhatYouSayingState = {
          ...gameState,
          user1Correct: newUser1Correct,
          user2Correct: newUser2Correct,
          round: gameState.round + 1,
          currentWordIndex: gameState.currentWordIndex + 1,
          describerId: gameState.guesserId,
          guesserId: gameState.describerId,
          guess: undefined,
        };

        await updateGameState(gameId, {state: newState});
        setGuess('');

        if (newState.round > 5) {
          // Game complete
          try {
            const totalCorrect = isUser1 ? newUser1Correct : newUser2Correct;
            await saveGameScore({
              gameType: 'what_you_saying',
              partnershipId: partnership.id,
              userId: user.id,
              score: totalCorrect,
            });
            await recordActivity(partnership.id);
          } catch (error) {
            console.error('Error saving score:', error);
          }

          Alert.alert(
            'Game Complete!',
            `You got ${isUser1 ? newUser1Correct : newUser2Correct} correct!`,
            [
              {
                text: 'Back to Games',
                onPress: () => navigation.goBack(),
              },
            ],
          );
        }
      }
    } else {
      Alert.alert('Incorrect', 'Try again!');
    }
  };

  const handleSendHint = async () => {
    if (!gameId || !gameState || !hint.trim()) return;

    await updateGameState(gameId, {
      state: {
        ...gameState,
        // Store hint in metadata or separate field
      },
    });
  };

  if (isLoading || !gameState) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const currentWord = gameState.words[gameState.currentWordIndex];
  const isUser1 = user?.id === partnership?.userId1;
  const isDescriber = user?.id === gameState.describerId;
  const myCorrect = isUser1 ? gameState.user1Correct : gameState.user2Correct;
  const partnerCorrect = isUser1 ? gameState.user2Correct : gameState.user1Correct;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GameHeader
        title="What You Saying?"
        onBack={() => navigation.goBack()}
        showScore
        score={myCorrect}
      />

      <View style={styles.content}>
        <View style={styles.scoresContainer}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>You</Text>
            <Text style={styles.scoreValue}>{myCorrect}</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>{partnerName}</Text>
            <Text style={styles.scoreValue}>{partnerCorrect}</Text>
          </View>
        </View>

        {isDescriber ? (
          <View style={styles.describerContainer}>
            <Text style={styles.roleLabel}>You are describing:</Text>
            <Text style={styles.wordText}>{currentWord.word}</Text>
            <Text style={styles.instruction}>
              Describe this word to your partner without saying it!
            </Text>
            <View style={styles.hintContainer}>
              <TextInput
                style={styles.hintInput}
                value={hint}
                onChangeText={setHint}
                placeholder="Send a hint (optional)"
                multiline
              />
              <TouchableOpacity style={styles.hintButton} onPress={handleSendHint}>
                <Text style={styles.hintButtonText}>Send Hint</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.guesserContainer}>
            <Text style={styles.roleLabel}>Your partner is describing a word</Text>
            <Text style={styles.instruction}>Guess what they're describing!</Text>
            <TextInput
              style={styles.guessInput}
              value={guess}
              onChangeText={setGuess}
              placeholder="Enter your guess"
              autoCapitalize="words"
              onSubmitEditing={handleGuess}
            />
            <TouchableOpacity style={styles.guessButton} onPress={handleGuess}>
              <Text style={styles.guessButtonText}>Submit Guess</Text>
            </TouchableOpacity>
          </View>
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
  },
  scoresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.lg,
  },
  scoreCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    alignItems: 'center',
    minWidth: 100,
  },
  scoreLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  scoreValue: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  describerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guesserContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  roleLabel: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
    textAlign: 'center',
  },
  wordText: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  instruction: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  hintContainer: {
    width: '100%',
    marginTop: theme.spacing.lg,
  },
  hintInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hintButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  hintButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
  guessInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  guessButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  guessButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
});
