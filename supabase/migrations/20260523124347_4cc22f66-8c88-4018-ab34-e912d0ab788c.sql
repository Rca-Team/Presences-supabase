BEGIN;

-- Remove unsafe anonymous/public biometric access
DROP POLICY IF EXISTS "Public registration can create face descriptors" ON public.face_descriptors;
DROP POLICY IF EXISTS "Public can read registration records" ON public.attendance_records;
DROP POLICY IF EXISTS "allow_registration_inserts" ON public.attendance_records;

-- Attendance settings: expose non-sensitive keys broadly, sensitive keys only to admin/principal
DROP POLICY IF EXISTS "attendance_settings_read_authenticated" ON public.attendance_settings;

CREATE POLICY "attendance_settings_read_non_sensitive"
ON public.attendance_settings
FOR SELECT
TO authenticated
USING (
  key <> ALL (ARRAY['twilio_account_sid','twilio_auth_token','twilio_from_number'])
);

CREATE POLICY "attendance_settings_read_sensitive_admin"
ON public.attendance_settings
FOR SELECT
TO authenticated
USING (
  key = ANY (ARRAY['twilio_account_sid','twilio_auth_token','twilio_from_number'])
  AND (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'principal'::app_role)
  )
);

-- Teacher permissions: own row for teacher, full visibility for admin/principal
DROP POLICY IF EXISTS "teacher_permissions_read_authenticated" ON public.teacher_permissions;

CREATE POLICY "teacher_permissions_read_scoped"
ON public.teacher_permissions
FOR SELECT
TO authenticated
USING (
  teacher_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'principal'::app_role)
);

-- Storage hardening for biometric face images
UPDATE storage.buckets
SET public = false
WHERE id = 'face-images';

DROP POLICY IF EXISTS "Public registration can upload face images" ON storage.objects;
DROP POLICY IF EXISTS "Public registration can update face images" ON storage.objects;
DROP POLICY IF EXISTS "Public registration can check face images" ON storage.objects;

CREATE POLICY "Authenticated users can read face images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'face-images'
  AND (
    name LIKE 'faces/students/%'
    OR name LIKE 'faces/batch/%'
    OR name LIKE 'faces/training/%'
  )
);

-- Queue helper functions: lock down execute privileges and set fixed search_path
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

COMMIT;