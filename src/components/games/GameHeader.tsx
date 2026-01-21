/**
 * Game Header Component
 * Reusable header for all game screens
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';

interface GameHeaderProps {
  title: string;
  onBack: () => void;
  showScore?: boolean;
  score?: number;
  timer?: number; // seconds remaining
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  title,
  onBack,
  showScore = false,
  score,
  timer,
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <MaterialCommunityIcons
          name="arrow-left"
          size={24}
          color={theme.colors.text}
        />
      </TouchableOpacity>

      <View style={styles.centerContent}>
        <Text style={styles.title}>{title}</Text>
        {timer !== undefined && (
          <Text style={styles.timer}>{formatTime(timer)}</Text>
        )}
      </View>

      {showScore && (
        <View style={styles.scoreContainer}>
          <MaterialCommunityIcons
            name="star"
            size={20}
            color={theme.colors.accent}
          />
          <Text style={styles.score}>{score ?? 0}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.xs,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  timer: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundDark,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.sm,
  },
  score: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginLeft: theme.spacing.xs,
  },
});
