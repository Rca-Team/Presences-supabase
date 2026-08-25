-- Create storage bucket for face images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('face-images', 'face-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for face-images bucket
CREATE POLICY "Anyone can view face images"
ON storage.objects FOR SELECT
USING (bucket_id = 'face-images');

CREATE POLICY "Authenticated users can upload face images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'face-images' AND auth.role() = 'authenticated');

CREATE POLICY "Admins can delete face images"
ON storage.objects FOR DELETE
USING (bucket_id = 'face-images' AND EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

-- Remove the foreign key constraint on attendance_records.user_id
-- This allows registering faces for people who don't have auth accounts
ALTER TABLE public.attendance_records DROP CONSTRAINT IF EXISTS attendance_records_user_id_fkey;