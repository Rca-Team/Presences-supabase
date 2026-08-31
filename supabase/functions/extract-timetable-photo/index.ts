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

    const { fileData, className, section, knownSubjects, knownTeachers, apiKey } = await req.json();
    if (!fileData) {
      return new Response(JSON.stringify({ error: "No file data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY =
      apiKey ||
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("VITE_GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY_REQUIRED",
          message: "Gemini API key is not configured. Please supply a key or configure backend secrets.",
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const systemPrompt = `You are an expert AI OCR assistant specialized in extracting school class timetables from photos of printed or handwritten timetable grids (e.g. Kendriya Vidyalaya / CBSE school formats).

Return ONLY valid JSON matching this schema:
{
  "class_label": string,
  "class_teacher": string | null,
  "co_class_teacher": string | null,
  "periods": [
    {
      "period_number": number,
      "label": string | null,
      "start_time": "HH:MM" | null,
      "end_time": "HH:MM" | null,
      "is_break": boolean
    }
  ],
  "slots": [
    {
      "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday",
      "period_number": number,
      "subject": string,
      "subject_short": string | null,
      "teacher": string | null,
      "room": string | null,
      "notes": string | null
    }
  ]
}

Extraction Rules:
- Number periods left-to-right from Roman numerals I, II, III, IV, V, VI, VII, VIII into 1, 2, 3, 4, 5, 6, 7, 8.
- Default School Schedule: 07:20 to 12:15.
  * Period 1: 07:20 - 07:55
  * Period 2: 07:55 - 08:30
  * Period 3: 08:30 - 09:05
  * Period 4: 09:05 - 09:40
  * RECESS / LUNCH BREAK: 09:40 - 10:00 (is_break=true)
  * Period 5: 10:00 - 10:35
  * Period 6: 10:35 - 11:10
  * Period 7: 11:10 - 11:45
  * Period 8: 11:45 - 12:15
- If there is a RECESS / BREAK column between periods (e.g. between period IV and V), mark period with is_break=true.
- Preserve short subject codes exactly (e.g. Eng, Maths, SC, SST, AE, VE, Hindi, Yoga, Games, Comp, SKT, Lib, CLA).
- Expand abbreviations to full names where obvious:
  * "Eng" -> "English"
  * "Maths" -> "Mathematics"
  * "SC" -> "Science"
  * "SST" / "S.S.T" -> "Social Studies"
  * "AE" -> "Art Education"
  * "VE" -> "Value Education"
  * "SKT" -> "Sanskrit"
  * "Comp" -> "Computer Science"
  * "Lib" -> "Library"
  * "CLA" -> "Co-Curricular / Activity"
- Extract days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday.
- Extract Class Teacher and Co-Class Teacher names if written at top (e.g. "Name of Class Teacher", "Name of Co-Class Teacher").
- Do NOT include markdown fences, return raw JSON string.`;

    const userText = `Extract the timetable for class ${className || "?"} - section ${section || "?"}.
Known subject codes for this class: ${(knownSubjects || []).map((s: any) => s.short_name || s.name).join(", ") || "(none)"}.
Known teachers on staff: ${(knownTeachers || []).map((t: any) => t.name).join(", ") || "(none)"}.`;

    // Extract base64 and mime
    let mimeType = "image/jpeg";
    let base64Data = fileData;
    const dataUriMatch = fileData.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (dataUriMatch) {
      mimeType = dataUriMatch[1];
      base64Data = dataUriMatch[2];
    }

    // Try Gemini 2.0 Flash first, fallback to Gemini 1.5 Flash
    const models = ["gemini-2.0-flash", "gemini-1.5-flash"];
    let parsed: any = null;
    let lastError: string | null = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${systemPrompt}\n\n${userText}` },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: "application/json",
              temperature: 0.1,
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`Gemini model ${model} failed (${response.status}):`, errText);
          lastError = `Gemini ${model} failed: ${errText}`;
          continue;
        }

        const data = await response.json();
        const rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanContent = rawContent.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
          break;
        }
      } catch (err: any) {
        console.warn(`Exception calling model ${model}:`, err);
        lastError = err?.message || "Model call failed";
      }
    }

    if (!parsed) {
      throw new Error(lastError || "Could not parse timetable JSON from image.");
    }

    parsed.periods = Array.isArray(parsed.periods) ? parsed.periods : [];
    parsed.slots = Array.isArray(parsed.slots) ? parsed.slots : [];

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("extract-timetable-photo exception:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
