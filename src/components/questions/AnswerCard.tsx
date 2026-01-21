/**
 * Answer Card Component
 * Reusable component for displaying a single answer
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {Answer} from '@utils/types';
import {theme} from '@theme';
import {ReactionBubble} from './ReactionBubble';

interface AnswerCardProps {
  answer: Answer;
  userName: string;
  onReact: (emoji: string) => void;
  onLongPressReact?: () => void;
  showReactions: boolean;
  isCurrentUser: boolean;
  currentUserId: string;
}

export const AnswerCard: React.FC<AnswerCardProps> = ({
  answer,
  userName,
  onReact,
  onLongPressReact,
  showReactions,
  isCurrentUser,
  currentUserId,
}) => {
  const lastTapRef = React.useRef<number>(0);
  const tapTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleLongPress = () => {
    if (onLongPressReact) {
      onLongPressReact();
    }
  };

  const handlePress = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300; // milliseconds

    if (lastTapRef.current && now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      onReact('❤️');
      lastTapRef.current = 0;
    } else {
      // Single tap - wait to see if it's a double tap
      lastTapRef.current = now;
      tapTimeoutRef.current = setTimeout(() => {
        lastTapRef.current = 0;
        tapTimeoutRef.current = null;
      }, DOUBLE_TAP_DELAY);
    }
  };

  const renderAnswerContent = () => {
    switch (answer.type) {
      case 'text':
        return <Text style={styles.answerText}>{answer.text}</Text>;
      case 'photo':
        return answer.mediaUrl ? (
          <Image
            source={{uri: answer.mediaUrl}}
            style={styles.answerImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.answerText}>Photo not available</Text>
        );
      case 'voice':
        return (
          <View style={styles.voiceContainer}>
            <MaterialCommunityIcons
              name="play-circle"
              size={48}
              color={theme.colors.primary}
            />
            <Text style={styles.voiceText}>Voice message</Text>
          </View>
        );
      default:
        return <Text style={styles.answerText}>{answer.text}</Text>;
    }
  };

  return (
    <TouchableWithoutFeedback
      onLongPress={handleLongPress}
      onPress={handlePress}>
      <View style={[styles.container, isCurrentUser && styles.containerCurrentUser]}>
        <Text style={styles.userName}>{userName}</Text>
        <View style={styles.contentContainer}>{renderAnswerContent()}</View>

        {showReactions && answer.reactions && answer.reactions.length > 0 && (
          <View style={styles.reactionsContainer}>
            {Object.entries(
              answer.reactions.reduce((acc, reaction) => {
                if (!acc[reaction.emoji]) {
                  acc[reaction.emoji] = {
                    emoji: reaction.emoji,
                    users: [],
                    count: 0,
                  };
                }
                acc[reaction.emoji].users.push(reaction.userId);
                acc[reaction.emoji].count += 1;
                return acc;
              }, {} as Record<string, {emoji: string; users: string[]; count: number}>),
            ).map(([emoji, data]) => (
              <ReactionBubble
                key={emoji}
                emoji={data.emoji}
                count={data.count}
                users={data.users}
                isUserReacted={data.users.includes(currentUserId)}
              />
            ))}
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.base,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  containerCurrentUser: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  userName: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  contentContainer: {
    marginBottom: theme.spacing.sm,
  },
  answerText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeight.normal * theme.typography.fontSize.base,
  },
  answerImage: {
    width: '100%',
    height: 200,
    borderRadius: theme.spacing.sm,
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.base,
  },
  voiceText: {
    marginLeft: theme.spacing.base,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
  reactionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
});
