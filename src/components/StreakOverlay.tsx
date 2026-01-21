/**
 * Streak Overlay Component
 * Slide-up overlay showing different activity types that contribute to streak
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {theme} from '@theme';

interface ActivityItem {
  id: string;
  type: 'question' | 'game' | 'photo' | 'canvas';
  label: string;
  completed: boolean;
  icon: string;
}

interface StreakOverlayProps {
  visible: boolean;
  activities: ActivityItem[];
  onClose: () => void;
}

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');
const OVERLAY_HEIGHT = SCREEN_HEIGHT * 0.6;

export const StreakOverlay: React.FC<StreakOverlayProps> = ({
  visible,
  activities,
  onClose,
}) => {
  const translateY = useSharedValue(OVERLAY_HEIGHT);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 150,
      });
      opacity.value = withTiming(1, {duration: 300});
    } else {
      translateY.value = withSpring(OVERLAY_HEIGHT, {
        damping: 15,
        stiffness: 150,
      });
      opacity.value = withTiming(0, {duration: 200});
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => {
    return {
      transform: [{translateY: translateY.value}],
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'question':
        return 'chat-question';
      case 'game':
        return 'gamepad-variant';
      case 'photo':
        return 'camera-image';
      case 'canvas':
        return 'draw-pen';
      default:
        return 'circle';
    }
  };

  const completedCount = activities.filter(a => a.completed).length;
  const totalCount = activities.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        {/* Handle bar */}
        <View style={styles.handleBar} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Daily Activities</Text>
          <Text style={styles.headerSubtitle}>
            {completedCount} of {totalCount} completed
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {width: `${(completedCount / totalCount) * 100}%`},
              ]}
            />
          </View>
        </View>

        {/* Activities list */}
        <ScrollView style={styles.activitiesList} showsVerticalScrollIndicator={false}>
          {activities.map(activity => (
            <View key={activity.id} style={styles.activityItem}>
              <View style={styles.activityIcon}>
                <MaterialCommunityIcons
                  name={getActivityIcon(activity.type) as any}
                  size={24}
                  color={
                    activity.completed
                      ? theme.colors.primary
                      : theme.colors.textSecondary
                  }
                />
              </View>
              <View style={styles.activityContent}>
                <Text
                  style={[
                    styles.activityLabel,
                    activity.completed && styles.activityLabelCompleted,
                  ]}>
                  {activity.label}
                </Text>
              </View>
              {activity.completed ? (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={24}
                  color={theme.colors.success}
                />
              ) : (
                <MaterialCommunityIcons
                  name="circle-outline"
                  size={24}
                  color={theme.colors.border}
                />
              )}
            </View>
          ))}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Complete activities together to maintain your streak!
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: OVERLAY_HEIGHT,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.spacing.xl,
    borderTopRightRadius: theme.spacing.xl,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.base,
  },
  header: {
    paddingHorizontal: theme.spacing.base,
    paddingBottom: theme.spacing.base,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  headerSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  progressContainer: {
    paddingHorizontal: theme.spacing.base,
    paddingBottom: theme.spacing.lg,
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
  },
  activitiesList: {
    flex: 1,
    paddingHorizontal: theme.spacing.base,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.base,
  },
  activityContent: {
    flex: 1,
  },
  activityLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  activityLabelCompleted: {
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeight.medium,
  },
  footer: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.base,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});