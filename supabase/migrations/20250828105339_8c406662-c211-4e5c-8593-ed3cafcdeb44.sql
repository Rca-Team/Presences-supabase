-- Create storage bucket for face images
INSERT INTO storage.buckets (id, name, public) VALUES ('face-images', 'face-images', true);

-- Create storage policies for face images
CREATE POLICY "Face images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'face-images');

CREATE POLICY "Anyone can upload face images during registration" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'face-images');

-- Add policy to allow registration records without authentication
CREATE POLICY "Allow registration records" 
ON attendance_records 
FOR INSERT 
WITH CHECK (status = 'registered');