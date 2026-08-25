-- 1. Complete schema for public.timetable
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS teacher_id UUID;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS room TEXT;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Populate class & section from category if present
UPDATE public.timetable
SET class = TRIM(SPLIT_PART(REPLACE(category, 'Class ', ''), '-', 1)),
    section = TRIM(SPLIT_PART(REPLACE(category, 'Class ', ''), '-', 2))
WHERE (class IS NULL OR section IS NULL) AND category LIKE '%-%';

-- RLS policies for timetable
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all to read timetable" ON public.timetable;
CREATE POLICY "Allow all to read timetable" ON public.timetable FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Allow authenticated to manage timetable" ON public.timetable;
CREATE POLICY "Allow authenticated to manage timetable" ON public.timetable FOR ALL TO authenticated USING (true);

-- 2. Complete schema for public.teacher_permissions
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.teacher_permissions ADD COLUMN IF NOT EXISTS teacher_id UUID;

-- Sync teacher_id & user_id
UPDATE public.teacher_permissions
SET teacher_id = user_id
WHERE teacher_id IS NULL AND user_id IS NOT NULL;

UPDATE public.teacher_permissions
SET user_id = teacher_id
WHERE user_id IS NULL AND teacher_id IS NOT NULL;

-- Populate class & section from category if present
UPDATE public.teacher_permissions
SET class = TRIM(SPLIT_PART(REPLACE(category, 'Class ', ''), '-', 1)),
    section = TRIM(SPLIT_PART(REPLACE(category, 'Class ', ''), '-', 2))
WHERE (class IS NULL OR section IS NULL) AND category LIKE '%-%';

-- RLS policies for teacher_permissions
ALTER TABLE public.teacher_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all to read teacher_permissions" ON public.teacher_permissions;
CREATE POLICY "Allow all to read teacher_permissions" ON public.teacher_permissions FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "Allow authenticated to manage teacher_permissions" ON public.teacher_permissions;
CREATE POLICY "Allow authenticated to manage teacher_permissions" ON public.teacher_permissions FOR ALL TO authenticated USING (true);
