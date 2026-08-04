import {
  beginStroke,
  clear,
  emptyDrawing,
  endStroke,
  extendStroke,
  isEmpty,
  strokeToSvgPath,
  undo,
  type DrawingState,
} from '../state';

const start = (): DrawingState =>
  beginStroke(emptyDrawing, { id: 's1', color: '#000', width: 4, point: { x: 0, y: 0 } });

describe('stroke lifecycle', () => {
  it('begins a stroke with its first point and tools', () => {
    const s = start();
    expect(s.current).toEqual({ id: 's1', color: '#000', width: 4, points: [{ x: 0, y: 0 }] });
    expect(s.strokes).toHaveLength(0);
  });

  it('extends the in-progress stroke', () => {
    const s = extendStroke(extendStroke(start(), { x: 1, y: 1 }), { x: 2, y: 2 });
    expect(s.current?.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  it('extendStroke is a no-op when no stroke is active', () => {
    expect(extendStroke(emptyDrawing, { x: 5, y: 5 })).toBe(emptyDrawing);
  });

  it('commits the current stroke on end', () => {
    const s = endStroke(extendStroke(start(), { x: 1, y: 1 }));
    expect(s.current).toBeNull();
    expect(s.strokes).toHaveLength(1);
    expect(s.strokes[0].points).toHaveLength(2);
  });

  it('does not begin a new stroke until the previous is ended', () => {
    // A second begin drops the uncommitted first stroke rather than committing it.
    const s = beginStroke(start(), { id: 's2', color: '#f00', width: 8, point: { x: 9, y: 9 } });
    expect(s.strokes).toHaveLength(0);
    expect(s.current?.id).toBe('s2');
  });
});

describe('undo / clear', () => {
  it('undo removes the last committed stroke', () => {
    let s = endStroke(start());
    s = endStroke(beginStroke(s, { id: 's2', color: '#000', width: 4, point: { x: 1, y: 1 } }));
    expect(s.strokes.map((x) => x.id)).toEqual(['s1', 's2']);
    expect(undo(s).strokes.map((x) => x.id)).toEqual(['s1']);
  });

  it('clear empties the drawing', () => {
    const s = endStroke(start());
    expect(clear(s)).toEqual(emptyDrawing);
  });
});

describe('isEmpty', () => {
  it('is true for a fresh drawing and false once anything is drawn', () => {
    expect(isEmpty(emptyDrawing)).toBe(true);
    expect(isEmpty(start())).toBe(false); // in-progress counts
    expect(isEmpty(endStroke(start()))).toBe(false);
  });
});

describe('strokeToSvgPath', () => {
  it('builds move + line commands', () => {
    expect(
      strokeToSvgPath([
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
      ]),
    ).toBe('M 0 0 L 10 5 L 20 0');
  });

  it('renders a single-point tap as a dot (degenerate line)', () => {
    expect(strokeToSvgPath([{ x: 3, y: 4 }])).toBe('M 3 4 L 3 4');
  });

  it('is empty for no points', () => {
    expect(strokeToSvgPath([])).toBe('');
  });
});
