# Complete Consolidated Schema for Presences-AI Self-Hosted Supabase

-- 1. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Core Security & Role Helper Functions
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

-- 3. Profiles Table (Students, Teachers, Admins)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  full_name TEXT,
  display_name TEXT,
  username TEXT,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'student',
  class TEXT,
  section TEXT,
  roll_number TEXT,
  admission_number TEXT,
  employee_id TEXT,
  category TEXT DEFAULT 'student',
  department TEXT,
  gender TEXT,
  date_of_birth TEXT,
  blood_group TEXT,
  house TEXT,
  bus_route TEXT,
  father_name TEXT,
  mother_name TEXT,
  parent_name TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  emergency_contact TEXT,
  relationship TEXT,
  address TEXT,
  avatar_url TEXT,
  photo_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. User Roles Table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- 5. Face Descriptors Table (Biometric Embeddings)
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
  category TEXT DEFAULT 'student',
  quality NUMERIC,
  image_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Attendance Records Table
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  student_id TEXT,
  student_name TEXT,
  class TEXT,
  section TEXT,
  roll_number TEXT,
  category TEXT DEFAULT 'student',
  status TEXT DEFAULT 'present',
  timestamp TIMESTAMPTZ DEFAULT now(),
  image_url TEXT,
  confidence NUMERIC,
  mode TEXT DEFAULT 'gate',
  gate_name TEXT,
  device_info JSONB DEFAULT '{}'::jsonb,
  is_verified BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Attendance Settings Table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cutoff_hour INT DEFAULT 9,
  cutoff_minute INT DEFAULT 0,
  cooldown_seconds INT DEFAULT 60,
  min_face_size INT DEFAULT 60,
  match_threshold NUMERIC DEFAULT 0.42,
  ambiguity_ratio NUMERIC DEFAULT 0.82,
  consensus_frames INT DEFAULT 3,
  gate_name TEXT DEFAULT 'Main Gate',
  enable_sound BOOLEAN DEFAULT true,
  enable_email_alerts BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Timetable & Schedule Tables
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class TEXT NOT NULL,
  section TEXT NOT NULL,
  day_of_week INT NOT NULL, -- 1 = Monday, 6 = Saturday
  period_number INT NOT NULL,
  subject TEXT NOT NULL,
  teacher_name TEXT,
  room_number TEXT,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Emergency Events & System Notifications
CREATE TABLE IF NOT EXISTS public.emergency_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'warning',
  broadcast_scope TEXT DEFAULT 'all',
  sender_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.system_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Device Tokens Table (Push Notifications)
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  token TEXT NOT NULL UNIQUE,
  device_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Storage Setup for Face Images and Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('face-images', 'face-images', true),
  ('avatars', 'avatars', true),
  ('attendance-snapshots', 'attendance-snapshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies
CREATE POLICY "Public Read Access on face-images"
  ON storage.objects FOR SELECT USING (bucket_id = 'face-images');

CREATE POLICY "Public Insert Access on face-images"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'face-images');

CREATE POLICY "Public Update Access on face-images"
  ON storage.objects FOR UPDATE USING (bucket_id = 'face-images');

CREATE POLICY "Public Delete Access on face-images"
  ON storage.objects FOR DELETE USING (bucket_id = 'face-images');

CREATE POLICY "Public Read Access on avatars"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Public Insert Access on avatars"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Public Read Access on attendance-snapshots"
  ON storage.objects FOR SELECT USING (bucket_id = 'attendance-snapshots');

CREATE POLICY "Public Insert Access on attendance-snapshots"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attendance-snapshots');

-- 12. Create Indexes for High-Speed Performance
CREATE INDEX IF NOT EXISTS idx_attendance_records_timestamp ON public.attendance_records (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON public.attendance_records (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_class_section ON public.attendance_records (class, section);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_roll_admission ON public.profiles (roll_number, admission_number);
CREATE INDEX IF NOT EXISTS idx_face_descriptors_student_id ON public.face_descriptors (student_id);

-- 13. Enable Row Level Security (RLS) with permissive fallback
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_descriptors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Permissive Read/Write policies for authenticated & anon clients
CREATE POLICY "Allow public read on profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert on profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on profiles" ON public.profiles FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on profiles" ON public.profiles FOR DELETE USING (true);

CREATE POLICY "Allow public read on face_descriptors" ON public.face_descriptors FOR SELECT USING (true);
CREATE POLICY "Allow public insert on face_descriptors" ON public.face_descriptors FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on face_descriptors" ON public.face_descriptors FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on face_descriptors" ON public.face_descriptors FOR DELETE USING (true);

CREATE POLICY "Allow public read on attendance_records" ON public.attendance_records FOR SELECT USING (true);
CREATE POLICY "Allow public insert on attendance_records" ON public.attendance_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on attendance_records" ON public.attendance_records FOR UPDATE USING (true);

CREATE POLICY "Allow public read on attendance_settings" ON public.attendance_settings FOR SELECT USING (true);
CREATE POLICY "Allow public all on attendance_settings" ON public.attendance_settings FOR ALL USING (true);

CREATE POLICY "Allow public read on timetable_slots" ON public.timetable_slots FOR SELECT USING (true);
CREATE POLICY "Allow public all on timetable_slots" ON public.timetable_slots FOR ALL USING (true);

CREATE POLICY "Allow public read on emergency_events" ON public.emergency_events FOR SELECT USING (true);
CREATE POLICY "Allow public all on emergency_events" ON public.emergency_events FOR ALL USING (true);

CREATE POLICY "Allow public read on system_notifications" ON public.system_notifications FOR SELECT USING (true);
CREATE POLICY "Allow public all on system_notifications" ON public.system_notifications FOR ALL USING (true);

CREATE POLICY "Allow public all on device_tokens" ON public.device_tokens FOR ALL USING (true);
CREATE POLICY "Allow public read on user_roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "Allow public all on user_roles" ON public.user_roles FOR ALL USING (true);

-- 14. Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_notifications;
