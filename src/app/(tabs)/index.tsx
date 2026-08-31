import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HomeButton } from '@/components/home-button';
import { ThemedText } from '@/components/themed-text';
import { WidgetPreview } from '@/components/widget-preview';
import { Spacing } from '@/constants/theme';

/**
 * Home: the app title over a 2x2 button grid. The uniform gap between the four tiles leaves a
 * plus-shaped channel through the middle (the spec's "cross/gap pattern"). Three tiles open the
 * feature flows; the fourth is a visible, non-functional placeholder for something later.
 *
 * Below the grid sits the live widget preview, which rotates through the partner's photo, drawing
 * and music every 15 seconds — spec 3.4's stretch goal. It's placed under the grid so the specified
 * composition (title, then the 2x2 with its cross channel) is still the first thing you see.
 *
 * The Live Activity dev panel used to sit under the preview. It is off Home for good — a yellow
 * debug box under the one piece of product UI on this screen, on every Debug build. The component
 * and its trigger module are intact (`src/components/activity-dev-control.tsx`,
 * `src/domain/activity/dev-trigger.ts`): to drive an activity by hand again, render
 * `<ActivityDevControl />` from wherever the experiment lives — note `SHOW_ACTIVITY_DEV_CONTROL` is
 * `__DEV__`, and this project installs Release builds to the phone, so read that file's warning
 * first.
 */
export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Bundles
        </ThemedText>

        <View style={styles.grid}>
          <View style={styles.row}>
            <HomeButton symbol="camera.fill" label="Photo" onPress={() => router.push('/photo')} />
            <HomeButton symbol="scribble" label="Drawing" onPress={() => router.push('/draw')} />
          </View>
          <View style={styles.row}>
            <HomeButton symbol="music.note" label="Music" onPress={() => router.push('/music')} />
            <HomeButton symbol="plus" label="Soon" disabled />
          </View>
        </View>

        <View style={styles.preview}>
          <WidgetPreview />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  title: { marginBottom: Spacing.five },
  // The gaps below form the visible plus between the four quadrants.
  grid: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  preview: { marginTop: Spacing.five },
});
