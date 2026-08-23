/**
 * Start / update / end the real Live Activity by hand, for driving it on a device.
 *
 * These go through the same `service.ts` path the product uses — same stack selection, same App
 * Group download, same content state — so what appears on the lock screen is the real thing, not a
 * mock. The only concession is a fallback: when the partner has nothing waiting (unpaired test
 * device, empty account) there is no content to show, and an experiment that needs *something*
 * visible would otherwise be blocked, so a placeholder text state is started instead. The status
 * string says which of the two happened, so a screenshot is never ambiguous.
 *
 * They are plain functions rather than inline handlers so the same three actions can also be fired
 * from a deep link or a test harness, not just from the button on the home screen. Each returns a
 * short human-readable result: Metro's console frequently doesn't stream in this setup (CLAUDE.md),
 * so the screen is the log that can be screenshotted.
 */

import { makeActivityContentState } from '@/domain/activity/content-state';
import { activityImageDebug } from '@/lib/widget-sync';
import { updateBundlesActivity, startBundlesActivity } from '@/domain/activity/live-activity';
import {
  endPartnerActivity,
  resolveActivityImage,
  startPartnerActivity,
} from '@/domain/activity/service';
import type { BundlesActivityContentState } from '@/domain/activity/types';

/** Counts placeholder updates so each one changes the title *visibly*. */
let updateCount = 0;

/** `HH:MM:SS`, without depending on Intl being present in the JS engine. */
function clock(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** Text-only stand-in for when there is genuinely no partner content to show. */
function placeholderState(title: string, subtitle: string): BundlesActivityContentState {
  return makeActivityContentState({
    kind: 'photo',
    title,
    subtitle,
    imageFile: null,
    deepLink: 'bundles://media/dev',
    sentAt: Date.now(),
  });
}

/**
 * The image half of the status line: whether one is attached, its App Group filename, and the
 * resize that produced it.
 *
 * The dimensions are the point of it. An image bigger than the presentation drawing it is rendered
 * by ActivityKit as a flat grey box — a successful start with a broken picture — so `+image` alone
 * once "passed" while nothing was visible. Printing `600x600 -> 180x180` puts the number that
 * actually decides the render on a surface a screenshot can read.
 */
function describeImage(imageFile: string | null): string {
  if (!imageFile) return ' (no image)';
  return ` +image ${imageFile} [${activityImageDebug() ?? 'no resize recorded'}]`;
}

/** Start on the partner's real top item, or a placeholder when there isn't one. */
export async function devStartActivity(coupleId: string, userId: string): Promise<string> {
  updateCount = 0;
  const state = await startPartnerActivity(coupleId, userId);
  if (state) {
    return `start OK ${clock()} — ${state.kind}${describeImage(state.imageFile)}`;
  }
  startBundlesActivity(placeholderState('Bundles dev activity', `started ${clock()}`));
  return `start OK ${clock()} — placeholder (nothing from partner)`;
}

/**
 * Re-read the stack and push it into the running activity, which is the real update path. Falls
 * back to a visibly-changing placeholder when there is no partner content, and when the real state
 * is unchanged since the last push — `resolveActivityImage` suppresses identical updates, and a
 * button that appears to do nothing is exactly the ambiguity this control exists to remove.
 */
export async function devUpdateActivity(coupleId: string, userId: string): Promise<string> {
  const state = await resolveActivityImage(coupleId, userId);
  if (state) {
    return `update OK ${clock()} — ${state.kind}${describeImage(state.imageFile)}`;
  }
  updateCount += 1;
  await updateBundlesActivity(placeholderState(`Dev update #${updateCount}`, `at ${clock()}`));
  return `update #${updateCount} OK ${clock()} — placeholder (no change from partner)`;
}

/** End the activity, dismiss it immediately, and retire its row. */
export async function devEndActivity(): Promise<string> {
  await endPartnerActivity();
  updateCount = 0;
  return `end OK ${clock()}`;
}
