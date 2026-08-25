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
    const requestBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = requestBody?.action;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await svc
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "principal"])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "retry") {
      const messageId = requestBody?.messageId;
      if (!messageId || typeof messageId !== "string") {
        return new Response(JSON.stringify({ error: "messageId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: latestRow, error: latestError } = await svc
        .from("email_send_log")
        .select("message_id, template_name, recipient_email, status")
        .eq("message_id", messageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError || !latestRow) {
        return new Response(JSON.stringify({ error: "Email log entry not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!["failed", "dlq"].includes(latestRow.status)) {
        return new Response(JSON.stringify({ error: "Only failed messages can be retried" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authTemplateNames = new Set([
        "signup",
        "invite",
        "magiclink",
        "recovery",
        "email_change",
        "reauthentication",
      ]);

      if (authTemplateNames.has(latestRow.template_name)) {
        return new Response(
          JSON.stringify({
            error: "Auth emails are retried automatically by the queue and can’t be manually retried here",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const retryKey = `retry-${latestRow.message_id}-${Date.now()}`;
      const { data: retryResponse, error: retryError } = await svc.functions.invoke("send-transactional-email", {
        body: {
          templateName: latestRow.template_name,
          recipientEmail: latestRow.recipient_email,
          idempotencyKey: retryKey,
          templateData: {
            retriedBy: user.id,
            retriedAt: new Date().toISOString(),
          },
        },
      });

      if (retryError) {
        return new Response(JSON.stringify({ error: retryError.message || "Retry failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, result: retryResponse }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rows, error } = await svc
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;

    const dedup = new Map<string, any>();
    for (const row of rows || []) {
      const key = row.message_id || row.id;
      if (!dedup.has(key)) dedup.set(key, row);
    }

    return new Response(
      JSON.stringify({ logs: Array.from(dedup.values()) }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
