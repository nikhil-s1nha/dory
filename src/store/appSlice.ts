/**
 * App-wide settings state slice
 * Manages app configuration and preferences
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppState {
  theme: 'light' | 'dark';
  notificationsEnabled: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  setNotificationsEnabled: (enabled: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    set => ({
      theme: 'light',
      notificationsEnabled: true,
      setTheme: theme => set({theme}),
      setNotificationsEnabled: notificationsEnabled =>
        set({notificationsEnabled}),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
