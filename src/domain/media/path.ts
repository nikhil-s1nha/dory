/**
 * Storage path construction, kept pure and separate so the convention is testable and used
 * identically by the uploader, the full-view screen, and (Phase B) the widget-cache writer.
 * The leading segment MUST be the couple id — the Storage RLS policy authorizes on it.
 */

export function mediaStoragePath(coupleId: string, itemId: string, ext = 'jpg'): string {
  return `${coupleId}/${itemId}.${ext}`;
}
