/**
 * The app's writes to the Live Activity tables (`docs/live-activity-contract.md`).
 *
 * Signatures are the contract's, verbatim — no `supabase` or `userId` parameter — so the client and
 * the owning user are read here. Both tables are owner-only under RLS, so a wrong `user_id` is not a
 * data leak, it is a row the dispatcher will never find.
 *
 * Every function throws on failure. The callers (a token listener, a foreground effect) are the ones
 * that decide a failed bookkeeping write must not break the app, and they log first.
 */

import type { PushEnvironment } from '@/lib/push';
import { supabase } from '@/lib/supabase';

/**
 * The entire schema dependency, in one place — see `0010_live_activity_tokens.sql`. If a name
 * drifts, this block is the only thing to edit.
 */
const TOKENS_TABLE = 'live_activity_tokens';
const TOKENS_CONFLICT_TARGET = 'token';
const INSTANCES_TABLE = 'live_activity_instances';
const INSTANCES_CONFLICT_TARGET = 'activity_id';

/**
 * The signed-in user's id, or a thrown error.
 *
 * Read from the client rather than passed in because the contract fixes these signatures. Throwing
 * is right: a token that lands with no owner is worse than no token — the dispatcher would have no
 * way to tell whose phone it is.
 */
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('no signed-in user to register a Live Activity token for');
  return userId;
}

/**
 * Upsert this device's push-to-start token.
 *
 * `environment` must come from the `aps-environment` entitlement (`resolvePushEnvironment` in
 * `src/lib/push.ts`), never from `__DEV__`: a Release build installed by Xcode is still a *sandbox*
 * token, and sending it to the production APNs gateway comes back `BadDeviceToken`. The token is the
 * primary key because one token identifies one install on one device; re-registering is a no-op, and
 * handover to a second account on the same phone is the database's job.
 */
export async function registerPushToStartToken(
  token: string,
  environment: PushEnvironment,
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from(TOKENS_TABLE).upsert(
    {
      token,
      user_id: userId,
      environment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: TOKENS_CONFLICT_TARGET },
  );
  if (error) throw error;
}

/**
 * Record an activity's per-activity update token.
 *
 * `activityId` and the token arrive together, in the same `PushTokenEvent`, because that event is
 * the only place ActivityKit's id is visible from JavaScript — so this writes both at once. Only
 * the columns named here are touched on conflict, so an existing `media_id` survives.
 */
export async function registerActivityUpdateToken(
  activityId: string,
  token: string,
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from(INSTANCES_TABLE).upsert(
    {
      activity_id: activityId,
      user_id: userId,
      update_token: token,
    },
    { onConflict: INSTANCES_CONFLICT_TARGET },
  );
  if (error) throw error;
}

/**
 * Mark an activity live and note what it is showing.
 *
 * `ended_at` is cleared explicitly: ActivityKit can hand back an id we have already retired, and a
 * row left with an `ended_at` would make the dispatcher skip a live activity.
 */
export async function recordActivityStarted(
  activityId: string,
  mediaId: string | null,
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from(INSTANCES_TABLE).upsert(
    {
      activity_id: activityId,
      user_id: userId,
      media_id: mediaId,
      ended_at: null,
    },
    { onConflict: INSTANCES_CONFLICT_TARGET },
  );
  if (error) throw error;
}

/**
 * Mark an activity finished so the dispatcher stops pushing to a token iOS has already invalidated.
 *
 * An update, not an upsert: if there is no row we never held a token for this activity, and
 * inventing one would only give the dispatcher something useless to try.
 */
export async function recordActivityEnded(activityId: string): Promise<void> {
  const { error } = await supabase
    .from(INSTANCES_TABLE)
    .update({ ended_at: new Date().toISOString() })
    .eq(INSTANCES_CONFLICT_TARGET, activityId);
  if (error) throw error;
}
