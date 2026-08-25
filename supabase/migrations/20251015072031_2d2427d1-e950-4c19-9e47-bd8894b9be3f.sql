-- Create RLS policy to allow public face registrations
-- This allows anyone to register their face without authentication
CREATE POLICY "Allow public face registration"
ON public.attendance_records
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'pending_approval' 
  AND user_id IS NULL
  AND device_info->>'registration' = 'true'
);