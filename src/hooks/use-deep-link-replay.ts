import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { parseWidgetDeepLink } from '@/domain/widget/deep-link';

/**
 * Re-applies the URL the app was launched with, once the app is actually able to show it.
 *
 * Cold-starting from a widget tap loses the destination otherwise. The root navigator gates the
 * feature screens behind `Stack.Protected guard={paired}`, and `paired` is false until the session
 * and profile have loaded — so at the moment the router resolves the launch URL, `/draw`,
 * `/media/[id]` and `/music` do not exist yet. The route is dropped, and when the guard finally
 * opens the app lands on the tab home instead. It looks exactly like the deep link doing nothing,
 * which is what it was doing.
 *
 * Only the launch URL needs this. Links that arrive while the app is running already find their
 * screens mounted, and expo-router handles them.
 *
 * @param enabled pass the same `paired` guard the screens are behind.
 */
export function useDeepLinkReplay(enabled: boolean) {
  const replayed = useRef(false);

  useEffect(() => {
    if (!enabled || replayed.current) return;

    const run = async () => {
      // Mark first: a failed parse or a missing URL is still "handled", and re-running on every
      // dependency change would re-navigate away from wherever the user has since gone.
      replayed.current = true;
      try {
        const url = await Linking.getInitialURL();
        const route = parseWidgetDeepLink(url ?? undefined);
        if (route) router.push(route);
      } catch {
        /* a deep link that can't be restored is not worth breaking the launch over */
      }
    };

    void run();
  }, [enabled]);
}
