/**
 * Supabase access for the shared Shitlist. The client is injected so callers pass the singleton
 * and tests can pass a fake. Ids are generated client-side (expo-crypto) so an optimistic insert
 * and its Realtime echo reconcile by the same id (see state.ts).
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import type { ShitlistItem } from './types';

/** Shape of a public.shitlist_items row as selected below. */
interface Row {
  id: string;
  text: string;
  is_checked: boolean;
  created_by: string;
  created_at: string;
}

const rowToItem = (r: Row): ShitlistItem => ({
  id: r.id,
  text: r.text,
  isChecked: r.is_checked,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at).getTime(),
});

const COLUMNS = 'id, text, is_checked, created_by, created_at';

/** Load the couple's whole list, newest first. */
export async function fetchItems(
  supabase: SupabaseClient,
  coupleId: string,
): Promise<ShitlistItem[]> {
  const { data, error } = await supabase
    .from('shitlist_items')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(rowToItem);
}

/**
 * Insert a new item with a client-generated id and return the local representation immediately,
 * so the caller can render it optimistically. `createdAt` is stamped locally for instant sort;
 * the server's own timestamp arrives via the Realtime echo and reconciles by id.
 */
export async function addItem(
  supabase: SupabaseClient,
  params: { coupleId: string; text: string; createdBy: string; now: number },
): Promise<ShitlistItem> {
  const item: ShitlistItem = {
    id: randomUUID(),
    text: params.text,
    isChecked: false,
    createdBy: params.createdBy,
    createdAt: params.now,
  };
  const { error } = await supabase.from('shitlist_items').insert({
    id: item.id,
    couple_id: params.coupleId,
    text: item.text,
    created_by: item.createdBy,
  });
  if (error) throw error;
  return item;
}

export async function setItemChecked(
  supabase: SupabaseClient,
  id: string,
  isChecked: boolean,
): Promise<void> {
  const { error } = await supabase.from('shitlist_items').update({ is_checked: isChecked }).eq('id', id);
  if (error) throw error;
}

export async function deleteItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('shitlist_items').delete().eq('id', id);
  if (error) throw error;
}

/** Events pushed from the Realtime subscription. A delete only carries the id. */
export type ShitlistChange =
  | { kind: 'upsert'; item: ShitlistItem }
  | { kind: 'delete'; id: string };

/**
 * Subscribe to this couple's item changes (a partner's adds/checks/deletes). Returns an
 * unsubscribe function. Filtered server-side by couple_id, so only relevant rows arrive.
 */
export function subscribeToItems(
  supabase: SupabaseClient,
  coupleId: string,
  onChange: (change: ShitlistChange) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`shitlist:${coupleId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shitlist_items', filter: `couple_id=eq.${coupleId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          onChange({ kind: 'delete', id: (payload.old as { id: string }).id });
        } else {
          onChange({ kind: 'upsert', item: rowToItem(payload.new as Row) });
        }
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
