
-- Gate sessions (when gate mode is active)
CREATE TABLE public.gate_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_name text NOT NULL DEFAULT 'Main Gate',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_entries integer DEFAULT 0,
  unknown_entries integer DEFAULT 0,
  device_info jsonb,
  started_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gate_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage gate sessions" ON public.gate_sessions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can manage gate sessions" ON public.gate_sessions FOR ALL TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- Gate entries (every individual scan)
CREATE TABLE public.gate_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  gate_session_id uuid REFERENCES public.gate_sessions(id) ON DELETE CASCADE,
  entry_time timestamptz NOT NULL DEFAULT now(),
  entry_type text NOT NULL DEFAULT 'entry',
  photo_url text,
  is_recognized boolean DEFAULT false,
  confidence real,
  gate_name text DEFAULT 'Main Gate',
  student_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gate_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage gate entries" ON public.gate_entries FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can insert gate entries" ON public.gate_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can view own gate entries" ON public.gate_entries FOR SELECT TO authenticated USING (auth.uid() = student_id);

-- Late entries with reason
CREATE TABLE public.late_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  student_name text,
  entry_time timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'other',
  reason_detail text,
  parent_notified boolean DEFAULT false,
  photo_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.late_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage late entries" ON public.late_entries FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can insert late entries" ON public.late_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can view own late entries" ON public.late_entries FOR SELECT TO authenticated USING (auth.uid() = student_id);

-- Indian school holidays
CREATE TABLE public.school_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_hindi text,
  holiday_date date NOT NULL,
  holiday_type text NOT NULL DEFAULT 'national',
  state text DEFAULT 'all',
  is_half_day boolean DEFAULT false,
  academic_year text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage holidays" ON public.school_holidays FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view holidays" ON public.school_holidays FOR SELECT TO authenticated USING (true);

-- Circulars / diary system
CREATE TABLE public.circulars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid,
  target_categories text[] DEFAULT '{}',
  sent_at timestamptz,
  acknowledgments_count integer DEFAULT 0,
  circular_type text DEFAULT 'general',
  is_urgent boolean DEFAULT false,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.circulars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage circulars" ON public.circulars FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Everyone can view circulars" ON public.circulars FOR SELECT TO authenticated USING (true);

-- Notification log for SMS/WhatsApp tracking
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone text,
  recipient_id uuid,
  message_template text,
  message_content text,
  language text DEFAULT 'en',
  status text DEFAULT 'pending',
  gateway_response jsonb,
  notification_type text DEFAULT 'sms',
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage notification logs" ON public.notification_log FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "System can insert notification logs" ON public.notification_log FOR INSERT TO authenticated WITH CHECK (true);

-- Multi-gate configuration
CREATE TABLE public.school_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  camera_id text,
  is_active boolean DEFAULT true,
  gate_type text DEFAULT 'main',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_gates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage gates" ON public.school_gates FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view gates" ON public.school_gates FOR SELECT TO authenticated USING (true);
