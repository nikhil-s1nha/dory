/**
 * Keeps the home-screen widget in sync. On app foreground we resolve which content is present
 * (latest photo, latest drawing, partner's now-playing), advance the smart-stack cursor one step
 * (M5 logic), download the chosen item's image into the App Group container, and push it to the
 * widget via updateSnapshot. The widget itself never hits the network — it only reads the local
 * file we place in `widgetsDirectory`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File } from 'expo-file-system';
import { widgetsDirectory } from 'expo-widgets';

import DoryWidget, { type DoryWidgetProps } from '../../widgets/dory-widget';
import { fetchPartnerNowPlaying } from '@/domain/spotify/repository';
import { fetchRecentMedia, getSignedUrl } from '@/domain/media/repository';
import type { MediaItem } from '@/domain/media/types';
import type { NowPlaying } from '@/domain/spotify/types';
import { advanceStack, INITIAL_CURSOR, type WidgetContentType } from '@/domain/widget/stack';
import { supabase } from '@/lib/supabase';

const CURSOR_KEY = 'dory.widget.cursor';

/** Download `url` into the App Group under `filename`, replacing any existing copy; return its uri. */
async function downloadToAppGroup(url: string, filename: string): Promise<string> {
  const dir = new Directory(widgetsDirectory);
  const target = new File(dir, filename);
  if (target.exists) target.delete();
  await File.downloadFileAsync(url, target);
  return target.uri;
}

interface StackContext {
  latestPhoto: MediaItem | null;
  latestDrawing: MediaItem | null;
  music: NowPlaying | null;
  partnerName: string;
}

/** Turn the chosen stack item into widget props, downloading its image into the App Group. */
async function buildProps(
  item: WidgetContentType | null,
  ctx: StackContext,
): Promise<DoryWidgetProps> {
  if (item === 'photo' && ctx.latestPhoto) {
    const url = await getSignedUrl(supabase, ctx.latestPhoto.storagePath);
    const file = await downloadToAppGroup(url, `photo-${ctx.latestPhoto.id}.jpg`);
    return { kind: 'photo', imageFile: file, deepLink: `dory://media/${ctx.latestPhoto.id}` };
  }
  if (item === 'drawing' && ctx.latestDrawing) {
    const url = await getSignedUrl(supabase, ctx.latestDrawing.storagePath);
    const file = await downloadToAppGroup(url, `drawing-${ctx.latestDrawing.id}.jpg`);
    // Tapping a drawing opens the canvas pre-loaded, ready to draw back (spec 3.2).
    return { kind: 'drawing', imageFile: file, deepLink: `dory://draw?base=${ctx.latestDrawing.id}` };
  }
  if (item === 'music' && ctx.music) {
    const imageFile = ctx.music.albumArtUrl
      ? await downloadToAppGroup(ctx.music.albumArtUrl, 'album.jpg')
      : undefined;
    return {
      kind: 'music',
      imageFile,
      title: ctx.music.title,
      subtitle: ctx.music.artist,
      caption: `${ctx.partnerName} is listening to ${ctx.music.title}`,
      deepLink: 'dory://music',
    };
  }
  return { kind: 'empty' };
}

/**
 * Advance the stack one step and refresh the widget. Call on app foreground for a paired user.
 * Best-effort: any failure (offline, no content) leaves the widget on its last snapshot.
 */
export async function syncWidgetOnOpen(coupleId: string, userId: string): Promise<void> {
  try {
    // The widget is a window into what *the partner* is doing (spec 3.1/3.2: a sent item "becomes
    // the new top-priority item in the partner's widget stack"). `fetchRecentMedia` is couple-scoped,
    // so it also returns our own sends — filter them out, or the widget shows you your own photo
    // back and a partner who has gone quiet looks like a broken widget.
    const media = await fetchRecentMedia(supabase, coupleId, 20);
    const fromPartner = media.filter((m) => m.senderId !== userId);
    const latestPhoto = fromPartner.find((m) => m.type === 'photo') ?? null;
    const latestDrawing = fromPartner.find((m) => m.type === 'drawing') ?? null;
    const partner = await fetchPartnerNowPlaying(supabase, coupleId, userId);
    const music = partner?.nowPlaying ?? null;

    const present: WidgetContentType[] = [];
    if (latestPhoto) present.push('photo');
    if (latestDrawing) present.push('drawing');
    if (music) present.push('music');

    const stored = await AsyncStorage.getItem(CURSOR_KEY);
    const prevCursor = stored === null ? INITIAL_CURSOR : Number(stored);
    const { cursor, item } = advanceStack(present, prevCursor);
    await AsyncStorage.setItem(CURSOR_KEY, String(cursor));

    const props = await buildProps(item, {
      latestPhoto,
      latestDrawing,
      music,
      partnerName: partner?.name ?? 'Your partner',
    });
    DoryWidget.updateSnapshot(props);
  } catch {
    /* leave the widget on its last good snapshot */
  }
}
