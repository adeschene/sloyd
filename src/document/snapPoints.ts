import { boardExtents } from './geometry';
import type { Board } from './types';

/**
 * What a snap point sits on. Drives the marker's colour, and nothing else —
 * every kind snaps identically.
 */
export type SnapKind = 'corner' | 'edge-mid' | 'face-center';

/**
 * What a snap point belongs to.
 *
 * A discriminated union rather than a bare board id, deliberately: guide
 * points, guide lines and the tape measure are the named follow-ups to this
 * round, and every one of them produces candidates owned by something that is
 * not a board. Adding a member here is how they land; the picker's signature
 * never has to change. See the design's §2.3.
 */
export type SnapOwner = { type: 'board'; id: string };

export interface SnapPoint {
  kind: SnapKind;
  /** World position, inches. */
  at: [number, number, number];
  owner: SnapOwner;
}

/**
 * A board's 26 snap candidates: 8 corners, 12 edge midpoints, 6 face centres.
 *
 * A board is always an axis-aligned box (rotation is 0 or 90 about Y, posture
 * only names which dimension points up), so the candidates are the 3x3x3
 * lattice of {min, mid, max} on each world axis. The number of axes sitting at
 * `mid` is exactly what names the kind: none is a corner, one is an edge
 * midpoint, two is a face centre — and three is the volume centre, which is
 * skipped. It is the one lattice point with no feature under it to draw a
 * marker against, so an indicator there would appear to hang in mid-air.
 *
 * Pure, and derived on demand: nothing about snap points is stored, the same
 * way the cut list, the diagrams and the nesting are derived.
 */
export function boardSnapPoints(board: Board): SnapPoint[] {
  const [ex, ey, ez] = boardExtents(board);
  const [px, py, pz] = board.position;
  // `position` is the min-corner, not the centre — see invariant 2.
  const xs = [px, px + ex / 2, px + ex];
  const ys = [py, py + ey / 2, py + ey];
  const zs = [pz, pz + ez / 2, pz + ez];
  const owner: SnapOwner = { type: 'board', id: board.id };

  const points: SnapPoint[] = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      for (let k = 0; k < 3; k += 1) {
        const mids = (i === 1 ? 1 : 0) + (j === 1 ? 1 : 0) + (k === 1 ? 1 : 0);
        if (mids === 3) continue;
        const kind: SnapKind =
          mids === 0 ? 'corner' : mids === 1 ? 'edge-mid' : 'face-center';
        points.push({ kind, at: [xs[i], ys[j], zs[k]], owner });
      }
    }
  }
  return points;
}
