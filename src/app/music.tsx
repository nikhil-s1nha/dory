import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  disconnectSpotify,
  fetchPartnerNowPlaying,
  isSpotifyConnected,
  startSpotifyConnect,
  type PartnerNowPlaying,
} from '@/domain/spotify/repository';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const RETURN_URL = 'bundles://spotify-auth-callback';

/**
 * Music (spec 3.3): connect your own Spotify, and see what your partner is playing —
 * "{name} is listening to {song}". The connect flow opens Spotify in an auth browser; the server
 * stores tokens and a cron poller keeps the partner's now-playing fresh (this screen also updates
 * live via Realtime). The widget shows the same, in Phase B.
 */
export default function MusicScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const coupleId = profile?.coupleId ?? null;

  const [connected, setConnected] = useState<boolean | null>(null);
  const [partner, setPartner] = useState<PartnerNowPlaying | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshConnected = useCallback(async () => {
    if (!userId) return;
    try {
      setConnected(await isSpotifyConnected(supabase, userId));
    } catch {
      setConnected(false);
    }
  }, [userId]);

  const refreshPartner = useCallback(async () => {
    if (!coupleId || !userId) return;
    try {
      setPartner(await fetchPartnerNowPlaying(supabase, coupleId, userId));
    } catch {
      /* leave prior value */
    }
  }, [coupleId, userId]);

  useEffect(() => {
    // Initial load inside an async run so no state is set synchronously during the effect.
    const run = async () => {
      await refreshConnected();
      await refreshPartner();
    };
    run();
    if (!coupleId) return;
    // Live: the poller upserts now_playing; reflect the partner's changes immediately.
    const channel = supabase
      .channel(`now_playing:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'now_playing', filter: `couple_id=eq.${coupleId}` },
        () => {
          void refreshPartner();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coupleId, refreshConnected, refreshPartner]);

  async function connect() {
    setBusy(true);
    try {
      const url = await startSpotifyConnect(supabase);
      const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
      // Re-check on both 'success' (the bundles:// return URL was hit) and 'dismiss' (the user may have
      // closed the sheet after the token exchange already completed server-side). Either way, pull
      // fresh state so the UI flips to Connected without leaving/reopening the screen. If nothing
      // actually connected, isSpotifyConnected stays false and the Connect button remains for retry.
      if (result.type === 'success' || result.type === 'dismiss') {
        await refreshConnected();
        await refreshPartner();
      }
    } catch {
      /* surfaced via the still-showing Connect button */
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!userId) return;
    setBusy(true);
    try {
      await disconnectSpotify(supabase, userId);
      setConnected(false);
    } finally {
      setBusy(false);
    }
  }

  const np = partner?.nowPlaying;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="link">Close</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">Music</ThemedText>
          <View style={styles.spacer} />
        </View>

        {/* Partner's now-playing */}
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          {np ? (
            <>
              {np.albumArtUrl ? (
                <Image source={{ uri: np.albumArtUrl }} style={styles.art} contentFit="cover" />
              ) : (
                <View style={[styles.art, { backgroundColor: colors.backgroundSelected }]} />
              )}
              <ThemedText type="subtitle" numberOfLines={2} style={styles.track}>
                {np.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {np.artist}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
                {partner?.name} is listening to {np.title}
              </ThemedText>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.idle}>
              {partner
                ? `${partner.name} isn't playing anything right now.`
                : 'Nothing playing yet. When your partner connects Spotify and plays something, it shows here.'}
            </ThemedText>
          )}
        </View>

        {/* Your connection */}
        <View style={styles.connectRow}>
          {connected === null ? (
            <ActivityIndicator color={colors.text} />
          ) : connected ? (
            <>
              <View style={[styles.connectedPill, { backgroundColor: '#1DB954' }]}>
                <ThemedText type="smallBold" style={styles.onGreen}>
                  Spotify connected ✓
                </ThemedText>
              </View>
              <Pressable onPress={disconnect} disabled={busy} hitSlop={8}>
                <ThemedText type="link">Disconnect</ThemedText>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={[styles.button, { backgroundColor: '#1DB954' }, busy && styles.dim]}
              disabled={busy}
              onPress={connect}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText type="smallBold" style={styles.onGreen}>
                  Connect Spotify
                </ThemedText>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.three },
  spacer: { width: 44 },
  card: { borderRadius: 20, padding: Spacing.four, alignItems: 'center', gap: Spacing.two },
  art: { width: 200, height: 200, borderRadius: 12, marginBottom: Spacing.two },
  track: { textAlign: 'center' },
  caption: { marginTop: Spacing.three, textAlign: 'center' },
  idle: { textAlign: 'center', paddingVertical: Spacing.five },
  connectRow: { alignItems: 'center', gap: Spacing.three },
  connectedPill: { borderRadius: 999, paddingHorizontal: Spacing.five, paddingVertical: Spacing.three, alignItems: 'center', minWidth: 200 },
  button: { borderRadius: 999, paddingHorizontal: Spacing.five, paddingVertical: Spacing.three, alignItems: 'center', minWidth: 200 },
  onGreen: { color: '#fff' },
  dim: { opacity: 0.6 },
});
