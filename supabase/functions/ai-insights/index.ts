import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired authentication token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Authenticated user: ${user.id}`);

    // Use service role client for data operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { type, userId, data } = await req.json();

    // Users can only get insights for themselves (or admins for anyone)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    const isAdmin = !!roleData;
    const targetUserId = isAdmin ? (userId || user.id) : user.id;

    console.log("Generating AI insight:", { type, targetUserId, isAdmin });

    // Fetch user attendance history
    const { data: attendanceData, error: fetchError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", targetUserId)
      .order("timestamp", { ascending: false })
      .limit(30);

    if (fetchError) throw fetchError;

    let systemPrompt = "";
    let userPrompt = "";

    switch (type) {
      case "attendance_prediction":
        systemPrompt = "You are an AI attendance analyst. Analyze patterns and predict attendance likelihood.";
        userPrompt = `Based on this attendance history: ${JSON.stringify(attendanceData)}, predict the likelihood of attendance for the next 7 days. Return a JSON object with: { "prediction": "high/medium/low", "confidence": 0-1, "insights": ["insight1", "insight2"], "recommendations": ["rec1", "rec2"] }`;
        break;
      
      case "anomaly_detection":
        systemPrompt = "You are an AI security analyst detecting unusual attendance patterns.";
        userPrompt = `Analyze this attendance data for anomalies: ${JSON.stringify(attendanceData)}. Look for suspicious patterns, unusual times, or irregularities. Return JSON: { "anomalies": [{"type": "string", "severity": "high/medium/low", "description": "string"}], "confidence": 0-1 }`;
        break;
      
      case "performance_insights":
        systemPrompt = "You are an AI performance analyst providing actionable attendance insights.";
        userPrompt = `Analyze attendance patterns: ${JSON.stringify(attendanceData)}. Provide insights on: consistency, trends, areas for improvement. Return JSON: { "overallScore": 0-100, "trends": ["trend1"], "strengths": ["str1"], "improvements": ["imp1"] }`;
        break;
      
      default:
        systemPrompt = "You are a helpful AI assistant.";
        userPrompt = JSON.stringify(data);
    }

    // Call Gemini API
    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${geminiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = JSON.parse(aiResult.choices[0].message.content);

    // Store insight
    const { error: insertError } = await supabase
      .from("ai_insights")
      .insert({
        insight_type: type,
        content: JSON.stringify(content),
        metadata: { user_id: targetUserId, confidence: content.confidence || 0.8 }
      });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, insight: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
