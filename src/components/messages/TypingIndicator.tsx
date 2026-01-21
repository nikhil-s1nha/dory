/**
 * Typing Indicator Component
 * Animated three-dot indicator showing when partner is typing
 */

import React, {useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import {theme} from '@theme';

interface TypingIndicatorProps {
  partnerName: string;
  visible: boolean;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  partnerName,
  visible,
}) => {
  const opacity1 = useSharedValue(0.3);
  const opacity2 = useSharedValue(0.3);
  const opacity3 = useSharedValue(0.3);

  useEffect(() => {
    if (visible) {
      // Animate dots in sequence
      opacity1.value = withRepeat(
        withSequence(
          withTiming(1, {duration: 400, easing: Easing.inOut(Easing.ease)}),
          withTiming(0.3, {duration: 400, easing: Easing.inOut(Easing.ease)}),
        ),
        -1,
        false,
      );

      opacity2.value = withRepeat(
        withSequence(
          withTiming(0.3, {duration: 400, easing: Easing.inOut(Easing.ease)}),
          withTiming(1, {duration: 400, easing: Easing.inOut(Easing.ease)}),
          withTiming(0.3, {duration: 400, easing: Easing.inOut(Easing.ease)}),
        ),
        -1,
        false,
      );

      opacity3.value = withRepeat(
        withSequence(
          withTiming(0.3, {duration: 800, easing: Easing.inOut(Easing.ease)}),
          withTiming(1, {duration: 400, easing: Easing.inOut(Easing.ease)}),
          withTiming(0.3, {duration: 400, easing: Easing.inOut(Easing.ease)}),
        ),
        -1,
        false,
      );
    } else {
      opacity1.value = withTiming(0.3, {duration: 200});
      opacity2.value = withTiming(0.3, {duration: 200});
      opacity3.value = withTiming(0.3, {duration: 200});
    }
  }, [visible]);

  const dotStyle1 = useAnimatedStyle(() => ({
    opacity: opacity1.value,
  }));

  const dotStyle2 = useAnimatedStyle(() => ({
    opacity: opacity2.value,
  }));

  const dotStyle3 = useAnimatedStyle(() => ({
    opacity: opacity3.value,
  }));

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.text}>{partnerName} is typing</Text>
        <View style={styles.dotsContainer}>
          <Animated.View style={[styles.dot, dotStyle1]} />
          <Animated.View style={[styles.dot, dotStyle2]} />
          <Animated.View style={[styles.dot, dotStyle3]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.xs,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    maxWidth: '75%',
  },
  text: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.xs,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.textSecondary,
    marginHorizontal: 2,
  },
});
