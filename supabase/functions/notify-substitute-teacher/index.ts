import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const whatsappAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const whatsappPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

function escapeHtml(s: string) {
  const m: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(s).replace(/[&<>"']/g, c => m[c]);
}

async function sendWhatsApp(phone: string, message: string) {
  if (!whatsappAccessToken || !whatsappPhoneNumberId) return { success: false, error: "WhatsApp not configured" };
  let p = phone.replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("+")) p = p.substring(1);
  if (/^\d{10}$/.test(p)) p = "91" + p;
  try {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${whatsappAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: p, type: "text", text: { body: message } }),
    });
    const data = await resp.json();
    if (!resp.ok) return { success: false, error: data.error?.message || "WhatsApp failed" };
    return { success: true };
  } catch (e: any) { return { success: false, error: e.message }; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { substitutions } = await req.json(); // [{substitute_teacher_id, substitute_teacher_name, absent_teacher_name, period_number, category, date, subject_id}]

    if (!Array.isArray(substitutions) || substitutions.length === 0) {
      return new Response(JSON.stringify({ error: "No substitutions provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by substitute teacher
    const byTeacher = new Map<string, any[]>();
    for (const s of substitutions) {
      if (!byTeacher.has(s.substitute_teacher_id)) byTeacher.set(s.substitute_teacher_id, []);
      byTeacher.get(s.substitute_teacher_id)!.push(s);
    }

    // Fetch subject names
    const subjectIds = [...new Set(substitutions.map((s: any) => s.subject_id).filter(Boolean))];
    const subjectMap = new Map<string, string>();
    if (subjectIds.length) {
      const { data: subjects } = await supabase.from("subjects").select("id, name").in("id", subjectIds);
      (subjects || []).forEach(s => subjectMap.set(s.id, s.name));
    }

    // Fetch teacher contact info from registered attendance records
    const teacherIds = [...byTeacher.keys()];
    const { data: teacherRecs } = await supabase
      .from("attendance_records")
      .select("id, device_info")
      .in("id", teacherIds);

    const contactMap = new Map<string, { name: string; email?: string; phone?: string }>();
    (teacherRecs || []).forEach(r => {
      const meta = (r.device_info as any)?.metadata || {};
      contactMap.set(r.id, {
        name: meta.name || "Teacher",
        email: meta.email || meta.parent_email,
        phone: meta.phone || meta.parent_phone || meta.contact,
      });
    });

    const results: any[] = [];
    for (const [teacherId, subs] of byTeacher.entries()) {
      const contact = contactMap.get(teacherId);
      const name = contact?.name || subs[0].substitute_teacher_name || "Teacher";
      const periodLines = subs
        .sort((a, b) => a.period_number - b.period_number)
        .map(s => {
          const subj = s.subject_id ? subjectMap.get(s.subject_id) || "Substitution" : "Substitution";
          return `• Period ${s.period_number} — ${s.category} — ${subj} (covering for ${s.absent_teacher_name})`;
        });

      const dateStr = new Date(subs[0].date).toLocaleDateString("en-IN", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });

      const result: any = { teacherId, name, emailSent: false, whatsappSent: false, errors: [] };

      // EMAIL
      if (contact?.email && resendApiKey) {
        const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#f4f4f5;padding:20px;">
<table width="600" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%);color:#fff;padding:24px;text-align:center;">
<h1 style="margin:0;font-size:22px;">📚 Substitution Assigned</h1></td></tr>
<tr><td style="padding:24px;">
<p style="color:#374151;">Dear ${escapeHtml(name)},</p>
<p style="color:#4b5563;">You have been assigned the following substitution period(s) for <strong>${dateStr}</strong>:</p>
<div style="background:#f9fafb;border-left:4px solid #7c3aed;padding:14px 18px;margin:16px 0;border-radius:6px;color:#111827;white-space:pre-line;font-family:monospace;font-size:14px;">
${periodLines.map(escapeHtml).join("\n")}
</div>
<p style="color:#6b7280;font-size:13px;">Please report to the assigned class on time. Contact the academic office for any conflicts.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px;text-align:center;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
Automated message from Presence Smart School</td></tr>
</table></body></html>`;

        try {
          const resp = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
              "X-Connection-Api-Key": resendApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "School Substitution <noreply@presences.dev>",
              to: [contact.email],
              subject: `📚 Substitution Assigned — ${subs.length} period(s) on ${dateStr}`,
              html,
            }),
          });
          result.emailSent = resp.ok;
          if (!resp.ok) {
            const body = await resp.text();
            console.error(`Resend gateway failed [${resp.status}]: ${body}`);
            result.errors.push(`Email: ${resp.status} ${body}`);
          }
        } catch (e: any) {
          result.errors.push(`Email: ${e.message}`);
        }

      }

      // WHATSAPP
      if (contact?.phone) {
        const msg = `📚 *Substitution Assigned*\n\nHello ${name},\n\nYou are assigned ${subs.length} substitution period(s) on ${dateStr}:\n\n${periodLines.join("\n")}\n\n— Presence Smart School`;
        const wa = await sendWhatsApp(contact.phone, msg);
        result.whatsappSent = wa.success;
        if (!wa.success) result.errors.push(`WhatsApp: ${wa.error}`);

        await supabase.from("notification_log").insert({
          recipient_phone: contact.phone, recipient_id: null,
          message_content: msg, notification_type: "whatsapp", language: "en",
          status: wa.success ? "sent" : "failed", gateway_response: wa as any,
        });
      }

      // IN-APP (best-effort: only if substitute teacher has a user_id we know)
      results.push(result);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});