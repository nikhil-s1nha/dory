/**
 * Session + pairing state for the whole app. Screens read this to decide what to show; the
 * root layout reads it to gate navigation (unauthenticated -> /auth, unpaired -> /pair).
 *
 * Three pieces of state:
 *  - `session`: the Supabase auth session, kept in sync via onAuthStateChange.
 *  - `profile`: the caller's row from public.profiles, whose `coupleId` tells us paired-or-not.
 *  - `profileError`: true when the last read of that row *failed*, which is not the same as the
 *    row saying "unpaired". The root layout must not route on a guess — see the comment there.
 *
 * `refreshProfile` is exposed so the pairing screen can re-pull immediately after redeeming,
 * flipping the app into the paired state without waiting for a poll. The provider additionally
 * re-pulls on every foreground: before that, the profile was only read when the user id changed,
 * so a single failed request at launch stuck the app in the wrong state until the next cold start.
 */

import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { fetchProfile, sameProfile, type ProfileFetch } from '@/domain/pairing/repository';
import type { Profile } from '@/domain/pairing/types';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /**
   * The last profile read failed and we still don't know this user's pairing state. Consumers
   * should offer a retry rather than treat the user as unpaired.
   */
  profileError: boolean;
  /** True until the initial session + profile fetch settles, so we don't flash the wrong screen. */
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [loading, setLoading] = useState(true);

  const uid = session?.user.id;

  /**
   * The single place a profile read turns into state, so the initial load, the foreground retry
   * and an explicit refresh all handle failure identically.
   *
   * The important line is the early return: on error we keep whatever we last knew. Overwriting
   * it with `null` is what dropped an already-paired couple onto the pairing screen.
   */
  const applyFetch = useCallback((result: ProfileFetch) => {
    if (result.status === 'error') {
      setProfileError(true);
      return;
    }
    setProfileError(false);
    // Identity-stable when nothing changed: this runs on every foreground, and a fresh object
    // each time would re-render every consumer of the context for no reason.
    setProfile((prev) => (sameProfile(prev, result.profile) ? prev : result.profile));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!uid) {
      setProfile(null);
      setProfileError(false);
      return;
    }
    applyFetch(await fetchProfile(supabase, uid));
  }, [uid, applyFetch]);

  // Load the current session once, then keep it in sync with auth events.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Whenever the signed-in user changes, (re)load their profile and settle loading. All state
  // updates happen inside the async run so nothing is set synchronously during the effect.
  useEffect(() => {
    let active = true;
    const run = async () => {
      const result: ProfileFetch = uid
        ? await fetchProfile(supabase, uid)
        : { status: 'ok', profile: null };
      if (!active) return;
      applyFetch(result);
      setLoading(false);
    };
    void run();

    // The retry path. Foregrounding is the same trigger `useWidgetSync` uses, and it is when
    // connectivity has usually come back — so a launch that failed offline self-heals on the next
    // app open instead of stranding the user on the wrong screen.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [uid, applyFetch]);

  const value = useMemo<AuthState>(
    () => ({ session, profile, profileError, loading, refreshProfile }),
    [session, profile, profileError, loading, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
