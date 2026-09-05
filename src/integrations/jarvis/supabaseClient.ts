import { createClient } from "@supabase/supabase-js";

const JARVIS_URL = import.meta.env.VITE_JARVIS_SUPABASE_URL || "";
const JARVIS_ANON_KEY = import.meta.env.VITE_JARVIS_SUPABASE_ANON_KEY || "";

export const jarvisSupabase = createClient(JARVIS_URL, JARVIS_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export interface JarvisSystemLog {
  id?: string;
  category: "runtime_error" | "network_failure" | "data_anomaly" | "security_event" | "performance_lag";
  severity: "info" | "warning" | "error" | "critical";
  source: string;
  route?: string;
  message: string;
  stack_trace?: string;
  metadata?: Record<string, any>;
  resolved?: boolean;
  resolved_at?: string;
  created_at?: string;
}

export interface JarvisStudentAudit {
  id?: string;
  student_id?: string;
  student_name?: string;
  class?: string;
  section?: string;
  issue_type: "missing_photo" | "missing_descriptor" | "duplicate_identifier" | "missing_parent_contact" | "unassigned_section";
  severity: "low" | "medium" | "high" | "critical";
  details: string;
  suggested_fix?: string;
  status: "pending" | "resolved" | "ignored";
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface JarvisDiagnostic {
  id?: string;
  scan_type: string;
  triggered_by?: string;
  health_score: number;
  total_errors_found: number;
  total_student_issues: number;
  summary: string;
  recommendations: Array<{
    title: string;
    description: string;
    category: string;
    impact: "low" | "medium" | "high";
    action_type: string;
  }>;
  metrics: Record<string, any>;
  duration_ms: number;
  created_at?: string;
}

export interface JarvisConversation {
  id?: string;
  user_id?: string;
  user_name?: string;
  user_role?: string;
  user_prompt: string;
  jarvis_response: string;
  action_taken?: string;
  audio_played?: boolean;
  metadata?: Record<string, any>;
  created_at?: string;
}
