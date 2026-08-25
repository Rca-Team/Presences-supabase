CREATE INDEX IF NOT EXISTS idx_class_sessions_active_lookup ON public.class_sessions (class, section, school_day, is_active, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_session_events_timeline ON public.attendance_session_events (session_id, recognized_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_session_events_status ON public.attendance_session_events (session_id, status);