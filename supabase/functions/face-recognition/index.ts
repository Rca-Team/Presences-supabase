
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Default cutoff time settings
const DEFAULT_CUTOFF_HOUR = 9;  // 9 AM
const DEFAULT_CUTOFF_MINUTE = 0;

interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VisionCandidate {
  student_id: string | null;
  user_id: string | null;
  student_name: string | null;
  image_url: string | null;
  quality_score: number | null;
}

interface ModelTopMatch {
  user_id: string;
  confidence: number;
}

interface ModelRecognitionPayload {
  recognized?: boolean;
  matched_user_id?: string | null;
  matched_student_name?: string | null;
  confidence?: number;
  quality_score?: number;
  reason?: string;
  top_matches?: ModelTopMatch[];
}

function parseJsonFromModel(content: string) {
  const cleaned = content.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? cleaned;
  return JSON.parse(source);
}

async function runGeminiVisionRecognition(
  supabaseClient: ReturnType<typeof createClient>,
  payload: { image?: string; faceBox?: FaceBox | null; minimumConfidence?: number; minimumQuality?: number },
) {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    return { recognized: false, confidence: 0, reason: 'missing_ai_key', qualityScore: 0 };
  }

  if (!payload.image) {
    return { recognized: false, confidence: 0, reason: 'missing_image', qualityScore: 0 };
  }

  const minimumConfidence = Number(payload.minimumConfidence ?? 0.72);
  const minimumQuality = Number(payload.minimumQuality ?? 0.7);

  const { data: candidates, error } = await supabaseClient
    .from('face_descriptors')
    .select('student_id, user_id, student_name, image_url, quality_score')
    .eq('is_active', true)
    .not('image_url', 'is', null)
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(30);

  if (error) {
    throw new Error(`Failed loading face candidates: ${error.message}`);
  }

  const validCandidates = ((candidates || []) as VisionCandidate[]).filter((candidate) =>
    Boolean(candidate.image_url && (candidate.user_id || candidate.student_id)),
  );

  const candidateSubset = validCandidates.slice(0, 8);

  if (!candidateSubset.length) {
    return { recognized: false, confidence: 0, reason: 'no_registered_candidates', qualityScore: 0 };
  }

  const candidateMap = new Map(
    candidateSubset.map((candidate, idx) => {
      const id = candidate.user_id || candidate.student_id || `candidate-${idx + 1}`;
      return [
        id,
        {
          id,
          name: candidate.student_name || null,
          imageUrl: candidate.image_url,
          qualityScore: Number(candidate.quality_score ?? 0),
        },
      ] as const;
    }),
  );

  const candidateLines = candidateSubset
    .map((candidate, idx) => {
      const id = candidate.user_id || candidate.student_id || `candidate-${idx + 1}`;
      return `${idx + 1}. id=${id}; name=${candidate.student_name || 'Unknown'}; quality=${candidate.quality_score ?? 0}; image=${candidate.image_url}`;
    })
    .join('\n');

  const faceBoxPrompt = payload.faceBox
    ? `Target face bounding box in source frame (x,y,width,height): ${payload.faceBox.x}, ${payload.faceBox.y}, ${payload.faceBox.width}, ${payload.faceBox.height}.`
    : 'Target face is the most centered and prominent face in the frame.';

  const modelPromptContent: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text:
        `Gate face verification task. ${faceBoxPrompt}\n` +
        `Use strict matching: reject uncertain, low-quality, side profile, blur, occlusion, or look-alike ambiguity.\n` +
        `Minimum confidence: ${minimumConfidence}. Minimum quality: ${minimumQuality}.\n` +
        `Candidate shortlist (metadata):\n${candidateLines}`,
    },
    {
      type: 'text',
      text: 'TARGET_FRAME',
    },
    {
      type: 'image_url',
      image_url: { url: payload.image },
    },
  ];

  candidateSubset.forEach((candidate, idx) => {
    const candidateId = candidate.user_id || candidate.student_id || `candidate-${idx + 1}`;
    modelPromptContent.push(
      {
        type: 'text',
        text: `CANDIDATE_${idx + 1} id=${candidateId}; name=${candidate.student_name || 'Unknown'}; quality=${candidate.quality_score ?? 0}`,
      },
      {
        type: 'image_url',
        image_url: { url: candidate.image_url },
      },
    );
  });

  let content = '';
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${geminiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a strict school gate face verifier. Compare TARGET_FRAME with each CANDIDATE image. Reject when uncertain. Return ONLY JSON with keys: recognized(boolean), matched_user_id(string|null), matched_student_name(string|null), confidence(number 0..1), quality_score(number 0..1), reason(string), top_matches(array of up to 3 objects with user_id and confidence sorted descending).',
          },
          {
            role: 'user',
            content: modelPromptContent,
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 402) {
        return { recognized: false, confidence: 0, reason: 'ai_credits_exhausted', qualityScore: 0 };
      }
      if (response.status === 429) {
        return { recognized: false, confidence: 0, reason: 'ai_rate_limited', qualityScore: 0 };
      }

      const errorBody = await response.text();
      console.error('Gemini Vision request failed', response.status, errorBody);
      return { recognized: false, confidence: 0, reason: 'ai_request_failed', qualityScore: 0 };
    }

    const completion = await response.json();
    content = completion?.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Gemini Vision call error:', error);
    return { recognized: false, confidence: 0, reason: 'ai_request_exception', qualityScore: 0 };
  }

  if (!content) {
    return { recognized: false, confidence: 0, reason: 'empty_model_response', qualityScore: 0 };
  }

  const parsed = parseJsonFromModel(content) as ModelRecognitionPayload;
  const qualityScore = Number(parsed?.quality_score ?? 0);
  const topMatches = (Array.isArray(parsed?.top_matches) ? parsed.top_matches : [])
    .map((match) => ({
      user_id: String(match?.user_id || ''),
      confidence: Number(match?.confidence ?? 0),
    }))
    .filter((match) => match.user_id && Number.isFinite(match.confidence))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  const top1 = topMatches[0] ?? null;
  const top2 = topMatches[1] ?? null;
  const matchedUserId = (parsed?.matched_user_id || top1?.user_id || null) as string | null;
  const confidence = Number(parsed?.confidence ?? top1?.confidence ?? 0);
  const confidenceMargin = top1 && top2 ? top1.confidence - top2.confidence : 1;
  const matchedCandidate = matchedUserId ? candidateMap.get(matchedUserId) : null;

  if (!matchedUserId || !matchedCandidate) {
    return {
      recognized: false,
      confidence,
      qualityScore,
      reason: parsed?.reason || 'invalid_candidate_match',
      userId: matchedUserId,
      studentName: parsed?.matched_student_name || null,
    };
  }

  if (
    !parsed?.recognized ||
    confidence < minimumConfidence ||
    qualityScore < minimumQuality ||
    confidenceMargin < 0.12
  ) {
    return {
      recognized: false,
      confidence,
      qualityScore,
      reason: parsed?.reason || (confidenceMargin < 0.12 ? 'ambiguous_top_match' : 'below_threshold'),
      userId: matchedUserId,
      studentName: parsed?.matched_student_name || matchedCandidate.name,
    };
  }

  return {
    recognized: true,
    confidence,
    qualityScore,
    reason: parsed?.reason || 'matched',
    userId: matchedUserId,
    studentName: parsed?.matched_student_name || matchedCandidate.name,
    employeeId: matchedUserId,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    const requestBody = await req.json()
    const { operation, userId, cutoffTime, image, faceBox, minimumConfidence, minimumQuality } = requestBody
    
    // Operations that require admin authentication
    const adminOperations = ['updateAttendanceCutoffTime'];
    
    if (adminOperations.includes(operation)) {
      // Verify user is authenticated
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized - Authentication required' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
          }
        );
      }

      // Check if user is admin
      const { data: roleData, error: roleError } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (roleError || !roleData) {
        return new Response(
          JSON.stringify({ error: 'Forbidden - Admin access required' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
          }
        );
      }
    }
    
    // Health check endpoint for model status
    if (operation === 'healthCheck') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          message: 'Face recognition service is running',
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    if (operation === 'recognizeFaceWithGeminiVision') {
      const result = await runGeminiVisionRecognition(supabaseClient, {
        image,
        faceBox,
        minimumConfidence,
        minimumQuality,
      });

      return new Response(
        JSON.stringify({ result }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }
    
    // Get attendance cutoff time setting
    if (operation === 'getAttendanceCutoffTime') {
      try {
        // First, check if we have a dedicated attendance_settings table
        let { data: settingsData, error: settingsError } = await supabaseClient
          .from('attendance_settings')
          .select('*')
          .eq('key', 'cutoff_time')
          .single();
        
        // If we get an error because the table doesn't exist, create it
        if (settingsError && settingsError.code === 'PGRST116') {
          console.log('Creating attendance_settings table...');
          
          // Attempt to create the table
          const { error: createTableError } = await supabaseClient.rpc('create_attendance_settings_table');
          
          if (createTableError) {
            console.error('Error creating attendance_settings table:', createTableError);
            // Return default settings if we can't create the table
            return new Response(
              JSON.stringify({
                hour: DEFAULT_CUTOFF_HOUR,
                minute: DEFAULT_CUTOFF_MINUTE
              }),
              {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
              }
            )
          }
          
          // Insert default settings
          const { data: insertData, error: insertError } = await supabaseClient
            .from('attendance_settings')
            .insert({
              key: 'cutoff_time',
              value: JSON.stringify({ hour: DEFAULT_CUTOFF_HOUR, minute: DEFAULT_CUTOFF_MINUTE })
            })
            .select();
          
          if (insertError) {
            console.error('Error inserting default settings:', insertError);
            return new Response(
              JSON.stringify({
                hour: DEFAULT_CUTOFF_HOUR,
                minute: DEFAULT_CUTOFF_MINUTE
              }),
              {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
              }
            )
          }
          
          settingsData = insertData?.[0];
        } else if (settingsError) {
          console.error('Error fetching cutoff time settings:', settingsError);
          return new Response(
            JSON.stringify({
              hour: DEFAULT_CUTOFF_HOUR,
              minute: DEFAULT_CUTOFF_MINUTE
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          )
        }
        
        let cutoffHour = DEFAULT_CUTOFF_HOUR;
        let cutoffMinute = DEFAULT_CUTOFF_MINUTE;
        
        if (settingsData && settingsData.value) {
          try {
            const settings = typeof settingsData.value === 'string' 
              ? JSON.parse(settingsData.value)
              : settingsData.value;
              
            cutoffHour = settings.hour ?? DEFAULT_CUTOFF_HOUR;
            cutoffMinute = settings.minute ?? DEFAULT_CUTOFF_MINUTE;
          } catch (e) {
            console.error('Error parsing cutoff time settings:', e);
          }
        }
        
        return new Response(
          JSON.stringify({
            hour: cutoffHour,
            minute: cutoffMinute
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      } catch (error) {
        console.error('Error in getAttendanceCutoffTime:', error);
        return new Response(
          JSON.stringify({
            hour: DEFAULT_CUTOFF_HOUR,
            minute: DEFAULT_CUTOFF_MINUTE,
        error: (error as Error).message
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      }
    }
    
    // Update attendance cutoff time
    if (operation === 'updateAttendanceCutoffTime' && cutoffTime) {
      const { hour, minute } = cutoffTime;
      
      // Validate inputs
      if (typeof hour !== 'number' || hour < 0 || hour > 23 || 
          typeof minute !== 'number' || minute < 0 || minute > 59) {
        return new Response(
          JSON.stringify({ error: 'Invalid cutoff time values' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        )
      }
      
      try {
        // First check if the table exists
        let { data: tableExists, error: tableCheckError } = await supabaseClient
          .from('attendance_settings')
          .select('count(*)', { count: 'exact', head: true });
        
        // Create table if it doesn't exist
        if (tableCheckError && tableCheckError.code === 'PGRST116') {
          const { error: createTableError } = await supabaseClient.rpc('create_attendance_settings_table');
          
          if (createTableError) {
            throw new Error(`Failed to create attendance_settings table: ${createTableError.message}`);
          }
        }
        
        // Update or insert cutoff time setting
        const { data, error } = await supabaseClient
          .from('attendance_settings')
          .upsert(
            {
              key: 'cutoff_time',
              value: JSON.stringify({ hour, minute })
            },
            { onConflict: 'key' }
          )
          .select();
        
        if (error) {
          throw new Error(`Error updating attendance cutoff time: ${error.message}`);
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Attendance cutoff time updated successfully',
            data
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      } catch (error) {
        console.error('Error updating cutoff time:', error);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: (error as Error).message
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }
    }
    
    // Track attendance count for a specific user
    if (operation === 'getUserAttendanceCount' && userId) {
      // Get attendance count for the specific user
      const { data: attendanceData, error: attendanceError } = await supabaseClient
        .from('attendance_records')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'present');
      
      if (attendanceError) throw attendanceError;
      
      return new Response(
        JSON.stringify({
          count: attendanceData?.length || 0,
          userId: userId
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }
    
    // Sample function to get attendance statistics
    if (operation === 'getAttendanceStats') {
      const today = new Date().toISOString().split('T')[0]
      
      // Get total employees
      const { data: employeesData, error: employeesError } = await supabaseClient
        .from('employees')
        .select('id')
      
      if (employeesError) throw employeesError
      
      const totalEmployees = employeesData?.length || 0
      
      // Get present employees today
      const { data: presentData, error: presentError } = await supabaseClient
        .from('attendance_dates')
        .select('id')
        .eq('date', today)
      
      if (presentError) throw presentError
      
      const presentEmployees = presentData?.length || 0
      
      // Get late employees today
      const { data: lateData, error: lateError } = await supabaseClient
        .from('attendance_records')
        .select('id')
        .eq('status', 'late')
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`)
      
      if (lateError) throw lateError
      
      const lateEmployees = lateData?.length || 0
      
      // Calculate absent employees
      const absentEmployees = Math.max(0, totalEmployees - presentEmployees)
      
      return new Response(
        JSON.stringify({
          present: presentEmployees,
          late: lateEmployees,
          absent: absentEmployees,
          total: totalEmployees,
          presentPercentage: totalEmployees > 0 ? Math.round((presentEmployees / totalEmployees) * 100) : 0,
          latePercentage: totalEmployees > 0 ? Math.round((lateEmployees / totalEmployees) * 100) : 0,
          absentPercentage: totalEmployees > 0 ? Math.round((absentEmployees / totalEmployees) * 100) : 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }
    
    // Handler for future operations
    
    return new Response(
      JSON.stringify({ error: 'Unknown operation' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  } catch (error) {
    console.error('Face recognition function error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
