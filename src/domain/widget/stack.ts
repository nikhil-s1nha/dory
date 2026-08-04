/**
 * Smart-stack selection (spec 3.4). The widget can hold up to three content types — a photo, a
 * drawing, and the partner's music — and shows one at a time. When more than one is present they
 * are ordered by priority (photo > drawing > music); each app open advances one step through the
 * present items, cycling back to the top once all have been seen.
 *
 * This module is pure and holds no state: the widget's App Group cache stores the cursor, and the
 * app calls `advanceStack` on open (or `itemAtCursor` to render the current one without advancing,
 * e.g. after a push). Keeping it here makes the cycling behavior exhaustively testable without a
 * widget or a device.
 */

export type WidgetContentType = 'photo' | 'drawing' | 'music';

/** Highest priority first. The only place this order is defined. */
export const WIDGET_PRIORITY: readonly WidgetContentType[] = ['photo', 'drawing', 'music'];

/**
 * Starting cursor stored before the widget has ever advanced. The first `advanceStack` from here
 * lands on index 0 — the highest-priority present item — so the first thing shown is the top item.
 */
export const INITIAL_CURSOR = -1;

/** The present content types in priority order (drops absent ones, ignores input order/dupes). */
export function orderedPresent(present: readonly WidgetContentType[]): WidgetContentType[] {
  return WIDGET_PRIORITY.filter((t) => present.includes(t));
}

/** Normalize any integer cursor into a valid index for a list of the given length. */
function wrap(cursor: number, length: number): number {
  return ((cursor % length) + length) % length;
}

/**
 * The item shown for a given cursor, without advancing. Returns null when nothing is present.
 * Tolerates out-of-range/negative cursors by wrapping, so a stale cursor never crashes the widget.
 */
export function itemAtCursor(
  present: readonly WidgetContentType[],
  cursor: number,
): WidgetContentType | null {
  const ordered = orderedPresent(present);
  if (ordered.length === 0) return null;
  return ordered[wrap(cursor, ordered.length)];
}

/**
 * Advance one step from `prevCursor` (call on each app open) and return the new cursor plus the
 * item to show. With nothing present, returns a reset cursor and a null item.
 */
export function advanceStack(
  present: readonly WidgetContentType[],
  prevCursor: number,
): { cursor: number; item: WidgetContentType | null } {
  const ordered = orderedPresent(present);
  if (ordered.length === 0) return { cursor: 0, item: null };
  const cursor = wrap(prevCursor + 1, ordered.length);
  return { cursor, item: ordered[cursor] };
}

/**
 * The cursor that points at `type` (its index among the present items in priority order), or 0 if
 * it isn't present. Used when a push for a fresh item should jump the widget straight to it rather
 * than wait for the next open.
 */
export function cursorForType(
  present: readonly WidgetContentType[],
  type: WidgetContentType,
): number {
  const i = orderedPresent(present).indexOf(type);
  return i >= 0 ? i : 0;
}
