/**
 * Perfect Pair Game Screen
 * Memory matching game
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
import {GameHeader, GameResultModal, GameTimer} from '@components/games';
import {createGameState, subscribeToGameState, updateGameState, endGameSession} from '@services/gameStateService';
import {saveGameScore} from '@services/gameScoreService';
import {recordActivity} from '@services/streaks';
import {getUserById} from '@services/authService';
import {MainStackParamList, PerfectPairState} from '@utils/types';
import {theme} from '@theme';

type NavigationProp = NativeStackNavigationProp<MainStackParamList, 'PerfectPair'>;

const EMOJI_PAIRS = ['💕', '🌹', '💍', '💑', '🎂', '🎁', '💐', '💒'];

interface Card {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const shuffleCards = (): Card[] => {
  const pairs = [...EMOJI_PAIRS, ...EMOJI_PAIRS];
  const cards: Card[] = pairs.map((emoji, index) => ({
    id: index,
    emoji,
    isFlipped: false,
    isMatched: false,
  }));
  
  // Shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  
  return cards;
};

export const PerfectPairScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [gameState, setGameState] = useState<PerfectPairState | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string>('Partner');
  const [isLoading, setIsLoading] = useState(true);
  const [showResultModal, setShowResultModal] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [gameTimeElapsed, setGameTimeElapsed] = useState(0);

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

        const cards = shuffleCards();
        const initialState: PerfectPairState = {
          cards,
          flippedCards: [],
          user1Moves: 0,
          user2Moves: 0,
          currentPlayerId: user.id,
          isComplete: false,
          startTime: new Date().toISOString(),
        };

        const newGameState = await createGameState(
          partnership.id,
          'perfect_pair',
          initialState,
        );
        setGameId(newGameState.id);
        setGameState(initialState);

        const unsubscribe = subscribeToGameState(newGameState.id, (state) => {
          if (state) {
            const gameStateData = state.state as PerfectPairState;
            setGameState(gameStateData);

            if (gameStateData.isComplete) {
              if (gameStateData.startTime) {
                const startTimeMs = new Date(gameStateData.startTime).getTime();
                const endTime = Date.now();
                const elapsed = Math.floor((endTime - startTimeMs) / 1000);
                setGameTimeElapsed(elapsed);
              }
              setShowResultModal(true);
            }
            if (gameStateData.currentPlayerId) {
              setTimerPaused(gameStateData.currentPlayerId !== user.id);
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

  const handleCardPress = async (cardId: number) => {
    if (!gameId || !gameState || !user || !partnership) return;

    if (gameState.currentPlayerId !== user.id) {
      return; // Not your turn
    }

    const card = gameState.cards.find(c => c.id === cardId);
    if (!card || card.isFlipped || card.isMatched) {
      return;
    }

    const newFlippedCards = [...gameState.flippedCards, cardId];
    const newCards = gameState.cards.map(c =>
      c.id === cardId ? {...c, isFlipped: true} : c,
    );

    const isUser1 = user.id === partnership.userId1;
    const newUser1Moves = isUser1 ? gameState.user1Moves + 1 : gameState.user1Moves;
    const newUser2Moves = !isUser1 ? gameState.user2Moves + 1 : gameState.user2Moves;

    // Check for match
    if (newFlippedCards.length === 2) {
      const [card1Id, card2Id] = newFlippedCards;
      const card1 = newCards.find(c => c.id === card1Id);
      const card2 = newCards.find(c => c.id === card2Id);

      if (card1 && card2 && card1.emoji === card2.emoji) {
        // Match found
        const matchedCards = newCards.map(c =>
          c.id === card1Id || c.id === card2Id ? {...c, isMatched: true, isFlipped: true} : c,
        );

        const allMatched = matchedCards.every(c => c.isMatched);
        const newState: PerfectPairState = {
          ...gameState,
          cards: matchedCards,
          flippedCards: [],
          user1Moves: newUser1Moves,
          user2Moves: newUser2Moves,
          isComplete: allMatched,
        };

        await updateGameState(gameId, {state: newState});

        if (allMatched) {
          if (gameState.startTime) {
            const startTimeMs = new Date(gameState.startTime).getTime();
            const endTime = Date.now();
            const timeElapsed = Math.floor((endTime - startTimeMs) / 1000);
            setGameTimeElapsed(timeElapsed);
            const isUser1 = user.id === partnership.userId1;
            
            // Time bonus: faster completion = higher score multiplier
            const timeBonus = Math.max(1, 2 - (timeElapsed / 300)); // Max 2x bonus at 0 seconds
            const baseScore = 1000;
            const finalScore = Math.floor(baseScore * timeBonus);
            
            try {
              await saveGameScore({
                gameType: 'perfect_pair',
                partnershipId: partnership.id,
                userId: user.id,
                score: finalScore,
                metadata: {
                  time: timeElapsed,
                  moves: isUser1 ? newUser1Moves : newUser2Moves,
                  timeBonus: timeBonus.toFixed(2),
                },
              });
              await recordActivity(partnership.id);
            } catch (error) {
              console.error('Error saving score:', error);
            }
          }
        }
      } else {
        // No match - first update immediately to show both cards flipped
        const immediateState: PerfectPairState = {
          ...gameState,
          cards: newCards,
          flippedCards: newFlippedCards,
          user1Moves: newUser1Moves,
          user2Moves: newUser2Moves,
        };
        await updateGameState(gameId, {state: immediateState}, true);

        // Then flip back after delay
        setTimeout(async () => {
          const flippedBackCards = newCards.map(c =>
            newFlippedCards.includes(c.id) && !c.isMatched
              ? {...c, isFlipped: false}
              : c,
          );

          const partnerId = user.id === partnership.userId1 
            ? partnership.userId2 
            : partnership.userId1;

          const newState: PerfectPairState = {
            ...gameState,
            cards: flippedBackCards,
            flippedCards: [],
            user1Moves: newUser1Moves,
            user2Moves: newUser2Moves,
            currentPlayerId: partnerId,
          };

          await updateGameState(gameId, {state: newState}, true);
        }, 1000);
      }
    } else {
      // First card flipped
      const newState: PerfectPairState = {
        ...gameState,
        cards: newCards,
        flippedCards: newFlippedCards,
        user1Moves: newUser1Moves,
        user2Moves: newUser2Moves,
      };
      await updateGameState(gameId, {state: newState}, true);
    }
  };

  const handleTimeUp = async () => {
    if (!gameId || !gameState || !user || !partnership) return;

    // Mark game as complete
    const finalState: PerfectPairState = {
      ...gameState,
      isComplete: true,
    };

    await updateGameState(gameId, {state: finalState}, true);

    // Calculate final score
    if (gameState.startTime) {
      const startTimeMs = new Date(gameState.startTime).getTime();
      const endTime = Date.now();
      const timeElapsed = Math.floor((endTime - startTimeMs) / 1000);
      setGameTimeElapsed(timeElapsed);
      
      const isUser1 = user.id === partnership.userId1;
      const myMoves = isUser1 ? gameState.user1Moves : gameState.user2Moves;
      
      try {
        await saveGameScore({
          gameType: 'perfect_pair',
          partnershipId: partnership.id,
          userId: user.id,
          score: 0, // Time up - no score
          metadata: {
            time: timeElapsed,
            moves: myMoves,
            reason: 'time_up',
          },
        });
      } catch (error) {
        console.error('Error saving score:', error);
      }
    }

    setShowResultModal(true);
  };

  const handlePlayAgain = () => {
    setShowResultModal(false);
    // Reset game
    if (gameId && gameState && user && partnership) {
      const cards = shuffleCards();
        const initialState: PerfectPairState = {
          cards,
          flippedCards: [],
          user1Moves: 0,
          user2Moves: 0,
          currentPlayerId: user.id,
          isComplete: false,
          startTime: new Date().toISOString(),
        };
        updateGameState(gameId, {state: initialState});
        setGameTimeElapsed(0);
        setTimerPaused(false);
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
  const isUser1 = user?.id === partnership?.userId1;
  const myMoves = isUser1 ? gameState.user1Moves : gameState.user2Moves;
  const partnerMoves = isUser1 ? gameState.user2Moves : gameState.user1Moves;
  const timeElapsed = gameState.startTime 
    ? Math.floor((Date.now() - new Date(gameState.startTime).getTime()) / 1000)
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GameHeader
        title="Perfect Pair"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.content}>
        <View style={styles.infoContainer}>
          <Text style={styles.turnText}>
            {isMyTurn ? 'Your Turn' : `${partnerName}'s Turn`}
          </Text>
        </View>
        
        <GameTimer
          duration={300}
          onComplete={handleTimeUp}
          paused={timerPaused || !isMyTurn}
        />

        <View style={styles.board}>
          {gameState.cards.map((card, index) => (
            <TouchableOpacity
              key={card.id}
              style={[
                styles.card,
                card.isFlipped && styles.cardFlipped,
                card.isMatched && styles.cardMatched,
              ]}
              onPress={() => handleCardPress(card.id)}
              disabled={!isMyTurn || card.isMatched}>
              <Text style={styles.cardText}>
                {card.isFlipped || card.isMatched ? card.emoji : '?'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Your Moves</Text>
            <Text style={styles.statValue}>{myMoves}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{partnerName}'s Moves</Text>
            <Text style={styles.statValue}>{partnerMoves}</Text>
          </View>
        </View>
      </View>

      <GameResultModal
        visible={showResultModal}
        winner={user?.id}
        scores={[
          {userId: user!.id, score: gameTimeElapsed > 0 ? Math.floor(1000 * Math.max(1, 2 - (gameTimeElapsed / 300))) : 0, name: 'You'},
          {userId: partnership!.userId1 === user!.id ? partnership!.userId2 : partnership!.userId1, score: 0, name: partnerName},
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
  },
  infoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.base,
  },
  turnText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  timeText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.base,
  },
  card: {
    width: 70,
    height: 70,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  cardFlipped: {
    backgroundColor: theme.colors.backgroundDark,
  },
  cardMatched: {
    backgroundColor: theme.colors.primary,
    opacity: 0.7,
  },
  cardText: {
    fontSize: 32,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  statValue: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
});
