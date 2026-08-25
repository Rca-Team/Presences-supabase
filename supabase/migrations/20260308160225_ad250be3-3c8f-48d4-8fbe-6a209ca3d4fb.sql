
-- Subjects table
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage subjects" ON public.subjects FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view subjects" ON public.subjects FOR SELECT TO authenticated USING (true);

-- Class teacher assignments
CREATE TABLE public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  teacher_record_id text NOT NULL,
  teacher_name text NOT NULL,
  role text NOT NULL DEFAULT 'class_teacher',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage class teachers" ON public.class_teachers FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view class teachers" ON public.class_teachers FOR SELECT TO authenticated USING (true);

-- Period timings configuration
CREATE TABLE public.period_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_number integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_break boolean NOT NULL DEFAULT false,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_number)
);
ALTER TABLE public.period_timings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage period timings" ON public.period_timings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view period timings" ON public.period_timings FOR SELECT TO authenticated USING (true);

-- Timetable entries
CREATE TABLE public.timetable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  period_number integer NOT NULL CHECK (period_number BETWEEN 1 AND 8),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_record_id text NOT NULL,
  teacher_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category, day_of_week, period_number)
);
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage timetable" ON public.timetable FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view timetable" ON public.timetable FOR SELECT TO authenticated USING (true);

-- Substitutions
CREATE TABLE public.substitutions (
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
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage substitutions" ON public.substitutions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view substitutions" ON public.substitutions FOR SELECT TO authenticated USING (true);

-- Insert default period timings (8 periods)
INSERT INTO public.period_timings (period_number, start_time, end_time, is_break, label) VALUES
  (1, '08:00', '08:45', false, 'Period 1'),
  (2, '08:45', '09:30', false, 'Period 2'),
  (3, '09:30', '10:15', false, 'Period 3'),
  (4, '10:15', '10:30', true, 'Break'),
  (5, '10:30', '11:15', false, 'Period 4'),
  (6, '11:15', '12:00', false, 'Period 5'),
  (7, '12:00', '12:45', false, 'Period 6'),
  (8, '12:45', '13:00', true, 'Lunch'),
  (9, '13:00', '13:45', false, 'Period 7'),
  (10, '13:45', '14:30', false, 'Period 8');
