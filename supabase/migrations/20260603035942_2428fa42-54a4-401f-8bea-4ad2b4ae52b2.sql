DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'attendance_event_status') THEN
    CREATE TYPE public.attendance_event_status AS ENUM ('detected', 'verified', 'corrected', 'present', 'late', 'absent', 'excused', 'unauthorized');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.class_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class TEXT NOT NULL,
  section TEXT NOT NULL,
  subject TEXT,
  school_day DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  started_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_sessions TO authenticated;
GRANT ALL ON public.class_sessions TO service_role;

ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_sessions_staff_select" ON public.class_sessions;
CREATE POLICY "class_sessions_staff_select"
ON public.class_sessions
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'principal'::app_role)
  OR private.has_role(auth.uid(), 'teacher'::app_role)
);

DROP POLICY IF EXISTS "class_sessions_staff_write" ON public.class_sessions;
CREATE POLICY "class_sessions_staff_write"
ON public.class_sessions
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'principal'::app_role)
  OR private.has_role(auth.uid(), 'teacher'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'principal'::app_role)
  OR private.has_role(auth.uid(), 'teacher'::app_role)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sessions_active_scope
ON public.class_sessions (class, section, school_day)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_class_sessions_lookup
ON public.class_sessions (school_day DESC, class, section, is_active);

CREATE TABLE IF NOT EXISTS public.attendance_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  status public.attendance_event_status NOT NULL DEFAULT 'detected',
  source TEXT NOT NULL DEFAULT 'scanner',
  confidence_score DOUBLE PRECISION,
  recognized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID,
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id),
  UNIQUE (session_id, idempotency_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_session_events TO authenticated;
GRANT ALL ON public.attendance_session_events TO service_role;

ALTER TABLE public.attendance_session_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_session_events_staff_select" ON public.attendance_session_events;
CREATE POLICY "attendance_session_events_staff_select"
ON public.attendance_session_events
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'principal'::app_role)
  OR private.has_role(auth.uid(), 'teacher'::app_role)
);

DROP POLICY IF EXISTS "attendance_session_events_staff_write" ON public.attendance_session_events;
CREATE POLICY "attendance_session_events_staff_write"
ON public.attendance_session_events
FOR ALL
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'principal'::app_role)
  OR private.has_role(auth.uid(), 'teacher'::app_role)
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'principal'::app_role)
  OR private.has_role(auth.uid(), 'teacher'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_attendance_session_events_session_status
ON public.attendance_session_events (session_id, status, recognized_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_session_events_student
ON public.attendance_session_events (student_id, recognized_at DESC);

CREATE OR REPLACE FUNCTION public.update_class_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_attendance_session_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_sessions_updated_at ON public.class_sessions;
CREATE TRIGGER trg_class_sessions_updated_at
BEFORE UPDATE ON public.class_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_class_sessions_updated_at();

DROP TRIGGER IF EXISTS trg_attendance_session_events_updated_at ON public.attendance_session_events;
CREATE TRIGGER trg_attendance_session_events_updated_at
BEFORE UPDATE ON public.attendance_session_events
FOR EACH ROW
EXECUTE FUNCTION public.update_attendance_session_events_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_class_attendance_event(
  p_session_id UUID,
  p_student_id TEXT,
  p_status public.attendance_event_status,
  p_source TEXT DEFAULT 'scanner',
  p_confidence_score DOUBLE PRECISION DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.attendance_session_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result public.attendance_session_events;
  v_key TEXT;
BEGIN
  v_key := COALESCE(NULLIF(trim(p_idempotency_key), ''), p_session_id::text || ':' || p_student_id);

  INSERT INTO public.attendance_session_events (
    session_id,
    student_id,
    status,
    source,
    confidence_score,
    idempotency_key,
    metadata,
    recorded_by,
    recognized_at
  ) VALUES (
    p_session_id,
    p_student_id,
    p_status,
    COALESCE(NULLIF(trim(p_source), ''), 'scanner'),
    p_confidence_score,
    v_key,
    COALESCE(p_metadata, '{}'::jsonb),
    auth.uid(),
    now()
  )
  ON CONFLICT (session_id, student_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    source = EXCLUDED.source,
    confidence_score = EXCLUDED.confidence_score,
    idempotency_key = EXCLUDED.idempotency_key,
    metadata = COALESCE(public.attendance_session_events.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    recorded_by = auth.uid(),
    recognized_at = now(),
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attendance_session_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_session_events;
  END IF;
END $$;