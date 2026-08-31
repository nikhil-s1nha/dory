import {
  INITIAL_CURSOR,
  isWidgetContentType,
  itemAtCursor,
  nextInCycle,
  orderedPresent,
  parseCursor,
  selectionOrder,
  WIDGET_CYCLE,
  type WidgetContentType,
  type WidgetCursor,
} from '../stack';

const ALL: WidgetContentType[] = ['photo', 'drawing', 'music'];

/**
 * Fold N app opens and collect what each one showed, carrying the cursor the way `widget-sync`
 * does: the item that landed becomes the cursor for the next open.
 */
function opens(present: WidgetContentType[], count: number): (WidgetContentType | null)[] {
  const shown: (WidgetContentType | null)[] = [];
  let cursor: WidgetCursor = INITIAL_CURSOR;
  for (let i = 0; i < count; i++) {
    const item = nextInCycle(present, cursor);
    if (item) cursor = item;
    shown.push(item);
  }
  return shown;
}

describe('orderedPresent', () => {
  it('keeps cycle order (photo > drawing > music) regardless of input order', () => {
    expect(orderedPresent(['music', 'photo', 'drawing'])).toEqual(['photo', 'drawing', 'music']);
  });

  it('drops absent types', () => {
    expect(orderedPresent(['music', 'photo'])).toEqual(['photo', 'music']);
    expect(orderedPresent(['drawing'])).toEqual(['drawing']);
    expect(orderedPresent([])).toEqual([]);
  });

  it('matches the declared cycle for the full set', () => {
    expect(orderedPresent(ALL)).toEqual([...WIDGET_CYCLE]);
  });
});

describe('isWidgetContentType', () => {
  it('accepts exactly the three content types', () => {
    expect(WIDGET_CYCLE.every(isWidgetContentType)).toBe(true);
  });

  it('rejects everything else, including the old numeric cursors', () => {
    for (const value of ['', 'photos', '0', '-1', '2', null, undefined, 0, {}]) {
      expect(isWidgetContentType(value)).toBe(false);
    }
  });
});

describe('parseCursor', () => {
  it('round-trips a stored item', () => {
    expect(parseCursor('drawing')).toBe('drawing');
  });

  it('treats nothing stored as "never shown anything"', () => {
    expect(parseCursor(null)).toBe(INITIAL_CURSOR);
    expect(parseCursor(undefined)).toBe(INITIAL_CURSOR);
  });

  it('resets the old numeric cursors rather than misreading them', () => {
    // Every already-installed build persisted an index here. Upgrading must not treat '2' as an
    // item name or throw on it — it restarts the cycle from the top, once, silently.
    for (const legacy of ['-1', '0', '1', '2', 'garbage']) {
      expect(parseCursor(legacy)).toBe(INITIAL_CURSOR);
    }
  });
});

describe('nextInCycle — one open, one step', () => {
  it('shows the top of the cycle before anything has ever been shown', () => {
    expect(nextInCycle(ALL, INITIAL_CURSOR)).toBe('photo');
  });

  it('walks photo -> drawing -> music -> photo across opens', () => {
    expect(opens(ALL, 4)).toEqual(['photo', 'drawing', 'music', 'photo']);
  });

  it('cycles a subset in cycle order', () => {
    expect(opens(['music', 'photo'], 4)).toEqual(['photo', 'music', 'photo', 'music']);
  });

  it('alternates forever between exactly two items — the case the bug was reported against', () => {
    expect(opens(['photo', 'drawing'], 6)).toEqual([
      'photo',
      'drawing',
      'photo',
      'drawing',
      'photo',
      'drawing',
    ]);
  });

  it('stays on the single present item every open', () => {
    expect(opens(['drawing'], 3)).toEqual(['drawing', 'drawing', 'drawing']);
  });

  it('shows nothing, and never throws, when the partner has sent nothing', () => {
    expect(nextInCycle([], INITIAL_CURSOR)).toBeNull();
    expect(opens([], 3)).toEqual([null, null, null]);
  });

  it('is idempotent: asking twice from the same cursor gives the same answer', () => {
    // The property the old integer cursor did not have. Two syncs that overlap both read the same
    // stored cursor, and this is what stops them from walking two steps for one app open.
    for (const cursor of [INITIAL_CURSOR, 'photo', 'drawing', 'music'] as WidgetCursor[]) {
      expect(nextInCycle(ALL, cursor)).toBe(nextInCycle(ALL, cursor));
    }
  });

  it('never repeats the item already showing while another one is present', () => {
    for (const present of [ALL, ['photo', 'drawing'], ['drawing', 'music']] as WidgetContentType[][]) {
      for (const cursor of present) {
        expect(nextInCycle(present, cursor)).not.toBe(cursor);
      }
    }
  });
});

