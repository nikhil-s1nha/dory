import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';

/**
 * Shown when we're signed in but couldn't read the profile that says whether this user is paired.
 *
 * This screen exists because the alternative is worse: with no way to tell "no profile row" from
 * "the request failed", a network blip at launch used to route an already-paired couple to /pair,
 * where the only button ("Create a code") hits the member_a unique constraint. An honest "we
 * couldn't check" with a retry is the correct answer to a question we don't know the answer to.
 *
 * The provider also retries on every foreground, so this often clears itself.
 */
export default function ConnectionScreen() {
  const colors = useTheme();
  const { refreshProfile } = useAuth();
  const [retrying, setRetrying] = useState(false);

  async function onRetry() {
    setRetrying(true);
    try {
      await refreshProfile();
    } finally {
      // If the retry succeeded the root gate has already swapped this screen out; if it failed
      // we're still here and the button needs to be pressable again.
      setRetrying(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <ThemedText type="title">Can&apos;t reach Bundles</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
          We couldn&apos;t load your account just now. Check your connection and try again — nothing
          has been lost.
        </ThemedText>
        <Pressable
          style={[styles.button, { backgroundColor: colors.text }]}
          disabled={retrying}
          accessibilityRole="button"
          onPress={onRetry}>
          {retrying ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <ThemedText type="smallBold" style={{ color: colors.background }}>
              Try again
            </ThemedText>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  body: { textAlign: 'center' },
  button: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
