import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEMPLATE_NAME = "attendance_notification";
const TEMPLATE_LANG = "en";

function formatPhone(phoneNumber: string): string | null {
  let p = phoneNumber.replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("+")) p = p.substring(1);
  if (/^\d{10}$/.test(p)) p = "91" + p;
  if (!/^\d{10,15}$/.test(p)) return null;
  return p;
}

function statusLabel(status: string): string {
  switch (status) {
    case "present": return "Present ✅";
    case "late": return "Late ⏰";
    case "absent": return "Absent ❌";
    default: return status || "Updated";
  }
}

function statusNote(status: string): string {
  switch (status) {
    case "present": return "Have a great day at school!";
    case "late": return "Please ensure timely arrival going forward.";
    case "absent": return "If this is unexpected, please contact the school.";
    default: return "Please check the parent portal for details.";
  }
}

async function sendWhatsAppTemplate(
  phone: string,
  vars: { parent: string; student: string; status: string; date: string; time: string; className: string; section: string; note: string; },
  textBody?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !phoneNumberId) {
    return { success: false, error: "WhatsApp API not configured" };
  }

  const url = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    // If an explicit text body is provided, send plain text directly (great for hello_world tests)
    if (textBody) {
      const textRes = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: textBody },
        }),
      });
      const textData = await textRes.json().catch(() => ({} as any));
      if (textRes.ok) return { success: true, messageId: textData?.messages?.[0]?.id };
      return { success: false, error: textData?.error?.message || "WhatsApp text send failed" };
    }

    const templatePayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANG },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: vars.parent },
              { type: "text", text: vars.student },
              { type: "text", text: vars.status },
              { type: "text", text: vars.date },
              { type: "text", text: vars.time },
              { type: "text", text: vars.className },
              { type: "text", text: vars.section },
              { type: "text", text: vars.note },
            ],
          },
        ],
      },
    };

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(templatePayload) });
    const data = await res.json().catch(() => ({} as any));
    if (res.ok) return { success: true, messageId: data?.messages?.[0]?.id };

    // Fallback: try plain text (works only inside 24h session window)
    const fallbackBody = `Hello ${vars.parent},\n\n${vars.student} has been marked ${vars.status} today.\n📅 ${vars.date} ⏰ ${vars.time}\n🏫 Class ${vars.className}-${vars.section}\n\n${vars.note}\n\n— Presence`;
    const textRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: fallbackBody },
      }),
    });
    const textData = await textRes.json().catch(() => ({} as any));
    if (textRes.ok) return { success: true, messageId: textData?.messages?.[0]?.id };

    return { success: false, error: data?.error?.message || textData?.error?.message || "WhatsApp send failed" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { phoneNumber, studentId, studentName, status, textBody } = body;

    // Only staff can send template-based attendance notifications.
    // Simple text tests (e.g. hello_world from profile) are allowed for any authenticated user.
    if (!textBody) {
      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id)
        .in("role", ["admin", "principal", "teacher"]).maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    let { parentName, className, section } = body;

    let recipientPhone = phoneNumber;
    if (!recipientPhone && studentId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("parent_phone, phone, metadata, full_name, display_name")
        .eq("user_id", studentId).maybeSingle();
      const metadata = (profile as any)?.metadata || {};
      recipientPhone = profile?.parent_phone || metadata?.parent_phone || profile?.phone || null;
      parentName = parentName || metadata?.parent_name || "Parent";
      className = className || metadata?.class || "-";
      section = section || metadata?.section || "-";
    }

    if (!recipientPhone) {
      return new Response(JSON.stringify({ success: false, error: "No phone number found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = formatPhone(recipientPhone);
    if (!phone) {
      return new Response(JSON.stringify({ success: false, error: "Invalid phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const vars = {
      parent: parentName || "Parent",
      student: studentName || "Student",
      status: statusLabel(status || "present"),
      date: now.toLocaleDateString("en-IN"),
      time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
      className: String(className || "-"),
      section: String(section || "-"),
      note: statusNote(status || "present"),
    };

    const result = await sendWhatsAppTemplate(phone, vars, textBody);

    await supabase.from("notification_log").insert({
      recipient_phone: phone,
      recipient_id: studentId || null,
      message_content: textBody || `[template:${TEMPLATE_NAME}] ${vars.student} — ${vars.status}`,
      notification_type: "whatsapp",
      language: "en",
      status: result.success ? "sent" : "failed",
      gateway_response: result as any,
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
