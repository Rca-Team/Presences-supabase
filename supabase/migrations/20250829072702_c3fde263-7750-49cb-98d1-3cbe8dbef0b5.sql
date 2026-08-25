-- Create attendance_records table for face recognition attendance system
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  device_info JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Create policies for attendance_records
DROP POLICY IF EXISTS "Users can view their own attendance records" ON public.attendance_records;
CREATE POLICY "Users can view their own attendance records" ON public.attendance_records 
FOR SELECT 
USING (true); -- Allow public read for now, can be restricted later

DROP POLICY IF EXISTS "Users can create attendance records" ON public.attendance_records;
CREATE POLICY "Users can create attendance records" ON public.attendance_records 
FOR INSERT 
WITH CHECK (true); -- Allow public insert for registration

DROP POLICY IF EXISTS "Users can update their own attendance records" ON public.attendance_records;
CREATE POLICY "Users can update their own attendance records" ON public.attendance_records 
FOR UPDATE 
USING (true);

-- Add missing parent contact columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS parent_email TEXT,
ADD COLUMN IF NOT EXISTS parent_phone TEXT,
ADD COLUMN IF NOT EXISTS parent_name TEXT,
ADD COLUMN IF NOT EXISTS relationship TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS employee_id TEXT,
ADD COLUMN IF NOT EXISTS department TEXT;

-- Create trigger for automatic timestamp updates on attendance_records
DROP TRIGGER IF EXISTS update_attendance_records_updated_at ON public.attendance_records;
CREATE TRIGGER update_attendance_records_updated_at
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();