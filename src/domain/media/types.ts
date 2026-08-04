/** One photo/drawing sent between partners. Mirrors public.media_items. */
export interface MediaItem {
  id: string;
  coupleId: string;
  senderId: string;
  type: 'photo' | 'drawing';
  /** Path within the private `media` bucket: `<coupleId>/<id>.<ext>`. */
  storagePath: string;
  createdAt: number;
  /** Epoch ms when the recipient opened it; null until seen. */
  seenAt: number | null;
}
