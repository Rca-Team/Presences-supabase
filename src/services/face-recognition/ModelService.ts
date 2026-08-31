/**
 * ModelService
 *
 * Loads face-api.js models and exposes two descriptor-extraction paths:
 *
 *   getFaceDescriptor()       — legacy path (raw bounding-box crop), kept for
 *                               backward-compatibility.
 *
 *   getAlignedFaceDescriptor() — RECOMMENDED path that:
 *                                1. Detects the face + 68 landmarks with SSD MobileNetV1
 *                                2. Checks frontal-face orientation
 *                                3. Applies similarity-transform alignment to 112 × 112
 *                                4. Scores image quality and rejects blurry / dark captures
 *                                5. Runs FaceRecognitionNet on the aligned crop
 *
 * Alignment dramatically improves FaceRecognitionNet accuracy because the model
 * was trained on aligned faces.
 */

import * as faceapi from 'face-api.js';
import { alignFace, isFaceFrontal } from './FaceAlignmentService';
import { scoreFaceQuality } from './FaceQualityService';
import { loadNets, areNetsLoaded, type NetName } from './NetLoaderService';

// ─── state ───────────────────────────────────────────────────────────────────

const CORE_NETS: NetName[] = [
  'ssdMobilenetv1',
  'tinyFaceDetector',
  'faceLandmark68Net',
  'faceRecognitionNet',
];
const GATE_NETS: NetName[] = ['ssdMobilenetv1', 'faceLandmark68Net', 'faceRecognitionNet'];

let loadPromise: Promise<void> | null = null;

// ─── model loading ───────────────────────────────────────────────────────────

/**
 * Load the core face-api nets. All callers share ONE promise — no duplicate
 * weight fetches, no polling waiter that can time out while another caller is
 * still downloading the same shards.
 */
export async function loadModels(): Promise<void> {
  if (areNetsLoaded(CORE_NETS)) return;
  if (loadPromise) return loadPromise;

  console.log('Loading face recognition models…');
  loadPromise = loadNets(CORE_NETS)
    .then(() => {
      console.log('All face-api.js models loaded successfully');
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function areModelsLoaded(): boolean {
  return areNetsLoaded(CORE_NETS);
}

export async function forceReloadModels(): Promise<void> {
  loadPromise = null;
  return loadModels();
}

export async function loadGateDetectionModels(): Promise<void> {
  await loadNets(GATE_NETS);
}

export function areGateDetectionModelsLoaded(): boolean {
  return areNetsLoaded(GATE_NETS);
}


// ─── serialisation helpers ───────────────────────────────────────────────────

export function descriptorToString(d: Float32Array): string {
  return JSON.stringify(Array.from(d));
}

export function stringToDescriptor(s: string): Float32Array {
  return new Float32Array(JSON.parse(s));
}

// ─── legacy path (kept for backward compat) ──────────────────────────────────

/**
 * Extract a 128-dim descriptor from a raw video/image element.
 * Uses SSD MobileNetV1 detection but NO alignment step.
 *
 * Prefer `getAlignedFaceDescriptor` for new callers.
 */
export async function getFaceDescriptor(
  imageElement: HTMLImageElement | HTMLVideoElement,
  minFaceSize = 80
): Promise<Float32Array | null> {
  if (!areModelsLoaded()) await loadModels();

  // Wait for media to be ready
  if (imageElement instanceof HTMLVideoElement) {
    if (imageElement.readyState < 2 || imageElement.videoWidth === 0) {
      await new Promise<void>(resolve => {
        const check = () => {
          if (imageElement.readyState >= 2 && imageElement.videoWidth > 0) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }
  } else if (!imageElement.complete) {
    await new Promise<void>(resolve => {
      imageElement.onload = () => resolve();
    });
  }

  try {
    const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    const det  = await faceapi
      .detectSingleFace(imageElement, opts)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) return null;

    const { width, height } = det.detection.box;
    if (Math.min(width, height) < minFaceSize) {
      console.log(`Face too small (${Math.round(Math.min(width, height))} px) — move closer`);
      return null;
    }

    return det.descriptor;
  } catch (err) {
    console.error('getFaceDescriptor error:', err);
    return null;
  }
}

// ─── aligned path (RECOMMENDED) ─────────────────────────────────────────────

export interface AlignedDescriptorResult {
  descriptor: Float32Array;
  qualityScore: number;
  qualityReport: { sharpness: number; brightness: number; sizeScore: number };
  aligned: boolean;
}

/**
 * Extract a 128-dim descriptor with full alignment + quality gating.
 *
 * Returns null if:
 *   - No face is detected
 *   - Face is too small
 *   - Face is not roughly frontal
 *   - Image quality is too poor (blurry / dark)
 *
 * @param source      - Live video frame or image element.
 * @param minFaceSize - Minimum bounding-box dimension in pixels (default 80).
 * @param qualityGate - Reject captures below this quality score [0–1] (default 0.30).
 */
export async function getAlignedFaceDescriptor(
  source: HTMLVideoElement | HTMLImageElement,
  minFaceSize = 80,
  qualityGate = 0.30
): Promise<AlignedDescriptorResult | null> {
  if (!areModelsLoaded()) await loadModels();

  try {
    const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    const det  = await faceapi
      .detectSingleFace(source, opts)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) {
      console.log('getAlignedFaceDescriptor: no face detected');
      return null;
    }

    const box = det.detection.box;
    if (Math.min(box.width, box.height) < minFaceSize) {
      console.log(`Face too small (${Math.round(Math.min(box.width, box.height))} px)`);
      return null;
    }

    // Frontal-face check
    if (!isFaceFrontal(det.landmarks)) {
      console.log('Face rejected: not sufficiently frontal (side profile)');
      return null;
    }

    // Align to canonical 112 × 112
    const aligned = alignFace(source, det.landmarks, 112);

    // Quality gate on the aligned crop
    const quality = scoreFaceQuality(aligned, { width: box.width, height: box.height });
    if (!quality.acceptable || quality.score < qualityGate) {
      console.log(`Face quality too low (${quality.score.toFixed(2)}): ${quality.rejectionReason}`);
      return null;
    }

    // Extract descriptor from the aligned canvas
    const alignedDet = await faceapi
      .detectSingleFace(aligned, opts)
      .withFaceLandmarks()
      .withFaceDescriptor();

    // The aligned crop might occasionally not re-detect; fall back to the raw descriptor
    const descriptor = alignedDet?.descriptor ?? det.descriptor;

    console.log(
      `Face captured: quality=${quality.score.toFixed(2)}, ` +
      `sharpness=${quality.sharpness.toFixed(2)}, ` +
      `size=${Math.round(Math.min(box.width, box.height))} px, aligned=${!!alignedDet}`
    );

    return {
      descriptor,
      qualityScore: quality.score,
      qualityReport: {
        sharpness:  quality.sharpness,
        brightness: quality.brightness,
        sizeScore:  quality.sizeScore,
      },
      aligned: !!alignedDet,
    };
  } catch (err) {
    console.error('getAlignedFaceDescriptor error:', err);
    return null;
  }
}
