DROP POLICY IF EXISTS "Public registration can create face descriptors" ON public.face_descriptors;

CREATE POLICY "Public registration can create face descriptors"
ON public.face_descriptors
FOR INSERT
TO anon, authenticated
WITH CHECK (
  user_id IS NOT NULL
  AND descriptor IS NOT NULL
  AND metadata->>'registration' = 'true'
);