/**
 * Answer Reveal Component
 * Shows both partners' answers side-by-side with reactions
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {Answer, Question} from '@utils/types';
import {theme} from '@theme';
import {AnswerCard} from './AnswerCard';
import {ReactionPicker} from './ReactionPicker';

interface AnswerRevealProps {
  userAnswer: Answer;
  partnerAnswer: Answer | null;
  question: Question;
  userName: string;
  partnerName: string;
  currentUserId: string;
  onAddReaction: (answerId: string, emoji: string) => void;
  onContinueDiscussion?: () => void;
}

export const AnswerReveal: React.FC<AnswerRevealProps> = ({
  userAnswer,
  partnerAnswer,
  question,
  userName,
  partnerName,
  currentUserId,
  onAddReaction,
  onContinueDiscussion,
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // Fade-in reveal animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleQuickReact = (answerId: string, emoji: string) => {
    onAddReaction(answerId, emoji);
  };

  const handleLongPressReact = (answerId: string) => {
    setSelectedAnswerId(answerId);
    setShowReactionPicker(true);
  };

  const handleReactionSelect = (emoji: string) => {
    if (selectedAnswerId) {
      onAddReaction(selectedAnswerId, emoji);
    }
    setShowReactionPicker(false);
    setSelectedAnswerId(null);
  };

  return (
    <Animated.View style={[styles.container, {opacity: fadeAnim}]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Question */}
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>{question.text}</Text>
        </View>

        {/* Answers */}
        <View style={styles.answersContainer}>
          {/* User's Answer */}
          <View style={styles.answerColumn}>
            <Text style={styles.answerLabel}>Your Answer</Text>
            <AnswerCard
              answer={userAnswer}
              userName={userName}
              onReact={(emoji: string) => handleQuickReact(userAnswer.id, emoji)}
              onLongPressReact={() => handleLongPressReact(userAnswer.id)}
              showReactions={true}
              isCurrentUser={true}
              currentUserId={currentUserId}
            />
          </View>

          {/* Partner's Answer */}
          {partnerAnswer && (
            <View style={styles.answerColumn}>
              <Text style={styles.answerLabel}>{partnerName}'s Answer</Text>
              <AnswerCard
                answer={partnerAnswer}
                userName={partnerName}
                onReact={(emoji: string) =>
                  handleQuickReact(partnerAnswer.id, emoji)
                }
                onLongPressReact={() => handleLongPressReact(partnerAnswer.id)}
                showReactions={true}
                isCurrentUser={false}
                currentUserId={currentUserId}
              />
            </View>
          )}

          {!partnerAnswer && (
            <View style={styles.waitingContainer}>
              <Text style={styles.waitingText}>
                Waiting for {partnerName} to answer...
              </Text>
            </View>
          )}
        </View>

        {/* Continue Discussion Button */}
        {partnerAnswer && onContinueDiscussion && (
          <TouchableOpacity
            style={styles.continueButton}
            onPress={onContinueDiscussion}>
            <MaterialCommunityIcons
              name="message-text"
              size={20}
              color={theme.colors.textInverse}
            />
            <Text style={styles.continueButtonText}>Continue Discussion</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Reaction Picker Modal */}
      {showReactionPicker && (
        <ReactionPicker
          visible={showReactionPicker}
          onSelect={handleReactionSelect}
          onClose={() => {
            setShowReactionPicker(false);
            setSelectedAnswerId(null);
          }}
        />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  questionContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  questionText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  answersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  answerColumn: {
    width: '48%',
    marginBottom: theme.spacing.base,
  },
  answerLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  waitingContainer: {
    width: '100%',
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  waitingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  continueButton: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.xl,
  },
  continueButtonText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    marginLeft: theme.spacing.sm,
  },
});
