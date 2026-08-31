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
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SENT_FLASH_MS, SentFlash } from '@/components/sent-flash';
import { ThemedText } from '@/components/themed-text';
import { WIDGET_ASPECT_RATIO } from '@/constants/app-group';
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
import { fetchMediaById, getSignedUrl } from '@/domain/media/repository';
import { enqueueSend } from '@/domain/media/outbox';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const PALETTE = ['#FFFFFF', '#000000', '#FF3B30', '#007AFF', '#34C759', '#FFCC00'];
const WIDTHS = [3, 8, 16];

/**
 * Finger-drawing canvas (spec 3.2). Draw with color/stroke tools, send as a surprise. When opened
 * with a `base` media id — the round-trip from a drawing widget/notification — the partner's drawing
 * loads as a background layer and new strokes composite on top; Send snapshots the whole canvas
 * (base + strokes) and ships it back as a new drawing via the shared media pipeline.
 *
 * **The canvas is the widget.** It used to be a full-screen portrait rectangle, of which the widget
 * kept a centred slice — so a drawing was composed at one shape and displayed at another, and
 * whatever strayed outside the slice simply never arrived. The surface is now a
 * `WIDGET_ASPECT_RATIO` tile centred above the tools: everything drawn on it survives, because there
 * is nothing left for the widget to crop. That also makes the round-trip exact — the base drawing
 * was made on this same shape, so it lands over the canvas one-to-one.
 */
export default function DrawScreen() {
  const router = useRouter();
  const { base } = useLocalSearchParams<{ base?: string }>();
  const { session, profile } = useAuth();
  const canvasRef = useCanvasRef();

  const [drawing, setDrawing] = useState<DrawingState>(emptyDrawing);
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [sent, setSent] = useState(false);
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

  // Leave once the receipt has been seen; the upload is already running in the outbox.
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => router.back(), SENT_FLASH_MS);
    return () => clearTimeout(timer);
  }, [sent, router]);

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

  /**
   * Snapshot, hand to the outbox, leave. The snapshot itself has to happen here — it is the canvas —
   * but everything after it (resize, upload, row, push) outlives this screen, so a failure surfaces
   * through the outbox rather than a spinner nobody is watching.
   */
  async function send() {
    if (!profile?.coupleId || !session || isEmpty(drawing) || sent) return;
    const snapshot = canvasRef.current?.makeImageSnapshot();
    const base64 = snapshot?.encodeToBase64();
    if (!base64) return;
    try {
      // Write the snapshot to a real temp file — passing a huge data URI straight into
      // expo-image-manipulator (inside sendImage) hangs on device; a file:// URI is reliable.
      const uri = FileSystem.cacheDirectory + 'drawing-' + Date.now() + '.png';
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      enqueueSend(supabase, {
        coupleId: profile.coupleId,
        senderId: session.user.id,
        type: 'drawing',
        localUri: uri,
        now: Date.now(),
      });
      setSent(true);
    } catch (e) {
      // Writing the file is the one step that still happens while the user is here to see it fail.
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
          <Pressable
            onPress={() => {
              void send();
            }}
            hitSlop={8}
            disabled={sent || isEmpty(drawing)}>
            <ThemedText type="link" style={isEmpty(drawing) && styles.disabled}>
              Send
            </ThemedText>
          </Pressable>
        </View>

        {/* The canvas is the widget tile, centred in whatever room the screen has. Measured via the
            wrapping View since Skia's Canvas has no onLayout. */}
        <View style={styles.stage}>
          <View
            style={[styles.canvasFrame, { aspectRatio: WIDGET_ASPECT_RATIO }]}
            onLayout={(e) => setCanvasSize(e.nativeEvent.layout)}>
            <GestureDetector gesture={pan}>
              <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
                <Fill color="#000000" />
                {baseImage && canvasSize.width > 0 && (
                  <SkiaImage
                    image={baseImage}
                    x={0}
                    y={0}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    // The base was drawn (or cropped) at this very ratio, so contain and cover agree.
                    // `contain` is the safe one of the two: a legacy drawing stored at some other
                    // shape letterboxes rather than losing the edges the sender is replying to.
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            This whole square is your partner’s widget.
          </ThemedText>
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <View style={styles.swatches}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                hitSlop={6}
                style={[styles.swatchHit, color === c && styles.swatchHitActive]}>
                <View style={[styles.swatch, { backgroundColor: c }]} />
              </Pressable>
            ))}
          </View>
          <View style={styles.widths}>
            {WIDTHS.map((w) => (
              <Pressable
                key={w}
                onPress={() => setWidth(w)}
                hitSlop={6}
                style={styles.widthBtn}>
                <View
                  style={[
                    styles.widthDot,
                    { width: w + 4, height: w + 4, borderRadius: (w + 4) / 2 },
                    width !== w && styles.widthDotInactive,
                  ]}
                />
              </Pressable>
            ))}
            <Pressable
              onPress={() => setDrawing((d) => clear(d))}
              hitSlop={6}
              style={styles.clearBtn}>
              <ThemedText type="small" style={styles.clearText}>
                Clear
              </ThemedText>
            </Pressable>
          </View>
        </View>
        {sent ? <SentFlash /> : null}
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
  stage: { flex: 1, justifyContent: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four },
  // Bounded by height as well as width so a short screen shrinks the tile instead of pushing the
  // tools off the bottom; the ratio is what must hold, not the size.
  canvasFrame: { width: '100%', maxHeight: '86%', alignSelf: 'center', overflow: 'hidden' },
  hint: { textAlign: 'center' },
  toolbar: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  swatches: { flexDirection: 'row', justifyContent: 'center' },
  // 40px tap target wrapping a smaller visible swatch; active shows a subtle ring.
  swatchHit: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  swatchHitActive: { borderColor: 'rgba(255,255,255,0.9)' },
  swatch: { width: 22, height: 22, borderRadius: 11 },
  widths: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  widthBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widthDot: { backgroundColor: '#FFFFFF' },
  widthDotInactive: { backgroundColor: 'rgba(255,255,255,0.4)' },
  clearBtn: {
    marginLeft: Spacing.two,
    height: 40,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { color: 'rgba(255,255,255,0.6)' },
});
