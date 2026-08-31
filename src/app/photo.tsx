import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SENT_FLASH_MS, SentFlash } from '@/components/sent-flash';
import { ThemedText } from '@/components/themed-text';
import { WidgetCropFrame } from '@/components/widget-crop-frame';
import { Spacing } from '@/constants/theme';
import { enqueueSend } from '@/domain/media/outbox';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

/**
 * Low-friction photo capture (spec 3.1): the camera opens straight away — no gallery, no caption.
 * Take a shot, tap send, done.
 *
 * Two things this screen is careful about:
 *
 * **The frame is honest.** The camera is laid out at its capture ratio rather than stretched over
 * the screen, so the crop guide drawn on top sits over exactly the pixels that will be sent. Filling
 * the screen with the preview would have shown the user a frame the sensor never captured.
 *
 * **The send doesn't hold the screen.** Uploading takes seconds; the tap hands the work to the
 * outbox and dismisses. Failures come back through the outbox's own alert, not from here — by the
 * time one happens this component no longer exists.
 */

/**
 * The iPhone's back camera captures 4:3 stills, and the preview is boxed to match so what is framed
 * is what is taken. Only the crop guide's *placement* depends on this; the crop itself is recomputed
 * from the real capture dimensions in `sendImage`, so a device that captures something else gets a
 * slightly optimistic guide rather than a wrong photo.
 */
const CAPTURE_ASPECT = 3 / 4;

const GUIDE_LABEL = 'Your partner’s widget shows the bright part';

export default function PhotoScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { session, profile } = useAuth();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [captured, setCaptured] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [sent, setSent] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leave once the receipt has been seen. The upload is already running elsewhere, so this timer
  // only paces the animation — nothing is waiting on it.
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => router.back(), SENT_FLASH_MS);
    return () => clearTimeout(timer);
  }, [sent, router]);

  // Permission gate — kept minimal; the camera fills the screen once granted.
  if (!permission) return <View style={styles.black} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <ThemedText type="subtitle">Camera access needed</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.permText}>
          Bundles opens the camera so you can send your partner a photo.
        </ThemedText>
        <Pressable style={[styles.pill, { backgroundColor: colors.text }]} onPress={requestPermission}>
          <ThemedText type="smallBold" style={{ color: colors.background }}>
            Allow camera
          </ThemedText>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText type="link">Not now</ThemedText>
        </Pressable>
      </SafeAreaView>
    );
  }

  /**
   * `takePictureAsync` rejects on a hardware or permission failure, and that rejection used to go
   * nowhere: an unhandled promise rejection, a shutter that visibly did nothing, and no way to
   * tell that from a slow capture. Say what happened, stay put.
   */
  async function capture() {
    setError(null);
    setCapturing(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 1 });
      // Width and height are kept because the review overlay has to be laid out at the capture's
      // real shape for its guide to mean anything.
      if (photo?.uri) setCaptured({ uri: photo.uri, width: photo.width, height: photo.height });
      else setError('The camera returned nothing. Try again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take that photo. Try again.');
    } finally {
      setCapturing(false);
    }
  }

  function send() {
    if (!captured || !profile?.coupleId || !session) return;
    enqueueSend(supabase, {
      coupleId: profile.coupleId,
      senderId: session.user.id,
      type: 'photo',
      localUri: captured.uri,
      now: Date.now(),
    });
    setSent(true);
  }

  // Review-and-send state after a capture: the same guide as the viewfinder, over the frozen shot,
  // so what was framed is confirmed rather than re-imagined.
  if (captured) {
    const reviewAspect = captured.width > 0 && captured.height > 0
      ? captured.width / captured.height
      : CAPTURE_ASPECT;
    return (
      <SafeAreaView style={styles.black} edges={['bottom']}>
        <View style={styles.stage}>
          <WidgetCropFrame frameAspect={reviewAspect} label={GUIDE_LABEL}>
            <Image
              source={{ uri: captured.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
            />
          </WidgetCropFrame>
        </View>
        <View style={styles.reviewBar}>
          <View style={styles.reviewRow}>
            <Pressable
              style={styles.secondary}
              disabled={sent}
              onPress={() => {
                setCaptured(null);
                setError(null);
              }}>
              <ThemedText type="smallBold" style={styles.onDark}>
                Retake
              </ThemedText>
            </Pressable>
            <Pressable style={styles.sendBtn} disabled={sent} onPress={send}>
              <ThemedText type="smallBold" style={styles.sendLabel}>
                Send
              </ThemedText>
            </Pressable>
          </View>
        </View>
        {sent ? <SentFlash /> : null}
      </SafeAreaView>
    );
  }

  // Live camera with a shutter.
  return (
    <SafeAreaView style={styles.black} edges={['bottom']}>
      <View style={styles.stage}>
        <WidgetCropFrame frameAspect={CAPTURE_ASPECT} label={GUIDE_LABEL}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        </WidgetCropFrame>
      </View>
      <View style={styles.shutterBar}>
        {/* A failed capture has to be visible on this screen too — it's where the user still is. */}
        {error && (
          <ThemedText type="small" style={styles.captureError}>
            {error}
          </ThemedText>
        )}
        <View style={styles.shutterRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
            <ThemedText type="smallBold" style={styles.onDark}>
              Close
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              void capture();
            }}
            disabled={capturing}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={styles.close} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  permText: { textAlign: 'center' },
  pill: { borderRadius: 999, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  // The camera no longer fills the screen: it is boxed at the capture ratio and centred, which is
  // what lets the guide overlay be exact. The controls sit in the flow below it rather than on top.
  stage: { flex: 1, justifyContent: 'center' },
  shutterBar: { gap: Spacing.three, paddingHorizontal: Spacing.four, paddingBottom: Spacing.four },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  captureError: { color: '#ff6b6b', textAlign: 'center' },
  close: { width: 60 },
  onDark: { color: '#fff' },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  reviewBar: { padding: Spacing.four, gap: Spacing.three },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secondary: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  sendBtn: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    minWidth: 120,
    alignItems: 'center',
  },
  sendLabel: { color: '#000000' },
});
