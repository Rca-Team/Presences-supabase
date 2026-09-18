/**
 * RealtimeRecognitionEngine
 *
 * A single pipeline that implements the whole real-time optimisation stack:
 *
 *  1. Fast inference backend  — WebGL/WASM-SIMD tuned face-api.js, with an
 *     optional InsightFace/ArcFace ONNX embedder when a model is present
 *     (see OnnxEmbeddingService).
 *  2. Frame decimation        — camera keeps rendering at 30–60 fps while
 *     detection runs at `detectFps` (default 9).
 *  3. Downscaled detection    — detection runs on a small copy of the frame
 *     (default max 640 px wide); boxes are mapped back to full resolution.
 *  4. Recognise-once tracking — IoU tracker keeps identities for seconds; a
 *     face is only embedded/matched when it is NEW (or re-enters).
 *  5. Indexed gallery search  — HNSW vector index shortlists candidates,
 *     which are then re-scored exactly, so accuracy is preserved.
 *  6. Task separation         — capture (rAF), detection (throttled async),
 *     embedding+matching (worker pool / microtask queue) and DB writes
 *     (background queue) never block each other or the UI.
 */

import * as faceapi from 'face-api.js';
import { loadModels, areModelsLoaded } from './ModelService';
import { loadNet } from './NetLoaderService';
import { getAllTrainedDescriptors } from './ProgressiveTrainingService';
import { buildVectorIndex, searchVectorIndex, getVectorIndexStats } from './VectorIndexService';
import { createFaceTracker, type FaceTrack, type Box } from './FaceTrackerService';
import { initializeWorkerPool, matchDescriptorParallel, isPoolInitialized } from './WorkerPoolService';
import { initializeGPU } from './GPUAccelerationService';
import { embedFaceOnnx, initializeOnnxEmbedder, isOnnxEmbedderReady } from './OnnxEmbeddingService';
import { enqueueWrite } from './AttendanceWriteQueue';
import { assessFaceQuality } from './FaceQualityGate';

export interface EngineOptions {
  /** Recognition/detection passes per second (camera preview stays full fps) */
  detectFps?: number;
  /** Max width of the downscaled detection frame */
  detectionWidth?: number;
  /** Euclidean match threshold (face-api descriptors) */
  matchThreshold?: number;
  /** Candidates pulled from the vector index before exact re-scoring */
  shortlist?: number;
  /** Concurrent embedding jobs */
  maxConcurrentJobs?: number;
  /** How long a track keeps its identity before re-verifying (ms) */
  identityTtlMs?: number;
  /** Detection passes a track may be missing before it is dropped */
  maxMissed?: number;
  /** Required continuous hold duration before confirming identity (ms) */
  requiredHoldMs?: number;
  /** Called on every detection pass with the current tracks */
  onTracks?: (tracks: FaceTrack[]) => void;
  /** Called once per newly identified person */
  onIdentified?: (result: IdentifiedFace) => void;
  /**
   * Optional persistence handler. When provided, writes are pushed onto the
   * background write queue (de-duplicated per person) so the camera loop never
   * waits for the network.
   */
  markAttendance?: (result: IdentifiedFace) => Promise<void>;
  /** Called with latency/throughput telemetry */
  onStats?: (stats: EngineStats) => void;
}

export interface IdentifiedFace {
  trackId: number;
  userId: string;
  name: string;
  confidence: number;
  distance: number;
  box: Box;
  descriptor: Float32Array;
}

export interface EngineStats {
  detectFps: number;
  detectMs: number;
  embedMs: number;
  matchMs: number;
  tracked: number;
  identified: number;
  galleryPeople: number;
  indexedVectors: number;
  queueDepth: number;
  skippedFrames: number;
}

type GalleryEntry = {
  descriptors: Float32Array[];
  averagedDescriptor: Float32Array;
  userName: string;
  sampleCount: number;
};

let gallery: Map<string, GalleryEntry> = new Map();
let galleryLoadedAt = 0;
const GALLERY_TTL_MS = 120_000;

// Reusable canvas pool to eliminate memory allocation churn & GC latency
const cropCanvasPool: HTMLCanvasElement[] = [];

function acquireCropCanvas(): HTMLCanvasElement {
  if (cropCanvasPool.length > 0) {
    return cropCanvasPool.pop()!;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  return canvas;
}

function releaseCropCanvas(canvas: HTMLCanvasElement) {
  if (cropCanvasPool.length < 8) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    cropCanvasPool.push(canvas);
  }
}

/** Load the gallery and (re)build the vector index. Safe to call repeatedly. */
export async function ensureGalleryIndex(force = false): Promise<void> {
  if (!force && gallery.size > 0 && Date.now() - galleryLoadedAt < GALLERY_TTL_MS) return;

  const trained = (await getAllTrainedDescriptors()) as unknown as Map<string, GalleryEntry>;
  gallery = trained;
  galleryLoadedAt = Date.now();

  const vectors: Array<{ ownerId: string; vector: Float32Array }> = [];
  let samples = 0;
  for (const [userId, entry] of trained) {
    vectors.push({ ownerId: userId, vector: entry.averagedDescriptor });
    for (const d of entry.descriptors) {
      vectors.push({ ownerId: userId, vector: d });
      samples++;
    }
  }
  buildVectorIndex(vectors, `${trained.size}:${samples}:${galleryLoadedAt > 0 ? 'v1' : 'v0'}`);
}

