import {
  PREVIEW_ROTATION_INTERVAL_MS,
  nextPreviewFrame,
} from '../rotation';
import { INITIAL_CURSOR, type WidgetContentType } from '../stack';

/** Walk `ticks` rotations from the initial cursor and collect what each frame showed. */
function rotate(present: readonly WidgetContentType[], ticks: number): (WidgetContentType | null)[] {
  const seen: (WidgetContentType | null)[] = [];
  let cursor = INITIAL_CURSOR;
  for (let i = 0; i < ticks; i++) {
    const frame = nextPreviewFrame(present, cursor);
    cursor = frame.cursor;
    seen.push(frame.item);
  }
  return seen;
}

describe('PREVIEW_ROTATION_INTERVAL_MS', () => {
  it('is the ~15 seconds the spec asks for', () => {
    expect(PREVIEW_ROTATION_INTERVAL_MS).toBe(15_000);
  });
});

describe('nextPreviewFrame', () => {
  it('opens on the highest-priority item, not on whatever was passed first', () => {
    expect(rotate(['music', 'photo', 'drawing'], 1)).toEqual(['photo']);
  });

  it('rotates through all three in priority order', () => {
    expect(rotate(['photo', 'drawing', 'music'], 3)).toEqual(['photo', 'drawing', 'music']);
  });

  it('returns to the top after a full cycle, so the preview loops forever', () => {
    expect(rotate(['photo', 'drawing', 'music'], 7)).toEqual([
      'photo',
      'drawing',
      'music',
      'photo',
      'drawing',
      'music',
      'photo',
    ]);
  });

  it('cycles just the two present items when one type is missing', () => {
    expect(rotate(['photo', 'music'], 4)).toEqual(['photo', 'music', 'photo', 'music']);
  });

  it('holds still on a single item rather than flickering it in and out', () => {
    expect(rotate(['drawing'], 3)).toEqual(['drawing', 'drawing', 'drawing']);
  });

  it('shows nothing, and never throws, when the partner has sent nothing', () => {
    expect(rotate([], 3)).toEqual([null, null, null]);
  });

  it('recovers from a stale cursor left over from a larger set', () => {
    // The preview held 3 items, a photo expired, and the cursor now points past the end.
    const frame = nextPreviewFrame(['drawing', 'music'], 97);
    expect(frame.item).not.toBeNull();
    expect(['drawing', 'music']).toContain(frame.item);
  });
});
