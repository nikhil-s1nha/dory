import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Platform, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLiveActivity } from '@/hooks/use-live-activity';
import { usePush } from '@/hooks/use-push';
import { useWidgetSync } from '@/hooks/use-widget-sync';
import { useTheme } from '@/hooks/use-theme';

/**
 * Instagram-style bottom tab bar for the paired app: a slim bar with a hairline top border, an
 * icon that fills when active, and a small label. Built on expo-router's headless Tabs so we
 * fully control the bar's look (the classic Tabs navigator was dropped in SDK 57). Also mounts
 * `useWidgetSync`, which advances the smart stack and refreshes the home-screen widget on open, and
 * `usePush`, which registers this device for notifications and refreshes the widget when one lands,
 * and `useLiveActivity`, which registers the push-to-start token and gives a push-started activity
 * its image once the app is awake.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  useWidgetSync();
  usePush();
  useLiveActivity();

  return (
    <Tabs>
      <TabSlot />
      <TabList
        style={[
          styles.bar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.backgroundElement,
            paddingBottom: insets.bottom || Spacing.two,
          },
        ]}>
        <TabTrigger name="home" href="/" asChild>
          <TabButton symbol="house" label="Home" />
        </TabTrigger>
        <TabTrigger name="shitlist" href="/shitlist" asChild>
          <TabButton symbol="checklist" label="Shitlist" />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = PressableProps & {
  symbol: SymbolViewProps['name'];
  label: string;
  /** Injected by TabTrigger via asChild. */
  isFocused?: boolean;
};

const TabButton = forwardRef<View, TabButtonProps>(function TabButton(
  { symbol, label, isFocused, ...pressable },
  ref,
) {
  const colors = useTheme();
  const tint = isFocused ? colors.text : colors.textSecondary;
  return (
    <Pressable ref={ref} {...pressable} style={styles.tab} accessibilityRole="tab">
      <SymbolView
        name={symbol}
        // Filled/heavier weight when active, matching Instagram's active-tab treatment.
        tintColor={tint}
        weight={isFocused ? 'semibold' : 'regular'}
        size={26}
        type="hierarchical"
      />
      <ThemedText type="small" style={[styles.label, { color: tint }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Platform.OS === 'ios' ? 2 : 0,
  },
  label: { fontSize: 11 },
});
