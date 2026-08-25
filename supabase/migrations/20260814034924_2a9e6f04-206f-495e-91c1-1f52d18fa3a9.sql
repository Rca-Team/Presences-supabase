ALTER TABLE public.face_descriptors
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS student_name text,
  ADD COLUMN IF NOT EXISTS student_id text,
  ADD COLUMN IF NOT EXISTS class text,
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_face_descriptors_user_id ON public.face_descriptors (user_id);
CREATE INDEX IF NOT EXISTS idx_face_descriptors_category ON public.face_descriptors (category);
CREATE INDEX IF NOT EXISTS idx_face_descriptors_class_section ON public.face_descriptors (class, section);