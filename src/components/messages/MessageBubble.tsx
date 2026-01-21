/**
 * Message Bubble Component
 * Displays individual message with different layouts based on type
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import {LongPressGestureHandler, State} from 'react-native-gesture-handler';
import {format, isToday, isYesterday, formatDistanceToNow} from 'date-fns';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {Message} from '@utils/types';
import {ReactionBubble} from '@components/questions/ReactionBubble';
import {useAuthStore} from '@store/authSlice';
import {playAudio, pauseAudio} from '@utils/audioRecorder';

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  partnerName: string;
  onReact: (messageId: string) => void;
  onLongPress: (message: Message) => void;
  onImagePress?: (uri: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwnMessage,
  partnerName,
  onReact,
  onLongPress,
  onImagePress,
}) => {
  const {user} = useAuthStore();
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  const handleLongPress = () => {
    if (!message.deleted) {
      onLongPress(message);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return format(date, 'h:mm a');
    } else if (isYesterday(date)) {
      return 'Yesterday ' + format(date, 'h:mm a');
    } else {
      return format(date, 'MMM d, h:mm a');
    }
  };

  const renderMessageContent = () => {
    if (message.deleted) {
      return (
        <Text style={[styles.content, styles.deletedText]}>
          This message was deleted
        </Text>
      );
    }

    switch (message.type) {
      case 'text':
        return (
          <Text
            style={[
              styles.content,
              isOwnMessage ? styles.ownContent : styles.partnerContent,
            ]}>
            {message.content}
          </Text>
        );

      case 'photo':
        if (message.mediaUrl) {
          return (
            <View style={styles.mediaContainer}>
              {imageLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              )}
              {imageError ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>Failed to load image</Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    if (message.mediaUrl && onImagePress) {
                      onImagePress(message.mediaUrl);
                    }
                  }}
                  activeOpacity={0.9}>
                  <Image
                    source={{uri: message.mediaUrl}}
                    style={styles.image}
                    onLoadStart={() => setImageLoading(true)}
                    onLoadEnd={() => setImageLoading(false)}
                    onError={() => {
                      setImageLoading(false);
                      setImageError(true);
                    }}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
              {message.content && message.content.trim() && (
                <Text
                  style={[
                    styles.content,
                    styles.captionText,
                    isOwnMessage ? styles.ownContent : styles.partnerContent,
                  ]}>
                  {message.content}
                </Text>
              )}
            </View>
          );
        }
        return (
          <Text
            style={[
              styles.content,
              isOwnMessage ? styles.ownContent : styles.partnerContent,
            ]}>
            {message.content}
          </Text>
        );

      case 'voice':
        return (
          <View style={styles.voiceContainer}>
            <TouchableOpacity
              style={[
                styles.voicePlayButton,
                {
                  backgroundColor: isOwnMessage
                    ? 'rgba(255, 255, 255, 0.2)'
                    : theme.colors.primaryLight + '20',
                },
              ]}
              onPress={async () => {
                if (!message.mediaUrl) return;
                
                try {
                  if (isPlayingVoice) {
                    await pauseAudio();
                    setIsPlayingVoice(false);
                  } else {
                    await playAudio(message.mediaUrl);
                    setIsPlayingVoice(true);
                  }
                } catch (error) {
                  console.error('Error playing/pausing audio:', error);
                  setIsPlayingVoice(false);
                }
              }}>
              <MaterialCommunityIcons
                name={isPlayingVoice ? 'pause' : 'play'}
                size={20}
                color={isOwnMessage ? theme.colors.textInverse : theme.colors.primary}
              />
            </TouchableOpacity>
            <View style={styles.voiceInfo}>
              <Text
                style={[
                  styles.content,
                  isOwnMessage ? styles.ownContent : styles.partnerContent,
                ]}>
                🎤 Voice message
              </Text>
              <Text
                style={[
                  styles.voiceDuration,
                  isOwnMessage ? styles.ownContent : styles.partnerContent,
                ]}>
                {formatDistanceToNow(new Date(message.createdAt))} ago
                {isPlayingVoice ? ' • Playing' : ''}
              </Text>
            </View>
          </View>
        );

      default:
        return <Text style={styles.content}>{message.content}</Text>;
    }
  };

  const renderReactions = () => {
    if (!message.reactions || message.reactions.length === 0) {
      return null;
    }

    // Group reactions by emoji
    const reactionGroups = message.reactions.reduce(
      (acc, reaction) => {
        if (!acc[reaction.emoji]) {
          acc[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: [],
          };
        }
        acc[reaction.emoji].count += 1;
        acc[reaction.emoji].users.push(reaction.userId);
        return acc;
      },
      {} as Record<
        string,
        {emoji: string; count: number; users: string[]}
      >,
    );

    const reactions = Object.values(reactionGroups);

    return (
      <View style={styles.reactionsContainer}>
        {reactions.map((reaction, index) => (
          <ReactionBubble
            key={index}
            emoji={reaction.emoji}
            count={reaction.count}
            users={reaction.users}
            isUserReacted={reaction.users.includes(user?.id || '')}
            onPress={() => onReact(message.id)}
          />
        ))}
      </View>
    );
  };

  return (
    <LongPressGestureHandler
      onHandlerStateChange={({nativeEvent}) => {
        if (nativeEvent.state === State.ACTIVE) {
          handleLongPress();
        }
      }}
      minDurationMs={500}>
      <View
        style={[
          styles.container,
          isOwnMessage ? styles.ownMessage : styles.partnerMessage,
        ]}>
        {!isOwnMessage && (
          <Text style={styles.senderName}>{partnerName}</Text>
        )}
        <View
          style={[
            styles.bubble,
            isOwnMessage ? styles.ownBubble : styles.partnerBubble,
          ]}>
          {renderMessageContent()}
          <Text style={styles.timestamp}>
            {formatTimestamp(message.createdAt)}
          </Text>
        </View>
        {renderReactions()}
      </View>
    </LongPressGestureHandler>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.xs,
    marginHorizontal: theme.spacing.base,
    maxWidth: '75%',
  },
  ownMessage: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  partnerMessage: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  bubble: {
    padding: theme.spacing.base,
    borderRadius: theme.spacing.md,
  },
  ownBubble: {
    backgroundColor: theme.colors.primary,
  },
  partnerBubble: {
    backgroundColor: theme.colors.backgroundDark,
  },
  content: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: theme.typography.fontSize.base * 1.5,
  },
  ownContent: {
    color: theme.colors.textInverse,
  },
  partnerContent: {
    color: theme.colors.text,
  },
  captionText: {
    marginTop: theme.spacing.xs,
  },
  deletedText: {
    fontStyle: 'italic',
    color: theme.colors.textSecondary,
  },
  timestamp: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    alignSelf: 'flex-end',
  },
  mediaContainer: {
    borderRadius: theme.spacing.sm,
    overflow: 'hidden',
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: theme.spacing.sm,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundDark,
  },
  errorContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voicePlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  voiceInfo: {
    flex: 1,
  },
  voiceDuration: {
    fontSize: theme.typography.fontSize.xs,
    marginTop: theme.spacing.xs / 2,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
    alignItems: 'center',
  },
});