describe('nextInCycle — content changing underneath the cursor', () => {
  it('restarts at the top when the item last shown has since disappeared', () => {
    // Music was showing; the Spotify poller nulled now_playing. The stored cursor names an item
    // that no longer exists, and an index would silently have addressed a different one.
    expect(nextInCycle(['photo', 'drawing'], 'music')).toBe('photo');
  });

  it('keeps its place when an item appears above the one showing', () => {
    // Showing the drawing; a photo arrives. Cycle order puts photo first, but we were past it, so
    // the next step is music — the photo comes round on the open after.
    expect(nextInCycle(ALL, 'drawing')).toBe('music');
    expect(nextInCycle(ALL, 'music')).toBe('photo');
  });

  it('survives an item disappearing and coming back', () => {
    let cursor: WidgetCursor = 'photo';
    cursor = nextInCycle(['photo', 'drawing'], cursor)!; // drawing
    expect(cursor).toBe('drawing');
    cursor = nextInCycle(['drawing'], cursor)!; // only a drawing left: it holds
    expect(cursor).toBe('drawing');
    expect(nextInCycle(['photo', 'drawing'], cursor)).toBe('photo');
  });
});

describe('selectionOrder', () => {
  it('is empty only when nothing is present', () => {
    expect(selectionOrder([], INITIAL_CURSOR)).toEqual([]);
    expect(selectionOrder(['music'], INITIAL_CURSOR)).toEqual(['music']);
  });

  it('lists every present item exactly once, whatever the intent', () => {
    const intents = [
      { kind: 'advance' } as const,
      { kind: 'stay' } as const,
      { kind: 'show', item: 'music' } as const,
    ];
    for (const intent of intents) {
      const order = selectionOrder(ALL, 'drawing', intent);
      expect([...order].sort()).toEqual([...ALL].sort());
    }
  });

  it('advance starts at the next item and wraps round the rest', () => {
    expect(selectionOrder(ALL, 'photo', { kind: 'advance' })).toEqual(['drawing', 'music', 'photo']);
    expect(selectionOrder(ALL, 'music', { kind: 'advance' })).toEqual(['photo', 'drawing', 'music']);
  });

  it('advance is the default intent', () => {
    expect(selectionOrder(ALL, 'photo')).toEqual(selectionOrder(ALL, 'photo', { kind: 'advance' }));
  });

  it('stay re-shows the item already up, then falls through the cycle behind it', () => {
    // A push landing while the widget already shows the photo must refresh that photo, not shuffle.
    expect(selectionOrder(ALL, 'photo', { kind: 'stay' })).toEqual(['photo', 'drawing', 'music']);
  });

  it('stay falls back to the top of the cycle when there is nothing to stay on', () => {
    expect(selectionOrder(ALL, INITIAL_CURSOR, { kind: 'stay' })).toEqual(ALL);
    expect(selectionOrder(['drawing', 'music'], 'photo', { kind: 'stay' })).toEqual([
      'drawing',
      'music',
    ]);
  });

  it('show jumps straight to the named item, wherever the cursor was', () => {
    expect(selectionOrder(ALL, 'photo', { kind: 'show', item: 'music' })).toEqual([
      'music',
      'photo',
      'drawing',
    ]);
  });

  it('show ignores an item that is not actually present and cycles instead', () => {
    // A push can name music while the poller has already cleared now_playing.
    expect(selectionOrder(['photo', 'drawing'], 'photo', { kind: 'show', item: 'music' })).toEqual([
      'drawing',
      'photo',
    ]);
  });

  it('gives a fallback for every item, so one unbuildable item cannot wedge the cycle', () => {
    // The head is what we try first; the tail is what the sync falls through to when building it
    // fails. A single-element order for a three-item stack would mean a broken photo blocks forever.
    expect(selectionOrder(ALL, 'photo').length).toBe(3);
  });
});

describe('itemAtCursor', () => {
  it('indexes the present items in cycle order', () => {
    expect(itemAtCursor(ALL, 0)).toBe('photo');
    expect(itemAtCursor(ALL, 1)).toBe('drawing');
    expect(itemAtCursor(ALL, 2)).toBe('music');
  });

  it('wraps out-of-range and negative indexes rather than returning undefined', () => {
    expect(itemAtCursor(ALL, 3)).toBe('photo');
    expect(itemAtCursor(ALL, -1)).toBe('music');
    expect(itemAtCursor(['photo'], 97)).toBe('photo');
  });

  it('returns null when nothing is present', () => {
    expect(itemAtCursor([], 0)).toBeNull();
  });
});
