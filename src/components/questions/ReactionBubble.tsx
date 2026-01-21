/**
 * Reaction Bubble Component
 * Small bubble showing emoji and count
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {theme} from '@theme';

interface ReactionBubbleProps {
  emoji: string;
  count: number;
  users: string[];
  isUserReacted: boolean;
  onPress?: () => void;
}

export const ReactionBubble: React.FC<ReactionBubbleProps> = ({
  emoji,
  count,
  users,
  isUserReacted,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        isUserReacted && styles.containerReacted,
      ]}
      onPress={onPress}
      activeOpacity={0.7}>
      <Text style={styles.emoji}>{emoji}</Text>
      {count > 1 && <Text style={styles.count}>{count}</Text>}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.base,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginRight: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  containerReacted: {
    backgroundColor: theme.colors.primaryLight + '30',
    borderColor: theme.colors.primary,
  },
  emoji: {
    fontSize: theme.typography.fontSize.base,
  },
  count: {
    marginLeft: theme.spacing.xs,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
});
