import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * The receipt for an optimistic send.
 *
 * Uploading now happens after the screen is gone (see `domain/media/outbox`), so the tap has to
 * confirm itself: without this the camera would simply blink away and leave the user unsure whether
 * anything left the phone. It is a moment, not a wait — the send is already running underneath it.
 */
export const SENT_FLASH_MS = 450;

export function SentFlash({ label = 'Sent' }: { label?: string }) {
  return (
    <View style={styles.backdrop} pointerEvents="none">
      <View style={styles.pill}>
        <ThemedText type="smallBold" style={styles.text}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  text: { color: '#000' },
});
