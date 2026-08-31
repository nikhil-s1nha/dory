/**
 * The in-app preview's rotation cadence (spec 3.4, stretch goal).
 *
 * The spec offers the stretch goal on either of two surfaces — "while the user is actively engaged
 * with a Live Activity **or the app's own in-app widget preview**". This module serves the second.
 * The Live Activity branch was investigated and not built: a Live Activity is only shown "while your
 * app isn't in use", so the foreground — the one place a 15s local rotation can be driven from — is
 * exactly where it isn't visible. See PLAN.md's M7 note for the full reasoning.
 *
 * Everything here delegates to `stack.ts`. Rotation changes *when* the item advances, never the
 * cycle order or the cycling rules, and this file exists to give the cadence a named, testable home
 * rather than to restate any of that.
 */

import { nextInCycle, type WidgetContentType, type WidgetCursor } from './stack';

/** "…rotate through the three content types every ~15 seconds" (spec 3.4). */
export const PREVIEW_ROTATION_INTERVAL_MS = 15_000;

/**
 * One rotation tick: the same step the home-screen widget takes per app open, applied on a timer
 * instead. Returns the item to show, which is also the cursor to carry into the next tick.
 *
 * That cursor is the preview's own, held in memory for as long as the screen is mounted. It must
 * never be written back to the persisted `bundles.widget.cursor`: that key encodes the widget's
 * "advance one step per open" contract, and a 15-second writer would leave every app open landing
 * on an arbitrary item.
 */
export function nextPreviewFrame(
  present: readonly WidgetContentType[],
  lastShown: WidgetCursor,
): WidgetContentType | null {
  return nextInCycle(present, lastShown);
}
