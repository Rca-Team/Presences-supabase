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
    const expectedWebhookSecret = Deno.env.get("INBOUND_EMAIL_WEBHOOK_SECRET") ?? "";
    const incomingWebhookSecret = req.headers.get("x-webhook-secret") ?? "";
    const authHeader = req.headers.get("Authorization");

    if (expectedWebhookSecret) {
      if (incomingWebhookSecret !== expectedWebhookSecret) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    } else if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!expectedWebhookSecret) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader! } },
      });
      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "principal"])
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const body = await req.json();

    // Support multiple webhook formats (Resend, generic)
    const emailData = {
      from_email: body.from_email || body.from || body.sender || body.envelope?.from || 'unknown@unknown.com',
      from_name: body.from_name || body.fromName || null,
      to_email: body.to_email || body.to || body.recipient || 'admission@presences.dev',
      subject: body.subject || '(No Subject)',
      body_text: body.body_text || body.text || body.plain || body.body || null,
      body_html: body.body_html || body.html || null,
      attachments: body.attachments || [],
      received_at: body.received_at || body.timestamp || new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('received_emails')
      .insert(emailData)
      .select()
      .single();

    if (error) {
      console.error('Error storing email:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log('Email stored successfully:', data.id);
    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Receive email error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
