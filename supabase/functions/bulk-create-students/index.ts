import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StudentRow {
  roll_number: string;
  name: string;
  class: string;
  section: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
}

interface CreateResult {
  roll_number: string;
  name: string;
  status: 'created' | 'skipped' | 'error';
  message?: string;
}

function rand(n = 12) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify caller is admin
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const rows: StudentRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No rows provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (rows.length > 500) {
      return new Response(JSON.stringify({ error: 'Max 500 rows per upload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: CreateResult[] = [];

    for (const r of rows) {
      const roll = (r.roll_number || '').toString().trim();
      const name = (r.name || '').toString().trim();
      const cls = (r.class || '').toString().trim();
      const sec = (r.section || '').toString().trim().toUpperCase();
      const parentEmailInput = (r.parent_email || '').toString().trim().toLowerCase();
      const parentPhone = (r.parent_phone || '').toString().trim();
      const parentName = (r.parent_name || '').toString().trim();

      if (!roll || !name || !cls || !sec) {
        results.push({ roll_number: roll, name, status: 'error', message: 'Missing required field' });
        continue;
      }

      const category = `${cls}-${sec}`;
      // Use a synthetic email per student so admin can later send invites
      const loginEmail = parentEmailInput && /\S+@\S+\.\S+/.test(parentEmailInput)
        ? `roll${roll}.${cls}${sec}@school.local`
        : `roll${roll}.${cls}${sec}@school.local`;

      try {
        // Skip if a profile with this roll already exists
        const { data: existing } = await admin
          .from('attendance_records')
          .select('id')
          .contains('device_info', { metadata: { roll_number: roll } })
          .limit(1);
        if (existing && existing.length > 0) {
          results.push({ roll_number: roll, name, status: 'skipped', message: 'Roll already exists' });
          continue;
        }

        const password = rand(14);
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: loginEmail,
          password,
          email_confirm: true,
          user_metadata: { display_name: name, roll_number: roll, category },
        });
        if (createErr || !created.user) {
          results.push({ roll_number: roll, name, status: 'error', message: createErr?.message || 'Auth create failed' });
          continue;
        }

        const uid = created.user.id;

        // Profile
        await admin.from('profiles').upsert({
          user_id: uid,
          display_name: name,
          parent_name: parentName || null,
          parent_phone: parentPhone || null,
          parent_email: parentEmailInput || null,
        }, { onConflict: 'user_id' });

        // Role
        await admin.from('user_roles').upsert({ user_id: uid, role: 'user' }, { onConflict: 'user_id,role' });

        // Registration placeholder row (face capture will replace this later)
        await admin.from('attendance_records').insert({
          user_id: uid,
          status: 'registered',
          category,
          timestamp: new Date().toISOString(),
          device_info: {
            type: 'csv-import',
            metadata: {
              name,
              roll_number: roll,
              employee_id: roll,
              parent_name: parentName,
              parent_phone: parentPhone,
              parent_email: parentEmailInput,
            },
          },
        });

        results.push({ roll_number: roll, name, status: 'created' });
      } catch (e: any) {
        results.push({ roll_number: roll, name, status: 'error', message: e.message || 'Unknown error' });
      }
    }

    const summary = {
      total: rows.length,
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    };

    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});