/**
 * Milestone Modal Component
 * Celebration modal displayed when streak milestones are reached
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';
import {MilestoneInfo} from '@services/streaks';

interface MilestoneModalProps {
  visible: boolean;
  milestone: MilestoneInfo | null;
  streakCount: number;
  onClose: () => void;
  onShare?: () => void;
}

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

export const MilestoneModal: React.FC<MilestoneModalProps> = ({
  visible,
  milestone,
  streakCount,
  onClose,
  onShare,
}) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const confetti = useSharedValue(0);

  React.useEffect(() => {
    if (visible && milestone) {
      // Entrance animation
      scale.value = withSequence(
        withSpring(0, {damping: 8, stiffness: 100}),
        withSpring(1, {damping: 6, stiffness: 150}),
      );
      opacity.value = withTiming(1, {duration: 300});
      
      // Confetti animation
      confetti.value = withRepeat(
        withTiming(1, {duration: 2000, easing: Easing.linear}),
        3,
        false,
      );
    } else {
      scale.value = withTiming(0, {duration: 200});
      opacity.value = withTiming(0, {duration: 200});
      confetti.value = 0;
    }
  }, [visible, milestone]);

  const modalStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    return {
      transform: [{scale: scale.value}],
    };
  });

  const confettiStyle = useAnimatedStyle(() => {
    const rotate = interpolate(confetti.value, [0, 1], [0, 360]);
    const translateY = interpolate(confetti.value, [0, 1], [0, -100]);
    return {
      transform: [{rotate: `${rotate}deg`}, {translateY}],
      opacity: interpolate(confetti.value, [0, 0.5, 1], [1, 1, 0]),
    };
  });

  if (!milestone) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, modalStyle]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.content, contentStyle]}>
          {/* Confetti effect */}
          <Animated.View style={[styles.confetti1, confettiStyle]}>
            <MaterialCommunityIcons
              name="star"
              size={30}
              color={theme.colors.accent}
            />
          </Animated.View>
          <Animated.View style={[styles.confetti2, confettiStyle]}>
            <MaterialCommunityIcons
              name="star"
              size={25}
              color={theme.colors.primary}
            />
          </Animated.View>
          <Animated.View style={[styles.confetti3, confettiStyle]}>
            <MaterialCommunityIcons
              name="star"
              size={28}
              color={theme.colors.secondary}
            />
          </Animated.View>

          {/* Main content */}
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons
              name="trophy"
              size={80}
              color={theme.colors.accent}
            />
          </View>

          <Text style={styles.title}>Milestone Achieved!</Text>
          <Text style={styles.message}>{milestone.message}</Text>
          <Text style={styles.streakCount}>{streakCount} Days</Text>

          <View style={styles.buttonContainer}>
            {onShare && (
              <Pressable style={styles.shareButton} onPress={onShare}>
                <MaterialCommunityIcons
                  name="share-variant"
                  size={20}
                  color={theme.colors.primary}
                />
                <Text style={styles.shareButtonText}>Share</Text>
              </Pressable>
            )}
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Awesome!</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.xl,
    padding: theme.spacing.xl,
    width: SCREEN_WIDTH * 0.85,
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.base,
    textAlign: 'center',
  },
  streakCount: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.accent,
    marginBottom: theme.spacing.xl,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: theme.spacing.base,
    width: '100%',
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    gap: theme.spacing.xs,
  },
  shareButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primary,
  },
  closeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.spacing.md,
    backgroundColor: theme.colors.primary,
  },
  closeButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textInverse,
  },
  confetti1: {
    position: 'absolute',
    top: 50,
    left: 50,
  },
  confetti2: {
    position: 'absolute',
    top: 60,
    right: 60,
  },
  confetti3: {
    position: 'absolute',
    top: 40,
    left: '50%',
  },
});