import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { fetchMediaById, getSignedUrl, markSeen } from '@/domain/media/repository';
import { supabase } from '@/lib/supabase';

/**
 * Full-screen view of a single photo/drawing — the destination when a widget is tapped
 * (deep link `bundles:///media/<id>`) and for viewing in-app. Loads the item, resolves a signed URL
 * for the private object, and marks it seen.
 *
 * **Getting back out is the hard part of this screen, not getting in.** A widget tap cold-starts the
 * app, so there is no history to pop and `router.back()` does nothing at all — the reported symptom
 * was "the picture opens with no way out". Three independent exits now, because the one that works
 * depends on how you arrived:
 *
 * 1. `dismiss()` falls back to the tab home when there is nothing to go back to.
 * 2. The close control is a filled circle with its own contrast, not white text that vanishes over a
 *    pale photo, and it sits below the status bar / Dynamic Island rather than under it.
 * 3. Dragging down dismisses. `presentation: 'fullScreenModal'` (root `_layout.tsx`) gives no
 *    swipe-to-dismiss of its own — that is a sheet-only affordance — so the gesture is built here.
 */
export default function MediaViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  /**
   * Leave, whether or not there is anywhere to go back to.
   *
   * `router.back()` was a no-op on an empty history, which is exactly the state a widget tap
   * cold-starts into: this screen can be the *only* thing on the stack. `dismissAll` pops to the
   * root of the stack (the tabs) when there is anything to pop — which also covers a duplicate copy
   * of this screen, where `back()` would only have revealed the identical one underneath — and
   * `replace` covers the case where there is nothing to pop at all. One of the two always fires.
   */
  const dismiss = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  }, [router]);

  // Lazily-initialised state, not a ref: the value is created once and never reassigned, and
  // reading a ref during render is exactly what `react-hooks/refs` forbids.
  const [dragY] = useState(() => new Animated.Value(0));

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim the gesture only once it is clearly a downward drag, so a stray tap on the photo
        // isn't swallowed and the close button stays pressable.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          if (gesture.dy > 0) dragY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          // Distance or flick — either one, so a quick short swipe closes as readily as a slow long
          // one, matching how every other iOS full-screen viewer behaves.
          if (gesture.dy > 120 || gesture.vy > 0.8) {
            dismiss();
            return;
          }
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [dismiss, dragY],
  );

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
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateY: dragY }] }]}
        {...pan.panHandlers}>
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
      </Animated.View>

      {/* Outside the draggable layer so it never slides away from under the user's thumb. */}
      <SafeAreaView style={styles.bar} edges={['top']} pointerEvents="box-none">
        <Pressable
          onPress={dismiss}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID="media-close"
          style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
          {/* A filled circle rather than a bare label: the photo underneath can be any colour, and
              white-on-white is how this control became "basically unaccessible". */}
          <SymbolView name="xmark" tintColor="#FFFFFF" size={17} weight="bold" type="monochrome" />
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
  // Clear of the status bar and the Dynamic Island: `edges={['top']}` handles the inset, and the
  // extra padding keeps the circle from sitting flush against it.
  bar: { position: 'absolute', top: 0, left: 0, right: 0, padding: Spacing.three },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    // Legible over a black frame and over a blown-out white photo alike.
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  closePressed: { backgroundColor: 'rgba(0,0,0,0.8)' },
});
