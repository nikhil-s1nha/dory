/**
 * Supabase access for photos/drawings: downscale, upload to the private bucket, record the row,
 * and read them back. Client injected for testability. The heavy native bits (image resize, byte
 * upload) live only in `sendImage`; everything else is thin mapping.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { WIDGET_ASPECT_RATIO, WIDGET_IMAGE_MAX_DIMENSION } from '@/constants/app-group';
import { centeredCropRect, isNoOpCrop } from './crop';
import { mediaStoragePath } from './path';
import type { MediaItem } from './types';

const BUCKET = 'media';

interface Row {
  id: string;
  couple_id: string;
  sender_id: string;
  type: 'photo' | 'drawing';
  storage_path: string;
  created_at: string;
  seen_at: string | null;
}

const rowToItem = (r: Row): MediaItem => ({
  id: r.id,
  coupleId: r.couple_id,
  senderId: r.sender_id,
  type: r.type,
  storagePath: r.storage_path,
  createdAt: new Date(r.created_at).getTime(),
  seenAt: r.seen_at ? new Date(r.seen_at).getTime() : null,
});

const COLUMNS = 'id, couple_id, sender_id, type, storage_path, created_at, seen_at';

/**
 * Crop a captured image to the widget's frame, downscale it to a widget-safe size
 * (≤ WIDGET_IMAGE_MAX_DIMENSION on the long edge, JPEG), upload it under the couple's path, and
 * insert the media row. Returns the created item.
 *
 * **Crop.** The widget centre-crops to `WIDGET_ASPECT_RATIO` on its way to the screen anyway; doing
 * it here instead means the stored object *is* what the partner sees, so the guide the sender was
 * shown while framing is the whole truth. It also stops us paying to upload and downscale pixels
 * that were always going to be discarded. A drawing is already made at that ratio, so `isNoOpCrop`
 * skips the extra pass for it.
 *
 * **Downscale.** The widget extension has a hard 30MB ceiling and a full-res photo would blow it, so
 * the bytes stay small end-to-end. The bound is on the *long* edge: constraining `width` alone left
 * a portrait capture's height oversized, which then had to be re-encoded a second time by
 * `downloadToAppGroup`. Which edge is longer is derived from the cropped size rather than assumed,
 * so retargeting `WIDGET_ASPECT_RATIO` to a taller family can't quietly reintroduce it.
 */
export async function sendImage(
  supabase: SupabaseClient,
  params: {
    coupleId: string;
    senderId: string;
    type: 'photo' | 'drawing';
    localUri: string;
    now: number;
  },
): Promise<MediaItem> {
  const id = randomUUID();
  const path = mediaStoragePath(params.coupleId, id);

  // Measure before transforming: the crop rectangle is in source pixels and nothing upstream knows
  // them. The decoded ref is then fed straight back into a new context, so the crop and the resize
  // cost one decode and one encode between them rather than one apiece.
  const source = await ImageManipulator.manipulate(params.localUri).renderAsync();
  const crop = centeredCropRect(source.width, source.height, WIDGET_ASPECT_RATIO);
  const skipCrop = isNoOpCrop(source.width, source.height, crop);
  const width = skipCrop ? source.width : crop.width;
  const height = skipCrop ? source.height : crop.height;

  let context = ImageManipulator.manipulate(source);
  if (!skipCrop) context = context.crop(crop);
  // Only ever downscale. `resize({ width })` on an already-small image *enlarges* it, which costs
  // bytes and quality to gain nothing the widget can use.
  if (Math.max(width, height) > WIDGET_IMAGE_MAX_DIMENSION) {
    context = context.resize(
      width >= height
        ? { width: WIDGET_IMAGE_MAX_DIMENSION }
        : { height: WIDGET_IMAGE_MAX_DIMENSION },
    );
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  const bytes = await (await fetch(result.uri)).arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('media_items')
    .insert({
      id,
      couple_id: params.coupleId,
      sender_id: params.senderId,
      type: params.type,
      storage_path: path,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return rowToItem(data as Row);
}

/**
 * Ask the backend to notify the partner that `item` just arrived.
 *
 * This is the delivery half of spec 3.1/3.2. The widget alone can't carry a send across: iOS
 * refreshes it on its own schedule, so without a push the partner sees the photo whenever they next
 * happen to open the app. `notify-partner` re-derives the sender and the couple from the media row
 * itself — we pass only the id, and it trusts the JWT, not us.
 *
 * Best-effort on purpose: the item is already uploaded and will still reach the widget on the next
 * foreground, so a failed notification must never surface as a failed send.
 */
export async function notifyPartnerOfSend(
  supabase: SupabaseClient,
  item: Pick<MediaItem, 'id' | 'type'>,
): Promise<void> {
  try {
    await supabase.functions.invoke('notify-partner', {
      body: { type: item.type, mediaItemId: item.id },
    });
  } catch {
    /* the send succeeded; only the doorbell failed */
  }
}

/** Most recent media for the couple, newest first. */
export async function fetchRecentMedia(
  supabase: SupabaseClient,
  coupleId: string,
  limit = 20,
): Promise<MediaItem[]> {
  const { data, error } = await supabase
    .from('media_items')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(rowToItem);
}

/** Fetch a single media item by id (RLS still scopes it to the caller's couple). */
export async function fetchMediaById(
  supabase: SupabaseClient,
  id: string,
): Promise<MediaItem | null> {
  const { data, error } = await supabase
    .from('media_items')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToItem(data as Row) : null;
}

/** A short-lived signed URL for displaying a private object (bucket is not public). */
export async function getSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Mark an item seen (idempotent-ish; last write wins). */
export async function markSeen(supabase: SupabaseClient, id: string, now: number): Promise<void> {
  const { error } = await supabase
    .from('media_items')
    .update({ seen_at: new Date(now).toISOString() })
    .eq('id', id);
  if (error) throw error;
}
