import type { Units } from '../units/length';
import type { Board, Dimension, Posture, Span } from './types';

/** The order two dimensions are considered in when they share the floor. */
export const DIMENSION_ORDER: Dimension[] = ['length', 'width', 'thickness'];

/**
 * The 1/16" grid a FREE value is rounded to — a gizmo drag, or a model's
 * generated part. Lives here rather than in viewport so that document code
 * (generated.ts) can round to the same grid without importing upward. Never
 * applied to an exact position or a difference of two (invariant 25).
 */
export const SNAP_INCHES = 1 / 16;

/** The FREE-drag grid (metric-display spec R5): 1/16" or 1 mm. Exact moves are never rounded to it (inv 25); Generate and
 *  joinery keep SNAP_INCHES. Here, not in units/, because it produces no string (the → units edge rule). */
export const snapStep = (units: Units): number => (units.display === 'metric-mm' ? 1 / 25.4 : SNAP_INCHES);

/**
 * The dimension a cut's offset and width are measured along: the one that is
 * neither cut into nor run across. Implied rather than stored — see the Cut
 * doc comment — so this is the single place it is worked out.
 *
 * It lives here rather than in document.ts because cuts.ts needs it and
 * document.ts re-exports cuts.ts; geometry.ts is the leaf both sit above.
 */
export function positionAxisOf(face: Dimension, across: Dimension): Dimension {
  return DIMENSION_ORDER.find((d) => d !== face && d !== across)!;
}

/** Which dimension each posture puts on the vertical axis. */
const UP: Record<Posture, Dimension> = {
  flat: 'thickness',
  'on-edge': 'width',
  upright: 'length',
};

/** One world axis of a part: the dimension it carries, and whether that
 *  dimension's coordinate 0 sits on the world MAX side. */
export interface AxisMap { dim: Dimension; reversed: boolean }

/** The two dimensions that lie horizontal in a posture, [h0, h1], in
 *  DIMENSION_ORDER. Turn 0 puts h0 on X and h1 on Z. */
export function horizontalOf(posture: Posture): [Dimension, Dimension] {
  const up = UP[posture];
  const [h0, h1] = DIMENSION_ORDER.filter((d) => d !== up);
  return [h0!, h1!];
}

/**
 * The ONE home of the turn table (quarter-turns spec §2): which board
 * dimension runs along each world axis, as [X, Y, Z], and in which direction.
 *
 * Posture names the dimension that points up; the other two take X and Z, and
 * rotation picks which is which and in which direction — at 0 the earlier of
 * [length, width, thickness] goes on X; each further quarter turn is a TRUE
 * rotation counter-clockwise seen from above. Before v8, 90 was a mirror across the X=Z diagonal (no
 * direction existed), so a part's cuts could never face (-X, +Z): one corner
 * of a frame was unreachable for identical parts.
 *
 * At turn 0 this reproduces all four orientations v2 could reach and adds the
 * two it could not, with ONE exception: on-edge's thickness axis is reversed
 * (schema 12, fu 215: every posture has ONE hand). Flat and upright agree with
 * the v2 rows exactly, and an on-edge part's stored cuts are mirrored along
 * thickness by the v11 -> v12 migration (`onEdgeToV12`) so nothing moves on screen. The v2 rows are
 * asserted explicitly in the tests, because agreeing with the old table is
 * what makes this a generalisation rather than a rewrite of every document
 * ever saved.
 *
 * Nothing else restates the mapping: axisDimensions, boardExtents and the
 * viewport's grain code all derive from it — before v3 it was implicit in a
 * boolean and had to be restated in two files that could drift apart.
 */
export function axisFrame(board: Board): [AxisMap, AxisMap, AxisMap] {
  const frame = turnFrame(board);
  // Follow-up 215: on-edge's turn-0 frame (L→X, W→Y, T→Z) was a proper rotation of the part's own
  // (length, width, thickness) basis while flat and upright were mirrors, so a posture change mirrored a
  // one-handed part. Reversing thickness gives every posture ONE hand. A quarter turn about Y carries
  // thickness's world direction with it, so toggling the flag at every turn equals turning the new turn 0.
  return board.posture === 'on-edge'
    ? frame.map((a) => (a.dim === 'thickness' ? { ...a, reversed: !a.reversed } : a)) as [AxisMap, AxisMap, AxisMap]
    : frame;
}

/** The turn table proper (quarter-turns spec §2), before the on-edge hand fix. */
function turnFrame(board: Board): [AxisMap, AxisMap, AxisMap] {
  const [h0, h1] = horizontalOf(board.posture);
  const y: AxisMap = { dim: UP[board.posture], reversed: false };
  switch (board.rotation) {
    case 90: return [{ dim: h1, reversed: false }, y, { dim: h0, reversed: true }];
    case 180: return [{ dim: h0, reversed: true }, y, { dim: h1, reversed: true }];
    case 270: return [{ dim: h1, reversed: true }, y, { dim: h0, reversed: false }];
    default: return [{ dim: h0, reversed: false }, y, { dim: h1, reversed: false }];
  }
}

