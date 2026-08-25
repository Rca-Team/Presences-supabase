-- Add missing columns to attendance_records table
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered',
ADD COLUMN IF NOT EXISTS face_descriptor TEXT,
ADD COLUMN IF NOT EXISTS confidence NUMERIC,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create storage bucket for face images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('face-images', 'face-images', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for face images bucket
DROP POLICY IF EXISTS "Allow public uploads to face-images" ON storage.objects;
CREATE POLICY "Allow public uploads to face-images" ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'face-images');

DROP POLICY IF EXISTS "Allow public read from face-images" ON storage.objects;
CREATE POLICY "Allow public read from face-images" ON storage.objects 
FOR SELECT 
USING (bucket_id = 'face-images');

DROP POLICY IF EXISTS "Allow public updates to face-images" ON storage.objects;
CREATE POLICY "Allow public updates to face-images" ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'face-images');

DROP POLICY IF EXISTS "Allow public delete from face-images" ON storage.objects;
CREATE POLICY "Allow public delete from face-images" ON storage.objects 
FOR DELETE 
USING (bucket_id = 'face-images');