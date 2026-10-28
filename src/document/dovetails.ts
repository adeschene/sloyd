import type { Board, CurveSegment, Cut, CutFrom, Dimension, Dovetail, Region, SloydDocument } from './types';
import type { CurveSpan, ViewCurve } from './curves';
import type { Units } from '../units/length';
import {
  DOVETAIL_COUNT_MAX, byDovetailEnd, dovetailAt, dovetailLayout, dovetailsOf, dovetailTailWidth, hasDovetails, jointLineOf, sameDovetail,
} from './dovetailModel';
import { clippedRegion, cutsThatRemoveStock } from './cuts';
import { axisDimensions, boardExtents, endFacing } from './geometry';
import { leans } from './lean';
import { hasTenons } from './roundTenons';
import { fingerSets } from './boxJoints';
import { nextId } from './ids';
import { displayNames, worldParts } from './tree';
import { RUN_RANK, cutRunsThrough, planCorners, writeCorners, type Corner, type CornerCopy, type JointKind } from './cornerPlan';
import {
  DOVETAIL_COUNT_WHOLE, DOVETAIL_NO_CORNER, DOVETAIL_SLOPE_RANGE, dovetailContainers, dovetailCutInTheWay, dovetailedLines,
  dovetailHeights, dovetailHoleInTheWay, dovetailIgnored, dovetailLengthLine, dovetailLinkedDisagree, dovetailLinkedMate,
  dovetailLinkSplit, dovetailMirrored, dovetailMoveClear, dovetailPlainStock, dovetailTailsOn, dovetailThreeWay, dovetailTooNarrow,
  DOVETAIL_LAP_PARSE, dovetailTooShort, dovetailTooThin, dovetailTwoCorners, type DovetailFeature,
} from './dovetailText';

/**
 * Through dovetails (dovetails spec §3.2, §3.5): the ONE home of the layout, of the faults (`dovetailFaults`, the ONE
 * decider) and of the dovetail kind of the shared corner planner (`dovetailPlan`, spec §3.1–§3.3, §6, G3). Numbers only: a
 * TYPE-only `Units` import (the pin width and the Auto pitch depend on the project's units, but no text is produced here;
 * every sentence is `dovetailText.ts`'s, as box joints' are `boxJointText.ts`').
 */

/** The pin width at the narrow end (spec §3.2, the user: fixed, never typed): 1/4" imperial, 6 mm metric. */
export function pinWidth(units: Units): number {
  return units.display === 'metric-mm' ? 6 / 25.4 : 0.25;
}

/** The Auto pitch (spec §3.2): one tail per 1.5" (38 mm metric) of the joint's height. */
const autoPitch = (units: Units): number => (units.display === 'metric-mm' ? 38 / 25.4 : 1.5);

/** Auto's first count for a joint `H` high (spec §3.2), BEFORE the fault lowering (the planner lowers it while `narrow`
 *  holds on either part): `max(1, round(H / A))`. */
export function autoTailCount(H: number, units: Units): number {
  return Math.max(1, Math.round(H / autoPitch(units)));
}

/**
 * The Auto lap (half-blind spec §3.2, Global Constraints): a third of the pin part's thickness `t`, to the nearest 1/16"
 * (at least 1/8") imperial, or the nearest whole mm (at least 3 mm) metric. Computed as a whole number of steps DIVIDED by
 * the step's denominator (`n / 16`, `n / 25.4`), so 6 mm is exactly `6 / 25.4`, as `pinWidth` writes it.
 */
export function autoLap(t: number, units: Units): number {
  const den = units.display === 'metric-mm' ? 25.4 : 16;
  const min = units.display === 'metric-mm' ? 3 : 2;
  return Math.max(min, Math.round((t * den) / 3)) / den;
}

/** The layout and the joint line live in the leaf `dovetailModel.ts` (so the copy home `dovetailText.ts` reads them without
 *  an import cycle through this module's copy table); re-exported here, their documented home. */
export { dovetailLayout, jointLineOf, type DovetailLayout } from './dovetailModel';

/** What makes a stored dovetail build nothing (spec §3.2, §3.5), in this order. */
export type DovetailFault = 'count' | 'slope' | 'lap' | 'depth' | 'narrow';

/** Float noise: a tail exactly as wide as a pin passes (spec §3.2, judged at 1e-9). */
const EPS = 1e-9;

