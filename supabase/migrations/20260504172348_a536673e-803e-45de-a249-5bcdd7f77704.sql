CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;

-- Settings table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_settings_read_authenticated" ON public.attendance_settings;
CREATE POLICY "attendance_settings_read_authenticated" ON public.attendance_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "attendance_settings_admin_write" ON public.attendance_settings;
CREATE POLICY "attendance_settings_admin_write" ON public.attendance_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

INSERT INTO public.attendance_settings(key, value) VALUES ('cutoff_time', '09:00')
ON CONFLICT (key) DO NOTHING;

-- Enable cron + http extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule: every 15 minutes invoke the absence-cutoff-notify edge function
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('absence-cutoff-notify') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='absence-cutoff-notify');
    
    PERFORM cron.schedule(
      'absence-cutoff-notify',
      '*/15 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://cvdcbcsonlianbfeessy.supabase.co/functions/v1/absence-cutoff-notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZGNiY3NvbmxpYW5iZmVlc3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDQ5MDcsImV4cCI6MjEwMzIyMDkwN30.fzJfZKKTw2Y3oFgk6fxVkfhdnIXNzXDeNa0CP84RxDg'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;