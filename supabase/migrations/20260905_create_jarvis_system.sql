-- ==========================================================
-- PRESENCES JARVIS AI DIAGNOSTICS & MONITORING SYSTEM SCHEMA
-- Dedicated Supabase Project: pfctmafkuhntdqzzcpnj
-- ==========================================================

-- 1. JARVIS SYSTEM AUDIT & ERROR LOGS
CREATE TABLE IF NOT EXISTS public.jarvis_system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    source TEXT NOT NULL,
    route TEXT,
    message TEXT NOT NULL,
    stack_trace TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. JARVIS STUDENT DATA INTEGRITY AUDITS
CREATE TABLE IF NOT EXISTS public.jarvis_student_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT,
    student_name TEXT,
    class TEXT,
    section TEXT,
    issue_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    details TEXT NOT NULL,
    suggested_fix TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. JARVIS ON-DEMAND DIAGNOSTIC RUNS
CREATE TABLE IF NOT EXISTS public.jarvis_diagnostics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_type TEXT NOT NULL,
    triggered_by TEXT DEFAULT 'admin',
    health_score INT NOT NULL DEFAULT 100,
    total_errors_found INT DEFAULT 0,
    total_student_issues INT DEFAULT 0,
    summary TEXT NOT NULL,
    recommendations JSONB DEFAULT '[]'::jsonb,
    metrics JSONB DEFAULT '{}'::jsonb,
    duration_ms INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. JARVIS ACTIONABLE SUGGESTIONS
CREATE TABLE IF NOT EXISTS public.jarvis_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diagnostic_id UUID REFERENCES public.jarvis_diagnostics(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    impact TEXT DEFAULT 'medium',
    category TEXT NOT NULL,
    action_type TEXT,
    auto_fixable BOOLEAN DEFAULT false,
    action_payload JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. JARVIS VOICE & CHAT CONVERSATIONS
CREATE TABLE IF NOT EXISTS public.jarvis_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    user_name TEXT,
    user_role TEXT DEFAULT 'admin',
    user_prompt TEXT NOT NULL,
    jarvis_response TEXT NOT NULL,
    action_taken TEXT,
    audio_played BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. JARVIS AUTOMATED ACTIONS AUDIT LOG
CREATE TABLE IF NOT EXISTS public.jarvis_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_name TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT,
    executed_by TEXT DEFAULT 'jarvis_ai',
    result TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_jarvis_system_logs_created_at ON public.jarvis_system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jarvis_system_logs_severity ON public.jarvis_system_logs(severity);
CREATE INDEX IF NOT EXISTS idx_jarvis_student_audits_status ON public.jarvis_student_audits(status);
CREATE INDEX IF NOT EXISTS idx_jarvis_diagnostics_created_at ON public.jarvis_diagnostics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jarvis_suggestions_status ON public.jarvis_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_jarvis_conversations_created_at ON public.jarvis_conversations(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.jarvis_system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_student_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jarvis_actions ENABLE ROW LEVEL SECURITY;

-- Allow policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Enable all access for jarvis_system_logs" ON public.jarvis_system_logs;
    DROP POLICY IF EXISTS "Enable all access for jarvis_student_audits" ON public.jarvis_student_audits;
    DROP POLICY IF EXISTS "Enable all access for jarvis_diagnostics" ON public.jarvis_diagnostics;
    DROP POLICY IF EXISTS "Enable all access for jarvis_suggestions" ON public.jarvis_suggestions;
    DROP POLICY IF EXISTS "Enable all access for jarvis_conversations" ON public.jarvis_conversations;
    DROP POLICY IF EXISTS "Enable all access for jarvis_actions" ON public.jarvis_actions;

    CREATE POLICY "Enable all access for jarvis_system_logs" ON public.jarvis_system_logs FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Enable all access for jarvis_student_audits" ON public.jarvis_student_audits FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Enable all access for jarvis_diagnostics" ON public.jarvis_diagnostics FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Enable all access for jarvis_suggestions" ON public.jarvis_suggestions FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Enable all access for jarvis_conversations" ON public.jarvis_conversations FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Enable all access for jarvis_actions" ON public.jarvis_actions FOR ALL USING (true) WITH CHECK (true);
END
$$;
