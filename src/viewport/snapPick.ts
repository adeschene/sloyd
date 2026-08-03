import type { SnapPoint } from '../document/document';

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
