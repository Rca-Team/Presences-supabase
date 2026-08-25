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
    const { userId, context } = await req.json();

    // Users can only generate notifications for themselves (or admins for anyone)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    const isAdmin = !!roleData;
    const targetUserId = isAdmin ? (userId || user.id) : user.id;

    console.log("Generating smart notification:", { targetUserId, context, isAdmin });

    // Get user data and recent activity
    const { data: userData } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .single();

    const { data: recentAttendance } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", targetUserId)
      .order("timestamp", { ascending: false })
      .limit(5);

    // Generate personalized notification using AI
    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${geminiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "You are a helpful AI assistant that creates personalized, friendly, and actionable notifications for students." 
          },
          { 
            role: "user", 
            content: `Create a personalized notification for ${userData?.display_name || 'Student'}. Context: ${context}. Recent attendance: ${JSON.stringify(recentAttendance)}. Return JSON: { "title": "string", "message": "string", "type": "info/warning/success", "actionable": true/false }` 
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const notification = JSON.parse(aiResult.choices[0].message.content);

    // Store notification
    const { error: insertError } = await supabase
      .from("notifications")
      .insert({
        user_id: targetUserId,
        title: notification.title,
        message: notification.message,
      });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, notification }), {
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
