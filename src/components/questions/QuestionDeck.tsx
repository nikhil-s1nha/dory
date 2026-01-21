/**
 * Question Deck Component
 * Container that manages a stack of question cards
 */

import React, {useState, useEffect} from 'react';
import {View, StyleSheet, Text} from 'react-native';
import {QuestionCard} from './QuestionCard';
import {Question} from '@utils/types';
import {theme} from '@theme';

interface QuestionDeckProps {
  questions: Question[];
  onAnswerQuestion: (question: Question) => void;
  onSkipQuestion: (question: Question) => void;
}

export const QuestionDeck: React.FC<QuestionDeckProps> = ({
  questions,
  onAnswerQuestion,
  onSkipQuestion,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleCards, setVisibleCards] = useState<Question[]>([]);

  useEffect(() => {
    // Show current question and 2 cards behind for depth
    const visible = questions.slice(currentIndex, currentIndex + 3);
    setVisibleCards(visible);
  }, [questions, currentIndex]);

  const handleSwipeRight = () => {
    const currentQuestion = questions[currentIndex];
    if (currentQuestion) {
      onAnswerQuestion(currentQuestion);
    }
    moveToNext();
  };

  const handleSwipeLeft = () => {
    const currentQuestion = questions[currentIndex];
    if (currentQuestion) {
      onSkipQuestion(currentQuestion);
    }
    moveToNext();
  };

  const moveToNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (questions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No more questions available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {visibleCards.map((question, index) => {
        const isTopCard = index === 0;
        const cardIndex = currentIndex + index;

        return (
          <View
            key={question.id}
            style={[
              styles.cardWrapper,
              {
                zIndex: visibleCards.length - index,
                opacity: index > 2 ? 0 : 1,
                transform: [
                  {scale: 1 - index * 0.05},
                  {translateY: index * 8},
                ],
              },
            ]}>
            <QuestionCard
              question={question}
              onSwipeLeft={isTopCard ? handleSwipeLeft : undefined}
              onSwipeRight={isTopCard ? handleSwipeRight : undefined}
              swipeable={isTopCard}
            />
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300,
    position: 'relative',
  },
  cardWrapper: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  emptyContainer: {
    width: '100%',
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
