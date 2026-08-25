/**
 * FaceQualityService
 *
 * Scores an aligned face canvas on several perceptual axes so the recognition
 * pipeline can reject low-quality captures before they reach the matcher.
 * Poor-quality captures are the single biggest source of false negatives in
 * a school attendance system.
 *
 * Scores are in [0, 1].  A combined score below QUALITY_THRESHOLD is rejected.
 */

export interface FaceQualityReport {
  /** Combined quality score 0–1 */
  score: number;
  /** Whether the face is usable for recognition */
  acceptable: boolean;
  /** Laplacian-variance sharpness 0–1 */
  sharpness: number;
  /** Brightness adequacy 0–1 */
  brightness: number;
  /** Face size adequacy 0–1 */
  sizeScore: number;
  /** Human-readable rejection reason (empty when acceptable) */
  rejectionReason: string;
}

/** Minimum combined score to accept a capture */
const QUALITY_THRESHOLD = 0.35;

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Score an aligned face canvas (or any image element).
 *
 * @param faceCanvas  - Preferably the 112×112 aligned canvas from FaceAlignmentService.
 * @param originalBox - The bounding box from face-api.js (used for size scoring).
 */
export function scoreFaceQuality(
  faceCanvas: HTMLCanvasElement,
  originalBox?: { width: number; height: number }
): FaceQualityReport {
  const ctx = faceCanvas.getContext('2d');
  if (!ctx) {
    return badReport('Cannot read canvas context');
  }

  const { width, height } = faceCanvas;
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    return badReport('Cannot read pixel data (tainted canvas)');
  }

  const sharpness  = computeSharpness(imageData, width, height);
  const brightness = computeBrightness(imageData);
  const sizeScore  = originalBox
    ? computeSizeScore(originalBox.width, originalBox.height)
    : 1.0; // If called with an already-cropped canvas, assume size is fine

  // Weighted combination — sharpness matters most in a school corridor camera
  const score = sharpness * 0.45 + brightness * 0.35 + sizeScore * 0.20;

  let rejectionReason = '';
  if (score < QUALITY_THRESHOLD) {
    if (sharpness < 0.25)  rejectionReason = 'Image is too blurry — move closer or hold still';
    else if (brightness < 0.2) rejectionReason = 'Face is too dark — improve lighting';
    else if (brightness > 0.9) rejectionReason = 'Face is overexposed — reduce lighting';
    else if (sizeScore < 0.25) rejectionReason = 'Face is too far from camera — move closer';
    else rejectionReason = 'Low image quality';
  }

  return {
    score,
    acceptable: score >= QUALITY_THRESHOLD,
    sharpness,
    brightness,
    sizeScore,
    rejectionReason,
  };
}

// ─── internal scoring functions ──────────────────────────────────────────────

/**
 * Sharpness via Laplacian variance on the grayscale image.
 * High variance = sharp edges = good focus.
 * Maps to [0, 1] with saturation around variance ≥ 500.
 */
function computeSharpness(data: ImageData, w: number, h: number): number {
  const px = data.data;
  // Convert to grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 3×3 Laplacian kernel: [0,1,0,1,-4,1,0,1,0]
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap =
        gray[idx - w] +
        gray[idx + w] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      sumSq += lap * lap;
      count++;
    }
  }

  const variance = count > 0 ? sumSq / count : 0;
  // Sigmoid-like mapping: variance of 100 → ~0.5, 400 → ~0.85
  return Math.min(1, variance / 400);
}

/**
 * Brightness score: penalises very dark OR very overexposed faces.
 * Peak at normalised mean ≈ 0.45–0.65.
 */
function computeBrightness(data: ImageData): number {
  const px = data.data;
  let sum = 0;
  const n = px.length / 4;
  for (let i = 0; i < n; i++) {
    sum += 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  }
  const mean = sum / n / 255; // Normalised 0–1

  // Penalise darkness and overexposure symmetrically
  if (mean < 0.05) return 0;
  if (mean > 0.95) return 0.1;

  // Bell curve peak at 0.5
  const deviation = Math.abs(mean - 0.5);
  return Math.max(0, 1 - deviation * 2);
}

/**
 * Size score: a face detection box below 80 px is too small.
 * Linearly ramps from 0 at 40 px to 1 at 150 px.
 */
function computeSizeScore(boxW: number, boxH: number): number {
  const size = Math.min(boxW, boxH);
  if (size <= 40) return 0;
  if (size >= 150) return 1;
  return (size - 40) / (150 - 40);
}

function badReport(reason: string): FaceQualityReport {
  return {
    score: 0,
    acceptable: false,
    sharpness: 0,
    brightness: 0,
    sizeScore: 0,
    rejectionReason: reason,
  };
}
