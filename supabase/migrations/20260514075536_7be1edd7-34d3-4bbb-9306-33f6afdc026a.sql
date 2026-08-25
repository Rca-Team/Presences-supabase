
-- Ensure 'parent' role exists in the app_role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'parent'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'parent';
  END IF;
END$$;

-- Seed (only if missing) the keys that admin Notification Settings panel manages
INSERT INTO public.attendance_settings (key, value)
SELECT k, v FROM (VALUES
  ('cutoff_time',           '09:15'),
  ('pilot_classes',         '[]'),
  ('notify_channels',       '{"email":true,"inapp":true,"sms":false}'),
  ('twilio_account_sid',    ''),
  ('twilio_auth_token',     ''),
  ('twilio_from_number',    ''),
  ('msg_template_present',  'Hello {parent}, your child {student} was marked PRESENT at {time} in class {class}-{section}. — PM SHRI KV NFC Vigyan Vihar'),
  ('msg_template_late',     'Hello {parent}, your child {student} arrived LATE at {time} (after {cutoff}) in class {class}-{section}. — PM SHRI KV NFC Vigyan Vihar'),
  ('msg_template_absent',   'Hello {parent}, your child {student} is marked ABSENT today ({date}) in class {class}-{section}. Please contact the class teacher if this is incorrect. — PM SHRI KV NFC Vigyan Vihar')
) AS t(k,v)
WHERE NOT EXISTS (SELECT 1 FROM public.attendance_settings s WHERE s.key = t.k);