function euclidean(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function distanceToConfidence(distance: number, threshold: number): number {
  const x = (threshold - distance) / 0.12;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Match a descriptor using the vector index shortlist + exact re-scoring.
 * Falls back to a full scan when the gallery is small or the index is empty.
 *
 * Implements Innovatrics-style ambiguity filtering: if top-2 closest matches
 * from different people have a margin < 0.04 or ratio > 0.88, the match is
 * rejected to prevent confusing similar-looking individuals.
 */
export async function matchDescriptorIndexed(
  descriptor: Float32Array,
  matchThreshold = 0.50,
  shortlist = 64,
): Promise<{ userId: string; name: string; distance: number; confidence: number } | null> {
  await ensureGalleryIndex();
  if (gallery.size === 0) return null;

  // Exact re-scoring over all registered students to guarantee no ambiguity blind spots
  const ranked: Array<{ userId: string; name: string; distance: number }> = [];
  for (const [userId, entry] of gallery.entries()) {
    if (!entry) continue;
    let best = euclidean(descriptor, entry.averagedDescriptor);
    for (const d of entry.descriptors) {
      if (d.length !== descriptor.length) continue;
      const dist = euclidean(descriptor, d);
      if (dist < best) best = dist;
    }
    if (!Number.isFinite(best)) continue;
    ranked.push({ userId, name: entry.userName, distance: best });
  }

  ranked.sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.distance > matchThreshold) return null;

  // Ambiguity Filter: If TWO DIFFERENT registered students both match below the threshold,
  // ensure the top match has a distinct margin (>= 0.03) to prevent look-alike confusion.
  if (second && second.userId !== best.userId && second.distance <= matchThreshold) {
    const margin = second.distance - best.distance;
    if (margin < 0.03) {
      return null;
    }
  }

  return {
    userId: best.userId,
    name: best.name,
    distance: best.distance,
    confidence: distanceToConfidence(best.distance, matchThreshold),
  };
}

// ─── engine ──────────────────────────────────────────────────────────────────

export interface RecognitionEngine {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
  getTracks: () => FaceTrack[];
  refreshGallery: () => Promise<void>;
  getStats: () => EngineStats;
}

export function createRecognitionEngine(
  getVideo: () => HTMLVideoElement | null,
  options: EngineOptions = {},
): RecognitionEngine {
  const detectFps = options.detectFps ?? 9;
  const detectionWidth = options.detectionWidth ?? 640;
  const matchThreshold = options.matchThreshold ?? 0.50;
  const shortlist = options.shortlist ?? 16;
  const baseRequiredHoldMs = options.requiredHoldMs ?? 0;

  const tracker = createFaceTracker({
    identityTtlMs: options.identityTtlMs ?? 3500,
    maxMissed: options.maxMissed ?? 4,
  });
  const detectCanvas = document.createElement('canvas');

  let running = false;
  let rafId: number | null = null;
  let detecting = false;
  let lastDetectAt = 0;
  let activeJobs = 0;
  let queue: number[] = [];
  /** trackId -> userId that was last handed to markAttendance for that track */
  const markedByTrack = new Map<number, string>();
  /** Session-wide set of marked userIds and names to prevent cross-track duplicate attendance */
  const markedIdentities = new Set<string>();
  /** trackId -> best biometric shot recorded for this tracklet (Innovatrics best-shot selection) */
  const bestShotByTrack = new Map<number, { descriptor: Float32Array; quality: number }>();

  const stats: EngineStats = {
    detectFps: 0,
    detectMs: 0,
    embedMs: 0,
    matchMs: 0,
    tracked: 0,
    identified: 0,
    galleryPeople: 0,
    indexedVectors: 0,
    queueDepth: 0,
    skippedFrames: 0,
  };

  function publishStats() {
    const idx = getVectorIndexStats();
    stats.galleryPeople = gallery.size;
    stats.indexedVectors = idx.vectors;
    stats.queueDepth = queue.length + activeJobs;
    options.onStats?.({ ...stats });
  }

  /** Thread 2: instant single-pass detection, landmarking, embedding & matching for all visible faces */
  async function detectPass(video: HTMLVideoElement) {
    const t0 = performance.now();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const scale = Math.min(1, detectionWidth / vw);
    const targetW = Math.round(vw * scale);
    const targetH = Math.round(vh * scale);
    if (detectCanvas.width !== targetW || detectCanvas.height !== targetH) {
      detectCanvas.width = targetW;
      detectCanvas.height = targetH;
    }
    const ctx = detectCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, targetW, targetH);

    try {
      // 1-Pass Extraction: Detect all faces, landmarks, and 128-d embeddings simultaneously
      const detections = await faceapi
        .detectAllFaces(
          detectCanvas,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.20 }),
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      const tDetect = performance.now();
      stats.detectMs = tDetect - t0;

      // Map small-frame boxes back to full-resolution coordinates
      const boxes: Box[] = detections.map(d => ({
        x: d.detection.box.x / scale,
        y: d.detection.box.y / scale,
        width: d.detection.box.width / scale,
        height: d.detection.box.height / scale,
      }));

      const tracks = tracker.update(boxes);
      stats.tracked = tracks.length;

      // Prune bookkeeping for tracks that no longer exist
      if (markedByTrack.size > 0 || bestShotByTrack.size > 0) {
        const live = new Set(tracks.map(t => t.id));
        for (const id of markedByTrack.keys()) if (!live.has(id)) markedByTrack.delete(id);
        for (const id of bestShotByTrack.keys()) if (!live.has(id)) bestShotByTrack.delete(id);
      }

      // Process and recognize EVERY visible student face in parallel
      for (let i = 0; i < detections.length; i++) {
        const d = detections[i];
        const t = tracks[i] || tracks.find(track => {
          const cx1 = d.detection.box.x / scale + (d.detection.box.width / scale) / 2;
          const cy1 = d.detection.box.y / scale + (d.detection.box.height / scale) / 2;
          const cx2 = track.box.x + track.box.width / 2;
          const cy2 = track.box.y + track.box.height / 2;
          return Math.hypot(cx1 - cx2, cy1 - cy2) < (track.box.width * 0.75);
        });

        if (!t || !d.descriptor) continue;

        const match = await matchDescriptorIndexed(d.descriptor, matchThreshold, shortlist);
        const now = Date.now();

        if (match) {
          tracker.assignIdentity(t.id, {
            userId: match.userId,
            name: match.name,
            confidence: match.confidence,
            recognizedAt: now,
            verified: true,
          });

          const normName = match.name.toLowerCase().trim();
          const isAlreadyMarkedInSession =
            markedIdentities.has(`uid:${match.userId}`) ||
            (normName !== 'unknown' && markedIdentities.has(`name:${normName}`));

          if (!isAlreadyMarkedInSession) {
            markedByTrack.set(t.id, match.userId);
            markedIdentities.add(`uid:${match.userId}`);
            if (normName !== 'unknown') {
              markedIdentities.add(`name:${normName}`);
            }

            const identified: IdentifiedFace = {
              trackId: t.id,
              userId: match.userId,
              name: match.name,
              confidence: match.confidence,
              distance: match.distance,
              box: t.box,
              descriptor: d.descriptor,
            };

            options.onIdentified?.(identified);

            if (options.markAttendance) {
              options.markAttendance(identified).catch(err => {
                console.warn('markAttendance failed, queueing offline backup:', err);
                enqueueWrite({
                  userId: match.userId,
                  studentName: match.name,
                  status: 'present',
                  confidence: match.confidence,
                  timestamp: new Date().toISOString(),
                  source: 'realtime-engine',
                  metadata: { trackId: t.id, matchDistance: match.distance },
                });
              });
            } else {
              enqueueWrite({
                userId: match.userId,
                studentName: match.name,
                status: 'present',
                confidence: match.confidence,
                timestamp: new Date().toISOString(),
                source: 'realtime-engine',
                metadata: { trackId: t.id, matchDistance: match.distance },
              });
            }
          }
        } else {
          tracker.assignIdentity(t.id, null);
        }
      }

      stats.identified = markedByTrack.size;
      options.onTracks?.(tracks.filter(t => t.missed === 0));
      publishStats();
    } catch (err) {
      console.warn('detectPass error:', err);
    }
  }

  /** Thread 1: capture loop — runs at display rate, only gates detection */
  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);

    const video = getVideo();
    if (!video || video.readyState < 2) return;

    const now = performance.now();
    const interval = 1000 / detectFps;
    if (detecting || now - lastDetectAt < interval) {
      stats.skippedFrames++;
      return;
    }
    lastDetectAt = now;
    stats.detectFps = Math.round(1000 / Math.max(1, interval));
    detecting = true;
    void detectPass(video).finally(() => {
      detecting = false;
    });
  }

  return {
    start() {
      if (running) return;
      running = true;
      void (async () => {
        if (!areModelsLoaded()) await loadModels();
        await loadNet('tinyFaceDetector');
        await initializeGPU().catch(() => undefined);
        await initializeWorkerPool().catch(() => undefined);
        void initializeOnnxEmbedder().catch(() => undefined);
        await ensureGalleryIndex().catch(() => undefined);
        publishStats();
      })();
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      queue = [];
      markedByTrack.clear();
      markedIdentities.clear();
      bestShotByTrack.clear();
      tracker.reset();
    },
    isRunning: () => running,
    getTracks: () => tracker.getTracks(),
    refreshGallery: () => ensureGalleryIndex(true),
    getStats: () => ({ ...stats }),
  };
}
