-- Complete schema sync ensuring all columns, types, and RPC functions exist for Presences-AI

-- 1. Helper functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role
  );
END;
$$;

-- 2. Ensure all columns in profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admission_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bus_route TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS house TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mother_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS relationship TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roll_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- 3. Ensure all columns in face_descriptors
CREATE TABLE IF NOT EXISTS public.face_descriptors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  descriptor JSONB,
  descriptors JSONB,
  label TEXT,
  student_name TEXT,
  student_id TEXT,
  class TEXT,
  section TEXT,
  category TEXT,
  quality NUMERIC,
  image_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS descriptor JSONB;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS descriptors JSONB;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS quality NUMERIC;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.face_descriptors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 4. Ensure all columns in attendance_records
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  student_id TEXT,
  student_name TEXT,
  class TEXT,
  section TEXT,
  roll_number TEXT,
  category TEXT,
  status TEXT DEFAULT 'present',
  timestamp TIMESTAMPTZ DEFAULT now(),
  image_url TEXT,
  face_descriptor JSONB,
  confidence NUMERIC,
  confidence_score NUMERIC,
  device_info JSONB DEFAULT '{}'::jsonb,
  capture_mode TEXT,
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS roll_number TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present';
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS face_descriptor JSONB;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS confidence NUMERIC;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS confidence_score NUMERIC;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS capture_mode TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 5. Ensure all columns in gate_entries
CREATE TABLE IF NOT EXISTS public.gate_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  student_id TEXT,
  student_name TEXT,
  class TEXT,
  section TEXT,
  roll_number TEXT,
  category TEXT,
  gate_name TEXT,
  entry_time TIMESTAMPTZ DEFAULT now(),
  exit_time TIMESTAMPTZ,
  is_recognized BOOLEAN DEFAULT false,
  confidence_score DOUBLE PRECISION,
  snapshot_url TEXT,
  status TEXT DEFAULT 'entered',
  device_info JSONB DEFAULT '{}'::jsonb,
  capture_mode TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS roll_number TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS gate_name TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS entry_time TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS exit_time TIMESTAMPTZ;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS is_recognized BOOLEAN DEFAULT false;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS confidence_score DOUBLE PRECISION;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS snapshot_url TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'entered';
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS capture_mode TEXT;
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 6. Ensure all columns in late_entries
CREATE TABLE IF NOT EXISTS public.late_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  student_id TEXT,
  student_name TEXT,
  class TEXT,
  section TEXT,
  roll_number TEXT,
  category TEXT,
  gate_name TEXT,
  entry_time TIMESTAMPTZ DEFAULT now(),
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS student_id TEXT;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS roll_number TEXT;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS gate_name TEXT;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS entry_time TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.late_entries ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 7. Ensure RLS is enabled and policies are permissive for authenticated and registration flows
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_descriptors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.late_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_profiles_authenticated" ON public.profiles;
CREATE POLICY "allow_all_profiles_authenticated" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_face_descriptors_authenticated" ON public.face_descriptors;
CREATE POLICY "allow_all_face_descriptors_authenticated" ON public.face_descriptors FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_attendance_records_authenticated" ON public.attendance_records;
CREATE POLICY "allow_all_attendance_records_authenticated" ON public.attendance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_gate_entries_authenticated" ON public.gate_entries;
CREATE POLICY "allow_all_gate_entries_authenticated" ON public.gate_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_late_entries_authenticated" ON public.late_entries;
CREATE POLICY "allow_all_late_entries_authenticated" ON public.late_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public/anon policies for registration flows
DROP POLICY IF EXISTS "allow_anon_face_descriptors_registration" ON public.face_descriptors;
CREATE POLICY "allow_anon_face_descriptors_registration" ON public.face_descriptors FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "allow_anon_face_descriptors_select" ON public.face_descriptors;
CREATE POLICY "allow_anon_face_descriptors_select" ON public.face_descriptors FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "allow_anon_attendance_records_insert" ON public.attendance_records;
CREATE POLICY "allow_anon_attendance_records_insert" ON public.attendance_records FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "allow_anon_attendance_records_select" ON public.attendance_records;
CREATE POLICY "allow_anon_attendance_records_select" ON public.attendance_records FOR SELECT TO anon USING (true);

-- 8. RPC: face_samples_diagnostics
DROP FUNCTION IF EXISTS public.face_samples_diagnostics();
CREATE OR REPLACE FUNCTION public.face_samples_diagnostics()
RETURNS TABLE (
  active_students bigint,
  descriptor_rows bigint,
  orphan_descriptors bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active bigint := 0;
  v_total bigint := 0;
  v_orphans bigint := 0;
BEGIN
  SELECT COUNT(DISTINCT user_id)
  FROM public.attendance_records
  WHERE user_id IS NOT NULL
    AND COALESCE(status, '') <> 'unauthorized'
  INTO v_active;

  SELECT COUNT(*) FROM public.face_descriptors INTO v_total;

  SELECT COUNT(*) FROM public.face_descriptors fd
  WHERE fd.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.attendance_records ar
      WHERE ar.user_id = fd.user_id
        AND COALESCE(ar.status, '') <> 'unauthorized'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.user_id = fd.user_id
    )
  INTO v_orphans;

  active_students := v_active;
  descriptor_rows := v_total;
  orphan_descriptors := v_orphans;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.face_samples_diagnostics() TO authenticated, anon, service_role;

-- 9. Storage Buckets and policies for face images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'face-images',
  'face-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('student-registration-faces', 'student-registration-faces', true),
  ('attendance-training-faces', 'attendance-training-faces', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Allow public read from face-images" ON storage.objects;
CREATE POLICY "Allow public read from face-images" ON storage.objects FOR SELECT USING (bucket_id IN ('face-images', 'student-registration-faces', 'attendance-training-faces'));

DROP POLICY IF EXISTS "Allow public uploads to face-images" ON storage.objects;
CREATE POLICY "Allow public uploads to face-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id IN ('face-images', 'student-registration-faces', 'attendance-training-faces'));

DROP POLICY IF EXISTS "Allow public updates to face-images" ON storage.objects;
CREATE POLICY "Allow public updates to face-images" ON storage.objects FOR UPDATE USING (bucket_id IN ('face-images', 'student-registration-faces', 'attendance-training-faces'));

DROP POLICY IF EXISTS "Allow public delete from face-images" ON storage.objects;
CREATE POLICY "Allow public delete from face-images" ON storage.objects FOR DELETE USING (bucket_id IN ('face-images', 'student-registration-faces', 'attendance-training-faces'));
