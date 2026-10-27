import type { Board, Cut, CutFrom, Dimension, Region, Shape, SloydDocument, StoredBoard } from './types';
import type { Units } from '../units/length';
import { clippedRegion, cutsThatRemoveStock } from './cuts';
import { axisDimensions, boardExtents, endFacing, positionAxisOf, snapStep } from './geometry';
import { resizeEnd } from './resizeEnd';
import { leans } from './lean';
import { hasTenons } from './roundTenons';
import { boardHoles, holeTouchesBox } from './holes';
import { TOUCH } from './checkTolerances';
import { nextId } from './ids';
import { mirrorDim } from './frames';
import { SHARED_KEYS, sharedOf } from './links';
import { resolveBoard } from './shapes';
import { displayNames, instancesOn, parentPath, partAt, worldParts } from './tree';
import { storageKey, writeBackParts } from './treeEdit';
import {
  BOX_NO_CORNER, BOX_WIDTH_POSITIVE, boxContainers, boxCutInTheWay, boxHeights, boxHoleInTheWay, boxIgnored, boxJointedLines,
  boxLengthLine, boxLinkedDisagree, boxLinkedMate, boxLinkSplit, boxMirrored, boxPlainStock, boxThreeWay, boxTooShort,
  boxTwoCorners, type BoxFeature,
} from './boxJointText';

/**
 * Box joints (box-joints spec): the ONE home of the finger layout (§3.3), the notch cuts it writes (§3.4), the
 * recogniser that reads them back from the cuts' SHAPE (§5.1) and the corner planner (§3, §6). Pure: no store. Imports
 * only a TYPE from `units` (CLAUDE.md, the `→ units` edge rule); every sentence lives in `boxJointText.ts`.
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

/** Does segment `N` (J's max) carry a finger, given segment 1's kind: the same kind when `N` is odd. */
export const fingerAtMaxOf = (count: number, fingerAtMin: boolean): boolean => (count % 2 === 1 ? fingerAtMin : !fingerAtMin);

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
// The planner (spec §3, §6; plan Spec difference 3 revised)
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

/** The phase order (spec, Amended 2026-10-27): the part whose run axis comes first in Z, X, Y takes a FINGER in the
 *  start-edge segment. */
const RUN_RANK = [1, 2, 0];

/** One part end in one corner: the world axis `k` it runs along into the corner, the world side its end faces, the
 *  other part's OUTSIDE face on `k` (`far`) and the other part's thickness (the notch depth). */
interface CornerEnd { part: Board; k: number; side: -1 | 1; far: number; depth: number }
interface Corner { ends: [CornerEnd, CornerEnd]; J: number }

const thicknessAxis = (b: Board) => axisDimensions(b).indexOf('thickness');
const spanOn = (b: Board, k: number): [number, number] => [b.position[k]!, b.position[k]! + boardExtents(b)[k]!];

/** `p`'s end along `k` (the other part's thickness axis) facing `q`, when it lies in `q`'s thickness slab to `TOUCH`
 *  (spec §3.1). The facing side and `q`'s far face are judged by the parts' centres on `k`. */
function reach(p: Board, q: Board, k: number): CornerEnd | null {
  const [p0, p1] = spanOn(p, k);
  const [q0, q1] = spanOn(q, k);
  const side: -1 | 1 = (p0 + p1) / 2 < (q0 + q1) / 2 ? 1 : -1;
  const end = side === 1 ? p1 : p0;
  if (end < q0 - TOUCH || end > q1 + TOUCH) return null;
  return { part: p, k, side, far: side === 1 ? q1 : q0, depth: q.thickness };
}

/**
 * A candidate corner (spec §3.1's first and third tests): perpendicular thickness axes, each end in the other's slab.
 * Also (my reading of "make a corner", Task 3 report): the two spans along `J` must OVERLAP (beyond 1e-9). Without it a
 * part far along the joint line (a shelf beside a drawer, a drawer stacked above another) whose ends happen to line up
 * would be a candidate and refuse the whole selection with the heights sentence.
 */
