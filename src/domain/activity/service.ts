/**
 * The Live Activity's app-side behaviour: what to show, when to update it, and the bookkeeping the
 * dispatcher needs.
 *
 * **The ordering problem this module exists to solve** (contract, last section): push-to-start wakes
 * the app *at push time*, so the image cannot already be in the App Group when the activity's first
 * frame renders. The backend therefore sends a text-only start (`imageFile: null`), and the app —
 * now awake — downloads into the shared container and calls `update()` locally with the filename.
 * `resolveActivityImage` is that second half.
 *
 * Image downloading is **not** reimplemented here. `syncWidgetOnOpen`'s `downloadToAppGroup` already
 * does the downscale-to-600px, staging-file and in-flight-dedup work that took a long time to get
 * right, and it is reached through the exported `buildProps` — so the activity and the widget share
 * one download and one file on disk. (`downloadToAppGroup` itself is module-private; going through
 * `buildProps` reuses it without editing that file.)
 *
 * Rotation is deliberately absent. The activity shows the **top-priority** present item and stays
 * there; whether a running activity should cycle is a separate decision, pending the device
 * experiment.
 */

import {
  activityContentStateFor,
  activityImageFilename,
  activityMediaId,
  serializeContentState,
} from '@/domain/activity/content-state';
import {
  describeActivityError,
  endBundlesActivity,
  getRunningActivity,
  startBundlesActivity,
  updateBundlesActivity,
} from '@/domain/activity/live-activity';
import {
  recordActivityEnded,
  recordActivityStarted,
  registerActivityUpdateToken,
} from '@/domain/activity/repository';
import type { BundlesActivityContentState } from '@/domain/activity/types';
import { itemAtCursor, type WidgetContentType } from '@/domain/widget/stack';
import { buildProps, loadStackSnapshot } from '@/lib/widget-sync';

/** What the partner currently has waiting, resolved into something the activity can render. */
export interface ActivityCandidate {
  item: WidgetContentType | null;
  state: BundlesActivityContentState | null;
  /** The `media_items` row for `live_activity_instances.media_id`; null for music. */
  mediaId: string | null;
}

/**
 * Bookkeeping that only makes sense across calls.
 *
 * `lastSentState` suppresses a redundant `update()` — the effect that drives this runs on every
 * foreground, and re-sending an identical state burns an ActivityKit update for no visible change.
 * It is the local counterpart of `hasMeaningfulChange` on the push side.
 *
 * `knownActivityId` exists because ActivityKit's id reaches JavaScript **only** through
 * `PushTokenEvent`; without a token event we simply never learn it, and `recordActivityEnded` has
 * nothing to write.
 */
let lastSentState: string | null = null;
let knownActivityId: string | null = null;
let lastMediaId: string | null = null;

/** Test seam and sign-out hook: forget everything remembered about the current activity. */
export function resetActivityBookkeeping(): void {
  lastSentState = null;
  knownActivityId = null;
  lastMediaId = null;
}

/** The activity id we have learned from a token event, if any. */
export function getKnownActivityId(): string | null {
  return knownActivityId;
}

/**
 * The content state for the top-priority item the partner has waiting, with its image already
 * downloaded into the App Group.
 *
 * Cursor 0 is the highest-priority present item (`stack.ts`) — the same thing the widget shows
 * first. No cursor is advanced and nothing is persisted: this is a read.
 */
export async function buildPartnerActivityState(
  coupleId: string,
  userId: string,
): Promise<ActivityCandidate> {
  const { ctx, present } = await loadStackSnapshot(coupleId, userId);
  const item = itemAtCursor(present, 0);
  if (!item) return { item: null, state: null, mediaId: null };

  // Downloads (and downscales) into the App Group as a side effect — the file the activity reads.
  const props = await buildProps(item, ctx);
  const filename = activityImageFilename(props.imageFile);

  return {
    item,
    state: activityContentStateFor(item, ctx, filename),
    mediaId: activityMediaId(item, ctx),
  };
}

/**
 * Start an activity for whatever the partner has waiting. Returns the state shown, or null when
 * there is nothing to show.
 *
 * A local start already has the image, so it starts with it — the text-first sequence only applies
 * to a push-started activity, which is `resolveActivityImage`'s job.
 */
export async function startPartnerActivity(
  coupleId: string,
  userId: string,
): Promise<BundlesActivityContentState | null> {
  const { state, mediaId } = await buildPartnerActivityState(coupleId, userId);
  if (!state) return null;
  startBundlesActivity(state);
  lastSentState = serializeContentState(state);
  lastMediaId = mediaId;
  return state;
}

/**
 * The second half of the push-to-start sequence: give a running activity its image.
 *
 * Does nothing when no activity is running (the ordinary case — most app opens have no activity),
 * when the partner has nothing waiting, or when the state is byte-identical to the last one we sent.
 * Returns the state it pushed, or null.
 */
export async function resolveActivityImage(
  coupleId: string,
  userId: string,
): Promise<BundlesActivityContentState | null> {
  if (!getRunningActivity()) return null;

  const { state, mediaId } = await buildPartnerActivityState(coupleId, userId);
  if (!state) return null;

  const serialized = serializeContentState(state);
  if (serialized === lastSentState) return null;

  await updateBundlesActivity(state);
  lastSentState = serialized;
  lastMediaId = mediaId;
  return state;
}

/**
 * Everything that must happen when an activity's push token arrives.
 *
 * This is the one moment the activity id is knowable, so the id, the update token and the started
 * record are all written here. Two writes rather than one because the contract names four functions
 * and both rows' columns are disjoint; only the columns each names are touched on conflict.
 */
export async function onActivityTokenReceived(event: {
  activityId: string;
  pushToken: string;
}): Promise<void> {
  knownActivityId = event.activityId;
  await registerActivityUpdateToken(event.activityId, event.pushToken);
  await recordActivityStarted(event.activityId, lastMediaId);
}

/**
 * End the running activity and retire its row.
 *
 * The row is only retired if a token event ever told us the id. When it didn't, there is no row to
 * retire either — the two are written from the same event.
 */
export async function endPartnerActivity(): Promise<void> {
  await endBundlesActivity();
  const activityId = knownActivityId;
  resetActivityBookkeeping();
  if (!activityId) return;
  try {
    await recordActivityEnded(activityId);
  } catch (error) {
    // The activity is already off the screen; a failed bookkeeping write must not look like a
    // failed end. Logged, because a stale row means the dispatcher keeps pushing to a dead token.
    console.log('[live-activity] recordActivityEnded FAILED —', describeActivityError(error));
  }
}
