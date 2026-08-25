-- Tighten RLS policies created in recovery migration

-- Tables with user_id ownership

drop policy if exists "authenticated_full_profiles" on public.profiles;
create policy "profiles_owner_or_admin"
on public.profiles
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
create policy "attendance_records_owner_or_admin"
on public.attendance_records
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
create policy "gate_entries_owner_or_admin"
on public.gate_entries
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
create policy "face_descriptors_owner_or_admin"
on public.face_descriptors
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
create policy "late_entries_owner_or_admin"
on public.late_entries
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
create policy "attendance_points_owner_or_admin"
on public.attendance_points
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
create policy "attendance_predictions_owner_or_admin"
on public.attendance_predictions
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
create policy "notification_log_owner_or_admin"
on public.notification_log
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
create policy "notifications_owner_or_admin"
on public.notifications
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
create policy "student_badges_owner_or_admin"
on public.student_badges
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
create policy "wellness_scores_owner_or_admin"
on public.wellness_scores
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
create policy "zone_entries_owner_or_admin"
on public.zone_entries
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
create policy "subjects_read_authenticated"
on public.subjects
for select
to authenticated
using (true);
create policy "subjects_admin_write"
on public.subjects
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_period_timings" on public.period_timings;
create policy "period_timings_read_authenticated"
on public.period_timings
for select
to authenticated
using (true);
create policy "period_timings_admin_write"
on public.period_timings
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_class_teachers" on public.class_teachers;
create policy "class_teachers_read_authenticated"
on public.class_teachers
for select
to authenticated
using (true);
create policy "class_teachers_admin_write"
on public.class_teachers
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_teacher_permissions" on public.teacher_permissions;
create policy "teacher_permissions_read_authenticated"
on public.teacher_permissions
for select
to authenticated
using (true);
create policy "teacher_permissions_admin_write"
on public.teacher_permissions
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_substitutions" on public.substitutions;
create policy "substitutions_read_authenticated"
on public.substitutions
for select
to authenticated
using (true);
create policy "substitutions_admin_write"
on public.substitutions
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_class_leaderboard" on public.class_leaderboard;
create policy "class_leaderboard_read_authenticated"
on public.class_leaderboard
for select
to authenticated
using (true);
create policy "class_leaderboard_admin_write"
on public.class_leaderboard
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "authenticated_full_emergency_events" on public.emergency_events;
create policy "emergency_events_read_authenticated"
on public.emergency_events
for select
to authenticated
using (true);
create policy "emergency_events_admin_write"
on public.emergency_events
for all
to authenticated
using (private.has_role(auth.uid(), 'admin'))
with check (private.has_role(auth.uid(), 'admin'));