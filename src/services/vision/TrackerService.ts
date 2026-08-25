/**
 * TrackerService — SORT-style IoU + centroid + appearance-histogram tracker.
 * Persists identity even when the face is not visible.
 */
import type { PersonBox } from './PersonDetector';

export interface Track {
  id: string;
  box: PersonBox;
  history: Array<{ x: number; y: number; t: number }>;
  firstSeen: number;
  lastSeen: number;
  missedFrames: number;
  appearance: Float32Array | null; // HSV histogram, 48 bins
  identity: { subjectId: string | null; subjectName: string; subjectType: 'student' | 'teacher' | 'unknown'; confidence: number } | null;
  zone: string | null;
  zoneEnteredAt: number;
  dwellSecondsByZone: Record<string, number>;
}

const IOU_MATCH = 0.25;
const MAX_MISSED = 15; // frames
const APPEARANCE_BINS = 48;

function iou(a: PersonBox, b: PersonBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni <= 0 ? 0 : inter / uni;
}

function centroidDist(a: PersonBox, b: PersonBox): number {
  const dx = (a.x + a.w / 2) - (b.x + b.w / 2);
  const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeAppearance(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  box: PersonBox,
): Float32Array | null {
  // Torso region: middle 60% vertical, middle 80% horizontal of the box
  const tx = Math.max(0, Math.floor(box.x + box.w * 0.1));
  const ty = Math.max(0, Math.floor(box.y + box.h * 0.25));
  const tw = Math.max(4, Math.floor(box.w * 0.8));
  const th = Math.max(4, Math.floor(box.h * 0.5));
  if (tx + tw > video.videoWidth || ty + th > video.videoHeight) return null;
  canvas.width = 32;
  canvas.height = 32;
  try {
    ctx.drawImage(video, tx, ty, tw, th, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    const hist = new Float32Array(APPEARANCE_BINS);
    // 16 hue bins × 3 value bins (48 total)
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const v = max;
      const s = max === 0 ? 0 : (max - min) / max;
      let h = 0;
      if (max !== min) {
        if (max === r) h = ((g - b) / (max - min)) % 6;
        else if (max === g) h = (b - r) / (max - min) + 2;
        else h = (r - g) / (max - min) + 4;
      }
      h = ((h * 60) + 360) % 360;
      const hBin = Math.min(15, Math.floor(h / 22.5));
      const vBin = Math.min(2, Math.floor(v * 3));
      // Only weight saturated pixels to avoid background bias
      const w = s > 0.15 ? 1 : 0.15;
      hist[hBin * 3 + vBin] += w;
      total += w;
    }
    if (total > 0) for (let i = 0; i < hist.length; i++) hist[i] /= total;
    return hist;
  } catch {
    return null;
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class Tracker {
  private tracks: Map<string, Track> = new Map();
  private lostTracks: Track[] = []; // for re-id
  private LOST_TTL_MS = 90_000;

  getTracks(): Track[] { return Array.from(this.tracks.values()); }

  update(detections: PersonBox[], appearances: Array<Float32Array | null>, now: number): Track[] {
    const active = Array.from(this.tracks.values());
    const usedDet = new Set<number>();
    const usedTrack = new Set<string>();

    // 1) Match by IoU
    const pairs: Array<{ trackIdx: number; detIdx: number; score: number }> = [];
    for (let i = 0; i < active.length; i++) {
      for (let j = 0; j < detections.length; j++) {
        const s = iou(active[i].box, detections[j]);
        if (s >= IOU_MATCH) pairs.push({ trackIdx: i, detIdx: j, score: s });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    for (const p of pairs) {
      if (usedTrack.has(active[p.trackIdx].id) || usedDet.has(p.detIdx)) continue;
      const tr = active[p.trackIdx];
      const det = detections[p.detIdx];
      this.applyUpdate(tr, det, appearances[p.detIdx], now);
      usedTrack.add(tr.id);
      usedDet.add(p.detIdx);
    }

    // 2) Fallback: centroid distance for unmatched
    for (let j = 0; j < detections.length; j++) {
      if (usedDet.has(j)) continue;
      let best: { tr: Track; d: number } | null = null;
      for (const tr of active) {
        if (usedTrack.has(tr.id)) continue;
        const d = centroidDist(tr.box, detections[j]);
        if (d < Math.max(tr.box.w, tr.box.h) * 0.9) {
          if (!best || d < best.d) best = { tr, d };
        }
      }
      if (best) {
        this.applyUpdate(best.tr, detections[j], appearances[j], now);
        usedTrack.add(best.tr.id);
        usedDet.add(j);
      }
    }

    // 3) Age unmatched tracks
    for (const tr of active) {
      if (usedTrack.has(tr.id)) continue;
      tr.missedFrames++;
      if (tr.missedFrames > MAX_MISSED) {
        this.tracks.delete(tr.id);
        this.lostTracks.push({ ...tr, lastSeen: now });
      }
    }

    // 4) New tracks — try re-id against lostTracks first
    this.pruneLost(now);
    for (let j = 0; j < detections.length; j++) {
      if (usedDet.has(j)) continue;
      const app = appearances[j];
      let reused: Track | null = null;
      if (app) {
        for (let li = 0; li < this.lostTracks.length; li++) {
          const lt = this.lostTracks[li];
          if (!lt.appearance) continue;
          const sim = cosine(app, lt.appearance);
          if (sim > 0.85) {
            reused = lt;
            this.lostTracks.splice(li, 1);
            break;
          }
        }
      }
      const id = reused?.id ?? crypto.randomUUID();
      const det = detections[j];
      const tr: Track = reused ? {
        ...reused,
        box: det,
        history: [...reused.history, { x: det.x + det.w / 2, y: det.y + det.h / 2, t: now }].slice(-30),
        lastSeen: now,
        missedFrames: 0,
        appearance: app ?? reused.appearance,
      } : {
        id,
        box: det,
        history: [{ x: det.x + det.w / 2, y: det.y + det.h / 2, t: now }],
        firstSeen: now,
        lastSeen: now,
        missedFrames: 0,
        appearance: app,
        identity: null,
        zone: null,
        zoneEnteredAt: now,
        dwellSecondsByZone: {},
      };
      this.tracks.set(id, tr);
    }

    return this.getTracks();
  }

  private applyUpdate(tr: Track, det: PersonBox, app: Float32Array | null, now: number) {
    tr.box = det;
    tr.history.push({ x: det.x + det.w / 2, y: det.y + det.h / 2, t: now });
    if (tr.history.length > 30) tr.history.shift();
    tr.lastSeen = now;
    tr.missedFrames = 0;
    if (app) {
      // Running average for appearance
      if (!tr.appearance) tr.appearance = app;
      else for (let i = 0; i < app.length; i++) tr.appearance[i] = tr.appearance[i] * 0.9 + app[i] * 0.1;
    }
  }

  private pruneLost(now: number) {
    this.lostTracks = this.lostTracks.filter((t) => now - t.lastSeen < this.LOST_TTL_MS);
  }

  bindIdentity(trackId: string, identity: Track['identity']) {
    const tr = this.tracks.get(trackId);
    if (tr) tr.identity = identity;
  }

  reset() {
    this.tracks.clear();
    this.lostTracks = [];
  }
}
