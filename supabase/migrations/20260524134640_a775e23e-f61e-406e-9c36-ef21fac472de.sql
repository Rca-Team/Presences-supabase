create table if not exists public.emotion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  student_id text,
  source text not null default 'ai-scan',
  emotion_label text not null,
  confidence_score double precision,
  valence_score double precision,
  arousal_score double precision,
  captured_at timestamp with time zone not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.emotion_events enable row level security;

create policy emotion_events_staff_select
on public.emotion_events
for select
to authenticated
using (
  private.has_role(auth.uid(), 'admin'::app_role)
  or private.has_role(auth.uid(), 'principal'::app_role)
  or private.has_role(auth.uid(), 'teacher'::app_role)
);

create policy emotion_events_staff_insert
on public.emotion_events
for insert
to authenticated
with check (
  private.has_role(auth.uid(), 'admin'::app_role)
  or private.has_role(auth.uid(), 'principal'::app_role)
  or private.has_role(auth.uid(), 'teacher'::app_role)
);

create policy emotion_events_staff_update
on public.emotion_events
for update
to authenticated
using (
  private.has_role(auth.uid(), 'admin'::app_role)
  or private.has_role(auth.uid(), 'principal'::app_role)
  or private.has_role(auth.uid(), 'teacher'::app_role)
)
with check (
  private.has_role(auth.uid(), 'admin'::app_role)
  or private.has_role(auth.uid(), 'principal'::app_role)
  or private.has_role(auth.uid(), 'teacher'::app_role)
);

create policy emotion_events_staff_delete
on public.emotion_events
for delete
to authenticated
using (
  private.has_role(auth.uid(), 'admin'::app_role)
  or private.has_role(auth.uid(), 'principal'::app_role)
  or private.has_role(auth.uid(), 'teacher'::app_role)
);

create index if not exists idx_emotion_events_user_captured_at
on public.emotion_events (user_id, captured_at desc);

create index if not exists idx_emotion_events_student_captured_at
on public.emotion_events (student_id, captured_at desc);

create index if not exists idx_emotion_events_source_captured_at
on public.emotion_events (source, captured_at desc);

create index if not exists idx_emotion_events_emotion_label
on public.emotion_events (emotion_label);

create or replace function public.update_emotion_events_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_emotion_events_updated_at on public.emotion_events;
create trigger trg_update_emotion_events_updated_at
before update on public.emotion_events
for each row
execute function public.update_emotion_events_updated_at();

alter publication supabase_realtime add table public.emotion_events;