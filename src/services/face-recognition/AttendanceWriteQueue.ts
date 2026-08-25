/**
 * AttendanceWriteQueue
 *
 * Thread 4 of the pipeline: database updates.
 *
 * Recognition never awaits a network round-trip. Identified faces are pushed
 * into this queue, which drains in the background with de-duplication,
 * retries and `keepalive`-style resilience, so the camera loop and the UI stay
 * perfectly smooth even on slow connections.
 */

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

export function enqueueWrite<T>(job: WriteJob<T>): boolean {
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
        // A later recognition may already have queued a fresh write for this
        // student. Keep one retry only, preventing a slow network from growing
        // an unbounded queue that eventually starves new students.
        if (!hasPendingKey(job.key)) queue.push({ ...job, attempts });
        notify();
        void drain();
      }, backoff);
    } else {
      // Give the caller a chance to retry later — never silently drop data
      seen.delete(job.key);
      console.error('Write job failed permanently:', job.key, err);
    }
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
