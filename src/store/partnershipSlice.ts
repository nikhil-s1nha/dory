/**
 * Partnership state slice
 * Manages partner connection state with Firestore real-time sync
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Partnership} from '@utils/types';
import {subscribeToPartnership, getUserPartnership} from '@services/partnershipService';

interface PartnershipState {
  partnership: Partnership | null;
  isConnected: boolean;
  isLoading: boolean;
  setPartnership: (partnership: Partnership | null) => void;
  setLoading: (isLoading: boolean) => void;
  clearPartnership: () => void;
  initializePartnership: (userId: string) => Promise<() => void>; // Returns unsubscribe function
}

export const usePartnershipStore = create<PartnershipState>()(
  persist(
    set => ({
      partnership: null,
      isConnected: false,
      isLoading: false,
      setPartnership: partnership =>
        set({
          partnership,
          isConnected: partnership !== null && partnership.status === 'active',
        }),
      setLoading: isLoading => set({isLoading}),
      clearPartnership: () =>
        set({
          partnership: null,
          isConnected: false,
        }),
      initializePartnership: async (userId: string) => {
        set({isLoading: true});
        try {
          // First, try to get existing partnership
          const partnership = await getUserPartnership(userId);
          
          if (partnership) {
            // Subscribe to partnership changes
            const unsubscribe = subscribeToPartnership(
              partnership.id,
              updatedPartnership => {
                set({
                  partnership: updatedPartnership,
                  isConnected:
                    updatedPartnership !== null &&
                    updatedPartnership.status === 'active',
                  isLoading: false,
                });
              },
            );
            return unsubscribe;
          } else {
            set({isLoading: false});
            // Return a no-op unsubscribe function if no partnership exists
            return () => {};
          }
        } catch (error) {
          console.error('Error initializing partnership:', error);
          set({isLoading: false});
          return () => {};
        }
      },
    }),
    {
      name: 'partnership-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
