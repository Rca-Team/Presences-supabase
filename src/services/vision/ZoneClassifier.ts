/**
 * ZoneClassifier — polygon hit-test for named zones.
 * Polygons are normalized coordinates (0..1) so they survive resolution changes.
 */
export interface Zone {
  key: string;
  polygon: Array<{ x: number; y: number }>; // normalized 0..1
}

function pointInPoly(x: number, y: number, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function classifyZone(
  cx: number, cy: number,
  frameW: number, frameH: number,
  zones: Zone[],
): string | null {
  const nx = cx / frameW, ny = cy / frameH;
  for (const z of zones) {
    if (pointInPoly(nx, ny, z.polygon)) return z.key;
  }
  return null;
}

export const DEFAULT_ZONES: Zone[] = [
  {
    key: 'class-seats',
    polygon: [
      { x: 0.05, y: 0.35 }, { x: 0.95, y: 0.35 },
      { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 },
    ],
  },
  {
    key: 'class-front',
    polygon: [
      { x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 },
      { x: 0.95, y: 0.35 }, { x: 0.05, y: 0.35 },
    ],
  },
];
