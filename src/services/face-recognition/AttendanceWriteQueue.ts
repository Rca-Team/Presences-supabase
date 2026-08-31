/**
 * AttendanceWriteQueue — IndexedDB Offline Vault
 *
 * Stores gate-mode attendance entries locally in IndexedDB when network is
 * unavailable, then batch-drains them to Supabase once connectivity returns.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ──────────────────────────────────────────────────────────────────────

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

// ─── IndexedDB Setup ────────────────────────────────────────────────────────────

const DB_NAME = 'presences-attendance-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending_attendance';
const MAX_RETRIES = 5;
const DRAIN_INTERVAL_MS = 15_000; // Check every 15 seconds
const BATCH_SIZE = 10;

let dbInstance: IDBDatabase | null = null;
let drainTimer: ReturnType<typeof setInterval> | null = null;
let isDraining = false;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Queue Operations ───────────────────────────────────────────────────────────

/** Add an attendance entry to the offline queue */
export async function enqueueAttendance(entry: Omit<QueuedAttendanceEntry, 'retries' | 'createdAt'>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: QueuedAttendanceEntry = {
      ...entry,
      id: entry.id || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      retries: 0,
      createdAt: Date.now(),
    };
    store.put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    console.info(`[OfflineQueue] Enqueued attendance for ${entry.studentName} (${entry.userId})`);
  } catch (err) {
    console.error('[OfflineQueue] Failed to enqueue:', err);
  }
}

/** Legacy alias for enqueueAttendance */
export const enqueueWrite = (job: any) => {
  if (job?.payload && job.key) {
    const p = job.payload;
    enqueueAttendance({
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
    enqueueAttendance(job);
  }
};

/** Get all pending entries from the queue */
export async function getPendingEntries(): Promise<QueuedAttendanceEntry[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Remove a successfully synced entry */
async function removeEntry(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silent
  }
}

/** Increment retry count for a failed entry */
async function incrementRetry(entry: QueuedAttendanceEntry): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    entry.retries += 1;
    if (entry.retries >= MAX_RETRIES) {
      // Move to dead letter — just delete after max retries
      store.delete(entry.id);
      console.warn(`[OfflineQueue] Dropping entry ${entry.id} after ${MAX_RETRIES} retries`);
    } else {
      store.put(entry);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silent
  }
}

/** Get count of pending entries */
export async function getQueueSize(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

// ─── Drain (Sync to Supabase) ───────────────────────────────────────────────────

/** Check if we have network connectivity */
function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** Attempt to drain queued entries to Supabase */
async function drainQueue(): Promise<{ synced: number; failed: number }> {
  if (isDraining || !isOnline()) return { synced: 0, failed: 0 };
  isDraining = true;
  let synced = 0;
  let failed = 0;

  try {
    const entries = await getPendingEntries();
    if (entries.length === 0) {
      isDraining = false;
      return { synced: 0, failed: 0 };
    }

    console.info(`[OfflineQueue] Draining ${entries.length} queued entries...`);

    // Process in batches
    const batch = entries.slice(0, BATCH_SIZE);
    for (const entry of batch) {
      try {
        // Upload photo if present
        let imageUrl: string | undefined;
        if (entry.photoDataUrl) {
          try {
            const blob = await fetch(entry.photoDataUrl).then(r => r.blob());
            const path = `attendance/${entry.userId}/${Date.now()}-offline.jpg`;
            const { data: uploadData } = await supabase.storage
              .from('face-images')
              .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
            if (uploadData?.path) {
              const { data: urlData } = supabase.storage.from('face-images').getPublicUrl(uploadData.path);
              imageUrl = urlData?.publicUrl;
            }
          } catch {
            // Photo upload failed — still record attendance without photo
          }
        }

        const { error } = await supabase.from('attendance_records').insert({
          user_id: entry.userId,
          student_name: entry.studentName,
          timestamp: entry.timestamp,
          status: entry.status,
          source: entry.source,
          capture_mode: 'gate-mode',
          confidence_score: entry.confidence,
          image_url: imageUrl,
          device_info: {
            ...entry.metadata,
            offline_queued: true,
            offline_created_at: new Date(entry.createdAt).toISOString(),
            offline_synced_at: new Date().toISOString(),
          },
        });

        if (error) {
          console.warn(`[OfflineQueue] Sync failed for ${entry.studentName}:`, error.message);
          await incrementRetry(entry);
          failed++;
        } else {
          await removeEntry(entry.id);
          synced++;
          console.info(`[OfflineQueue] Synced: ${entry.studentName}`);
        }
      } catch (err) {
        console.warn(`[OfflineQueue] Entry sync error:`, err);
        await incrementRetry(entry);
        failed++;
      }
    }
  } finally {
    isDraining = false;
  }

  if (synced > 0) {
    console.info(`[OfflineQueue] Drain complete: ${synced} synced, ${failed} failed`);
  }
  return { synced, failed };
}

// ─── Auto-Drain Lifecycle ───────────────────────────────────────────────────────

/** Start the auto-drain timer that periodically syncs offline entries */
export function startOfflineQueueDrain(): void {
  if (drainTimer) return;

  // Drain immediately on start
  drainQueue().catch(() => {});

  // Set up periodic drain
  drainTimer = setInterval(() => {
    drainQueue().catch(() => {});
  }, DRAIN_INTERVAL_MS);

  // Also drain when coming back online
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.info('[OfflineQueue] Network restored — draining queue...');
      drainQueue().catch(() => {});
    });
  }

  console.info('[OfflineQueue] Auto-drain started');
}

/** Stop the auto-drain timer */
export function stopOfflineQueueDrain(): void {
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
}

/** Force an immediate drain attempt */
export async function forceDrain(): Promise<{ synced: number; failed: number }> {
  return drainQueue();
}
