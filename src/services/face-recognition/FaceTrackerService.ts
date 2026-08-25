/**
 * FaceTrackerService
 *
 * Lightweight IoU tracker with identity memory.
 *
 * Purpose: a detected face is recognised ONCE, given a track id, then simply
 * TRACKED for as long as it stays in view (plus a grace window). Recognition
 * only re-runs when a person leaves and re-enters — the technique commercial
 * systems use to hit real-time performance.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceTrack {
  id: number;
  box: Box;
  firstSeen: number;
  lastSeen: number;
  hits: number;
  missed: number;
  /** identity assigned after a successful recognition */
  identity: {
    userId: string;
    name: string;
    confidence: number;
    recognizedAt: number;
  } | null;
  /** true while a recognition request for this track is in flight */
  pending: boolean;
  /** recognition attempts that produced no match */
  failedAttempts: number;
}

export interface TrackerOptions {
  iouThreshold?: number;
  maxMissed?: number;
  identityTtlMs?: number;
  maxFailedAttempts?: number;
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.width * a.height + b.width * b.height - inter);
}

export function createFaceTracker(options: TrackerOptions = {}) {
  const iouThreshold = options.iouThreshold ?? 0.3;
  const maxMissed = options.maxMissed ?? 12;
  const identityTtlMs = options.identityTtlMs ?? 8000;
  const maxFailedAttempts = options.maxFailedAttempts ?? 3;

  let nextId = 1;
  let tracks: FaceTrack[] = [];

  function update(detections: Box[], now = Date.now()): FaceTrack[] {
    const used = new Set<number>();

    for (const track of tracks) {
      let bestIdx = -1;
      let bestIou = iouThreshold;
      detections.forEach((det, i) => {
        if (used.has(i)) return;
        const score = iou(track.box, det);
        if (score > bestIou) {
          bestIou = score;
          bestIdx = i;
        }
      });

      if (bestIdx >= 0) {
        used.add(bestIdx);
        const det = detections[bestIdx];
        // smooth the box to avoid overlay jitter
        track.box = {
          x: track.box.x * 0.35 + det.x * 0.65,
          y: track.box.y * 0.35 + det.y * 0.65,
          width: track.box.width * 0.35 + det.width * 0.65,
          height: track.box.height * 0.35 + det.height * 0.65,
        };
        track.lastSeen = now;
        track.hits += 1;
        track.missed = 0;
      } else {
        track.missed += 1;
      }
    }

    detections.forEach((det, i) => {
      if (used.has(i)) return;
      tracks.push({
        id: nextId++,
        box: det,
        firstSeen: now,
        lastSeen: now,
        hits: 1,
        missed: 0,
        identity: null,
        pending: false,
        failedAttempts: 0,
      });
    });

    for (const track of tracks) {
      if (track.identity && now - track.identity.recognizedAt > identityTtlMs) {
        track.identity = null;
        track.failedAttempts = 0;
      }
    }
    tracks = tracks.filter(t => t.missed <= maxMissed);

    return tracks;
  }

  /** Tracks that still need a recognition pass (recognise only new faces) */
  function pendingRecognition(minHits = 2): FaceTrack[] {
    return tracks.filter(
      t =>
        !t.identity &&
        !t.pending &&
        t.missed === 0 &&
        t.hits >= minHits &&
        t.failedAttempts < maxFailedAttempts,
    );
  }

  function markPending(id: number, pending: boolean): void {
    const t = tracks.find(x => x.id === id);
    if (t) t.pending = pending;
  }

  function assignIdentity(id: number, identity: FaceTrack['identity']): void {
    const t = tracks.find(x => x.id === id);
    if (!t) return;
    t.pending = false;
    if (identity) {
      t.identity = identity;
      t.failedAttempts = 0;
    } else {
      t.failedAttempts += 1;
    }
  }

  function getTracks(): FaceTrack[] {
    return tracks;
  }

  function reset(): void {
    tracks = [];
    nextId = 1;
  }

  return { update, pendingRecognition, markPending, assignIdentity, getTracks, reset };
}

export type FaceTracker = ReturnType<typeof createFaceTracker>;
