/**
 * Authentication state slice
 * Manages user authentication state with Firebase Auth integration
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {User} from '@utils/types';
import {onAuthStateChanged} from '@services/authService';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setOnboardingComplete: () => void;
  logout: () => void;
  initializeAuth: () => () => void; // Returns unsubscribe function
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      user: null,
      isAuthenticated: false,
      token: null,
      isLoading: true,
      hasCompletedOnboarding: false,
      setUser: user =>
        set({
          user,
          isAuthenticated: user !== null,
        }),
      setToken: token => set({token}),
      setLoading: isLoading => set({isLoading}),
      setOnboardingComplete: () => set({hasCompletedOnboarding: true}),
      logout: async () => {
        // Clear navigation state on logout
        try {
          await AsyncStorage.removeItem('NAVIGATION_STATE');
        } catch (e) {
          console.warn('Failed to clear navigation state on logout:', e);
        }
        set({
          user: null,
          isAuthenticated: false,
          token: null,
          hasCompletedOnboarding: false,
        });
      },
      initializeAuth: () => {
        // Subscribe to Firebase Auth state changes
        // Note: onAuthStateChanged from authService already updates the store,
        // so we just need to handle loading state here
        const unsubscribe = onAuthStateChanged(user => {
          set({
            isLoading: false,
            // Store is already updated by authService.onAuthStateChanged
            // but we sync the state here to ensure consistency
            user: user || null,
            isAuthenticated: user !== null,
          });
        });
        return unsubscribe;
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
