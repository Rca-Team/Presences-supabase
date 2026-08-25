-- 1. Ensure public.has_role has correct SECURITY DEFINER, search_path, and EXECUTE grants
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role::text = _role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, anon, public, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon, public, service_role;

-- 2. Ensure RLS policies for emergency_events allow authenticated users to view, trigger, and resolve
ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage emergencies" ON public.emergency_events;
DROP POLICY IF EXISTS "Authenticated users can view emergencies" ON public.emergency_events;
DROP POLICY IF EXISTS "Authenticated users can trigger emergencies" ON public.emergency_events;
DROP POLICY IF EXISTS "Allow all read emergencies" ON public.emergency_events;
DROP POLICY IF EXISTS "Allow authenticated manage emergencies" ON public.emergency_events;

CREATE POLICY "Allow all read emergencies"
ON public.emergency_events
FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Allow authenticated manage emergencies"
ON public.emergency_events
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Ensure RLS policies for emergency_responses
ALTER TABLE public.emergency_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage responses" ON public.emergency_responses;
DROP POLICY IF EXISTS "Authenticated users can view responses" ON public.emergency_responses;
DROP POLICY IF EXISTS "Authenticated users can respond" ON public.emergency_responses;
DROP POLICY IF EXISTS "Allow all read responses" ON public.emergency_responses;
DROP POLICY IF EXISTS "Allow authenticated manage responses" ON public.emergency_responses;

CREATE POLICY "Allow all read responses"
ON public.emergency_responses
FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Allow authenticated manage responses"
ON public.emergency_responses
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
