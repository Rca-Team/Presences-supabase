/**
 * EventBatcher — batched inserts into gv_events + gv_class_sessions upserts.
 */
import { supabase } from '@/integrations/supabase/client';

export interface VisionEvent {
  camera_id: string;
  track_id?: string | null;
  class_key?: string | null;
  period_key?: string | null;
  subject_type: 'student' | 'teacher' | 'unknown';
  subject_id?: string | null;
  subject_name?: string | null;
  event_type: string;
  zone?: string | null;
  meta?: Record<string, unknown> | null;
  occurred_at?: string;
}

const queue: VisionEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

export function pushEvent(ev: VisionEvent) {
  queue.push({ ...ev, occurred_at: ev.occurred_at ?? new Date().toISOString() });
}

export function startEventBatcher(intervalMs = 2000) {
  if (timer) return;
  timer = setInterval(async () => {
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    try {
      // gv_events has a track_id FK to gv_tracks; if track_id isn't a real gv_tracks uuid, null it.
      const cleaned = batch.map((e) => ({ ...e, track_id: null }));
      const { error } = await supabase.from('gv_events').insert(cleaned);
      if (error) console.warn('[vision] event batch insert failed:', error.message);
    } catch (e) {
      console.warn('[vision] event batch exception:', e);
    }
  }, intervalMs);
}

export function stopEventBatcher() {
  if (timer) { clearInterval(timer); timer = null; }
}

export async function upsertClassSession(row: {
  class_key: string;
  period_key: string;
  teacher_scheduled?: string | null;
  teacher_confirmed?: boolean;
  teacher_entered_at?: string | null;
  teacher_exited_at?: string | null;
  student_count_peak?: number;
  students_left_during?: number;
  students_left_after?: number;
  meta?: Record<string, unknown>;
}) {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const { error } = await supabase
      .from('gv_class_sessions')
      .upsert({ ...row, day_key: day }, { onConflict: 'class_key,period_key,day_key' });
    if (error) console.warn('[vision] session upsert failed:', error.message);
  } catch (e) {
    console.warn('[vision] session upsert exception:', e);
  }
}
