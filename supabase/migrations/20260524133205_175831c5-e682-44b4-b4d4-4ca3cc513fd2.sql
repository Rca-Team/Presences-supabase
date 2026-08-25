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
CREATE POLICY "push_subscriptions_owner_select"
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_owner_insert" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_insert"
ON public.push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_owner_update" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_update"
ON public.push_subscriptions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_owner_delete" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_delete"
ON public.push_subscriptions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_admin_read_all" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_admin_read_all"
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR private.has_role(auth.uid(), 'principal'::app_role)
);