function candidate(a: Board, b: Board): Corner | null {
  const ta = thicknessAxis(a);
  const tb = thicknessAxis(b);
  if (ta === tb) return null;
  const J = 3 - ta - tb;
  const [ja, jb] = [spanOn(a, J), spanOn(b, J)];
  if (Math.min(ja[1], jb[1]) - Math.max(ja[0], jb[0]) <= EPS) return null;
  const ea = reach(a, b, tb);
  const eb = ea && reach(b, a, ta);
  return ea && eb ? { ends: [ea, eb], J } : null;
}

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

/** One jointed end's work, in part terms: the run dimension `d` and its end, the move (`k`, `side`, the new size), and
 *  the notches (`layout`, the phase `fingerAtMin`, the odd finger's end `oddEnd`, both part-local on `J`, and the depth).
 *  Replayed on a Shape's own board for a linked part. */
interface EndOp {
  k: number; side: -1 | 1; d: Dimension; end: CutFrom; size: number;
  layout?: FingerLayout; fingerAtMin?: boolean; oddEnd?: CutFrom; depth: number; far: number;
}

/** Remove the finger set at `op`'s end and move that end (spec §3.2, §3.5): the exact new size, never grid-rounded
 *  (inv 25). `side` is the world side to move (`op.side`, or its opposite on a mirrored Shape's own board). False when
 *  `resizeEnd` refuses a cut stored into the moving end that cannot be re-faced (it is in the corner region). */
function moveEnd(b: Board, op: EndOp, end: CutFrom, side: -1 | 1, exact: boolean): boolean {
  const set = fingerSetAt(b, op.d, end);
  if (set) b.cuts = b.cuts.filter((c) => !set.cutIds.includes(c.id));
  const was = b[op.d];
  try {
    resizeEnd(b, op.k, side, op.size - was);
  } catch (e) {
    // resizeEnd's one refusal (rebaseCuts): a cut stored into the moving end that cannot be re-faced.
    if (e instanceof Error && e.message.includes('grows at an end it is already cut into')) return false;
    throw e;
  }
  b[op.d] = op.size;
  // A world part's moving MIN face lands EXACTLY on the other part's outside face (its max face is `position + size`,
  // the size computed from that face). A Shape's own board has no world position to keep.
  if (exact && side === -1) b.position[op.k] = op.far;
  return true;
}

/** Add `op`'s notches at `end` (spec §3.4), ids minted here; `fingerAtMin`/`oddEnd` are in `b`'s own `J` terms (a
 *  Shape's own board passes them through a mirrored representative's flag). */
function addNotches(b: Board, op: EndOp, end: CutFrom, fingerAtMin: boolean, oddEnd: CutFrom): void {
  const along = positionAxisOf(op.d, 'thickness');
  const ids = Array.from({ length: op.layout!.count }, () => nextId());
  b.cuts = [...b.cuts, ...notchCuts(op.layout!, fingerAtMin, oddEnd, op.d, end, along, op.depth, ids)];
}

const flipEnd = (e: CutFrom): CutFrom => (e === 'min' ? 'max' : 'min');

/** The corner region of a moved end (spec §3.5, task brief step 4): the last `depth` of the run dimension at that end,
 *  full thickness, full `J` dimension. */
function cornerRegion(b: Board, op: EndOp): Region {
  const L = b[op.d];
  const jd = positionAxisOf(op.d, 'thickness');
  const r = { [op.d]: op.end === 'min' ? [0, op.depth] : [L - op.depth, L], thickness: [0, b.thickness], [jd]: [0, b[jd]] };
  return r as Region;
}

/**
 * A cut that may stay in a corner region (spec §3.5): one running straight THROUGH the corner along the run dimension
 * (`across` = the run dimension, as §3.5 words it: a drawer bottom's groove), from the end face to past the region's
 * inner face. Anything else meeting the region beyond 1e-9 refuses: a rabbet across the end (any width, any depth; the
 * recogniser ignores a partial-thickness one), a tenon's cheeks, a hand-made notch.
 */
