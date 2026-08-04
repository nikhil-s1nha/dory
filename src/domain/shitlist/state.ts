/**
 * Pure reducers for the Shitlist's local cache. The screen renders from this array and mutates it
 * optimistically; the same array is reconciled against server fetches and Realtime events. Every
 * function is pure and returns a new sorted array, so the list is deterministic regardless of
 * whether an update arrived from a local tap, the initial fetch, or a partner's edit echoed over
 * Realtime.
 *
 * The reconciliation key is the item id. Because the app generates the id client-side before
 * inserting (see the repository), an optimistic insert and the Realtime echo of that same insert
 * share an id and collapse to one row — no duplicates, no flicker.
 */

import type { ShitlistItem } from './types';

/**
 * Oldest first, like an Apple Notes checklist that grows downward: new items append at the bottom
 * and you type top-to-bottom. Ties broken by id so the order is stable across re-sorts.
 */
export function sortItems(items: ShitlistItem[]): ShitlistItem[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Insert `item`, or replace the existing row with the same id. Result stays sorted. */
export function upsertItem(items: ShitlistItem[], item: ShitlistItem): ShitlistItem[] {
  const next = items.filter((i) => i.id !== item.id);
  next.push(item);
  return sortItems(next);
}

/** Merge a batch (e.g. an initial fetch) into existing state, replacing by id. */
export function upsertMany(items: ShitlistItem[], incoming: ShitlistItem[]): ShitlistItem[] {
  return incoming.reduce(upsertItem, items);
}

export function removeItem(items: ShitlistItem[], id: string): ShitlistItem[] {
  return items.filter((i) => i.id !== id);
}

/** Toggle (or set) an item's checked state, returning a new array. No-op if the id is absent. */
export function setChecked(items: ShitlistItem[], id: string, isChecked: boolean): ShitlistItem[] {
  return items.map((i) => (i.id === id ? { ...i, isChecked } : i));
}

/** Replace an item's text (inline editing). No-op if the id is absent. */
export function setText(items: ShitlistItem[], id: string, text: string): ShitlistItem[] {
  return items.map((i) => (i.id === id ? { ...i, text } : i));
}
