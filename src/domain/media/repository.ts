/**
 * Supabase access for photos/drawings: downscale, upload to the private bucket, record the row,
 * and read them back. Client injected for testability. The heavy native bits (image resize, byte
 * upload) live only in `sendImage`; everything else is thin mapping.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { WIDGET_IMAGE_MAX_DIMENSION } from '@/constants/app-group';
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
 * Downscale a captured image to a widget-safe size (≤ WIDGET_IMAGE_MAX_DIMENSION on the long edge,
 * JPEG), upload it under the couple's path, and insert the media row. Downscaling here keeps the
 * bytes small end-to-end — the widget extension has a hard 30MB ceiling, and a full-res photo would
 * blow it. Returns the created item.
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

  // Resize so the longest edge is at most the widget max; expo-image-manipulator keeps aspect ratio.
  const context = ImageManipulator.manipulate(params.localUri).resize({
    width: WIDGET_IMAGE_MAX_DIMENSION,
  });
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
