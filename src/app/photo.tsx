import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { sendImage } from '@/domain/media/repository';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

/**
 * Low-friction photo capture (spec 3.1): the camera opens straight away — no gallery, no caption.
 * Take a shot, tap send, done. On send we downscale + upload + record the item; the partner's
 * device gets notified (push wiring lands in Phase B once the Apple entitlement is in place).
 */
export default function PhotoScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { session, profile } = useAuth();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [captured, setCaptured] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Permission gate — kept minimal; the camera fills the screen once granted.
  if (!permission) return <View style={styles.black} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <ThemedText type="subtitle">Camera access needed</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.permText}>
          Dory opens the camera so you can send your partner a photo.
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

  async function capture() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 1 });
    if (photo?.uri) setCaptured(photo.uri);
  }

  async function send() {
    if (!captured || !profile?.coupleId || !session) return;
    setSending(true);
    setError(null);
    try {
      await sendImage(supabase, {
        coupleId: profile.coupleId,
        senderId: session.user.id,
        type: 'photo',
        localUri: captured,
        now: Date.now(),
      });
      router.back(); // sent — return home
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Try again.');
      setSending(false);
    }
  }

  // Review-and-send state after a capture: the frozen shot fills the screen.
  if (captured) {
    return (
      <View style={styles.black}>
        <Image source={{ uri: captured }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <SafeAreaView style={styles.reviewBar} edges={['bottom']}>
          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}
          <View style={styles.reviewRow}>
            <Pressable
              style={styles.secondary}
              disabled={sending}
              onPress={() => {
                setCaptured(null);
                setError(null);
              }}>
              <ThemedText type="smallBold" style={styles.onDark}>
                Retake
              </ThemedText>
            </Pressable>
            <Pressable style={styles.sendBtn} disabled={sending} onPress={send}>
              {sending ? (
                <ActivityIndicator color="#000" />
              ) : (
                <ThemedText type="smallBold" style={styles.sendLabel}>
                  Send
                </ThemedText>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Live camera with a shutter.
  return (
    <View style={styles.black}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={styles.shutterBar} edges={['bottom']}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <ThemedText type="smallBold" style={styles.onDark}>
            Close
          </ThemedText>
        </Pressable>
        <Pressable onPress={capture} style={styles.shutterOuter}>
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.close} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  permText: { textAlign: 'center' },
  pill: { borderRadius: 999, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  shutterBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
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
  reviewBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.four, gap: Spacing.three },
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
  error: { color: '#ff6b6b', textAlign: 'center' },
});
