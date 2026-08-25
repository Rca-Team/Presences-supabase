-- Create storage bucket for face images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'face-images',
  'face-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public uploads to face-images bucket
CREATE POLICY "Allow public uploads to face-images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'face-images');

-- Allow public reads from face-images bucket
CREATE POLICY "Allow public reads from face-images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'face-images');

-- Drop existing policy if it exists to recreate it correctly
DROP POLICY IF EXISTS "Allow public face registration" ON public.attendance_records;

-- Recreate the RLS policy to allow public face registrations
CREATE POLICY "Allow public face registration"
ON public.attendance_records
FOR INSERT
TO anon, authenticated
WITH CHECK (
  user_id IS NULL
  AND status = 'pending_approval'
  AND (device_info->>'registration')::text = 'true'
);