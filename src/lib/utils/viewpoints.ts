/**
 * Where a person stands in a room.
 *
 * Both the first-person walkthrough and the photoreal tour need the same
 * answer: a spot inside the room that isn't inside the sofa. The walkthrough
 * used to work this out inline; the tour needs one per room, so it lives here.
 */
import type { Floor, Point } from '$lib/models/types';
import { getCatalogItem } from '$lib/utils/furnitureCatalog';
import { detectRooms, getRoomPolygon, roomCentroid } from '$lib/utils/roomDetection';

/** cm of personal space kept between the camera and any furniture. */
const CLEARANCE = 35;
/**
 * cm kept between the camera and the walls. Standing with your nose against
 * the plaster fills a third of a 360 with one blown-out surface, so a tour
 * viewpoint needs considerably more room than a walkthrough spawn does.
 */
const WALL_CLEARANCE = 160;

export interface Viewpoint {
  id: string;
  /** Room id when the viewpoint came from a detected room. */
  roomId?: string;
  name: string;
  /** Plan coordinates in cm; `y` is the plan's vertical axis (world Z). */
  position: Point;
  /** Initial yaw in radians, facing the most open direction. */
  heading: number;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Circle approximations of every furniture footprint on the floor. */
function furnitureBlockers(floor: Floor): { x: number; y: number; r: number }[] {
  return floor.furniture
    .map((f) => {
      const def = getCatalogItem(f.catalogId);
      if (!def || def.symbol) return null;
      // Conservative circle test: half the footprint diagonal + clearance.
      const w = (f.width ?? def.width) * (f.scale?.x ?? 1);
      const d = (f.depth ?? def.depth) * (f.scale?.y ?? 1);
      return { x: f.position.x, y: f.position.y, r: Math.hypot(w, d) / 2 + CLEARANCE };
    })
    .filter(Boolean) as { x: number; y: number; r: number }[];
}

/** Shortest distance from a point to any edge of the polygon. */
export function distanceToWalls(p: Point, poly: Point[]): number {
  let nearest = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const lengthSq = ex * ex + ey * ey;
    // Clamp the projection to the segment so corners measure correctly.
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / lengthSq)) : 0;
    nearest = Math.min(nearest, Math.hypot(p.x - (a.x + t * ex), p.y - (a.y + t * ey)));
  }
  return nearest;
}

/**
 * Pick a spawn point that isn't inside furniture and isn't pressed against a
 * wall. The room centroid is the natural spot, but in a furnished plan it's
 * often the middle of a sofa or dining table — the walkthrough then starts
 * with a faceful of upholstery. Spiral outward from the centroid and take the
 * first clear position.
 *
 * `wallClearance` is best-effort: a cupboard-sized room cannot satisfy it, and
 * standing in the middle of a small room beats refusing to stand at all.
 */
export function findClearSpawn(
  centroid: Point,
  roomPoly: Point[],
  floor: Floor,
  wallClearance = 0,
): Point {
  const blockers = furnitureBlockers(floor);
  const isClear = (p: Point) =>
    blockers.every((b) => Math.hypot(p.x - b.x, p.y - b.y) > b.r) &&
    distanceToWalls(p, roomPoly) >= wallClearance;

  if (isClear(centroid)) return centroid;

  // Golden-angle spiral: good angular coverage without a grid. Among the
  // candidates that clear the furniture, take the one standing furthest from
  // the walls — the first hit is often just inside the clearance ring, which
  // puts a wall in a third of the panorama.
  const spiral = (clearance: number): Point | null => {
    let best: Point | null = null;
    let bestOpenness = -Infinity;
    for (let i = 1; i <= 60; i++) {
      const r = 25 * Math.sqrt(i);
      const a = i * 2.39996;
      const p = { x: centroid.x + r * Math.cos(a), y: centroid.y + r * Math.sin(a) };
      if (!pointInPolygon(p, roomPoly)) continue;
      if (!blockers.every((b) => Math.hypot(p.x - b.x, p.y - b.y) > b.r)) continue;
      const openness = distanceToWalls(p, roomPoly);
      if (openness >= clearance && openness > bestOpenness) {
        bestOpenness = openness;
        best = p;
      }
    }
    return best;
  };

  // Relax the wall clearance before giving up on it entirely.
  for (const clearance of [wallClearance, wallClearance / 2]) {
    const found = spiral(clearance);
    if (found) return found;
  }
  // No clearance is satisfiable in a room this small. The centroid is then the
  // best place to stand, provided nothing is parked on it.
  if (blockers.every((b) => Math.hypot(centroid.x - b.x, centroid.y - b.y) > b.r)) return centroid;
  return spiral(0) ?? centroid; // fully furnished room — give up gracefully
}

/**
 * Distance from `origin` to the polygon boundary along `angle`, so a viewpoint
 * can face down the length of a room rather than into the nearest wall.
 */
function distanceToBoundary(origin: Point, angle: number, poly: Point[]): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let nearest = Infinity;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-9) continue; // parallel

    const t = ((a.x - origin.x) * ey - (a.y - origin.y) * ex) / denominator;
    const u = ((a.x - origin.x) * dy - (a.y - origin.y) * dx) / denominator;
    if (t > 0 && u >= 0 && u <= 1) nearest = Math.min(nearest, t);
  }
  return nearest;
}

/**
 * Face the direction with the most room in front of it.
 *
 * Returns a **camera yaw** (three's `rotation.y`), not a plan angle. A camera
 * with yaw θ looks along `(-sinθ, -cosθ)` in plan coordinates, so the plan
 * angle `a` we want is converted rather than returned raw — getting this wrong
 * points every viewpoint 90° away from the room it was chosen for.
 */
export function bestHeading(origin: Point, poly: Point[]): number {
  let best = 0;
  let bestDistance = -Infinity;
  const SAMPLES = 24;
  for (let i = 0; i < SAMPLES; i++) {
    const angle = (i / SAMPLES) * Math.PI * 2;
    const d = distanceToBoundary(origin, angle, poly);
    if (d > bestDistance) {
      bestDistance = d;
      best = angle;
    }
  }
  return Math.atan2(-Math.cos(best), -Math.sin(best));
}

/**
 * One viewpoint per detected room, ordered largest first so the tour opens in
 * the main living space. Rooms too small to stand in (closets, ducts) are
 * skipped — a panorama of a 1m² void costs the same as a real one.
 *
 * `Room.area` is in m² (roomDetection converts from cm² when it builds them).
 */
export function buildViewpoints(floor: Floor, minAreaM2 = 2): Viewpoint[] {
  const rooms = detectRooms(floor.walls);
  const viewpoints: Viewpoint[] = [];

  for (const room of [...rooms].sort((a, b) => b.area - a.area)) {
    if (room.area < minAreaM2) continue;
    const poly = getRoomPolygon(room, floor.walls);
    if (poly.length < 3) continue;

    const position = findClearSpawn(roomCentroid(poly), poly, floor, WALL_CLEARANCE);
    viewpoints.push({
      id: `vp_${room.id}`,
      roomId: room.id,
      name: room.name || 'Room',
      position,
      heading: bestHeading(position, poly),
    });
  }

  return viewpoints;
}
