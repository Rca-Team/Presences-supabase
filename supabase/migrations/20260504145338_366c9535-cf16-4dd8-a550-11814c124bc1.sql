-- Create organized buckets for face model data
insert into storage.buckets (id, name, public)
values
  ('student-registration-faces', 'student-registration-faces', false),
  ('attendance-training-faces', 'attendance-training-faces', false)
on conflict (id) do nothing;

-- Registration faces: authenticated users can upload/view files under their own root folder
-- Path convention: <auth.uid()>/class-<class>/section-<section>/student-<roll_or_id>/<timestamp>-<label>.jpg
DROP POLICY IF EXISTS "Registration faces - owner can upload" ON storage.objects;
CREATE POLICY "Registration faces - owner can upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Registration faces - owner can view" ON storage.objects;
CREATE POLICY "Registration faces - owner can view"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Registration faces - owner can update" ON storage.objects;
CREATE POLICY "Registration faces - owner can update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Registration faces - owner can delete" ON storage.objects;
CREATE POLICY "Registration faces - owner can delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Attendance training faces: authenticated users can upload/view files under their own root folder
-- Path convention: <auth.uid()>/date-YYYY-MM-DD/mode-<qr|ai|gate>/student-<roll_or_id>/<timestamp>-<status>.jpg
DROP POLICY IF EXISTS "Attendance training - uploader can upload" ON storage.objects;
CREATE POLICY "Attendance training - uploader can upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Attendance training - uploader can view" ON storage.objects;
CREATE POLICY "Attendance training - uploader can view"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Attendance training - uploader can update" ON storage.objects;
CREATE POLICY "Attendance training - uploader can update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Attendance training - uploader can delete" ON storage.objects;
CREATE POLICY "Attendance training - uploader can delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
);