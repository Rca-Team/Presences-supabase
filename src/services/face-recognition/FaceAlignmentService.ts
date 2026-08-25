/**
 * FaceAlignmentService
 *
 * Performs similarity-transform alignment of a detected face to a canonical
 * 112 × 112 crop.  Using eye-to-eye geometry we rotate, scale and translate
 * the source image so that the eyes always land at the same coordinates in
 * the output.  This is the same pre-processing step used by ArcFace /
 * InsightFace and dramatically improves FaceRecognitionNet accuracy because
 * the network was trained on aligned crops.
 */

import * as faceapi from 'face-api.js';

// Target eye positions in the 112 × 112 aligned-face template
// (taken from the 5-point InsightFace alignment standard)
const TARGET_LEFT_EYE_X  = 38.2946;
const TARGET_RIGHT_EYE_X = 73.5318;
const TARGET_EYE_Y       = 51.6963;
const TARGET_EYE_MID_X   = (TARGET_LEFT_EYE_X + TARGET_RIGHT_EYE_X) / 2; // ≈ 55.91
const TARGET_EYE_DIST    = TARGET_RIGHT_EYE_X - TARGET_LEFT_EYE_X;         // ≈ 35.24

const CANONICAL_SIZE = 112;

// ─── helpers ────────────────────────────────────────────────────────────────

function avgPoints(pts: faceapi.Point[]): { x: number; y: number } {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

function sourceSize(
  src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): { w: number; h: number } {
  if (src instanceof HTMLVideoElement)
    return { w: src.videoWidth, h: src.videoHeight };
  return { w: src.width, h: src.height };
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Align a face image using the 68-point landmarks returned by face-api.js.
 *
 * The result is a freshly created <canvas> element of `outputSize × outputSize`
 * that can be passed directly to faceapi.computeFaceDescriptor or used as the
 * input to a separate ONNX recognition model.
 *
 * @param source     - Raw video / image / canvas that contains the full frame.
 * @param landmarks  - 68-point FaceLandmarks68 from face-api.js detection.
 * @param outputSize - Desired output resolution (default 112).
 */
export function alignFace(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  landmarks: faceapi.FaceLandmarks68,
  outputSize: number = CANONICAL_SIZE
): HTMLCanvasElement {
  const positions = landmarks.positions;

  // Derive left / right eye centers from the 68-point set
  // points 36–41 = left eye ring, 42–47 = right eye ring
  const leftEye  = avgPoints(positions.slice(36, 42));
  const rightEye = avgPoints(positions.slice(42, 48));

  // How much to rotate so the eyes become horizontal
  const angle = Math.atan2(
    rightEye.y - leftEye.y,
    rightEye.x - leftEye.x
  );

  // Source inter-ocular distance
  const srcEyeDist = Math.sqrt(
    Math.pow(rightEye.x - leftEye.x, 2) +
    Math.pow(rightEye.y - leftEye.y, 2)
  );

  // We need to protect against degenerate detections
  if (srcEyeDist < 1) {
    // Fallback: just crop the face bounding box
    return fallbackCrop(source, landmarks, outputSize);
  }

  // Scale so that the inter-ocular distance matches the template
  const scale = (TARGET_EYE_DIST / srcEyeDist) * (outputSize / CANONICAL_SIZE);

  // Midpoint of the two eyes in source space
  const srcMidX = (leftEye.x + rightEye.x) / 2;
  const srcMidY = (leftEye.y + rightEye.y) / 2;

  // Target midpoint in output space
  const dstMidX = TARGET_EYE_MID_X * (outputSize / CANONICAL_SIZE);
  const dstMidY = TARGET_EYE_Y       * (outputSize / CANONICAL_SIZE);

  // Build output canvas
  const canvas  = document.createElement('canvas');
  canvas.width  = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d')!;

  // Canvas transform pipeline (operations applied in reverse order by the GPU):
  //   1. Move target eye-midpoint to canvas origin
  //   2. Scale by eye-distance ratio
  //   3. Rotate to cancel the tilt
  //   4. Move source eye-midpoint to origin  → effectively maps it to origin
  //   5. Draw the full source frame at (0, 0)
  //
  // Net result: srcMidPoint → dstMidPoint, with correct scale & rotation.
  ctx.translate(dstMidX, dstMidY);
  ctx.scale(scale, scale);
  ctx.rotate(-angle);
  ctx.translate(-srcMidX, -srcMidY);

  const { w, h } = sourceSize(source);
  ctx.drawImage(source, 0, 0, w, h);

  // Reset so the canvas is usable as a normal image after this
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return canvas;
}

/**
 * Simpler fallback: crop tightly around the bounding box when landmarks are
 * too degenerate to compute a reliable alignment.
 */
function fallbackCrop(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  landmarks: faceapi.FaceLandmarks68,
  outputSize: number
): HTMLCanvasElement {
  const positions = landmarks.positions;
  const xs = positions.map(p => p.x);
  const ys = positions.map(p => p.y);
  const x1 = Math.min(...xs);
  const y1 = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);
  const pad = (x2 - x1) * 0.15;

  const canvas  = document.createElement('canvas');
  canvas.width  = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    source,
    x1 - pad, y1 - pad,
    (x2 - x1) + pad * 2, (y2 - y1) + pad * 2,
    0, 0, outputSize, outputSize
  );
  return canvas;
}

/**
 * Quick check: returns true if the detected face looks roughly frontal enough
 * for reliable recognition.
 *
 * Heuristic: the vertical asymmetry between left and right eye centres must
 * be less than 25 % of the inter-ocular distance.  Severely tilted / profile
 * faces fail this test and should be skipped.
 */
export function isFaceFrontal(landmarks: faceapi.FaceLandmarks68): boolean {
  const positions = landmarks.positions;
  const leftEye  = avgPoints(positions.slice(36, 42));
  const rightEye = avgPoints(positions.slice(42, 48));

  const eyeDist  = Math.sqrt(
    Math.pow(rightEye.x - leftEye.x, 2) +
    Math.pow(rightEye.y - leftEye.y, 2)
  );
  const vertDiff = Math.abs(rightEye.y - leftEye.y);

  // Allow up to 30° tilt (tan 30° ≈ 0.577)
  return eyeDist > 0 && vertDiff / eyeDist < 0.577;
}
