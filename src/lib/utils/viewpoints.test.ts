import { describe, expect, it } from 'vitest';
import { bestHeading, distanceToWalls, findClearSpawn, pointInPolygon } from './viewpoints';
import type { Floor } from '$lib/models/types';

/** A 600 x 400 cm rectangular room with its corner at the origin. */
const ROOM = [
  { x: 0, y: 0 },
  { x: 600, y: 0 },
  { x: 600, y: 400 },
  { x: 0, y: 400 },
];

function emptyFloor(furniture: Floor['furniture'] = []): Floor {
  return {
    id: 'f1',
    name: 'Ground Floor',
    walls: [],
    doors: [],
    windows: [],
    furniture,
    stairs: [],
  } as unknown as Floor;
}

describe('pointInPolygon', () => {
  it('accepts interior points and rejects exterior ones', () => {
    expect(pointInPolygon({ x: 300, y: 200 }, ROOM)).toBe(true);
    expect(pointInPolygon({ x: -10, y: 200 }, ROOM)).toBe(false);
    expect(pointInPolygon({ x: 300, y: 900 }, ROOM)).toBe(false);
  });
});

describe('distanceToWalls', () => {
  it('measures to the nearest edge, not the nearest corner', () => {
    // 100 from the top edge, 300 from the left — the top edge wins.
    expect(distanceToWalls({ x: 300, y: 100 }, ROOM)).toBeCloseTo(100);
  });

  it('measures to a corner when the point is diagonal to it', () => {
    expect(distanceToWalls({ x: 50, y: 50 }, ROOM)).toBeCloseTo(50);
  });
});

describe('findClearSpawn', () => {
  it('keeps the centroid when nothing is in the way', () => {
    const centroid = { x: 300, y: 200 };
    expect(findClearSpawn(centroid, ROOM, emptyFloor())).toEqual(centroid);
  });

  it('respects the wall clearance', () => {
    // The centroid is 200 from the long walls, so a 250 clearance is
    // unsatisfiable anywhere and the relaxation must still return a point
    // inside the room rather than nothing.
    const spawn = findClearSpawn({ x: 300, y: 200 }, ROOM, emptyFloor(), 150);
    expect(pointInPolygon(spawn, ROOM)).toBe(true);
    expect(distanceToWalls(spawn, ROOM)).toBeGreaterThanOrEqual(150);
  });

  it('falls back to the centroid rather than failing on an impossible room', () => {
    const spawn = findClearSpawn({ x: 300, y: 200 }, ROOM, emptyFloor(), 5000);
    expect(spawn).toEqual({ x: 300, y: 200 });
  });
});

describe('bestHeading', () => {
  /** Where a camera with this yaw is looking, in plan coordinates. */
  const forward = (yaw: number) => ({ x: -Math.sin(yaw), y: -Math.cos(yaw) });

  it('returns a camera yaw that faces down the length of the room', () => {
    // Standing near the left wall of a room that is much wider than it is
    // deep, the open direction is +x. It lands slightly off-axis because the
    // longest sight line runs to a far corner, which is what you want to be
    // looking at anyway.
    const direction = forward(bestHeading({ x: 100, y: 200 }, ROOM));
    expect(direction.x).toBeGreaterThan(0.9);
  });

  it('faces the other way from the opposite wall', () => {
    const direction = forward(bestHeading({ x: 500, y: 200 }, ROOM));
    expect(direction.x).toBeLessThan(-0.9);
  });

  it('faces along the depth of a room that is deeper than it is wide', () => {
    const tall = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 1200 },
      { x: 0, y: 1200 },
    ];
    const direction = forward(bestHeading({ x: 150, y: 150 }, tall));
    expect(direction.y).toBeGreaterThan(0.9);
  });
});
