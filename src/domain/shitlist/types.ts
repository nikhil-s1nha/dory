/** One row of the shared Shitlist. Storage-agnostic; mirrors public.shitlist_items. */
export interface ShitlistItem {
  id: string;
  text: string;
  isChecked: boolean;
  createdBy: string;
  /** Epoch milliseconds. Drives sort order (newest first, like Apple Notes). */
  createdAt: number;
}
