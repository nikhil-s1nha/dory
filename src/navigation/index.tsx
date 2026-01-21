/**
 * Navigation configuration
 * Sets up React Navigation with bottom tabs and stack navigators
 */

import React, {useRef, useEffect, useState} from 'react';
import {NavigationContainer, createNavigationContainerRef} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import {ActivityIndicator, View, Platform} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {theme} from '@theme';
import {useAuthStore} from '@store/authSlice';

// Screens
import {ConnectScreen} from '@screens/ConnectScreen';
import {GamesScreen} from '@screens/GamesScreen';
import {DateIdeasScreen} from '@screens/DateIdeasScreen';
import {PhotosScreen} from '@screens/PhotosScreen';
import {ProfileScreen} from '@screens/ProfileScreen';
import {SettingsScreen} from '@screens/SettingsScreen';
import {QuestionDetailScreen} from '@screens/QuestionDetailScreen';
import {DeckBrowserScreen} from '@screens/DeckBrowserScreen';
import {QuestionHistoryScreen} from '@screens/QuestionHistoryScreen';
import {CanvasEditorScreen} from '@screens/CanvasEditorScreen';
import {CanvasGalleryScreen} from '@screens/CanvasGalleryScreen';
import {PhotoDetailScreen} from '@screens/PhotoDetailScreen';
import {DateIdeaDetailScreen} from '@screens/DateIdeaDetailScreen';
import {WhosMoreLikelyScreen} from '@screens/games/WhosMoreLikelyScreen';
import {AnagramsScreen} from '@screens/games/AnagramsScreen';
import {WhatYouSayingScreen} from '@screens/games/WhatYouSayingScreen';
import {FourInARowScreen} from '@screens/games/FourInARowScreen';
import {DrawDuelScreen} from '@screens/games/DrawDuelScreen';
import {PerfectPairScreen} from '@screens/games/PerfectPairScreen';
import {StickerGeneratorScreen} from '@screens/games/StickerGeneratorScreen';
import {GameLeaderboardScreen} from '@screens/games/GameLeaderboardScreen';
import {ChatScreen} from '@screens/ChatScreen';
import {ThumbKissesScreen} from '@screens/ThumbKissesScreen';
import {CountdownScreen} from '@screens/CountdownScreen';
import {ReferralScreen} from '@screens/ReferralScreen';
import {WelcomeScreen} from '@screens/auth/WelcomeScreen';
import {LoginScreen} from '@screens/auth/LoginScreen';
import {SignupScreen} from '@screens/auth/SignupScreen';
import {ForgotPasswordScreen} from '@screens/auth/ForgotPasswordScreen';
import {ProfileSetupScreen} from '@screens/auth/ProfileSetupScreen';
import {PairingScreen} from '@screens/auth/PairingScreen';
import {AnniversarySetupScreen} from '@screens/auth/AnniversarySetupScreen';
import {OnboardingTutorialScreen} from '@screens/auth/OnboardingTutorialScreen';
import {LoadingScreen} from '@screens/auth/LoadingScreen';
import {AuthErrorBoundary} from '@components/auth/AuthErrorBoundary';

import type {
  MainTabParamList,
  MainStackParamList,
  RootStackParamList,
  AuthStackParamList,
} from '@utils/types';
import {linking} from './linking';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();
const MainStack = createStackNavigator<MainStackParamList>();
const AuthStack = createStackNavigator<AuthStackParamList>();

const NAVIGATION_STATE_KEY = 'NAVIGATION_STATE';

// Create navigation ref for use in notification handlers
export const navigationRef = createNavigationContainerRef();

const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingTop: theme.spacing.sm,
          paddingBottom: Platform.OS === 'ios' ? theme.spacing.lg : theme.spacing.sm,
          height: Platform.OS === 'ios' ? 88 : 64,
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: -2,
          },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 5,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.medium,
        },
      }}>
      <Tab.Screen
        name="Connect"
        component={ConnectScreen}
        options={{
          tabBarIcon: ({color, size}) => (
            <MaterialCommunityIcons name="heart-multiple" size={size} color={color} />
          ),
          tabBarLabel: 'Connect',
        }}
      />
      <Tab.Screen
        name="Games"
        component={GamesScreen}
        options={{
          tabBarIcon: ({color, size}) => (
            <MaterialCommunityIcons name="gamepad-variant" size={size} color={color} />
          ),
          tabBarLabel: 'Games',
        }}
      />
      <Tab.Screen
        name="DateIdeas"
        component={DateIdeasScreen}
        options={{
          tabBarIcon: ({color, size}) => (
            <MaterialCommunityIcons name="calendar-heart" size={size} color={color} />
          ),
          tabBarLabel: 'Date Ideas',
        }}
      />
      <Tab.Screen
        name="Photos"
        component={PhotosScreen}
        options={{
          tabBarIcon: ({color, size}) => (
            <MaterialCommunityIcons name="camera-image" size={size} color={color} />
          ),
          tabBarLabel: 'Photos',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({color, size}) => (
            <MaterialCommunityIcons name="account-circle" size={size} color={color} />
          ),
          tabBarLabel: 'Profile',
        }}
      />
      <Tab.Screen
        name="ThumbKisses"
        component={ThumbKissesScreen}
        options={{
          tabBarIcon: ({color, size}) => (
            <MaterialCommunityIcons name="hand-heart" size={size} color={color} />
          ),
          tabBarLabel: 'Thumb Kisses',
        }}
      />
    </Tab.Navigator>
  );
};

