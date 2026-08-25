import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'principal', 'teacher'])
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get all registered students
    const { data: allStudents } = await supabase
      .from('face_descriptors')
      .select('user_id, label');

    if (!allStudents?.length) {
      return new Response(JSON.stringify({ message: "No students registered" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const alerts: string[] = [];

    for (const student of allStudents) {
      // Check attendance for last 3 days
      const { data: records } = await supabase
        .from('attendance_records')
        .select('status, timestamp')
        .eq('user_id', student.user_id)
        .gte('timestamp', threeDaysAgo.toISOString())
        .order('timestamp', { ascending: false });

      // If no records or all absent for 3+ days
      const presentDays = records?.filter(r => r.status === 'present' || r.status === 'late').length || 0;
      
      if (presentDays === 0 && records && records.length > 0) {
        // Student has been absent - notify parent
        const { data: profile } = await supabase
          .from('profiles')
          .select('parent_phone, display_name')
          .eq('user_id', student.user_id)
          .maybeSingle();

        if (profile?.parent_phone) {
          const sms77Key = Deno.env.get("SMS77_RAPIDAPI_KEY");
          if (sms77Key) {
            const name = profile.display_name || student.label || 'Your child';
            const message = `Dear Parent, ${name} has been absent for 3+ consecutive days. Please contact the school. - Presence`;
            const cleanPhone = profile.parent_phone.replace(/[^\d]/g, "");
            const normalizedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
            
            if (/^\d{10,15}$/.test(normalizedPhone)) {
              await fetch('https://sms77io.p.rapidapi.com/sms', {
                method: 'POST',
                headers: {
                  'x-rapidapi-key': sms77Key,
                  'x-rapidapi-host': 'sms77io.p.rapidapi.com',
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Accept': 'application/json',
                },
                body: new URLSearchParams({ to: normalizedPhone, text: message }),
              });
              alerts.push(`Notified parent of ${name}`);
              
              await supabase.from('notification_log').insert({
                recipient_phone: normalizedPhone,
                recipient_id: student.user_id,
                message_content: message,
                notification_type: 'sms',
                status: 'sent',
                language: 'en'
              });
            }
          }
        }

        // Also notify admins
        const { data: adminRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        if (adminRoles) {
          for (const admin of adminRoles) {
            await supabase.from('notifications').insert({
              user_id: admin.user_id,
              title: `📢 Consecutive Absence: ${student.label || 'Student'}`,
              message: `${student.label || 'A student'} has been absent for 3+ consecutive days.`,
              type: 'warning'
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, alerts }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Absence tracker error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
