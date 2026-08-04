import {
  removeItem,
  setChecked,
  setText,
  sortItems,
  upsertItem,
  upsertMany,
} from '../state';
import type { ShitlistItem } from '../types';

const item = (id: string, createdAt: number, over: Partial<ShitlistItem> = {}): ShitlistItem => ({
  id,
  text: `item ${id}`,
  isChecked: false,
  createdBy: 'user-a',
  createdAt,
  ...over,
});

describe('sortItems', () => {
  it('orders oldest first (checklist grows downward)', () => {
    const sorted = sortItems([item('a', 100), item('b', 300), item('c', 200)]);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties by id for a stable order', () => {
    const sorted = sortItems([item('y', 100), item('x', 100)]);
    expect(sorted.map((i) => i.id)).toEqual(['x', 'y']);
  });

  it('does not mutate its input', () => {
    const input = [item('a', 100), item('b', 200)];
    sortItems(input);
    expect(input.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('upsertItem', () => {
  it('inserts a new item in sorted (oldest-first) position', () => {
    const result = upsertItem([item('a', 100), item('c', 300)], item('b', 200));
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('replaces an existing item by id instead of duplicating', () => {
    const start = [item('a', 100, { text: 'old' })];
    const result = upsertItem(start, item('a', 100, { text: 'new' }));
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('new');
  });

  it('collapses an optimistic insert and its realtime echo (same id) to one row', () => {
    // Optimistic local add, then the same row arrives over Realtime — must not duplicate.
    const optimistic = upsertItem([], item('shared-id', 500, { isChecked: false }));
    const echoed = upsertItem(optimistic, item('shared-id', 500, { isChecked: false }));
    expect(echoed).toHaveLength(1);
  });
});

describe('upsertMany', () => {
  it('merges a fetched batch, replacing by id', () => {
    const start = [item('a', 100, { text: 'stale' })];
    const result = upsertMany(start, [item('a', 100, { text: 'fresh' }), item('b', 200)]);
    expect(result.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.find((i) => i.id === 'a')?.text).toBe('fresh');
  });
});

describe('removeItem', () => {
  it('drops the matching id', () => {
    expect(removeItem([item('a', 1), item('b', 2)], 'a').map((i) => i.id)).toEqual(['b']);
  });

  it('is a no-op for an absent id', () => {
    expect(removeItem([item('a', 1)], 'zzz')).toHaveLength(1);
  });
});

describe('setChecked', () => {
  it('checks the matching item and leaves others alone', () => {
    const result = setChecked([item('a', 1), item('b', 2)], 'a', true);
    expect(result.find((i) => i.id === 'a')?.isChecked).toBe(true);
    expect(result.find((i) => i.id === 'b')?.isChecked).toBe(false);
  });

  it('can uncheck', () => {
    const result = setChecked([item('a', 1, { isChecked: true })], 'a', false);
    expect(result[0].isChecked).toBe(false);
  });

  it('is a no-op for an absent id', () => {
    const start = [item('a', 1)];
    expect(setChecked(start, 'zzz', true)).toEqual(start);
  });
});

describe('setText', () => {
  it('replaces the matching item text and leaves others alone', () => {
    const result = setText([item('a', 1), item('b', 2)], 'a', 'edited');
    expect(result.find((i) => i.id === 'a')?.text).toBe('edited');
    expect(result.find((i) => i.id === 'b')?.text).toBe('item b');
  });

  it('is a no-op for an absent id', () => {
    const start = [item('a', 1)];
    expect(setText(start, 'zzz', 'x')).toEqual(start);
  });
});
