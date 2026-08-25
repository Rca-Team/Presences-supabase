CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;

DROP FUNCTION IF EXISTS public.get_all_auth_users();

CREATE OR REPLACE FUNCTION public.get_all_auth_users()
RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, u.last_sign_in_at, u.created_at
    FROM auth.users u
    ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_auth_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_auth_users() TO authenticated;