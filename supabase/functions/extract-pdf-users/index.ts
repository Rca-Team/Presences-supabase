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
        JSON.stringify({ error: "Unauthorized", users: [] }),
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
        JSON.stringify({ error: "Unauthorized", users: [] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleRow } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "principal", "teacher"])
      .maybeSingle();

    if (!roleRow) {
      return new Response(
        JSON.stringify({ error: "Forbidden", users: [] }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { fileData, fileName, fileType } = await req.json();

    if (!fileData) {
      console.error("No file data provided");
      return new Response(
        JSON.stringify({ error: "No file data provided", users: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured. Please contact support.", users: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing file: ${fileName}, type: ${fileType}, data length: ${fileData?.length || 0}`);

    // Prepare the prompt for extraction
    const systemPrompt = `You are an AI assistant specialized in extracting student/employee information from ID cards and documents.

For each person, extract every available field. Use empty string when a field is missing.
Required fields per person:
- name: Full name
- employee_id (or student_id / admission no): ID number on card (generate STU-### if absent)
- roll_number: Roll number / class roll
- department: "Class-Section" combined like "5-A" or "10-B" if you see class + section, otherwise the class or department text
- position: Role / grade (default "Student")
- email: Student email if shown
- phone: Student personal phone if shown
- parent_name: Parent / guardian / father / mother name
- parent_phone: Parent / guardian / emergency contact phone
- parent_email: Parent email if present
- blood_group: e.g. O+, AB-
- address: Full residential address (single string)
- transport_mode: e.g. Bus / Walk / Private if shown
- has_photo: boolean
- photo_description: brief description if visible
- photo_bbox: normalized bounding box of student face photo on card as {"x":0-1,"y":0-1,"width":0-1,"height":0-1} when visible

Return ONLY valid JSON, no markdown:
{ "users": [ { ...fields above } ], "total_extracted": N, "document_type": "id_card|form|table|other", "contains_images": true }
If nothing is extractable: {"users": [], "total_extracted": 0, "reason": "..."}`;

    // Call Gemini API Gateway
    console.log("Calling Gemini API Gateway...");
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: [
              {
                type: "text",
                text: `Please analyze this document and extract all user/student information. The file is named "${fileName}" (type: ${fileType}). Look carefully for names, IDs, departments, and any other relevant details.`
              },
              {
                type: "image_url",
                image_url: {
                  url: fileData
                }
              }
            ]
          }
        ],
        max_tokens: 8192,
      }),
    });

    console.log(`AI Gateway response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again.", users: [] }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue.", users: [] }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI processing failed (${response.status})`, users: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";

    console.log("AI Response received, length:", content.length);
    console.log("AI Response preview:", content.substring(0, 500));

    // Parse the JSON response
    let extractedData;
    try {
      // Remove any markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();
      
      // Try to extract JSON from the response
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
        console.log(`Successfully parsed ${extractedData.users?.length || 0} users`);
      } else {
        console.warn("No JSON object found in response");
        extractedData = { users: [], reason: "No structured data found in AI response" };
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Content that failed to parse:", content.substring(0, 1000));
      extractedData = { users: [], error: "Failed to parse AI response" };
    }

    // Ensure users array exists
    if (!extractedData.users) {
      extractedData.users = [];
    }

    // Validate and clean up user data
    extractedData.users = extractedData.users.map((user: any, index: number) => ({
      name: user.name || `Person ${index + 1}`,
      employee_id: user.employee_id || user.student_id || user.admission_no || `STU-${String(index + 1).padStart(3, '0')}`,
      roll_number: user.roll_number || user.roll || '',
      department: user.department || user.class_section || user.class || '',
      position: user.position || user.grade || 'Student',
      email: user.email || user.student_email || '',
      phone: user.phone || user.student_phone || '',
      parent_name: user.parent_name || user.guardian_name || user.father_name || user.mother_name || '',
      parent_phone: user.parent_phone || user.guardian_phone || user.emergency_contact || '',
      parent_email: user.parent_email || user.guardian_email || '',
      blood_group: user.blood_group || user.blood || '',
      address: user.address || user.residential_address || '',
      transport_mode: user.transport_mode || user.transport || '',
      photo_url: user.photo_url || user.image_url || '',
      has_photo: user.has_photo || false,
      photo_description: user.photo_description || '',
      photo_bbox: user.photo_bbox || null,
    }));

    console.log(`Returning ${extractedData.users.length} extracted users`);

    return new Response(
      JSON.stringify(extractedData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in extract-pdf-users:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage, users: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