/** Which dimension runs along each world axis, as [X, Y, Z], without direction. */
export function axisDimensions(board: Board): [Dimension, Dimension, Dimension] {
  return axisFrame(board).map((a) => a.dim) as [Dimension, Dimension, Dimension];
}

/**
 * Part coordinate u, on the dimension world `axis` carries, as a distance from
 * `position[axis]` (the world min corner, invariant 2). On a reversed axis the
 * part's 0 is at the far side. Every crossing between a part's frame and the
 * world goes through these four helpers; never write `board[dim] - u` at a
 * call site. A hot loop may pass `frame` — `axisFrame(board)` computed once for
 * the SAME board (Task 11b, ruling R12) — instead of recomputing it per call.
 */
export function toWorldOffset(board: Board, axis: number, u: number, frame: readonly AxisMap[] = axisFrame(board)): number {
  const a = frame[axis]!;
  return a.reversed ? board[a.dim] - u : u;
}

/** The inverse of toWorldOffset (the same reflection). */
export function fromWorldOffset(board: Board, axis: number, w: number): number {
  return toWorldOffset(board, axis, w);
}

/** A part span → a world-offset span, still [min, max]. */
export function spanToWorldOffset(board: Board, axis: number, s: Span): Span {
  const a = axisFrame(board)[axis]!;
  return a.reversed ? [board[a.dim] - s[1], board[a.dim] - s[0]] : [s[0], s[1]];
}

/** A world-offset span → a part span, still [min, max]. */
export function spanFromWorldOffset(board: Board, axis: number, s: Span): Span {
  return spanToWorldOffset(board, axis, s);
}

/** Which end of the part's dimension on `axis` faces the world min (-1) or
 *  max (+1) side. Joinery maps a world side to a cut's `from` with this. */
export function endFacing(board: Board, axis: number, side: -1 | 1): 'min' | 'max' {
  const worldMin = side === -1;
  return worldMin !== axisFrame(board)[axis]!.reversed ? 'min' : 'max';
}

/** World-space size of a board along [X, Y, Z], in inches. */
export function boardExtents(board: Board): [number, number, number] {
  const [x, y, z] = axisDimensions(board);
  return [board[x], board[y], board[z]];
}

/**
 * World-space center of a board. `position` is the min-corner, so the center
 * is the corner plus half the extents. Three.js meshes are center-origin, so
 * this is what the viewport positions a box at.
 */
export function boardCenter(board: Board): [number, number, number] {
  const [x, y, z] = boardExtents(board);
  return [
    board.position[0] + x / 2,
    board.position[1] + y / 2,
    board.position[2] + z / 2,
  ];
}

/**
 * Where a board's min-corner has to move so that changing its orientation turns
 * it in place instead of shoving it sideways.
 *
 * The rule: reorienting preserves the footprint's X and Z centre and preserves
 * Y-min. `position` is the min-corner, so swapping the extents with the corner
 * pinned is what made a 24 x 5-1/2 board appear to jump nearly 9-1/4in when it
 * turned; half the difference in extents on each horizontal axis cancels
 * exactly that. Y is passed through rather than centred, because a board
 * resting on the floor should still be resting on the floor after it is stood
 * on edge.
 *
 * Pure, and it lives here rather than in the store so that every call site
 * shares one piece of orientation arithmetic.
 */
export function reorientedPosition(
  board: Board,
  changes: Partial<Board>,
): [number, number, number] {
  const before = boardExtents(board);
  const after = boardExtents({ ...board, ...changes });
  return [
    board.position[0] + (before[0] - after[0]) / 2,
    board.position[1],
    board.position[2] + (before[2] - after[2]) / 2,
  ];
}

/** An axis-aligned box in world space, inches. */
export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * The world box around a set of boards, from the least min corner to the
 * greatest far corner, or null for no boards. `position` is the min corner
 * (invariant 2) and `boardExtents` already honours posture and rotation, so
 * this is one pass of min/max — no centre arithmetic to get wrong.
 *
 * The group gizmo is placed at its centre and the store's group move rounds
 * its `min` (multi-select spec §4.1).
 */
export function boardsBounds(boards: readonly Board[]): Bounds | null {
  if (boards.length === 0) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boards) {
    const extents = boardExtents(b);
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], b.position[axis]);
      max[axis] = Math.max(max[axis], b.position[axis] + extents[axis]);
    }
  }
  return { min, max };
}
