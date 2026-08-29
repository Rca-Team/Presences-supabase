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
 */
export async function matchDescriptorIndexed(
  descriptor: Float32Array,
  matchThreshold = 0.41,
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
  if (!best || best.distance > matchThreshold) return null;

  // Strict Ambiguity Guard:
  // If the best match distance is within 80% of the second best match (different student),
  // reject to prevent lookalikes from misidentifying!
  const second = ranked.find(
    r => r.userId !== best.userId && r.name.trim().toLowerCase() !== best.name.trim().toLowerCase()
  );
  if (second && (best.distance / second.distance) > 0.80) {
    console.log(`Rejecting ambiguous real-time match: best=${best.name} (${best.distance.toFixed(3)}) vs second=${second.name} (${second.distance.toFixed(3)})`);
    return null;
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
  const matchThreshold = options.matchThreshold ?? 0.45;
  const shortlist = options.shortlist ?? 16;
  const maxConcurrentJobs = options.maxConcurrentJobs ?? 2;

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

  /** Thread 2: detection on a downscaled frame, throttled to detectFps */
  async function detectPass(video: HTMLVideoElement) {
    const t0 = performance.now();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const scale = Math.min(1, detectionWidth / vw);
    detectCanvas.width = Math.round(vw * scale);
    detectCanvas.height = Math.round(vh * scale);
    const ctx = detectCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, detectCanvas.width, detectCanvas.height);

    const detections = await faceapi.detectAllFaces(
      detectCanvas,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }),
    );

    // Map small-frame boxes back to full-resolution coordinates
    const boxes: Box[] = detections.map(d => ({
      x: d.box.x / scale,
      y: d.box.y / scale,
      width: d.box.width / scale,
      height: d.box.height / scale,
    }));

    const tracks = tracker.update(boxes);
    stats.detectMs = performance.now() - t0;
    stats.tracked = tracks.length;
    stats.identified = markedByTrack.size;

    // Prune bookkeeping for tracks that no longer exist
    if (markedByTrack.size > 0) {
      const live = new Set(tracks.map(t => t.id));
      for (const id of markedByTrack.keys()) if (!live.has(id)) markedByTrack.delete(id);
    }

    // Only surface freshly-seen tracks so overlay boxes never linger
    options.onTracks?.(tracks.filter(t => t.missed === 0));


    // Queue only NEW faces for recognition
    for (const t of tracker.pendingRecognition()) {
      if (!queue.includes(t.id)) queue.push(t.id);
    }
    void pumpQueue(video);
    publishStats();
  }

  /** Thread 3: embedding + indexed matching, bounded concurrency */
  async function pumpQueue(video: HTMLVideoElement) {
    while (activeJobs < maxConcurrentJobs && queue.length > 0) {
      const trackId = queue.shift()!;
      const track = tracker.getTracks().find(t => t.id === trackId);
      if (!track || track.identity) continue;
      activeJobs++;
      tracker.markPending(trackId, true);
      void recognizeTrack(video, track).finally(() => {
        activeJobs--;
        tracker.markPending(trackId, false);
        // Keep draining immediately when a recognition slot becomes free.
        // Waiting for the next detection pass can strand queued students when
        // the camera frame is briefly static or throttled by the browser.
        if (running && queue.length > 0) void pumpQueue(video);
      });
    }
  }

  async function recognizeTrack(video: HTMLVideoElement, track: FaceTrack) {
    try {
      // Crop at FULL resolution around the tracked box (best quality for the embedder)
      const pad = 0.28;
      const sx = Math.max(0, track.box.x - track.box.width * pad);
      const sy = Math.max(0, track.box.y - track.box.height * pad);
      const sw = Math.min(video.videoWidth - sx, track.box.width * (1 + pad * 2));
      const sh = Math.min(video.videoHeight - sy, track.box.height * (1 + pad * 2));
      if (sw < 40 || sh < 40) {
        tracker.assignIdentity(track.id, null);
        return;
      }

      const cropCanvas = acquireCropCanvas();
      const cctx = cropCanvas.getContext('2d', { willReadFrequently: true });
      if (!cctx) {
        releaseCropCanvas(cropCanvas);
        return;
      }
      cctx.drawImage(video, sx, sy, sw, sh, 0, 0, 224, 224);

      try {
        const tEmbed = performance.now();

        // Fast path: InsightFace/ArcFace via ONNX Runtime (WebGPU/WASM-SIMD).
        // Only used when the gallery itself is 512-dim ArcFace, so embeddings are
        // always compared within the same space.
        let onnxEmbedding: Float32Array | null = null;
        if (getVectorIndexStats().dimension === 512 && isOnnxEmbedderReady()) {
          onnxEmbedding = await embedFaceOnnx(cropCanvas);
        }

        const det = onnxEmbedding
          ? ({ descriptor: onnxEmbedding } as { descriptor: Float32Array })
          : await faceapi
              .detectSingleFace(cropCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
              .withFaceLandmarks()
              .withFaceDescriptor();
        stats.embedMs = performance.now() - tEmbed;

        if (!det) {
          tracker.assignIdentity(track.id, null);
          return;
        }

        const tMatch = performance.now();
        let match = await matchDescriptorIndexed(det.descriptor, matchThreshold, shortlist);

        // Offload a parallel verification to the worker pool when available
        if (!match && isPoolInitialized()) {
          const registered = Array.from(gallery.entries()).map(([id, e]) => ({
            id,
            name: e.userName,
            descriptor: Array.from(e.averagedDescriptor),
          }));
          const parallel = await matchDescriptorParallel(det.descriptor, registered, matchThreshold);
          if (parallel?.match) {
            match = {
              userId: parallel.match.id,
              name: parallel.match.name,
              distance: parallel.distance,
              confidence: parallel.confidence,
            };
          }
        }
        stats.matchMs = performance.now() - tMatch;

        if (!match) {
          tracker.assignIdentity(track.id, null);
          publishStats();
          return;
        }
      } finally {
        releaseCropCanvas(cropCanvas);
      }

      tracker.assignIdentity(track.id, {
        userId: match.userId,
        name: match.name,
        confidence: match.confidence,
        recognizedAt: Date.now(),
      });

      // Fire per *person*, not per track id: a track can be reused by the next
      // person standing in the same spot, and identities re-verify on TTL.
      if (markedByTrack.get(track.id) !== match.userId) {
        markedByTrack.set(track.id, match.userId);
        const identified: IdentifiedFace = {
          trackId: track.id,
          userId: match.userId,
          name: match.name,
          confidence: match.confidence,
          distance: match.distance,
          box: track.box,
          descriptor: det.descriptor,
        };
        options.onIdentified?.(identified);

        // Thread 4: database updates run off the recognition path.
        // A hard timeout guarantees one slow write can never occupy a queue slot
        // and stall attendance marking for everybody behind it.
        if (options.markAttendance) {
          const handler = options.markAttendance;
          enqueueWrite({
            key: `attendance:${match.userId}:${Math.floor(Date.now() / 30_000)}`,
            payload: identified,
            run: face =>
              Promise.race([
                handler(face),
                new Promise<void>((_, reject) =>
                  setTimeout(() => reject(new Error('attendance write timed out')), 15_000),
                ),
              ]),
          });
        }

      }
      publishStats();
    } catch (err) {
      console.warn('recognizeTrack failed:', err);
      tracker.assignIdentity(track.id, null);
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
      tracker.reset();
    },
    isRunning: () => running,
    getTracks: () => tracker.getTracks(),
    refreshGallery: () => ensureGalleryIndex(true),
    getStats: () => ({ ...stats }),
  };
}
