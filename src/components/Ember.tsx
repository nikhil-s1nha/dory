/**
 * Ember Mascot Component
 * Animated flame mascot that displays different emotional states based on streak status
 */

import React, {useEffect} from 'react';
import {View, StyleSheet, Pressable, Dimensions} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import Svg, {Path, Circle, Ellipse, Defs, LinearGradient, Stop} from 'react-native-svg';
import {theme} from '@theme';

interface EmberProps {
  streakCount: number;
  hoursRemaining: number;
  isActive: boolean;
  onPress?: () => void;
}

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const EMBER_SIZE = 120;

/**
 * Determine Ember's emotional state based on streak status
 */
function getEmberState(hoursRemaining: number, isActive: boolean): {
  state: 'happy' | 'excited' | 'worried' | 'urgent' | 'sad';
  color: string;
  intensity: number;
} {
  if (!isActive) {
    return {state: 'sad', color: theme.colors.textSecondary, intensity: 0.3};
  }

  if (hoursRemaining > 12) {
    return {state: 'happy', color: theme.colors.accent, intensity: 1.0};
  }
  
  if (hoursRemaining > 6) {
    return {state: 'happy', color: theme.colors.accent, intensity: 0.9};
  }

  if (hoursRemaining > 3) {
    return {state: 'worried', color: '#FFA500', intensity: 0.7};
  }

  return {state: 'urgent', color: theme.colors.error, intensity: 1.0};
}

