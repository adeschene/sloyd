import { nextId } from '../../document/document';
import type { Board, Cut, Dimension } from '../../document/document';
import { DIMENSION_ORDER, axisDimensions, boardExtents } from '../../document/geometry';

export type V3 = [number, number, number];
export interface WorldBox { min: V3; max: V3 }

const EPS = 1e-9;

/** A part's own box in world space (invariant 2: position is the min corner). */
export function boxOf(b: Board): WorldBox {
  const e = boardExtents(b);
  return { min: [...b.position] as V3, max: [0, 1, 2].map((i) => b.position[i] + e[i]) as V3 };
}

/**
 * The ONE place a world box becomes a Cut (invariant 41). The cut removes
 * exactly `box ∩ board`.
 *
 * The box is mapped to the board's own dimensions, then clipped. `face` is a
 * dimension where the clipped box reaches the board's boundary — the
 * shallowest such, ties to the earlier in DIMENSION_ORDER. `across` carries
 * the stops: the remaining dimension with the most boundary contact (full
 * span, then one end), ties to the earlier; the last is the position axis.
 *
 * A box touching no face is an enclosed void, which no cut can make. That is
 * a recipe bug, so this THROWS rather than returning something wrong.
 */
export function pocketFor(board: Board, box: WorldBox): Cut {
  const dims = axisDimensions(board);
  const local = {} as Record<Dimension, [number, number]>;
  dims.forEach((d, i) => {
    // Snap within EPS to the exact ends, so a non-dyadic coordinate cannot
    // leave a 1e-16 stop that validateCuts keeps and cutLabel calls a notch.
    const snap = (v: number) => (Math.abs(v) <= EPS ? 0 : Math.abs(v - board[d]) <= EPS ? board[d] : v);
    local[d] = [
      snap(Math.max(0, box.min[i] - board.position[i])),
      snap(Math.min(board[d], box.max[i] - board.position[i])),
    ];
  });
  if (DIMENSION_ORDER.some((d) => local[d][1] - local[d][0] <= EPS)) {
    throw new Error(`pocketFor: the box misses ${board.name}`);
  }
  if (DIMENSION_ORDER.every((d) => local[d][0] <= EPS && local[d][1] >= board[d] - EPS)) {
    throw new Error(`pocketFor: the box removes the whole of ${board.name}`);
  }
  const atMin = (d: Dimension) => local[d][0] <= EPS;
  const atMax = (d: Dimension) => local[d][1] >= board[d] - EPS;
  const touching = DIMENSION_ORDER.filter((d) => atMin(d) || atMax(d));
  if (touching.length === 0) throw new Error(`pocketFor: an enclosed box cannot be cut from ${board.name}`);

  const reach = (d: Dimension) => local[d][1] - local[d][0];
  const face = touching.reduce((best, d) => (reach(d) < reach(best) - EPS ? d : best));
  const from = atMin(face) ? 'min' : 'max';
  const depth = from === 'min' ? local[face][1] : board[face] - local[face][0];

  // `across` carries the stops, so it is the dimension the box runs out along:
  // full span first, then one reaching an edge, then the earlier dimension.
  // Order alone put a stopped dado's stopped direction on the position axis
  // and cutLabel called it a "notch" (spec §4.1).
  const others = DIMENSION_ORDER.filter((d) => d !== face);
  const contacts = (d: Dimension) => (atMin(d) ? 1 : 0) + (atMax(d) ? 1 : 0);
  const across = contacts(others[1]) > contacts(others[0]) ? others[1] : others[0];
  const pos = others.find((d) => d !== across)!;
  return {
    id: nextId(),
    face, from, across,
    offset: local[pos][0],
    width: local[pos][1] - local[pos][0],
    depth,
    stopMin: local[across][0],
    stopMax: board[across] - local[across][1],
  };
}
