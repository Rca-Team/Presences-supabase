
-- Required extensions for scheduled HTTP/job runs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Diagnostics: active students, total descriptors, orphan descriptors
CREATE OR REPLACE FUNCTION public.face_samples_diagnostics()
RETURNS TABLE (
  active_students bigint,
  descriptor_rows bigint,
  orphan_descriptors bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active bigint := 0;
  v_total bigint := 0;
  v_orphans bigint := 0;
  v_has_fd boolean;
  v_has_ar boolean;
  v_has_pr boolean;
BEGIN
  SELECT to_regclass('public.face_descriptors') IS NOT NULL INTO v_has_fd;
  SELECT to_regclass('public.attendance_records') IS NOT NULL INTO v_has_ar;
  SELECT to_regclass('public.profiles') IS NOT NULL INTO v_has_pr;

  IF v_has_ar THEN
    EXECUTE $sql$
      SELECT COUNT(DISTINCT user_id)
      FROM public.attendance_records
      WHERE user_id IS NOT NULL
        AND COALESCE(status, '') <> 'unauthorized'
    $sql$ INTO v_active;
  END IF;

  IF v_has_fd THEN
    EXECUTE 'SELECT COUNT(*) FROM public.face_descriptors' INTO v_total;

    EXECUTE format($sql$
      SELECT COUNT(*) FROM public.face_descriptors fd
      WHERE fd.user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance_records ar
          WHERE ar.user_id = fd.user_id
            AND COALESCE(ar.status,'') <> 'unauthorized'
        )
        %s
    $sql$,
      CASE WHEN v_has_pr THEN
        'AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = fd.user_id)'
      ELSE '' END
    ) INTO v_orphans;
  END IF;

  active_students := v_active;
  descriptor_rows := v_total;
  orphan_descriptors := v_orphans;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.face_samples_diagnostics() FROM public;
GRANT EXECUTE ON FUNCTION public.face_samples_diagnostics() TO authenticated, service_role;

-- Cleanup: remove orphan descriptors and return how many were deleted
CREATE OR REPLACE FUNCTION public.cleanup_orphan_face_descriptors()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint := 0;
  v_has_fd boolean;
  v_has_ar boolean;
  v_has_pr boolean;
BEGIN
  SELECT to_regclass('public.face_descriptors') IS NOT NULL INTO v_has_fd;
  SELECT to_regclass('public.attendance_records') IS NOT NULL INTO v_has_ar;
  SELECT to_regclass('public.profiles') IS NOT NULL INTO v_has_pr;

  IF NOT v_has_fd OR NOT v_has_ar THEN
    RETURN 0;
  END IF;

  EXECUTE format($sql$
    WITH deleted AS (
      DELETE FROM public.face_descriptors fd
      WHERE fd.user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance_records ar
          WHERE ar.user_id = fd.user_id
            AND COALESCE(ar.status,'') <> 'unauthorized'
        )
        %s
      RETURNING 1
    )
    SELECT COUNT(*) FROM deleted
  $sql$,
    CASE WHEN v_has_pr THEN
      'AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = fd.user_id)'
    ELSE '' END
  ) INTO v_deleted;

  RETURN COALESCE(v_deleted, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_orphan_face_descriptors() FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_face_descriptors() TO authenticated, service_role;

-- Daily cleanup at 03:15 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-orphan-face-descriptors');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-orphan-face-descriptors',
  '15 3 * * *',
  $$ SELECT public.cleanup_orphan_face_descriptors(); $$
);
