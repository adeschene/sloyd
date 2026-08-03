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
 * Ties in screen distance are broken by depth, nearer to the camera first.
 */
export function pickSnapPoint(
  candidates: SnapPoint[],
  project: Projector,
  cursor: { x: number; y: number },
  radiusPx: number,
): SnapPoint | null {
  let best: SnapPoint | null = null;
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
