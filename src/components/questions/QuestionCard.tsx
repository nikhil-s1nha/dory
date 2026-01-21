/**
 * Question Card Component
 * Swipeable card displaying a question with swipe gestures
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {Question} from '@utils/types';
import {theme} from '@theme';

interface QuestionCardProps {
  question: Question;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onPress?: () => void;
  swipeable?: boolean;
}

const SWIPE_THRESHOLD = 120;

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  onSwipeLeft,
  onSwipeRight,
  onPress,
  swipeable = true,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const getQuestionTypeIcon = (type: Question['type']) => {
    switch (type) {
      case 'voice':
        return 'microphone';
      case 'photo':
        return 'camera';
      case 'multiple_choice':
        return 'format-list-bulleted';
      case 'this_or_that':
        return 'swap-horizontal';
      default:
        return 'text';
    }
  };

  const panGesture = Gesture.Pan()
    .enabled(swipeable)
    .onUpdate(event => {
      translateX.value = event.translationX;
      translateY.value = event.translationY * 0.1; // Less vertical movement
      // Scale down slightly when swiping
      scale.value = 1 - Math.abs(event.translationX) / 1000;
    })
    .onEnd(event => {
      if (Math.abs(event.translationX) > SWIPE_THRESHOLD) {
        // Swipe threshold met
        if (event.translationX > 0) {
          // Swipe right - answer
          translateX.value = withSpring(500, {}, () => {
            runOnJS(onSwipeRight || (() => {}))();
          });
        } else {
          // Swipe left - skip
          translateX.value = withSpring(-500, {}, () => {
            runOnJS(onSwipeLeft || (() => {}))();
          });
        }
        translateY.value = withSpring(0);
        scale.value = withSpring(0.8);
      } else {
        // Snap back
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-300, 0, 300],
      [-15, 0, 15],
    );
    const opacity = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [1, 0.7],
    );

    return {
      transform: [
        {translateX: translateX.value},
        {translateY: translateY.value},
        {rotate: `${rotation}deg`},
        {scale: scale.value},
      ],
      opacity,
    };
  });

  const swipeIndicatorStyle = useAnimatedStyle(() => {
    const leftOpacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
    );
    const rightOpacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
    );

    return {
      opacity: Math.max(leftOpacity, rightOpacity),
    };
  });

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, animatedStyle]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            disabled={!onPress}>
            {/* Category Badge */}
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>
                {question.category.charAt(0).toUpperCase() +
                  question.category.slice(1).replace(/_/g, ' ')}
              </Text>
            </View>

            {/* Question Icon */}
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name={getQuestionTypeIcon(question.type)}
                size={32}
                color={theme.colors.primary}
              />
            </View>

            {/* Question Text */}
            <Text style={styles.questionText}>{question.text}</Text>

            {/* Swipe Indicators */}
            {swipeable && (
              <Animated.View style={[styles.swipeIndicators, swipeIndicatorStyle]}>
                {translateX.value < 0 ? (
                  <View style={styles.skipIndicator}>
                    <MaterialCommunityIcons
                      name="close"
                      size={24}
                      color={theme.colors.error}
                    />
                    <Text style={styles.skipText}>Skip</Text>
                  </View>
                ) : (
                  <View style={styles.answerIndicator}>
                    <MaterialCommunityIcons
                      name="check"
                      size={24}
                      color={theme.colors.success}
                    />
                    <Text style={styles.answerText}>Answer</Text>
                  </View>
                )}
              </Animated.View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    padding: theme.spacing.base,
    height: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.sm,
    marginBottom: theme.spacing.base,
  },
  categoryText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primaryDark,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.base,
  },
  questionText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.lg,
    flex: 1,
    justifyContent: 'center',
  },
  swipeIndicators: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipIndicator: {
    alignItems: 'center',
  },
  answerIndicator: {
    alignItems: 'center',
  },
  skipText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.error,
  },
  answerText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.success,
  },
});
