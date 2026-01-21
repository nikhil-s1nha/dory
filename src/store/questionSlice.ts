/**
 * Question state slice
 * Manages question state, answers, and real-time sync
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Question, Answer} from '@utils/types';
import {
  getDailyQuestion,
  getRandomQuestion,
  submitAnswer as submitAnswerService,
  skipQuestion,
  subscribeToAnswers,
  addReaction as addReactionService,
} from '@services/questionService';
import {recordActivity} from '@services/streaks';
import {useAuthStore} from './authSlice';
import {
  getAdaptiveQuestion,
  trackQuestionInteraction,
} from '@utils/questionFiltering';
import {getRandomQuestion as getRandomFromLoader} from '@utils/questionLoader';

interface QuestionState {
  currentQuestion: Question | null;
  questionHistory: Question[];
  userAnswer: Answer | null;
  partnerAnswer: Answer | null;
  isRevealed: boolean;
  isLoading: boolean;
  selectedDeck: string | null;
  unsubscribeAnswers: (() => void) | null;

  // Actions
  loadDailyQuestion: (partnershipId: string) => Promise<void>;
  loadRandomQuestion: (
    partnershipId: string,
    deckId?: string,
  ) => Promise<void>;
  submitAnswer: (
    answer: Omit<Answer, 'id' | 'createdAt' | 'updatedAt' | 'isRevealed'>,
  ) => Promise<void>;
  skipCurrentQuestion: (partnershipId: string) => Promise<void>;
  skipQuestionById: (questionId: string, partnershipId: string) => Promise<void>;
  addReactionToAnswer: (
    answerId: string,
    userId: string,
    emoji: string,
  ) => Promise<void>;
  subscribeToAnswers: (questionId: string, partnershipId: string) => void;
  clearCurrentQuestion: () => void;
  setSelectedDeck: (deckId: string | null) => void;
}

export const useQuestionStore = create<QuestionState>()(
  persist(
    set => ({
      currentQuestion: null,
      questionHistory: [],
      userAnswer: null,
      partnerAnswer: null,
      isRevealed: false,
      isLoading: false,
      selectedDeck: null,
      unsubscribeAnswers: null,

      loadDailyQuestion: async (partnershipId: string) => {
        set({isLoading: true});
        try {
          const question = await getDailyQuestion(partnershipId);
          if (question) {
            set({
              currentQuestion: question,
              isLoading: false,
            });
            // Subscribe to answers for this question
            useQuestionStore.getState().subscribeToAnswers(
              question.id,
              partnershipId,
            );
          } else {
            set({isLoading: false});
          }
        } catch (error) {
          console.error('Error loading daily question:', error);
          set({isLoading: false});
        }
      },

      loadRandomQuestion: async (
        partnershipId: string,
        deckId?: string,
      ) => {
        set({isLoading: true});
        try {
          const userId = useAuthStore.getState().user?.id || '';
          const currentId = useQuestionStore.getState().currentQuestion?.id;
          const excludeIds = currentId ? [currentId] : [];

          let question: Question | null = null;

          // Use adaptive question selection if no specific deck is selected
          if (!deckId) {
            question = await getAdaptiveQuestion(partnershipId, userId);
          } else {
            // For deck-specific questions, use the loader utility
            question = getRandomFromLoader(undefined, deckId, excludeIds);
          }

          // Fallback to service method if adaptive/questionLoader didn't return a question
          if (!question) {
            question = await getRandomQuestion(partnershipId, excludeIds);
          }

          if (question) {
            const history = useQuestionStore.getState().questionHistory;
            const newHistory = [question, ...history].slice(0, 10); // Keep last 10

            set({
              currentQuestion: question,
              questionHistory: newHistory,
              userAnswer: null,
              partnerAnswer: null,
              isRevealed: false,
              isLoading: false,
            });

            // Subscribe to answers for this question
            useQuestionStore.getState().subscribeToAnswers(
              question.id,
              partnershipId,
            );
          } else {
            set({isLoading: false});
          }
        } catch (error) {
          console.error('Error loading random question:', error);
          set({isLoading: false});
        }
      },

      submitAnswer: async answer => {
        try {
          const submittedAnswer = await submitAnswerService(answer);

          // Track interaction for adaptive filtering
          await trackQuestionInteraction(
            answer.partnershipId,
            answer.questionId,
            'answered',
          );

          // Update state based on which user submitted
          const state = useQuestionStore.getState();
          const userId = answer.userId;

          const newUserAnswer = submittedAnswer.userId === userId ? submittedAnswer : state.userAnswer;
          const newPartnerAnswer = submittedAnswer.userId !== userId ? submittedAnswer : state.partnerAnswer;

          set({
            userAnswer: newUserAnswer,
            partnerAnswer: newPartnerAnswer,
          });

          // Check if both partners have answered - recordActivity will be called when both are revealed
          // via the subscribeToAnswers callback, so we don't need to call it here
        } catch (error) {
          console.error('Error submitting answer:', error);
          throw error;
        }
      },

      skipCurrentQuestion: async (partnershipId: string) => {
        const currentQuestion = useQuestionStore.getState().currentQuestion;
        if (!currentQuestion) return;

        try {
          await skipQuestion(partnershipId, currentQuestion.id);
          
          // Track interaction for adaptive filtering
          await trackQuestionInteraction(
            partnershipId,
            currentQuestion.id,
            'skipped',
          );
          
          // Clear current question after skip
          useQuestionStore.getState().clearCurrentQuestion();
        } catch (error) {
          console.error('Error skipping question:', error);
        }
      },

      skipQuestionById: async (questionId: string, partnershipId: string) => {
        try {
          await skipQuestion(partnershipId, questionId);
          
          // Track interaction for adaptive filtering
          await trackQuestionInteraction(partnershipId, questionId, 'skipped');
          
          // Don't clear currentQuestion - this is for skipping deck cards
        } catch (error) {
          console.error('Error skipping question by ID:', error);
        }
      },

      addReactionToAnswer: async (answerId: string, userId: string, emoji: string) => {
        try {
          const reaction = {
            userId,
            emoji,
            createdAt: new Date().toISOString(),
          };
          await addReactionService(answerId, reaction);

          // Update local state
          const state = useQuestionStore.getState();
          if (state.userAnswer?.id === answerId) {
            const updatedReactions = [...(state.userAnswer.reactions || []), reaction];
            set({
              userAnswer: {
                ...state.userAnswer,
                reactions: updatedReactions,
              },
            });
          } else if (state.partnerAnswer?.id === answerId) {
            const updatedReactions = [...(state.partnerAnswer.reactions || []), reaction];
            set({
              partnerAnswer: {
                ...state.partnerAnswer,
                reactions: updatedReactions,
              },
            });
          }
        } catch (error) {
          console.error('Error adding reaction:', error);
        }
      },

      subscribeToAnswers: (questionId: string, partnershipId: string) => {
        // Unsubscribe from previous subscription if exists
        const currentUnsubscribe = useQuestionStore.getState().unsubscribeAnswers;
        if (currentUnsubscribe) {
          currentUnsubscribe();
        }

        const userId = useAuthStore.getState().user?.id || '';

        const unsubscribe = subscribeToAnswers(
          questionId,
          partnershipId,
          async answers => {
            // Determine which answer is user's and which is partner's
            const userAnswer = answers.find(a => a.userId === userId) || null;
            const partnerAnswer = answers.find(a => a.userId !== userId) || null;

            // Check if both answers are revealed
            const isRevealed =
              userAnswer?.isRevealed && partnerAnswer?.isRevealed;

            set({
              userAnswer,
              partnerAnswer,
              isRevealed,
            });

            // If both partners have answered and revealed, record activity for streak
            if (isRevealed && userAnswer && partnerAnswer) {
              try {
                await recordActivity(partnershipId, questionId);
              } catch (error) {
                console.error('Error recording streak activity:', error);
              }
            }
          },
        );

        set({unsubscribeAnswers: unsubscribe});
      },

      clearCurrentQuestion: () => {
        // Unsubscribe from answers
        const unsubscribe = useQuestionStore.getState().unsubscribeAnswers;
        if (unsubscribe) {
          unsubscribe();
        }

        set({
          currentQuestion: null,
          userAnswer: null,
          partnerAnswer: null,
          isRevealed: false,
          unsubscribeAnswers: null,
        });
      },

      setSelectedDeck: (deckId: string | null) => {
        set({selectedDeck: deckId});
      },
    }),
    {
      name: 'question-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        selectedDeck: state.selectedDeck,
        questionHistory: state.questionHistory,
      }),
    },
  ),
);
