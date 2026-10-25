import { type AngleCut, type Board, type Dimension, type ProfileCut, type Region, type RoundTenon } from './types';
import { DIMENSION_ORDER } from './geometry';
import { clippedRegion, cutRemovesNothing } from './cuts';
import { angleCutRemovesNothing, depthAt, touchedRegion } from './angleCuts';
import { boardHoles, holeRegion } from './holes';
import { curveOutline, uvDims } from './curves';
import { endPos, oneSide, runDim } from './profiles';

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
  return c && c !== 'other' ? depthAt(c, b[c.along] / 2) : 0;
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

/** A profile's box: its run along the run dimension, the edge strip across (its reach, summed over every size it
 *  carries), the whole thickness; a loop or an unbuilt run is the whole part. Conservative, never one that can miss. */
function profileBox(b: Pick<Board, Dimension>, p: ProfileCut): Region {
  const whole: Region = { length: [0, b.length], width: [0, b.width], thickness: [0, b.thickness] };
  if (!oneSide(p.run)) return whole;
  const side = p.run.start.side;
  const r = runDim(side);
  const a = endPos(b, p.run.start);
  const e = endPos(b, p.run.end);
  const reach = p.size + (p.fillet ?? 0) + (p.depth ?? 0);
  const A = b[side.across];
  const out: Region = { ...whole };
  out[r] = [Math.min(a, e), Math.max(a, e)];
  out[side.across] = side.from === 'min' ? [0, Math.min(A, reach)] : [Math.max(0, A - reach), A];
  return out;
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
  if (b.curves.some((c) => {
    const [u, v] = uvDims(c.through);
    const pts = curveOutline(b, c).pts;
    if (pts.length === 0) return false;
    const r: Region = { length: [0, b.length], width: [0, b.width], thickness: [0, b.thickness] };
    r[u] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    r[v] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    return meets(r, zone);
  })) out.push('curve');
  if (b.profiles.some((p) => meets(profileBox(b, p), zone))) out.push('profile');
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
