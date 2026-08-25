-- ==========================================
-- SECURITY FIX: Comprehensive Database Hardening
-- ==========================================

-- 1. CREATE USER ROLES SYSTEM
-- ==========================================
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'parent', 'student'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer functions for role checking (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
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
-- ==========================================
-- SECURITY FIX: Comprehensive Database Hardening
-- ==========================================

-- 1. CREATE USER ROLES SYSTEM
-- ==========================================
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'parent', 'student'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer functions for role checking (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
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
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_role app_role)
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
    WHERE user_id = auth.uid()
    AND role = _role
  );
END;
$$;

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

-- RLS policies for user_roles table - only admins can manage roles
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE
  USING (public.is_admin());

-- 2. SECURE PROFILES TABLE
-- ==========================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow public read access to profiles" ON profiles;
DROP POLICY IF EXISTS "Allow public insert to profiles" ON profiles;
DROP POLICY IF EXISTS "Allow authenticated update to profiles" ON profiles;

-- Create restrictive policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users create own profile on signup" ON profiles;
CREATE POLICY "Users create own profile on signup" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins update all profiles" ON profiles;
CREATE POLICY "Admins update all profiles" ON profiles
  FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins delete profiles" ON profiles;
CREATE POLICY "Admins delete profiles" ON profiles
  FOR DELETE
  USING (public.is_admin());

-- 3. SECURE ATTENDANCE_RECORDS TABLE
-- ==========================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow public read access to attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "Allow authenticated update" ON attendance_records;
DROP POLICY IF EXISTS "Allow authenticated delete" ON attendance_records;

-- Create restrictive policies
DROP POLICY IF EXISTS "Users view own attendance" ON attendance_records;
CREATE POLICY "Users view own attendance" ON attendance_records
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all attendance" ON attendance_records;
CREATE POLICY "Admins view all attendance" ON attendance_records
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update attendance" ON attendance_records;
CREATE POLICY "Admins update attendance" ON attendance_records
  FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins delete attendance" ON attendance_records;
CREATE POLICY "Admins delete attendance" ON attendance_records
  FOR DELETE
  USING (public.is_admin());

-- Keep existing insert policy for registration
-- (already restricted appropriately)

-- 4. SECURE ATTENDANCE_SETTINGS TABLE
-- ==========================================

-- Drop overly permissive read policy
DROP POLICY IF EXISTS "Allow public read access to attendance_settings" ON attendance_settings;
DROP POLICY IF EXISTS "Allow authenticated insert to attendance_settings" ON attendance_settings;
DROP POLICY IF EXISTS "Allow authenticated update to attendance_settings" ON attendance_settings;

-- Create restrictive policies
DROP POLICY IF EXISTS "Admins manage attendance settings" ON attendance_settings;
CREATE POLICY "Admins manage attendance settings" ON attendance_settings
  FOR ALL
  USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users read settings" ON attendance_settings;
CREATE POLICY "Authenticated users read settings" ON attendance_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 5. SECURE STORAGE BUCKET
-- ==========================================

-- Make face-images bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'face-images';

-- Create RLS policies for storage.objects
DROP POLICY IF EXISTS "Authenticated users upload faces" ON storage.objects;
CREATE POLICY "Authenticated users upload faces" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'face-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Admins read all face images" ON storage.objects;
CREATE POLICY "Admins read all face images" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'face-images'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Users read own images" ON storage.objects;
CREATE POLICY "Users read own images" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'face-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Admins delete face images" ON storage.objects;
CREATE POLICY "Admins delete face images" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'face-images'
    AND public.is_admin()
  );

-- 6. CREATE TRIGGER FOR AUTO-PROFILE CREATION
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, display_name, username)
  VALUES (
    gen_random_uuid(),
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();