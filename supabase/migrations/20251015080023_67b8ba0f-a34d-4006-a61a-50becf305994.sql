-- Create attendance_records table
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'present',
  device_info JSONB,
  face_descriptor TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  username TEXT,
  display_name TEXT,
  parent_name TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for attendance_records
CREATE POLICY "Allow public read access to attendance_records"
  ON public.attendance_records
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert for registration"
  ON public.attendance_records
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    user_id IS NULL 
    OR status = 'pending_approval'
    OR (device_info->>'registration')::boolean = true
  );

CREATE POLICY "Allow authenticated update"
  ON public.attendance_records
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated delete"
  ON public.attendance_records
  FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for profiles
CREATE POLICY "Allow public read access to profiles"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert to profiles"
  ON public.profiles
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update to profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create storage bucket for face images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'face-images',
  'face-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for face-images bucket
CREATE POLICY "Allow public read access to face images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'face-images');

CREATE POLICY "Allow public upload to face images"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'face-images');

CREATE POLICY "Allow authenticated delete from face images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'face-images');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_timestamp ON public.attendance_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON public.attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);