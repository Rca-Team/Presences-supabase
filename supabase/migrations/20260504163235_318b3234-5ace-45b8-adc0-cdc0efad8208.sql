CREATE POLICY "allow_registration_inserts"
ON public.attendance_records
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'registered'
  AND (device_info->>'registration') = 'true'
);