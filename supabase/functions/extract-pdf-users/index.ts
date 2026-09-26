import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
      return new Response(
        JSON.stringify({ error: "Unauthorized. Please log in as a teacher or admin.", users: [] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Invalid user session.", users: [] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Role check: Only admin, principal, or teacher can use whole-class PDF extraction
    const { data: roleRows } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const rolesList = (roleRows || []).map((r: any) => r.role);
    const isAdminOrPrincipal = rolesList.includes("admin") || rolesList.includes("principal") || (user.email && user.email.toLowerCase().includes("admin"));
    let isTeacher = rolesList.includes("teacher");

    // Also check class_teachers and teacher_permissions tables
    let teacherAllowedClasses: string[] = [];
    const { data: classRows } = await serviceClient
      .from("class_teachers")
      .select("category, class, section")
      .eq("teacher_id", user.id);

    const { data: permRows } = await serviceClient
      .from("teacher_permissions")
      .select("category, class, section")
      .or(`user_id.eq.${user.id},teacher_id.eq.${user.id}`);

    const allowedSet = new Set<string>();
    (classRows || []).forEach((r: any) => {
      if (r.category) allowedSet.add(r.category.trim().toUpperCase());
      if (r.class && r.section) allowedSet.add(`${r.class}-${r.section}`.trim().toUpperCase());
    });
    (permRows || []).forEach((r: any) => {
      if (r.category) allowedSet.add(r.category.trim().toUpperCase());
      if (r.class && r.section) allowedSet.add(`${r.class}-${r.section}`.trim().toUpperCase());
    });

    if (allowedSet.size > 0) {
      isTeacher = true;
      teacherAllowedClasses = Array.from(allowedSet);
      console.log(`Teacher ${user.id} authorized classes:`, teacherAllowedClasses);
    }

    if (!isAdminOrPrincipal && !isTeacher) {
      return new Response(
        JSON.stringify({ error: "Forbidden. Only teachers and administrators can import ID card PDFs.", users: [] }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { fileData, fileName, fileType, targetCategory } = await req.json();

    if (!fileData) {
      return new Response(
        JSON.stringify({ error: "No file data provided", users: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If teacher provided a targetCategory, verify they are assigned to it
    if (isTeacher && !isAdminOrPrincipal && targetCategory) {
      const normTarget = targetCategory.trim().toUpperCase();
      const hasAccess = teacherAllowedClasses.some(c => c === normTarget || c.replace(/\s+/g, '') === normTarget.replace(/\s+/g, ''));
      if (!hasAccess && teacherAllowedClasses.length > 0) {
        return new Response(
          JSON.stringify({ 
            error: `You are only authorized to import ID cards for your assigned class (${teacherAllowedClasses.join(', ')}).`, 
            users: [] 
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY secret not configured in Supabase. Please contact administrator.", users: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ID card file: ${fileName}, type: ${fileType}, data length: ${fileData?.length || 0}`);

    // Parse base64 and mime type
    let mimeType = fileType || "application/pdf";
    let base64Content = fileData;
    if (fileData.includes(",")) {
      const match = fileData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Content = match[2];
      } else {
        base64Content = fileData.split(",")[1];
      }
    }

    const isPdf = mimeType.toLowerCase().includes("pdf") || (fileName && fileName.toLowerCase().endsWith(".pdf"));
    if (isPdf) mimeType = "application/pdf";

    // System prompt specifically tailored to Kendriya Vidyalaya (PM SHRI KV) ID cards
    const systemPrompt = `You are an expert AI extractor specialized in extracting student identity cards from PM SHRI KENDRIYA VIDYALAYA (KV) documents and PDF files.

Each ID card in this format follows this exact layout:
- Top Banner Header: PM SHRI KENDRIYA VIDYALAYA NEW FRIENDS CENTRE VIGYAN VIHAR - SHIFT - 1 (or other KV branch)
- Student ID: 10-digit number printed on the upper left (e.g. "1000481387")
- Student Photo: Square portrait on the left side
- Student Name: Bold uppercase text printed directly under the student photo (e.g. "AISHA ALVI")
- QR Code: printed below the student name
- Title: "IDENTITY CARD" Session (e.g. "Session : 2026-27")
- Father Name: printed next to Father Name label (e.g. "SHAKEEL AHAMAD")
- Mother Name: printed next to Mother Name label (e.g. "SHAHANAJ")
- Date of Birth: printed as DD-MM-YYYY (e.g. "26-08-2014")
- Class: printed as class number and section letter (e.g. "6 A" or "7 B" or "11 A"). Always format as "6-A", "7-B", etc.
- Admn No: Admission number (e.g. "12453"). THIS IS THE PRIMARY STUDENT ADMISSION NUMBER / EMPLOYEE ID.
- PEN No: 11-digit Permanent Education Number (e.g. "20432877236")
- Blood Group: (e.g. "B-", "O+", "A+", "AB+")
- Father/Mother Phone: 10-digit mobile number (e.g. "9818115518"). THIS IS THE PRIMARY PARENT CONTACT PHONE.
- Address: Full address (e.g. "1755 Uttar Pradesh GHAZIABAD Ghaziabad 201005")
- Bottom Barcode: Barcode with number (e.g. "91429122012453")

INSTRUCTIONS:
1. The uploaded file is a PDF or document containing the ID cards of a whole class (1 or many cards per page across multiple pages).
2. Scan through ALL pages and extract EVERY SINGLE student ID card. Do not stop after the first card.
3. For each card found, output a JSON object with:
   - "name": Full student name in Title Case or Uppercase (e.g. "AISHA ALVI")
   - "employee_id": The Admission Number ("Admn No", e.g. "12453")
   - "student_id_kv": The 10-digit Student ID on top left (e.g. "1000481387")
   - "class": The numeric class (e.g. "6")
   - "section": The section letter in uppercase (e.g. "A")
   - "department": Combined "Class-Section" (e.g. "6-A")
   - "roll_number": Roll number if visible on card (or empty string)
   - "father_name": Father's full name (e.g. "SHAKEEL AHAMAD")
   - "mother_name": Mother's full name (e.g. "SHAHANAJ")
   - "parent_name": Father or Mother name for emergency contact
   - "parent_phone": 10-digit mobile number from Father/Mother Phone
   - "date_of_birth": DOB in YYYY-MM-DD or DD-MM-YYYY
   - "pen_number": PEN No
   - "blood_group": Blood group
   - "address": Full residential address
   - "barcode": Barcode number if visible
   - "has_photo": true if photo is visible on the card
   - "photo_bbox": approximate normalized bounding box of student portrait photo on the card {"x": 0.05, "y": 0.3, "width": 0.2, "height": 0.35}

Output format:
{
  "class_detected": "6-A",
  "total_extracted": N,
  "users": [ ... ]
}`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              text: `${systemPrompt}\n\nPlease analyze this entire document ("${fileName}") and extract all Kendriya Vidyalaya student ID cards across all pages into structured JSON.`
            },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Content
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1,
        max_output_tokens: 8192
      }
    };

    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let rawAiText = "";
    let lastErrorText = "";

    for (const model of candidateModels) {
      try {
        console.log(`Trying Gemini model ${model} with mimeType: ${mimeType}...`);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiPayload),
        });

        if (response.ok) {
          const geminiResult = await response.json();
          rawAiText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (rawAiText) {
            console.log(`Model ${model} responded successfully, length: ${rawAiText.length}`);
            break;
          }
        } else {
          lastErrorText = await response.text();
          console.warn(`Model ${model} failed (${response.status}): ${lastErrorText}`);
        }
      } catch (err: any) {
        lastErrorText = err.message || String(err);
        console.warn(`Model ${model} error:`, err);
      }
    }

    if (!rawAiText) {
      return new Response(
        JSON.stringify({ 
          error: `AI processing failed across all models. Details: ${lastErrorText.slice(0, 300)}`, 
          users: [] 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse extracted JSON
    let parsedData: any = { users: [] };
    try {
      let cleaned = rawAiText.trim();
      if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        const arrMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          parsedData = { users: JSON.parse(arrMatch[0]) };
        }
      }
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, rawAiText.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse structured ID card data from AI output", users: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let users = Array.isArray(parsedData?.users) ? parsedData.users : [];

    // Clean and normalize each student record
    users = users.map((u: any, index: number) => {
      // Normalise class & section (e.g. "6 A" or "6" + "A")
      let cls = String(u.class || "").replace(/[^0-9]/g, "");
      let sec = String(u.section || "").trim().toUpperCase();
      let dept = u.department || (cls && sec ? `${cls}-${sec}` : "");

      if (!cls && dept) {
        const m = dept.match(/^(\d+)\s*[-_\s]\s*([A-Da-d])$/);
        if (m) {
          cls = m[1];
          sec = m[2].toUpperCase();
          dept = `${cls}-${sec}`;
        }
      }

      // If targetCategory was specified (e.g. teacher portal), fallback to it
      if ((!cls || !sec) && targetCategory) {
        const tm = targetCategory.match(/^(\d+)\s*-\s*([A-Da-d])$/);
        if (tm) {
          cls = cls || tm[1];
          sec = sec || tm[2].toUpperCase();
          dept = `${cls}-${sec}`;
        }
      }

      return {
        name: u.name || `Student ${index + 1}`,
        employee_id: String(u.employee_id || u.admission_no || u.admn_no || `STU-${Date.now()}-${index + 1}`).trim(),
        student_id_kv: u.student_id_kv || "",
        class: cls,
        section: sec,
        department: dept || `${cls || "6"}-${sec || "A"}`,
        roll_number: String(u.roll_number || "").trim(),
        position: "Student",
        father_name: u.father_name || "",
        mother_name: u.mother_name || "",
        parent_name: u.parent_name || u.father_name || u.mother_name || "Parent / Guardian",
        parent_phone: String(u.parent_phone || u.phone || "").replace(/\D/g, "").slice(-10),
        parent_email: u.parent_email || "",
        student_email: u.email || u.student_email || "",
        phone: u.student_phone || "",
        blood_group: u.blood_group || "",
        date_of_birth: u.date_of_birth || "",
        pen_number: u.pen_number || "",
        address: u.address || "",
        barcode: u.barcode || "",
        has_photo: !!u.has_photo,
        photo_bbox: u.photo_bbox || null,
      };
    });

    // If teacher is constrained to specific classes, filter out students from other classes
    if (isTeacher && !isAdminOrPrincipal && teacherAllowedClasses.length > 0) {
      const originalCount = users.length;
      users = users.filter((u: any) => {
        const uCat = (u.department || `${u.class}-${u.section}`).toUpperCase();
        return teacherAllowedClasses.some(allowed => allowed === uCat || allowed.replace(/\s+/g, '') === uCat.replace(/\s+/g, ''));
      });
      console.log(`Filtered for teacher: ${users.length} of ${originalCount} matched assigned classes: ${teacherAllowedClasses.join(", ")}`);
    }

    console.log(`Successfully extracted ${users.length} students from ID cards`);

    return new Response(
      JSON.stringify({
        total_extracted: users.length,
        class_detected: parsedData.class_detected || users[0]?.department || targetCategory || "",
        users,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("extract-pdf-users exception:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg, users: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
