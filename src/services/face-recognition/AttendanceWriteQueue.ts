/**
 * AttendanceWriteQueue
 *
 * Thread 4 of the pipeline: database updates.
 *
 * Recognition never awaits a network round-trip. Identified faces are pushed
 * into this queue, which drains in the background with de-duplication,
 * retries and resilience, saving directly to Supabase cloud.
 *
 * All offline database/vault algorithms and IndexedDB queues have been removed
 * to match previous stable architecture where attendance is saved directly to cloud.
 */

import { supabase } from '@/integrations/supabase/client';

export interface WriteJob<T = unknown> {
  /** de-dup key — repeated pushes within `dedupeMs` are ignored */
  key: string;
  payload: T;
  run: (payload: T) => Promise<void>;
  attempts?: number;
}

interface QueueOptions {
  dedupeMs?: number;
  maxAttempts?: number;
  concurrency?: number;
}

const seen = new Map<string, number>();
let queue: WriteJob[] = [];
let active = 0;
let draining = false;
let opts: Required<QueueOptions> = { dedupeMs: 20_000, maxAttempts: 4, concurrency: 3 };
const listeners = new Set<(depth: number) => void>();

export function configureWriteQueue(next: QueueOptions): void {
  opts = { ...opts, ...next };
}

export function onWriteQueueChange(fn: (depth: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  const depth = queue.length + active;
  listeners.forEach(fn => fn(depth));
}

function hasPendingKey(key: string): boolean {
  return queue.some(job => job.key === key);
}

/**
 * Enqueue a write job to the in-memory queue.
 * Drains asynchronously with direct cloud persistence.
 */
export function enqueueWrite<T = any>(job: WriteJob<T> | any): boolean {
  // If invoked with a legacy payload object directly
  if (!job.run && (job.payload || job.userId)) {
    const p = job.payload || job;
    const key = job.key || `att:${p.userId || p.student_id}:${Math.floor(Date.now() / 15_000)}`;
    return enqueueWrite({
      key,
      payload: p,
      run: async (item: any) => {
        await directCloudInsert(item);
      },
    });
  }

  const now = Date.now();
  const last = seen.get(job.key);
  if (last && now - last < opts.dedupeMs) return false;
  seen.set(job.key, now);

  // prune old dedupe entries
  if (seen.size > 500) {
    for (const [k, t] of seen) if (now - t > opts.dedupeMs * 2) seen.delete(k);
  }

  queue.push({ ...(job as WriteJob), attempts: 0 });
  notify();
  void drain();
  return true;
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      while (active < opts.concurrency && queue.length > 0) {
        const job = queue.shift()!;
        active++;
        notify();
        void runJob(job).finally(() => {
          active--;
          notify();
        });
      }
      // yield so the UI thread keeps painting
      await new Promise(resolve => setTimeout(resolve, 40));
      if (active >= opts.concurrency) continue;
    }
  } finally {
    draining = false;
  }
}

async function runJob(job: WriteJob): Promise<void> {
  try {
    await job.run(job.payload);
  } catch (err) {
    const attempts = (job.attempts ?? 0) + 1;
    if (attempts < opts.maxAttempts) {
      const backoff = Math.min(500 * 2 ** (attempts - 1), 8000);
      setTimeout(() => {
        if (!hasPendingKey(job.key)) queue.push({ ...job, attempts });
        notify();
        void drain();
      }, backoff);
    } else {
      seen.delete(job.key);
      console.error('[AttendanceWriteQueue] Write job failed permanently:', job.key, err);
    }
  }
}

/** Direct cloud insert helper */
async function directCloudInsert(p: any): Promise<void> {
  const isUuid = (val?: string | null): val is string =>
    typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const validUserId = isUuid(p.userId || p.user_id) ? (p.userId || p.user_id) : null;
  const resolvedStudentId = p.student_id || p.metadata?.employee_id || p.userId || p.employee_id;
  const studentName = p.studentName || p.student_name || p.name || p.metadata?.name || 'Student';
  const timestamp = p.timestamp || new Date().toISOString();

  const payload: any = {
    user_id: validUserId,
    student_id: resolvedStudentId ? String(resolvedStudentId) : null,
    student_name: studentName,
    class: p.metadata?.class ?? p.class ?? null,
    section: p.metadata?.section ?? p.section ?? null,
    category: p.metadata?.category ?? p.category ?? null,
    roll_number: p.metadata?.roll_number ? String(p.metadata.roll_number) : null,
    status: p.status || 'present',
    timestamp,
    confidence: p.confidence ?? 0.95,
    confidence_score: p.confidence ?? 0.95,
    source: p.source || 'direct-cloud',
    capture_mode: p.capture_mode || p.metadata?.capture_mode || 'ai-scan',
    device_info: {
      ...p.metadata,
      name: studentName,
      source: p.source || 'direct-cloud',
    },
    metadata: {
      ...p.metadata,
      name: studentName,
      source: p.source || 'direct-cloud',
    },
  };

  const { error } = await supabase.from('attendance_records').insert(payload);
  if (error) {
    console.error('[AttendanceWriteQueue] Direct cloud insert failed:', error.message);
    throw error;
  }
}

export function getWriteQueueDepth(): number {
  return queue.length + active;
}

export function clearWriteQueue(): void {
  queue = [];
  seen.clear();
  notify();
}

/** Compatibility wrapper for legacy callers */
export async function enqueueAttendance(entry: any): Promise<void> {
  await directCloudInsert(entry);
}

export async function getPendingEntries(): Promise<any[]> {
  return [];
}

export async function getQueueSize(): Promise<number> {
  return queue.length + active;
}

export function startOfflineQueueDrain(): void {}
export function stopOfflineQueueDrain(): void {}
export async function forceDrain(): Promise<{ synced: number; failed: number }> {
  return { synced: 0, failed: 0 };
}
