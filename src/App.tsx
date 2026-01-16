/**
 * Root App Component
 * Sets up navigation, theme provider, safe area handling, and Firebase subscriptions
 */

import React, {useEffect, useRef} from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Provider as PaperProvider} from 'react-native-paper';
import {Navigation} from '@navigation';
import {useAuthStore} from '@store/authSlice';
import {usePartnershipStore} from '@store/partnershipSlice';

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
    } else {
      // Clear partnership when user logs out
      if (partnershipUnsubscribeRef.current) {
        partnershipUnsubscribeRef.current();
        partnershipUnsubscribeRef.current = null;
      }
      usePartnershipStore.getState().clearPartnership();
    }
  }, [user?.id, initializePartnership]);

  return (
    <PaperProvider>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </PaperProvider>
  );
};

export default App;
