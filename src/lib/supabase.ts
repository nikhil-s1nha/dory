import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';

/**
 * The app's single Supabase client.
 *
 * Config comes from EXPO_PUBLIC_* env (see .env.example) — Expo inlines these at build time.
 * The publishable key is public by design; RLS (supabase/migrations) is what guards the data.
 * We fail loudly at startup if config is missing rather than making broken requests later.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Copy .env.example to .env (EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in AsyncStorage so users stay signed in across launches.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection on native — that's a web-OAuth-redirect concern.
    detectSessionInUrl: false,
  },
});

// Supabase can only refresh tokens while the app is foregrounded. Drive its auto-refresh
// loop off AppState so it runs when active and pauses in the background (per Supabase's
// React Native guidance), avoiding wasted refresh attempts and spurious errors.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
