import type { EventSubscription } from 'expo-modules-core';
import { addPushToStartTokenListener } from 'expo-widgets';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  addActivityTokenListener,
  describeActivityError,
  getRunningActivities,
} from '@/domain/activity/live-activity';
import { registerPushToStartToken } from '@/domain/activity/repository';
import { onActivityTokenReceived, resolveActivityImage } from '@/domain/activity/service';
import { useAuth } from '@/lib/auth-context';
import { resolvePushEnvironment } from '@/lib/push';

/**
 * Keeps the Live Activity connected to the backend and to the App Group.
 *
 * Three jobs, none of which the user ever triggers:
 *
 * 1. **Push-to-start token.** Subscribing is what *starts* the native observer —
 *    `WidgetsModule.swift` only calls `observePushToStartToken()` from `OnStartObserving`, and it
 *    then emits the current token immediately. So no listener means no token, means the backend can
 *    never start an activity on this phone. It also requires iOS 17.2+ and Live Activities enabled
 *    in Settings; below that the observer returns without emitting and this stays quiet.
 * 2. **Per-activity update tokens.** Attached to every activity ActivityKit currently holds,
 *    including one started by a push while the app was not running. The event is also the only
 *    place the activity id is visible, so it is where the instance row gets written.
 * 3. **The ordering fix.** A push-started activity's first frame is text-only, because the image
 *    could not have been in the App Group before the push arrived. Now that the app is awake, fetch
 *    it and update the activity locally.
 *
 * Fire-and-forget throughout, exactly like `useWidgetSync`: mounted from the (tabs) layout, which
 * only renders when paired, and a failure here must never break the screen. Failures are *logged*
 * rather than swallowed — an activity that never gets its image is otherwise indistinguishable from
 * one that was never pushed.
 */
export function useLiveActivity() {
  const { session, profile } = useAuth();
  const coupleId = profile?.coupleId ?? null;
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;

    const subscription = addPushToStartTokenListener((event) => {
      const save = async () => {
        try {
          const environment = await resolvePushEnvironment();
          await registerPushToStartToken(event.activityPushToStartToken, environment);
        } catch (error) {
          console.log('[live-activity] push-to-start token save FAILED —', describeActivityError(error));
        }
      };
      void save();
    });

    return () => subscription.remove();
  }, [userId]);

  useEffect(() => {
    if (!coupleId || !userId) return;

    let tokenSubscriptions: EventSubscription[] = [];

    // Re-attached rather than added to: the set of running activities changes underneath us (one
    // ends, a push starts another), and a listener held against a finished activity is dead weight.
    const attachTokenListeners = () => {
      tokenSubscriptions.forEach((subscription) => subscription.remove());
      tokenSubscriptions = getRunningActivities().map((activity) =>
        addActivityTokenListener(activity, (event) => {
          const save = async () => {
            try {
              await onActivityTokenReceived(event);
            } catch (error) {
              console.log('[live-activity] activity token save FAILED —', describeActivityError(error));
            }
          };
          void save();
        }),
      );
    };

    const run = () => {
      attachTokenListeners();
      const resolve = async () => {
        try {
          await resolveActivityImage(coupleId, userId);
        } catch (error) {
          console.log('[live-activity] image resolve FAILED —', describeActivityError(error));
        }
      };
      void resolve();
    };

    run(); // on mount — the cold start a push-to-start wake looks like
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });

    return () => {
      appState.remove();
      tokenSubscriptions.forEach((subscription) => subscription.remove());
    };
  }, [coupleId, userId]);
}
