-- Enable real-time for attendance_records
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'attendance_records') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records; END IF; END $$;

-- Add real-time support for profiles
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; END IF; END $$;

-- Create AI insights table for storing predictions and analytics
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  insight_type TEXT NOT NULL,
  data JSONB NOT NULL,
  confidence FLOAT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own insights" ON public.ai_insights;
CREATE POLICY "Users view own insights" ON public.ai_insights FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all insights" ON public.ai_insights;
CREATE POLICY "Admins view all insights" ON public.ai_insights FOR SELECT
USING (is_admin());

DROP POLICY IF EXISTS "System can insert insights" ON public.ai_insights;
CREATE POLICY "System can insert insights" ON public.ai_insights FOR INSERT
WITH CHECK (true);

-- Create notifications table for smart alerts
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT
WITH CHECK (true);

-- Add indices for performance
CREATE INDEX IF NOT EXISTS idx_ai_insights_user_id ON public.ai_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at ON public.ai_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read) WHERE read = false;

-- Add trigger for real-time updates
CREATE OR REPLACE FUNCTION public.notify_attendance_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('attendance_changed', json_build_object(
    'operation', TG_OP,
    'record', row_to_json(NEW)
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_realtime_trigger ON public.attendance_records;
CREATE TRIGGER attendance_realtime_trigger
AFTER INSERT OR UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.notify_attendance_change();