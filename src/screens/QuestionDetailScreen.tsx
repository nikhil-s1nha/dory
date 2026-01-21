/**
 * Question Detail Screen
 * Full-screen view for answering a question
 */

import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {Question, Answer} from '@utils/types';
import {useQuestionStore} from '@store/questionSlice';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {AnswerInput} from '@components/questions/AnswerInput';
import {AnswerReveal} from '@components/questions/AnswerReveal';
import {WaitingForPartner} from '@components/questions/WaitingForPartner';

interface QuestionDetailRouteParams {
  questionId?: string;
  question?: Question;
}

export const QuestionDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as QuestionDetailRouteParams;

  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const {
    currentQuestion,
    userAnswer,
    partnerAnswer,
    isRevealed,
    isLoading,
    submitAnswer,
    subscribeToAnswers,
  } = useQuestionStore();

  const question = params.question || currentQuestion;

  useEffect(() => {
    if (question && partnership) {
      subscribeToAnswers(question.id, partnership.id);
    }
  }, [question, partnership, subscribeToAnswers]);

  const handleSubmit = async (answerText: string, mediaUrl?: string) => {
    if (!question || !user || !partnership) return;

    try {
      await submitAnswer({
        questionId: question.id,
        userId: user.id,
        partnershipId: partnership.id,
        text: answerText,
        type: question.type === 'photo' ? 'photo' : question.type === 'voice' ? 'voice' : 'text',
        mediaUrl,
        reactions: [],
      });
    } catch (error) {
      console.error('Error submitting answer:', error);
    }
  };

  const handleSkip = async () => {
    if (!partnership || !question) return;
    
    try {
      await useQuestionStore.getState().skipCurrentQuestion(partnership.id);
      navigation.goBack();
    } catch (error) {
      console.error('Error skipping question:', error);
    }
  };

  const handleContinueDiscussion = () => {
    // Navigate to chat screen with question context
    navigation.navigate('Chat' as any, {
      questionId: question?.id,
      question: question,
    });
  };

  if (!question) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading question...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const partnerId = partnership?.userId1 === user?.id ? partnership?.userId2 : partnership?.userId1;
  const partnerName = 'Partner'; // Would get from user data in production

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>
            {question.category.charAt(0).toUpperCase() +
              question.category.slice(1).replace(/_/g, ' ')}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Question Text */}
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>{question.text}</Text>
        </View>

        {/* Answer State */}
        {!userAnswer ? (
          // Show input
          <View style={styles.inputContainer}>
            <AnswerInput
              question={question}
              onSubmit={handleSubmit}
              disabled={isLoading}
            />
          </View>
        ) : !partnerAnswer || !isRevealed ? (
          // Waiting for partner
          <WaitingForPartner
            partnerName={partnerName}
            userAnswer={userAnswer.text}
          />
        ) : (
          // Show reveal
          <AnswerReveal
            userAnswer={userAnswer}
            partnerAnswer={partnerAnswer}
            question={question}
            userName={user?.name || 'You'}
            partnerName={partnerName}
            currentUserId={user?.id || ''}
            onAddReaction={async (answerId, emoji) => {
              if (user) {
                await useQuestionStore.getState().addReactionToAnswer(
                  answerId,
                  user.id,
                  emoji,
                );
              }
            }}
            onContinueDiscussion={handleContinueDiscussion}
          />
        )}

        {/* Skip Button */}
        {!userAnswer && (
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Skip this question</Text>
          </TouchableOpacity>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.sm,
  },
  categoryText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primaryDark,
  },
  scrollView: {
    flex: 1,
  },
  questionContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  questionText: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeight.tight * theme.typography.fontSize['2xl'],
  },
  inputContainer: {
    paddingHorizontal: theme.spacing.base,
    paddingBottom: theme.spacing.base,
  },
  skipButton: {
    padding: theme.spacing.base,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  skipButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  bottomSpacing: {
    height: theme.spacing['2xl'],
  },
});
