ALTER FUNCTION public.upsert_class_attendance_event(
  UUID,
  TEXT,
  public.attendance_event_status,
  TEXT,
  DOUBLE PRECISION,
  TEXT,
  JSONB
) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.upsert_class_attendance_event(
  UUID,
  TEXT,
  public.attendance_event_status,
  TEXT,
  DOUBLE PRECISION,
  TEXT,
  JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_class_attendance_event(
  UUID,
  TEXT,
  public.attendance_event_status,
  TEXT,
  DOUBLE PRECISION,
  TEXT,
  JSONB
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_class_attendance_event(
  UUID,
  TEXT,
  public.attendance_event_status,
  TEXT,
  DOUBLE PRECISION,
  TEXT,
  JSONB
) TO service_role;