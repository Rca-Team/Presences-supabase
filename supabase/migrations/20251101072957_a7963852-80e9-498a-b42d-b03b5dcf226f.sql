-- Fix security issue by dropping and recreating with CASCADE
DROP TRIGGER IF EXISTS attendance_realtime_trigger ON public.attendance_records CASCADE;
DROP FUNCTION IF EXISTS public.notify_attendance_change() CASCADE;

CREATE OR REPLACE FUNCTION public.notify_attendance_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify('attendance_changed', json_build_object(
    'operation', TG_OP,
    'record', row_to_json(NEW)
  )::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_realtime_trigger
AFTER INSERT OR UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_attendance_change();