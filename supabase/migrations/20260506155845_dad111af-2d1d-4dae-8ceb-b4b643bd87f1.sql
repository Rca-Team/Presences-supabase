
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;

-- school_gates
CREATE TABLE IF NOT EXISTS public.school_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gate_type text NOT NULL DEFAULT 'main',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_gates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school_gates_read_authenticated" ON public.school_gates;
CREATE POLICY "school_gates_read_authenticated" ON public.school_gates
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "school_gates_admin_write" ON public.school_gates;
CREATE POLICY "school_gates_admin_write" ON public.school_gates
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

INSERT INTO public.school_gates (name, gate_type) VALUES
  ('Main Gate','main'),('Back Gate','back'),('Bus Gate','bus')
ON CONFLICT DO NOTHING;

-- gate_sessions
CREATE TABLE IF NOT EXISTS public.gate_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_name text NOT NULL,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_entries integer NOT NULL DEFAULT 0,
  unknown_entries integer NOT NULL DEFAULT 0,
  device_info jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gate_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gate_sessions_owner_or_admin" ON public.gate_sessions;
CREATE POLICY "gate_sessions_owner_or_admin" ON public.gate_sessions
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR started_by = auth.uid())
  WITH CHECK (private.has_role(auth.uid(), 'admin') OR started_by = auth.uid());

-- gate_entries needs gate_session_id column
ALTER TABLE public.gate_entries ADD COLUMN IF NOT EXISTS gate_session_id uuid;
