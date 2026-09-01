import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useDeepLinkReplay } from '@/hooks/use-deep-link-replay';
import { AuthProvider, useAuth } from '@/lib/auth-context';

// Hold the native splash until the initial session + profile fetch settles, so the user never
// sees the app flash through /auth on its way to the right screen.
SplashScreen.preventAutoHideAsync();

/**
 * Declarative auth gate. `Stack.Protected` mounts only the screen whose guard is true, so the
 * states map one-to-one: signed out -> /auth, signed in but unpaired -> /pair, paired -> the
 * (tabs) app. While `loading`, the native splash is still up, so the transient state is hidden.
 *
 * The fourth state is "we couldn't read the profile". It gets its own screen rather than falling
 * through to /pair: a failed read is not evidence the user is unpaired, and routing a paired
 * couple to pairing is both alarming and a dead end (their only button hits the member_a unique
 * constraint). `profileError` therefore *excludes* /pair rather than merely decorating it.
 */
function RootNavigator() {
  const { session, profile, profileError, loading } = useAuth();
  const paired = !!profile?.coupleId;
  const unknownPairing = !!session && !paired && profileError;

  // The screens below only exist once `paired` is true, so a widget tap that cold-starts the app
  // resolves its URL against a navigator that doesn't have the destination yet. Replay it here.
  useDeepLinkReplay(paired);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      <Stack.Protected guard={unknownPairing}>
        <Stack.Screen name="connection" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !paired && !profileError}>
        <Stack.Screen name="pair" />
      </Stack.Protected>
      <Stack.Protected guard={paired}>
        <Stack.Screen name="(tabs)" />
        {/* Feature flows opened from the home grid; real screens land in M3–M5. */}
        <Stack.Screen name="photo" options={{ presentation: 'modal' }} />
        <Stack.Screen name="draw" options={{ presentation: 'modal' }} />
        <Stack.Screen name="music" options={{ presentation: 'modal' }} />
        {/* Full-screen photo/drawing view — the widget's deep-link target (bundles:///media/<id>). */}
        <Stack.Screen name="media/[id]" options={{ presentation: 'fullScreenModal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    /*
     * `SafeAreaProvider` has to be the outermost wrapper, above the navigator.
     *
     * React Navigation installs its own compat provider around a navigator, so screens *inside*
     * the tabs got sensible insets and the omission went unnoticed. A `fullScreenModal` is
     * presented outside that subtree: `useSafeAreaInsets` returned 0 there, so the media viewer's
     * `edges={['top']}` did nothing and its close button rendered on top of the status-bar clock —
     * the "no way out" screen, still hard to hit even after the control itself was fixed.
     */
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
