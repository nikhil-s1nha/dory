/**
 * Session + pairing state for the whole app. Screens read this to decide what to show; the
 * root layout reads it to gate navigation (unauthenticated -> /auth, unpaired -> /pair).
 *
 * Two pieces of state:
 *  - `session`: the Supabase auth session, kept in sync via onAuthStateChange.
 *  - `profile`: the caller's row from public.profiles, whose `coupleId` tells us paired-or-not.
 *
 * `refreshProfile` is exposed so the pairing screen can re-pull immediately after redeeming,
 * flipping the app into the paired state without waiting for a poll.
 */

import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Profile } from '@/domain/pairing/types';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** True until the initial session + profile fetch settles, so we don't flash the wrong screen. */
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, couple_id')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, displayName: data.display_name, coupleId: data.couple_id };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useMemo(
    () => async () => {
      const uid = session?.user.id;
      setProfile(uid ? await fetchProfile(uid) : null);
    },
    [session?.user.id],
  );

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
    const uid = session?.user.id;
    const run = async () => {
      const p = uid ? await fetchProfile(uid) : null;
      if (!active) return;
      setProfile(p);
      setLoading(false);
    };
    run();
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  const value = useMemo<AuthState>(
    () => ({ session, profile, loading, refreshProfile }),
    [session, profile, loading, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
