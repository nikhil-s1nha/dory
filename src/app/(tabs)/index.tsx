import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HomeButton } from '@/components/home-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * Home: the app title over a 2x2 button grid. The uniform gap between the four tiles leaves a
 * plus-shaped channel through the middle (the spec's "cross/gap pattern"). Three tiles open the
 * feature flows; the fourth is a visible, non-functional placeholder for something later.
 */
export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Dory
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
});