function cutInTheWay(b: Board, op: EndOp): boolean {
  const R = cornerRegion(b, op);
  const L = b[op.d];
  return cutsThatRemoveStock(b).some((c) => {
    const r = clippedRegion(b, c);
    const meets = (['length', 'width', 'thickness'] as Dimension[])
      .every((x) => Math.min(r[x][1], R[x][1]) - Math.max(r[x][0], R[x][0]) > EPS);
    if (!meets) return false;
    const through = c.across === op.d && (op.end === 'min'
      ? r[op.d][0] <= EPS && r[op.d][1] > op.depth + EPS
      : r[op.d][1] >= L - EPS && r[op.d][0] < L - op.depth - EPS);
    return !through;
  });
}

/** The stored part at a world occurrence (its Shape reference and own flag). */
const storedOf = (doc: SloydDocument, id: string): StoredBoard => partAt(doc, id)!;

/** `world` with every shared field read from `shape` through the stored part's own flag (Spec difference 3 revised):
 *  exactly what the Shape's users will resolve to, so `regroupShapes` keeps them together by construction. */
function withShapeFields(world: Board, stored: StoredBoard, shape: Shape): Board {
  const r = resolveBoard(new Map([[shape.id, shape]]), stored)! as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...world };
  for (const k of SHARED_KEYS) {
    if (k in r) out[k] = r[k];
    else delete out[k];
  }
  return out as unknown as Board;
}

/**
 * Box joint the corners among the selected world parts `ids` (spec §3, §6). Every refusal is decided here, before any
 * mutation (on clones), in this order:
 * 1. `width` not finite and more than zero.
 * 2. A part reached through a mirrored instance.
 * 3. The candidate corners (spec §3.1: thickness axes perpendicular and each end in the other's slab, to `TOUCH`); none
 *    refuses. Per candidate: its parts in different containers, then a different span along `J` (1e-9). Then one end in
 *    two corners, then a part jointed at ends of two different dimensions (no three-way corners).
 * 4. Per jointed part, then per end: a feature it may not carry yet (`featureOf`); then that end's finger set is removed
 *    (`fingerSetAt`), the end moved exactly to the other part's outside face (`resizeEnd`), and the corner region judged:
 *    a cut not running through it, then a hole touching it.
 * 5. Per corner, `fingerLayout` on the shared `H` (too short refuses); the start edge (J's world max when J is Y, else
 *    its world min; the odd finger at the other end); the phase (Z, X, Y take a finger at the start edge; `swap` inverts);
 *    the notches.
 * 6. Linked parts: every user of a jointed part's Shape must be jointed at the same Shape-local ends (through its own
 *    `mirrored` flag along `mirrorDim`), with the same layout, phase and odd end (Shape-local: through the flag when
 *    `mirrorDim` is `J`), depth and new size; else the mate or disagreement sentence. The Shape's new shared fields are planned ONCE on the Shape's own board (a non-mirrored user's frame, the
 *    ends flipped for a mirrored one; ids minted once), and every user's world after-state reads them through its flag.
 * Last, the link post-condition: the plan is written (`applyBoxJoints`) and every Shape with two or more users must still
 * hold them all; else `boxLinkSplit`.
 * Selected ids that are not world parts are skipped.
 */
