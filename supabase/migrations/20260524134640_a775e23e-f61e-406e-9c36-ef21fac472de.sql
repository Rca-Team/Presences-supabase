
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role); END; $$;
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

DROP POLICY IF EXISTS emotion_events_staff_select ON public.emotion_events;
CREATE POLICY emotion_events_staff_select ON public.emotion_events
for select
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or private.has_role(auth.uid(), 'principal')
  or private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS emotion_events_staff_insert ON public.emotion_events;
CREATE POLICY emotion_events_staff_insert ON public.emotion_events
for insert
to authenticated
with check (
  private.has_role(auth.uid(), 'admin')
  or private.has_role(auth.uid(), 'principal')
  or private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS emotion_events_staff_update ON public.emotion_events;
CREATE POLICY emotion_events_staff_update ON public.emotion_events
for update
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or private.has_role(auth.uid(), 'principal')
  or private.has_role(auth.uid(), 'teacher')
)
with check (
  private.has_role(auth.uid(), 'admin')
  or private.has_role(auth.uid(), 'principal')
  or private.has_role(auth.uid(), 'teacher')
);

DROP POLICY IF EXISTS emotion_events_staff_delete ON public.emotion_events;
CREATE POLICY emotion_events_staff_delete ON public.emotion_events
for delete
to authenticated
using (
  private.has_role(auth.uid(), 'admin')
  or private.has_role(auth.uid(), 'principal')
  or private.has_role(auth.uid(), 'teacher')
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

DROP TRIGGER IF EXISTS trg_update_emotion_events_updated_at ON public.emotion_events;
CREATE TRIGGER trg_update_emotion_events_updated_at
before update on public.emotion_events
for each row
execute function public.update_emotion_events_updated_at();

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'emotion_events') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.emotion_events; END IF; END $$;