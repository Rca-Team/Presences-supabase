
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;
-- Phase 2-4: Complete Database Schema for School Attendance System

-- Visitor Management System
CREATE TABLE IF NOT EXISTS public.visitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  photo_url TEXT,
  face_descriptor JSONB,
  purpose TEXT NOT NULL,
  visiting_student_id UUID,
  approved_by UUID,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE,
  badge_code TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'checked_in', 'checked_out', 'denied')),
  check_in_time TIMESTAMP WITH TIME ZONE,
  check_out_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bus Events Tracking
CREATE TABLE IF NOT EXISTS public.buses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bus_number TEXT NOT NULL UNIQUE,
  driver_name TEXT,
  driver_phone TEXT,
  route_name TEXT,
  capacity INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bus_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  bus_id UUID REFERENCES public.buses(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('board', 'alight', 'missed')),
  location TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_by TEXT DEFAULT 'face_recognition',
  parent_notified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Campus Zone Tracking
CREATE TABLE IF NOT EXISTS public.campus_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  zone_type TEXT CHECK (zone_type IN ('classroom', 'library', 'cafeteria', 'playground', 'lab', 'office', 'restricted', 'entrance', 'exit')),
  is_restricted BOOLEAN DEFAULT false,
  allowed_categories TEXT[],
  camera_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.zone_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  zone_id UUID REFERENCES public.campus_zones(id),
  entry_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  exit_time TIMESTAMP WITH TIME ZONE,
  is_authorized BOOLEAN DEFAULT true,
  alert_triggered BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI Attendance Predictions
CREATE TABLE IF NOT EXISTS public.attendance_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  predicted_date DATE NOT NULL,
  probability REAL NOT NULL CHECK (probability >= 0 AND probability <= 1),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  factors JSONB,
  notification_sent BOOLEAN DEFAULT false,
  actual_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Student Wellness Scores
CREATE TABLE IF NOT EXISTS public.wellness_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  score_date DATE NOT NULL,
  attendance_score REAL DEFAULT 0,
  punctuality_score REAL DEFAULT 0,
  emotion_score REAL DEFAULT 0,
  overall_score REAL DEFAULT 0,
  trend TEXT CHECK (trend IN ('improving', 'stable', 'declining')),
  intervention_needed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, score_date)
);

-- Gamification System
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  points INTEGER DEFAULT 0,
  criteria JSONB,
  badge_type TEXT CHECK (badge_type IN ('attendance', 'punctuality', 'streak', 'special', 'class')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  badge_id UUID REFERENCES public.badges(id),
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, badge_id, month_year)
);

CREATE TABLE IF NOT EXISTS public.attendance_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.class_leaderboard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  month_year TEXT NOT NULL,
  total_points INTEGER DEFAULT 0,
  average_attendance REAL DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category, month_year)
);

-- Emergency/Panic System
CREATE TABLE IF NOT EXISTS public.emergency_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('lockdown', 'evacuation', 'medical', 'fire', 'other')),
  triggered_by UUID,
  trigger_method TEXT CHECK (trigger_method IN ('voice', 'button', 'auto')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'false_alarm')),
  location TEXT,
  notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.emergency_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  emergency_id UUID REFERENCES public.emergency_events(id),
  responder_id UUID NOT NULL,
  response_type TEXT,
  response_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zone_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Visitors
DROP POLICY IF EXISTS "Admins can manage visitors" ON public.visitors;
CREATE POLICY "Admins can manage visitors" ON public.visitors FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Authenticated users can view visitors" ON public.visitors;
CREATE POLICY "Authenticated users can view visitors" ON public.visitors FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS Policies for Buses
DROP POLICY IF EXISTS "Admins can manage buses" ON public.buses;
CREATE POLICY "Admins can manage buses" ON public.buses FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Authenticated users can view buses" ON public.buses;
CREATE POLICY "Authenticated users can view buses" ON public.buses FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS Policies for Bus Events
DROP POLICY IF EXISTS "Admins can manage bus events" ON public.bus_events;
CREATE POLICY "Admins can manage bus events" ON public.bus_events FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can view their bus events" ON public.bus_events;
CREATE POLICY "Users can view their bus events" ON public.bus_events FOR SELECT USING (auth.uid()::text = student_id::text);
DROP POLICY IF EXISTS "System can insert bus events" ON public.bus_events;
CREATE POLICY "System can insert bus events" ON public.bus_events FOR INSERT WITH CHECK (true);

-- RLS Policies for Campus Zones
DROP POLICY IF EXISTS "Admins can manage zones" ON public.campus_zones;
CREATE POLICY "Admins can manage zones" ON public.campus_zones FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Authenticated users can view zones" ON public.campus_zones;
CREATE POLICY "Authenticated users can view zones" ON public.campus_zones FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS Policies for Zone Entries
DROP POLICY IF EXISTS "Admins can manage zone entries" ON public.zone_entries;
CREATE POLICY "Admins can manage zone entries" ON public.zone_entries FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can view their zone entries" ON public.zone_entries;
CREATE POLICY "Users can view their zone entries" ON public.zone_entries FOR SELECT USING (auth.uid()::text = student_id::text);
DROP POLICY IF EXISTS "System can insert zone entries" ON public.zone_entries;
CREATE POLICY "System can insert zone entries" ON public.zone_entries FOR INSERT WITH CHECK (true);