/**
 * The ONE fault decider (spec §3.2), on the part's OWN sizes: `H = b[J]`; the angled extent `X` is `d.depth` for tails
 * (the baseline; on a half-blind corner already `tP − lap`) and `b.thickness − (d.lap ?? 0)` for pins (across the part's
 * own thickness, less a half-blind lap: the sockets run from the lap plane; half-blind spec §3.2). Faults, in order:
 * `count` (not an integer >= 1), `slope` (outside [4, 12]), `lap` (a PINS entry with a lap not strictly inside its own
 * thickness, to 1e-9; a tails entry's lap is a record and never faults), `depth` (reaching the part's own size along `dim`,
 * or, with the part's other dovetail on the same `dim`, the two depths together reaching it to 1e-9), `narrow` (a tail at
 * its narrowest, `Te − 2·X/s`, narrower than a pin at its widest, `p + 2·X/s`, by more than 1e-9).
 */
export function dovetailFaults(b: Board, d: Dovetail): DovetailFault[] {
  const out: DovetailFault[] = [];
  if (!(Number.isInteger(d.count) && d.count >= 1)) out.push('count');
  if (!(d.slope >= 4 && d.slope <= 12)) out.push('slope');
  if (d.role === 'pins' && d.lap !== undefined && !(d.lap > EPS && d.lap < b.thickness - EPS)) out.push('lap');
  // Also when it meets or crosses the part's OTHER dovetail on the same dim (Task 4 fix ruling): the two depths together
  // reaching the part's size (to 1e-9) leave no wood between the two joints.
  const other = dovetailsOf(b).find((x) => x.dim === d.dim && x.end !== d.end);
  if (d.depth >= b[d.dim] || (other !== undefined && d.depth + other.depth >= b[d.dim] - EPS)) out.push('depth');
  const X = d.role === 'tails' ? d.depth : b.thickness - (d.lap ?? 0);
  const Te = dovetailTailWidth(b[jointLineOf(d.dim)], d.count, d.pin);
  if (Te - (2 * X) / d.slope < d.pin + (2 * X) / d.slope - EPS) out.push('narrow');
  return out;
}

/**
 * The zone a dovetailed end keeps clear (spec §3.6, the builder check): the span `depth` back from each STORED dovetail's
 * end (a faulted one too: it builds again once fixed), the whole section. A `region` (part-local; a cut's
 * `clippedRegion`) meeting one by more than 1e-9 on every dimension refuses with the zone sentence naming `name`;
 * otherwise null. Holes are judged by `holeTouchesBox` against `dovetailZones` (the store's caller).
 */
export function dovetailZoneRefusal(b: Board, region: Region, name: string = b.name): string | null {
  const meets = dovetailZones(b).some((z) => DIMS.every((x) => Math.min(region[x][1], z[x][1]) - Math.max(region[x][0], z[x][0]) > EPS));
  return meets ? dovetailMoveClear(name) : null;
}
const DIMS: readonly Dimension[] = ['length', 'width', 'thickness'];

/**
 * A cut (as it would be stored on `b`) reaching a dovetailed end's zone (spec §3.6): the zone sentence naming `name`, else
 * null. Judged as the corner planner judges a corner region: only a cut that removes stock (`cutsThatRemoveStock`), and one
 * running straight THROUGH that end along the dovetail's `dim` (`cutRunsThrough`, the ONE predicate: a drawer bottom's
 * groove) is exempt. Any other cut whose `clippedRegion` meets a zone by more than 1e-9 refuses.
 */
export function dovetailCutRefusal(b: Board, cut: Cut, name: string = b.name): string | null {
  if (!hasDovetails(b)) return null;
  const probe = { ...b, cuts: [cut] };
  if (cutsThatRemoveStock(probe).length === 0) return null;
  const r = clippedRegion(probe, cut);
  const meets = dovetailsOf(b).some((d, i) => {
    const z = dovetailZones(b)[i]!;
    if (!DIMS.every((x) => Math.min(r[x][1], z[x][1]) - Math.max(r[x][0], z[x][0]) > EPS)) return false;
    return !cutRunsThrough(probe, cut, d.dim, d.end, d.depth);
  });
  return meets ? dovetailMoveClear(name) : null;
}

