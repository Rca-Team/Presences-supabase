
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_owner_select" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_select" ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_owner_insert" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_insert" ON public.push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_owner_update" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_update" ON public.push_subscriptions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_owner_delete" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_delete" ON public.push_subscriptions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_admin_read_all" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_admin_read_all" ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
);