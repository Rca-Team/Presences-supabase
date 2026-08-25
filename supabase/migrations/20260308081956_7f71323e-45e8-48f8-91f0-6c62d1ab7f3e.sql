
CREATE TABLE public.received_emails (
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

CREATE POLICY "Admins can manage received emails"
  ON public.received_emails FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert received emails"
  ON public.received_emails FOR INSERT
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.received_emails;
