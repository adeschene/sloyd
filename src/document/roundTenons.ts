import { type AngleCut, type Board, type CurveSegment, type Dimension, type Region, type RoundTenon } from './types';
import type { CurveSpan, ViewCurve } from './curves';
import { DIMENSION_ORDER } from './geometry';
import { clippedRegion, cutRemovesNothing } from './cuts';
import { angleCutRemovesNothing, depthAt, touchedRegion } from './angleCuts';
import { boardHoles, holeRegion, mm } from './holes';
import { featureMeetsBox, shapedFeatures } from './featureRegions';
import type { Units } from '../units/length';

/**
 * Every field of `RoundTenon` that decides "same tenon": all but `id` (round tenons spec §3.1). A TABLE CHECKED AGAINST THE
 * TYPE (invariant 40's pattern): a new `RoundTenon` field fails `tsc` here until it is listed.
 */
export const TENON_FIELDS = {
  end: true, diameter: true, length: true,
} as const satisfies Record<Exclude<keyof RoundTenon, 'id'>, true>;

const TENON_KEYS = Object.keys(TENON_FIELDS) as (keyof typeof TENON_FIELDS)[];

/** One tenon's comparable values as a string, exact: `String()` round-trips a double, and `-0` is told apart from 0. */
export function tenonValues(t: Omit<RoundTenon, 'id'>): string {
  return TENON_KEYS.map((k) => {
    const v = t[k];
    return typeof v === 'number' && Object.is(v, -0) ? '-0' : String(v);
  }).join('|');
}

/** Exact equality on every TENON_FIELDS field (stored values, invariant 18). */
export function sameTenon(a: Omit<RoundTenon, 'id'>, b: Omit<RoundTenon, 'id'>): boolean {
  return tenonValues(a) === tenonValues(b);
}

/** A copy that is not the same object, so no two parts ever hold one tenon. */
export function copyTenon(t: RoundTenon): RoundTenon {
  return { ...t };
}

const NONE: readonly RoundTenon[] = [];

/** Canonical order: `min` first. */
const byEnd = (p: RoundTenon, q: RoundTenon) => (p.end === q.end ? 0 : p.end === 'min' ? -1 : 1);

/** The part's tenons, canonical order; an absent key reads as none. */
export function tenonsOf(b: Pick<Board, 'tenons'>): readonly RoundTenon[] {
  return b.tenons ?? NONE;
}

export function hasTenons(b: Pick<Board, 'tenons'>): boolean {
  return (b.tenons?.length ?? 0) > 0;
}

/** The tenon on an end of the part's length, if any. */
export function tenonAt(b: Pick<Board, 'tenons'>, end: RoundTenon['end']): RoundTenon | undefined {
  return b.tenons?.find((t) => t.end === end);
}

/** The part with these tenons, `min` first. An empty list REMOVES the key (a tenon-free part has none: never `[]`, never
 *  `undefined`). */
export function withTenons<B extends Pick<Board, 'tenons'>>(b: B, ts: readonly RoundTenon[]): B {
  const { tenons: _drop, ...rest } = b;
  if (ts.length === 0) return rest as B;
  return { ...rest, tenons: [...ts].sort(byEnd) } as B;
}

/** Tenons reflected along dimension `d` (round tenons spec §3.1, inv 44): a FLAG FLIP, never arithmetic. Along the length
 *  each `end` swaps and the list is re-sorted, `min` first; across the width or thickness nothing moves, so the SAME array
 *  comes back. Its own inverse. */
export function mirrorTenons(ts: RoundTenon[], d: Dimension): RoundTenon[] {
  if (d !== 'length') return ts;
  return ts.map((t): RoundTenon => ({ ...t, end: t.end === 'min' ? 'max' : 'min' })).sort(byEnd);
}

/**
 * A part's tenons lowered back through ONE mirror along `d` (round tenons spec §3.1; treeEdit's lowerHoles, inv 44, 46):
 * `mirrorTenons`, its own inverse; a tenon equal to the stored one with the same id maps back to THAT object, and when all
 * are reused, the stored array (an untouched list is never rewritten). A draft with no tenons (none, or a removal) adds no
 * key: its own key, present or absent, is the after-state's, as `lowerLean`'s.
 */
export function lowerTenons(stored: RoundTenon[] | undefined, draft: Pick<Board, 'tenons'>, d: Dimension): { tenons?: RoundTenon[] } {
  if (!draft.tenons || draft.tenons.length === 0) return {};
  const byId = new Map((stored ?? []).map((t) => [t.id, t]));
  const out = mirrorTenons(draft.tenons, d).map((t) => {
    const s = byId.get(t.id);
    return s && sameTenon(s, t) ? s : t;
  });
  return { tenons: stored && out.length === stored.length && out.every((t, i) => t === stored[i]) ? stored : out };
}