/** Each stored dovetail's zone (part-local): `[b[dim] − depth, b[dim]]` (max end) or `[0, depth]` (min end) on its `dim`,
 *  the whole of the other two dimensions. */
export function dovetailZones(b: Board): Region[] {
  return dovetailsOf(b).map((d) => {
    const r: Region = { length: [0, b.length], width: [0, b.width], thickness: [0, b.thickness] };
    r[d.dim] = d.end === 'min' ? [0, d.depth] : [b[d.dim] - d.depth, b[d.dim]];
    return r;
  });
}

const NONE: readonly Dovetail[] = [];
const BUILT = new WeakMap<object, readonly Dovetail[]>();

/** The dovetails that BUILD (spec §3.5): fault-free, judged on the stored part. A faulted dovetail builds nothing (the
 *  part reads as plain stock at that end), as a faulted tenon (inv 58). Memoised per board OBJECT (a part is never
 *  mutated: an edit makes a new object); the list is frozen, so no caller can change what the next one reads. */
export function builtDovetails(b: Board): readonly Dovetail[] {
  if (!b.dovetails || b.dovetails.length === 0) return NONE;
  const hit = BUILT.get(b);
  if (hit) return hit;
  const out = Object.freeze(dovetailsOf(b).filter((d) => dovetailFaults(b, d).length === 0));
  BUILT.set(b, out);
  return out;
}

/** One dovetail reflected along `m` (inv 44: a FLAG FLIP, never arithmetic), or the SAME object when nothing moves:
 *  along its own `dim` its `end` swaps; along the thickness a pins entry's `outside` swaps; along J nothing (the layout is
 *  a palindrome). */
function mirrorOne(d: Dovetail, m: Dimension): Dovetail {
  if (m === d.dim) return { ...d, end: d.end === 'min' ? 'max' : 'min' };
  if (m === 'thickness' && d.outside) return { ...d, outside: d.outside === 'min' ? 'max' : 'min' };
  return d;
}

/** Dovetails reflected along dimension `m` (spec §3.4, inv 44), decided per entry, then re-sorted into canonical order.
 *  When no entry moves, the SAME array comes back. Its own inverse. */
export function mirrorDovetails(list: readonly Dovetail[], m: Dimension): Dovetail[] {
  const out = list.map((d) => mirrorOne(d, m));
  if (out.every((d, i) => d === list[i])) return list as Dovetail[];
  return out.sort(byDovetailEnd);
}

/**
 * A part's dovetails lowered back through ONE mirror along `m` (treeEdit's lowerTenons, inv 44, 46): `mirrorDovetails`,
 * its own inverse; a dovetail equal to the stored one with the same id maps back to THAT object, and when all are reused,
 * the stored array (an untouched list is never rewritten). A draft with no dovetails (none, or a removal) adds no key: its
 * own key, present or absent, is the after-state's.
 */
export function lowerDovetails(stored: Dovetail[] | undefined, draft: Pick<Board, 'dovetails'>, m: Dimension): { dovetails?: Dovetail[] } {
  if (!draft.dovetails || draft.dovetails.length === 0) return {};
  const byId = new Map((stored ?? []).map((d) => [d.id, d]));
  const out = mirrorDovetails(draft.dovetails, m).map((d) => {
    const s = byId.get(d.id);
    return s && sameDovetail(s, d) ? s : d;
  });
  return { dovetails: stored && out.length === stored.length && out.every((d, i) => d === stored[i]) ? stored : out };
}

// ---- Geometry: a dovetail's waste as view curves (dovetails spec §3.5; Spec difference 1: round tenons' route) -----

