import { defineTool, type ToolContext } from '@lovable.dev/mcp-js';
import { createClient } from '@supabase/supabase-js';

const supabaseForUser = (ctx: ToolContext) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase MCP environment variables');

  return createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${ctx.getToken()}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export default defineTool({
  name: 'get_school_overview',
  title: 'Get school overview',
  description: 'Returns key attendance and registration totals from this app.',
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {},
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: 'text', text: 'Not authenticated.' }],
        isError: true,
      };
    }

    try {
      const supabase = supabaseForUser(ctx);

      const [registeredRes, presentRes, lateRes, gateSessionRes] = await Promise.all([
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('status', 'registered'),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('status', 'present'),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('status', 'late'),
        supabase
          .from('gate_sessions')
          .select('id, gate_name, started_at, ended_at')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const errors = [registeredRes.error, presentRes.error, lateRes.error, gateSessionRes.error].filter(Boolean);
      if (errors.length > 0) {
        return {
          content: [{ type: 'text', text: `Query failed: ${errors.map((e) => e?.message).join('; ')}` }],
          isError: true,
        };
      }

      const payload = {
        registered_students: registeredRes.count ?? 0,
        present_records: presentRes.count ?? 0,
        late_records: lateRes.count ?? 0,
        latest_gate_session: gateSessionRes.data
          ? {
              id: gateSessionRes.data.id,
              gate_name: gateSessionRes.data.gate_name,
              started_at: gateSessionRes.data.started_at,
              ended_at: gateSessionRes.data.ended_at,
            }
          : null,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: error?.message || 'Failed to fetch overview.' }],
        isError: true,
      };
    }
  },
});
