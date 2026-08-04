import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { fetchMediaById, getSignedUrl, markSeen } from '@/domain/media/repository';
import { supabase } from '@/lib/supabase';

/**
 * Full-screen view of a single photo/drawing — the destination when a widget is tapped
 * (deep link `bundles:///media/<id>`) and for viewing in-app. Loads the item, resolves a signed URL
 * for the private object, and marks it seen.
 */
export default function MediaViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!id) return;
    let active = true;
    const run = async () => {
      try {
        const item = await fetchMediaById(supabase, id);
        if (!item) {
          if (active) setState('missing');
          return;
        }
        const signed = await getSignedUrl(supabase, item.storagePath);
        if (!active) return;
        setUrl(signed);
        setState('ready');
        // Fire-and-forget: opening it counts as seeing it.
        markSeen(supabase, item.id, Date.now()).catch(() => {});
      } catch {
        if (active) setState('missing');
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <View style={styles.black}>
      {state === 'loading' && <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" />}
      {state === 'ready' && url && (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="contain" />
      )}
      {state === 'missing' && (
        <View style={styles.centered}>
          <ThemedText type="subtitle" style={styles.onDark}>
            This photo isn’t available.
          </ThemedText>
        </View>
      )}
      <SafeAreaView style={styles.bar} edges={['top']}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ThemedText type="smallBold" style={styles.onDark}>
            Close
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  centered: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onDark: { color: '#fff' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.four },
});