/**
 * A BUILT dovetail's waste as SQUARE-span view curves (`CurveSpan.square`, `squareSpan`), so `boardBodies` stays the ONE place
 * it becomes geometry and bodies stay convex (inv 48): `geometryBoard` appends them after the round tenons' for each
 * fault-free dovetail. VIEW-ONLY: never stored, never validated. Every boundary is `dovetailLayout(...).bounds` (the ruling:
 * never recomputed here); the slope moves each one by `x / s` at distance `x` from the outside plane.
 *
 * - TAILS: one curve per PIN socket (each half pin and pin), through the THICKNESS over its whole extent (a span with no
 *   stop), its outline in `uvDims('thickness')` = (length, width): at the end face the socket's outside-plane bounds, at
 *   `depth` back each side `depth / s` further out (the socket widens, the tails narrow); a half pin's outer side stays on
 *   the J face. Traced along the end face (and the J face for a half pin) where it lies on them.
 * - PINS: one curve per TAIL socket, through `dim` from the baseline to the end with ONE square stop at the baseline (a plain
 *   wall, as a tenon's shoulder), its outline in `uvDims(dim)` = (J, thickness): at the `outside` face the tail's
 *   outside-plane bounds, at the other face each side `thickness / s` further in (the socket narrows, the pins widen).
 *   HALF-BLIND (a `lap`, half-blind spec §3.4): the outline starts at the LAP PLANE `vl = vo ± lap` (toward the inside face)
 *   with the tail's outside-plane bounds, and each side moves `(thickness − lap) / s` in by the inside face; it touches the
 *   inside face and the end face only, the lap slab uncut.
 *
 * Both describe the same prism: x runs from the outside plane (the tail part's end face = the pin part's outside face)
 * into the corner in both. Ids `dovetail/<dovetail id>/<k>` (the loader re-mints a stored id holding `/`, inv 33);
 * `uFrom`/`vFrom` 'min'.
 */
export function dovetailViewCurves(b: Pick<Board, Dimension>, d: Dovetail): ViewCurve[] {
  const J = jointLineOf(d.dim);
  const { bounds } = dovetailLayout(b[J], d.count, d.slope, d.pin);
  const N = d.count;
  const line = (to: [number, number]): CurveSegment => ({ type: 'line', to });
  const base = { uFrom: 'min' as const, vFrom: 'min' as const };
  const out: ViewCurve[] = [];
  if (d.role === 'tails') {
    // (dim, J) → (u, v) of `uvDims('thickness')` = (length, width).
    const at = (r: number, j: number): [number, number] => (d.dim === 'length' ? [r, j] : [j, r]);
    const e = d.end === 'max' ? b[d.dim] : 0;
    const r = d.end === 'max' ? e - d.depth : d.depth;
    const w = d.depth / d.slope;
    const span: CurveSpan = { lo: 0, hi: b.thickness, stopLo: false, stopHi: false, square: true };
    for (let k = 0; k <= N; k += 1) {
      const a = bounds[2 * k]!, c = bounds[2 * k + 1]!;
      const a1 = k === 0 ? a : a - w, c1 = k === N ? c : c + w;
      const pts: [number, number][] = [at(e, a), at(e, c), at(r, c1), at(r, a1)];
      out.push({ ...base, id: `dovetail/${d.id}/${k}`, through: 'thickness', span, start: pts[0]!, segments: [...pts.slice(1), pts[0]!].map(line) });
    }
    return out;
  }
  // (J, thickness) = `uvDims(dim)` for either run dimension.
  const T = b.thickness;
  const [vo, vi] = d.outside === 'max' ? [T, 0] : [0, T];
  // Half-blind (half-blind spec §3.4): the socket starts at the LAP PLANE `vl`, `lap` in from the outside face, and narrows
  // over `T − lap` to the inside face; the lap slab in front of it is uncut wood. Through: from the outside face, over `T`.
  const [v0, w] = d.lap === undefined ? [vo, T / d.slope] : [vo + (vi > vo ? d.lap : -d.lap), (T - d.lap) / d.slope];
  const span: CurveSpan = d.end === 'max'
    ? { lo: b[d.dim] - d.depth, hi: b[d.dim], stopLo: true, stopHi: false, square: true }
    : { lo: 0, hi: d.depth, stopLo: false, stopHi: true, square: true };
  for (let k = 0; k < N; k += 1) {
    const a = bounds[2 * k + 1]!, c = bounds[2 * k + 2]!;
    const pts: [number, number][] = [[a, v0], [c, v0], [c - w, vi], [a + w, vi]];
    out.push({ ...base, id: `dovetail/${d.id}/${k}`, through: d.dim, span, start: pts[0]!, segments: [...pts.slice(1), pts[0]!].map(line) });
  }
  return out;
}

