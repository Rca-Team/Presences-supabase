-- Fix RLS policy for attendance recording
-- Drop the restrictive insert policy and create a new one that allows authenticated users to insert their own attendance

DROP POLICY IF EXISTS "Allow public insert for registration" ON public.attendance_records;

-- Allow authenticated users to insert their own attendance records
CREATE POLICY "Users can insert own attendance"
ON public.attendance_records
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow public (anon) to insert records with null user_id or pending_approval status (for registration flow)
CREATE POLICY "Public can insert for registration"
ON public.attendance_records
FOR INSERT
TO anon
WITH CHECK (
  (user_id IS NULL) OR 
  (status = 'pending_approval'::text) OR 
  (((device_info ->> 'registration'::text))::boolean = true)
);