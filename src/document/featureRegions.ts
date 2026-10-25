/**
 * One part's SHAPED features (curves and edge profiles) as regions the joinery watch tests a joint's wood against (joinery
 * features spec §3.3, §3.4; P4, P6, P7). Board-local throughout, read through `geometryBoard` (the ONE geometry view,
 * invariant 53): a straight or stopped profile is a view curve there, a swept one is in `view.profiles`. Touching passes
 * (open, overlap above 1e-9) except where P4 keeps the closed, conservative test: a swept profile's footprint and a stopped
 * profile's run-out allowance. Holes are not here: chunk 1's rule judges them.
 */
import type { Band, BandType, Board, CutFrom, Dimension, ProfileCut, Region } from './types';
import { localSegments, rectOverlapsWaste, spanOf, uvDims, wasteOnSegment, CURVE_EPS, type P2, type ViewCurve } from './curves';
import { profileFields, profileView } from './profiles';
import { runoutReach } from './runout';
import { builtSwept, sweptWasteMeetsBox } from './sweep';
import { profileWord, type FeatureWord } from './ruledOutText';

/** Float noise: an overlap must exceed it (spec §3.3; `clearsTenon`'s and `holeFaults`' tolerance). */
const OVERLAP = 1e-9;

/** A shaped feature: exactly one of `curve` (a curve or a straight/stopped profile, a view curve) and `swept`. */
export interface ShapedFeature { word: FeatureWord; curve?: ViewCurve; swept?: ProfileCut }

/** A part's shaped features in stored order: its curves, its straight profiles (both `view.curves`), then the swept profiles
 *  the bodies build (`builtSwept`, as `intoCurve` reads them: a faulted swept profile builds no wood). Words as `intoCurve`
 *  reads them: `profileFields(c)?.kind` for a view curve, `p.kind` for a swept one. */
export function shapedFeatures(board: Board): { view: Board; features: ShapedFeature[] } {
  // The profile view: a round tenon's view curves are no shaped feature (round tenons spec §7; `tenonFaults` judges a tenon
  // against these, so it never reads its own waste). The same view as `geometryBoard`'s for a part with no tenons.
  const view = profileView(board);
  const features: ShapedFeature[] = view.curves.map((c) => {
    const p = profileFields(c);
    return { word: p ? profileWord(p.kind) : 'curve', curve: c as ViewCurve };
  });
  if (view.profiles.length > 0) for (const p of builtSwept(view)) features.push({ word: profileWord(p.kind), swept: p });
  return { view, features };
}

/** A view curve's extent along `through`: the whole dimension, or its span widened by `runoutReach` at each stopped end
 *  (P4, as `intoCurve` widens it). */
function throughExtent(view: Board, c: ViewCurve): [number, number] {
  const sp = spanOf(c);
  if (!sp) return [0, view[c.through]];
  const reach = !sp.square && (sp.stopLo || sp.stopHi) ? runoutReach(view, c) : 0;
  return [sp.lo - (sp.stopLo ? reach : 0), sp.hi + (sp.stopHi ? reach : 0)];
}

/** The (u, v) rectangle a box projects to in a curve's plane. */
function inPlane(c: ViewCurve, box: Region): [P2, P2] {
  const [u, v] = uvDims(c.through);
  return [[box[u][0], box[v][0]], [box[u][1], box[v][1]]];
}

/** A box (board-local) meets the feature's region. A curve: OPEN on both conditions — the box's `through` span overlaps the
 *  curve's extent along `through` by more than 1e-9, and `rectOverlapsWaste` on its (u, v) projection. A swept profile:
 *  `sweptWasteMeetsBox` (conservative, closed; P4). */
export function featureMeetsBox(view: Board, f: ShapedFeature, box: Region): boolean {
  if (f.swept) return sweptWasteMeetsBox(view, f.swept, box);
  const c = f.curve!;
  const [e0, e1] = throughExtent(view, c);
  const [b0, b1] = box[c.through];
  if (!(Math.min(e1, b1) - Math.max(e0, b0) > OVERLAP)) return false;
  const [lo, hi] = inPlane(c, box);
  return rectOverlapsWaste(localSegments(view, c), lo, hi);
}

