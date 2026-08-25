-- 1. Fix trigger payload size limit in pg_notify
CREATE OR REPLACE FUNCTION notify_attendance_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_notify('attendance_changed', json_build_object(
    'operation', TG_OP,
    'id', NEW.id,
    'user_id', NEW.user_id,
    'status', NEW.status,
    'timestamp', NEW.timestamp
  )::text);
  RETURN NEW;
END;
$function$;

-- 2. Update stored old domain URLs in database tables
UPDATE public.face_descriptors
SET image_url = REPLACE(image_url, 'eiahucigcvsnuvviajqt', 'cvdcbcsonlianbfeessy')
WHERE image_url ILIKE '%eiahucigcvsnuvviajqt%';

UPDATE public.profiles
SET avatar_url = REPLACE(avatar_url, 'eiahucigcvsnuvviajqt', 'cvdcbcsonlianbfeessy'),
    photo_url = REPLACE(photo_url, 'eiahucigcvsnuvviajqt', 'cvdcbcsonlianbfeessy')
WHERE avatar_url ILIKE '%eiahucigcvsnuvviajqt%' OR photo_url ILIKE '%eiahucigcvsnuvviajqt%';

UPDATE public.attendance_records
SET image_url = REPLACE(image_url, 'eiahucigcvsnuvviajqt', 'cvdcbcsonlianbfeessy')
WHERE image_url ILIKE '%eiahucigcvsnuvviajqt%';
