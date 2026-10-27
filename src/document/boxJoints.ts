import type { Board, Cut, CutFrom, Dimension, SloydDocument } from './types';
import type { Units } from '../units/length';
import { clippedRegion, cutsThatRemoveStock } from './cuts';
import { boardExtents, endFacing, positionAxisOf, snapStep } from './geometry';
import { leans } from './lean';
import { hasTenons } from './roundTenons';
import { nextId } from './ids';
import { fingerAtMaxOf } from './fingerParity';
import { displayNames, worldParts } from './tree';
import {
  RUN_RANK, planCorners, writeCorners, type CornerCopy, type CornerEnd, type EndFlips, type JointKind,
} from './cornerPlan';
import {
  BOX_NO_CORNER, BOX_WIDTH_POSITIVE, boxContainers, boxCutInTheWay, boxHeights, boxHoleInTheWay, boxIgnored, boxJointedLines,
  boxLengthLine, boxLinkedDisagree, boxLinkedMate, boxLinkSplit, boxMirrored, boxPlainStock, boxThreeWay, boxTooShort,
  boxTwoCorners, type BoxFeature,
} from './boxJointText';

/**
 * Box joints (box-joints spec): the ONE home of the finger layout (§3.3), the notch cuts it writes (§3.4), the
 * recogniser that reads them back from the cuts' SHAPE (§5.1) and the box-joint kind of the shared corner planner
 * (`cornerPlan.ts`, §3, §6). Pure: no store. Imports only a TYPE from `units` (CLAUDE.md, the `→ units` edge rule);
 * every sentence lives in `boxJointText.ts` (the shared ones in `cornerText.ts`).
 */

const EPS = 1e-9;

/** One corner's fingers along the shared span (spec, Amended 2026-10-27: equal fingers): `count` (≥ 5, odd or even)
 *  segments over `length` (`H`), every one exactly `width` except at most ONE, the odd finger, `odd` wide; `odd === width`
 *  when there is none. Which end of the span the odd one sits at is the caller's (`segment`'s `oddEnd`). */
export interface FingerLayout { count: number; width: number; odd: number; length: number }

/**
 * The layout (spec, Amended 2026-10-27, the user's ruling: equal fingers, the leftover one odd finger, a sliver merged):
 * `k = ⌊H/w⌋` (an `H` within 1e-9 of a multiple counts as that multiple), `r = H − k·w`. `r ≤ 1e-9`: `k` fingers, every
 * one `w`. `r < w/4`: `k` fingers, the odd one `w + r` (the sliver merged into its neighbour). Else `k + 1` fingers, the
 * odd one `r`. The odd finger is always `H − (N − 1)·w`, computed directly. The `w/4` bound is judged to 1e-9 too (an `r`
 * within 1e-9 of `w/4` is `w/4`, which is not a sliver), so a metric span meant as exactly a quarter finger over does not
 * fall either side by float noise. Null when `w <= 0` or `N < 5` (fewer read as a tenon); the caller words it.
 */
export function fingerLayout(H: number, w: number): FingerLayout | null {
  if (!(w > 0) || !(H > 0)) return null;
  let k = Math.floor(H / w);
  if ((k + 1) * w - H <= EPS) k += 1;
  const r = H - k * w;
  const count = r <= EPS ? k : r < w / 4 - EPS ? k : k + 1;
  if (count < 5) return null;
  return { count, width: w, odd: r <= EPS ? w : H - (count - 1) * w, length: H };
}

/**
 * Segment `k` (1-based from the part-local `J` min), the odd segment at `oddEnd`. Computed directly, never as a running
 * sum: odd at max, `[(k − 1)w, kw]` and the last `[(N − 1)w, H]`; odd at min, the first `[0, odd]`, then
 * `[odd + (k − 2)w, odd + (k − 1)w]`, the last ending exactly at `H`.
 */
export function segment(l: FingerLayout, k: number, oddEnd: CutFrom): [number, number] {
  const { count: N, width: w, odd, length: H } = l;
  // With no odd finger the end does not matter: one formula, so both ends give the same bytes.
  if (oddEnd === 'max' || odd === w) return k === N ? [(N - 1) * w, H] : [(k - 1) * w, k * w];
  if (k === 1) return [0, odd];
  return [odd + (k - 2) * w, k === N ? H : odd + (k - 1) * w];
}

export { fingerAtMaxOf };

/**
 * The notches one part of a corner carries (§3.4): one `Cut` per notch in segment order, ids taken in order. A part with
 * a finger at `J`'s min is notched at EVEN `k`, the other at ODD `k`. `face`/`from` name the end running into the corner,
 * `along` the part's `J` dimension; offsets are segment starts from that dimension's min (part-local). A full notch is
 * exactly `width` wide, the odd one exactly `odd`, and the last one `H −` its start.
 */
export function notchCuts(
  l: FingerLayout, fingerAtMin: boolean, oddEnd: CutFrom, face: Dimension, from: CutFrom, along: Dimension, depth: number,
  ids: string[],
): Cut[] {
  // `along` is implied by `face` and `across: 'thickness'` (a cut's position axis is never stored); a caller naming any
  // other dimension has its corner's axes wrong.
  if (along !== positionAxisOf(face, 'thickness')) throw new Error(`notchCuts: ${along} is not the position axis of ${face}`);
  const out: Cut[] = [];
  for (let k = fingerAtMin ? 2 : 1; k <= l.count; k += 2) {
    const [lo] = segment(l, k, oddEnd);
    // Not `hi − lo`: a full notch is exactly `width` wide (its end may then sit an ulp off the next segment's start,
    // which every reader takes at 1e-9).
    const width = k === l.count ? l.length - lo : k === 1 && oddEnd === 'min' && l.odd !== l.width ? l.odd : l.width;
    out.push({ id: ids[out.length], face, from, across: 'thickness', offset: lo, width, depth, stopMin: 0, stopMax: 0 });
  }
  return out;
}

/** A recognised box joint at one end of one dimension (§5.1). `layout` is rebuilt from what was read; `fingerAtMin`
 *  says whether `J`'s min segment carries a finger on this part, `oddEnd` which end of `J` the odd finger is at (null
 *  when every segment is `width`). Never anything world-relative. */
export interface FingerSet {
  dim: Dimension; end: CutFrom; layout: FingerLayout; depth: number; fingerAtMin: boolean; oddEnd: CutFrom | null;
  cutIds: string[];
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
 * of it in `N ≥ 5` segments (spec, Amended 2026-10-27): every segment the same width `w`, except at most ONE END segment,
 * which may be any width in `(0, 1.25w)` (a width within 1e-9 of `w` is `w`, one within 1e-9 of `1.25w` is not under it).
 * Two differing end segments are not a set. `N` may be even (a finger at one edge, a notch at the other).
 */
export function fingerSetAt(board: Board, dim: Dimension, end: CutFrom): FingerSet | null {
  if (dim === 'thickness') return null;
  const P = positionAxisOf(dim, 'thickness');
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
  if (N < 5) return null;
  const len = (s: [number, number, boolean]) => s[1] - s[0];
  const width = len(segs[1]);
  if (segs.slice(1, N - 1).some((s) => Math.abs(len(s) - width) > EPS)) return null;
  const offMin = Math.abs(len(segs[0]) - width) > EPS;
  const offMax = Math.abs(len(segs[N - 1]) - width) > EPS;
  if (offMin && offMax) return null;
  const oddEnd: CutFrom | null = offMin ? 'min' : offMax ? 'max' : null;
  const odd = oddEnd === null ? width : len(segs[oddEnd === 'min' ? 0 : N - 1]);
  if (odd >= 1.25 * width - EPS) return null;
  return {
    dim, end, layout: { count: N, width, odd, length: H }, depth, fingerAtMin: !segs[0][2], oddEnd,
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

// ---------------------------------------------------------------------------------------------------------------------
// The planner (spec §3, §6; plan Spec difference 3 revised): box joints' kind over the shared corner planner
// (`cornerPlan.ts`)
// ---------------------------------------------------------------------------------------------------------------------

/** The action's inputs (spec §4): the typed finger width and Swap fingers. */
export interface BoxJointOptions { width: number; swap: boolean }
/** One jointed corner: its two parts' WORLD ids and the ONE layout they share. */
export interface BoxJointCorner { a: string; b: string; layout: FingerLayout }
/**
 * The plan. `parts` maps every jointed WORLD part (its occurrence id) to its full new world board; another placement of
 * a definition follows through the write-back (inv 46). A Shape's users all carry the Shape's ONE new set of shared
 * fields, read through their own flags (Spec difference 3 revised). `notes` are the success lines in order: the jointed
 * line(s), then the length lines, then the ignored lines.
 */
export interface BoxJointPlan { parts: Map<string, Board>; corners: BoxJointCorner[]; notes: string[] }

/** One side's notches in its WORLD part's own `J` terms: the phase (`fingerAtMin`) and the odd finger's end. */
interface FingerSide { fingerAtMin: boolean; oddEnd: CutFrom }
/** One corner's box-joint plan: the ONE layout, and each side's part-local phase and odd end (side 0, side 1). */
interface FingerCornerPlan { layout: FingerLayout; sides: [FingerSide, FingerSide] }

/** The first feature a part may not carry yet (spec §3.5), in the copy's order, or null. */
function featureOf(b: Board): BoxFeature | null {
  if (leans(b)) return 'lean';
  if (b.angleCuts.length > 0) return 'angle cut';
  if (b.curves.length > 0) return 'curve';
  if (b.profiles.length > 0) return 'edge profile';
  if (b.bands.length > 0) return 'edge banding';
  if (hasTenons(b)) return 'round tenon';
  return null;
}

const flipEnd = (e: CutFrom): CutFrom => (e === 'min' ? 'max' : 'min');

/** A side's phase and odd end read through a Shape's own board's `j` flip (the finger at J's min becomes the one at
 *  J's max; the odd end flips). */
function localSide(l: FingerLayout, s: FingerSide, flips: EndFlips): FingerSide {
  return flips.j ? { fingerAtMin: fingerAtMaxOf(l.count, s.fingerAtMin), oddEnd: flipEnd(s.oddEnd) } : s;
}

const BOX_COPY: CornerCopy<BoxFeature> = {
  noCorner: BOX_NO_CORNER, mirrored: boxMirrored, containers: boxContainers, heights: boxHeights, twoCorners: boxTwoCorners,
  threeWay: boxThreeWay, plainStock: boxPlainStock, cutInTheWay: boxCutInTheWay, holeInTheWay: boxHoleInTheWay,
  linkedMate: boxLinkedMate, linkedDisagree: boxLinkedDisagree, linkSplit: boxLinkSplit, ignored: boxIgnored,
  length: boxLengthLine,
};

/** Box joints as a corner joint kind (`JointKind`), for the typed width and Swap fingers. */
function boxKind(opts: BoxJointOptions): JointKind<FingerCornerPlan, BoxFeature> {
  return {
    copy: BOX_COPY,
    featureOf,
    removeAt(b, d, end) {
      const set = fingerSetAt(b, d, end);
      if (set) b.cuts = b.cuts.filter((c) => !set.cutIds.includes(c.id));
    },
    planCorner({ ends: [ea, eb], J }, _ops, _doc, nameOf) {
      const layout = fingerLayout(boardExtents(ea.part)[J]!, opts.width);
      if (!layout) return boxTooShort(nameOf(ea.part), nameOf(eb.part));
      // The start edge (full fingers start there, the odd one is at the other end): J's world MAX on every axis, so the
      // odd finger is at J's world MIN — the bottom for Y, the BACK for Z (+Z is the front, `drawing.ts`), the left for X
      // (ruled 2026-10-27 after review). Each part reads it in its OWN J terms (`endFacing`) and computes its segments
      // directly from there; the two parts share J's world span, so their notches are exact complements.
      const startSide: -1 | 1 = 1;
      const aStartFinger = (RUN_RANK[ea.k]! < RUN_RANK[eb.k]!) !== opts.swap;
      const side = (e: CornerEnd, startFinger: boolean): FingerSide => {
        const start = endFacing(e.part, J, startSide);
        return { oddEnd: flipEnd(start), fingerAtMin: start === 'min' ? startFinger : fingerAtMaxOf(layout.count, startFinger) };
      };
      return { layout, sides: [side(ea, aStartFinger), side(eb, !aStartFinger)] };
    },
    /** Add `op`'s notches at `end` (spec §3.4), ids minted here, the side's phase and odd end in `b`'s own `J` terms. */
    addAt(b, op, end, plan, side, flips) {
      const { fingerAtMin, oddEnd } = localSide(plan.layout, plan.sides[side], flips);
      const along = positionAxisOf(op.d, 'thickness');
      const ids = Array.from({ length: plan.layout.count }, () => nextId());
      b.cuts = [...b.cuts, ...notchCuts(plan.layout, fingerAtMin, oddEnd, op.d, end, along, op.depth, ids)];
    },
    /** The layout, the phase and the odd finger's end, Shape-local (with no odd finger its end is no part of the
     *  layout: null). */
    signature(plan, side, flips) {
      const l = plan.layout;
      const s = localSide(l, plan.sides[side], flips);
      return [l.count, l.width, l.odd, s.fingerAtMin, l.odd === l.width ? null : s.oddEnd];
    },
  };
}

/**
 * Box joint the corners among the selected world parts `ids` (spec §3, §6). Every refusal is decided before any
 * mutation, in this order:
 * 1. `width` not finite and more than zero.
 * 2.–4. and 6. The shared corner planner (`planCorners`, `cornerPlan.ts`): a part in a mirrored copy; the corners and
 *    their refusals; per part end the plain-stock test (`featureOf`), the old finger set removed (`fingerSetAt`), the
 *    exact run-out and the corner region; linked parts and the link post-condition.
 * 5. Per corner (the kind's `planCorner`), `fingerLayout` on the shared `H` (too short refuses); the start edge (J's
 *    world max on every axis; the odd finger at J's world min); the phase (Z, X, Y take a finger at the start edge;
 *    `swap` inverts); the notches. Linked users compare the layout, phase and odd end Shape-local (through the flag
 *    when `mirrorDim` is `J`).
 * Selected ids that are not world parts are skipped.
 */
export function boxJointPlan(doc: SloydDocument, ids: readonly string[], opts: BoxJointOptions): BoxJointPlan | string {
  if (!(Number.isFinite(opts.width) && opts.width > 0)) return BOX_WIDTH_POSITIVE;
  const planned = planCorners(doc, ids, boxKind(opts));
  if (typeof planned === 'string') return planned;
  const names = displayNames(doc);
  const byId = new Map(worldParts(doc).map((b) => [b.id, b]));
  const nameOf = (id: string) => names.get(id) ?? byId.get(id)!.name;
  const corners = planned.corners.map(({ a, b, plan }) => ({ a, b, layout: plan.layout }));
  const notes = [
    ...boxJointedLines(corners.map((c) => c.layout), corners.map((c) => [nameOf(c.a), nameOf(c.b)] as const), doc.units),
    ...planned.lengths, ...planned.ignored,
  ];
  return { parts: planned.parts, corners, notes };
}

/** Write a plan (Spec difference 3 revised): `writeCorners` (`writeBackParts`, one `{ before, after }` per planned world
 *  part, with `keepWorld`, spec §6), so every placement of a definition and every user of a Shape follows. */
export function applyBoxJoints(doc: SloydDocument, plan: BoxJointPlan): SloydDocument {
  return writeCorners(doc, plan.parts);
}
