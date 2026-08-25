import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Supabase client — credentials come from environment variables.
 *
 * Required env vars (set in .env.local or hosting provider):
 *   VITE_SUPABASE_URL              — Project URL (e.g. https://xxx.supabase.co)
 *   VITE_SUPABASE_PUBLISHABLE_KEY  — Anon (public) key
 *
 * Project ref: cvdcbcsonlianbfeessy
 *
 * The anon key is safe to expose client-side; Row Level Security (RLS)
 * on the Supabase side controls data access.
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://cvdcbcsonlianbfeessy.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZGNiY3NvbmxpYW5iZmVlc3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDQ5MDcsImV4cCI6MjEwMzIyMDkwN30.fzJfZKKTw2Y3oFgk6fxVkfhdnIXNzXDeNa0CP84RxDg';

if (
  !import.meta.env.VITE_SUPABASE_URL ||
  !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
) {
  console.info(
    '[Supabase] Using built-in credentials. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in env to override.'
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
