-- Add missing columns to attendance_records
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS confidence_score FLOAT;

-- Add missing columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create attendance_settings table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for attendance_settings
CREATE POLICY "Allow public read access to attendance_settings"
  ON public.attendance_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert to attendance_settings"
  ON public.attendance_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update to attendance_settings"
  ON public.attendance_settings
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create index
CREATE INDEX IF NOT EXISTS idx_attendance_settings_key ON public.attendance_settings(key);