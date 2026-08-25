CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;

-- Subjects table
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS short_name text;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;
CREATE POLICY "Admins can manage subjects" ON public.subjects FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Everyone can view subjects" ON public.subjects;
CREATE POLICY "Everyone can view subjects" ON public.subjects FOR SELECT TO authenticated USING (true);

-- Class teacher assignments
CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  teacher_record_id text NOT NULL,
  teacher_name text NOT NULL,
  role text NOT NULL DEFAULT 'class_teacher',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.class_teachers ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.class_teachers ADD COLUMN IF NOT EXISTS teacher_record_id text;
ALTER TABLE public.class_teachers ADD COLUMN IF NOT EXISTS teacher_name text;
ALTER TABLE public.class_teachers ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.class_teachers ADD COLUMN IF NOT EXISTS subject_id uuid;

ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage class teachers" ON public.class_teachers;
CREATE POLICY "Admins can manage class teachers" ON public.class_teachers FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Everyone can view class teachers" ON public.class_teachers;
CREATE POLICY "Everyone can view class teachers" ON public.class_teachers FOR SELECT TO authenticated USING (true);

-- Period timings configuration
CREATE TABLE IF NOT EXISTS public.period_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_number integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_break boolean NOT NULL DEFAULT false,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.period_timings ADD COLUMN IF NOT EXISTS period_number integer;
ALTER TABLE public.period_timings ADD COLUMN IF NOT EXISTS period_name text;
ALTER TABLE public.period_timings ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE public.period_timings ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE public.period_timings ADD COLUMN IF NOT EXISTS is_break boolean DEFAULT false;
ALTER TABLE public.period_timings ADD COLUMN IF NOT EXISTS label text;

DO $$ BEGIN
  ALTER TABLE public.period_timings ALTER COLUMN period_name DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE public.period_timings ADD CONSTRAINT period_timings_period_number_key UNIQUE (period_number);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null;
END $$;

ALTER TABLE public.period_timings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage period timings" ON public.period_timings;
CREATE POLICY "Admins can manage period timings" ON public.period_timings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Everyone can view period timings" ON public.period_timings;
CREATE POLICY "Everyone can view period timings" ON public.period_timings FOR SELECT TO authenticated USING (true);

-- Timetable entries
CREATE TABLE IF NOT EXISTS public.timetable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  period_number integer NOT NULL CHECK (period_number BETWEEN 1 AND 8),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_record_id text NOT NULL,
  teacher_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS day_of_week integer;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS period_number integer;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS subject_id uuid;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS teacher_record_id text;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS teacher_name text;

ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage timetable" ON public.timetable;
CREATE POLICY "Admins can manage timetable" ON public.timetable FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Everyone can view timetable" ON public.timetable;
CREATE POLICY "Everyone can view timetable" ON public.timetable FOR SELECT TO authenticated USING (true);

-- Substitutions
CREATE TABLE IF NOT EXISTS public.substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  category text NOT NULL,
  period_number integer NOT NULL,
  absent_teacher_id text NOT NULL,
  absent_teacher_name text NOT NULL,
  substitute_teacher_id text NOT NULL,
  substitute_teacher_name text NOT NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned',
  auto_assigned boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS date date;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS period_number integer;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS absent_teacher_id text;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS absent_teacher_name text;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS substitute_teacher_id text;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS substitute_teacher_name text;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS subject_id uuid;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.substitutions ADD COLUMN IF NOT EXISTS auto_assigned boolean;

ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage substitutions" ON public.substitutions;
CREATE POLICY "Admins can manage substitutions" ON public.substitutions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Everyone can view substitutions" ON public.substitutions;
CREATE POLICY "Everyone can view substitutions" ON public.substitutions FOR SELECT TO authenticated USING (true);

-- Insert default period timings safely
INSERT INTO public.period_timings (period_number, period_name, start_time, end_time, is_break, label)
SELECT v.period_number, v.label, v.start_time::time, v.end_time::time, v.is_break, v.label
FROM (VALUES
  (1, '08:00', '08:45', false, 'Period 1'),
  (2, '08:45', '09:30', false, 'Period 2'),
  (3, '09:30', '10:15', false, 'Period 3'),
  (4, '10:15', '10:30', true, 'Break'),
  (5, '10:30', '11:15', false, 'Period 4'),
  (6, '11:15', '12:00', false, 'Period 5'),
  (7, '12:00', '12:45', false, 'Period 6'),
  (8, '12:45', '13:00', true, 'Lunch'),
  (9, '13:00', '13:45', false, 'Period 7'),
  (10, '13:45', '14:30', false, 'Period 8')
) AS v(period_number, start_time, end_time, is_break, label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.period_timings pt WHERE pt.period_number = v.period_number
);
