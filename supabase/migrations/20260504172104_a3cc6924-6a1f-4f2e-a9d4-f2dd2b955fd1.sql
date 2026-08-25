CREATE OR REPLACE FUNCTION public.get_all_auth_users()
RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
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