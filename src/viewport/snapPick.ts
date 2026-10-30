import type { AnyLine, Guide, SnapPoint } from '../document/document';
import { isGuidePoint, lineDir, lineSpan } from '../document/document';
import { snapToGrid } from '../document/geometry';
import type { Units } from '../units/length';

export type Vec3 = [number, number, number];

/**
 * How close, in canvas pixels, the cursor must come to a candidate before it
 * is offered.
 *
 * Browser-settled, in the sense of follow-up 60 — this is a judgement about
 * what a person can comfortably hit, not something a test can decide. Too
 * small and corners feel slippery; too large and adjacent candidates on a
 * small part fight each other. A named export so a browser pass can retune it
 * without touching any of the arithmetic below.
 */
export const PICK_RADIUS_PX = 12;

export interface ProjectedPoint {
  /** Canvas pixels from the left edge. */
  x: number;
  /** Canvas pixels from the top edge. */
  y: number;
  /** Normalised device depth: smaller is nearer the camera. */
  depth: number;
}

/**
 * Maps a world position to canvas pixels, or to `null` for a point the camera
 * cannot see.
 *
 * A callback rather than a camera on purpose: it is what keeps this module
 * free of THREE, and therefore unit-testable. The repo's working agreement is
 * that the r3f viewport is verified by driving a browser, not by asserting on
 * mocks — that still holds for how the tool FEELS, but which point is nearest
 * is arithmetic, and arithmetic does not need a browser.
 */
export type Projector = (at: [number, number, number]) => ProjectedPoint | null;

/**
 * The candidate nearest the cursor in screen space, or null if none is within
 * `radiusPx`.
 *
 * Screen space rather than a raycast against the board under the cursor. The
 * cheaper raycast-first approach fails on exactly the points the tool is most
 * useful for: a corner silhouetted against empty space has no board under the
 * cursor at all, so the corners easiest to SEE would be the hardest to hit.
 * See the design's §3.1.
 *
 * A candidate occluded by another board is still picked if it is nearest —
 * deliberate, and it composes with the same argument: rejecting occluded
 * candidates costs an occlusion raycast per candidate, and from some angles
 * the silhouetted corner above IS the occluded one. Its marker draws on top
 * so the pick is at least visible (§3.2).
 *
 * Generic in the candidate type, and it never reads `owner` — so the element
 * type is preserved through the pick: an array of BoardSnapPoint yields a
 * BoardSnapPoint. The picker itself is indifferent; every kind snaps
 * identically.
 *
 * That does NOT mean MoveTool's grab call needs no ownership test — it does,
 * and this comment used to claim otherwise. `MoveTool`'s candidate memo has two
 * branches with different element types, so `candidates` is their union and
 * `hit` comes back a plain SnapPoint whichever branch produced it; the narrowing
 * lives there, in `isBoardOwned`, whose comment carries the full reason
 * (SnapPoint is an interface whose `owner` is the union, so narrowing
 * `hit.owner` never narrows `hit`). The branch union is what costs the type
 * information — nothing about this function.
 *
 * Which leaves the generic currently UNREALIZED: both call sites pass that
 * union-typed array, so `T` never resolves to BoardSnapPoint anywhere in the
 * repo today. Kept because it is free and correct, and because a caller that
 * hands over a board-only array should not have to re-narrow what it already
 * knows — but do not read it as load-bearing for anything that compiles now.
 *
 * Ties in screen distance are broken by depth, nearer to the camera first.
 */