const AuthStackNavigator = () => {
  return (
    <AuthErrorBoundary>
      <AuthStack.Navigator screenOptions={{headerShown: false}}>
        <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Signup" component={SignupScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <AuthStack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <AuthStack.Screen name="Pairing" component={PairingScreen} />
        <AuthStack.Screen
          name="AnniversarySetup"
          component={AnniversarySetupScreen}
        />
        <AuthStack.Screen
          name="OnboardingTutorial"
          component={OnboardingTutorialScreen}
        />
      </AuthStack.Navigator>
    </AuthErrorBoundary>
  );
};

const MainStackNavigator = () => {
  return (
    <MainStack.Navigator>
      <MainStack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{headerShown: false}}
      />
      <MainStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
          headerShown: true,
          headerTitle: 'Settings',
          headerStyle: {
            backgroundColor: theme.colors.surface,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontWeight: theme.typography.fontWeight.bold,
            fontSize: theme.typography.fontSize.lg,
          },
        }}
      />
      <MainStack.Screen
        name="QuestionDetail"
        component={QuestionDetailScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="DeckBrowser"
        component={DeckBrowserScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="QuestionHistory"
        component={QuestionHistoryScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="CanvasEditor"
        component={CanvasEditorScreen}
        options={{
          headerShown: false,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
      <MainStack.Screen
        name="CanvasGallery"
        component={CanvasGalleryScreen}
        options={{
          headerShown: false,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
      <MainStack.Screen
        name="PhotoDetail"
        component={PhotoDetailScreen}
        options={{
          headerShown: false,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
      <MainStack.Screen
        name="DateIdeaDetail"
        component={DateIdeaDetailScreen}
        options={{
          headerShown: false,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
      <MainStack.Screen
        name="WhosMoreLikely"
        component={WhosMoreLikelyScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="Anagrams"
        component={AnagramsScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="WhatYouSaying"
        component={WhatYouSayingScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="FourInARow"
        component={FourInARowScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="DrawDuel"
        component={DrawDuelScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="PerfectPair"
        component={PerfectPairScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="StickerGenerator"
        component={StickerGeneratorScreen}
        options={{
          headerShown: false,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
      <MainStack.Screen
        name="GameLeaderboard"
        component={GameLeaderboardScreen}
        options={{
          headerShown: false,
        }}
      />
      <MainStack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          headerShown: false,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
      <MainStack.Screen
        name="ThumbKisses"
        component={ThumbKissesScreen}
        options={{
          headerShown: false,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
      <MainStack.Screen
        name="Countdown"
        component={CountdownScreen}
        options={{
          headerShown: false,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
      <MainStack.Screen
        name="Referral"
        component={ReferralScreen}
        options={{
          headerShown: true,
          headerTitle: 'Refer Friends',
          headerStyle: {
            backgroundColor: theme.colors.surface,
          },
          headerTintColor: theme.colors.text,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
        }}
      />
    </MainStack.Navigator>
  );
};

export const Navigation = () => {
  const {isAuthenticated, isLoading, user, hasCompletedOnboarding} =
    useAuthStore();
  const [isReady, setIsReady] = useState(false);
  const [initialState, setInitialState] = useState();

  useEffect(() => {
    const restoreState = async () => {
      try {
        // Only restore state after auth check completes and user is authenticated
        if (!isLoading && isAuthenticated && hasCompletedOnboarding) {
          const savedStateString = await AsyncStorage.getItem(NAVIGATION_STATE_KEY);
          const state = savedStateString ? JSON.parse(savedStateString) : undefined;
          setInitialState(state);
        } else {
          // Don't restore state if not authenticated
          setInitialState(undefined);
        }
      } catch (e) {
        console.warn('Failed to restore navigation state:', e);
      } finally {
        setIsReady(true);
      }
    };

    restoreState();
  }, [isLoading, isAuthenticated, hasCompletedOnboarding]);

  // Clear navigation state when auth becomes false
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !hasCompletedOnboarding)) {
      const clearState = async () => {
        try {
          await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
        } catch (e) {
          console.warn('Failed to clear navigation state:', e);
        }
      };
      clearState();
    }
  }, [isLoading, isAuthenticated, hasCompletedOnboarding]);

  const onStateChange = (state: any) => {
    try {
      // Only save navigation state when authenticated
      if (isAuthenticated && hasCompletedOnboarding) {
        AsyncStorage.setItem(NAVIGATION_STATE_KEY, JSON.stringify(state));
      }
    } catch (e) {
      console.warn('Failed to save navigation state:', e);
    }
  };

  if (isLoading || !isReady) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      initialState={initialState}
      onStateChange={onStateChange}
      theme={{
        dark: false,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.accent,
        },
      }}>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        {isAuthenticated && user?.id && hasCompletedOnboarding ? (
          <Stack.Screen name="Main" component={MainStackNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthStackNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
