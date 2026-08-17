import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { devEndActivity, devStartActivity, devUpdateActivity } from '@/domain/activity/dev-trigger';
import { describeActivityError } from '@/domain/activity/live-activity';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

/**
 * Whether to render the Live Activity dev control.
 *
 * **Read this before a device run.** `__DEV__` is `false` in a Release build, and this project's
 * device builds are `expo run:ios --configuration Release` (CLAUDE.md) — so on a Release install the
 * control is *not* on screen, and its absence is not a bug in the activity. Either install a Debug
 * build for the experiment, or flip this constant to `true` for the one build that needs it.
 */
// TEMPORARY (device experiment, not to be committed): forced on so the control is present in a
// Release build, which is how this project installs to the phone. __DEV__ is false there.
export const SHOW_ACTIVITY_DEV_CONTROL = true;

/**
 * A deliberately ugly debug panel for driving the Live Activity by hand: Start, Update, End.
 *
 * It prints the result of the last action on screen because that is the only channel that survives
 * this setup — Metro's console doesn't reliably stream here, so a failed `start` would otherwise be
 * indistinguishable from a `start` that was never tapped. A failure shows the ActivityKit error
 * verbatim, which is what says whether Live Activities are switched off in Settings, the OS is too
 * old, or the layout never registered.
 */
export function ActivityDevControl() {
  const [status, setStatus] = useState('idle — tap Start');
  const { session, profile } = useAuth();
  const coupleId = profile?.coupleId ?? null;
  const userId = session?.user.id ?? null;

  const run = (label: string, action: () => string | Promise<string>) => {
    const go = async () => {
      setStatus(`${label}…`);
      try {
        setStatus(await action());
      } catch (error) {
        setStatus(`${label} FAILED — ${describeActivityError(error)}`);
      }
    };
    void go();
  };

  // Start and Update read the partner's real content, so they need the signed-in pair. Without one
  // there is nothing real to show and the buttons would only ever produce the placeholder.
  const paired = coupleId !== null && userId !== null;

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>DEV ONLY — Live Activity</Text>
      <View style={styles.row}>
        <DevButton
          label="Start"
          disabled={!paired}
          onPress={() => run('start', () => devStartActivity(coupleId!, userId!))}
        />
        <DevButton
          label="Update"
          disabled={!paired}
          onPress={() => run('update', () => devUpdateActivity(coupleId!, userId!))}
        />
        <DevButton label="End" onPress={() => run('end', devEndActivity)} />
      </View>
      <Text style={styles.status} testID="activity-dev-status">
        {status}
      </Text>
    </View>
  );
}

function DevButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // Named for UI automation: `tools/widget-shot/` taps by accessibility label.
      accessibilityLabel={`Live Activity ${label}`}
      testID={`activity-dev-${label.toLowerCase()}`}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Fixed colours, not themed: this is a debug affordance and should never be mistaken for product UI.
  panel: {
    borderWidth: 2,
    borderColor: '#FFD60A',
    borderRadius: 12,
    padding: Spacing.two,
    gap: Spacing.two,
    backgroundColor: '#1C1C1E',
  },
  heading: { color: '#FFD60A', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', gap: Spacing.two },
  button: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    backgroundColor: '#FFD60A',
    alignItems: 'center',
  },
  buttonPressed: { backgroundColor: '#C9A800' },
  buttonDisabled: { opacity: 0.35 },
  buttonLabel: { color: '#000000', fontSize: 14, fontWeight: '700' },
  status: { color: '#FFFFFF', fontSize: 11 },
});
