import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { syncWidgetOnOpen } from '@/lib/widget-sync';

/**
 * Refreshes the home-screen widget when the paired app opens or returns to the foreground — this is
 * the smart stack's "advance one step per open" trigger (spec 3.4). Fire-and-forget; failures leave
 * the widget on its last snapshot. Mounted from the (tabs) layout, which only renders when paired.
 */
export function useWidgetSync() {
  const { session, profile } = useAuth();
  const coupleId = profile?.coupleId ?? null;
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!coupleId || !userId) return;
    const sync = () => {
      void syncWidgetOnOpen(coupleId, userId);
    };
    sync(); // on mount (app opened into the paired experience)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => subscription.remove();
  }, [coupleId, userId]);
}
