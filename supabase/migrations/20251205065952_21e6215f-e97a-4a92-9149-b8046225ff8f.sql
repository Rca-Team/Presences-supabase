-- Fix overly permissive RLS policies

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role::text = _role
  );
END;
$$;

-- 1. attendance_records: Remove public policies, keep authenticated access
DROP POLICY IF EXISTS "Allow public to insert attendance records" ON public.attendance_records;
DROP POLICY IF EXISTS "Allow public to read attendance records" ON public.attendance_records;

-- 2. face_descriptors: Remove public policies, scope delete to owner
DROP POLICY IF EXISTS "Allow public to insert face descriptors" ON public.face_descriptors;
DROP POLICY IF EXISTS "Allow public to read face descriptors" ON public.face_descriptors;
DROP POLICY IF EXISTS "Allow authenticated users to delete face descriptors" ON public.face_descriptors;

-- Create owner-scoped delete policy for face_descriptors
DROP POLICY IF EXISTS "Users can delete own face descriptors" ON public.face_descriptors;
CREATE POLICY "Users can delete own face descriptors" ON public.face_descriptors
FOR DELETE
TO authenticated
USING (user_id::text = auth.uid()::text);

-- Admins can delete any face descriptor
DROP POLICY IF EXISTS "Admins can delete any face descriptor" ON public.face_descriptors;
CREATE POLICY "Admins can delete any face descriptor" ON public.face_descriptors
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. profiles: Restrict viewing to owner or admin only
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Fix admin bootstrap: Allow first admin if none exists
DROP POLICY IF EXISTS "Bootstrap first admin when none exists" ON public.user_roles;
CREATE POLICY "Bootstrap first admin when none exists" ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
  AND auth.uid() = user_id
  AND role = 'admin'
);