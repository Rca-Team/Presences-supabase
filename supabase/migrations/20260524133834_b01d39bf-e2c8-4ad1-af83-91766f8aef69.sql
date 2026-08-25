
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;
-- 1) Tighten realtime topic fallback to deny empty/unresolved topics
DROP POLICY IF EXISTS "Authenticated can receive non-sensitive realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can receive non-sensitive realtime topics" ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() IS NOT NULL
  AND realtime.topic() <> ''
  AND split_part(realtime.topic(), ':', 3) NOT IN ('attendance_records', 'gate_entries', 'student_badges')
);

-- 2) Restrict biometric descriptors to staff roles only
DROP POLICY IF EXISTS "face_descriptors_owner_or_admin" ON public.face_descriptors;

DROP POLICY IF EXISTS "face_descriptors_staff_select" ON public.face_descriptors;
CREATE POLICY "face_descriptors_staff_select" ON public.face_descriptors
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "face_descriptors_staff_insert" ON public.face_descriptors;
CREATE POLICY "face_descriptors_staff_insert" ON public.face_descriptors
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "face_descriptors_staff_update" ON public.face_descriptors;
CREATE POLICY "face_descriptors_staff_update" ON public.face_descriptors
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "face_descriptors_staff_delete" ON public.face_descriptors;
CREATE POLICY "face_descriptors_staff_delete" ON public.face_descriptors
FOR DELETE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

-- 3) attendance_records: keep scoped reads, restrict writes to staff
DROP POLICY IF EXISTS "attendance_records_owner_or_admin" ON public.attendance_records;

DROP POLICY IF EXISTS "attendance_records_select_owner_or_staff" ON public.attendance_records;
CREATE POLICY "attendance_records_select_owner_or_staff" ON public.attendance_records
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "attendance_records_insert_staff" ON public.attendance_records;
CREATE POLICY "attendance_records_insert_staff" ON public.attendance_records
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "attendance_records_update_staff" ON public.attendance_records;
CREATE POLICY "attendance_records_update_staff" ON public.attendance_records
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "attendance_records_delete_staff" ON public.attendance_records;
CREATE POLICY "attendance_records_delete_staff" ON public.attendance_records
FOR DELETE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

-- 4) gate_entries: keep scoped reads, restrict writes to staff
DROP POLICY IF EXISTS "gate_entries_owner_or_admin" ON public.gate_entries;

DROP POLICY IF EXISTS "gate_entries_select_owner_or_staff" ON public.gate_entries;
CREATE POLICY "gate_entries_select_owner_or_staff" ON public.gate_entries
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "gate_entries_insert_staff" ON public.gate_entries;
CREATE POLICY "gate_entries_insert_staff" ON public.gate_entries
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "gate_entries_update_staff" ON public.gate_entries;
CREATE POLICY "gate_entries_update_staff" ON public.gate_entries
FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS "gate_entries_delete_staff" ON public.gate_entries;
CREATE POLICY "gate_entries_delete_staff" ON public.gate_entries
FOR DELETE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR private.has_role(auth.uid(), 'principal')
  OR private.has_role(auth.uid(), 'teacher')
);