
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;
-- Harden attendance-training-faces bucket policies
DROP POLICY IF EXISTS "Attendance training - uploader can upload" ON storage.objects;
DROP POLICY IF EXISTS "Attendance training - uploader can update" ON storage.objects;
DROP POLICY IF EXISTS "Attendance training - uploader can delete" ON storage.objects;

DROP POLICY IF EXISTS "Attendance training - staff uploader can upload" ON storage.objects;
CREATE POLICY "Attendance training - staff uploader can upload" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

DROP POLICY IF EXISTS "Attendance training - staff uploader can update" ON storage.objects;
CREATE POLICY "Attendance training - staff uploader can update" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
)
WITH CHECK (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

DROP POLICY IF EXISTS "Attendance training - staff uploader can delete" ON storage.objects;
CREATE POLICY "Attendance training - staff uploader can delete" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attendance-training-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

-- Harden student-registration-faces bucket policies
DROP POLICY IF EXISTS "Registration faces - owner can upload" ON storage.objects;
DROP POLICY IF EXISTS "Registration faces - owner can update" ON storage.objects;
DROP POLICY IF EXISTS "Registration faces - owner can delete" ON storage.objects;

DROP POLICY IF EXISTS "Registration faces - staff owner can upload" ON storage.objects;
CREATE POLICY "Registration faces - staff owner can upload" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

DROP POLICY IF EXISTS "Registration faces - staff owner can update" ON storage.objects;
CREATE POLICY "Registration faces - staff owner can update" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
)
WITH CHECK (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

DROP POLICY IF EXISTS "Registration faces - staff owner can delete" ON storage.objects;
CREATE POLICY "Registration faces - staff owner can delete" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'student-registration-faces'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);