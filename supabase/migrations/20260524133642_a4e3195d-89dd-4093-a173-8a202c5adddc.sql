
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;
-- Restrict face-images bucket to authorized staff roles only
DROP POLICY IF EXISTS "Authenticated users can read face images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload face images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update face images" ON storage.objects;

DROP POLICY IF EXISTS "Staff can read face images" ON storage.objects;
CREATE POLICY "Staff can read face images" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

DROP POLICY IF EXISTS "Staff can upload face images" ON storage.objects;
CREATE POLICY "Staff can upload face images" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

DROP POLICY IF EXISTS "Staff can update face images" ON storage.objects;
CREATE POLICY "Staff can update face images" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
)
WITH CHECK (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

DROP POLICY IF EXISTS "Staff can delete face images" ON storage.objects;
CREATE POLICY "Staff can delete face images" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);

-- Realtime policies: protect sensitive topics while keeping other topics available
DROP POLICY IF EXISTS "Authenticated can receive non-sensitive realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Staff can receive sensitive attendance realtime topics" ON realtime.messages;

DROP POLICY IF EXISTS "Authenticated can receive non-sensitive realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can receive non-sensitive realtime topics" ON realtime.messages
FOR SELECT
TO authenticated
USING (
  COALESCE(realtime.topic(), '') = ''
  OR split_part(realtime.topic(), ':', 3) NOT IN ('attendance_records', 'gate_entries', 'student_badges')
);

DROP POLICY IF EXISTS "Staff can receive sensitive attendance realtime topics" ON realtime.messages;
CREATE POLICY "Staff can receive sensitive attendance realtime topics" ON realtime.messages
FOR SELECT
TO authenticated
USING (
  split_part(realtime.topic(), ':', 3) IN ('attendance_records', 'gate_entries', 'student_badges')
  AND (
    private.has_role(auth.uid(), 'admin')
    OR private.has_role(auth.uid(), 'principal')
    OR private.has_role(auth.uid(), 'teacher')
  )
);