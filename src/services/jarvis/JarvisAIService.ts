import { jarvisSupabase, JarvisDiagnostic, JarvisConversation } from "@/integrations/jarvis/supabaseClient";
import { AuditSummaryResult } from "./JarvisAuditService";
import { presencesDataContext } from "./PresencesDataContext";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

const JARVIS_SYSTEM_INSTRUCTION = `
You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the world's most advanced, articulate, and proactive artificial intelligence assistant, inspired by Tony Stark's personal AI in Iron Man.
You are now in command of the Presences Smart Campus Architecture. Your responsibilities include 24/7 diagnostic awareness, identifying system and database anomalies, monitoring facial recognition readiness, checking student registries for missing data, and recommending exact operational solutions.

PERSONALITY & VOICE:
1. Speak in a sophisticated, calm, articulate, and technically proficient British tone reminiscent of Paul Bettany's JARVIS.
2. Address the administrator respectfully as "Sir" or "Administrator".
3. Infuse subtle wit, poise, and unwavering loyalty while maintaining absolute clarity and precision.
4. When reporting issues, categorize by criticality (Critical, High, Medium) and explain the operational consequence (e.g., "Without enrolled face descriptors, the student cannot clear the turnstile gate").
5. Provide actionable solutions and recommend next steps clearly.
`;

export interface JarvisAnalysisResponse {
  healthScore: number;
  spokenSummary: string;
  detailedAnalysis: string;
  recommendations: Array<{
    title: string;
    description: string;
    category: string;
    impact: "low" | "medium" | "high";
    action_type: string;
  }>;
}

