/**
 * FaceQualityGate — Innovatrics SmartFace inspired biometric quality assessment
 *
 * Implements ICAO-aligned portrait quality checks prior to face matching:
 * 1. Head Pose constraints: Yaw <= 25°, Pitch <= 20°
 * 2. Spatial resolution: Minimum face dimension >= 50px
 * 3. Sharpness / Blur filter: Fast Laplacian gradient energy >= 14
 * 4. Passive Liveness / Anti-Spoof: High-frequency texture variance in facial region
 *
 * Prevents blurred, extreme-angle, or non-live face captures from reaching the
 * vector matcher, eliminating the primary source of false-positive identity flips.
 */

export interface FaceQualityMetrics {
  yaw: number;
  pitch: number;
  blurScore: number;
  faceWidth: number;
  faceHeight: number;
  livenessScore: number;
  overallQuality: number;
}

export interface QualityAssessment {
  passed: boolean;
  score: number;
  metrics: FaceQualityMetrics;
  reason?: string;
}

export interface QualityGateOptions {
  maxYaw?: number;
  maxPitch?: number;
  minFaceSize?: number;
  minBlurScore?: number;
  minLivenessScore?: number;
}

const DEFAULT_OPTIONS: Required<QualityGateOptions> = {
  maxYaw: 25,
  maxPitch: 20,
  minFaceSize: 50,
  minBlurScore: 14,
  minLivenessScore: 6.0,
};

/**
 * Estimate face yaw from 68-landmark positions.
 * Uses nose bridge vs jaw symmetry ratio. Returns absolute degrees (0 = frontal).
 */
export function estimateYaw(landmarks: { x: number; y: number }[]): number {
  if (!landmarks || landmarks.length < 68) return 0;
  const noseTip = landmarks[30];
  const leftJaw = landmarks[0];
  const rightJaw = landmarks[16];
  if (!noseTip || !leftJaw || !rightJaw) return 0;

  const leftDist = Math.hypot(noseTip.x - leftJaw.x, noseTip.y - leftJaw.y);
  const rightDist = Math.hypot(noseTip.x - rightJaw.x, noseTip.y - rightJaw.y);
  const total = leftDist + rightDist;
  if (total < 1) return 0;

  const ratio = leftDist / total;
  const deviation = Math.abs(ratio - 0.5);
  return deviation * 180;
}

/**
 * Estimate face pitch from landmarks.
 * Returns absolute degrees from eye-to-chin ratio.
 */
export function estimatePitch(landmarks: { x: number; y: number }[]): number {
  if (!landmarks || landmarks.length < 68) return 0;
  const leftEye = landmarks.slice(36, 42).reduce(
    (acc, p) => ({ x: acc.x + p.x / 6, y: acc.y + p.y / 6 }),
    { x: 0, y: 0 }
  );
  const rightEye = landmarks.slice(42, 48).reduce(
    (acc, p) => ({ x: acc.x + p.x / 6, y: acc.y + p.y / 6 }),
    { x: 0, y: 0 }
  );
  const eyeCenter = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const chin = landmarks[8];
  const noseTip = landmarks[30];
  if (!chin || !noseTip) return 0;

  const faceHeight = Math.abs(chin.y - eyeCenter.y);
  if (faceHeight < 1) return 0;

  const noseRatio = (noseTip.y - eyeCenter.y) / faceHeight;
  const deviation = Math.abs(noseRatio - 0.4);
  return deviation * 120;
}

/**
 * Computes sharpness (blur) and passive liveness (texture variance)
 * from a cropped face canvas using Laplacian operator.
 */
export function analyzeCanvasTexture(canvas: HTMLCanvasElement): {
  blurScore: number;
  livenessScore: number;
} {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width < 10 || canvas.height < 10) {
    return { blurScore: 0, livenessScore: 0 };
  }

  const w = canvas.width;
  const h = canvas.height;
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch {
    return { blurScore: 0, livenessScore: 0 };
  }

  const data = imgData.data;
  let gradientSum = 0;
  let sampleCount = 0;

  // Analysis focused on central 60% of face to ignore background artifacts
  const startX = Math.floor(w * 0.2);
  const endX = Math.floor(w * 0.8);
  const startY = Math.floor(h * 0.2);
  const endY = Math.floor(h * 0.8);

  const laplacianValues: number[] = [];

  for (let y = startY; y < endY; y += 2) {
    for (let x = startX; x < endX; x += 2) {
      const idx = (y * w + x) * 4;
      const rightIdx = (y * w + (x + 1)) * 4;
      const downIdx = ((y + 1) * w + x) * 4;

      const luma = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const rightLuma =
        data[rightIdx] * 0.299 + data[rightIdx + 1] * 0.587 + data[rightIdx + 2] * 0.114;
      const downLuma =
        data[downIdx] * 0.299 + data[downIdx + 1] * 0.587 + data[downIdx + 2] * 0.114;

      const grad = Math.abs(luma - rightLuma) + Math.abs(luma - downLuma);
      gradientSum += grad;
      sampleCount++;

      // Laplacian kernel: 4*center - left - right - up - down
      if (x > 1 && x < w - 1 && y > 1 && y < h - 1) {
        const leftLuma =
          data[(y * w + (x - 1)) * 4] * 0.299 +
          data[(y * w + (x - 1)) * 4 + 1] * 0.587 +
          data[(y * w + (x - 1)) * 4 + 2] * 0.114;
        const upLuma =
          data[((y - 1) * w + x) * 4] * 0.299 +
          data[((y - 1) * w + x) * 4 + 1] * 0.587 +
          data[((y - 1) * w + x) * 4 + 2] * 0.114;

        const lap = Math.abs(4 * luma - leftLuma - rightLuma - upLuma - downLuma);
        laplacianValues.push(lap);
      }
    }
  }

  const blurScore = sampleCount > 0 ? gradientSum / sampleCount : 0;

  // Liveness score: standard deviation of Laplacian values in face interior
  let livenessScore = 0;
  if (laplacianValues.length > 10) {
    const mean = laplacianValues.reduce((a, b) => a + b, 0) / laplacianValues.length;
    const variance =
      laplacianValues.reduce((acc, val) => acc + (val - mean) ** 2, 0) /
      laplacianValues.length;
    livenessScore = Math.sqrt(variance);
  }

  return { blurScore, livenessScore };
}

