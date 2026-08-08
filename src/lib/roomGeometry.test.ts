import { describe, expect, it } from 'vitest';
import {
  convexPolygonsOverlap,
  findSnapDelta,
  footprintCorners,
  footprintInsidePolygon,
  pointInPolygon,
  polygonArea,
  wallSegments,
} from './roomGeometry';
import type { Pt } from './types';

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe('polygonArea', () => {
  it('computes a rectangle area', () => {
    expect(polygonArea(rect(0, 0, 547, 265))).toBe(547 * 265);
  });

  it('computes an L-shape area', () => {
    // 4x4 square with a 2x2 bite out of one corner
    const l: Pt[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(polygonArea(l)).toBe(12);
  });

  it('handles angled (non-axis-aligned) walls', () => {
    const triangle: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea(triangle)).toBe(50);
  });
});

describe('wallSegments', () => {
  it('returns one segment per polygon edge with correct lengths', () => {
    const segs = wallSegments(rect(0, 0, 547, 265));
    expect(segs).toHaveLength(4);
    expect(segs.map((s) => s.length)).toEqual([547, 265, 547, 265]);
  });
});

describe('pointInPolygon', () => {
  const room = rect(0, 0, 100, 100);

  it('detects inside and outside points', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, room)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, room)).toBe(false);
  });

  it('respects concave (L-shaped) rooms', () => {
    const l: Pt[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(pointInPolygon({ x: 1, y: 3 }, l)).toBe(true);
    expect(pointInPolygon({ x: 3, y: 3 }, l)).toBe(false); // inside the bite
  });
});

describe('footprintCorners', () => {
  it('produces an axis-aligned rect at rotation 0', () => {
    const corners = footprintCorners({ x: 100, y: 100 }, { w: 200, d: 90 }, 0);
    expect(corners[0]).toEqual({ x: 0, y: 55 });
    expect(corners[2]).toEqual({ x: 200, y: 145 });
  });

  it('swaps extents at 90 degrees', () => {
    const corners = footprintCorners({ x: 0, y: 0 }, { w: 200, d: 90 }, 90);
    const xs = corners.map((c) => Math.round(c.x));
    const ys = corners.map((c) => Math.round(c.y));
    expect(Math.max(...xs) - Math.min(...xs)).toBe(90);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(200);
  });
});

describe('convexPolygonsOverlap', () => {
  it('detects overlap and separation of axis-aligned rects', () => {
    expect(convexPolygonsOverlap(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
    expect(convexPolygonsOverlap(rect(0, 0, 10, 10), rect(20, 0, 10, 10))).toBe(false);
  });

  it('treats touching edges as not overlapping', () => {
    expect(convexPolygonsOverlap(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
  });

  it('detects overlap of rotated footprints that AABBs would miss', () => {
    const a = footprintCorners({ x: 0, y: 0 }, { w: 20, d: 2 }, 45);
    const b = footprintCorners({ x: 8, y: -8 }, { w: 2, d: 2 }, 0);
    expect(convexPolygonsOverlap(a, b)).toBe(false);
    const c = footprintCorners({ x: 5, y: 5 }, { w: 2, d: 2 }, 0);
    expect(convexPolygonsOverlap(a, c)).toBe(true);
  });
});

describe('footprintInsidePolygon', () => {
  const room = rect(0, 0, 547, 265);

  it('accepts furniture fully inside the room', () => {
    const bed = footprintCorners({ x: 273, y: 132 }, { w: 160, d: 200 }, 0);
    expect(footprintInsidePolygon(bed, room)).toBe(true);
  });

  it('rejects furniture poking through a wall', () => {
    const bed = footprintCorners({ x: 500, y: 132 }, { w: 160, d: 200 }, 0);
    expect(footprintInsidePolygon(bed, room)).toBe(false);
  });
});

describe('findSnapDelta', () => {
  it('snaps a room edge to a nearby vertical wall', () => {
    const placed = rect(0, 0, 300, 200);
    const dragged = rect(305, 10, 250, 200); // 5 cm gap to placed's right wall
    const { delta, snappedX } = findSnapDelta(dragged, [placed], 12);
    expect(snappedX).toBe(true);
    expect(delta.x).toBe(-5);
  });

  it('snaps on both axes when a corner is near a corner', () => {
    const placed = rect(0, 0, 300, 200);
    const dragged = rect(304, 203, 250, 150);
    const { delta } = findSnapDelta(dragged, [placed], 12);
    expect(delta.x).toBe(-4);
    expect(delta.y).toBe(-3);
  });

  it('does not snap beyond the threshold', () => {
    const placed = rect(0, 0, 300, 200);
    const dragged = rect(350, 0, 250, 200);
    const { snappedX, snappedY } = findSnapDelta(dragged, [placed], 12);
    expect(snappedX).toBe(false);
    expect(snappedY).toBe(false);
  });

  it('ignores walls whose extents do not overlap', () => {
    const placed = rect(0, 0, 300, 200);
    const dragged = rect(305, 500, 250, 200); // right x-gap, but far below
    const { snappedX } = findSnapDelta(dragged, [placed], 12);
    expect(snappedX).toBe(false);
  });
});
