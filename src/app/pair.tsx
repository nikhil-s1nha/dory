import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describePairingError, isUniqueViolation } from '@/domain/pairing/errors';
import { normalizeCode } from '@/domain/pairing/invite-code';
import {
  createCoupleWithInvite,
  findOutstandingInvite,
  redeemInvite,
  type OutstandingInvite,
} from '@/domain/pairing/repository';
import type { RedeemOutcome } from '@/domain/pairing/service';
import { useAuth } from '@/lib/auth-context';
import { signOut } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Human-readable copy for each way a redemption can be rejected. */
const REDEEM_MESSAGES: Record<Exclude<RedeemOutcome, { ok: true }>['reason'], string> = {
  EXPIRED: 'That code has expired. Ask your partner for a fresh one.',
  ALREADY_REDEEMED: 'That code has already been used.',
  SELF_REDEMPTION: "That's your own code — share it with your partner instead.",
  REDEEMER_ALREADY_PAIRED: "You're already paired.",
  COUPLE_FULL: 'That couple is already full.',
  CODE_NOT_FOUND: "We couldn't find that code. Double-check it.",
  NOT_AUTHENTICATED: 'Please sign in again.',
  UNKNOWN: 'Something went wrong. Try again.',
};

/** Best-effort second look for an invite we already own. Its own failure isn't worth reporting. */
async function recoverOutstanding(uid: string): Promise<OutstandingInvite | null> {
  try {
    return await findOutstandingInvite(supabase, uid);
  } catch {
    return null;
  }
}

/**
 * Shown to signed-in users who aren't paired yet. Two ways forward: mint an invite for your
 * partner, or enter the code they sent you. On a successful redeem we refresh the profile, which
 * flips the root gate over to the main app.
 */
export default function PairScreen() {
  const colors = useTheme();
  const { session, refreshProfile } = useAuth();
  const userId = session?.user.id;

  const [outstanding, setOutstanding] = useState<OutstandingInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [entered, setEntered] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load any existing outstanding invite on mount. State updates live inside the async run so
  // nothing is set synchronously during the effect; `loading` already starts true.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const run = async () => {
      try {
        const found = await findOutstandingInvite(supabase, userId);
        if (active) setOutstanding(found);
      } catch (e) {
        if (active) setError(describePairingError(e, 'Could not load your invite.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [userId]);

  async function onCreate() {
    if (!userId) return;
    setError(null);
    setBusy(true);
    try {
      const { invite, coupleId } = await createCoupleWithInvite(supabase, userId, Date.now());
      setOutstanding({ coupleId, code: invite.code, expiresAt: invite.expiresAt });
    } catch (e) {
      // A member_a unique violation means this account already owns a couple — the invite exists,
      // we just failed to see it on mount (the same failed read that can land a user here in the
      // first place). Recover it silently; showing an error for a code we already have is absurd.
      if (isUniqueViolation(e)) {
        const recovered = await recoverOutstanding(userId);
        if (recovered) {
          setOutstanding(recovered);
          setBusy(false);
          return;
        }
      }
      setError(describePairingError(e, 'Could not create an invite.'));
    } finally {
      setBusy(false);
    }
  }

  async function onRedeem() {
    setError(null);
    const code = normalizeCode(entered);
    setBusy(true);
    try {
      const outcome = await redeemInvite(supabase, code);
      if (outcome.ok) {
        await refreshProfile(); // flips the root gate to the main app
        return;
      }
      setError(REDEEM_MESSAGES[outcome.reason]);
    } catch (e) {
      setError(describePairingError(e, 'Could not redeem that code.'));
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!outstanding) return;
    await Clipboard.setStringAsync(outstanding.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title">Pair up</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Connect with your partner to start sharing.
          </ThemedText>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            {/* Your invite */}
            <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText type="smallBold">Your invite code</ThemedText>
              {outstanding ? (
                <>
                  <ThemedText type="title" style={styles.code}>
                    {outstanding.code}
                  </ThemedText>
                  <Pressable onPress={onCopy} hitSlop={8}>
                    <ThemedText type="link">{copied ? 'Copied!' : 'Copy code'}</ThemedText>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={[styles.button, { backgroundColor: colors.text }]}
                  disabled={busy}
                  onPress={onCreate}>
                  {busy ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: colors.background }}>
                      Create a code
                    </ThemedText>
                  )}
                </Pressable>
              )}
            </View>

            {/* Redeem a partner's code */}
            <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText type="smallBold">Have a code?</ThemedText>
              <TextInput
                style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
                placeholder="Enter partner's code"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                value={entered}
                onChangeText={setEntered}
              />
              <Pressable
                style={[
                  styles.button,
                  { backgroundColor: colors.text },
                  entered.trim().length === 0 && styles.buttonDisabled,
                ]}
                disabled={busy || entered.trim().length === 0}
                onPress={onRedeem}>
                {busy ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: colors.background }}>
                    Pair
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </>
        )}

        {/* Outside the loading branch: a sign-out failure has to be visible too, and the sign-out
            button is the one control that's live at every point on this screen. */}
        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable onPress={() => signOut()} hitSlop={8} style={styles.signOut}>
          <ThemedText type="link" themeColor="textSecondary">
            Sign out
          </ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.five, gap: Spacing.three },
  header: { gap: Spacing.one, marginBottom: Spacing.two },
  card: { borderRadius: 16, padding: Spacing.four, gap: Spacing.three, alignItems: 'center' },
  code: { letterSpacing: 4 },
  input: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 2,
  },
  button: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  error: { color: '#E5484D', textAlign: 'center' },
  signOut: { marginTop: 'auto', alignItems: 'center', paddingVertical: Spacing.three },
});