/** The step a FITTED tenon's length rounds up to (round tenons spec §6.1, Global Constraints): 1/64" in an imperial
 *  project, 0.1 mm in a metric one (the hole grid's fine steps). A type-only `Units` import: no text is produced here. */
export const TENON_STEP = { imperial: 1 / 64, metric: mm(0.1) } as const;
export const tenonStep = (units: Units): number => (units.display === 'metric-mm' ? TENON_STEP.metric : TENON_STEP.imperial);

// ---- The zone and the faults (round tenons spec §3.2, §3.3) ------------------------------------------------------

const EPS = 1e-9;

/**
 * The end's own cut (spec §3.3): null for a square end, the miter when the end carries exactly one end miter (`kind
 * 'miter'`, `face 'length'`, `from` that end: what Level the ends writes), `'other'` for anything else on that end (a
 * bevel, a chamfer, a second cut). A cut that removes nothing is not on the end.
 */
export function endCutOf(b: Pick<Board, Dimension | 'angleCuts'>, end: RoundTenon['end']): AngleCut | null | 'other' {
  const on = b.angleCuts.filter((c) => c.face === 'length' && c.from === end && !angleCutRemovesNothing(b, c));
  if (on.length === 0) return null;
  return on.length === 1 && on[0]!.kind === 'miter' ? on[0]! : 'other';
}

/** Depth into the length from the end face at the centre of the section (where the miter plane meets the axis, as
 *  `levelPlan` reads it); 0 for a square end or an `'other'` one. */
function centreDepth(b: Pick<Board, Dimension | 'angleCuts'>, end: RoundTenon['end']): number {
  const c = endCutOf(b, end);
  // Clamped: a miter that reaches depth 0 inside the section (a corner clip) extrapolates negative at the centre, and the
  // end face's centre is never outside the part.
  return c && c !== 'other' ? Math.max(0, depthAt(c, b[c.along] / 2)) : 0;
}

/** The deepest the end's miter reaches into the length over the 4 section corners (the line is linear in the station,
 *  so an end of `along` is the extreme); 0 for a square end. */
function deepestDepth(b: Pick<Board, Dimension | 'angleCuts'>, end: RoundTenon['end']): number {
  const c = endCutOf(b, end);
  if (!c || c === 'other') return 0;
  return Math.max(depthAt(c, 0), depthAt(c, b[c.along]));
}

/**
 * The shoulder's length coordinate: `length` inward from the end's centre — `L − length` (max) or `length` (min) on a
 * square end; on a mitered end the centre is where the miter meets the axis (`depthAt` at the centre station).
 */
export function shoulderAt(b: Pick<Board, Dimension | 'angleCuts'>, t: Pick<RoundTenon, 'end' | 'length'>): number {
  const d = centreDepth(b, t.end);
  return t.end === 'min' ? d + t.length : b.length - d - t.length;
}

/** The end slab from the shoulder to the end, over the full section. */
export function tenonZone(b: Pick<Board, Dimension | 'angleCuts'>, t: Pick<RoundTenon, 'end' | 'length'>): Region {
  const s = shoulderAt(b, t);
  const [lo, hi] = t.end === 'min' ? [Math.min(0, s), Math.max(0, s)] : [Math.min(s, b.length), Math.max(s, b.length)];
  return { length: [lo, hi], width: [0, b.width], thickness: [0, b.thickness] };
}

export type TenonFeature = 'cut' | 'angle-cut' | 'hole' | 'curve' | 'profile' | 'band';
export interface TenonFault {
  kind: 'too-wide' | 'too-long' | 'cut-reaches-shoulder' | 'meets-feature';
  feature?: TenonFeature;
}

/** The two boxes overlap with positive extent on every dimension. */
function meets(a: Region, z: Region): boolean {
  return DIMENSION_ORDER.every((d) => Math.min(a[d][1], z[d][1]) - Math.max(a[d][0], z[d][0]) > EPS);
}

/** The feature kinds whose region's box meets `zone` (spec §3.2): conservative boxes, never sampled. `endCut` is the
 *  end's own miter, which is the tip and not a feature. */