export const Ember: React.FC<EmberProps> = ({
  streakCount,
  hoursRemaining,
  isActive,
  onPress,
}) => {
  const emberState = getEmberState(hoursRemaining, isActive);
  
  // Animation values
  const bounce = useSharedValue(0);
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);
  const pulse = useSharedValue(1);
  const eyeBlink = useSharedValue(1);
  const flameParticles = useSharedValue(0);

  // Main bounce animation (continuous)
  useEffect(() => {
    if (emberState.state === 'happy' || emberState.state === 'excited') {
      bounce.value = withRepeat(
        withSpring(1, {
          damping: 2,
          stiffness: 100,
        }),
        -1,
        true,
      );
    } else if (emberState.state === 'worried') {
      bounce.value = withRepeat(
        withSpring(0.5, {
          damping: 4,
          stiffness: 80,
        }),
        -1,
        true,
      );
    } else {
      bounce.value = 0;
    }
  }, [emberState.state]);

  // Urgent state - fast pulse and shake
  useEffect(() => {
    if (emberState.state === 'urgent') {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.2, {duration: 300, easing: Easing.inOut(Easing.ease)}),
          withTiming(1, {duration: 300, easing: Easing.inOut(Easing.ease)}),
        ),
        -1,
        true,
      );

      shake.value = withRepeat(
        withSequence(
          withTiming(-5, {duration: 50}),
          withTiming(5, {duration: 50}),
          withTiming(-5, {duration: 50}),
          withTiming(0, {duration: 50}),
        ),
        -1,
        false,
      );
    } else {
      pulse.value = withTiming(1, {duration: 200});
      shake.value = withTiming(0, {duration: 200});
    }
  }, [emberState.state]);

  // Celebration animation on press
  const handlePress = () => {
    if (onPress) {
      // Play celebration animation
      scale.value = withSequence(
        withSpring(1.3, {damping: 3, stiffness: 200}),
        withSpring(1, {damping: 4, stiffness: 150}),
      );
      onPress();
    }
  };

  // Eye blink animation (periodic)
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      eyeBlink.value = withSequence(
        withTiming(0, {duration: 100}),
        withTiming(1, {duration: 100}),
      );
    }, 3000 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  // Flame particles animation
  useEffect(() => {
    if (emberState.state === 'happy' || emberState.state === 'excited') {
      flameParticles.value = withRepeat(
        withTiming(1, {duration: 2000, easing: Easing.linear}),
        -1,
        false,
      );
    } else {
      flameParticles.value = 0;
    }
  }, [emberState.state]);

  // Animated styles
  const containerStyle = useAnimatedStyle(() => {
    const bounceOffset = interpolate(bounce.value, [0, 1], [0, -10]);
    const scaleValue = scale.value * pulse.value;
    return {
      transform: [
        {translateY: bounceOffset},
        {scale: scaleValue},
        {translateX: shake.value},
      ],
    };
  });

  const eyeStyle = useAnimatedStyle(() => {
    return {
      opacity: eyeBlink.value,
    };
  });

  const particleStyle1 = useAnimatedStyle(() => {
    const offset = interpolate(flameParticles.value, [0, 1], [0, -30]);
    const opacity = interpolate(flameParticles.value, [0, 0.5, 1], [0, 1, 0]);
    return {
      transform: [{translateY: offset}],
      opacity,
    };
  });

  const particleStyle2 = useAnimatedStyle(() => {
    const offset = interpolate(flameParticles.value, [0, 1], [0, -40]);
    const opacity = interpolate(flameParticles.value, [0, 0.3, 0.8, 1], [0, 1, 1, 0]);
    return {
      transform: [{translateY: offset}],
      opacity,
    };
  });

  // Render flame shape using SVG
  const renderFlame = () => {
    const flameColor = emberState.color;
    const flameIntensity = emberState.intensity;

    return (
      <View style={styles.flameContainer}>
        <Svg width={EMBER_SIZE} height={EMBER_SIZE} viewBox="0 0 120 120">
          <Defs>
            <LinearGradient id="flameGradient" x1="60" y1="0" x2="60" y2="120">
              <Stop offset="0%" stopColor={flameColor} stopOpacity={flameIntensity} />
              <Stop
                offset="50%"
                stopColor={flameColor}
                stopOpacity={flameIntensity * 0.8}
              />
              <Stop
                offset="100%"
                stopColor={flameColor}
                stopOpacity={flameIntensity * 0.4}
              />
            </LinearGradient>
          </Defs>

          {/* Main flame body */}
          <Path
            d="M60 20 C50 20, 40 30, 45 50 C40 55, 35 65, 40 80 C35 85, 35 95, 45 100 C50 105, 55 110, 60 115 C65 110, 70 105, 75 100 C85 95, 85 85, 80 80 C85 65, 80 55, 75 50 C80 30, 70 20, 60 20 Z"
            fill="url(#flameGradient)"
          />

          {/* Inner flame highlight */}
          <Ellipse
            cx="60"
            cy="60"
            rx="15"
            ry="30"
            fill={flameColor}
            opacity={flameIntensity * 0.6}
          />

          {/* Eyes - will be animated via opacity overlay */}
          <Circle cx="50" cy="50" r="4" fill={theme.colors.text} />
          <Circle cx="70" cy="50" r="4" fill={theme.colors.text} />

          {/* Mouth - changes based on state */}
          {emberState.state === 'happy' || emberState.state === 'excited' ? (
            <Path
              d="M50 65 Q60 75 70 65"
              stroke={theme.colors.text}
              strokeWidth="2"
              fill="none"
            />
          ) : emberState.state === 'worried' ? (
            <Path
              d="M50 65 Q60 70 70 65"
              stroke={theme.colors.text}
              strokeWidth="2"
              fill="none"
            />
          ) : emberState.state === 'urgent' ? (
            <Path
              d="M50 68 Q60 63 70 68"
              stroke={theme.colors.text}
              strokeWidth="2"
              fill="none"
            />
          ) : (
            <Path
              d="M50 70 Q60 65 70 70"
              stroke={theme.colors.text}
              strokeWidth="2"
              fill="none"
            />
          )}
        </Svg>

        {/* Flame particles (only when happy/excited) - rendered outside SVG */}
        {(emberState.state === 'happy' || emberState.state === 'excited') && (
          <>
            <Animated.View style={[styles.particle, particleStyle1]}>
              <View
                style={[
                  styles.particleCircle,
                  {backgroundColor: flameColor, opacity: 0.6},
                ]}
              />
            </Animated.View>
            <Animated.View style={[styles.particle, particleStyle2, {left: 55, top: 15}]}>
              <View
                style={[
                  styles.particleCircleSmall,
                  {backgroundColor: flameColor, opacity: 0.5},
                ]}
              />
            </Animated.View>
            <Animated.View style={[styles.particle, particleStyle1, {left: 45, top: 5}]}>
              <View
                style={[
                  styles.particleCircleSmall,
                  {backgroundColor: flameColor, opacity: 0.4},
                ]}
              />
            </Animated.View>
          </>
        )}

        {/* Eyes overlay (using Animated.View for blinking effect) */}
        <Animated.View style={[styles.eyesOverlay, eyeStyle]} pointerEvents="none">
          <View style={styles.eyeLeft} />
          <View style={styles.eyeRight} />
        </Animated.View>
      </View>
    );
  };

  return (
    <Pressable onPress={handlePress} onLongPress={onPress}>
      <Animated.View style={[styles.container, containerStyle]}>
        {renderFlame()}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: EMBER_SIZE,
    height: EMBER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameContainer: {
    width: EMBER_SIZE,
    height: EMBER_SIZE,
    position: 'relative',
  },
  particle: {
    position: 'absolute',
    left: 35,
    top: 10,
  },
  particleCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  particleCircleSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  eyesOverlay: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 42,
    height: 8,
  },
  eyeLeft: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.background,
  },
  eyeRight: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.background,
  },
});