/**
 * PanoramicSlicingService
 *
 * Implements multi-tile hierarchical inspection for wide-angle classroom views.
 *
 * In a classroom with 50–60 students, faces in Rows 4, 5, and 6 are only 25–40px
 * wide in a full-frame 1080p shot. Standard downsampled detection crushes them to
 * single-digit pixels where neural networks fail.
 *
 * This service splits the camera stream into overlapping spatial tiles (quadrants),
 * crops them at native pixel density, and maps detected bounding boxes back to
 * full-frame canvas coordinates.
 */

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanoramicTile {
  id: string;
  label: string;
  crop: NormalizedRect;
  priority: number;
  /** Suggested input size for tinyFaceDetector or SSD */
  inputSize: number;
}

export interface Box2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Standard 5-Tile Hierarchical Classroom Grid:
 * - Tile 0: Overview (Rows 1–3 large center faces)
 * - Tile 1: Front-Left (Rows 1–3 Left)
 * - Tile 2: Front-Right (Rows 1–3 Right)
 * - Tile 3: Back-Left (Rows 4–6 Left, high native resolution)
 * - Tile 4: Back-Right (Rows 4–6 Right, high native resolution)
 */
export const DEFAULT_CLASSROOM_TILES: PanoramicTile[] = [
  {
    id: 'overview',
    label: 'Classroom Overview',
    crop: { x: 0.0, y: 0.0, width: 1.0, height: 1.0 },
    priority: 1,
    inputSize: 416,
  },
  {
    id: 'front_left',
    label: 'Front Rows (Left)',
    crop: { x: 0.0, y: 0.25, width: 0.58, height: 0.75 },
    priority: 2,
    inputSize: 320,
  },
  {
    id: 'front_right',
    label: 'Front Rows (Right)',
    crop: { x: 0.42, y: 0.25, width: 0.58, height: 0.75 },
    priority: 2,
    inputSize: 320,
  },
  {
    id: 'back_left',
    label: 'Back Rows (Left Zoom)',
    crop: { x: 0.0, y: 0.0, width: 0.56, height: 0.52 },
    priority: 3,
    inputSize: 416,
  },
  {
    id: 'back_right',
    label: 'Back Rows (Right Zoom)',
    crop: { x: 0.44, y: 0.0, width: 0.56, height: 0.52 },
    priority: 3,
    inputSize: 416,
  },
];

/**
 * Crop the specific spatial quadrant from the live video stream into the target canvas.
 */
export function cropTile(
  video: HTMLVideoElement,
  tile: PanoramicTile,
  targetCanvas: HTMLCanvasElement,
  maxDimension = 640
): { sx: number; sy: number; sw: number; sh: number; targetW: number; targetH: number } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const sx = Math.max(0, Math.floor(tile.crop.x * vw));
  const sy = Math.max(0, Math.floor(tile.crop.y * vh));
  const sw = Math.min(vw - sx, Math.ceil(tile.crop.width * vw));
  const sh = Math.min(vh - sy, Math.ceil(tile.crop.height * vh));

  if (sw <= 10 || sh <= 10) return null;

  const scale = Math.min(1, maxDimension / Math.max(sw, sh));
  const targetW = Math.max(32, Math.round(sw * scale));
  const targetH = Math.max(32, Math.round(sh * scale));

  if (targetCanvas.width !== targetW || targetCanvas.height !== targetH) {
    targetCanvas.width = targetW;
    targetCanvas.height = targetH;
  }

  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);

  return { sx, sy, sw, sh, targetW, targetH };
}

/**
 * Maps a bounding box detected on a cropped tile canvas back to global video coordinates.
 */
export function mapTileBoxToGlobal(
  tileBox: Box2D,
  tileInfo: { sx: number; sy: number; sw: number; sh: number; targetW: number; targetH: number }
): Box2D {
  const scaleX = tileInfo.sw / tileInfo.targetW;
  const scaleY = tileInfo.sh / tileInfo.targetH;

  return {
    x: tileInfo.sx + tileBox.x * scaleX,
    y: tileInfo.sy + tileBox.y * scaleY,
    width: tileBox.width * scaleX,
    height: tileBox.height * scaleY,
  };
}

/**
 * Merges overlapping boxes detected across different tiles using Non-Maximum Suppression (NMS).
 */
export function mergeDetectionsAcrossTiles(boxes: Box2D[], iouThreshold = 0.40): Box2D[] {
  if (boxes.length <= 1) return boxes;

  const sorted = [...boxes].sort((a, b) => b.width * b.height - a.width * a.height);
  const selected: Box2D[] = [];

  for (const box of sorted) {
    let duplicate = false;
    for (const kept of selected) {
      const iouScore = calculateIoU(box, kept);
      if (iouScore > iouThreshold) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) {
      selected.push(box);
    }
  }

  return selected;
}

function calculateIoU(a: Box2D, b: Box2D): number {
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
