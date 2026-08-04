import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth-context';

// Hold the native splash until the initial session + profile fetch settles, so the user never
// sees the app flash through /auth on its way to the right screen.
SplashScreen.preventAutoHideAsync();

/**
 * Declarative auth gate. `Stack.Protected` mounts only the screen whose guard is true, so the
 * three states map one-to-one: signed out -> /auth, signed in but unpaired -> /pair, paired ->
 * the (tabs) app. While `loading`, the native splash is still up, so the transient state is hidden.
 */
function RootNavigator() {
  const { session, profile, loading } = useAuth();
  const paired = !!profile?.coupleId;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !paired}>
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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
