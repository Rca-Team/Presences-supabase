import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/;

function cleanEmail(v?: string | null): string | null {
  if (!v) return null;
  let c = String(v).trim();
  const angle = c.match(/<([^>]+)>/);
  if (angle) c = angle[1].trim();
  c = c.replace(/^mailto:/i, '').toLowerCase();
  return EMAIL_RE.test(c) ? c : null;
}

function cleanPhone(v?: string | null): string | null {
  if (!v) return null;
  const digits = String(v).replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `+91${digits}` : `+${digits.replace(/^0+/, '')}`;
}

function norm(v?: string | null) {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

interface Row {
  name?: string;
  email?: string;
  phone?: string;
  parent_name?: string;
  roll_number?: string;
  admission_number?: string;
  class?: string;
  section?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      throw new Error('Backend configuration is unavailable');
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'principal'])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'No rows provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (rows.length > 2000) {
      return new Response(JSON.stringify({ error: 'Max 2000 rows per upload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, user_id, display_name, full_name, roll_number, admission_number, class, section');
    if (profilesError) throw profilesError;

    const list = profiles || [];
    const byName = new Map<string, any[]>();
    const byRoll = new Map<string, any>();
    const byAdmission = new Map<string, any>();
    for (const p of list) {
      for (const n of [p.display_name, p.full_name]) {
        const key = norm(n);
        if (!key) continue;
        byName.set(key, [...(byName.get(key) || []), p]);
      }
      if (p.roll_number) byRoll.set(norm(p.roll_number), p);
      if (p.admission_number) byAdmission.set(norm(p.admission_number), p);
    }

    const results: any[] = [];
    let updated = 0, notFound = 0, invalid = 0;

    for (const row of rows) {
      const studentName = String(row.name ?? '').trim();
      const email = cleanEmail(row.email);
      const phone = cleanPhone(row.phone);
      const parentName = String(row.parent_name ?? '').trim() || null;

      if (!studentName && !row.roll_number && !row.admission_number) {
        invalid++;
        results.push({ name: studentName, status: 'invalid', message: 'Missing student identifier' });
        continue;
      }
      if (!email && !phone) {
        invalid++;
        results.push({ name: studentName, status: 'invalid', message: 'No valid email or phone' });
        continue;
      }

      let match: any = null;
      if (row.admission_number) match = byAdmission.get(norm(row.admission_number)) || null;
      if (!match && row.roll_number) match = byRoll.get(norm(row.roll_number)) || null;
      if (!match && studentName) {
        let candidates = byName.get(norm(studentName)) || [];
        if (candidates.length > 1 && row.class) {
          const narrowed = candidates.filter(
            (c) => norm(c.class) === norm(row.class) && (!row.section || norm(c.section) === norm(row.section)),
          );
          if (narrowed.length) candidates = narrowed;
        }
        match = candidates[0] || null;
      }

      if (!match) {
        notFound++;
        results.push({ name: studentName, status: 'not_found', message: 'No matching student profile' });
        continue;
      }

      const patch: Record<string, any> = {};
      if (email) patch.parent_email = email;
      if (phone) patch.parent_phone = phone;
      if (parentName) {
        patch.parent_name = parentName;
        patch.father_name = patch.father_name || parentName;
      }

      const { error } = await admin.from('profiles').update(patch).eq('id', match.id);
      if (error) {
        results.push({ name: studentName, status: 'error', message: error.message });
        continue;
      }
      updated++;
      results.push({ name: match.display_name || studentName, status: 'updated', message: email || phone || '' });
    }

    return new Response(
      JSON.stringify({ summary: { total: rows.length, updated, notFound, invalid }, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Import failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
