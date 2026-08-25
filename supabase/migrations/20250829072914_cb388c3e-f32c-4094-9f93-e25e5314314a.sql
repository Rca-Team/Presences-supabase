-- Add missing columns to attendance_records table
ALTER TABLE public.attendance_records 
ADD COLUMN image_url TEXT,
ADD COLUMN status TEXT DEFAULT 'registered',
ADD COLUMN face_descriptor TEXT,
ADD COLUMN confidence NUMERIC,
ADD COLUMN metadata JSONB DEFAULT '{}';

-- Create storage bucket for face images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('face-images', 'face-images', false);

-- Create storage policies for face images bucket
CREATE POLICY "Allow public uploads to face-images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'face-images');

CREATE POLICY "Allow public read from face-images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'face-images');

CREATE POLICY "Allow public updates to face-images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'face-images');

CREATE POLICY "Allow public delete from face-images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'face-images');