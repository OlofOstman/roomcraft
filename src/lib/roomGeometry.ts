import type { Dims, Pt, Room } from './types';

// ---------- basic vector helpers ----------

export function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function len(a: Pt): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Pt, b: Pt): number {
  return len(sub(a, b));
}

// ---------- polygons ----------

/** Room polygon translated into world (apartment) coordinates. */
export function worldPolygon(room: Room): Pt[] {
  return room.polygon.map((p) => add(p, room.origin));
}

/** Signed shoelace area; positive for counter-clockwise in a y-down coordinate system. */
export function polygonArea(polygon: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export interface WallSegment {
  index: number;
  a: Pt;
  b: Pt;
  length: number;
}

export function wallSegments(polygon: Pt[]): WallSegment[] {
  return polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return { index: i, a, b, length: dist(a, b) };
  });
}

/** Ray-casting point-in-polygon. Points exactly on an edge may go either way. */
export function pointInPolygon(pt: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

// ---------- furniture footprints (rotated rectangles) ----------

/** Corners of an item footprint: center, w along local x, d along local y, rotated clockwise. */
export function footprintCorners(center: Pt, dims: Pick<Dims, 'w' | 'd'>, rotationDeg: number): Pt[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = dims.w / 2;
  const hd = dims.d / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => ({
    x: center.x + p.x * cos - p.y * sin,
    y: center.y + p.x * sin + p.y * cos,
  }));
}

function projectOntoAxis(polygon: Pt[], axis: Pt): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of polygon) {
    const v = p.x * axis.x + p.y * axis.y;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Separating-axis test for two convex polygons (furniture footprints). */
export function convexPolygonsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x };
      const [minA, maxA] = projectOntoAxis(a, axis);
      const [minB, maxB] = projectOntoAxis(b, axis);
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

/** True when every corner of the footprint lies inside the (possibly concave) room polygon. */
export function footprintInsidePolygon(corners: Pt[], polygon: Pt[]): boolean {
  return corners.every((c) => pointInPolygon(c, polygon));
}

// ---------- room snapping ----------

export interface SnapResult {
  delta: Pt;
  snappedX: boolean;
  snappedY: boolean;
}

/**
 * Edge-to-edge snapping for a dragged room against the other rooms.
 *
 * Considers near-axis-aligned walls: vertical walls propose an x-correction, horizontal walls a
 * y-correction, taken from the closest pair within `threshold` whose extents overlap. Vertex-to-
 * vertex snapping fills in whichever axis edges didn't claim. Returns the delta to add to the
 * dragged room's origin.
 */
export function findSnapDelta(dragged: Pt[], others: Pt[][], threshold = 12): SnapResult {
  let bestDx: number | null = null;
  let bestDy: number | null = null;

  const AXIS_EPS = 0.05; // radians away from perfectly axis-aligned still counts

  const classify = (s: WallSegment): 'v' | 'h' | null => {
    const angle = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
    const mod = Math.abs(angle) % Math.PI;
    if (mod < AXIS_EPS || Math.PI - mod < AXIS_EPS) return 'h';
    if (Math.abs(mod - Math.PI / 2) < AXIS_EPS) return 'v';
    return null;
  };

  const dragSegs = wallSegments(dragged);
  for (const otherPoly of others) {
    for (const os of wallSegments(otherPoly)) {
      const oKind = classify(os);
      if (!oKind) continue;
      for (const ds of dragSegs) {
        if (classify(ds) !== oKind) continue;
        if (oKind === 'v') {
          const [dLo, dHi] = [Math.min(ds.a.y, ds.b.y), Math.max(ds.a.y, ds.b.y)];
          const [oLo, oHi] = [Math.min(os.a.y, os.b.y), Math.max(os.a.y, os.b.y)];
          if (dHi < oLo - threshold || dLo > oHi + threshold) continue;
          const gap = os.a.x - ds.a.x;
          if (Math.abs(gap) <= threshold && (bestDx === null || Math.abs(gap) < Math.abs(bestDx))) {
            bestDx = gap;
          }
        } else {
          const [dLo, dHi] = [Math.min(ds.a.x, ds.b.x), Math.max(ds.a.x, ds.b.x)];
          const [oLo, oHi] = [Math.min(os.a.x, os.b.x), Math.max(os.a.x, os.b.x)];
          if (dHi < oLo - threshold || dLo > oHi + threshold) continue;
          const gap = os.a.y - ds.a.y;
          if (Math.abs(gap) <= threshold && (bestDy === null || Math.abs(gap) < Math.abs(bestDy))) {
            bestDy = gap;
          }
        }
      }
    }
  }

  // Vertex-to-vertex fills in axes the edges didn't claim (helps angled walls meet at corners).
  if (bestDx === null || bestDy === null) {
    for (const otherPoly of others) {
      for (const ov of otherPoly) {
        for (const dv of dragged) {
          const dx = ov.x - dv.x;
          const dy = ov.y - dv.y;
          if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) continue;
          if (bestDx === null && (bestDy === null || Math.abs(dy - bestDy) < 1)) bestDx = dx;
          if (bestDy === null && Math.abs(dx - (bestDx ?? dx)) < 1) bestDy = dy;
        }
      }
    }
  }

  return {
    delta: { x: bestDx ?? 0, y: bestDy ?? 0 },
    snappedX: bestDx !== null,
    snappedY: bestDy !== null,
  };
}

// ---------- misc ----------

export function polygonCentroid(polygon: Pt[]): Pt {
  const n = polygon.length;
  const sum = polygon.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  return { x: sum.x / n, y: sum.y / n };
}

export function polygonBounds(polygon: Pt[]): { min: Pt; max: Pt } {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function formatCm(cm: number): string {
  return `${Math.round(cm)} cm`;
}
