import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: accept admin bearer token or service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing backend environment configuration for absence notifications');
    }

    const expectedSecret = Deno.env.get('CRON_SECRET') ?? '';
    const cronSecret = req.headers.get('x-cron-secret') ?? '';
    const authHeader = req.headers.get('Authorization');

    if (!expectedSecret && !authHeader) {
      return new Response(JSON.stringify({ error: 'Server is not securely configured for this endpoint.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cronAuthorized = !!expectedSecret && cronSecret === expectedSecret;

    if (!cronAuthorized) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authErr } = await authClient.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const svc = createClient(supabaseUrl, serviceKey);
      const { data: role } = await svc
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'principal'])
        .maybeSingle();

      if (!role) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const today = new Date().toISOString().split('T')[0];
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Get cutoff time
    const { data: cutoffData } = await supabase.from('attendance_settings').select('value').eq('key', 'cutoff_time').single();
    const cutoffTime = cutoffData?.value || '09:00';

    // Pilot mode: restrict to a single class+section if enabled
    const { data: pilotRows } = await supabase
      .from('attendance_settings')
      .select('key,value')
      .in('key', ['pilot_enabled', 'pilot_class', 'pilot_section']);
    const pilotMap = new Map<string, string>((pilotRows || []).map((r: any) => [r.key, r.value ?? '']));
    const pilotEnabled = (pilotMap.get('pilot_enabled') || 'false') === 'true';
    const pilotClass = pilotMap.get('pilot_class') || '';
    const pilotSection = pilotMap.get('pilot_section') || '';
    const [cH, cM] = cutoffTime.split(':').map(Number);
    const cutoffDisplay = `${(cH % 12) || 12}:${String(cM).padStart(2, '0')} ${cH >= 12 ? 'PM' : 'AM'}`;
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setHours(cH, cM, 0, 0);

    if (now < cutoffDate) {
      return new Response(JSON.stringify({ success: true, message: `Cutoff not reached yet (${cutoffDisplay}).`, emailsSent: 0, absentCount: 0, inAppSent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all students with parent emails (filtered by pilot class+section when enabled)
    let profilesQuery = supabase
      .from('profiles')
      .select('user_id, display_name, parent_email, parent_name, class, section')
      .not('parent_email', 'is', null)
      .not('user_id', 'is', null);
    if (pilotEnabled && pilotClass && pilotSection) {
      profilesQuery = profilesQuery.eq('class', pilotClass).eq('section', pilotSection);
      console.log(`[pilot] Restricting absence notifications to class=${pilotClass} section=${pilotSection}`);
    }
    const { data: profiles, error: profilesError } = await profilesQuery;

    if (profilesError) {
      throw new Error(`Failed to load parent profiles: ${profilesError.message}`);
    }

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No parent profiles with email found.', emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userIds = profiles.map((p: any) => p.user_id).filter(Boolean);

    // Get today's attendance for those students
    const { data: todayAttendance, error: attendanceError } = await supabase
      .from('attendance_records')
      .select('user_id, status')
      .in('user_id', userIds)
      .in('status', ['present', 'late'])
      .gte('timestamp', `${today}T00:00:00`)
      .lte('timestamp', `${today}T23:59:59`);

    if (attendanceError) {
      throw new Error(`Failed to load attendance: ${attendanceError.message}`);
    }

    const presentUserIds = new Set((todayAttendance || []).map(a => a.user_id));

    // Find absent users (no present/late record today)
    const absentProfiles = (profiles || []).filter((p: any) => !presentUserIds.has(p.user_id));

    if (absentProfiles.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No absent users found. Everyone is present!', emailsSent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let emailsSent = 0;
    let inAppSent = 0;
    const errors: string[] = [];

    // Send absent emails to parents and add in-app notice to each absent student
    for (const profile of absentProfiles) {
      const studentName = profile.display_name || 'Student';
      const parentEmail = profile.parent_email;

      if (profile.user_id) {
        try {
          await supabase.from('notifications').insert({
            user_id: profile.user_id,
            title: '❌ Marked Absent',
            message: `You were marked absent on ${dateStr} after cutoff time (${cutoffDisplay}).`,
            type: 'attendance',
          });
          inAppSent++;
        } catch (e: any) {
          errors.push(`In-app notification for ${studentName}: ${e.message}`);
        }
      }

      if (!parentEmail) continue;

      try {
        const idempotencyKey = `absent-cutoff-${profile.user_id}-${today}`;
        const { data, error } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'attendance-absent-cutoff-parent',
            recipientEmail: parentEmail,
            idempotencyKey,
            templateData: {
              parentName: profile.parent_name || 'Parent/Guardian',
              studentName,
              dateLabel: dateStr,
              cutoffLabel: cutoffDisplay,
            },
          },
        });

        if (error || !data?.success) {
          errors.push(`Parent email for ${studentName}: ${error?.message || 'failed'}`);
        } else {
          emailsSent++;
        }
      } catch (e: any) {
        errors.push(`Parent email for ${studentName}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Absence cutoff notifications sent. ${emailsSent} email(s), ${inAppSent} in-app notification(s).`,
      absentCount: absentProfiles.length,
      emailsSent,
      inAppSent,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Absence cutoff notify error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process absence notifications', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
