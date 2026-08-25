-- Fix registration storage access for the public registration flow.
-- Policies are dropped first so rerunning this migration stays safe.

DROP POLICY IF EXISTS "Public registration can upload face images" ON storage.objects;
DROP POLICY IF EXISTS "Public registration can update face images" ON storage.objects;
DROP POLICY IF EXISTS "Public registration can check face images" ON storage.objects;
DROP POLICY IF EXISTS "Public registration can create face descriptors" ON public.face_descriptors;
DROP POLICY IF EXISTS "Public can read registration records" ON public.attendance_records;

CREATE POLICY "Public registration can upload face images"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'face-images'
  AND (
    name LIKE 'faces/students/%'
    OR name LIKE 'faces/batch/%'
    OR name LIKE 'faces/training/%'
  )
);

CREATE POLICY "Public registration can update face images"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'face-images'
  AND (
    name LIKE 'faces/students/%'
    OR name LIKE 'faces/batch/%'
    OR name LIKE 'faces/training/%'
  )
)
WITH CHECK (
  bucket_id = 'face-images'
  AND (
    name LIKE 'faces/students/%'
    OR name LIKE 'faces/batch/%'
    OR name LIKE 'faces/training/%'
  )
);

CREATE POLICY "Public registration can check face images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'face-images'
  AND (
    name LIKE 'faces/students/%'
    OR name LIKE 'faces/batch/%'
    OR name LIKE 'faces/training/%'
  )
);

CREATE POLICY "Public registration can create face descriptors"
ON public.face_descriptors
FOR INSERT
TO anon, authenticated
WITH CHECK (
  user_id IS NOT NULL
  AND descriptor IS NOT NULL
);

CREATE POLICY "Public can read registration records"
ON public.attendance_records
FOR SELECT
TO anon, authenticated
USING (
  status = 'registered'
  AND (device_info->>'registration') = 'true'
);