/**
 * P6: the feature's region touches the part's `end` face of `d` with positive area.
 * - A curve across `d` (`d` is its u or v): the end line in its (u, v) plane has more than 1e-9 inside the waste
 *   (`wasteOnSegment`): a waste meeting the end at a corner point only (a full-span arch) does not touch.
 * - A curve along `d` (`d === through`): its extent along `through` (widened at a stop, as `featureMeetsBox`) reaches the end.
 * - A swept profile: conservatively, its box form meets the end face, touching included.
 */
export function featureTouchesEnd(view: Board, f: ShapedFeature, d: Dimension, end: CutFrom): boolean {
  const e = end === 'min' ? 0 : view[d];
  if (f.swept) {
    const face: Region = { length: [0, view.length], width: [0, view.width], thickness: [0, view.thickness] };
    face[d] = [e, e];
    return sweptWasteMeetsBox(view, f.swept, face);
  }
  const c = f.curve!;
  if (d === c.through) {
    const [e0, e1] = throughExtent(view, c);
    return end === 'min' ? e0 <= CURVE_EPS : e1 >= view[d] - CURVE_EPS;
  }
  const [u, v] = uvDims(c.through);
  const [a, b]: [P2, P2] = d === u ? [[e, 0], [e, view[v]]] : [[0, e], [view[u], e]];
  return wasteOnSegment(localSegments(view, c), a, b) > OVERLAP;
}

/** P7's condition 2: a curve or straight profile with `through === d` that runs out through the `end` face of `d` — a plain
 *  curve always does; a view curve with a span does unless that end is a stop. A swept profile never does (no exception).
 *  P7's condition 1 (`d === 'length'`) is the caller's. */
export function runsOutThrough(view: Board, f: ShapedFeature, d: Dimension, end: CutFrom): boolean {
  void view;
  const c = f.curve;
  if (!c || c.through !== d) return false;
  const sp = spanOf(c);
  if (!sp) return true;
  return end === 'min' ? !sp.stopLo : !sp.stopHi;
}

/** P7's condition 3: the rectangle [lo, hi] OVERLAPS the feature's waste in the curve's (u, v) (`rectOverlapsWaste`, open).
 *  (u, v) is `uvDims(through)`: for `through === 'length'`, (width, thickness), so a tenon section `[shoulder, w − shoulder] ×
 *  [cheek, t − cheek]` goes in as lo = [shoulder, cheek], hi = [w − shoulder, t − cheek]. Only meaningful for a curve
 *  `through` d; a swept profile reports an overlap (it takes no exception). */
export function crossSectionOverlaps(view: Board, f: ShapedFeature, lo: P2, hi: P2): boolean {
  if (!f.curve) return true;
  return rectOverlapsWaste(localSegments(view, f.curve), lo, hi);
}

/**
 * Joinery features chunk 3 (P9, P10): each band of `board` with its region, board-local, in stored order. A band's region
 * is the strip on its side: the band TYPE's thickness in from that side × the side's full run × the part's thickness. Tape
 * of thickness 0 has none (`region` null); a thick tape is a region like solid edging. Judged as stored (P10): `bandFaults`
 * is not read, so a faulted band (a `needs-straight` solid band on a bowed edge) still has its strip. A band whose type is
 * missing is skipped (the loader drops it; in memory it contributes nothing, as in `banding.ts`' `judge`).
 */
export function bandRegions(board: Board, types: readonly BandType[]): { band: Band; region: Region | null }[] {
  const out: { band: Band; region: Region | null }[] = [];
  for (const band of board.bands) {
    const bt = types.find((t) => t.id === band.type);
    if (!bt) continue;
    if (!(bt.thickness > 0)) { out.push({ band, region: null }); continue; }
    const region: Region = { length: [0, board.length], width: [0, board.width], thickness: [0, board.thickness] };
    const a = band.side.across;
    region[a] = band.side.from === 'min' ? [0, bt.thickness] : [board[a] - bt.thickness, board[a]];
    out.push({ band, region });
  }
  return out;
}
