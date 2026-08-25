-- Add missing columns to attendance_records table
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS confidence_score FLOAT,
ADD COLUMN IF NOT EXISTS recognized BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS face_descriptor TEXT;

-- Add missing columns to profiles table  
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS employee_id TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS position TEXT;

-- Create attendance_settings table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on attendance_settings
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for attendance_settings
CREATE POLICY "Allow all operations on attendance_settings" 
ON public.attendance_settings 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for attendance_settings timestamps
CREATE TRIGGER update_attendance_settings_updated_at
BEFORE UPDATE ON public.attendance_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default cutoff time setting
INSERT INTO public.attendance_settings (key, value) 
VALUES ('cutoff_time', '09:00')
ON CONFLICT (key) DO NOTHING;