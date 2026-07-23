import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * One quadrant of the home screen's 2x2 grid: a rounded square with an SF Symbol and a label.
 * A disabled button (the future-feature placeholder) is dimmed and non-interactive but still
 * visibly present, per the spec.
 */
export function HomeButton({
  symbol,
  label,
  onPress,
  disabled,
}: {
  symbol: SymbolViewProps['name'];
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.backgroundElement },
        pressed && { backgroundColor: colors.backgroundSelected },
        disabled && styles.disabled,
      ]}>
      <SymbolView name={symbol} tintColor={colors.text} size={44} type="hierarchical" />
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  label: { marginTop: Spacing.one },
  disabled: { opacity: 0.35 },
});
