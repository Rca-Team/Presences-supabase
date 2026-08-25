-- Fix infinite recursion in users table policies and secure attendance_records

-- First, create a security definer function to get user role safely
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT role FROM public.users WHERE id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop existing problematic policies on users table
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;

-- Create new safe policies for users table
CREATE POLICY "Users can view their own data" 
ON public.users 
FOR SELECT 
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" 
ON public.users 
FOR SELECT 
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin');

-- Now fix the attendance_records table security
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all operations on attendance_records" ON public.attendance_records;

-- Create proper RLS policies for attendance_records
CREATE POLICY "Users can view their own attendance records" 
ON public.attendance_records 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all attendance records" 
ON public.attendance_records 
FOR SELECT 
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can insert their own attendance records" 
ON public.attendance_records 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can insert any attendance records" 
ON public.attendance_records 
FOR INSERT 
TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can update their own attendance records" 
ON public.attendance_records 
FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update any attendance records" 
ON public.attendance_records 
FOR UPDATE 
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can delete their own attendance records" 
ON public.attendance_records 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any attendance records" 
ON public.attendance_records 
FOR DELETE 
TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin');