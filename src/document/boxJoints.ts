import type { Board, Cut, CutFrom, Dimension } from './types';
import type { Units } from '../units/length';
import { clippedRegion, cutsThatRemoveStock } from './cuts';
import { snapStep } from './geometry';

/**
 * Box joints (box-joints spec): the ONE home of the finger layout (§3.3), the notch cuts it writes (§3.4) and the
 * recogniser that reads them back from the cuts' SHAPE (§5.1). Pure: no store, no world. Imports only a TYPE from
 * `units` (CLAUDE.md, the `→ units` edge rule).
 */

const EPS = 1e-9;

/** One corner's fingers along the shared span: `count` (odd, ≥ 5) segments, the inner ones exactly `width`, the two
 *  outer ones `outer` each, over `length` (`H`). */
export interface FingerLayout { count: number; width: number; outer: number; length: number }

/**
 * Spec §3.3: `N = max(5, 2n + 1)` with `n` the integer nearest `q = (H/w − 1)/2`, a TIE going DOWN (the fewer fingers
 * give the wider outer pair; thin outer fingers break off). Inner fingers are exactly `w`; the outer two share the rest,
 * `e = (H − (N − 2)·w) / 2`. Null when `w <= 0` or the span is too short for five fingers (`H < 4w`); the caller words it.
 */
export function fingerLayout(H: number, w: number): FingerLayout | null {
  if (!(w > 0) || H < 4 * w) return null;
  const q = (H / w - 1) / 2;
  const f = Math.floor(q);
  const n = Math.abs(q - f - 0.5) <= EPS ? f : Math.round(q);
  const count = Math.max(5, 2 * n + 1);
  return { count, width: w, outer: (H - (count - 2) * w) / 2, length: H };
}

/** Segment `k` (1-based) along the span, part-local from its min. Computed directly, never as a running sum (§3.4). */
export function segment(l: FingerLayout, k: number): [number, number] {
  const { count: N, width: w, outer: e, length: H } = l;
  if (k === 1) return [0, e];
  if (k === N) return [e + (N - 2) * w, H];
  return [e + (k - 2) * w, e + (k - 1) * w];
}

/**
 * The notches one part of a corner carries (§3.4): one `Cut` per notch in segment order, ids taken in order. The
 * outer-fingers part is notched at EVEN `k`, the outer-notches part at ODD `k`. `face`/`from` name the end running into
 * the corner, `along` the part's `J` dimension; offsets are segment starts from that dimension's min (part-local). An
 * inner notch is exactly `width` wide and the last outer one `H −` its start.
 */
export function notchCuts(
  l: FingerLayout, outerFingers: boolean, face: Dimension, from: CutFrom, along: Dimension, depth: number, ids: string[],
): Cut[] {
  // `along` is implied by `face` and `across: 'thickness'` (a cut's position axis is never stored); a caller naming any
  // other dimension has its corner's axes wrong.
  if (along === face || along === 'thickness') throw new Error(`notchCuts: ${along} is not the position axis of ${face}`);
  const out: Cut[] = [];
  for (let k = outerFingers ? 2 : 1; k <= l.count; k += 2) {
    const [lo] = segment(l, k);
    // Not `hi − lo`: an inner notch is exactly `width` wide (its end may then sit an ulp off the next segment's start,
    // which every reader takes at 1e-9).
    const width = k === 1 ? l.outer : k === l.count ? l.length - lo : l.width;
    out.push({ id: ids[out.length], face, from, across: 'thickness', offset: lo, width, depth, stopMin: 0, stopMax: 0 });
  }
  return out;
}

/** A recognised box joint at one end of one dimension (§5.1). `layout` is rebuilt from what was read. */
export interface FingerSet {
  dim: Dimension; end: CutFrom; layout: FingerLayout; depth: number; outerFingers: boolean; cutIds: string[];
}

const ENDS: [Dimension, CutFrom][] = [['length', 'min'], ['length', 'max'], ['width', 'min'], ['width', 'max']];

/** Every finger set on the board, in the order length min, length max, width min, width max. */
export function fingerSets(board: Board): FingerSet[] {
  return ENDS.flatMap(([dim, end]) => fingerSetAt(board, dim, end) ?? []);
}

/**
 * The finger set at one end, decided from the cuts' SHAPE, never their stored fields (§5.1): a resize re-stores a notch
 * as a thickness-face pocket (`refaceFromEnd`), and it must still be seen. The stock-removing cuts whose clipped region
 * is open at that end face of `dim` and spans the whole thickness must ALL reach one depth into `dim` (a different one
 * means no set). Read along the other face dimension, those notches and the fingers between them alternate across all
 * of it, starting and ending with the same kind, in `N ≥ 5` segments, every inner one equal and the two outer equal
 * (all to 1e-9).
 */
export function fingerSetAt(board: Board, dim: Dimension, end: CutFrom): FingerSet | null {
  if (dim === 'thickness') return null;
  const P: Dimension = dim === 'length' ? 'width' : 'length';
  const D = board[dim];
  const T = board.thickness;
  const notches: { id: string; lo: number; hi: number; depth: number }[] = [];
  for (const cut of cutsThatRemoveStock(board)) {
    const r = clippedRegion(board, cut);
    const open = end === 'min' ? r[dim][0] <= EPS : r[dim][1] >= D - EPS;
    if (!open || r.thickness[0] > EPS || r.thickness[1] < T - EPS) continue;
    notches.push({ id: cut.id, lo: r[P][0], hi: r[P][1], depth: end === 'min' ? r[dim][1] : D - r[dim][0] });
  }
  if (notches.length < 2) return null;
  const depth = notches[0].depth;
  if (notches.some((n) => Math.abs(n.depth - depth) > EPS)) return null;
  notches.sort((a, b) => a.lo - b.lo);

  // The segments in order: [lo, hi, isNotch].
  const segs: [number, number, boolean][] = [];
  let at = 0;
  for (const n of notches) {
    if (n.lo > at + EPS) segs.push([at, n.lo, false]);
    else if (n.lo < at - EPS) return null; // overlapping notches
    else if (segs.length > 0) return null; // two notches touching: no finger between
    segs.push([n.lo, n.hi, true]);
    at = n.hi;
  }
  const H = board[P];
  if (at < H - EPS) segs.push([at, H, false]);
  else if (at > H + EPS) return null;

  const N = segs.length;
  if (N < 5 || segs[0][2] !== segs[N - 1][2]) return null;
  const len = (s: [number, number, boolean]) => s[1] - s[0];
  const outer = len(segs[0]);
  const width = len(segs[1]);
  if (Math.abs(len(segs[N - 1]) - outer) > EPS) return null;
  if (segs.slice(1, N - 1).some((s) => Math.abs(len(s) - width) > EPS)) return null;
  return {
    dim, end, layout: { count: N, width, outer, length: H }, depth, outerFingers: !segs[0][2],
    cutIds: notches.map((n) => n.id),
  };
}

/**
 * Spec §3.3: the thinner part's thickness rounded DOWN to the drag grid (`snapStep`; metric, whole mm, stored as
 * `k / 25.4` as `snapToGrid` does), never below 1/4" (6 mm). The 1e-9 slack keeps a thickness already on the grid where
 * it is (`12 / 25.4 * 25.4` is not exactly 12).
 */
export function defaultFingerWidth(thinner: number, units: Units): number {
  const perInch = units.display === 'metric-mm' ? 25.4 : 1 / snapStep(units);
  const least = units.display === 'metric-mm' ? 6 : 0.25 * perInch;
  return Math.max(Math.floor(thinner * perInch + EPS), least) / perInch;
}
