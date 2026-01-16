/**
 * Partnership state slice
 * Manages partner connection state
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Partnership} from '@utils/types';

interface PartnershipState {
  partnership: Partnership | null;
  isConnected: boolean;
  setPartnership: (partnership: Partnership | null) => void;
  clearPartnership: () => void;
}

export const usePartnershipStore = create<PartnershipState>()(
  persist(
    set => ({
      partnership: null,
      isConnected: false,
      setPartnership: partnership =>
        set({
          partnership,
          isConnected: partnership !== null && partnership.status === 'active',
        }),
      clearPartnership: () =>
        set({
          partnership: null,
          isConnected: false,
        }),
    }),
    {
      name: 'partnership-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
