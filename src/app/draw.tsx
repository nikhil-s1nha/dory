import {
  Canvas,
  Fill,
  Image as SkiaImage,
  Path,
  Skia,
  useCanvasRef,
  useImage,
} from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  beginStroke,
  clear,
  emptyDrawing,
  endStroke,
  extendStroke,
  isEmpty,
  strokeToSvgPath,
  type DrawingState,
} from '@/domain/drawing/state';
import { fetchMediaById, getSignedUrl, sendImage } from '@/domain/media/repository';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const PALETTE = ['#FFFFFF', '#000000', '#FF3B30', '#007AFF', '#34C759', '#FFCC00'];
const WIDTHS = [3, 8, 16];

/**
 * Finger-drawing canvas (spec 3.2). Draw with color/stroke tools, send as a surprise. When opened
 * with a `base` media id — the round-trip from a drawing widget/notification — the partner's drawing
 * loads as a background layer and new strokes composite on top; Send snapshots the whole canvas
 * (base + strokes) and ships it back as a new drawing via the shared media pipeline.
 */
export default function DrawScreen() {
  const router = useRouter();
  const { base } = useLocalSearchParams<{ base?: string }>();
  const { session, profile } = useAuth();
  const canvasRef = useCanvasRef();

  const [drawing, setDrawing] = useState<DrawingState>(emptyDrawing);
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [sending, setSending] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const baseImage = useImage(baseUrl);

  // Round-trip: resolve a signed URL for the drawing we're replying to.
  useEffect(() => {
    if (!base) return;
    let active = true;
    (async () => {
      try {
        const item = await fetchMediaById(supabase, base);
        if (item && active) setBaseUrl(await getSignedUrl(supabase, item.storagePath));
      } catch {
        /* fall back to a blank canvas */
      }
    })();
    return () => {
      active = false;
    };
  }, [base]);

  // Touch → stroke reducers. Gesture callbacks run on the UI thread, so hop to JS to update state.
  const onStart = (x: number, y: number) => {
    setDrawing((d) => beginStroke(d, { id: randomUUID(), color, width, point: { x, y } }));
  };
  const onMove = (x: number, y: number) => setDrawing((d) => extendStroke(d, { x, y }));
  const onEnd = () => setDrawing((d) => endStroke(d));

  const pan = Gesture.Pan()
    .onStart((e) => runOnJS(onStart)(e.x, e.y))
    .onUpdate((e) => runOnJS(onMove)(e.x, e.y))
    .onEnd(() => runOnJS(onEnd)());

  async function send() {
    if (!profile?.coupleId || !session || isEmpty(drawing)) return;
    const snapshot = canvasRef.current?.makeImageSnapshot();
    const base64 = snapshot?.encodeToBase64();
    if (!base64) return;
    setSending(true);
    try {
      // Write the snapshot to a real temp file — passing a huge data URI straight into
      // expo-image-manipulator (inside sendImage) hangs on device; a file:// URI is reliable.
      const uri = FileSystem.cacheDirectory + 'drawing-' + Date.now() + '.png';
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await sendImage(supabase, {
        coupleId: profile.coupleId,
        senderId: session.user.id,
        type: 'drawing',
        localUri: uri,
        now: Date.now(),
      });
      router.back();
    } catch (e) {
      setSending(false);
      Alert.alert('Could not send', e instanceof Error ? e.message : String(e));
    }
  }

  const allStrokes = drawing.current ? [...drawing.strokes, drawing.current] : drawing.strokes;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="link">Close</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">{base ? 'Draw back' : 'Drawing'}</ThemedText>
          <Pressable onPress={send} hitSlop={8} disabled={sending || isEmpty(drawing)}>
            {sending ? (
              <ActivityIndicator />
            ) : (
              <ThemedText type="link" style={isEmpty(drawing) && styles.disabled}>
                Send
              </ThemedText>
            )}
          </Pressable>
        </View>

        {/* Canvas — measured via the wrapping View since Skia's Canvas has no onLayout. */}
        <View
          style={styles.canvasWrap}
          onLayout={(e) => setCanvasSize(e.nativeEvent.layout)}>
          <GestureDetector gesture={pan}>
            <Canvas ref={canvasRef} style={styles.canvas}>
              <Fill color="#000000" />
              {baseImage && canvasSize.width > 0 && (
              <SkiaImage
                image={baseImage}
                x={0}
                y={0}
                width={canvasSize.width}
                height={canvasSize.height}
                fit="contain"
              />
            )}
            {allStrokes.map((stroke) => {
              const path = Skia.Path.MakeFromSVGString(strokeToSvgPath(stroke.points));
              if (!path) return null;
              return (
                <Path
                  key={stroke.id}
                  path={path}
                  color={stroke.color}
                  style="stroke"
                  strokeWidth={stroke.width}
                  strokeCap="round"
                  strokeJoin="round"
                />
              );
            })}
            </Canvas>
          </GestureDetector>
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.swatches}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  color === c && styles.swatchActive,
                ]}
              />
            ))}
          </View>
          <View style={styles.widths}>
            {WIDTHS.map((w) => (
              <Pressable
                key={w}
                onPress={() => setWidth(w)}
                style={[styles.widthBtn, width === w && styles.widthBtnActive]}>
                <View
                  style={[
                    styles.widthDot,
                    { width: w + 6, height: w + 6, borderRadius: (w + 6) / 2 },
                  ]}
                />
              </Pressable>
            ))}
            <Pressable onPress={() => setDrawing((d) => clear(d))} style={styles.clearBtn}>
              <ThemedText type="small" style={styles.clearText}>
                Clear
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  disabled: { opacity: 0.35 },
  canvasWrap: { flex: 1 },
  canvas: { flex: 1 },
  toolbar: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  swatches: { flexDirection: 'row', gap: Spacing.three, justifyContent: 'center' },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#48484A',
  },
  swatchActive: { borderWidth: 3, borderColor: '#FFFFFF' },
  widths: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  widthBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#48484A',
    backgroundColor: '#2C2C2E',
  },
  widthBtnActive: { borderColor: '#FFFFFF', backgroundColor: '#3A3A3C' },
  widthDot: { backgroundColor: '#FFFFFF' },
  clearBtn: {
    marginLeft: Spacing.three,
    height: 48,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#48484A',
    backgroundColor: '#2C2C2E',
  },
  clearText: { color: '#FFFFFF' },
});
