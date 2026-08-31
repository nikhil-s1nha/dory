import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithApple, signInWithEmail, signUpWithEmail } from '@/lib/auth';

/**
 * Entry screen for signed-out users. Sign in with Apple is the whole screen by default — one tap,
 * no fields — because asking for an email, a password *and* a name up front is what stopped people
 * finishing signup. The email form is still here, but folded away behind a link so it costs
 * nothing to ignore.
 *
 * On success the auth-context session listener flips the route automatically, so there's no
 * navigation here.
 */
export default function AuthScreen() {
  const colors = useTheme();
  const scheme = useColorScheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'signUp';
  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    (!isSignUp || displayName.trim().length > 0);

  // Apple's button is only legal — and only functional — where the OS supports the flow, so the
  // screen has to ask before drawing it. Until the answer arrives the email link stands alone,
  // which is also exactly what a simulator or a pre-iOS-13 device should see.
  useEffect(() => {
    let active = true;
    const run = async () => {
      const available = await AppleAuthentication.isAvailableAsync();
      if (active) setAppleAvailable(available);
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  async function pressApple() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await signInWithApple();
    setBusy(false);
    // A cancel is the user changing their mind; showing an error for it would be a lie.
    if (result.error) setError(result.error.message);
  }

  async function submit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = isSignUp
      ? await signUpWithEmail(email.trim(), password, displayName.trim())
      : await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (isSignUp) {
      // If the project requires email confirmation, no session arrives yet — tell the user.
      setNotice('Account created. If asked, confirm your email, then sign in.');
      setMode('signIn');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <ThemedText type="title">Bundles</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            A little window into each other&apos;s day.
          </ThemedText>

          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              // Apple requires the button to contrast with its background, so it inverts with
              // the app's theme rather than picking a fixed colour.
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={styles.appleButton}
              onPress={pressApple}
            />
          )}

          {busy && !showEmailForm && <ActivityIndicator color={colors.textSecondary} />}

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}
          {notice && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.notice}>
              {notice}
            </ThemedText>
          )}

          {!showEmailForm ? (
            <Pressable
              onPress={() => {
                setShowEmailForm(true);
                setError(null);
                setNotice(null);
              }}
              hitSlop={8}>
              <ThemedText type="link" themeColor="textSecondary" style={styles.toggle}>
                Use email instead
              </ThemedText>
            </Pressable>
          ) : (
            <>
              {isSignUp && (
                <TextInput
                  style={[
                    styles.input,
                    { color: colors.text, backgroundColor: colors.backgroundElement },
                  ]}
                  placeholder="Your name"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="words"
                  value={displayName}
                  onChangeText={setDisplayName}
                />
              )}
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, backgroundColor: colors.backgroundElement },
                ]}
                placeholder="Email"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, backgroundColor: colors.backgroundElement },
                ]}
                placeholder="Password (min 6 characters)"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <Pressable
                style={[
                  styles.button,
                  { backgroundColor: colors.text },
                  !canSubmit && styles.buttonDisabled,
                ]}
                disabled={!canSubmit || busy}
                onPress={submit}>
                {busy ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: colors.background }}>
                    {isSignUp ? 'Sign up' : 'Sign in'}
                  </ThemedText>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setMode(isSignUp ? 'signIn' : 'signUp');
                  setError(null);
                  setNotice(null);
                }}
                hitSlop={8}>
                <ThemedText type="link" style={styles.toggle}>
                  {isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
                </ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  tagline: { marginBottom: Spacing.two },
  // The Apple button draws itself natively and collapses to nothing without an explicit height.
  appleButton: { height: 50 },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonDisabled: { opacity: 0.4 },
  error: { color: '#E5484D' },
  notice: {},
  toggle: { textAlign: 'center' },
});
