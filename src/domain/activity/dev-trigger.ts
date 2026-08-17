/**
 * Canned start / update / end actions for driving the Live Activity by hand on a device.
 *
 * These exist so the activity can be exercised end to end before push-to-start and the media
 * pipeline are wired: no partner, no push, no Supabase row required. They are plain zero-argument
 * functions rather than inline handlers so the same three actions can also be fired from a deep
 * link or a test harness, not just from the button on the home screen.
 *
 * Each returns a short human-readable result for on-screen display — Metro's console frequently
 * doesn't stream in this setup (see CLAUDE.md), so the screen is the log that can be screenshotted.
 */

import {
  endBundlesActivity,
  startBundlesActivity,
  updateBundlesActivity,
} from '@/domain/activity/live-activity';
import type { BundlesActivityContentState } from '@/domain/activity/types';

/** Counts updates within one activity so each update changes the title *visibly*. */
let updateCount = 0;

/** `HH:MM:SS`, without depending on Intl being present in the JS engine. */
function clock(): string {
  return new Date().toTimeString().slice(0, 8);
}

function sampleState(title: string, subtitle: string): BundlesActivityContentState {
  return {
    kind: 'photo',
    title,
    subtitle,
    // Text-only for this spike: images ride through the App Group and aren't wired up yet.
    imageFile: null,
    deepLink: 'bundles://media/dev',
    sentAt: Date.now(),
  };
}

/** Start an activity showing a fixed title. Throws (already logged) if ActivityKit refuses. */
export function devStartActivity(): string {
  updateCount = 0;
  startBundlesActivity(sampleState('Bundles dev activity', `started ${clock()}`));
  return `start OK ${clock()}`;
}

/** Change the title, so a live change on the lock screen proves updates are landing. */
export async function devUpdateActivity(): Promise<string> {
  updateCount += 1;
  await updateBundlesActivity(sampleState(`Dev update #${updateCount}`, `at ${clock()}`));
  return `update #${updateCount} OK ${clock()}`;
}

/** End the activity and dismiss it immediately. */
export async function devEndActivity(): Promise<string> {
  await endBundlesActivity();
  updateCount = 0;
  return `end OK ${clock()}`;
}