/**
 * Evaluate if a detected face meets the required standards for recognition.
 */
export function assessFaceQuality(
  params: {
    canvas?: HTMLCanvasElement | null;
    landmarks?: { x: number; y: number }[] | null;
    box?: { width: number; height: number } | null;
  },
  customOptions?: QualityGateOptions
): QualityAssessment {
  const opts = { ...DEFAULT_OPTIONS, ...customOptions };

  const faceWidth = params.box?.width ?? (params.canvas ? params.canvas.width : 0);
  const faceHeight = params.box?.height ?? (params.canvas ? params.canvas.height : 0);

  // 1. Resolution Check
  if (faceWidth < opts.minFaceSize || faceHeight < opts.minFaceSize) {
    return {
      passed: false,
      score: 0.1,
      metrics: {
        yaw: 0,
        pitch: 0,
        blurScore: 0,
        faceWidth,
        faceHeight,
        livenessScore: 0,
        overallQuality: 0.1,
      },
      reason: `Face resolution too small (${Math.round(faceWidth)}x${Math.round(faceHeight)}px < ${opts.minFaceSize}px)`,
    };
  }

  // 2. Pose Check
  let yaw = 0;
  let pitch = 0;
  if (params.landmarks && params.landmarks.length >= 68) {
    yaw = estimateYaw(params.landmarks);
    pitch = estimatePitch(params.landmarks);

    if (yaw > opts.maxYaw) {
      return {
        passed: false,
        score: 0.2,
        metrics: {
          yaw,
          pitch,
          blurScore: 0,
          faceWidth,
          faceHeight,
          livenessScore: 0,
          overallQuality: 0.2,
        },
        reason: `Face turned too far sideways (yaw: ${yaw.toFixed(1)}° > ${opts.maxYaw}°)`,
      };
    }

    if (pitch > opts.maxPitch) {
      return {
        passed: false,
        score: 0.2,
        metrics: {
          yaw,
          pitch,
          blurScore: 0,
          faceWidth,
          faceHeight,
          livenessScore: 0,
          overallQuality: 0.2,
        },
        reason: `Face tilted too high/low (pitch: ${pitch.toFixed(1)}° > ${opts.maxPitch}°)`,
      };
    }
  }

  // 3. Texture / Blur & Liveness
  let blurScore = 20;
  let livenessScore = 10;
  if (params.canvas) {
    const texture = analyzeCanvasTexture(params.canvas);
    blurScore = texture.blurScore;
    livenessScore = texture.livenessScore;

    if (blurScore < opts.minBlurScore) {
      return {
        passed: false,
        score: 0.3,
        metrics: {
          yaw,
          pitch,
          blurScore,
          faceWidth,
          faceHeight,
          livenessScore,
          overallQuality: 0.3,
        },
        reason: `Image blurred or in motion (sharpness ${blurScore.toFixed(1)} < ${opts.minBlurScore})`,
      };
    }

    if (livenessScore < opts.minLivenessScore) {
      return {
        passed: false,
        score: 0.35,
        metrics: {
          yaw,
          pitch,
          blurScore,
          faceWidth,
          faceHeight,
          livenessScore,
          overallQuality: 0.35,
        },
        reason: `Low texture variance / potential flat surface (liveness ${livenessScore.toFixed(1)} < ${opts.minLivenessScore})`,
      };
    }
  }

  // Calculate composite quality score [0..1]
  const yawScore = Math.max(0, 1 - yaw / (opts.maxYaw * 1.5));
  const pitchScore = Math.max(0, 1 - pitch / (opts.maxPitch * 1.5));
  const blurFactor = Math.min(1, blurScore / (opts.minBlurScore * 2));
  const sizeFactor = Math.min(1, Math.min(faceWidth, faceHeight) / 120);

  const overallQuality = Number(
    (yawScore * 0.3 + pitchScore * 0.2 + blurFactor * 0.3 + sizeFactor * 0.2).toFixed(3)
  );

  return {
    passed: true,
    score: overallQuality,
    metrics: {
      yaw,
      pitch,
      blurScore,
      faceWidth,
      faceHeight,
      livenessScore,
      overallQuality,
    },
  };
}
