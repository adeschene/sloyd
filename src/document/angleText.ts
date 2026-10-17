import type { AngleCut, Board, CutFrom, Dimension } from './types';
import { angleCutsThatRemoveStock, bevelFields, chamferFields, depthAt, throughOf, miterLongSide, zeroStation } from './angleCuts';
import { formatLength, type Units } from '../units/length';

/** The cut's angle from square, degrees: atan(Δdepth / Δstation). A 45° miter stores depth = run (spec §2.3). */
export function angleDegrees(c: Pick<AngleCut, 'points'>): number {
  const [[s1, q1], [s2, q2]] = c.points;
  return (Math.atan(Math.abs(q2 - q1) / Math.abs(s2 - s1)) * 180) / Math.PI;
}

const other = (f: 'min' | 'max') => (f === 'min' ? 'max' : 'min');

/**
 * A face as the bench names it (fu 300): a LENGTH face is an end — "the length max end", as miters and tapers already
 * say — and any other face is "the width face (min side)". The one place a face's name is spelled, for every angle line.
 */
export function faceName(dim: Dimension, side: CutFrom): string {
  return dim === 'length' ? `the length ${side} end` : `the ${dim} face (${side} side)`;
}

/**
 * One angle cut as a bench line (angle-cuts spec §4.2), worded from its `kind`
 * in the cut list's existing vocabulary. THE ONE home of these strings: the cut
 * list and the part diagrams both print what this returns (invariant 19). The
 * degree sign is HTML text, never a measured SVG label.
 */
export function angleLine(board: Board, c: AngleCut, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const deg = `${angleDegrees(c).toFixed(1)}°`;
  const side = faceName(c.face, c.from);
  const A = board[c.along];
  const z = zeroStation(c);
  const near = depthAt(c, 0);
  switch (c.kind) {
    case 'taper':
      if (near > 0 && Number.isFinite(z) && z > 0 && z <= A) {
        return `Taper ${f(near)} off ${side}, from ${f(z)} from the ${c.along} ${c.alongFrom} end to that end`;
      }
      // Deepening toward the far end: the same standard form, measured from the deep end.
      if (near <= 0 && depthAt(c, A) > 0 && Number.isFinite(z) && z >= 0 && z < A) {
        return `Taper ${f(depthAt(c, A))} off ${side}, from ${f(A - z)} from the ${c.along} ${other(c.alongFrom)} end to that end`;
      }
      return `Taper off ${side}: ${f(Math.max(0, near))} at the ${c.along} ${c.alongFrom} end, ${f(Math.max(0, depthAt(c, A)))} at the ${c.along} ${other(c.alongFrom)} end`;
    case 'miter':
      return `Miter ${deg} across the ${c.along} at the ${c.face} ${c.from} end, long point on the ${c.along} ${miterLongSide(c, board)} side`;
    case 'bevel': {
      const bf = bevelFields(c, board);
      if (!bf) return `Bevel ${deg} off ${side}, across the ${c.along}`;
      return `Bevel ${deg} off ${side}, across the ${c.along}, long point on the ${c.along} ${bf.longSide} side`;
    }
    case 'chamfer': {
      const cf = chamferFields(c, board);
      if (!cf) return `Chamfer ${deg} off ${side}, across the ${c.along}`;
      const through = throughOf(cf);
      const edge = `the edge between ${faceName(cf.face, cf.from)} and ${faceName(cf.along, cf.alongFrom)}, along the ${through}`;
      return cf.legFace === cf.legAlong
        ? `Chamfer ${f(cf.legFace)} on ${edge}`
        : `Chamfer ${f(cf.legFace)} into the ${cf.face} × ${f(cf.legAlong)} into the ${cf.along}, on ${edge}`;
    }
  }
}

/**
 * The short point of a part cut at one or both ends (spec §4.2, amended
 * 2026-10-12, fu 281): the shortest long edge. At each corner of the end-face
 * rectangle (width × thickness) an end's depth is its deepest end cut there
 * (a cut on the length face, whatever its `kind`: kind never decides geometry),
 * clamped to [0, length] (an end chamfer leaving a tongue excluded, fu 385); the short point is the least over the corners of
 * length less both ends' depths, clamped at 0. (Each end's depth is a max of
 * linear functions, so convex; the remaining length is concave and its least is at a corner.) Null when the part has no end cut that removes stock.
 */
export function shortPointLine(board: Board, units: Units): string | null {
  // fu 385 (the user's ruling): an end CHAMFER that leaves part of the end face standing (a raised panel's tongue) is not a
  // length-setting cut — the stock is cut to length first — so it never sets the short point. One whose leg reaches the
  // far face is a miter by geometry and still counts.
  const tongued = (c: AngleCut) => {
    if (c.kind !== 'chamfer') return false;
    const cf = chamferFields(c, board);
    return cf !== null && cf.face === 'length' && cf.legAlong < board[cf.along] - 1e-9;
  };
  const ends = angleCutsThatRemoveStock(board).filter((c) => c.face === 'length' && !tongued(c));
  if (ends.length === 0) return null;
  const L = board.length;
  const depth = (end: 'min' | 'max', corner: { width: number; thickness: number }) => Math.max(0, ...ends.filter((c) => c.from === end).map((c) => {
    const x = corner[c.along as 'width' | 'thickness'];
    const s = c.alongFrom === 'min' ? x : board[c.along] - x;
    return Math.min(L, Math.max(0, depthAt(c, s)));
  }));
  let least = L;
  for (const width of [0, board.width]) for (const thickness of [0, board.thickness]) {
    const corner = { width, thickness };
    least = Math.min(least, L - depth('min', corner) - depth('max', corner));
  }
  return `Short point ${formatLength(Math.max(0, least), units)}`;
}