export function boxJointPlan(doc: SloydDocument, ids: readonly string[], opts: BoxJointOptions): BoxJointPlan | string {
  if (!(Number.isFinite(opts.width) && opts.width > 0)) return BOX_WIDTH_POSITIVE;
  const world = worldParts(doc);
  const byId = new Map(world.map((b) => [b.id, b]));
  const sel = [...new Set(ids)].flatMap((id) => byId.get(id) ?? []);
  const names = displayNames(doc);
  const nameOf = (b: Board) => names.get(b.id) ?? b.name;

  // 2. A part inside a mirrored copy (as stretchers: any mirrored instance on the chain).
  for (const b of sel) {
    const c = parentPath(b.id);
    if (c !== null && (instancesOn(doc, c) ?? []).some((i) => i.mirrored === true)) return boxMirrored(nameOf(b));
  }

  // 3. The corners.
  const corners: Corner[] = [];
  for (let i = 0; i < sel.length; i += 1) {
    for (let j = i + 1; j < sel.length; j += 1) {
      const c = candidate(sel[i]!, sel[j]!);
      if (c) corners.push(c);
    }
  }
  if (corners.length === 0) return BOX_NO_CORNER;
  // A LEANING candidate was found by its pre-lean box (inv 57 R2: never its extent); §3.1 premises unleaned parts, so
  // it refuses with the plain-stock lean sentence before any test that reads that box further.
  for (const { ends } of corners) {
    const leaning = ends.find((e) => leans(e.part));
    if (leaning) return boxPlainStock(nameOf(leaning.part), 'lean');
  }
  for (const { ends: [ea, eb], J } of corners) {
    if (parentPath(ea.part.id) !== parentPath(eb.part.id)) return boxContainers(nameOf(ea.part), nameOf(eb.part));
    const [sa, sb] = [spanOn(ea.part, J), spanOn(eb.part, J)];
    if (Math.abs(sa[0] - sb[0]) > EPS || Math.abs(sa[1] - sb[1]) > EPS) return boxHeights(nameOf(ea.part), nameOf(eb.part));
  }
  const endsOf = new Map<string, CornerEnd[]>();   // world id -> its jointed ends, corner order
  for (const c of corners) for (const e of c.ends) endsOf.set(e.part.id, [...(endsOf.get(e.part.id) ?? []), e]);
  const jointed = sel.filter((b) => endsOf.has(b.id));
  for (const b of jointed) {
    const keys = endsOf.get(b.id)!.map((e) => `${e.k}:${e.side}`);
    if (new Set(keys).size < keys.length) return boxTwoCorners(nameOf(b));
  }
  for (const b of jointed) {
    if (new Set(endsOf.get(b.id)!.map((e) => e.k)).size > 1) return boxThreeWay(nameOf(b));
  }

  // 4. Per part end: plain stock, the old finger set removed, the move, the corner region.
  const ops = new Map<CornerEnd, EndOp>();
  const planned = new Map<string, Board>();   // world id -> working clone
  for (const b of jointed) {
    const f = featureOf(b);
    if (f) return boxPlainStock(nameOf(b), f);
    const clone = structuredClone(b);
    for (const e of endsOf.get(b.id)!) {
      const d = axisDimensions(b)[e.k]!;
      const end = endFacing(b, e.k, e.side);
      const [p0, p1] = spanOn(clone, e.k);
      const size = e.side === 1 ? e.far - p0 : p1 - e.far;
      const op: EndOp = { k: e.k, side: e.side, d, end, size, depth: e.depth, far: e.far };
      if (!moveEnd(clone, op, end, e.side, true)) return boxCutInTheWay(nameOf(b));
      if (cutInTheWay(clone, op)) return boxCutInTheWay(nameOf(b));
      const R = cornerRegion(clone, op);
      if (boardHoles(clone).some((h) => holeTouchesBox(h, R))) return boxHoleInTheWay(nameOf(b));
      ops.set(e, op);
    }
    planned.set(b.id, clone);
  }

  // 5. The layout, the phase and the notches, per corner.
  const out: BoxJointCorner[] = [];
  for (const { ends: [ea, eb], J } of corners) {
    const layout = fingerLayout(boardExtents(ea.part)[J]!, opts.width);
    if (!layout) return boxTooShort(nameOf(ea.part), nameOf(eb.part));
    // The start edge (full fingers start there, the odd one is at the other end): J's world MAX when J is world Y (the
    // odd finger at the bottom), else J's world min. Each part reads it in its OWN J terms (`endFacing`) and computes
    // its segments directly from there; the two parts share J's world span, so their notches are exact complements.
    const startSide: -1 | 1 = J === 1 ? 1 : -1;
    const aStartFinger = (RUN_RANK[ea.k]! < RUN_RANK[eb.k]!) !== opts.swap;
    for (const [e, startFinger] of [[ea, aStartFinger], [eb, !aStartFinger]] as const) {
      const op = ops.get(e)!;
      const start = endFacing(e.part, J, startSide);
      op.layout = layout;
      op.oddEnd = flipEnd(start);
      op.fingerAtMin = start === 'min' ? startFinger : fingerAtMaxOf(layout.count, startFinger);
      addNotches(planned.get(e.part.id)!, op, op.end, op.fingerAtMin, op.oddEnd);
    }
    out.push({ a: ea.part.id, b: eb.part.id, layout });
  }

  // 6. Linked parts: one Shape, planned once, read by every user through its own flag.
  const parts = new Map<string, Board>();
  const byShape = new Map<string, Board[]>();
  for (const b of jointed) {
    if (b.shape === undefined) parts.set(b.id, planned.get(b.id)!);
    else byShape.set(b.shape, [...(byShape.get(b.shape) ?? []), b]);
  }
  const shapes = new Map(doc.shapes.map((s) => [s.id, s]));
  const keyedUsers = (sid: string) => world.filter((w) => w.shape === sid);
  for (const [sid, users] of byShape) {
    // Every stored user of the Shape (by storage key) needs a jointed occurrence.
    const jointedKeys = new Set(users.map((u) => storageKey(doc, u.id)));
    const mate = keyedUsers(sid).find((w) => !jointedKeys.has(storageKey(doc, w.id)));
    if (mate) return boxLinkedMate(nameOf(users[0]!), nameOf(mate));
    const localEnd = (u: Board, op: EndOp): CutFrom =>
      (u.mirrored === true && op.d === mirrorDim(u) ? flipEnd(op.end) : op.end);
    // The phase and the odd finger's end, Shape-local: a mirrored user's are flipped when its mirror runs along J (the
    // finger at J's min becomes the one at J's max). With no odd finger its end is no part of the layout (null).
    const jFlip = (u: Board, op: EndOp) => u.mirrored === true && positionAxisOf(op.d, 'thickness') === mirrorDim(u);
    const localFingerAtMin = (u: Board, op: EndOp): boolean =>
      (jFlip(u, op) ? fingerAtMaxOf(op.layout!.count, op.fingerAtMin!) : op.fingerAtMin!);
    const localOddEnd = (u: Board, op: EndOp): CutFrom => (jFlip(u, op) ? flipEnd(op.oddEnd!) : op.oddEnd!);
    // Per Shape-local end: the layout, phase and depth, and the run dimension's FINAL size (an op's own `size` is the
    // size after that end's move, which depends on the order the ends were planned in).
    const sigOf = (u: Board) => endsOf.get(u.id)!.map((e) => ops.get(e)!)
      .map((op) => [op.d, localEnd(u, op), op.layout!.count, op.layout!.width, op.layout!.odd, localFingerAtMin(u, op),
        op.layout!.odd === op.layout!.width ? null : localOddEnd(u, op), op.depth, planned.get(u.id)![op.d]])
      .sort((x, y) => (`${x[0]}${x[1]}` < `${y[0]}${y[1]}` ? -1 : 1));
    const endsKey = (u: Board) => JSON.stringify(sigOf(u).map((s) => [s[0], s[1]]));
    const first = users[0]!;
    const missing = users.find((u) => endsKey(u) !== endsKey(first));
    if (missing) return boxLinkedMate(nameOf(first), nameOf(missing));
    // Everything but the size compares exactly; the size is a world subtraction (`e.far - p0`), so the same part at
    // another world offset can plan it an ulp off (the recognised-number ruling's class), and it compares at 1e-9. The
    // Shape still takes the representative's size below, and the link post-condition guards the written result.
    const sameSig = (x: ReturnType<typeof sigOf>, y: ReturnType<typeof sigOf>) => x.length === y.length && x.every((s, i) =>
      JSON.stringify(s.slice(0, 8)) === JSON.stringify(y[i]!.slice(0, 8)) && Math.abs((s[8] as number) - (y[i]![8] as number)) <= EPS);
    if (users.some((u) => !sameSig(sigOf(u), sigOf(first)))) return boxLinkedDisagree(users.map(nameOf));
    // The Shape's own board: a user's frame with the Shape's own features; a mirrored user's ends are flipped along
    // mirrorDim, and its world side with them (the turn is the same); so are its phase and odd end when mirrorDim is J.
    const rep = users.find((u) => u.mirrored !== true) ?? first;
    const shape = shapes.get(sid)!;
    const own: Board = structuredClone({ ...rep, ...shapeFields(shape) });
    const flip = (op: EndOp) => rep.mirrored === true && op.d === mirrorDim(rep);
    const repOps = endsOf.get(rep.id)!.map((e) => ops.get(e)!);
    for (const op of repOps) {
      if (!moveEnd(own, op, localEnd(rep, op), flip(op) ? (op.side === 1 ? -1 : 1) : op.side, false)) return boxCutInTheWay(nameOf(rep));
    }
    for (const op of repOps) addNotches(own, op, localEnd(rep, op), localFingerAtMin(rep, op), localOddEnd(rep, op));
    const next: Shape = { id: sid, ...sharedOf(own) };
    for (const u of users) parts.set(u.id, withShapeFields(planned.get(u.id)!, storedOf(doc, u.id), next));
  }

  // Notes: the jointed line(s), the length lines, the ignored lines.
  const notes = boxJointedLines(out.map((c) => c.layout), out.map((c) => [nameOf(byId.get(c.a)!), nameOf(byId.get(c.b)!)] as const), doc.units);
  for (const b of jointed) {
    const d = axisDimensions(b)[endsOf.get(b.id)![0]!.k]!;
    const delta = parts.get(b.id)![d] - b[d];
    if (Math.abs(delta) > EPS) notes.push(boxLengthLine(nameOf(b), delta, doc.units));
  }
  for (const b of sel) if (!endsOf.has(b.id)) notes.push(boxIgnored(nameOf(b)));
  const plan: BoxJointPlan = { parts, corners: out, notes };

  // The link post-condition (Spec difference 3 revised): every Shape with two or more users keeps them all.
  const after = applyBoxJoints(doc, plan);
  for (const s of doc.shapes) {
    const users = world.filter((w) => w.shape === s.id);
    const keys = [...new Set(users.map((u) => storageKey(doc, u.id)))];
    if (keys.length < 2) continue;
    const now = new Set(users.map((u) => {
      const p = partAt(after, u.id);
      return p && 'shape' in p && !('length' in p) ? p.shape : `plain:${u.id}`;
    }));
    if (now.size > 1) return boxLinkSplit(users.map(nameOf));
  }
  return plan;
}

/** A Shape's shared fields (its own arrays), for its own board. */
function shapeFields(s: Shape): Omit<Shape, 'id'> {
  const { id: _id, ...rest } = s;
  void _id;
  return rest;
}

/** Write a plan (Spec difference 3 revised): `writeBackParts`, one `{ before, after }` per planned world part, with
 *  `keepWorld` (spec §6), so every placement of a definition and every user of a Shape follows. */
export function applyBoxJoints(doc: SloydDocument, plan: BoxJointPlan): SloydDocument {
  const world = worldParts(doc);
  const edits = [...plan.parts].map(([id, after]) => ({ before: world.find((b) => b.id === id)!, after }));
  return writeBackParts(doc, edits);
}
