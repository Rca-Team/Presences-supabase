/**
 * RobustMatchService — high-recall wrapper around `recognizeFace`.
 *
 * The "Unrecognised for a registered user" failures in Original mode came from
 * matching a single RAW crop descriptor: face-api descriptors shift noticeably
 * with head roll, framing and scale, so a legitimate student could land just
 * outside the strict distance threshold.
 *
 * This helper builds several descriptors for the SAME face (raw detection,
 * eye-aligned canonical crop, padded crop, and a horizontally mirrored aligned
 * crop) and keeps the most confident verdict. Thresholds inside
 * `recognizeFace` are untouched, so no accuracy (precision) is traded away —
 * we only give the matcher better views of the same person.
 */
import * as faceapi from 'face-api.js';
import { recognizeFace } from './RecognitionService';
import { alignFace } from './FaceAlignmentService';

type Src = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

const mirror = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return c;
};

const paddedCrop = (source: Src, box: faceapi.Box, size = 150, pad = 0.28): HTMLCanvasElement => {
  const sw = (source as HTMLVideoElement).videoWidth || (source as HTMLCanvasElement).width;
  const sh = (source as HTMLVideoElement).videoHeight || (source as HTMLCanvasElement).height;
  const cw = Math.min(sw, box.width * (1 + pad * 2));
  const ch = Math.min(sh, box.height * (1 + pad * 2));
  const cx = Math.max(0, box.x - box.width * pad);
  const cy = Math.max(0, box.y - box.height * pad);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.getContext('2d')!.drawImage(source, cx, cy, cw, ch, 0, 0, size, size);
  return c;
};

/** Build multiple descriptors (views) for one detected face. */
export async function buildFaceCandidates(
  source: Src,
  detection: { detection: { box: faceapi.Box }; landmarks?: faceapi.FaceLandmarks68; descriptor?: Float32Array },
): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  if (detection.descriptor?.length === 128) out.push(detection.descriptor);

  const views: HTMLCanvasElement[] = [];
  try {
    if (detection.landmarks) {
      const aligned = alignFace(source, detection.landmarks, 150);
      views.push(aligned, mirror(aligned));
    }
  } catch { /* alignment optional */ }
  try {
    views.push(paddedCrop(source, detection.detection.box));
  } catch { /* crop optional */ }

  for (const view of views) {
    try {
      const d = (await faceapi.computeFaceDescriptor(view)) as Float32Array;
      if (d?.length === 128) out.push(d);
    } catch { /* skip view */ }
  }
  return out;
}

export interface RobustMatch {
  recognized: boolean;
  employee?: any;
  confidence: number;
  strictMetrics?: any;
  descriptor?: Float32Array;
}

/** Try every view of the face and keep the most confident accepted match. */
export async function recognizeFaceRobust(
  source: Src,
  detection: { detection: { box: faceapi.Box }; landmarks?: faceapi.FaceLandmarks68; descriptor?: Float32Array },
): Promise<RobustMatch> {
  const candidates = await buildFaceCandidates(source, detection);
  let best: RobustMatch = { recognized: false, confidence: 0 };

  for (const cand of candidates) {
    try {
      const rec = await recognizeFace(cand);
      const conf = rec.confidence ?? 0;
      if (rec.recognized && rec.employee && conf > best.confidence) {
        best = {
          recognized: true,
          employee: rec.employee,
          confidence: conf,
          strictMetrics: rec.strictMetrics,
          descriptor: cand,
        };
      }
      if (best.confidence >= 0.88) break; // already certain — stop early for latency
    } catch { /* try next view */ }
  }
  return best;
}

/** Same as above but for an already-captured set of descriptors (loop mode). */
export async function recognizeBestOf(descriptors: Float32Array[]): Promise<RobustMatch> {
  let best: RobustMatch = { recognized: false, confidence: 0 };
  for (const cand of descriptors) {
    try {
      const rec = await recognizeFace(cand);
      const conf = rec.confidence ?? 0;
      if (rec.recognized && rec.employee && conf > best.confidence) {
        best = { recognized: true, employee: rec.employee, confidence: conf, strictMetrics: rec.strictMetrics, descriptor: cand };
      }
      if (best.confidence >= 0.88) break;
    } catch { /* ignore */ }
  }
  return best;
}
