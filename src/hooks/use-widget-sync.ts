import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { syncWidgetOnOpen } from '@/lib/widget-sync';

/**
 * Advances the home-screen widget's shuffle one step whenever the paired app is genuinely opened —
 * the "one app open, one new thing" contract (spec 3.4). Fire-and-forget; failures leave the widget
 * on its last snapshot. Mounted from the (tabs) layout, which only renders when paired.
 *
 * **Not every 'active' is an app open.** iOS resigns active for anything that puts UI over the app —
 * Control Centre, the notification shade, a permission alert, the app switcher — and each one comes
 * back as another `AppState` 'active'. Every one of those used to advance the shuffle, so the item
 * the user was looking at could change while they never left the app, and the step they *did* pay
 * for by backgrounding had already been spent.
 *
 * React Native's iOS AppState distinguishes the two for us: leaving the app always passes through
 * 'background' (`applicationDidEnterBackground`), while an overlay only reaches 'inactive'
 * (`applicationWillResignActive`). So "the previous state was 'background'" *is* the definition of a
 * real foreground, and it's the only transition that advances.
 */
export function useWidgetSync() {
  const { session, profile } = useAuth();
  const coupleId = profile?.coupleId ?? null;
  const userId = session?.user.id ?? null;

  // Survives the effect re-running (a re-pair, a sign-in) so a transition can't be misread as a
  // foreground just because the subscription was rebuilt mid-flight.
  const previousState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!coupleId || !userId) return;

    // The app open that mounted this — unless there wasn't one. iOS also launches apps straight
    // into the background (prewarm, a silent push, background fetch), and there the mount is not an
    // app open at all: the user is looking at the home screen, and the real open arrives later as a
    // background→active transition that advances on its own. Advancing here too would spend two
    // steps for one open, which over two present items lands back where it started.
    //
    // A normal cold launch reports 'inactive' rather than 'active' at this point (the bridge is
    // built during didFinishLaunching, before didBecomeActive), so the test is against 'background'
    // specifically — testing for 'active' would skip the advance on every ordinary launch.
    const launchedInBackground = AppState.currentState === 'background';
    void syncWidgetOnOpen(coupleId, userId, {
      trigger: 'mount',
      advance: !launchedInBackground,
    });

    const subscription = AppState.addEventListener('change', (state) => {
      const wasBackgrounded = previousState.current === 'background';
      previousState.current = state;
      if (state !== 'active' || !wasBackgrounded) return;
      void syncWidgetOnOpen(coupleId, userId, { trigger: 'foreground' });
    });
    return () => subscription.remove();
  }, [coupleId, userId]);
}
