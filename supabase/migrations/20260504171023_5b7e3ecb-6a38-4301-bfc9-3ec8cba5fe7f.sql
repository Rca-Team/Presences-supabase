DELETE FROM public.face_descriptors
WHERE user_id NOT IN (SELECT user_id FROM public.attendance_records WHERE user_id IS NOT NULL);