/**
 * A BUILT dovetail's corners at the OUTSIDE plane (dovetails spec §3.5, my call there: "tail and pin corners at the outside
 * plane are snap points, nothing in air"), board-local, from the ONE layout's bounds — every tail–pin boundary `bounds[1..2N]`:
 * - tails: on the END face (the outside plane), at both thickness faces — each tail's four end corners;
 * - pins: on the `outside` thickness face (the outside plane), at the end and at the baseline — each pin's narrow corners;
 *   HALF-BLIND, on the LAP PLANE instead (the sockets' narrow edges; the outside face is unbroken lap wood).
 * Each lies on wood (the edge of a tail's or a pin's outside-plane face), never in a socket.
 */
export function dovetailCorners(b: Pick<Board, Dimension>, d: Dovetail): Record<Dimension, number>[] {
  const J = jointLineOf(d.dim);
  const { bounds } = dovetailLayout(b[J], d.count, d.slope, d.pin);
  const edges = bounds.slice(1, -1);
  const e = d.end === 'max' ? b[d.dim] : 0;
  const r = d.end === 'max' ? e - d.depth : d.depth;
  const pt = (run: number, j: number, t: number) => ({ [d.dim]: run, [J]: j, thickness: t }) as Record<Dimension, number>;
  if (d.role === 'tails') return edges.flatMap((j) => [pt(e, j, 0), pt(e, j, b.thickness)]);
  const vo = d.outside === 'max' ? b.thickness : 0;
  // Half-blind (half-blind spec §3.4): on the LAP PLANE, never the outside face (unbroken lap wood, nothing drawn there).
  const v = d.lap === undefined ? vo : vo + (d.outside === 'max' ? -d.lap : d.lap);
  return edges.flatMap((j) => [pt(e, j, v), pt(r, j, v)]);
}

// ---- The planner (dovetails spec §3.1–§3.3, §6, G3): the dovetail kind over the shared corner planner ---------------

/** The action's inputs (spec §4; half-blind spec §4): the slope `1:slope`, the typed tail count (null: Auto, or the kept
 *  count on a corner already dovetailed, spec G3), Swap tails and pins, the Joint (absent: `'keep'`, each corner's stored
 *  kind, a new corner through) and the typed lap (absent or null: the kept lap on a re-plan whose pin part is unchanged,
 *  else Auto; ignored on a through corner). */
export interface DovetailOptions {
  slope: number; count: number | null; swap: boolean; joint?: 'keep' | 'through' | 'half-blind'; lap?: number | null;
}
/** The plan. `parts` maps every dovetailed WORLD part (its occurrence id) to its full new world board (another placement of
 *  a definition and every user of a Shape follow through the write-back, inv 46); `corners` names each corner's two world
 *  parts, the one that took the tails, its count and slope, and its lap (null: through); `notes` are the success lines in order. */
export interface DovetailPlan {
  parts: Map<string, Board>;
  corners: { a: string; b: string; tails: string; N: number; s: number; lap: number | null }[];
  notes: string[];
}

/** One corner's dovetail plan: the count, slope and pin width; which side (0 or 1) takes the tails; the pin side's
 *  `outside`, part-local on the pin part's WORLD board (its thickness face where the tail part's end lands); and the lap
 *  (null: through). */
interface DovetailCornerPlan { N: number; s: number; p: number; tails: 0 | 1; outside: CutFrom; lap: number | null }

/** The first feature a part may not carry with dovetails (spec §3.6), in the copy's order, or null: box joints' list,
 *  then box joints themselves (any recognised finger set). */
function featureOf(b: Board): DovetailFeature | null {
  if (leans(b)) return 'lean';
  if (b.angleCuts.length > 0) return 'angle cut';
  if (b.curves.length > 0) return 'curve';
  if (b.profiles.length > 0) return 'edge profile';
  if (b.bands.length > 0) return 'edge banding';
  if (hasTenons(b)) return 'round tenon';
  if (fingerSets(b).length > 0) return 'box joints';
  return null;
}

const flipEnd = (e: CutFrom): CutFrom => (e === 'min' ? 'max' : 'min');

const DOVETAIL_COPY: CornerCopy<DovetailFeature> = {
  noCorner: DOVETAIL_NO_CORNER, mirrored: dovetailMirrored, containers: dovetailContainers, heights: dovetailHeights,
  twoCorners: dovetailTwoCorners, threeWay: dovetailThreeWay, plainStock: dovetailPlainStock, cutInTheWay: dovetailCutInTheWay,
  holeInTheWay: dovetailHoleInTheWay, linkedMate: dovetailLinkedMate, linkedDisagree: dovetailLinkedDisagree,
  linkSplit: dovetailLinkSplit, ignored: dovetailIgnored, length: dovetailLengthLine,
};

