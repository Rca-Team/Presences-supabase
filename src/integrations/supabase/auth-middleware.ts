import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export interface SupabaseAuthContext {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
  claims: Record<string, unknown>;
}

/**
 * Lightweight auth helper for non-TanStack projects.
 * Accepts a Request and returns authenticated user context.
 */
export async function requireSupabaseAuth(request: Request): Promise<SupabaseAuthContext> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(', ')}`);
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Response('Unauthorized', { status: 401 });
  }

  return {
    supabase,
    userId: data.claims.sub,
    claims: data.claims as Record<string, unknown>,
  };
}
