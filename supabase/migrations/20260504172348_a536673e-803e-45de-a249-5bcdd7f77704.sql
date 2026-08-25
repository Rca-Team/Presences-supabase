-- Settings table
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_settings_read_authenticated"
  ON public.attendance_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "attendance_settings_admin_write"
  ON public.attendance_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.attendance_settings(key, value) VALUES ('cutoff_time', '09:00')
ON CONFLICT (key) DO NOTHING;

-- Enable cron + http extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule: every 15 minutes invoke the absence-cutoff-notify edge function
SELECT cron.unschedule('absence-cutoff-notify') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='absence-cutoff-notify');

SELECT cron.schedule(
  'absence-cutoff-notify',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://eiahucigcvsnuvviajqt.supabase.co/functions/v1/absence-cutoff-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpYWh1Y2lnY3ZzbnV2dmlhanF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA5NDEsImV4cCI6MjA5MzQ3Njk0MX0.nPl7U5Sm5Rm2zFnwLO3RzjOnkrIbrzEfFzSgkbLnX_I'
    ),
    body := '{}'::jsonb
  );
  $$
);