export function pickSnapPoint<T extends SnapPoint>(
  candidates: T[],
  project: Projector,
  cursor: { x: number; y: number },
  radiusPx: number,
): T | null {
  let best: T | null = null;
  // Seeded with the radius so "within range" and "better than what we have"
  // are one comparison. Squared throughout — no square root is needed to
  // order distances, and the boundary stays exact.
  let bestDistSq = radiusPx * radiusPx;
  let bestDepth = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const projected = project(candidate.at);
    if (!projected) continue;
    const dx = projected.x - cursor.x;
    const dy = projected.y - cursor.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > bestDistSq) continue;
    // Strictly nearer on screen always wins. An exact tie — including the
    // first candidate found, whose distance ties the seeded radius — falls
    // through to depth.
    if (distSq < bestDistSq || projected.depth < bestDepth) {
      best = candidate;
      bestDistSq = distSq;
      bestDepth = projected.depth;
    }
  }
  return best;
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/**
 * The point on an axis-parallel construction line nearest the cursor's ray,
 * slid along the line and rounded to the drag grid (construction-lines spec §4.1).
 *
 * The line is `P + t*e` (`e` the unit axis, `P = line.at`, whose along
 * coordinate is 0 by the canonical form, so `t` IS the world coordinate along
 * it) and the ray `O + s*d`. With `w = P - O`, `b = e.d`, `c = d.d`,
 * `p = e.w`, `q = d.w` the closest approach is `t = (b*q - c*p) / (c - b^2)`.
 * A ray parallel to the line (a Y line seen straight down) has no closest
 * point, so it offers nothing rather than a NaN.
 *
 * `t` is clamped to the drawn `extent`; the screen test then projects that
 * UNROUNDED point, so a cursor past the line's drawn end is far from it and
 * offers nothing. Only the returned `at` is rounded (`snapToGrid`, a free
 * slide: invariant 25 forbids rounding exact moves, not this).
 *
 * An OBLIQUE line (construction-lines-2 spec §2.4) takes the general closest approach with `u` its unit direction
 * (`t` is the distance from `at`), `t` clamped to `lineSpan` (a line that misses the box offers nothing), the screen
 * test on that clamped, unrounded point, and only the returned point rounded: `at + snapToGrid(t)*u`, the one free
 * coordinate (inv 25). The axis path above is untouched.
 *
 * Ties break by screen distance, then depth, as `pickSnapPoint` does.
 */
export function pickOnLine(
  lines: AnyLine[],
  project: Projector,
  cursor: { x: number; y: number },
  ray: { origin: Vec3; dir: Vec3 },
  radiusPx: number,
  units: Units,
  extent: number,
): SnapPoint | null {
  let best: SnapPoint | null = null;
  let bestDistSq = radiusPx * radiusPx;
  let bestDepth = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    const hit = closestOnLine(line, ray, extent);
    if (!hit) continue;
    const projected = project(hit.at);
    if (!projected) continue;
    const dx = projected.x - cursor.x;
    const dy = projected.y - cursor.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > bestDistSq) continue;
    if (distSq < bestDistSq || projected.depth < bestDepth) {
      let at: Vec3;
      if (line.axis === undefined) {
        const u = lineDir(line);
        const r = snapToGrid(hit.t, units);
        at = [line.at[0] + r * u[0], line.at[1] + r * u[1], line.at[2] + r * u[2]];
      } else {
        at = [line.at[0], line.at[1], line.at[2]];
        at[AXIS_INDEX[line.axis]] = snapToGrid(hit.t, units);
      }
      best = { kind: 'line', at, owner: { type: 'guide', id: line.id } };
      bestDistSq = distSq;
      bestDepth = projected.depth;
    }
  }
  return best;
}

/**
 * The closest approach of the cursor's ray to a construction line, `t` clamped to the drawn extent (`+-extent` on an
 * axis line, `lineSpan` on an oblique one; `t` is the world coordinate along an axis line, the distance from `at` along
 * an oblique one) and `at` the UNROUNDED point. `null` for a ray parallel to the line, or an oblique line that misses
 * the box. Shared by `pickOnLine` (which then rounds `t`, inv 25) and `pickGuide` (which does not).
 */
