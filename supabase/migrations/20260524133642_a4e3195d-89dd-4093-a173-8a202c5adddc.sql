-- Restrict face-images bucket to authorized staff roles only
DROP POLICY IF EXISTS "Authenticated users can read face images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload face images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update face images" ON storage.objects;

CREATE POLICY "Staff can read face images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'principal'::app_role)
    OR private.has_role(auth.uid(), 'teacher'::app_role)
  )
);

CREATE POLICY "Staff can upload face images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'principal'::app_role)
    OR private.has_role(auth.uid(), 'teacher'::app_role)
  )
);

CREATE POLICY "Staff can update face images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'principal'::app_role)
    OR private.has_role(auth.uid(), 'teacher'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'principal'::app_role)
    OR private.has_role(auth.uid(), 'teacher'::app_role)
  )
);

CREATE POLICY "Staff can delete face images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'face-images'
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'principal'::app_role)
    OR private.has_role(auth.uid(), 'teacher'::app_role)
  )
);

-- Realtime policies: protect sensitive topics while keeping other topics available
DROP POLICY IF EXISTS "Authenticated can receive non-sensitive realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Staff can receive sensitive attendance realtime topics" ON realtime.messages;

CREATE POLICY "Authenticated can receive non-sensitive realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  COALESCE(realtime.topic(), '') = ''
  OR split_part(realtime.topic(), ':', 3) NOT IN ('attendance_records', 'gate_entries', 'student_badges')
);

CREATE POLICY "Staff can receive sensitive attendance realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  split_part(realtime.topic(), ':', 3) IN ('attendance_records', 'gate_entries', 'student_badges')
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'principal'::app_role)
    OR private.has_role(auth.uid(), 'teacher'::app_role)
  )
);