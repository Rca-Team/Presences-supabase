import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-supabase-client-platform, accept-profile, content-profile',
  'Access-Control-Max-Age': '86400',
};

const normalizeCategory = (v: string) => {
  const m = (v || '').trim().match(/^(\d+)-([A-D])$/i);
  return m ? `${m[1]}-${m[2].toUpperCase()}` : null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing auth' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id).in('role', ['admin', 'principal']).maybeSingle();
    if (!roleRow) return json({ error: 'Admin only' }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.name || '').trim() || email.split('@')[0];
    const classes: string[] = Array.isArray(body.classes) ? body.classes : [];

    if (!email || !password) return json({ error: 'email and password required' }, 400);
    if (password.length < 6) return json({ error: 'password too short' }, 400);

    const categories = classes.map(normalizeCategory).filter((v): v is string => !!v);

    // Create or find existing auth user
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: displayName, role: 'teacher' },
    });
    if (createErr) {
      // If already exists, look them up
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list?.users?.find((u: any) => (u.email || '').toLowerCase() === email);
      if (!existing) return json({ error: createErr.message }, 400);
      userId = existing.id;
      // Update password to match request
      await admin.auth.admin.updateUserById(userId, { password });
    } else {
      userId = created.user!.id;
    }

    // Profile (role + primary class scope)
    const primary = categories[0] ? categories[0].split('-') : null;
    await admin.from('profiles').upsert(
      {
        user_id: userId,
        display_name: displayName,
        full_name: displayName,
        email,
        role: 'teacher',
        ...(primary ? { class: primary[0], section: primary[1], category: categories[0] } : {}),
      },
      { onConflict: 'user_id' }
    );

    // Role = teacher (uses user_roles enum). Fallback to 'user' if enum lacks teacher.
    const roleInsert = await admin.from('user_roles').upsert(
      { user_id: userId, role: 'teacher' as any },
      { onConflict: 'user_id,role' }
    );
    if (roleInsert.error) {
      await admin.from('user_roles').upsert({ user_id: userId, role: 'user' as any }, { onConflict: 'user_id,role' });
    }

    // Class scoping — rewrite assignments from scratch so re-running is idempotent.
    const warnings: string[] = [];
    await admin.from('teacher_permissions').delete().eq('teacher_id', userId);
    await admin.from('class_teachers').delete().eq('teacher_id', userId);

    if (categories.length > 0) {
      const permRows = categories.map((cat) => {
        const [cls, sec] = cat.split('-');
        return {
          teacher_id: userId,
          user_id: userId,
          class: cls,
          section: sec,
          category: cat,
          can_take_attendance: true,
          can_edit_timetable: true,
          can_export_reports: true,
        };
      });
      const permIns = await admin.from('teacher_permissions').insert(permRows);
      if (permIns.error) warnings.push(`permissions: ${permIns.error.message}`);

      const classRows = categories.map((cat) => {
        const [cls, sec] = cat.split('-');
        return {
          class: cls,
          section: sec,
          category: cat,
          teacher_id: userId,
          teacher_name: displayName,
          teacher_email: email,
          role: 'class_teacher',
        };
      });
      const classIns = await admin.from('class_teachers').insert(classRows);
      if (classIns.error) warnings.push(`class_teachers: ${classIns.error.message}`);
    }

    return json({ ok: true, user_id: userId, email, categories, warnings });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
