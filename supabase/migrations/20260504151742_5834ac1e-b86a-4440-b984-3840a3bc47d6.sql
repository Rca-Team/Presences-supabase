
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;
-- Tighten RLS policies created in recovery migration

-- Tables with user_id ownership

drop policy if exists "authenticated_full_profiles" on public.profiles;
DROP POLICY IF EXISTS "profiles_owner_or_admin" ON public.profiles;
CREATE POLICY "profiles_owner_or_admin" ON public.profiles
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_attendance_records" on public.attendance_records;
DROP POLICY IF EXISTS "attendance_records_owner_or_admin" ON public.attendance_records;
CREATE POLICY "attendance_records_owner_or_admin" ON public.attendance_records
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_gate_entries" on public.gate_entries;
DROP POLICY IF EXISTS "gate_entries_owner_or_admin" ON public.gate_entries;
CREATE POLICY "gate_entries_owner_or_admin" ON public.gate_entries
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_face_descriptors" on public.face_descriptors;
DROP POLICY IF EXISTS "face_descriptors_owner_or_admin" ON public.face_descriptors;
CREATE POLICY "face_descriptors_owner_or_admin" ON public.face_descriptors
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_late_entries" on public.late_entries;
DROP POLICY IF EXISTS "late_entries_owner_or_admin" ON public.late_entries;
CREATE POLICY "late_entries_owner_or_admin" ON public.late_entries
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_attendance_points" on public.attendance_points;
DROP POLICY IF EXISTS "attendance_points_owner_or_admin" ON public.attendance_points;
CREATE POLICY "attendance_points_owner_or_admin" ON public.attendance_points
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_attendance_predictions" on public.attendance_predictions;
DROP POLICY IF EXISTS "attendance_predictions_owner_or_admin" ON public.attendance_predictions;
CREATE POLICY "attendance_predictions_owner_or_admin" ON public.attendance_predictions
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_notification_log" on public.notification_log;
DROP POLICY IF EXISTS "notification_log_owner_or_admin" ON public.notification_log;
CREATE POLICY "notification_log_owner_or_admin" ON public.notification_log
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_notifications" on public.notifications;
DROP POLICY IF EXISTS "notifications_owner_or_admin" ON public.notifications;
CREATE POLICY "notifications_owner_or_admin" ON public.notifications
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_student_badges" on public.student_badges;
DROP POLICY IF EXISTS "student_badges_owner_or_admin" ON public.student_badges;
CREATE POLICY "student_badges_owner_or_admin" ON public.student_badges
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_wellness_scores" on public.wellness_scores;
DROP POLICY IF EXISTS "wellness_scores_owner_or_admin" ON public.wellness_scores;
CREATE POLICY "wellness_scores_owner_or_admin" ON public.wellness_scores
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

drop policy if exists "authenticated_full_zone_entries" on public.zone_entries;
DROP POLICY IF EXISTS "zone_entries_owner_or_admin" ON public.zone_entries;
CREATE POLICY "zone_entries_owner_or_admin" ON public.zone_entries
for all
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
)
with check (
  private.has_role(auth.uid(), 'admin')
  or user_id = auth.uid()
);

-- Tables without user_id ownership: read for authenticated, writes admin-only

drop policy if exists "authenticated_full_subjects" on public.subjects;
DROP POLICY IF EXISTS "subjects_read_authenticated" ON public.subjects;
CREATE POLICY "subjects_read_authenticated" ON public.subjects
for select
to authenticated
using (true);
DROP POLICY IF EXISTS "subjects_admin_write" ON public.subjects;
CREATE POLICY "subjects_admin_write" ON public.subjects
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_period_timings" on public.period_timings;
DROP POLICY IF EXISTS "period_timings_read_authenticated" ON public.period_timings;
CREATE POLICY "period_timings_read_authenticated" ON public.period_timings
for select
to authenticated
using (true);
DROP POLICY IF EXISTS "period_timings_admin_write" ON public.period_timings;
CREATE POLICY "period_timings_admin_write" ON public.period_timings
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_class_teachers" on public.class_teachers;
DROP POLICY IF EXISTS "class_teachers_read_authenticated" ON public.class_teachers;
CREATE POLICY "class_teachers_read_authenticated" ON public.class_teachers
for select
to authenticated
using (true);
DROP POLICY IF EXISTS "class_teachers_admin_write" ON public.class_teachers;
CREATE POLICY "class_teachers_admin_write" ON public.class_teachers
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_teacher_permissions" on public.teacher_permissions;
DROP POLICY IF EXISTS "teacher_permissions_read_authenticated" ON public.teacher_permissions;
CREATE POLICY "teacher_permissions_read_authenticated" ON public.teacher_permissions
for select
to authenticated
using (true);
DROP POLICY IF EXISTS "teacher_permissions_admin_write" ON public.teacher_permissions;
CREATE POLICY "teacher_permissions_admin_write" ON public.teacher_permissions
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_substitutions" on public.substitutions;
DROP POLICY IF EXISTS "substitutions_read_authenticated" ON public.substitutions;
CREATE POLICY "substitutions_read_authenticated" ON public.substitutions
for select
to authenticated
using (true);
DROP POLICY IF EXISTS "substitutions_admin_write" ON public.substitutions;
CREATE POLICY "substitutions_admin_write" ON public.substitutions
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_class_leaderboard" on public.class_leaderboard;
DROP POLICY IF EXISTS "class_leaderboard_read_authenticated" ON public.class_leaderboard;
CREATE POLICY "class_leaderboard_read_authenticated" ON public.class_leaderboard
for select
to authenticated
using (true);
DROP POLICY IF EXISTS "class_leaderboard_admin_write" ON public.class_leaderboard;
CREATE POLICY "class_leaderboard_admin_write" ON public.class_leaderboard
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_emergency_events" on public.emergency_events;
DROP POLICY IF EXISTS "emergency_events_read_authenticated" ON public.emergency_events;
CREATE POLICY "emergency_events_read_authenticated" ON public.emergency_events
for select
to authenticated
using (true);
DROP POLICY IF EXISTS "emergency_events_admin_write" ON public.emergency_events;
CREATE POLICY "emergency_events_admin_write" ON public.emergency_events
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));