import { supabase } from '@/integrations/supabase/client';

type AttendanceEventStatus =
  | 'detected'
  | 'verified'
  | 'corrected'
  | 'present'
  | 'late'
  | 'absent'
  | 'excused'
  | 'unauthorized';

interface ClassScope {
  className?: string | null;
  section?: string | null;
  subject?: string | null;
}

export const normalizeClassScope = (scope: ClassScope) => {
  const className = scope.className?.trim() || null;
  const section = scope.section?.trim() || null;

  if (!className || !section) return null;

  return {
    className,
    section,
    subject: scope.subject?.trim() || null,
  };
};

export const ensureActiveClassSession = async (scope: ClassScope): Promise<string | null> => {
  const db = supabase as any;
  const normalized = normalizeClassScope(scope);
  if (!normalized) return null;

  const { className, section, subject } = normalized;

  const { data: existing, error: readError } = await db
    .from('class_sessions')
    .select('id')
    .eq('class', className)
    .eq('section', section)
    .eq('school_day', new Date().toISOString().slice(0, 10))
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) {
    throw new Error(`Failed to read class session: ${readError.message}`);
  }

  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await db
    .from('class_sessions')
    .insert({
      class: className,
      section,
      subject,
      metadata: { source: 'attendance-scanner' },
    })
    .select('id')
    .single();

  if (createError) {
    const { data: retryExisting } = await db
      .from('class_sessions')
      .select('id')
      .eq('class', className)
      .eq('section', section)
      .eq('school_day', new Date().toISOString().slice(0, 10))
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (retryExisting?.id) return retryExisting.id;

    throw new Error(`Failed to create class session: ${createError.message}`);
  }

  return created.id;
};

export const upsertClassAttendanceEvent = async (params: {
  sessionId: string;
  studentId: string;
  status: AttendanceEventStatus;
  source?: string;
  confidenceScore?: number | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}) => {
  const db = supabase as any;
  const { data, error } = await db.rpc('upsert_class_attendance_event', {
    p_session_id: params.sessionId,
    p_student_id: params.studentId,
    p_status: params.status,
    p_source: params.source ?? 'scanner',
    p_confidence_score: params.confidenceScore ?? null,
    p_idempotency_key: params.idempotencyKey ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    throw new Error(`Failed to upsert class attendance event: ${error.message}`);
  }

  return data;
};
