/**
 * Direct Cloud Attendance Pipeline (Offline Queue Removed)
 *
 * All attendance events write directly and immediately to Supabase.
 * Offline IndexedDB queue has been removed per system specification.
 */

import { supabase } from '@/integrations/supabase/client';

export interface QueuedAttendanceEntry {
  id: string;
  userId: string;
  studentName: string;
  status: 'present' | 'late';
  confidence: number;
  timestamp: string;
  source: string;
  metadata: Record<string, any>;
  photoDataUrl?: string;
  retries: number;
  createdAt: number;
}

// Clean up legacy IndexedDB database on startup if it exists
if (typeof window !== 'undefined' && 'indexedDB' in window) {
  try {
    const req = window.indexedDB.deleteDatabase('presences-attendance-queue');
    req.onsuccess = () => console.info('[AttendanceSync] Legacy offline queue database purged');
  } catch {
    // ignore
  }
}

/**
 * Direct cloud insert for attendance events.
 * Bypasses local queue and writes directly to Supabase cloud.
 */
export async function enqueueAttendance(entry: Partial<QueuedAttendanceEntry> & { userId: string; studentName?: string }): Promise<void> {
  const isUuid = (val?: string | null): val is string =>
    typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const validUserId = isUuid(entry.userId) ? entry.userId : null;
  const resolvedStudentId = entry.metadata?.employee_id || entry.userId;
  const studentName = entry.studentName || entry.metadata?.name || 'Student';
  const timestamp = entry.timestamp || new Date().toISOString();

  const payload: any = {
    user_id: validUserId,
    student_id: resolvedStudentId ? String(resolvedStudentId) : null,
    student_name: studentName,
    class: entry.metadata?.class ?? null,
    section: entry.metadata?.section ?? null,
    category: entry.metadata?.category ?? null,
    roll_number: entry.metadata?.roll_number ? String(entry.metadata.roll_number) : null,
    status: entry.status || 'present',
    timestamp,
    confidence: entry.confidence ?? 0.95,
    confidence_score: entry.confidence ?? 0.95,
    source: entry.source || 'direct-cloud',
    capture_mode: entry.metadata?.capture_mode || 'ai-scan',
    device_info: {
      ...entry.metadata,
      name: studentName,
      source: entry.source || 'direct-cloud',
    },
    metadata: {
      ...entry.metadata,
      name: studentName,
      source: entry.source || 'direct-cloud',
    },
  };

  try {
    const { error } = await supabase.from('attendance_records').insert(payload);
    if (error) {
      console.error('[AttendanceSync] Direct cloud write failed:', error.message);
      throw error;
    }
    console.info(`[AttendanceSync] Saved directly to cloud: ${studentName}`);
  } catch (err) {
    console.error('[AttendanceSync] Failed to write attendance to Supabase:', err);
    throw err;
  }
}

/** Legacy alias */
export const enqueueWrite = (job: any) => {
  if (job?.payload && job.key) {
    const p = job.payload;
    return enqueueAttendance({
      id: job.key,
      userId: p.userId,
      studentName: p.name || p.studentName || 'Student',
      status: 'present',
      confidence: p.confidence || 0.85,
      timestamp: new Date().toISOString(),
      source: 'realtime-engine',
      metadata: p,
    });
  } else if (job?.userId) {
    return enqueueAttendance(job);
  }
};

export async function getPendingEntries(): Promise<QueuedAttendanceEntry[]> {
  return [];
}

export async function getQueueSize(): Promise<number> {
  return 0;
}

export function startOfflineQueueDrain(): void {}
export function stopOfflineQueueDrain(): void {}
export async function forceDrain(): Promise<{ synced: number; failed: number }> {
  return { synced: 0, failed: 0 };
}
