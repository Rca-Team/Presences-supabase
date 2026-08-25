DROP FUNCTION IF EXISTS public.face_samples_diagnostics();

CREATE OR REPLACE FUNCTION public.face_samples_diagnostics()
 RETURNS TABLE(active_students bigint, descriptor_rows bigint, orphan_descriptors bigint, attendance_records bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active bigint := 0;
  v_total bigint := 0;
  v_orphans bigint := 0;
  v_att bigint := 0;
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

    EXECUTE 'SELECT COUNT(*) FROM public.attendance_records' INTO v_att;
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
  attendance_records := v_att;
  RETURN NEXT;
END;
$function$;