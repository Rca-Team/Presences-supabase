-- Create storage bucket for face images
INSERT INTO storage.buckets (id, name, public) VALUES ('face-images', 'face-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for face images
DROP POLICY IF EXISTS "Face images are publicly accessible" ON storage.objects;
CREATE POLICY "Face images are publicly accessible" ON storage.objects 
FOR SELECT 
USING (bucket_id = 'face-images');

DROP POLICY IF EXISTS "Anyone can upload face images during registration" ON storage.objects;
CREATE POLICY "Anyone can upload face images during registration" ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'face-images');

-- Add policy to allow registration records without authentication
DROP POLICY IF EXISTS "Allow registration records" ON attendance_records;
CREATE POLICY "Allow registration records" ON attendance_records 
FOR INSERT 
WITH CHECK (status = 'registered');