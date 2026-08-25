-- 1) Deduplicate profiles by user_id (keep newest row)
DELETE FROM public.profiles p
USING public.profiles newer
WHERE p.user_id IS NOT NULL
  AND newer.user_id = p.user_id
  AND newer.updated_at > p.updated_at;

-- 2) Enforce one profile per user for reliable parent mapping
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_user_id_unique'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- 3) Backfill/update parent contacts from latest registration records
WITH latest_registration AS (
  SELECT DISTINCT ON (ar.user_id)
    ar.user_id,
    ar.student_name,
    ar.class,
    ar.section,
    ar.device_info,
    ar.updated_at,
    ar.created_at
  FROM public.attendance_records ar
  WHERE ar.user_id IS NOT NULL
    AND ar.status = 'registered'
    AND (ar.device_info->'metadata'->>'parent_email') IS NOT NULL
    AND NULLIF(ar.device_info->'metadata'->>'parent_email', '') IS NOT NULL
  ORDER BY ar.user_id, ar.updated_at DESC NULLS LAST, ar.created_at DESC NULLS LAST
)
INSERT INTO public.profiles (
  id,
  user_id,
  display_name,
  parent_name,
  parent_email,
  phone,
  class,
  section,
  metadata,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  lr.user_id,
  COALESCE(NULLIF(lr.student_name, ''), NULLIF(lr.device_info->'metadata'->>'name', ''), 'Student'),
  NULLIF(lr.device_info->'metadata'->>'parent_name', ''),
  NULLIF(lr.device_info->'metadata'->>'parent_email', ''),
  NULLIF(lr.device_info->'metadata'->>'parent_phone', ''),
  COALESCE(NULLIF(lr.class, ''), NULLIF(split_part(lr.device_info->'metadata'->>'class_section', '-', 1), '')),
  COALESCE(NULLIF(lr.section, ''), NULLIF(split_part(lr.device_info->'metadata'->>'class_section', '-', 2), '')),
  jsonb_strip_nulls(
    jsonb_build_object(
      'parent_phone', NULLIF(lr.device_info->'metadata'->>'parent_phone', ''),
      'student_email', NULLIF(lr.device_info->'metadata'->>'student_email', ''),
      'roll_number', NULLIF(lr.device_info->'metadata'->>'roll_number', ''),
      'transport_mode', NULLIF(lr.device_info->'metadata'->>'transport_mode', ''),
      'address', NULLIF(lr.device_info->'metadata'->>'address', ''),
      'registration_source', 'attendance_registration_backfill'
    )
  ),
  now(),
  now()
FROM latest_registration lr
ON CONFLICT (user_id)
DO UPDATE
SET
  display_name = COALESCE(NULLIF(public.profiles.display_name, ''), EXCLUDED.display_name),
  parent_name = COALESCE(NULLIF(public.profiles.parent_name, ''), EXCLUDED.parent_name),
  parent_email = COALESCE(NULLIF(public.profiles.parent_email, ''), EXCLUDED.parent_email),
  phone = COALESCE(NULLIF(public.profiles.phone, ''), EXCLUDED.phone),
  class = COALESCE(NULLIF(public.profiles.class, ''), EXCLUDED.class),
  section = COALESCE(NULLIF(public.profiles.section, ''), EXCLUDED.section),
  metadata = COALESCE(public.profiles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
  updated_at = now();