function featuresMeeting(b: Board, zone: Region, end: RoundTenon['end'], endCut: AngleCut | null | 'other'): TenonFeature[] {
  const out: TenonFeature[] = [];
  if (endCut === 'other') out.push('angle-cut');
  if (b.cuts.some((c) => !cutRemovesNothing(b, c) && meets(clippedRegion(b, c), zone))) out.push('cut');
  if (b.angleCuts.some((c) => c !== endCut
    && (() => { const r = touchedRegion(b, c); return r !== null && meets(r, zone); })())) {
    if (!out.includes('angle-cut')) out.push('angle-cut');
  }
  if (boardHoles(b).some((h) => meets(holeRegion(h), zone))) out.push('hole');
  // Curves and profiles through the ONE geometry view (inv 53): true arcs, stopped profiles' run-outs, swept profiles.
  const { view, features } = shapedFeatures(b);
  const hit = features.filter((f) => featureMeetsBox(view, f, zone));
  if (hit.some((f) => f.word === 'curve')) out.push('curve');
  if (hit.some((f) => f.word !== 'curve')) out.push('profile');
  // A band covers its side over the part's whole run: a long edge reaches both ends; an end edge sits at its own end (its
  // thickness lives in the band type, which the part does not carry, so only the tenon's own end is judged).
  if (b.bands.some((band) => (band.side.across === 'width' ? zone.length[1] - zone.length[0] > EPS : band.side.from === end))) {
    out.push('band');
  }
  return out;
}

/**
 * THE tenon fault decider (spec §3.2). `t` is judged on `b` (it may or may not be stored there; the OTHER end's stored
 * tenon is read from `b`). Faults come in the table's order, one `meets-feature` per feature kind.
 */
export function tenonFaults(b: Board, t: RoundTenon): TenonFault[] {
  const out: TenonFault[] = [];
  if (t.diameter >= Math.min(b.width, b.thickness) - EPS) out.push({ kind: 'too-wide' });

  const other = tenonAt(b, t.end === 'min' ? 'max' : 'min');
  const mine = shoulderAt(b, t);
  const far = other ? shoulderAt(b, other) : t.end === 'min' ? b.length : 0;
  if (t.end === 'min' ? mine >= far - EPS : mine <= far + EPS) out.push({ kind: 'too-long' });

  const endCut = endCutOf(b, t.end);
  if (endCut && endCut !== 'other' && deepestDepth(b, t.end) >= centreDepth(b, t.end) + t.length - EPS) {
    out.push({ kind: 'cut-reaches-shoulder' });
  }
  for (const feature of featuresMeeting(b, tenonZone(b, t), t.end, endCut)) out.push({ kind: 'meets-feature', feature });
  return out;
}

/**
 * The tenon Properties' Add round tenon puts on `end` (round tenons spec §4): 1" (25 mm in a metric project), or, when
 * that is `too-wide` (THE decider, `tenonFaults`), the largest whole 1/8" (whole mm) that is not; 1" (25 mm) long. Null
 * when no step fits. Only the diameter is chosen here: whether the default is free of every OTHER fault is the caller's
 * to ask (`tenonFaults`), as a preset is withheld when its default would be refused. `metric` rather than `Units`: this
 * module produces no text (the `→ units` edge rule).
 */
export function defaultTenon(b: Board, end: RoundTenon['end'], metric: boolean): Omit<RoundTenon, 'id'> | null {
  const [steps, step] = metric ? [25, mm] : [8, (k: number) => k / 8];
  const length = step(steps);
  for (let k = steps; k >= 1; k--) {
    const t: RoundTenon = { id: '__default', end, diameter: step(k), length };
    if (!tenonFaults(b, t).some((f) => f.kind === 'too-wide')) return { end, diameter: t.diameter, length };
  }
  return null;
}

const BUILT = new WeakMap<object, readonly RoundTenon[]>();

/** The tenons that BUILD (spec §7): fault-free, judged on the stored part. A faulted tenon builds nothing (the swept-profile
 *  rule Q6), so nothing draws, notes or snaps to it either: `geometryBoard` and every reader of a tenon's shape ask this.
 *  Memoised per board OBJECT (a part is never mutated: an edit makes a new object, as `geometryBoard`'s own cache assumes);
 *  the list is frozen, so no caller can change what the next one reads. */
export function builtTenons(b: Board): readonly RoundTenon[] {
  if (!b.tenons || b.tenons.length === 0) return NONE;
  const hit = BUILT.get(b);
  if (hit) return hit;
  const out = Object.freeze(tenonsOf(b).filter((t) => tenonFaults(b, t).length === 0));
  BUILT.set(b, out);
  return out;
}

/** Whether a board-local point lies on a built tenon's ROUND surface: past the shoulder (inside the zone) and at the
 *  tenon's radius from the axis, within 1e-9. The tip's outline and the rings are chains of chords whose vertices lie on
 *  it; a reader that offers edge endpoints (snapPoints' sloped-face corners) asks this so a tenon's ring is never mistaken
 *  for a sloped face's corners (ruling T4b). */
