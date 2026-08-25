-- Recreate core tables lost during cleanup so frontend queries work again

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  full_name text,
  email text,
  phone text,
  role text,
  class text,
  section text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  student_name text,
  class text,
  section text,
  roll_number text,
  category text,
  status text,
  timestamp timestamptz not null default now(),
  image_url text,
  face_descriptor jsonb,
  confidence_score double precision,
  device_info jsonb,
  capture_mode text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gate_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  student_name text,
  class text,
  section text,
  entry_time timestamptz not null default now(),
  exit_time timestamptz,
  is_recognized boolean not null default false,
  confidence_score double precision,
  gate_name text,
  snapshot_url text,
  device_info jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.face_descriptors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  student_name text,
  class text,
  section text,
  descriptor jsonb,
  image_url text,
  quality_score double precision,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.late_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  student_name text,
  class text,
  section text,
  entry_time timestamptz not null default now(),
  reason text,
  approved_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  class text,
  section text,
  teacher_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.period_timings (
  id uuid primary key default gen_random_uuid(),
  period_name text not null,
  start_time time not null,
  end_time time not null,
  class text,
  section text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  class text not null,
  section text not null,
  teacher_id uuid,
  teacher_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_permissions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  permission_key text not null,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.substitutions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  class text,
  section text,
  subject text,
  original_teacher_id uuid,
  substitute_teacher_id uuid,
  status text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  points integer not null default 0,
  reason text,
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  predicted_date date,
  predicted_status text,
  confidence double precision,
  factors jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.class_leaderboard (
  id uuid primary key default gen_random_uuid(),
  class text,
  section text,
  student_id text,
  student_name text,
  score integer not null default 0,
  rank integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text,
  title text,
  description text,
  status text,
  triggered_by uuid,
  resolved_by uuid,
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  channel text,
  event_type text,
  payload jsonb,
  status text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  message text,
  type text,
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  badge_name text,
  badge_type text,
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wellness_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  score double precision,
  mood text,
  measured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zone_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  student_name text,
  zone_name text,
  action text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.attendance_records enable row level security;
alter table public.gate_entries enable row level security;
alter table public.face_descriptors enable row level security;
alter table public.late_entries enable row level security;
alter table public.subjects enable row level security;
alter table public.period_timings enable row level security;
alter table public.class_teachers enable row level security;
alter table public.teacher_permissions enable row level security;
alter table public.substitutions enable row level security;
alter table public.attendance_points enable row level security;
alter table public.attendance_predictions enable row level security;
alter table public.class_leaderboard enable row level security;
alter table public.emergency_events enable row level security;
alter table public.notification_log enable row level security;
alter table public.notifications enable row level security;
alter table public.student_badges enable row level security;
alter table public.wellness_scores enable row level security;
alter table public.zone_entries enable row level security;

-- Generic authenticated access policies for app operation

drop policy if exists "authenticated_full_profiles" on public.profiles;
create policy "authenticated_full_profiles" on public.profiles for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_attendance_records" on public.attendance_records;
create policy "authenticated_full_attendance_records" on public.attendance_records for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_gate_entries" on public.gate_entries;
create policy "authenticated_full_gate_entries" on public.gate_entries for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_face_descriptors" on public.face_descriptors;
create policy "authenticated_full_face_descriptors" on public.face_descriptors for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_late_entries" on public.late_entries;
create policy "authenticated_full_late_entries" on public.late_entries for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_subjects" on public.subjects;
create policy "authenticated_full_subjects" on public.subjects for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_period_timings" on public.period_timings;
create policy "authenticated_full_period_timings" on public.period_timings for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_class_teachers" on public.class_teachers;
create policy "authenticated_full_class_teachers" on public.class_teachers for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_teacher_permissions" on public.teacher_permissions;
create policy "authenticated_full_teacher_permissions" on public.teacher_permissions for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_substitutions" on public.substitutions;
create policy "authenticated_full_substitutions" on public.substitutions for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_attendance_points" on public.attendance_points;
create policy "authenticated_full_attendance_points" on public.attendance_points for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_attendance_predictions" on public.attendance_predictions;
create policy "authenticated_full_attendance_predictions" on public.attendance_predictions for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_class_leaderboard" on public.class_leaderboard;
create policy "authenticated_full_class_leaderboard" on public.class_leaderboard for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_emergency_events" on public.emergency_events;
create policy "authenticated_full_emergency_events" on public.emergency_events for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_notification_log" on public.notification_log;
create policy "authenticated_full_notification_log" on public.notification_log for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_notifications" on public.notifications;
create policy "authenticated_full_notifications" on public.notifications for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_student_badges" on public.student_badges;
create policy "authenticated_full_student_badges" on public.student_badges for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_wellness_scores" on public.wellness_scores;
create policy "authenticated_full_wellness_scores" on public.wellness_scores for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_zone_entries" on public.zone_entries;
create policy "authenticated_full_zone_entries" on public.zone_entries for all to authenticated using (true) with check (true);

-- helpful indexes for common screens
create index if not exists idx_attendance_records_status_timestamp on public.attendance_records(status, timestamp desc);
create index if not exists idx_attendance_records_user_id on public.attendance_records(user_id);
create index if not exists idx_gate_entries_entry_time on public.gate_entries(entry_time desc);
create index if not exists idx_gate_entries_student_id on public.gate_entries(student_id);
create index if not exists idx_face_descriptors_user_student on public.face_descriptors(user_id, student_id);