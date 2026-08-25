import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id)
      .in("role", ["admin", "principal", "teacher"]).maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fileData, className, section, knownSubjects, knownTeachers } = await req.json();
    if (!fileData) {
      return new Response(JSON.stringify({ error: "No file data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You extract school class timetables from photos of printed/handwritten timetable grids.

Return ONLY valid JSON matching this schema:
{
  "class_label": string,
  "class_teacher": string | null,
  "co_class_teacher": string | null,
  "periods": [ { "period_number": number, "label": string | null, "start_time": "HH:MM" | null, "end_time": "HH:MM" | null, "is_break": boolean } ],
  "slots": [ { "day": "Monday"|"Tuesday"|"Wednesday"|"Thursday"|"Friday"|"Saturday", "period_number": number, "subject": string, "subject_short": string | null, "teacher": string | null, "room": string | null, "notes": string | null } ]
}

Rules:
- Number periods left-to-right in the grid. Include breaks/recess as periods with is_break=true (subject "RECESS").
- Roman numerals I,II,III,IV,V,VI,VII,VIII map to 1..8.
- Preserve short subject codes exactly as written (Eng, Maths, SC, SST, AE, VE, Hindi, Yoga, Games, Comp, SKT, Lib, CLA, etc.) as subject_short; expand subject to a readable name.
- If a cell shows two subjects like "Lib/Hin", set subject="Library / Hindi" and subject_short="Lib/Hin".
- Only include slots that have a subject. Skip empty cells.
- Times may be missing — set null. Do not invent.
- Do NOT include markdown fences.`;

    const userText = `Extract the timetable for class ${className || "?"}-${section || "?"}.
Known subject codes for this class (prefer these short codes when matching): ${(knownSubjects || []).map((s: any) => s.short_name || s.name).join(", ") || "(none)"}.
Known teachers on staff: ${(knownTeachers || []).map((t: any) => t.name).join(", ") || "(none)"}.`;

    const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: fileData } },
          ]},
        ],
        max_tokens: 4096,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error", aiRes.status, errText);
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: `AI failed (${aiRes.status})` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiRes.json();
    let content: string = aiJson.choices?.[0]?.message?.content || "";
    content = content.trim().replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    const match = content.match(/\{[\s\S]*\}/);
    let parsed: any = { periods: [], slots: [] };
    try { parsed = match ? JSON.parse(match[0]) : parsed; } catch (e) { console.error("parse", e); }

    parsed.periods = Array.isArray(parsed.periods) ? parsed.periods : [];
    parsed.slots = Array.isArray(parsed.slots) ? parsed.slots : [];

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown";
    console.error("extract-timetable-photo:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
