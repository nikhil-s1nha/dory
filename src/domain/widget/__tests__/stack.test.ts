import {
  advanceStack,
  cursorForType,
  INITIAL_CURSOR,
  itemAtCursor,
  orderedPresent,
  WIDGET_PRIORITY,
  type WidgetContentType,
} from '../stack';

const ALL: WidgetContentType[] = ['photo', 'drawing', 'music'];

/** Fold N opens starting from INITIAL_CURSOR and collect the item shown at each. */
function openSequence(present: WidgetContentType[], opens: number): (WidgetContentType | null)[] {
  const shown: (WidgetContentType | null)[] = [];
  let cursor = INITIAL_CURSOR;
  for (let i = 0; i < opens; i++) {
    const next = advanceStack(present, cursor);
    cursor = next.cursor;
    shown.push(next.item);
  }
  return shown;
}

describe('orderedPresent', () => {
  it('keeps priority order (photo > drawing > music) regardless of input order', () => {
    expect(orderedPresent(['music', 'photo', 'drawing'])).toEqual(['photo', 'drawing', 'music']);
  });

  it('drops absent types', () => {
    expect(orderedPresent(['music', 'photo'])).toEqual(['photo', 'music']);
    expect(orderedPresent(['drawing'])).toEqual(['drawing']);
    expect(orderedPresent([])).toEqual([]);
  });

  it('matches the declared priority for the full set', () => {
    expect(orderedPresent(ALL)).toEqual([...WIDGET_PRIORITY]);
  });
});

describe('advanceStack — advancement and cycling', () => {
  it('first open shows the top-priority present item', () => {
    expect(advanceStack(ALL, INITIAL_CURSOR)).toEqual({ cursor: 0, item: 'photo' });
  });

  it('advances photo -> drawing -> music -> photo across opens (cycles)', () => {
    expect(openSequence(ALL, 4)).toEqual(['photo', 'drawing', 'music', 'photo']);
  });

  it('cycles through a subset in priority order', () => {
    expect(openSequence(['music', 'photo'], 4)).toEqual(['photo', 'music', 'photo', 'music']);
  });

  it('stays on the single present item every open', () => {
    expect(openSequence(['drawing'], 3)).toEqual(['drawing', 'drawing', 'drawing']);
  });

  it('returns a null item and reset cursor when nothing is present', () => {
    expect(advanceStack([], INITIAL_CURSOR)).toEqual({ cursor: 0, item: null });
    expect(openSequence([], 3)).toEqual([null, null, null]);
  });
});

describe('advanceStack — content changing mid-cycle', () => {
  it('shows a newly-arrived higher-priority item on the next open', () => {
    // Only music present; after an open we are on music. Then a photo arrives.
    let { cursor } = advanceStack(['music'], INITIAL_CURSOR); // cursor 0 -> music
    const afterPhoto = advanceStack(['photo', 'music'], cursor); // ordered [photo, music], prev 0 -> 1
    expect(afterPhoto.item).toBe('music');
    // One more open wraps back to the now-top-priority photo.
    const next = advanceStack(['photo', 'music'], afterPhoto.cursor);
    expect(next.item).toBe('photo');
  });

  it('does not crash when the present set shrinks below a stale cursor', () => {
    // Cursor was 2 (music) with all present; now only photo remains.
    const result = advanceStack(['photo'], 2);
    expect(result).toEqual({ cursor: 0, item: 'photo' });
  });
});

describe('itemAtCursor', () => {
  it('reads the current item without advancing', () => {
    expect(itemAtCursor(ALL, 0)).toBe('photo');
    expect(itemAtCursor(ALL, 1)).toBe('drawing');
    expect(itemAtCursor(ALL, 2)).toBe('music');
  });

  it('wraps out-of-range and negative cursors', () => {
    expect(itemAtCursor(ALL, 3)).toBe('photo');
    expect(itemAtCursor(ALL, -1)).toBe('music');
  });

  it('is null when nothing is present', () => {
    expect(itemAtCursor([], 0)).toBeNull();
  });
});

describe('cursorForType', () => {
  it('returns the index of a present type in priority order', () => {
    expect(cursorForType(ALL, 'photo')).toBe(0);
    expect(cursorForType(ALL, 'music')).toBe(2);
    expect(cursorForType(['photo', 'music'], 'music')).toBe(1);
  });

  it('returns 0 when the type is absent', () => {
    expect(cursorForType(['photo'], 'music')).toBe(0);
  });
});
