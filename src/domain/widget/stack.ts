/**
 * The widget's shuffle cycle (spec 3.4). The widget can hold up to three content types — a photo, a
 * drawing, and the partner's music — and shows one at a time; each app open moves to the next one
 * that is present, wrapping forever.
 *
 * **The cursor is the item last shown, not an index.** It used to be an integer index into the
 * present-items list, advanced with `(prev + 1) % length`, and that is what made the shuffle feel
 * arbitrary. Two things went wrong with it:
 *
 * 1. An index means nothing on its own. The list it points into is recomputed from whatever is
 *    present *this* run, so when music dropped in or out (the Spotify poller nulls `now_playing`
 *    every two minutes) the same stored number silently addressed a different item.
 * 2. Because the step was relative, an extra step was invisible rather than loud. Two syncs racing
 *    on one app open advanced twice, and with exactly two items present — a photo and a drawing,
 *    which is precisely what the bug was reported against — `(n + 2) % 2 === n` put the widget back
 *    on the item it was already showing. That is the "I have to foreground twice for anything to
 *    change" symptom, and no amount of staring at the cursor value revealed it.
 *
 * Storing *what was shown* fixes both: it survives the present set changing underneath it, it reads
 * as itself in the App Group plist (`photo`, not `1`), and asking for "the next one after photo"
 * twice gives the same answer twice instead of walking two steps.
 *
 * Pure and stateless by design — the app owns persistence and calls in — so the whole cycling
 * behavior is testable without a widget or a device.
 */

export type WidgetContentType = 'photo' | 'drawing' | 'music';

/**
 * The fixed order the cycle walks. Also the tie-break when several items are present and the widget
 * has never shown anything, so the first thing a new pair sees is the photo. The only place this
 * order is defined.
 */
export const WIDGET_CYCLE: readonly WidgetContentType[] = ['photo', 'drawing', 'music'];

/** The item the widget last showed, or null before it has ever shown one. */
export type WidgetCursor = WidgetContentType | null;

/** The cursor before the widget has shown anything: the next item is the top of the cycle. */
export const INITIAL_CURSOR: WidgetCursor = null;

/** The present content types in cycle order (drops absent ones, ignores input order/dupes). */
export function orderedPresent(present: readonly WidgetContentType[]): WidgetContentType[] {
  return WIDGET_CYCLE.filter((t) => present.includes(t));
}

/** Narrowing guard for anything that arrives as a bare string (persistence, a push payload). */
export function isWidgetContentType(value: unknown): value is WidgetContentType {
  return typeof value === 'string' && (WIDGET_CYCLE as readonly string[]).includes(value);
}

/**
 * Read a cursor back out of storage.
 *
 * Anything unrecognised becomes `INITIAL_CURSOR`, which restarts the cycle from the top rather than
 * throwing or guessing. That deliberately covers the *old* numeric cursors ('-1', '0', '1', '2')
 * still sitting in AsyncStorage on an already-installed build: the first sync after the upgrade
 * shows the top of the cycle and everything is consistent from there. No migration step needed.
 */
export function parseCursor(stored: string | null | undefined): WidgetCursor {
  return isWidgetContentType(stored) ? stored : INITIAL_CURSOR;
}

/**
 * What the caller wants out of this selection.
 *
 * - `advance` — a genuine app open: move on, show something new.
 * - `stay` — refresh what is already on screen with newer content (a push landing while the widget
 *   already shows that item, say). Shuffling here is what made pushes feel like random jumps.
 * - `show` — jump straight to a named item, because something just arrived and the point is to see
 *   *that*.
 */
export type SelectionIntent =
  | { kind: 'advance' }
  | { kind: 'stay' }
  | { kind: 'show'; item: WidgetContentType };

/**
 * Every present item, ordered best-first for this intent — the head is what to show.
 *
 * It returns a whole ordering rather than a single item so a caller whose first choice fails to
 * build (a download that timed out, a signed URL that 404s) can fall through to the next one in the
 * same run. Committing nothing on a failure is right; committing nothing *and* retrying the same
 * broken item on every subsequent open is how one bad photo used to wedge the cycle permanently.
 *
 * Empty only when nothing is present at all.
 */
export function selectionOrder(
  present: readonly WidgetContentType[],
  lastShown: WidgetCursor,
  intent: SelectionIntent = { kind: 'advance' },
): WidgetContentType[] {
  const ordered = orderedPresent(present);
  if (ordered.length === 0) return [];

  const head =
    intent.kind === 'show' && ordered.includes(intent.item)
      ? intent.item
      : intent.kind === 'stay' && lastShown !== null && ordered.includes(lastShown)
        ? lastShown
        : null;

  // `indexOf` is -1 both when the cursor was never set and when the item it named has since
  // disappeared. Both mean the same thing — we have no position in this list — and both should
  // land on the top of the cycle rather than somewhere derived from a stale value.
  const at = lastShown === null ? -1 : ordered.indexOf(lastShown);
  const start = head !== null ? ordered.indexOf(head) : (at + 1) % ordered.length;

  return ordered.map((_, i) => ordered[(start + i) % ordered.length]);
}

/**
 * The next item to show after `lastShown`, or null when nothing is present. One step, every call —
 * calling it twice with the same cursor gives the same answer twice, which is the property the
 * index-based cursor did not have.
 */
export function nextInCycle(
  present: readonly WidgetContentType[],
  lastShown: WidgetCursor,
): WidgetContentType | null {
  return selectionOrder(present, lastShown)[0] ?? null;
}

/**
 * The `index`-th present item in cycle order, wrapping. Not the widget cursor — this is how the
 * Live Activity asks for "the top present item" (`index` 0) without importing the cycle order
 * itself. Returns null when nothing is present.
 */
export function itemAtCursor(
  present: readonly WidgetContentType[],
  index: number,
): WidgetContentType | null {
  const ordered = orderedPresent(present);
  if (ordered.length === 0) return null;
  return ordered[((index % ordered.length) + ordered.length) % ordered.length];
}
