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

    const { studentId, studentName, entryTime, gateName, isLate, confidence } = await req.json();

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

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'principal', 'teacher'])
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Record attendance
    const status = isLate ? 'late' : 'present';
    await supabase.from('attendance_records').insert({
      user_id: studentId,
      status,
      confidence_score: confidence,
      device_info: { gate: gateName, entry_time: entryTime }
    });

    // Check if parent notification needed
    const { data: profile } = await supabase
      .from('profiles')
      .select('parent_phone, parent_email, parent_name, display_name')
      .eq('user_id', studentId)
      .maybeSingle();

    const hasContact = !!profile?.parent_phone || !!profile?.parent_email;
    if (hasContact) {
      const time = new Date(entryTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const name = studentName || profile?.display_name || 'Your child';
      const message = isLate
        ? `Dear Parent, ${name} arrived late at school at ${time} via ${gateName}. - Presence`
        : `Dear Parent, ${name} has arrived at school at ${time}. - Presence`;

      const { error: notifyError } = await supabase.functions.invoke('send-notification', {
        body: {
          recipient: {
            email: profile?.parent_email || null,
            phone: profile?.parent_phone || null,
            name: profile?.parent_name || `Parent of ${name}`,
          },
          message: {
            subject: isLate ? `Late Arrival Notification - ${name}` : `Attendance Confirmation - ${name}`,
            body: message,
          },
          student: {
            id: studentId,
            name,
            status,
          },
          targetUserId: studentId,
        },
      });

      if (notifyError) {
        console.error('send-notification failed from gate-entry-processor', notifyError);
      }
    }

    return new Response(JSON.stringify({ success: true, status }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Gate entry processor error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
