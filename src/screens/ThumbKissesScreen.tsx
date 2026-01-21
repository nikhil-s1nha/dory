/**
 * Thumb Kisses Screen
 * Synchronized touch feature that detects when both partners tap within 500ms
 * Triggers haptic feedback to simulate physical connection
 */

import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Vibration,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import {recordTap, subscribeToPartnerTaps, cleanupOldTaps} from '@services/thumbKissesService';
import {theme} from '@theme';
import type {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import type {ThumbKiss} from '@utils/types';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const TOUCH_AREA_SIZE = SCREEN_WIDTH * 0.7;
const SYNC_WINDOW_MS = 500;

const toMillisMaybe = (
  value: string | FirebaseFirestoreTypes.Timestamp,
): number => {
  // Firestore Timestamp has toMillis()
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as FirebaseFirestoreTypes.Timestamp).toMillis();
  }
  return new Date(value as string).getTime();
};

export const ThumbKissesScreen = () => {
  const navigation = useNavigation();
  const {user} = useAuthStore();
  const {partnership} = usePartnershipStore();
  const [isPressed, setIsPressed] = useState(false);
  const [partnerPressed, setPartnerPressed] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Animation values
  const syncAnimation = useRef(new Animated.Value(1)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const glowAnimation = useRef(new Animated.Value(0)).current;
  const scaleAnimation = useRef(new Animated.Value(1)).current;

  // Track tap timestamps
  const userTapTimestamp = useRef<number | null>(null);
  const partnerTapTimestamp = useRef<number | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get partner ID
  const partnerId = partnership
    ? partnership.userId1 === user?.id
      ? partnership.userId2
      : partnership.userId1
    : null;

  // Idle pulse animation
  useEffect(() => {
    if (!isPressed && !syncSuccess) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.05,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1.0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isPressed, syncSuccess, pulseAnimation]);

  // Partner press glow animation
  useEffect(() => {
    if (partnerPressed) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnimation, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      glowAnimation.setValue(0);
    }
  }, [partnerPressed, glowAnimation]);

  // Subscribe to partner taps
  useEffect(() => {
    if (!partnership || !partnerId || !user) {
      setIsLoading(false);
      if (!partnership) {
        setError('Partnership not found');
      } else if (!partnerId) {
        setError('Partner not found');
      }
      return;
    }

    setIsLoading(false);

    // Cleanup old taps on mount
    cleanupOldTaps(partnership.id);

    // Set up periodic cleanup (every 5 minutes)
    const cleanupInterval = setInterval(() => {
      cleanupOldTaps(partnership.id);
    }, 5 * 60 * 1000);

    // Subscribe to partner taps
    const unsubscribe = subscribeToPartnerTaps(
      partnership.id,
      partnerId,
      (tap) => {
        if (tap) {
          const tapTime = toMillisMaybe(tap.timestamp as ThumbKiss['timestamp']);
          partnerTapTimestamp.current = tapTime;
          setPartnerPressed(true);

          // Check for sync
          if (userTapTimestamp.current !== null) {
            const timeDiff = Math.abs(tapTime - userTapTimestamp.current);
            if (timeDiff < SYNC_WINDOW_MS) {
              triggerSyncSuccess();
            }
          }

          // Reset partner press state after a delay
          setTimeout(() => {
            setPartnerPressed(false);
          }, 1000);
        }
      },
    );

    return () => {
      unsubscribe();
      clearInterval(cleanupInterval);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [partnership, partnerId, user]);

  // Clear sync success state after animation
  useEffect(() => {
    if (syncSuccess) {
      const timeout = setTimeout(() => {
        setSyncSuccess(false);
        syncAnimation.setValue(1);
        scaleAnimation.setValue(1);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [syncSuccess, syncAnimation, scaleAnimation]);

  const triggerSyncSuccess = () => {
    // Prevent multiple rapid syncs
    if (syncSuccess) return;

    setSyncSuccess(true);
    setLastSyncTime(new Date());

    // Haptic feedback
    if (Platform.OS === 'ios') {
      // iOS vibration pattern: [0, 200, 100, 200]
      Vibration.vibrate([0, 200, 100, 200]);
    } else {
      // Android vibration pattern
      Vibration.vibrate([0, 200, 100, 200]);
    }

    // Success animation
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnimation, {
          toValue: 1.2,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(syncAnimation, {
          toValue: 2,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(scaleAnimation, {
          toValue: 1.0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(syncAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Clear timestamps
    userTapTimestamp.current = null;
    partnerTapTimestamp.current = null;
  };

  const handlePressIn = async () => {
    if (!partnership || !user || syncSuccess) return;

    setIsPressed(true);
    // We'll set this to the server-resolved timestamp after recordTap() completes.
    userTapTimestamp.current = null;

    // Press animation
    Animated.timing(scaleAnimation, {
      toValue: 0.95,
      duration: 100,
      useNativeDriver: true,
    }).start();

    try {
      // Record tap
      const savedTap = await recordTap(partnership.id, user.id);
      const tapTime = toMillisMaybe(savedTap.timestamp);
      userTapTimestamp.current = tapTime;

      // Check if partner already tapped (within sync window)
      if (partnerTapTimestamp.current !== null) {
        const timeDiff = Math.abs(tapTime - partnerTapTimestamp.current);
        if (timeDiff < SYNC_WINDOW_MS) {
          triggerSyncSuccess();
        }
      }

      // Clear user tap after sync window expires
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        userTapTimestamp.current = null;
      }, SYNC_WINDOW_MS);
    } catch (error) {
      console.error('Error recording tap:', error);
    }
  };

  const handlePressOut = () => {
    setIsPressed(false);

    // Reset press animation
    Animated.timing(scaleAnimation, {
      toValue: 1.0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  // Determine status text
  const getStatusText = () => {
    if (syncSuccess) {
      return 'Connected! 💕';
    }
    if (partnerPressed && isPressed) {
      return 'Both touching...';
    }
    if (partnerPressed) {
      return 'Partner is touching...';
    }
    if (isPressed) {
      return 'You\'re touching...';
    }
    return 'Tap to connect';
  };

  // Determine touch area color
  const getTouchAreaColor = () => {
    if (syncSuccess) {
      return theme.colors.success;
    }
    if (isPressed || partnerPressed) {
      return theme.colors.primary;
    }
    return theme.colors.secondary;
  };

  const glowOpacity = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !partnership || !user || !partnerId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.colors.text}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Thumb Kisses</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>
            {error || 'Unable to load Thumb Kisses'}
          </Text>
          <Text style={styles.errorSubtext}>
            Make sure you have an active partnership
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thumb Kisses</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            Feel your partner's touch from anywhere
          </Text>
          <Text style={styles.instructionsSubtext}>
            Tap your screen when your partner taps theirs. If you both tap
            within 500ms, you'll feel a vibration!
          </Text>
        </View>

        {/* Touch Area */}
        <View style={styles.touchAreaContainer}>
          {/* Glow effect for partner press */}
          {partnerPressed && (
            <Animated.View
              style={[
                styles.glowCircle,
                {
                  opacity: glowOpacity,
                  transform: [{scale: scaleAnimation}],
                },
              ]}
            />
          )}

          {/* Main touch circle */}
          <Animated.View
            style={[
              styles.animatedContainer,
              {
                transform: [
                  {scale: Animated.multiply(pulseAnimation, scaleAnimation)},
                ],
              },
            ]}>
            <TouchableOpacity
              style={[
                styles.touchArea,
                {
                  backgroundColor: getTouchAreaColor(),
                  width: TOUCH_AREA_SIZE,
                  height: TOUCH_AREA_SIZE,
                  borderRadius: TOUCH_AREA_SIZE / 2,
                },
              ]}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              activeOpacity={0.9}>
              <Animated.View
                style={[
                  styles.innerCircle,
                  {
                    transform: [{scale: syncAnimation}],
                  },
                ]}>
                <MaterialCommunityIcons
                  name="hand-heart"
                  size={TOUCH_AREA_SIZE * 0.3}
                  color={theme.colors.textInverse}
                />
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Status Text */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>

        {/* Last Sync Time */}
        {lastSyncTime && (
          <View style={styles.lastSyncContainer}>
            <Text style={styles.lastSyncText}>
              Last connected:{' '}
              {lastSyncTime.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.base,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.error,
    marginTop: theme.spacing.base,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  instructionsContainer: {
    marginBottom: theme.spacing['2xl'],
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  instructionsText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  instructionsSubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  touchAreaContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: theme.spacing['2xl'],
  },
  animatedContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  touchArea: {
    justifyContent: 'center',
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
  innerCircle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowCircle: {
    position: 'absolute',
    width: TOUCH_AREA_SIZE * 1.3,
    height: TOUCH_AREA_SIZE * 1.3,
    borderRadius: (TOUCH_AREA_SIZE * 1.3) / 2,
    backgroundColor: theme.colors.primaryLight,
  },
  statusContainer: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
  },
  statusText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  lastSyncContainer: {
    marginTop: theme.spacing.base,
    alignItems: 'center',
  },
  lastSyncText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
});
