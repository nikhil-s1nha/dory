/**
 * Device registration for push notifications.
 *
 * The server dispatches to APNs directly with its own .p8 key — this app is *not* on Expo's push
 * service — so what we register is the raw APNs device token from `getDevicePushTokenAsync`, never
 * an Expo push token. Nothing here is allowed to break the app: a user who declines the prompt, or
 * a simulator that can never mint a token, still gets a working product, because the widget also
 * refreshes on foreground and on tap (PLAN.md constraint 1). Push is the fast path, not the only one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

/** Which APNs gateway the server must use for a given token. */
export type PushEnvironment = 'sandbox' | 'production';

export interface DevicePushRegistration {
  /** The raw APNs device token, hex-encoded by expo-notifications. */
  token: string;
  platform: 'ios';
  environment: PushEnvironment;
}

/**
 * The entire `push_tokens` schema dependency, in one place (see `0008_push_tokens.sql`) — if a name
 * drifts, this block is the only thing to edit.
 *
 * The conflict target is the **device token**, which is the table's primary key: a token identifies
 * one install of the app on one device, so re-registering is a no-op. Handover to a second user on
 * the same phone is the database's job, not ours — a BEFORE INSERT trigger drops any row holding
 * this token under a different user, which RLS would otherwise forbid us from overwriting.
 *
 * `created_at` is the database's to own; `updated_at` is written here, because the table has a
 * default but no moddatetime trigger, so a re-register would otherwise never refresh it and the row
 * would look stale forever.
 */
const TABLE = 'push_tokens';
const CONFLICT_TARGET = 'device_token';

const toRow = (userId: string, registration: DevicePushRegistration) => ({
  user_id: userId,
  device_token: registration.token,
  platform: registration.platform,
  environment: registration.environment,
  updated_at: new Date().toISOString(),
});

/**
 * Ask for notification permission unless we already have it. Returns whether we may post
 * notifications. Provisional authorization counts — those are the quiet notifications iOS delivers
 * straight to Notification Center, and they still wake the app to refresh the widget.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  // Denied-for-good: iOS will not show the prompt a second time, so calling request would be a
  // silent no-op that reads like a bug. The user has to go to Settings.
  if (!current.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return requested.granted;
}

/**
 * Which APNs host the server must dispatch this token to. Sandbox and production tokens are not
 * interchangeable — a sandbox token sent to the production gateway comes back `BadDeviceToken`.
 *
 * `__DEV__` is the *wrong* signal here. A **Release** build installed from Xcode is still signed
 * with a development provisioning profile, so its token is a sandbox token even though `__DEV__` is
 * false — and that is exactly how this app reaches the test device (`npx expo run:ios --device
 * --configuration Release`). What actually decides it is the `aps-environment` entitlement baked
 * into the embedded provisioning profile, which is what expo-application reads: `development` for
 * anything Xcode installs, `production` only for TestFlight/App Store builds.
 *
 * If that can't be read (null entitlement, or the native module is unavailable) we fall back to
 * 'sandbox' rather than guessing — it's the environment every build we can currently produce is in.
 * To flip a device to production you don't change this code; you ship the build through TestFlight
 * and the entitlement changes with it.
 */
export async function resolvePushEnvironment(): Promise<PushEnvironment> {
  try {
    const entitlement = await Application.getIosPushNotificationServiceEnvironmentAsync();
    return entitlement === 'production' ? 'production' : 'sandbox';
  } catch {
    return 'sandbox';
  }
}

/**
 * This device's APNs token plus the gateway it belongs to, or null when there isn't one.
 *
 * Simulators are the common null: iOS never completes APNs registration for them, so
 * `getDevicePushTokenAsync` either rejects or hangs. Bail on `Device.isDevice` first — this is one
 * of the pieces that simply cannot be verified anywhere but a real phone.
 */
export async function getDevicePushRegistration(): Promise<DevicePushRegistration | null> {
  if (!Device.isDevice) return null;

  const token = await Notifications.getDevicePushTokenAsync();
  if (token.type !== 'ios' || typeof token.data !== 'string' || !token.data) return null;

  return { token: token.data, platform: 'ios', environment: await resolvePushEnvironment() };
}

/** Write (or refresh) this device's token row. Throws so callers can decide; `registerForPushNotifications` swallows. */
export async function saveDevicePushToken(
  supabase: SupabaseClient,
  userId: string,
  registration: DevicePushRegistration,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert(toRow(userId, registration), { onConflict: CONFLICT_TARGET });
  if (error) throw error;
}

/**
 * Permission → token → server row, for a signed-in user. Returns what was registered, or null if
 * any step declined to produce one (no permission, simulator, offline).
 *
 * Best-effort by design: this is called from a mount effect, and a rejected promise there would be
 * an unhandled rejection over a feature the app is specified to work without.
 */
export async function registerForPushNotifications(
  supabase: SupabaseClient,
  userId: string,
): Promise<DevicePushRegistration | null> {
  try {
    if (!(await ensureNotificationPermission())) return null;
    const registration = await getDevicePushRegistration();
    if (!registration) return null;
    await saveDevicePushToken(supabase, userId, registration);
    return registration;
  } catch {
    /* no push just means the widget refreshes on foreground instead */
    return null;
  }
}

/**
 * Drop this device's token for `userId` — call on sign-out, so the next person to hold the phone
 * doesn't get their notifications.
 *
 * Scoped to this one token rather than all of the user's rows: they may well be signed in on
 * another device, and that one should keep working. We deliberately do *not* call
 * `unregisterForNotificationsAsync` — deleting the server row is what actually stops delivery, and
 * tearing down the OS-level registration would only make the next sign-in slower.
 */
export async function unregisterDevicePushToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const registration = await getDevicePushRegistration();
    if (!registration) return;
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('device_token', registration.token);
    if (error) throw error;
  } catch {
    /* sign-out must never fail on a bookkeeping row */
  }
}
