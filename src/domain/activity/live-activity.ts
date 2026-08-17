/**
 * Start / update / end the Bundles Live Activity from the app.
 *
 * Every entry point here **logs the real error and rethrows**. The widget pipeline's bare
 * `catch {}` (see `src/lib/widget-sync.ts` and the widget-debugging skill) has cost us days: a
 * failed start and a start that was never attempted look identical from the lock screen. ActivityKit
 * has several distinct, ordinary failure modes — activities switched off in Settings, iOS < 16.2, no
 * activity left to update — and each one has a different fix, so the message is the whole value.
 *
 * The local-start path is only half the story: the feature's real trigger is push-to-start (see
 * `docs/live-activity-contract.md`). These functions are what the app calls once it is awake.
 */

import { widgetsDirectory, type LiveActivity, type PushTokenEvent } from 'expo-widgets';
import type { EventSubscription } from 'expo-modules-core';

import {
  assertWithinContentStateBudget,
  toActivityProps,
  type BundlesActivityProps,
} from '@/domain/activity/content-state';
import type { BundlesActivityContentState } from '@/domain/activity/types';

import BundlesActivity from '../../../widgets/bundles-activity';

/**
 * The activity is typed by what the *layout* renders, not by the contract's content state. They
 * differ in one field — `imageFile` is an App Group filename on the wire and an absolute `file://`
 * URI once it reaches the layout — and `toActivityProps` is the only place that conversion happens.
 */
type Activity = LiveActivity<BundlesActivityProps>;

/**
 * The activity this app instance started. Cleared on `end`.
 *
 * It is only a cache: a push-started activity, or one that outlived the process, never passes
 * through here, so every consumer falls back to `getInstances()` rather than trusting this.
 */
let started: Activity | null = null;

/** ActivityKit errors arrive as plain `Error`s with an Expo module `code`; keep both. */
export function describeActivityError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    return code ? `${error.name}[${code}]: ${error.message}` : `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * The activity currently on screen, if any.
 *
 * `getInstances()` reads ActivityKit itself, so it also finds an activity started by a push or by a
 * previous launch of the app — which `started` cannot know about. That is the case that matters:
 * push-to-start is the architecture, and the app is usually meeting an activity it did not create.
 */
export function getRunningActivity(): Activity | null {
  try {
    return started ?? BundlesActivity.getInstances()[0] ?? null;
  } catch (error) {
    console.log('[live-activity] getInstances FAILED —', describeActivityError(error));
    throw error;
  }
}

/** Every activity ActivityKit currently holds for this app, or [] if it cannot be asked. */
export function getRunningActivities(): Activity[] {
  try {
    return BundlesActivity.getInstances();
  } catch (error) {
    console.log('[live-activity] getInstances FAILED —', describeActivityError(error));
    return [];
  }
}

/**
 * Start an activity locally and put it on the lock screen.
 *
 * `start` is synchronous and throws — `LiveActivityFactory.swift` raises
 * `LiveActivitiesNotSupportedException` when `ActivityAuthorizationInfo().areActivitiesEnabled` is
 * false (Settings › Bundles › Live Activities, off for some users) and `StartLiveActivityException`
 * for anything ActivityKit rejects.
 *
 * The `url` argument becomes the activity's `widgetURL`, so tapping the Dynamic Island opens the
 * same deep link the widget uses. Note it is stored **per activity name at start time** and is not
 * re-read on update — see the note in `use-live-activity.ts`.
 */
export function startBundlesActivity(state: BundlesActivityContentState): Activity {
  assertWithinContentStateBudget(state);
  try {
    const activity = BundlesActivity.start(toActivityProps(state, widgetsDirectory), state.deepLink);
    started = activity;
    return activity;
  } catch (error) {
    console.log('[live-activity] start FAILED —', describeActivityError(error));
    throw error;
  }
}

/** Push new content into the running activity. Throws if nothing is running. */
export async function updateBundlesActivity(state: BundlesActivityContentState): Promise<void> {
  assertWithinContentStateBudget(state);
  const activity = getRunningActivity();
  if (!activity) {
    const error = new Error('no running Live Activity to update — start one first');
    console.log('[live-activity] update FAILED —', error.message);
    throw error;
  }
  try {
    await activity.update(toActivityProps(state, widgetsDirectory));
  } catch (error) {
    console.log('[live-activity] update FAILED —', describeActivityError(error));
    throw error;
  }
}

/**
 * End the running activity and take it off the lock screen immediately.
 *
 * `'immediate'` rather than the default policy on purpose: the default leaves the ended activity
 * visible for up to four hours, which reads as "end did nothing".
 */
export async function endBundlesActivity(): Promise<void> {
  const activity = getRunningActivity();
  if (!activity) {
    const error = new Error('no running Live Activity to end');
    console.log('[live-activity] end FAILED —', error.message);
    throw error;
  }
  try {
    await activity.end('immediate');
    started = null;
  } catch (error) {
    console.log('[live-activity] end FAILED —', describeActivityError(error));
    throw error;
  }
}

/**
 * Subscribe to an activity's per-activity APNs token.
 *
 * This event is the **only** place ActivityKit's `activityId` is visible from JavaScript — the
 * `LiveActivity` wrapper exposes `update`, `end`, `getPushToken` and this listener, and nothing
 * else. That is why the id and the update token are written to the database together: there is no
 * earlier moment at which we know the id.
 */
export function addActivityTokenListener(
  activity: Activity,
  listener: (event: PushTokenEvent) => void,
): EventSubscription {
  return activity.addPushTokenListener(listener);
}
