import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** A service-role client (bypasses RLS) for the Edge Functions to read tokens and write caches. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const jsonHeaders = { 'Content-Type': 'application/json' };