/** What the corner's ORIGINAL parts (`CornerEnd.part`; the planner's working clones lose their old dovetails to `removeAt`)
 *  already carry at its two ends: each end's stored dovetail, whether the corner is a re-plan (both ends dovetailed, one
 *  tails and one pins: spec G3) and, on a re-plan, the side holding the tails now. */
function storedCorner({ ends }: Corner) {
  const old = ends.map((e) => dovetailAt(e.part, axisDimensions(e.part)[e.k] as Dovetail['dim'], endFacing(e.part, e.k, e.side)));
  const replan = old[0] !== undefined && old[1] !== undefined && old[0].role !== old[1].role;
  const current: 0 | 1 | null = replan ? (old[0]!.role === 'tails' ? 0 : 1) : null;
  return { old, current };
}

/**
 * A corner's style (dovetails spec §3.3, G3; half-blind spec §3.2, §4, §8): the ONE answer the kind's `inset` and
 * `planCorner` both read. Pure on the corner's ORIGINAL parts, so every call gives the same result.
 * - `tails`: on a re-plan the current tails side, else the part whose run axis ranks first (`RUN_RANK`: Z, X, Y); Swap
 *   flips it.
 * - The kind: `through` and `half-blind` as asked; `keep` (the default) keeps a re-plan's stored kind, which the PINS
 *   entry's `lap` decides (present: half-blind; it shapes the geometry, spec §8), and a new corner is through.
 * - `lap` (null on a through corner): a typed one as typed; else a re-plan whose pins end is unchanged (no Swap) keeps the
 *   stored pins `lap`; else `autoLap` of the pin part's thickness. A lap not strictly inside the pin part's thickness (to
 *   1e-9, as the `lap` fault) refuses with the lap sentence naming the pin part.
 */
export function dovetailCornerStyle(
  c: Corner, doc: SloydDocument, opts: DovetailOptions, nameOf: (b: Board) => string,
): { tails: 0 | 1; lap: number | null } | string {
  const { ends } = c;
  const { old, current } = storedCorner(c);
  const ranked: 0 | 1 = current ?? (RUN_RANK[ends[0].k]! < RUN_RANK[ends[1].k]! ? 0 : 1);
  const tails: 0 | 1 = opts.swap ? (ranked === 0 ? 1 : 0) : ranked;
  const pins: 0 | 1 = tails === 0 ? 1 : 0;
  const storedLap = current === null ? undefined : old[current === 0 ? 1 : 0]!.lap;
  const joint = opts.joint ?? 'keep';
  const halfBlind = joint === 'half-blind' || (joint === 'keep' && storedLap !== undefined);
  if (!halfBlind) return { tails, lap: null };
  const P = ends[pins].part;
  const typed = opts.lap ?? null;
  const lap = typed !== null ? typed
    : current !== null && current === tails && storedLap !== undefined ? storedLap
      : autoLap(P.thickness, doc.units);
  if (!(lap > EPS)) return DOVETAIL_LAP_PARSE;
  if (!(lap < P.thickness - EPS)) return dovetailTooThin(nameOf(P), lap, doc.units);
  return { tails, lap };
}

