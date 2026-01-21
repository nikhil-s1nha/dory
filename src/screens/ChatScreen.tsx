/**
 * Chat Screen
 * Full-screen chat interface with real-time messaging
 */

import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Image,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {useMessageStore} from '@store/messageSlice';
import {
  MessageBubble,
  MessageInput,
  TypingIndicator,
} from '@components/messages';
import {ReactionPicker} from '@components/questions/ReactionPicker';
import {subscribeToPartnership} from '@services/partnershipService';
import {setTyping as setTypingService} from '@services/messageService';
import {Message} from '@utils/types';

interface RouteParams {
  questionId?: string;
  question?: any;
}

export const ChatScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route.params as RouteParams) || {};
  const {questionId, question} = params;

  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const {
    messages,
    isLoading,
    typingUsers,
    subscribeToMessages,
    setMessages,
    sendMessage: sendMessageAction,
    addReaction,
    setTyping: setTypingAction,
  } = useMessageStore();

  const [refreshing, setRefreshing] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [imageFullscreen, setImageFullscreen] = useState<{
    uri: string;
    visible: boolean;
  }>({uri: '', visible: false});
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const partnershipId = partnership?.id;
  const isUser1 = partnership?.userId1 === user?.id;
  const partnerId = isUser1 ? partnership?.userId2 : partnership?.userId1;
  const partnerName =
    partnership && partnerId
      ? isUser1
        ? 'Partner'
        : 'Partner'
      : 'Partner'; // In a real app, fetch partner name from users collection

  // Subscribe to messages
  useEffect(() => {
    if (!partnershipId) return;

    // Subscribe to messages
    subscribeToMessages(partnershipId, 100);

    // Cleanup on unmount
    return () => {
      useMessageStore.getState().clearMessages();
    };
  }, [partnershipId]);

  // Subscribe to partnership typing users
  useEffect(() => {
    if (!partnershipId) return;

    const unsubscribe = subscribeToPartnership(
      partnershipId,
      updatedPartnership => {
        if (updatedPartnership) {
          const typing = updatedPartnership.typingUsers || [];
          const partnerTyping = typing.filter(id => id !== user?.id);
          useMessageStore.getState().setTypingUsers(partnerTyping);
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [partnershipId, user?.id]);

  // Auto-scroll to bottom on new messages from current user
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.senderId === user?.id) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: messages.length - 1,
            animated: true,
          });
        }, 100);
      }
    }
  }, [messages.length, user?.id]);

  // Clear typing indicator on unmount
  useEffect(() => {
    return () => {
      if (partnershipId && user?.id) {
        setTypingService(partnershipId, user.id, false);
      }
    };
  }, [partnershipId, user?.id]);

  const handleSendMessage = async (
    content: string,
    type: 'text' | 'photo' | 'voice',
    mediaUrl?: string,
  ) => {
    if (!partnershipId || !user?.id) return;

    try {
      const message = await sendMessageAction({
        partnershipId,
        senderId: user.id,
        content,
        type,
        mediaUrl,
        questionId: questionId || undefined,
      });

      // Clear typing indicator
      if (partnershipId && user.id) {
        setTypingAction(user.id, false);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      throw error;
    }
  };

  const handleLongPressMessage = (message: Message) => {
    if (message.deleted) return;
    setSelectedMessageId(message.id);
    setShowReactionPicker(true);
  };

  const handleReact = async (emoji: string) => {
    if (!selectedMessageId || !user?.id) return;

    try {
      await addReaction(selectedMessageId, user.id, emoji);
    } catch (error) {
      console.error('Error adding reaction:', error);
      Alert.alert('Error', 'Failed to add reaction');
    } finally {
      setShowReactionPicker(false);
      setSelectedMessageId(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Messages are already synced via real-time subscription
    // Could implement pagination here to load older messages
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const handleScrollToBottom = () => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToIndex({
        index: messages.length - 1,
        animated: true,
      });
    }
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    // Show scroll to bottom button if not at bottom
    const distanceFromBottom = contentHeight - layoutHeight - offsetY;
    setShowScrollToBottom(distanceFromBottom > 100);
  };

  const renderMessage = ({item, index}: {item: Message; index: number}) => {
    const isOwnMessage = item.senderId === user?.id;
    return (
      <MessageBubble
        message={item}
        isOwnMessage={isOwnMessage}
        partnerName={partnerName}
        onReact={messageId => {
          setSelectedMessageId(messageId);
          setShowReactionPicker(true);
        }}
        onLongPress={handleLongPressMessage}
        onImagePress={(uri: string) => {
          setImageFullscreen({uri, visible: true});
        }}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons
        name="heart"
        size={64}
        color={theme.colors.textLight}
      />
      <Text style={styles.emptyTitle}>Start your conversation!</Text>
      <Text style={styles.emptySubtitle}>
        Share your thoughts, photos, or voice messages
      </Text>
      {question && (
        <View style={styles.questionBanner}>
          <Text style={styles.questionBannerText}>
            Discussing: {question.text || question}
          </Text>
        </View>
      )}
    </View>
  );

  const isPartnerTyping =
    typingUsers.length > 0 && typingUsers.some(id => id !== user?.id);

  if (!partnership || !partnershipId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Custom Header */}
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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{partnerName}</Text>
          {isPartnerTyping && (
            <Text style={styles.headerSubtitle}>typing...</Text>
          )}
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Question Banner */}
      {question && (
        <View style={styles.questionBanner}>
          <MaterialCommunityIcons
            name="chat-question"
            size={16}
            color={theme.colors.primary}
          />
          <Text style={styles.questionBannerText}>
            Discussing: {question.text || question}
          </Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        onScrollToIndexFailed={info => {
          // Handle scroll to index failure gracefully
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: info.index,
              animated: false,
            });
          }, 100);
        }}
      />

      {/* Typing Indicator */}
      {isPartnerTyping && (
        <TypingIndicator partnerName={partnerName} visible={true} />
      )}

      {/* Message Input */}
      <MessageInput
        partnershipId={partnershipId}
        onSendMessage={handleSendMessage}
      />

      {/* Reaction Picker */}
      <ReactionPicker
        visible={showReactionPicker}
        onSelect={handleReact}
        onClose={() => {
          setShowReactionPicker(false);
          setSelectedMessageId(null);
        }}
      />

      {/* Scroll to Bottom Button */}
      {showScrollToBottom && (
        <TouchableOpacity
          style={styles.scrollToBottomButton}
          onPress={handleScrollToBottom}>
          <MaterialCommunityIcons
            name="arrow-down"
            size={20}
            color={theme.colors.textInverse}
          />
        </TouchableOpacity>
      )}

      {/* Fullscreen Image Modal */}
      <Modal
        visible={imageFullscreen.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setImageFullscreen({uri: '', visible: false})
        }>
        <View style={styles.fullscreenImageContainer}>
          <TouchableOpacity
            style={styles.fullscreenImageCloseButton}
            onPress={() => setImageFullscreen({uri: '', visible: false})}>
            <MaterialCommunityIcons
              name="close"
              size={28}
              color={theme.colors.textInverse}
            />
          </TouchableOpacity>
          <Image
            source={{uri: imageFullscreen.uri}}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
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
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },
  questionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight + '20',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  questionBannerText: {
    marginLeft: theme.spacing.xs,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: theme.spacing.base,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.base,
  },
  emptySubtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: 100,
    right: theme.spacing.base,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fullscreenImageContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImageCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: theme.spacing.base,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
});
