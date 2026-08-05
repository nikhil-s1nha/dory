import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth-context';
import { registerForPushNotifications } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { syncWidgetOnOpen } from '@/lib/widget-sync';

/**
 * The custom data `notify-partner` puts in the APNs payload alongside `aps`. It arrives on the JS
 * side as `notification.request.content.data`, namespaced under `bundles` so it can never collide
 * with a key Apple adds beside `aps`.
 *
 * `mediaType` mirrors the widget's stack item kinds so the tap lands on the same screen the widget's
 * own deep link would (`bundles://media/<id>`, `bundles://draw?base=<id>`, `bundles://music`).
 */
export interface PushPayload {
  mediaType?: 'photo' | 'drawing' | 'music';
  /** The `media_items` row id. Required for 'photo' and 'drawing'; absent for 'music'. */
  mediaItemId?: string;
}

/**
 * Where a tapped notification should land, or null if the payload doesn't name a destination.
 *
 * We branch on `mediaType` rather than following the payload's `deepLink` string: routing is the
 * client's business, the typed-route objects are checked at compile time, and it keeps one URL
 * format from having to stay in sync across the app, the widget, and a Deno function.
 */
function routeFor(data: Record<string, unknown> | undefined): Href | null {
  const payload = (data?.bundles ?? {}) as PushPayload;
  const mediaItemId = typeof payload.mediaItemId === 'string' ? payload.mediaItemId : null;

  if (payload.mediaType === 'photo' && mediaItemId) {
    return { pathname: '/media/[id]', params: { id: mediaItemId } };
  }
  // A drawing opens the canvas pre-loaded, ready to draw back (spec 3.2) — same as its widget tap.
  if (payload.mediaType === 'drawing' && mediaItemId) {
    return { pathname: '/draw', params: { base: mediaItemId } };
  }
  if (payload.mediaType === 'music') return '/music';
  return null;
}

/**
 * Registers this device for push and keeps the widget honest around it: a notification arriving in
 * the foreground refreshes the widget, and tapping one refreshes *and* opens the item it announced.
 *
 * This is the reliable half of the delivery story (PLAN.md constraint 1) — iOS drops silent
 * `content-available` pushes once the app has been force-quit, so the visible notification is what
 * actually gets the partner's content across. Mounted from the (tabs) layout, which only renders
 * when paired; everything is fire-and-forget, exactly like useWidgetSync.
 */
export function usePush() {
  const { session, profile } = useAuth();
  const coupleId = profile?.coupleId ?? null;
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    void registerForPushNotifications(supabase, userId);
  }, [userId]);

  useEffect(() => {
    if (!coupleId || !userId) return;

    // Without a handler iOS suppresses the alert entirely while the app is foregrounded, so a photo
    // sent while your partner is mid-scroll would arrive invisibly. Banner + list, no badge (nothing
    // in this app counts unread).
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const refreshWidget = () => {
      void syncWidgetOnOpen(coupleId, userId);
    };

    const openFrom = (response: Notifications.NotificationResponse) => {
      refreshWidget();
      const href = routeFor(response.notification.request.content.data);
      if (href) router.push(href);
    };

    const received = Notifications.addNotificationReceivedListener(refreshWidget);
    const responded = Notifications.addNotificationResponseReceivedListener(openFrom);

    // Cold start: the tap that launched the app fired before this listener existed, so replay the
    // stored response. Clearing it first stops a later remount from navigating a second time.
    const launch = Notifications.getLastNotificationResponse();
    if (launch) {
      Notifications.clearLastNotificationResponse();
      openFrom(launch);
    }

    return () => {
      received.remove();
      responded.remove();
      Notifications.setNotificationHandler(null);
    };
  }, [coupleId, userId]);
}
