import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Placeholder for a feature that lands in a later milestone. Home already navigates to these
 * routes, so the wiring is real; the screen is replaced with the actual flow when its milestone
 * arrives (Photo = M3, Drawing = M4, Music = M5/M6).
 */
export function ComingSoon({
  symbol,
  title,
  milestone,
}: {
  symbol: SymbolViewProps['name'];
  title: string;
  milestone: string;
}) {
  const colors = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <SymbolView name={symbol} tintColor={colors.textSecondary} size={64} type="hierarchical" />
        <ThemedText type="title">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
          Coming in {milestone}.
        </ThemedText>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText type="link">Back</ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  sub: { marginBottom: Spacing.three },
});
