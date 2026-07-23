import { useState } from 'react';
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
import { useTheme } from '@/hooks/use-theme';
import { signInWithEmail, signUpWithEmail } from '@/lib/auth';

/**
 * Entry screen for signed-out users. One form, toggled between sign in and sign up. On success
 * the auth-context session listener flips the route automatically, so there's no navigation here.
 */
export default function AuthScreen() {
  const colors = useTheme();
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
          <ThemedText type="title">Dory</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </ThemedText>

          {isSignUp && (
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.backgroundElement }]}
              placeholder="Your name"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              value={displayName}
              onChangeText={setDisplayName}
            />
          )}
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.backgroundElement }]}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.backgroundElement }]}
            placeholder="Password (min 6 characters)"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

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

          <Pressable
            style={[styles.button, { backgroundColor: colors.text }, !canSubmit && styles.buttonDisabled]}
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
              {isSignUp ? 'Have an account? Sign in' : "New here? Create an account"}
            </ThemedText>
          </Pressable>
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
