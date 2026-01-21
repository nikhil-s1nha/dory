/**
 * Score Card Component
 * Displays player score with avatar/name
 */

import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';

interface ScoreCardProps {
  playerName: string;
  score: number;
  isCurrentPlayer?: boolean;
  avatar?: string;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({
  playerName,
  score,
  isCurrentPlayer = false,
  avatar,
}) => {
  return (
    <View
      style={[
        styles.container,
        isCurrentPlayer && styles.currentPlayerContainer,
      ]}>
      {avatar ? (
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{avatar}</Text>
        </View>
      ) : (
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name="account-circle"
            size={32}
            color={isCurrentPlayer ? theme.colors.primary : theme.colors.textSecondary}
          />
        </View>
      )}
      <Text
        style={[
          styles.playerName,
          isCurrentPlayer && styles.currentPlayerName,
        ]}>
        {playerName}
      </Text>
      <Text
        style={[
          styles.score,
          isCurrentPlayer && styles.currentPlayerScore,
        ]}>
        {score}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    minWidth: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  currentPlayerContainer: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.backgroundDark,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  avatarText: {
    fontSize: theme.typography.fontSize.lg,
    color: '#fff',
  },
  iconContainer: {
    marginBottom: theme.spacing.xs,
  },
  playerName: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  currentPlayerName: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  score: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  currentPlayerScore: {
    color: theme.colors.primary,
  },
});
