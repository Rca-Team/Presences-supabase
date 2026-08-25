-- Add missing columns to attendance_records table
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC;

-- Add missing columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

-- Create attendance_settings table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security for attendance_settings
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for attendance_settings (allow public read/write for settings)
CREATE POLICY "Allow public read access to attendance_settings" 
ON public.attendance_settings 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public write access to attendance_settings" 
ON public.attendance_settings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update access to attendance_settings" 
ON public.attendance_settings 
FOR UPDATE 
USING (true);

-- Insert default attendance cutoff setting
INSERT INTO public.attendance_settings (key, value) 
VALUES ('attendance_cutoff', '10:00') 
ON CONFLICT (key) DO NOTHING;

-- Create trigger for automatic timestamp updates on attendance_settings
CREATE TRIGGER update_attendance_settings_updated_at
BEFORE UPDATE ON public.attendance_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();