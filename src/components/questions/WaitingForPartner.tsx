/**
 * Waiting for Partner Component
 * Displayed when user has answered but partner hasn't
 */

import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';

interface WaitingForPartnerProps {
  partnerName: string;
  userAnswer?: string;
  onSendReminder?: () => void;
}

export const WaitingForPartner: React.FC<WaitingForPartnerProps> = ({
  partnerName,
  userAnswer,
  onSendReminder,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulsing animation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconContainer, {transform: [{scale: pulseAnim}]}]}>
        <MaterialCommunityIcons
          name="heart"
          size={64}
          color={theme.colors.primary}
        />
      </Animated.View>

      <Text style={styles.title}>Waiting for {partnerName}</Text>
      <Text style={styles.description}>
        Your partner hasn't answered yet. They'll see your answer once they respond!
      </Text>

      {userAnswer && (
        <View style={styles.answerPreview}>
          <Text style={styles.answerPreviewLabel}>Your Answer:</Text>
          <Text style={styles.answerPreviewText} numberOfLines={2}>
            {userAnswer}
          </Text>
        </View>
      )}

      {onSendReminder && (
        <TouchableOpacity
          style={styles.reminderButton}
          onPress={onSendReminder}>
          <MaterialCommunityIcons
            name="bell-outline"
            size={20}
            color={theme.colors.primary}
          />
          <Text style={styles.reminderButtonText}>Send Gentle Reminder</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.base,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    marginBottom: theme.spacing.xl,
  },
  answerPreview: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    width: '100%',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  answerPreviewLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  answerPreviewText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    opacity: 0.7, // Slightly blurred/locked appearance
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  reminderButtonText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
});
