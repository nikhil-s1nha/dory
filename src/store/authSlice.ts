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
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (isLoading: boolean) => void;
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
      setUser: user =>
        set({
          user,
          isAuthenticated: user !== null,
        }),
      setToken: token => set({token}),
      setLoading: isLoading => set({isLoading}),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          token: null,
        }),
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
