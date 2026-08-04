import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  addItem,
  deleteItem,
  fetchItems,
  setItemChecked,
  setItemText,
  subscribeToItems,
} from '@/domain/shitlist/repository';
import {
  removeItem,
  setChecked,
  setText,
  sortItems,
  upsertItem,
  upsertMany,
} from '@/domain/shitlist/state';
import type { ShitlistItem } from '@/domain/shitlist/types';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const SAVE_DEBOUNCE_MS = 500;

/**
 * The shared Shitlist — a couple-scoped checklist with Apple-Notes-style fluid editing: every item
 * is inline-editable text (cursor moves anywhere, wraps like normal text), Return adds a new item,
 * Backspace on an empty item deletes it and moves focus to the previous one, and tapping the circle
 * checks it off. Edits are optimistic and debounced to the server; a Realtime subscription folds in
 * the partner's changes (skipping the row you're actively editing so your cursor isn't yanked).
 */
export default function ShitlistScreen() {
  const colors = useTheme();
  const { session, profile } = useAuth();
  const coupleId = profile?.coupleId ?? null;
  const userId = session?.user.id;

  const [items, setItems] = useState<ShitlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const inputs = useRef(new Map<string, TextInput>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const focusedId = useRef<string | null>(null);
  // Id of a row to focus once it has rendered — a ref, so clearing it in the effect below doesn't
  // trigger another render (which the setState-in-effect lint rule forbids).
  const pendingFocus = useRef<string | null>(null);

  const ordered = sortItems(items);

  // Initial load + live subscription. Realtime skips the row under the cursor so a partner's echo
  // (or our own) doesn't overwrite in-progress typing.
  useEffect(() => {
    if (!coupleId) return;
    let active = true;
    const run = async () => {
      try {
        const fetched = await fetchItems(supabase, coupleId);
        if (active) setItems((prev) => upsertMany(prev, fetched));
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    const unsubscribe = subscribeToItems(supabase, coupleId, (change) => {
      setItems((prev) => {
        if (change.kind === 'delete') return removeItem(prev, change.id);
        if (change.item.id === focusedId.current) return prev; // don't clobber active edit
        return upsertItem(prev, change.item);
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [coupleId]);

  // Focus a freshly created / newly-adjacent row once it has mounted (runs after items change).
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    inputs.current.get(id)?.focus();
    pendingFocus.current = null;
  }, [items]);

  // Clear any outstanding debounce timers on unmount.
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const saveTextNow = useCallback((id: string, text: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setItemText(supabase, id, text).catch(() => {});
  }, []);

  const scheduleSave = useCallback((id: string, text: string) => {
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setItemText(supabase, id, text).catch(() => {});
      }, SAVE_DEBOUNCE_MS),
    );
  }, []);

  const createItem = useCallback(
    async (text: string) => {
      if (!coupleId || !userId) return;
      try {
        const item = await addItem(supabase, { coupleId, text, createdBy: userId, now: Date.now() });
        pendingFocus.current = item.id;
        setItems((prev) => upsertItem(prev, item));
      } catch {
        /* transient — the add row is still there to retry */
      }
    },
    [coupleId, userId],
  );

  const onChangeText = useCallback(
    (item: ShitlistItem, text: string) => {
      // Return in a multiline field arrives as a newline: keep the text before it in this item and
      // start a new item with whatever follows (usually nothing). This is Apple Notes' return-to-add
      // without fighting the keyboard.
      const newlineAt = text.indexOf('\n');
      if (newlineAt !== -1) {
        const before = text.slice(0, newlineAt);
        const after = text.slice(newlineAt + 1);
        // Return on an already-empty item ends the checklist (Apple Notes reverts it / stops adding)
        // rather than spawning another empty row.
        if (before.length === 0 && after.length === 0) {
          setItems((prev) => removeItem(prev, item.id));
          const t = timers.current.get(item.id);
          if (t) clearTimeout(t);
          timers.current.delete(item.id);
          deleteItem(supabase, item.id).catch(() => {});
          Keyboard.dismiss();
          return;
        }
        setItems((prev) => setText(prev, item.id, before));
        saveTextNow(item.id, before);
        createItem(after);
        return;
      }
      setItems((prev) => setText(prev, item.id, text));
      scheduleSave(item.id, text);
    },
    [createItem, saveTextNow, scheduleSave],
  );

  const onToggle = useCallback(async (item: ShitlistItem) => {
    const next = !item.isChecked;
    setItems((prev) => setChecked(prev, item.id, next));
    try {
      await setItemChecked(supabase, item.id, next);
    } catch {
      setItems((prev) => setChecked(prev, item.id, item.isChecked));
    }
  }, []);

  const deleteAndFocusPrev = useCallback(
    (item: ShitlistItem) => {
      const idx = ordered.findIndex((i) => i.id === item.id);
      const prevItem = idx > 0 ? ordered[idx - 1] : null;
      if (prevItem) pendingFocus.current = prevItem.id;
      setItems((prev) => removeItem(prev, item.id));
      const t = timers.current.get(item.id);
      if (t) clearTimeout(t);
      timers.current.delete(item.id);
      deleteItem(supabase, item.id).catch(() => {});
    },
    [ordered],
  );

  const onKeyPress = useCallback(
    (item: ShitlistItem, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      // Backspace on an already-empty item removes it (Apple Notes) and drops focus to the previous.
      if (e.nativeEvent.key === 'Backspace' && item.text.length === 0) {
        deleteAndFocusPrev(item);
      }
    },
    [deleteAndFocusPrev],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <ThemedText type="title">Shitlist</ThemedText>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {ordered.map((item) => (
          <View key={item.id} style={styles.row}>
            <Pressable
              onPress={() => onToggle(item)}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.isChecked }}
              style={[
                styles.checkbox,
                { borderColor: colors.textSecondary },
                item.isChecked && { backgroundColor: colors.textSecondary, borderColor: colors.textSecondary },
              ]}>
              {item.isChecked && <Text style={styles.check}>✓</Text>}
            </Pressable>
            <TextInput
              ref={(r) => {
                if (r) inputs.current.set(item.id, r);
                else inputs.current.delete(item.id);
              }}
              style={[
                styles.itemInput,
                { color: item.isChecked ? colors.textSecondary : colors.text },
                item.isChecked && styles.struck,
              ]}
              value={item.text}
              placeholder="List item"
              placeholderTextColor={colors.textSecondary}
              multiline
              scrollEnabled={false}
              onChangeText={(t) => onChangeText(item, t)}
              onKeyPress={(e) => onKeyPress(item, e)}
              onFocus={() => {
                focusedId.current = item.id;
              }}
              onBlur={() => {
                if (focusedId.current === item.id) focusedId.current = null;
                saveTextNow(item.id, item.text);
              }}
            />
          </View>
        ))}

        {/* Always-present add affordance (and the only thing shown on an empty list). */}
        <Pressable style={styles.row} onPress={() => createItem('')} disabled={loading}>
          <View style={[styles.checkbox, { borderColor: colors.backgroundSelected }]} />
          <ThemedText type="default" themeColor="textSecondary" style={styles.addLabel}>
            Add an item
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const CHECKBOX = 24;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: Spacing.two, gap: Spacing.three },
  checkbox: {
    width: CHECKBOX,
    height: CHECKBOX,
    borderRadius: CHECKBOX / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  check: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // NOTE: no `lineHeight` here. lineHeight on a multiline TextInput makes iOS pass NaN to
  // CoreGraphics ("invalid numeric value (NaN)") during text layout on focus/edit. The row uses
  // paddingVertical + the checkbox's marginTop for alignment instead.
  itemInput: { flex: 1, fontSize: 17, padding: 0 },
  struck: { textDecorationLine: 'line-through' },
  addLabel: { flex: 1, fontSize: 17, marginTop: 1 },
});
