/**
 * Authentication state slice
 * Manages user authentication state
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {User} from '@utils/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      user: null,
      isAuthenticated: false,
      token: null,
      setUser: user =>
        set({
          user,
          isAuthenticated: user !== null,
        }),
      setToken: token => set({token}),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          token: null,
        }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
