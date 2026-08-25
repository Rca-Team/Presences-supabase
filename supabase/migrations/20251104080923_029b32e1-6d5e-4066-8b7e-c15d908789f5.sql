-- Allow admins to create profiles for any user
CREATE POLICY "Admins can create profiles for users"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Also ensure admins can view all profiles (if not already present)
-- This policy may already exist but adding it ensures completeness
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' 
    AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles" 
    ON public.profiles 
    FOR SELECT 
    USING (is_admin());
  END IF;
END $$;