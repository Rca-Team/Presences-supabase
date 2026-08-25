-- Fix attendance_settings table structure and add missing columns
ALTER TABLE public.attendance_settings 
DROP COLUMN IF EXISTS setting_name,
DROP COLUMN IF EXISTS setting_value;

ALTER TABLE public.attendance_settings 
ADD COLUMN IF NOT EXISTS key TEXT NOT NULL,
ADD COLUMN IF NOT EXISTS value JSONB;

-- Make key unique
ALTER TABLE public.attendance_settings 
ADD CONSTRAINT attendance_settings_key_unique UNIQUE (key);

-- Add missing columns to attendance_records
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC,
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add missing columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;