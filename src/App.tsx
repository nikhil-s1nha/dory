/**
 * Root App Component
 * Sets up navigation, theme provider, safe area handling, and Firebase subscriptions
 * 
 * Note: Widget deep linking (candle://canvas, candle://countdown, candle://photos) is handled
 * automatically by React Navigation's linking configuration in src/navigation/linking.ts
 */

import React, {useEffect, useRef} from 'react';
import {Linking} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Provider as PaperProvider} from 'react-native-paper';
import {Navigation, navigationRef} from '@navigation';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeNotifications,
  setupNotificationListeners,
  handleNotificationOpened,
} from '@services/notificationService';
import type {NotificationData} from '@services/notificationService';

const App = (): React.JSX.Element => {
  const initializeAuth = useAuthStore(state => state.initializeAuth);
  const initializePartnership = usePartnershipStore(
    state => state.initializePartnership,
  );
  const user = useAuthStore(state => state.user);
  const authUnsubscribeRef = useRef<(() => void) | null>(null);
  const partnershipUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Initialize Firebase Auth state listener
    const authUnsubscribe = initializeAuth();
    authUnsubscribeRef.current = authUnsubscribe;

    // Cleanup on unmount
    return () => {
      if (authUnsubscribeRef.current) {
        authUnsubscribeRef.current();
      }
      if (partnershipUnsubscribeRef.current) {
        partnershipUnsubscribeRef.current();
      }
    };
  }, [initializeAuth]);

  useEffect(() => {
    // Initialize partnership subscription when user is authenticated
    if (user?.id) {
      // Cleanup previous subscription if exists
      if (partnershipUnsubscribeRef.current) {
        partnershipUnsubscribeRef.current();
      }

      // Initialize partnership subscription
      initializePartnership(user.id).then(unsubscribe => {
        partnershipUnsubscribeRef.current = unsubscribe;
      });

      // Initialize notifications
      initializeNotifications(user.id);
      const {unsubscribeForeground, unsubscribeNotificationOpened} =
        setupNotificationListeners();

      // Cleanup notification listeners
      return () => {
        unsubscribeForeground();
        unsubscribeNotificationOpened();
      };
    } else {
      // Clear partnership when user logs out
      if (partnershipUnsubscribeRef.current) {
        partnershipUnsubscribeRef.current();
        partnershipUnsubscribeRef.current = null;
      }
      usePartnershipStore.getState().clearPartnership();
    }
  }, [user?.id, initializePartnership]);

  useEffect(() => {
    // Handle notification opened when app is in background/quit
    const unsubscribe = messaging().onNotificationOpenedApp(remoteMessage => {
      handleNotificationOpened(remoteMessage);
      navigateFromNotification(remoteMessage.data as NotificationData);
    });

    // Check if app was opened from a notification
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          handleNotificationOpened(remoteMessage);
          navigateFromNotification(remoteMessage.data as NotificationData);
        }
      });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // Capture referral codes from deep links before authentication
    const handleDeepLink = async (url: string) => {
      try {
        // Parse URL to extract referral code
        // Format: candle://referral?code=XXXX-XXXX or candle://referral/XXXX-XXXX
        let referralCode: string | null = null;

        // Check query parameter first (candle://referral?code=XXXX-XXXX)
        const queryMatch = url.match(/[?&]code=([A-Z0-9-]+)/i);
        if (queryMatch && queryMatch[1]) {
          referralCode = queryMatch[1];
        } else {
          // Check path parameter (e.g., candle://referral/XXXX-XXXX)
          const pathMatch = url.match(/referral[\/\?]?([A-Z0-9-]+)/i);
          if (pathMatch && pathMatch[1]) {
            referralCode = pathMatch[1];
          }
        }

        if (referralCode) {
          // Normalize the code (remove dashes, uppercase)
          const normalizedCode = referralCode.replace(/-/g, '').toUpperCase();
          
          // Only store if user is not authenticated
          if (!user?.id) {
            await AsyncStorage.setItem('pendingReferralCode', normalizedCode);
          }
        }
      } catch (error) {
        console.error('Error processing deep link for referral:', error);
      }
    };

    // Check initial URL when app opens
    Linking.getInitialURL().then(url => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', ({url}) => {
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, [user?.id]);

  // Navigate based on notification data
  const navigateFromNotification = (data?: NotificationData) => {
    if (!data || !navigationRef.isReady()) {
      return;
    }

    try {
      const params = JSON.parse(data.navigationParams || '{}');

      switch (data.navigationTarget) {
        case 'QuestionDetail':
          navigationRef.navigate('Main', {
            screen: 'QuestionDetail',
            params: {
              questionId: data.questionId,
              partnershipId: data.partnershipId,
            },
          });
          break;
        case 'Chat':
          navigationRef.navigate('Main', {
            screen: 'Chat',
            params: {
              partnershipId: data.partnershipId,
              questionId: data.questionId,
            },
          });
          break;
        case 'PhotoDetail':
          navigationRef.navigate('Main', {
            screen: 'PhotoDetail',
            params: {
              promptId: params.promptId,
            },
          });
          break;
        case 'MainTabs':
          navigationRef.navigate('Main', {
            screen: 'MainTabs',
            params: params.screen ? {screen: params.screen} : {},
          });
          break;
        default:
          // Handle game screens - use navigationTarget which has the correct route name
          if (data.gameType && data.navigationTarget) {
            navigationRef.navigate('Main', {
              screen: data.navigationTarget,
              params: {},
            });
          }
          break;
      }
    } catch (error) {
      console.error('Error navigating from notification:', error);
    }
  };

  return (
    <PaperProvider>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </PaperProvider>
  );
};

export default App;
