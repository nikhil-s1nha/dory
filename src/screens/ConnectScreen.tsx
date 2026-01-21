/**
 * Connect Screen
 * Main hub screen with canvas widget, streak counter, daily question, and chat preview
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {usePartnershipStore} from '@store/partnershipSlice';
import {useQuestionStore} from '@store/questionSlice';
import {useAuthStore} from '@store/authSlice';
import {format, isToday, isYesterday} from 'date-fns';
import {QuestionCard} from '@components/questions/QuestionCard';
import {QuestionDeck} from '@components/questions/QuestionDeck';
import {loadAllQuestions, getRandomQuestion, loadQuestionsByDeck} from '@utils/questionLoader';
import {Question} from '@utils/types';
import {Ember} from '@components/Ember';
import {MilestoneModal} from '@components/MilestoneModal';
import {StreakOverlay} from '@components/StreakOverlay';
import {Canvas, CanvasErrorBoundary} from '@components/canvas';
import {getCurrentCanvas} from '@services/canvasService';
import {subscribeToCanvasUpdates} from '@services/canvasSync';
import {
  checkStreakStatus,
  getTimeRemaining,
  subscribeToStreakStatus,
  checkMilestone,
  restoreStreak,
  type StreakStatus,
  type MilestoneInfo,
} from '@services/streaks';
import {checkAndSendStreakReminders} from '@services/notificationSettings';
import {getUserById} from '@services/authService';
import {getDailyPrompt, subscribeToPhotoPrompt, checkBothPartnersUploaded} from '@services/photoPromptService';
import {updateDailyPhotoWidget} from '@services/widgetService';
import {PhotoPrompt, Message, Countdown} from '@utils/types';
import {subscribeToMessages} from '@services/messageService';
import {subscribeToCountdowns} from '@services/countdownService';
import {differenceInDays} from 'date-fns';

export const ConnectScreen = () => {
  const navigation = useNavigation();
  const {partnership} = usePartnershipStore();
  const {user} = useAuthStore();
  const {
    currentQuestion,
    userAnswer,
    partnerAnswer,
    isRevealed,
    isLoading: questionLoading,
    loadDailyQuestion,
    loadRandomQuestion,
    selectedDeck,
  } = useQuestionStore();
  const [refreshing, setRefreshing] = useState(false);
  const [moreQuestions, setMoreQuestions] = useState<Question[]>([]);
  const [streakStatus, setStreakStatus] = useState<StreakStatus>({
    isActive: false,
    hoursRemaining: 0,
    shouldReset: false,
  });
  const [milestone, setMilestone] = useState<MilestoneInfo | null>(null);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showStreakOverlay, setShowStreakOverlay] = useState(false);
  const [showStreakInfoModal, setShowStreakInfoModal] = useState(false);
  const [currentCanvasData, setCurrentCanvasData] = useState<string | undefined>();
  const [hasCanvasActivity, setHasCanvasActivity] = useState(false);
  const [todayPhotoPrompt, setTodayPhotoPrompt] = useState<PhotoPrompt | null>(null);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [nextCountdown, setNextCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    if (partnership && !currentQuestion) {
      loadDailyQuestion(partnership.id);
    }
  }, [partnership, currentQuestion, loadDailyQuestion]);

  // Load and subscribe to canvas
  useEffect(() => {
    if (!partnership || !user) return;

    const loadCanvas = async () => {
      try {
        const canvas = await getCurrentCanvas(partnership.id);
        if (canvas) {
          setCurrentCanvasData(canvas.drawingData);
          // Check if user has drawn today (minimum 5 strokes)
          // Simplified check: if canvas exists and has data, consider it active
          try {
            const paths = JSON.parse(canvas.drawingData);
            setHasCanvasActivity(paths.length >= 5);
          } catch {
            setHasCanvasActivity(false);
          }
        }
      } catch (error) {
        console.error('Error loading canvas:', error);
      }
    };

    loadCanvas();

    const unsubscribe = subscribeToCanvasUpdates(partnership.id, (drawing) => {
      if (drawing) {
        setCurrentCanvasData(drawing.drawingData);
      } else {
        setCurrentCanvasData(undefined);
      }
    });

    return () => unsubscribe();
  }, [partnership, user]);

  // Subscribe to streak status updates
  useEffect(() => {
    if (!partnership || !user) return;

    const unsubscribe = subscribeToStreakStatus(partnership.id, status => {
      setStreakStatus(status);
    });

    // Initial check
    const performStreakCheck = async () => {
      const status = await checkStreakStatus(partnership.id);
      setStreakStatus(status);
      
      // Check and send streak reminders after checking streak status
      if (partnership.lastActivityDate) {
        // Get partner's name
        const partnerUserId = partnership.userId1 === user.id 
          ? partnership.userId2 
          : partnership.userId1;
        
        if (partnerUserId) {
          try {
            const partnerUser = await getUserById(partnerUserId);
            const partnerName = partnerUser?.name || 'Your partner';
            
            await checkAndSendStreakReminders(
              user.id,
              partnership.id,
              partnerName,
              partnership.lastActivityDate,
            );
          } catch (error) {
            // Non-critical, don't block UI
            console.error('Error checking streak reminders:', error);
          }
        }
      }
    };

    performStreakCheck();

    return () => {
      unsubscribe();
    };
  }, [partnership, user]);

  // Check for milestone when streak count changes
  useEffect(() => {
    if (partnership && partnership.streakCount > 0) {
      const milestoneInfo = checkMilestone(partnership.streakCount);
      if (milestoneInfo.isMilestone) {
        setMilestone(milestoneInfo);
        setShowMilestoneModal(true);
      }
    }
  }, [partnership?.streakCount]);

  useEffect(() => {
    // Load questions based on selected deck or random questions
    let questions: Question[];
    if (selectedDeck) {
      questions = loadQuestionsByDeck(selectedDeck);
    } else {
      questions = loadAllQuestions();
    }
    
    const randomQuestions: Question[] = [];
    for (let i = 0; i < 5 && i < questions.length; i++) {
      const randomIndex = Math.floor(Math.random() * questions.length);
      if (!randomQuestions.find(q => q.id === questions[randomIndex].id)) {
        randomQuestions.push(questions[randomIndex]);
      }
    }
    setMoreQuestions(randomQuestions);
  }, [selectedDeck]);

  // Load and subscribe to recent messages
  useEffect(() => {
    if (!partnership) return;

    const unsubscribe = subscribeToMessages(
      partnership.id,
      messages => {
        // Get last 3 messages
        const last3Messages = messages.slice(-3).reverse();
        setRecentMessages(last3Messages);
      },
      3,
    );

    return () => {
      unsubscribe();
    };
  }, [partnership]);

  // Load and subscribe to today's photo prompt
  useEffect(() => {
    if (!partnership || !user) return;

    const loadAndSubscribe = async () => {
      try {
        const prompt = await getDailyPrompt(partnership.id);
        setTodayPhotoPrompt(prompt);

        const unsubscribe = subscribeToPhotoPrompt(prompt.id, async updatedPrompt => {
          if (updatedPrompt) {
            setTodayPhotoPrompt(updatedPrompt);
            
            // Update widget when prompt changes (including partner uploads)
            const isUser1 = partnership.userId1 === user.id;
            const partnerId = isUser1 ? partnership.userId2 : partnership.userId1;
            try {
              const partner = await getUserById(partnerId);
              if (partner) {
                await updateDailyPhotoWidget(updatedPrompt, partner.name, isUser1);
              }
            } catch (error) {
              console.error('Error updating daily photo widget:', error);
            }
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error loading photo prompt:', error);
      }
      return () => {};
    };

    let unsubscribe: (() => void) | undefined;
    loadAndSubscribe().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [partnership, user]);

  // Subscribe to countdowns
  useEffect(() => {
    if (!partnership) return;

    const unsubscribe = subscribeToCountdowns(partnership.id, countdowns => {
      // Get the next upcoming countdown
      const futureCountdowns = countdowns
        .filter(c => new Date(c.targetDate) > new Date())
        .sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime());
      
      setNextCountdown(futureCountdowns.length > 0 ? futureCountdowns[0] : null);
    });

    return () => {
      unsubscribe();
    };
  }, [partnership]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (partnership) {
      await loadDailyQuestion(partnership.id);
    }
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const handleDailyQuestionPress = () => {
    if (currentQuestion) {
      navigation.navigate('QuestionDetail', {
        question: currentQuestion,
      } as any);
    }
  };

  const handleAnswerQuestion = (question: Question) => {
    navigation.navigate('QuestionDetail', {
      question,
    } as any);
  };

  const handleSkipQuestion = async (question: Question) => {
    if (partnership) {
      await useQuestionStore.getState().skipQuestionById(question.id, partnership.id);
      // Remove from local moreQuestions list
      setMoreQuestions(prev => prev.filter(q => q.id !== question.id));
    }
  };

  const handleBrowseDecks = () => {
    navigation.navigate('DeckBrowser' as any);
  };

  const handleOpenChat = () => {
    navigation.navigate('Chat' as any);
  };

  const formatMessageTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return format(date, 'h:mm a');
    } else if (isYesterday(date)) {
      return 'Yesterday';
    } else {
      return format(date, 'MMM d');
    }
  };

  const getMessageIcon = (type: 'text' | 'photo' | 'voice'): string => {
    switch (type) {
      case 'photo':
        return 'image';
      case 'voice':
        return 'microphone';
      default:
        return 'message-text';
    }
  };

  const getMessagePreview = (message: Message): string => {
    if (message.deleted) return 'This message was deleted';
    if (message.type === 'photo') return message.content || '📷 Photo';
    if (message.type === 'voice') return '🎤 Voice message';
    return message.content.length > 50
      ? message.content.substring(0, 50) + '...'
      : message.content;
  };

  const handleEmberPress = () => {
    setShowStreakInfoModal(true);
  };

  const handleRestoreStreak = async () => {
    if (!partnership) return;
    const result = await restoreStreak(partnership.id);
    if (result.success) {
      setShowStreakInfoModal(false);
      // Refresh partnership data
      if (partnership) {
        await checkStreakStatus(partnership.id).then(setStreakStatus);
      }
    }
  };

  const getStreakMessage = () => {
    if (!partnership) return '';
    if (!streakStatus.isActive) {
      return 'Start a new streak by answering questions together!';
    }
    const timeRemaining = partnership.lastActivityDate
      ? getTimeRemaining(partnership.lastActivityDate)
      : `${Math.floor(streakStatus.hoursRemaining)} hours left`;
    return `Keep your streak alive! ${timeRemaining}`;
  };

  const getDailyQuestionStatus = () => {
    if (!currentQuestion) return 'Tap to answer';
    if (!userAnswer) return 'Tap to answer';
    if (!partnerAnswer || !isRevealed) return 'Waiting for partner';
    return 'View answers';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Connect</Text>
          <Text style={styles.headerDate}>{format(new Date(), 'EEEE, MMMM d')}</Text>
        </View>

        {/* Canvas Widget */}
        {partnership && user && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.canvasCard}
              onPress={() => navigation.navigate('CanvasEditor' as any)}
              activeOpacity={0.8}>
              <View style={styles.canvasHeader}>
                <Text style={styles.canvasTitle}>Shared Canvas</Text>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    navigation.navigate('CanvasGallery' as any);
                  }}>
                  <MaterialCommunityIcons
                    name="image-multiple"
                    size={20}
                    color={theme.colors.primary}
                  />
                </TouchableOpacity>
              </View>
              <CanvasErrorBoundary>
                <Canvas
                  partnershipId={partnership.id}
                  userId={user.id}
                  initialDrawingData={currentCanvasData}
                  editable={false}
                  height={200}
                />
              </CanvasErrorBoundary>
              <View style={styles.canvasFooter}>
                <Text style={styles.canvasFooterText}>
                  Tap to draw together
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Ember Mascot and Streak Counter */}
        {partnership && (
          <View style={styles.section}>
            <View style={styles.streakCard}>
              <View style={styles.streakHeader}>
                <Ember
                  streakCount={partnership.streakCount}
                  hoursRemaining={streakStatus.hoursRemaining}
                  isActive={streakStatus.isActive}
                  onPress={handleEmberPress}
                />
                <View style={styles.streakInfo}>
                  <Text style={styles.streakValue}>{partnership.streakCount}</Text>
                  <Text style={styles.streakLabel}>Day Streak</Text>
                </View>
              </View>
              <Text style={styles.streakDescription}>
                {getStreakMessage()}
              </Text>
              <TouchableOpacity
                style={styles.overlayButton}
                onPress={() => setShowStreakOverlay(true)}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text style={styles.overlayButtonText}>View daily activities</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Today's Question */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Question</Text>
          {questionLoading && !currentQuestion ? (
            <View style={styles.questionCard}>
              <Text style={styles.loadingText}>Loading question...</Text>
            </View>
          ) : currentQuestion ? (
            <TouchableOpacity
              style={styles.questionCardWrapper}
              onPress={handleDailyQuestionPress}>
              <QuestionCard
                question={currentQuestion}
                onPress={handleDailyQuestionPress}
                swipeable={false}
              />
              <View style={styles.questionStatus}>
                <Text style={styles.questionStatusText}>
                  {getDailyQuestionStatus()}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={theme.colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.questionCard}>
              <Text style={styles.questionText}>No question available</Text>
            </View>
          )}
        </View>

        {/* More Questions */}
        {moreQuestions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>More Questions</Text>
            <QuestionDeck
              questions={moreQuestions}
              onAnswerQuestion={handleAnswerQuestion}
              onSkipQuestion={handleSkipQuestion}
            />
          </View>
        )}

        {/* Daily Photo Prompt */}
        {partnership && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.photoPromptCard}
              onPress={() => navigation.navigate('Photos' as any)}>
              <View style={styles.photoPromptIcon}>
                <MaterialCommunityIcons
                  name="camera-image"
                  size={32}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.photoPromptContent}>
                <Text style={styles.photoPromptTitle}>Daily Photo Prompt</Text>
                <Text style={styles.photoPromptDescription}>
                  {todayPhotoPrompt?.promptText || 'Share a photo of something that made you happy today'}
                </Text>
                {todayPhotoPrompt && (
                  <Text style={styles.photoPromptStatus}>
                    {(() => {
                      const bothUploaded = checkBothPartnersUploaded(todayPhotoPrompt);
                      if (bothUploaded) return '✓ Both photos shared!';
                      const isUser1 = partnership.userId1 === user?.id;
                      const userPhoto = isUser1 ? todayPhotoPrompt.user1PhotoUrl : todayPhotoPrompt.user2PhotoUrl;
                      if (userPhoto) return 'Waiting for partner';
                      return 'Tap to share';
                    })()}
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Thumb Kisses */}
        {partnership && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.photoPromptCard}
              onPress={() => navigation.navigate('ThumbKisses' as any)}>
              <View style={[styles.photoPromptIcon, {backgroundColor: theme.colors.primaryLight}]}>
                <MaterialCommunityIcons
                  name="hand-heart"
                  size={32}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.photoPromptContent}>
                <Text style={styles.photoPromptTitle}>Thumb Kisses</Text>
                <Text style={styles.photoPromptDescription}>
                  Feel your partner's touch from anywhere
                </Text>
                <Text style={styles.photoPromptStatus}>
                  Tap to connect
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Upcoming Events */}
        {partnership && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.photoPromptCard}
              onPress={() => navigation.navigate('Countdown' as any)}>
              <View style={[styles.photoPromptIcon, {backgroundColor: theme.colors.secondaryLight}]}>
                <MaterialCommunityIcons
                  name="calendar-plus"
                  size={32}
                  color={theme.colors.secondary}
                />
              </View>
              <View style={styles.photoPromptContent}>
                <Text style={styles.photoPromptTitle}>Upcoming Events</Text>
                {nextCountdown ? (
                  <>
                    <Text style={styles.photoPromptDescription}>
                      {nextCountdown.title}
                    </Text>
                    <Text style={styles.photoPromptStatus}>
                      {differenceInDays(new Date(nextCountdown.targetDate), new Date())} day{differenceInDays(new Date(nextCountdown.targetDate), new Date()) !== 1 ? 's' : ''} remaining
                    </Text>
                  </>
                ) : (
                  <Text style={styles.photoPromptDescription}>
                    Add your next special date
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Chat Messages Preview */}
        <View style={styles.section}>
          <View style={styles.chatHeader}>
            <Text style={styles.sectionTitle}>Recent Messages</Text>
            <TouchableOpacity onPress={handleOpenChat}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.chatPreviewCard}
            onPress={handleOpenChat}
            activeOpacity={0.7}>
            {recentMessages.length === 0 ? (
              <Text style={styles.noMessagesText}>
                No messages yet. Start a conversation!
              </Text>
            ) : (
              <View>
                {recentMessages.map((message, index) => {
                  const isOwnMessage = message.senderId === user?.id;
                  const senderName = isOwnMessage ? 'You' : 'Partner';
                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.messagePreviewItem,
                        index < recentMessages.length - 1 &&
                          styles.messagePreviewItemBorder,
                      ]}>
                      <MaterialCommunityIcons
                        name={getMessageIcon(message.type)}
                        size={20}
                        color={
                          message.deleted
                            ? theme.colors.textSecondary
                            : theme.colors.primary
                        }
                        style={styles.messageIcon}
                      />
                      <View style={styles.messagePreviewContent}>
                        <View style={styles.messagePreviewHeader}>
                          <Text
                            style={[
                              styles.messageSender,
                              message.deleted && styles.messageDeleted,
                            ]}>
                            {senderName}
                          </Text>
                          <Text style={styles.messageTime}>
                            {formatMessageTimestamp(message.createdAt)}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.messagePreviewText,
                            message.deleted && styles.messageDeleted,
                          ]}
                          numberOfLines={1}>
                          {getMessagePreview(message)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Browse Question Decks */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={handleBrowseDecks}>
            <MaterialCommunityIcons
              name="book-open-variant"
              size={24}
              color={theme.colors.primary}
            />
            <Text style={styles.browseButtonText}>Browse Question Decks</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Milestone Modal */}
      <MilestoneModal
        visible={showMilestoneModal}
        milestone={milestone}
        streakCount={partnership?.streakCount || 0}
        onClose={() => setShowMilestoneModal(false)}
      />

      {/* Streak Overlay */}
      <StreakOverlay
        visible={showStreakOverlay}
        activities={[
          {
            id: 'question',
            type: 'question',
            label: 'Answer today\'s question together',
            completed: !!userAnswer && !!partnerAnswer,
            icon: 'chat-question',
          },
          {
            id: 'photo',
            type: 'photo',
            label: 'Share a daily photo',
            completed: todayPhotoPrompt ? checkBothPartnersUploaded(todayPhotoPrompt) : false,
            icon: 'camera-image',
          },
          {
            id: 'game',
            type: 'game',
            label: 'Play a game together',
            completed: false,
            icon: 'gamepad-variant',
          },
          {
            id: 'canvas',
            type: 'canvas',
            label: 'Draw on shared canvas',
            completed: hasCanvasActivity,
            icon: 'draw-pen',
          },
        ]}
        onClose={() => setShowStreakOverlay(false)}
      />

      {/* Streak Info Modal (shown on Ember press) */}
      {showStreakInfoModal && partnership && (
        <Modal
          visible={showStreakInfoModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowStreakInfoModal(false)}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowStreakInfoModal(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Streak Details</Text>
              <View style={styles.modalInfo}>
                <Text style={styles.modalLabel}>Current Streak</Text>
                <Text style={styles.modalValue}>{partnership.streakCount} days</Text>
              </View>
              <View style={styles.modalInfo}>
                <Text style={styles.modalLabel}>Time Remaining</Text>
                <Text style={styles.modalValue}>
                  {partnership.lastActivityDate
                    ? getTimeRemaining(partnership.lastActivityDate)
                    : 'Unknown'}
                </Text>
              </View>
              {partnership.streakRestoreAvailable && !partnership.streakRestoreUsed && (
                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={handleRestoreStreak}>
                  <MaterialCommunityIcons
                    name="restore"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.restoreButtonText}>Restore Streak</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowStreakInfoModal(false)}>
                <Text style={styles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  headerDate: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  section: {
    paddingHorizontal: theme.spacing.base,
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
  },
  canvasCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  canvasPlaceholderText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  canvasDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  canvasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  canvasTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  canvasFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing.sm,
  },
  canvasFooterText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  streakCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  streakInfo: {
    marginLeft: theme.spacing.base,
  },
  streakValue: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  streakLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  streakDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  questionCardWrapper: {
    marginBottom: theme.spacing.sm,
  },
  questionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 100,
    justifyContent: 'center',
  },
  questionContent: {
    flex: 1,
    marginLeft: theme.spacing.base,
  },
  questionText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  questionHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  questionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  questionStatusText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  photoPromptCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  photoPromptIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.secondaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPromptContent: {
    flex: 1,
    marginLeft: theme.spacing.base,
  },
  photoPromptTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  photoPromptDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  photoPromptStatus: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.base,
  },
  viewAllText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  chatPreviewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  noMessagesText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.lg,
  },
  messagePreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  messagePreviewItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  messageIcon: {
    marginRight: theme.spacing.sm,
  },
  messagePreviewContent: {
    flex: 1,
  },
  messagePreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  messageSender: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  messageTime: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  messagePreviewText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  messageDeleted: {
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  browseButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  browseButtonText: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    marginLeft: theme.spacing.base,
  },
  bottomSpacing: {
    height: theme.spacing['2xl'],
  },
  overlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  overlayButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.xl,
    padding: theme.spacing.xl,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  modalInfo: {
    marginBottom: theme.spacing.base,
  },
  modalLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  modalValue: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginTop: theme.spacing.base,
    marginBottom: theme.spacing.base,
    gap: theme.spacing.xs,
  },
  restoreButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
  closeModalButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    marginTop: theme.spacing.base,
  },
  closeModalButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
});
