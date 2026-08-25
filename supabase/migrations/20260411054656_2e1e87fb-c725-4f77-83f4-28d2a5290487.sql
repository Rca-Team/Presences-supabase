
-- Allow service role to read all push subscriptions for broadcasting
CREATE POLICY "Service role can read all subscriptions"
ON public.push_subscriptions
FOR SELECT
TO service_role
USING (true);

-- Allow admins to read all subscriptions for broadcasting
CREATE POLICY "Admins can read all subscriptions"
ON public.push_subscriptions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