export class JarvisAIService {
  private async callGemini(contents: any[], systemInstruction: string = JARVIS_SYSTEM_INSTRUCTION): Promise<string> {
    const models = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-1.5-flash"];
    let lastError: any = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            contents,
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 2048,
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini ${model} HTTP ${response.status}: ${errText}`);
        }

        const json = await response.json();
        const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          return reply;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[JarvisAI] Fallback from ${model} due to:`, err);
      }
    }

    throw lastError || new Error("All Gemini models failed to respond.");
  }

  // Deep Diagnostic Analysis of System & Student Data
  async analyzeAuditReport(audit: AuditSummaryResult): Promise<JarvisAnalysisResponse> {
    let campusStatsStr = "";
    try {
      const snapshot = await presencesDataContext.getLiveSnapshot();
      campusStatsStr = `
LIVE INSTITUTIONAL TELEMETRY (PRIMARY DATABASE):
- Total Registered Profiles: ${snapshot.totalStudents} students, ${snapshot.totalStaff} staff
- Today's Attendance: ${snapshot.todayAttendance.present} Present, ${snapshot.todayAttendance.late} Late, ${snapshot.todayAttendance.absent} Absent (${snapshot.todayAttendance.attendanceRate}% Attendance Rate)
- Active Classes in System: ${Object.keys(snapshot.classesBreakdown).join(", ") || "Standard Grades"}
- Biometric Enrollment Coverage: ${snapshot.biometricCoverageRate}% (${snapshot.biometricsEnrolledCount} of ${snapshot.totalStudents} enrolled)
`;
    } catch (e) {
      console.warn("[JarvisAI] Non-critical snapshot read error:", e);
    }

    const prompt = `
Sir, I have completed a diagnostic sweep of the campus registry and system telemetry. Here is the operational data:
${campusStatsStr}
AUDIT DEFECTS IDENTIFIED:
- Total Students Analyzed: ${audit.totalStudentsChecked}
- Students Missing Portrait Photos: ${audit.missingPhotos}
- Students Missing Face Embeddings (Biometrics): ${audit.missingFaceDescriptors}
- Students Missing Parent Contacts (SMS/Email): ${audit.missingParentContacts}
- Students Missing Class/Section: ${audit.missingClassOrSection}
- Duplicate Identifiers (Roll No / Email): ${audit.duplicateIdentifiers}
- System/Network Errors Logged: ${audit.systemErrorsFound}

Please synthesize a comprehensive report formatted in strict JSON conforming to this schema:
{
  "healthScore": number (0-100, calculate logically based on defects vs total students),
  "spokenSummary": string (a 2-3 sentence charismatic, vocal statement in character for text-to-speech addressing the user as Sir, stating health score and prime concerns),
  "detailedAnalysis": string (markdown detailed executive brief of system status),
  "recommendations": [
    {
      "title": string,
      "description": string,
      "category": "student_data" | "face_biometrics" | "network" | "security",
      "impact": "high" | "medium" | "low",
      "action_type": "auto_fix" | "manual_review" | "notify_admin"
    }
  ]
}
Return ONLY valid JSON.
`;

    try {
      const rawText = await this.callGemini([
        { role: "user", parts: [{ text: prompt }] },
      ]);

      // Extract JSON from potential code fences
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Invalid response format from Gemini analysis.");
      }

      const parsed: JarvisAnalysisResponse = JSON.parse(jsonMatch[0]);

      // Save diagnostic record into dedicated Jarvis Supabase
      try {
        const { data: diagData } = await jarvisSupabase
          .from("jarvis_diagnostics")
          .insert({
            scan_type: "full_system",
            triggered_by: "admin",
            health_score: parsed.healthScore,
            total_errors_found: audit.systemErrorsFound,
            total_student_issues:
              audit.missingPhotos +
              audit.missingFaceDescriptors +
              audit.missingParentContacts +
              audit.missingClassOrSection +
              audit.duplicateIdentifiers,
            summary: parsed.spokenSummary,
            recommendations: parsed.recommendations,
            metrics: {
              totalStudents: audit.totalStudentsChecked,
              missingPhotos: audit.missingPhotos,
              missingDescriptors: audit.missingFaceDescriptors,
              missingParentContacts: audit.missingParentContacts,
            },
          })
          .select("id")
          .single();

        if (diagData?.id && parsed.recommendations?.length) {
          await jarvisSupabase.from("jarvis_suggestions").insert(
            parsed.recommendations.map((r) => ({
              diagnostic_id: diagData.id,
              title: r.title,
              description: r.description,
              category: r.category,
              impact: r.impact,
              action_type: r.action_type,
              status: "pending",
            }))
          );
        }
      } catch (saveErr) {
        console.warn("[JarvisAI] Non-critical diagnostic save failure:", saveErr);
      }

      return parsed;
    } catch (error) {
      console.error("[JarvisAI] Analysis failed:", error);
      // Fallback deterministic analysis if network is down
      const totalDefects =
        audit.missingPhotos +
        audit.missingFaceDescriptors +
        audit.missingParentContacts +
        audit.duplicateIdentifiers;
      const score = Math.max(25, 100 - totalDefects * 3);

      return {
        healthScore: score,
        spokenSummary: `Diagnostic complete, Sir. Campus operational integrity is currently rated at ${score} percent. I have identified ${audit.missingFaceDescriptors} students lacking biometric descriptors and ${audit.missingPhotos} missing photographic records requiring your attention.`,
        detailedAnalysis: `### Diagnostic Overview\n- Total Students: ${audit.totalStudentsChecked}\n- Missing Face Embeddings: ${audit.missingFaceDescriptors}\n- Missing Photos: ${audit.missingPhotos}\n- Missing Parent Contacts: ${audit.missingParentContacts}`,
        recommendations: [
          {
            title: "Enroll Biometric Descriptors",
            description: "Run batch descriptor enrollment on students lacking 128D facial vectors.",
            category: "face_biometrics",
            impact: "high",
            action_type: "manual_review",
          },
          {
            title: "Collect Guardian Contact Details",
            description: "Update student parent emails and phone numbers to ensure gate alerts succeed.",
            category: "student_data",
            impact: "medium",
            action_type: "notify_admin",
          },
        ],
      };
    }
  }

  // Interactive Voice & Text Dialogue with live database telemetry
  async askJarvis(userPrompt: string, contextSnippet?: string): Promise<string> {
    const contents: any[] = [];

    // Query live telemetry and student profiles from older Supabase
    let livePresencesContext = "";
    try {
      livePresencesContext = await presencesDataContext.buildPresencesPromptContext(userPrompt);
    } catch (ctxErr) {
      console.warn("[JarvisAI] Live context build error:", ctxErr);
    }

    const mergedContext = [
      livePresencesContext,
      contextSnippet ? `[ADDITIONAL AUDIT SUMMARY]\n${contextSnippet}` : "",
    ].filter(Boolean).join("\n\n");

    if (mergedContext) {
      contents.push({
        role: "user",
        parts: [{ text: mergedContext }],
      });
      contents.push({
        role: "model",
        parts: [{ text: "Understood, Sir. I have loaded the live Presences institutional database, student profiles, and attendance telemetry into my operational matrix. How may I assist you?" }],
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: userPrompt }],
    });

    const reply = await this.callGemini(contents);

    // Save conversation to dedicated Supabase
    try {
      await jarvisSupabase.from("jarvis_conversations").insert({
        user_prompt: userPrompt,
        jarvis_response: reply,
        user_role: "admin",
      });
    } catch (convErr) {
      console.warn("[JarvisAI] Non-critical conversation save failure:", convErr);
    }

    return reply;
  }
}

export const jarvisAI = new JarvisAIService();
