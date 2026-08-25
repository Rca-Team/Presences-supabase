import { supabase as typedSupabase } from './client';

// Temporary compatibility wrapper while the Cloud schema is re-synced.
// Keeps runtime behavior identical, but avoids blocking the app on stale DB typings.
export const supabase = typedSupabase as any;
