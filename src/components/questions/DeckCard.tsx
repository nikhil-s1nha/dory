/**
 * Deck Card Component
 * Individual deck card in the browser
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {theme} from '@theme';
import {DeckMetadata} from '@utils/questionLoader';

interface DeckCardProps {
  deck: DeckMetadata;
  onPress: () => void;
}

export const DeckCard: React.FC<DeckCardProps> = ({deck, onPress}) => {
  return (
    <TouchableOpacity
      style={[styles.container, {borderLeftColor: deck.color}]}
      onPress={onPress}
      activeOpacity={0.8}>
      <View style={styles.content}>
        <Text style={styles.icon}>{deck.icon}</Text>
        <View style={styles.textContainer}>
          <Text style={styles.name}>{deck.name}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {deck.description}
          </Text>
          <Text style={styles.count}>{deck.questionCount} questions</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.base,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 48,
    marginRight: theme.spacing.base,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  count: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textLight,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
