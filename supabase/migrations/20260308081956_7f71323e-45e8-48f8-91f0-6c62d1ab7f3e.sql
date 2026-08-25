
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;

CREATE TABLE IF NOT EXISTS public.received_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email text NOT NULL,
  from_name text,
  to_email text NOT NULL DEFAULT 'admission@presences.dev',
  subject text NOT NULL DEFAULT '(No Subject)',
  body_text text,
  body_html text,
  attachments jsonb DEFAULT '[]'::jsonb,
  is_read boolean DEFAULT false,
  is_starred boolean DEFAULT false,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.received_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage received emails" ON public.received_emails;
CREATE POLICY "Admins can manage received emails" ON public.received_emails FOR ALL
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System can insert received emails" ON public.received_emails;
CREATE POLICY "System can insert received emails" ON public.received_emails FOR INSERT
  WITH CHECK (true);

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'received_emails') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.received_emails; END IF; END $$;