export function closestOnLine(
  line: AnyLine,
  ray: { origin: Vec3; dir: Vec3 },
  extent: number,
): { t: number; at: Vec3 } | null {
  const { origin: O, dir: d } = ray;
  const c = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (line.axis === undefined) {
    const u = lineDir(line);
    const span = lineSpan(line, extent);
    if (!span) return null;
    const b = u[0] * d[0] + u[1] * d[1] + u[2] * d[2];
    const den = c - b * b;
    if (!(den > 1e-9 * c)) return null;
    const w: Vec3 = [line.at[0] - O[0], line.at[1] - O[1], line.at[2] - O[2]];
    const p = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
    const q = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
    let t = (b * q - c * p) / den;
    if (!Number.isFinite(t)) return null;
    t = Math.max(span[0], Math.min(span[1], t));
    return { t, at: [line.at[0] + t * u[0], line.at[1] + t * u[1], line.at[2] + t * u[2]] };
  }
  const i = AXIS_INDEX[line.axis];
  const b = d[i];
  const den = c - b * b;
  if (!(den > 1e-9 * c)) return null;
  const p = line.at[i] - O[i]; // e.w, e the unit axis
  const q = d[0] * (line.at[0] - O[0]) + d[1] * (line.at[1] - O[1]) + d[2] * (line.at[2] - O[2]);
  let t = (b * q - c * p) / den;
  if (!Number.isFinite(t)) return null;
  t = Math.max(-extent, Math.min(extent, t));
  const at: Vec3 = [line.at[0], line.at[1], line.at[2]];
  at[i] = t;
  return { t, at };
}

/** `projected.depth` and the caller's occluder depth come from one projection; the epsilon only absorbs float noise. */
export const DEPTH_EPS = 1e-6;

/**
 * The id of the guide nearest the cursor within `radiusPx`, or null. Points by projected distance (never occluded:
 * their markers draw `depthTest: false`); lines by the projected unrounded `closestOnLine` point, kept only when
 * nothing nearer hides it (`occluderDepth`, the NDC depth of the first part hit under the cursor, or null).
 * Nearest on screen wins; a tie goes to a point, then to the nearer depth.
 */
export function pickGuide(
  guides: readonly Guide[],
  project: Projector,
  cursor: { x: number; y: number },
  ray: { origin: Vec3; dir: Vec3 },
  radiusPx: number,
  extent: number,
  occluderDepth: number | null,
): string | null {
  let best: string | null = null;
  let bestDistSq = radiusPx * radiusPx;
  let bestDepth = Number.POSITIVE_INFINITY;
  let bestIsPoint = false;

  for (const g of guides) {
    const isPoint = isGuidePoint(g);
    let at: Vec3;
    if (isPoint) {
      at = g.at;
    } else {
      const hit = closestOnLine(g, ray, extent);
      if (!hit) continue;
      at = hit.at;
    }
    const projected = project(at);
    if (!projected) continue;
    if (!isPoint && occluderDepth !== null && projected.depth > occluderDepth + DEPTH_EPS) continue;
    const dx = projected.x - cursor.x;
    const dy = projected.y - cursor.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > bestDistSq) continue;
    const better =
      best === null ||
      distSq < bestDistSq ||
      (isPoint && !bestIsPoint) ||
      (isPoint === bestIsPoint && projected.depth < bestDepth);
    if (better) {
      best = g.id;
      bestDistSq = distSq;
      bestDepth = projected.depth;
      bestIsPoint = isPoint;
    }
  }
  return best;
}

/**
 * The composed picker: a discrete candidate (corner, edge point, guide point,
 * crossing) within the radius always wins; only when none is does the cursor
 * slide along a construction line.
 */
export function pickGuided(
  candidates: SnapPoint[],
  lines: AnyLine[],
  project: Projector,
  cursor: { x: number; y: number },
  ray: { origin: Vec3; dir: Vec3 },
  radiusPx: number,
  units: Units,
  extent: number,
): SnapPoint | null {
  return (
    pickSnapPoint(candidates, project, cursor, radiusPx) ??
    pickOnLine(lines, project, cursor, ray, radiusPx, units, extent)
  );
}
