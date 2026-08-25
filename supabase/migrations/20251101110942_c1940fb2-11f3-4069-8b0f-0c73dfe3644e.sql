-- Fix attendance recording RLS policy
-- Drop the restrictive policy that prevents marking attendance for others
DROP POLICY IF EXISTS "Users can insert own attendance" ON attendance_records;

-- Create a new policy that allows authenticated users to mark attendance for anyone
CREATE POLICY "Authenticated users can mark attendance"
ON attendance_records
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Keep the public registration policy
-- (already exists: "Public can insert for registration")