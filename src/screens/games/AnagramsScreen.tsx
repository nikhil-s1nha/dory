/**
 * Anagrams Game Screen
 * Unscramble words with timer
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
import {createGameState, subscribeToGameState, updateGameState, endGameSession} from '@services/gameStateService';
import {saveGameScore} from '@services/gameScoreService';
import {recordActivity} from '@services/streaks';
import {getUserById} from '@services/authService';
import {MainStackParamList, AnagramsState} from '@utils/types';
import {theme} from '@theme';
import wordsData from '@data/games/anagramWords.json';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'Anagrams'>;

interface AnagramWord {
  word: string;
  scrambled: string;
  hint: string;
}

export const AnagramsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [gameState, setGameState] = useState<AnagramsState | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [isLoading, setIsLoading] = useState(true);
  const [guess, setGuess] = useState('');
  const [wordsSolved, setWordsSolved] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(60);

  const words = wordsData as AnagramWord[];

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
        const initialState: AnagramsState = {
          currentWordIndex: 0,
          user1Score: 0,
          user2Score: 0,
          words: shuffledWords.slice(0, 20),
        };

        const newGameState = await createGameState(
          partnership.id,
          'anagrams',
          initialState,
        );
        setGameId(newGameState.id);
        setGameState(initialState);
        setTimeRemaining(60);

        const unsubscribe = subscribeToGameState(newGameState.id, (state) => {
          if (state) {
            const gameStateData = state.state as AnagramsState;
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

  useEffect(() => {
    if (timeRemaining <= 0 && gameState) {
      handleTimeUp();
    }
  }, [timeRemaining]);

  const handleTimeUp = async () => {
    if (!gameId || !gameState || !user || !partnership) return;

    const isUser1 = user.id === partnership.userId1;
    const userScore = isUser1 ? gameState.user1Score : gameState.user2Score;

    try {
      await saveGameScore({
        gameType: 'anagrams',
        partnershipId: partnership.id,
        userId: user.id,
        score: userScore,
        metadata: {
          wordsSolved,
        },
      });

      if (wordsSolved >= 5) {
        await recordActivity(partnership.id);
      }
    } catch (error) {
      console.error('Error saving score:', error);
    }

    Alert.alert(
      'Time\'s Up!',
      `You solved ${wordsSolved} words!`,
      [
        {
          text: 'Back to Games',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  };

  const handleGuess = async () => {
    if (!gameId || !gameState || !user || !partnership || !guess.trim()) return;

    const currentWord = gameState.words[gameState.currentWordIndex];
    const isCorrect = guess.trim().toUpperCase() === currentWord.word.toUpperCase();

    if (isCorrect) {
      const isUser1 = user.id === partnership.userId1;
      const newUser1Score = isUser1 
        ? gameState.user1Score + 10 
        : gameState.user1Score;
      const newUser2Score = !isUser1 
        ? gameState.user2Score + 10 
        : gameState.user2Score;
      const newWordsSolved = wordsSolved + 1;

      setWordsSolved(newWordsSolved);

      // Record activity after 5 words
      if (newWordsSolved === 5) {
        try {
          await recordActivity(partnership.id);
        } catch (error) {
          console.error('Error recording activity:', error);
        }
      }

      const newState: AnagramsState = {
        ...gameState,
        currentWordIndex: gameState.currentWordIndex + 1,
        user1Score: newUser1Score,
        user2Score: newUser2Score,
      };

      await updateGameState(gameId, {state: newState});
      setGuess('');

      if (newState.currentWordIndex >= newState.words.length) {
        // Game complete
        Alert.alert(
          'Game Complete!',
          `You solved all words! Final score: ${isUser1 ? newUser1Score : newUser2Score}`,
          [
            {
              text: 'Back to Games',
              onPress: () => navigation.goBack(),
            },
          ],
        );
      }
    } else {
      Alert.alert('Incorrect', 'Try again!');
    }
  };

  const handleSkip = async () => {
    if (!gameId || !gameState) return;

    const newState: AnagramsState = {
      ...gameState,
      currentWordIndex: gameState.currentWordIndex + 1,
    };

    await updateGameState(gameId, {state: newState});
    setGuess('');

    if (newState.currentWordIndex >= newState.words.length) {
      navigation.goBack();
    }
  };

  const handleShuffle = () => {
    if (!gameState) return;
    const currentWord = gameState.words[gameState.currentWordIndex];
    const shuffled = currentWord.scrambled.split('').sort(() => Math.random() - 0.5).join('');
    // Update local display only
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
  const myScore = isUser1 ? gameState.user1Score : gameState.user2Score;
  const partnerScore = isUser1 ? gameState.user2Score : gameState.user1Score;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GameHeader
        title="Anagrams"
        onBack={() => navigation.goBack()}
        showScore
        score={myScore}
        timer={timeRemaining}
      />

      <View style={styles.content}>
        <GameTimer
          duration={60}
          onComplete={handleTimeUp}
          paused={false}
        />

        <View style={styles.scoresContainer}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>You</Text>
            <Text style={styles.scoreValue}>{myScore}</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>{partnerName}</Text>
            <Text style={styles.scoreValue}>{partnerScore}</Text>
          </View>
        </View>

        <View style={styles.wordContainer}>
          <Text style={styles.scrambledWord}>{currentWord.scrambled}</Text>
          <Text style={styles.hint}>Hint: {currentWord.hint}</Text>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={guess}
            onChangeText={setGuess}
            placeholder="Enter your answer"
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={handleGuess}
          />
          <TouchableOpacity style={styles.submitButton} onPress={handleGuess}>
            <Text style={styles.submitButtonText}>Submit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShuffle}>
            <Text style={styles.actionButtonText}>Shuffle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleSkip}>
            <Text style={styles.actionButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>
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
  wordContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  scrambledWord: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 4,
    marginBottom: theme.spacing.base,
  },
  hint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  inputContainer: {
    marginBottom: theme.spacing.base,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#fff',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  actionButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
});