/** Dovetails as a corner joint kind (`JointKind`), for the typed slope, count, Swap, Joint and lap. */
function dovetailKind(opts: DovetailOptions): JointKind<DovetailCornerPlan, DovetailFeature> {
  return {
    copy: DOVETAIL_COPY,
    featureOf,
    /** The existing dovetail at this end goes (a re-plan re-lays it in place); a part left with none has no key. */
    removeAt(b, d, end) {
      const all = dovetailsOf(b);
      const rest = all.filter((x) => !(x.dim === d && x.end === end));
      if (rest.length === all.length) return;
      if (rest.length === 0) delete b.dovetails;
      else b.dovetails = rest;
    },
    /**
     * The tails side and lap (`dovetailCornerStyle`, the ONE answer `inset` also read: a re-plan's current tails part, else
     * `RUN_RANK`, then Swap), the count and the pins' outside face (spec §3.2, §3.3, G3). The re-plan rule reads the corner's
     * ORIGINAL parts (`CornerEnd.part`; the working clones have lost their old dovetails to `removeAt`). The count: a typed
     * one (refused when it faults); else the kept count on a re-plan, or Auto (`autoTailCount`, at most DOVETAIL_COUNT_MAX)
     * on a new corner, lowered by one while `narrow` holds on either part (the pins judged with the lap); one tail still
     * faulting refuses. The pin width: the kept one on a re-plan, else `pinWidth(doc.units)`.
     */
    planCorner(c, ops, doc, nameOf) {
      const { ends, J } = c;
      const [ea, eb] = ends;
      const s = opts.slope;
      // The tails side and the lap: the ONE answer `inset` read before the ends moved (a lap refusal never reaches here).
      const style = dovetailCornerStyle(c, doc, opts, nameOf);
      if (typeof style === 'string') return style;
      const { tails, lap } = style;
      const { old, current } = storedCorner(c);
      const replan = current !== null;
      // The pin width (G3: change only what is asked; final review, 2026-10-27): a re-plan keeps the current tails end's
      // stored pin, as it keeps the count, so a units switch alone never changes a joint; a new corner takes the units'.
      const p = replan ? old[current]!.pin : pinWidth(doc.units);
      const T = ends[tails]!;
      const P = ends[tails === 0 ? 1 : 0]!;
      // The pin part's thickness axis is T's run axis (`reach`); T's end faces `T.side` and lands on P's face there.
      const outside = endFacing(P.part, T.k, T.side);
      // `narrow` judged by the ONE decider on each part as planned (its run size after this end's move); the pins trial
      // carries the lap, so a half-blind pin part is judged on its true extent, `thickness − lap` (half-blind spec §3.2).
      const narrow = (N: number) => ends.some((e, i) => {
        const op = ops[i]!;
        const role = i === tails ? 'tails' : 'pins';
        const d: Dovetail = {
          id: '', dim: op.d as Dovetail['dim'], end: op.end, role, count: N, slope: s, pin: p, depth: op.depth,
          ...(role === 'pins' && lap !== null ? { lap } : {}),
        };
        return dovetailFaults({ ...e.part, [op.d]: op.size }, d).includes('narrow');
      });
      const refuse = (N: number) => dovetailTooNarrow(nameOf(ea.part), nameOf(eb.part), N, s);
      let N: number;
      if (opts.count !== null) {
        N = opts.count;
        if (narrow(N)) return refuse(N);
      } else {
        // The kept count is the current tails end's; a stored count that is not a whole number (a kept fault) is not kept.
        const kept = replan ? old[current]!.count : NaN;
        // Auto starts at most at DOVETAIL_COUNT_MAX (load drops more); a kept count is a loaded one, already within it.
        N = Number.isInteger(kept) && kept >= 1 ? kept : Math.min(DOVETAIL_COUNT_MAX, autoTailCount(boardExtents(ea.part)[J]!, doc.units));
        while (N > 1 && narrow(N)) N -= 1;
        if (narrow(N)) return refuse(N);
      }
      return { N, s, p, tails, outside, lap };
    },
    /** The side's dovetail at `end`, its id minted here, `op.depth` deep (tails: the pin part's thickness, less the lap on
     *  a half-blind corner, the inset; pins: the tail part's thickness); pins with `outside` (through the Shape's own
     *  board's `thickness` flip). A half-blind corner writes `lap` on BOTH entries; a through one writes no `lap` key. */
    addAt(b, op, end, plan, side, flips) {
      const base = { id: nextId(), dim: op.d as Dovetail['dim'], end, count: plan.N, slope: plan.s, pin: plan.p, depth: op.depth };
      const lap = plan.lap === null ? {} : { lap: plan.lap };
      const d: Dovetail = side === plan.tails
        ? { ...base, role: 'tails', ...lap }
        : { ...base, role: 'pins', outside: flips.thickness ? flipEnd(plan.outside) : plan.outside, ...lap };
      b.dovetails = [...dovetailsOf(b), d].sort(byDovetailEnd);
    },
    /** The role, count, slope, pin width, the pins' outside face, Shape-local (null for tails), and the lap (null:
     *  through; it flips under nothing); the generic part adds the run dimension, the Shape-local end, the depth and the
     *  final size. */
    signature(plan, side, flips) {
      const outside = side === plan.tails ? null : flips.thickness ? flipEnd(plan.outside) : plan.outside;
      return [side === plan.tails ? 'tails' : 'pins', plan.N, plan.s, plan.p, outside, plan.lap ?? null];
    },
    /** The tails end of a half-blind corner stops `lap` short of the pin part's outside face, at the lap plane (half-blind
     *  spec §3.1); the pins end and a through corner's ends, 0. A lap that does not fit the pin part refuses here, before
     *  any end moves. */
    inset(c, side, doc, nameOf) {
      const style = dovetailCornerStyle(c, doc, opts, nameOf);
      if (typeof style === 'string') return style;
      return side === style.tails && style.lap !== null ? style.lap : 0;
    },
  };
}

