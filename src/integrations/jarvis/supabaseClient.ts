import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabase as primarySupabase } from "@/integrations/supabase/client";

const DEFAULT_JARVIS_URL = "https://pfctmafkuhntdqzzcpnj.supabase.co";
const DEFAULT_JARVIS_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmY3RtYWZrdWhudGRxenpjcG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDI4MDgsImV4cCI6MjEwNDE3ODgwOH0.D5bnwLavz6jlU_uiT6Wf5_vnleODb4NQ3R7hr0YxBjA";

function getJarvisCredentials() {
  const url =
    (import.meta.env.VITE_JARVIS_SUPABASE_URL as string) ||
    DEFAULT_JARVIS_URL;
  const anonKey =
    (import.meta.env.VITE_JARVIS_SUPABASE_ANON_KEY as string) ||
    DEFAULT_JARVIS_ANON;
  return { url, anonKey };
}

let _jarvisClient: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_jarvisClient) {
    try {
      const { url, anonKey } = getJarvisCredentials();
      if (url && anonKey) {
        _jarvisClient = createClient(url, anonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
      } else {
        _jarvisClient = primarySupabase as any;
      }
    } catch (e) {
      console.warn("[Jarvis] Initializing fallback client:", e);
      _jarvisClient = primarySupabase as any;
    }
  }
  return _jarvisClient!;
}

// Lazy Proxy: Never crashes module initialization if env vars are unpopulated on Vercel
export const jarvisSupabase = new Proxy({} as SupabaseClient, {
  get(_, prop, receiver) {
    const client = getClient();
    const val = Reflect.get(client, prop, receiver);
    return typeof val === "function" ? val.bind(client) : val;
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
