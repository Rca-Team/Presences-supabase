-- 1. Ensure attendance_settings table has one_student_one_email_per_day key
INSERT INTO public.attendance_settings (key, value)
VALUES ('one_student_one_email_per_day', 'true')
ON CONFLICT (key) DO NOTHING;

-- 2. Add attendance_settings to supabase_realtime publication for instant admin synchronization
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_settings;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_object THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE public.attendance_settings;
END $$;
