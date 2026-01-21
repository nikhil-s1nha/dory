/**
 * Countdown Card Component
 * Displays individual countdown with time remaining and actions
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  format,
} from 'date-fns';
import {theme} from '@theme';
import {Countdown} from '@utils/types';

interface CountdownCardProps {
  countdown: Countdown;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const CountdownCard: React.FC<CountdownCardProps> = ({
  countdown,
  onPress,
  onEdit,
  onDelete,
}) => {
  const targetDate = new Date(countdown.targetDate);
  const now = new Date();
  const isPast = targetDate < now;

  const days = differenceInDays(targetDate, now);
  const hours = differenceInHours(targetDate, now) % 24;
  const minutes = differenceInMinutes(targetDate, now) % 60;

  // Determine color based on urgency
  const getCardColor = () => {
    if (isPast) return theme.colors.textSecondary;
    if (days < 7) return theme.colors.accent;
    if (days < 30) return theme.colors.primary;
    return theme.colors.secondary;
  };

  const cardColor = getCardColor();

  const formatTimeRemaining = () => {
    if (isPast) {
      return 'Event passed';
    }
    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  return (
    <TouchableOpacity
      style={[styles.card, {borderLeftColor: cardColor}]}
      onPress={onPress}
      activeOpacity={0.7}>
      <View style={styles.cardContent}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons
              name="calendar-clock"
              size={24}
              color={cardColor}
            />
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {countdown.title}
            </Text>
            {countdown.description && (
              <Text style={styles.description} numberOfLines={2}>
                {countdown.description}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.timeContainer}>
          <Text style={[styles.timeRemaining, {color: cardColor}]}>
            {formatTimeRemaining()}
          </Text>
          <Text style={styles.targetDate}>
            {format(targetDate, 'MMM d, yyyy')}
          </Text>
        </View>

        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={e => {
                e.stopPropagation();
                onEdit();
              }}>
              <MaterialCommunityIcons
                name="pencil"
                size={18}
                color={theme.colors.primary}
              />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={e => {
                e.stopPropagation();
                onDelete();
              }}>
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={18}
                color={theme.colors.error}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
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
  cardContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  iconContainer: {
    marginRight: theme.spacing.base,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.fontSize.sm * 1.4,
  },
  timeContainer: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  timeRemaining: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  targetDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  actionButton: {
    padding: theme.spacing.xs,
  },
});