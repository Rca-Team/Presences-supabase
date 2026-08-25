
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;

-- Allow service role to read all push subscriptions for broadcasting
DROP POLICY IF EXISTS "Service role can read all subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role can read all subscriptions" ON public.push_subscriptions
FOR SELECT
TO service_role
USING (true);

-- Allow admins to read all subscriptions for broadcasting
DROP POLICY IF EXISTS "Admins can read all subscriptions" ON public.push_subscriptions;
CREATE POLICY "Admins can read all subscriptions" ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));
