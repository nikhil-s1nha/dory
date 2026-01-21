/**
 * Date Card Component
 * Swipeable card displaying a date idea with swipe gestures
 */

import React from 'react';
import {View, Text, StyleSheet, Image, TouchableOpacity} from 'react-native';
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
import {DateIdea} from '@utils/types';
import {theme} from '@theme';

interface DateCardProps {
  dateIdea: DateIdea;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  style?: any;
  isActive?: boolean;
}

const SWIPE_THRESHOLD = 120;

export const DateCard: React.FC<DateCardProps> = ({
  dateIdea,
  onSwipeLeft,
  onSwipeRight,
  style,
  isActive = true,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .enabled(isActive)
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
          // Swipe right - like
          translateX.value = withSpring(500, {}, () => {
            runOnJS(onSwipeRight || (() => {}))();
          });
        } else {
          // Swipe left - pass
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

  const leftIndicatorStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
    );
    return {opacity};
  });

  const rightIndicatorStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
    );
    return {opacity};
  });

  return (
    <GestureHandlerRootView style={[styles.container, style]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, animatedStyle]}>
          {/* Image */}
          <View style={styles.imageContainer}>
            <Image
              source={
                dateIdea.imageUrl
                  ? {uri: dateIdea.imageUrl}
                  : require('@assets/images/placeholder.png')
              }
              style={styles.image}
              resizeMode="cover"
            />
            {/* Category Badge */}
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>
                {dateIdea.category.charAt(0).toUpperCase() +
                  dateIdea.category.slice(1)}
              </Text>
            </View>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Title */}
            <Text style={styles.title}>{dateIdea.title}</Text>

            {/* Location */}
            <View style={styles.locationRow}>
              <MaterialCommunityIcons
                name="map-marker"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.locationText} numberOfLines={1}>
                {dateIdea.location.name}
              </Text>
            </View>

            {/* Description */}
            <Text style={styles.description} numberOfLines={3}>
              {dateIdea.description}
            </Text>

            {/* Meta Info */}
            <View style={styles.metaRow}>
              {dateIdea.price && (
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons
                    name="currency-usd"
                    size={14}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.metaText}>{dateIdea.price}</Text>
                </View>
              )}
              {dateIdea.duration && (
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={14}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.metaText}>{dateIdea.duration}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Swipe Indicators */}
          <View style={styles.swipeIndicators}>
            <Animated.View style={[styles.passIndicator, leftIndicatorStyle]}>
              <MaterialCommunityIcons
                name="close"
                size={48}
                color={theme.colors.error}
              />
              <Text style={styles.passText}>Pass</Text>
            </Animated.View>
            <Animated.View style={[styles.likeIndicator, rightIndicatorStyle]}>
              <MaterialCommunityIcons
                name="heart"
                size={48}
                color={theme.colors.success}
              />
              <Text style={styles.likeText}>Like</Text>
            </Animated.View>
          </View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 500,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.spacing.md,
    overflow: 'hidden',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: theme.spacing.base,
    left: theme.spacing.base,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.spacing.sm,
  },
  categoryText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.primaryDark,
  },
  content: {
    padding: theme.spacing.base,
    flex: 1,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  locationText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
    flex: 1,
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeight.relaxed * theme.typography.fontSize.base,
    marginBottom: theme.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: theme.spacing.base,
    marginTop: 'auto',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  metaText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
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
  passIndicator: {
    alignItems: 'center',
  },
  likeIndicator: {
    alignItems: 'center',
  },
  passText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.error,
  },
  likeText: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.success,
  },
});
