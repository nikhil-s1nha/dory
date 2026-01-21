/**
 * Onboarding Tutorial screen - Final step of onboarding
 * Swipeable carousel with app features overview
 */

import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {AuthButton} from '@components/auth/AuthButton';
import {useAuthStore} from '@store/authSlice';
import {theme} from '@theme';
import type {AuthStackParamList} from '@utils/types';
import {requestNotificationPermissions} from '@services/notificationSettings';
import {initializeNotifications} from '@services/notificationService';
import {Alert, Linking} from 'react-native';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList>;

const {width: SCREEN_WIDTH} = Dimensions.get('window');

interface TutorialSlide {
  id: number;
  emoji: string;
  title: string;
  description: string;
}

const slides: TutorialSlide[] = [
  {
    id: 1,
    emoji: '💭',
    title: 'Daily Questions',
    description:
      'Answer thought-provoking questions together and reveal your answers when both are ready. Learn something new about each other every day.',
  },
  {
    id: 2,
    emoji: '🎨',
    title: 'Canvas Drawing',
    description:
      'Leave notes, drawings, and messages for each other on a shared canvas. Express your creativity and connect through art.',
  },
  {
    id: 3,
    emoji: '🔥',
    title: 'Streak System',
    description:
      'Build your connection streak by engaging daily. Watch Ember, your mascot, grow as you maintain your daily connection habit.',
  },
  {
    id: 4,
    emoji: '📱',
    title: 'Stay Connected',
    description:
      'Access quick widgets and reminders to keep your relationship front and center. Never miss a moment to connect.',
  },
  {
    id: 5,
    emoji: '🔔',
    title: 'Enable Notifications',
    description:
      'Get notified when your partner answers, shares photos, or when your streak needs attention. You can customize these later in settings.',
  },
];

export const OnboardingTutorialScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const setOnboardingComplete = useAuthStore(
    state => state.setOnboardingComplete,
  );
  const user = useAuthStore(state => state.user);
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slideIndex = Math.round(
      event.nativeEvent.contentOffset.x / SCREEN_WIDTH,
    );
    setCurrentSlide(slideIndex);
  };

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1;
      scrollViewRef.current?.scrollTo({
        x: nextSlide * SCREEN_WIDTH,
        animated: true,
      });
      setCurrentSlide(nextSlide);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = async () => {
    // Request notification permissions before completing onboarding
    if (user?.id) {
      try {
        const granted = await requestNotificationPermissions();
        if (granted) {
          // Initialize notifications if permission granted
          await initializeNotifications(user.id);
        } else {
          // Show alert with instructions to enable in settings
          Alert.alert(
            'Notifications Disabled',
            'You can enable notifications later in Settings to stay connected with your partner.',
            [
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings(),
              },
              {
                text: 'Maybe Later',
                style: 'cancel',
              },
            ],
          );
        }
      } catch (error) {
        console.error('Error requesting notification permissions:', error);
        // Continue with onboarding even if notification setup fails
      }
    }

    setOnboardingComplete();
    // Navigation will automatically switch to Main stack via auth state
  };

  const renderSlide = (slide: TutorialSlide) => (
    <View key={slide.id} style={styles.slide}>
      <Text style={styles.emoji}>{slide.emoji}</Text>
      <Text style={styles.slideTitle}>{slide.title}</Text>
      <Text style={styles.slideDescription}>{slide.description}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Welcome to Candle</Text>
          {currentSlide < slides.length - 1 && (
            <Text
              style={styles.skipButton}
              onPress={handleSkip}>
              Skip
            </Text>
          )}
        </View>

        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={styles.scrollView}>
          {slides.map(renderSlide)}
        </ScrollView>

        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentSlide && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.footer}>
          <AuthButton
            title={currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
            onPress={handleNext}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  headerTitle: {
    ...theme.typography.styles.heading3,
    color: theme.colors.text,
  },
  skipButton: {
    ...theme.typography.styles.body,
    color: theme.colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emoji: {
    fontSize: 100,
    marginBottom: theme.spacing.xl,
  },
  slideTitle: {
    ...theme.typography.styles.heading2,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  slideDescription: {
    ...theme.typography.styles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: theme.colors.primary,
  },
  footer: {
    padding: theme.spacing.lg,
  },
});