export function onTenonSurface(b: Board, p: { length: number; width: number; thickness: number }): boolean {
  return builtTenons(b).some((t) => {
    const s = shoulderAt(b, t);
    const inZone = t.end === 'max' ? p.length >= s - EPS : p.length <= s + EPS;
    return inZone && Math.abs(Math.hypot(p.width - b.width / 2, p.thickness - b.thickness / 2) - t.diameter / 2) <= EPS;
  });
}

const faultKey = (f: TenonFault) => `${f.kind}|${f.feature ?? ''}`;

/** The faults `after`'s tenon at `tenonEnd` has that `before`'s did not (the edit rule: refused only when it ADDS one). A
 *  tenon absent after has none; one absent before added them all. */
export function addedTenonFaults(before: Board, after: Board, tenonEnd: RoundTenon['end']): TenonFault[] {
  const t = tenonAt(after, tenonEnd);
  if (!t) return [];
  const old = tenonAt(before, tenonEnd);
  const had = new Set((old ? tenonFaults(before, old) : []).map(faultKey));
  return tenonFaults(after, t).filter((f) => !had.has(faultKey(f)));
}

// ---- Geometry: the tenon's waste as view curves (round tenons spec §7) -------------------------------------------

/**
 * The waste round a tenon (spec §7, P18's mechanism): the section minus the tenon's disc, through the length, over the zone,
 * with a SQUARE stop at the shoulder (`span.square`: a plain wall, no run-out) and the end side open, so the end's miter (an
 * angle cut, applied first) clips the tip. VIEW-ONLY: never stored, never validated; `geometryBoard` appends them for a
 * fault-free tenon only.
 *
 * A rectangle minus a disc is no one simple outline, so it is TWO, which OVERLAP: each the section minus the disc minus one
 * quadrant (A opens at the (+u, −v) quadrant, B at the (−u, +v) one), each round three quarter arcs of radius d / 2 about the
 * section's centre, every arc MINOR. Their union is the waste. Where one outline leaves the circle (a sharp vertex of its
 * own: a line meeting an arc square), the OTHER runs on round it through a quarter join — a tangent join, so its own outline
 * judges it smooth (`curveOutline`, on the true arcs) — and the two quarters they share are the same arcs from the same
 * points, so their chords are the same planes. So the round side is one inscribed polygon, every vertex of it a smooth
 * vertex of some outline: no seam line along it (inv 16), and the silhouettes come from that outline's smooth vertices. No
 * edge code knows about tenons.
 *
 * Ids `tenon/<tenon id>/a` and `/b`: the loader re-mints every stored id holding a `/` (inv 33's `takeId`, tenon ids too),
 * so no loaded curve, profile or tenon id can equal one. `uFrom`/`vFrom` 'min' (u the width, v the thickness:
 * `uvDims('length')`).
 */
export function tenonViewCurves(b: Pick<Board, Dimension | 'angleCuts'>, t: RoundTenon): ViewCurve[] {
  const W = b.width, T = b.thickness;
  const cx = W / 2, cy = T / 2, r = t.diameter / 2;
  const bottom: [number, number] = [cx, cy - r], left: [number, number] = [cx - r, cy];
  const top: [number, number] = [cx, cy + r], right: [number, number] = [cx + r, cy];
  // Clockwise round the centre: an arc bowing to the LEFT of travel runs clockwise (`arcOf`).
  const arc = (to: [number, number]): CurveSegment => ({ type: 'arc', to, side: 'left', radius: r });
  const line = (to: [number, number]): CurveSegment => ({ type: 'line', to });
  const s = shoulderAt(b, t);
  const span: CurveSpan = t.end === 'max'
    ? { lo: s, hi: b.length, stopLo: true, stopHi: false, square: true }
    : { lo: 0, hi: s, stopLo: false, stopHi: true, square: true };
  const base = { through: 'length' as const, uFrom: 'min' as const, vFrom: 'min' as const, start: [0, 0] as [number, number] };
  return [
    // A: open at the (+u, −v) quadrant; arcs bottom → left → top → right.
    { ...base, id: `tenon/${t.id}/a`, span, segments: [
      line([cx, 0]), line(bottom), arc(left), arc(top), arc(right), line([W, cy]), line([W, T]), line([0, T]), line([0, 0]),
    ] },
    // B: open at the (−u, +v) quadrant; arcs top → right → bottom → left.
    { ...base, id: `tenon/${t.id}/b`, span, segments: [
      line([W, 0]), line([W, T]), line([cx, T]), line(top), arc(right), arc(bottom), arc(left), line([0, cy]), line([0, 0]),
    ] },
  ];
}
