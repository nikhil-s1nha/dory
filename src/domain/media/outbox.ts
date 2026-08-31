/**
 * Sends that outlive the screen that started them.
 *
 * Tapping Send used to hold the camera (or the canvas) open for a resize, an upload, a row insert
 * and a push — several seconds of spinner for work the user has no further part in. The send now
 * happens here instead: the screen hands the outbox a request, dismisses immediately, and the upload
 * finishes on its own.
 *
 * That only works if the work is genuinely detached from the UI. It lives at module scope precisely
 * so unmounting the screen can't cancel it, and so nothing in it touches component state that is
 * already gone. The cost of detaching is that a failure has no screen left to appear on, which is
 * why reporting is a first-class part of this module and not an afterthought: a send that vanishes
 * silently is worse than one that made you wait.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { Alert } from 'react-native';

import { notifyPartnerOfSend, sendImage } from './repository';

/** Everything `sendImage` needs, captured at the moment of the tap. */
export interface OutboxSend {
  coupleId: string;
  senderId: string;
  type: 'photo' | 'drawing';
  localUri: string;
  now: number;
}

export interface OutboxFailure {
  send: OutboxSend;
  /** Already reduced to something showable — callers should not have to unwrap an unknown. */
  message: string;
  /** Re-queues the identical send. The local file is still on disk, so this is a real retry. */
  retry: () => void;
}

export type OutboxReporter = (failure: OutboxFailure) => void;

/**
 * An alert, because it is the one surface that doesn't care which screen the user ended up on — the
 * send outlives the sender, so by now they could be anywhere. Swappable so tests can observe the
 * failure, and so a home-screen banner can take this over without the outbox learning about routing.
 */
const alertReporter: OutboxReporter = ({ send, message, retry }) => {
  Alert.alert(`Your ${send.type} didn't send`, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Try again', onPress: retry },
  ]);
};

let reporter: OutboxReporter = alertReporter;

/** Replace the failure surface. Pass nothing to go back to the alert. */
export function setOutboxReporter(next?: OutboxReporter): void {
  reporter = next ?? alertReporter;
}

/**
 * Sends still running. Nothing in the app blocks on this today; it exists so a "sending…" indicator
 * has something to read, and so tests can assert the work really was detached rather than awaited.
 */
const inFlight = new Set<Promise<void>>();

export function pendingSends(): number {
  return inFlight.size;
}

/**
 * Resolve once nothing is in flight. Test-facing: production code deliberately never waits, and a
 * retry queued from a failure means "empty" has to be re-checked rather than sampled once.
 */
export async function whenOutboxIdle(): Promise<void> {
  while (inFlight.size > 0) await Promise.all([...inFlight]);
}

/**
 * Queue a send and return immediately. Never rejects — the caller is on its way out and has nowhere
 * to put a rejection; failures go to the reporter instead.
 */
export function enqueueSend(supabase: SupabaseClient, send: OutboxSend): void {
  const work = deliver(supabase, send);
  inFlight.add(work);
  void work.finally(() => {
    inFlight.delete(work);
  });
}

async function deliver(supabase: SupabaseClient, send: OutboxSend): Promise<void> {
  try {
    const item = await sendImage(supabase, send);
    // Best-effort by contract — it swallows its own failures, since the item is already stored and
    // will reach the widget on the partner's next foreground regardless.
    await notifyPartnerOfSend(supabase, item);
  } catch (error) {
    reporter({
      send,
      message: error instanceof Error ? error.message : String(error),
      retry: () => enqueueSend(supabase, send),
    });
  }
}
