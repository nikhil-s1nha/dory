import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  addItem,
  deleteItem,
  fetchItems,
  setItemChecked,
  subscribeToItems,
} from '@/domain/shitlist/repository';
import { removeItem, setChecked, upsertItem, upsertMany } from '@/domain/shitlist/state';
import type { ShitlistItem } from '@/domain/shitlist/types';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

/**
 * The shared Shitlist: a couple-scoped checklist modeled on Apple Notes. Add at the top, tap a row
 * to check it (strikethrough), long-press to delete. Updates are optimistic; a Realtime
 * subscription folds in the partner's edits by id so both phones stay in sync.
 */
export default function ShitlistScreen() {
  const colors = useTheme();
  const { session, profile } = useAuth();
  const coupleId = profile?.coupleId ?? null;
  const userId = session?.user.id;

  const [items, setItems] = useState<ShitlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Initial load + live subscription for this couple.
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
      setItems((prev) =>
        change.kind === 'upsert' ? upsertItem(prev, change.item) : removeItem(prev, change.id),
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [coupleId]);

  const onAdd = useCallback(async () => {
    const text = draft.trim();
    if (!text || !coupleId || !userId) return;
    setDraft('');
    try {
      const item = await addItem(supabase, { coupleId, text, createdBy: userId, now: Date.now() });
      setItems((prev) => upsertItem(prev, item));
    } catch {
      setDraft(text); // restore so the user doesn't lose what they typed
      Alert.alert('Could not add that item. Try again.');
    }
  }, [draft, coupleId, userId]);

  const onToggle = useCallback(async (item: ShitlistItem) => {
    const next = !item.isChecked;
    setItems((prev) => setChecked(prev, item.id, next)); // optimistic
    try {
      await setItemChecked(supabase, item.id, next);
    } catch {
      setItems((prev) => setChecked(prev, item.id, item.isChecked)); // revert
    }
  }, []);

  const onDelete = useCallback((item: ShitlistItem) => {
    Alert.alert('Delete item?', item.text, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setItems((prev) => removeItem(prev, item.id)); // optimistic
          try {
            await deleteItem(supabase, item.id);
          } catch {
            setItems((prev) => upsertItem(prev, item)); // revert
          }
        },
      },
    ]);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <ThemedText type="title">Shitlist</ThemedText>
        </View>

        {/* Add row */}
        <Pressable style={styles.addRow} onPress={() => inputRef.current?.focus()}>
          <SymbolView name="plus.circle.fill" tintColor={colors.textSecondary} size={26} />
          <TextInput
            ref={inputRef}
            style={[styles.addInput, { color: colors.text }]}
            placeholder="Add an item"
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={onAdd}
            returnKeyType="done"
            blurOnSubmit={false}
          />
        </Pressable>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.text} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                Nothing here yet. Add the first thing above.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.itemRow}
                onPress={() => onToggle(item)}
                onLongPress={() => onDelete(item)}>
                <SymbolView
                  name={item.isChecked ? 'checkmark.circle.fill' : 'circle'}
                  tintColor={item.isChecked ? colors.textSecondary : colors.text}
                  size={24}
                />
                <ThemedText
                  style={[
                    styles.itemText,
                    item.isChecked && { textDecorationLine: 'line-through', color: colors.textSecondary },
                  ]}>
                  {item.text}
                </ThemedText>
              </Pressable>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  addInput: { flex: 1, fontSize: 17, paddingVertical: Spacing.two },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.half },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  itemText: { flex: 1, fontSize: 17 },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  loading: { marginTop: Spacing.five },
});