-- RLS Policies for Predictions
DROP POLICY IF EXISTS "Admins can manage predictions" ON public.attendance_predictions;
CREATE POLICY "Admins can manage predictions" ON public.attendance_predictions FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can view their predictions" ON public.attendance_predictions;
CREATE POLICY "Users can view their predictions" ON public.attendance_predictions FOR SELECT USING (auth.uid()::text = student_id::text);

-- RLS Policies for Wellness Scores
DROP POLICY IF EXISTS "Admins can manage wellness" ON public.wellness_scores;
CREATE POLICY "Admins can manage wellness" ON public.wellness_scores FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can view their wellness" ON public.wellness_scores;
CREATE POLICY "Users can view their wellness" ON public.wellness_scores FOR SELECT USING (auth.uid()::text = student_id::text);

-- RLS Policies for Badges
DROP POLICY IF EXISTS "Everyone can view badges" ON public.badges;
CREATE POLICY "Everyone can view badges" ON public.badges FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage badges" ON public.badges;
CREATE POLICY "Admins can manage badges" ON public.badges FOR ALL USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for Student Badges
DROP POLICY IF EXISTS "Admins can manage student badges" ON public.student_badges;
CREATE POLICY "Admins can manage student badges" ON public.student_badges FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can view their badges" ON public.student_badges;
CREATE POLICY "Users can view their badges" ON public.student_badges FOR SELECT USING (auth.uid()::text = student_id::text);
DROP POLICY IF EXISTS "System can insert student badges" ON public.student_badges;
CREATE POLICY "System can insert student badges" ON public.student_badges FOR INSERT WITH CHECK (true);

-- RLS Policies for Attendance Points
DROP POLICY IF EXISTS "Admins can manage points" ON public.attendance_points;
CREATE POLICY "Admins can manage points" ON public.attendance_points FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can view their points" ON public.attendance_points;
CREATE POLICY "Users can view their points" ON public.attendance_points FOR SELECT USING (auth.uid()::text = student_id::text);
DROP POLICY IF EXISTS "System can insert points" ON public.attendance_points;
CREATE POLICY "System can insert points" ON public.attendance_points FOR INSERT WITH CHECK (true);

-- RLS Policies for Leaderboard
DROP POLICY IF EXISTS "Everyone can view leaderboard" ON public.class_leaderboard;
CREATE POLICY "Everyone can view leaderboard" ON public.class_leaderboard FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage leaderboard" ON public.class_leaderboard;
CREATE POLICY "Admins can manage leaderboard" ON public.class_leaderboard FOR ALL USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for Emergency Events
DROP POLICY IF EXISTS "Admins can manage emergencies" ON public.emergency_events;
CREATE POLICY "Admins can manage emergencies" ON public.emergency_events FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Authenticated users can view emergencies" ON public.emergency_events;
CREATE POLICY "Authenticated users can view emergencies" ON public.emergency_events FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can trigger emergencies" ON public.emergency_events;
CREATE POLICY "Authenticated users can trigger emergencies" ON public.emergency_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- RLS Policies for Emergency Responses
DROP POLICY IF EXISTS "Admins can manage responses" ON public.emergency_responses;
CREATE POLICY "Admins can manage responses" ON public.emergency_responses FOR ALL USING (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Authenticated users can view responses" ON public.emergency_responses;
CREATE POLICY "Authenticated users can view responses" ON public.emergency_responses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can respond" ON public.emergency_responses;
CREATE POLICY "Authenticated users can respond" ON public.emergency_responses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Insert default badges
INSERT INTO public.badges (name, description, icon, points, badge_type, criteria) VALUES
('Perfect Week', '100% attendance for a week', '🌟', 50, 'attendance', '{"days": 5, "status": "present"}'),
('Perfect Month', '100% attendance for a month', '🏆', 200, 'attendance', '{"days": 20, "status": "present"}'),
('Early Bird', 'On time every day for a week', '🐦', 30, 'punctuality', '{"days": 5, "late": 0}'),
('Streak Master', '10 day attendance streak', '🔥', 100, 'streak', '{"streak": 10}'),
('Super Streak', '30 day attendance streak', '⚡', 300, 'streak', '{"streak": 30}'),
('Class Champion', 'Best attendance in class', '👑', 150, 'class', '{"rank": 1}'),
('Comeback Kid', 'Improved attendance by 20%', '💪', 75, 'special', '{"improvement": 20}'),
('Perfect Term', '95%+ attendance for term', '🎓', 500, 'special', '{"rate": 95}');

-- Insert default zones
INSERT INTO public.campus_zones (name, zone_type, is_restricted, description) VALUES
('Main Entrance', 'entrance', false, 'Primary school entrance'),
('Main Exit', 'exit', false, 'Primary school exit'),
('Library', 'library', false, 'School library'),
('Cafeteria', 'cafeteria', false, 'School cafeteria'),
('Science Lab', 'lab', true, 'Requires supervision'),
('Computer Lab', 'lab', true, 'Requires supervision'),
('Playground', 'playground', false, 'Outdoor play area'),
('Principal Office', 'office', true, 'Administrative area'),
('Staff Room', 'office', true, 'Teachers only');

-- Enable realtime for relevant tables
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'visitors') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.visitors; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bus_events') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.bus_events; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'zone_entries') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.zone_entries; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'emergency_events') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_events; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_badges') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.student_badges; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'attendance_points') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_points; END IF; END $$;