/**
 * Dovetail the corners among the selected world parts `ids` (dovetails spec §3, §6, G3). Every refusal is decided before
 * any mutation, in this order:
 * 1. `slope` outside [4, 12] (the slope sentence), then a typed `count` not a whole number from 1 to DOVETAIL_COUNT_MAX
 *    (the count sentence; load drops more, so the planner never writes what a reload would lose).
 * 2.–4. and 6. The shared corner planner (`planCorners`, `cornerPlan.ts`): a part in a mirrored copy; the corners and their
 *    refusals; then (3a, the kind's `inset`, before any end moves) per corner a half-blind lap not strictly inside the pin
 *    part's thickness (`dovetailCornerStyle`: the lap sentence naming the pin part); per part end the plain-stock test
 *    (`featureOf`), the old dovetail at that end removed, the exact run-out (a half-blind tails end to the lap plane) and
 *    the corner region; linked parts (the role, count, slope, pin, depth, Shape-local end, outside face and lap compared)
 *    and the link post-condition.
 * 5. Per corner (the kind's `planCorner`): the tails side and lap (`dovetailCornerStyle`) and the count (the too-narrow
 *    sentence), then each end's dovetail.
 * 7. Any other fault of a new dovetail on a planned part (`depth`): the too-short sentence naming the part.
 * Selected ids that are not world parts are skipped.
 */
export function dovetailPlan(doc: SloydDocument, ids: readonly string[], opts: DovetailOptions): DovetailPlan | string {
  if (!(opts.slope >= 4 && opts.slope <= 12)) return DOVETAIL_SLOPE_RANGE;
  if (opts.count !== null && !(Number.isInteger(opts.count) && opts.count >= 1 && opts.count <= DOVETAIL_COUNT_MAX)) return DOVETAIL_COUNT_WHOLE;
  const planned = planCorners(doc, ids, dovetailKind(opts));
  if (typeof planned === 'string') return planned;
  const names = displayNames(doc);
  const byId = new Map(worldParts(doc).map((b) => [b.id, b]));
  const nameOf = (id: string) => names.get(id) ?? byId.get(id)!.name;
  // Authoring refuses ANY fault (spec §3.5). `narrow` is settled per corner by the count; what is left (`depth`: deeper than
  // the part, or meeting the part's other dovetail) is judged on each part as planned, NEW dovetails only (ids minted by
  // this plan), so a fault an untouched end already carries is kept, never a reason to refuse.
  for (const [id, after] of planned.parts) {
    const old = new Set(dovetailsOf(byId.get(id)!).map((d) => d.id));
    if (dovetailsOf(after).some((d) => !old.has(d.id) && dovetailFaults(after, d).length > 0)) return dovetailTooShort(nameOf(id));
  }
  const corners = planned.corners.map(({ a, b, plan }) => ({ a, b, tails: plan.tails === 0 ? a : b, N: plan.N, s: plan.s, lap: plan.lap }));
  const notes = [
    ...dovetailedLines(
      corners.map((c) => ({ count: c.N, slope: c.s, lap: c.lap })), corners.map((c) => [nameOf(c.a), nameOf(c.b)] as const), doc.units,
    ),
    dovetailTailsOn([...new Set(corners.map((c) => c.tails))].map(nameOf)),
    ...planned.lengths, ...planned.ignored,
  ];
  return { parts: planned.parts, corners, notes };
}

/** Write a plan: `writeCorners` (`writeBackParts`, one `{ before, after }` per planned world part, with `keepWorld`), so
 *  every placement of a definition and every user of a Shape follows. */
export function applyDovetails(doc: SloydDocument, plan: DovetailPlan): SloydDocument {
  return writeCorners(doc, plan.parts);
}
