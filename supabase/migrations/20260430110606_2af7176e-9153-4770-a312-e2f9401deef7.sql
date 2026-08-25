ALTER TABLE public.school_gates ADD COLUMN IF NOT EXISTS detection_box JSONB;
ALTER TABLE public.attendance_settings ALTER COLUMN value TYPE TEXT;
INSERT INTO public.attendance_settings (key, value) VALUES ('require_scan_confirmation', 'true') ON CONFLICT (key) DO NOTHING;