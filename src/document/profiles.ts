import type { Board, CurveCut, CurveSegment, CutFrom, Dimension, ProfileCut, ProfileEnd, ProfileKind, ProfileRun, ProfileSide } from './types';
import { sameCurve, spanOf, uvDims, type CurveSpan, type ViewCurve } from './curves';
import { faceOutline, isSwept, profilePath, sideStretch, type FaceOutline, type OutlineChord } from './profilePath';
import { BEARING } from './runout';
import { pathSkeleton, planChain } from './skeleton';

/**
 * Edge profiles (edge profiles spec, chunk 1): a full-length routed edge is a plain `CurveCut` running along the edge
 * (`through` = the edge's run), its waste outline written here in a canonical frame — a along the TOP face, b down the
 * EDGE face, from the edge's corner — and mapped to stored (u, v) by `facing` ('v': T is the v = 0 face, (u, v) = (a, b);
 * 'u': T is the u = 0 face, swapped, every arc side flipped). Recognised structurally (`profileFields`, read by
 * rewriting): no stored kind, no schema change. Through the thickness the same shape is a Curves Rounded corner (R3).
 * Runtime imports: none beyond types (the reader adds `curves` for `sameCurve`).
 */
export type { ProfileKind } from './types';
export const PROFILE_KINDS: readonly ProfileKind[] = ['roundover', 'cove', 'ogee', 'bead', 'thumbnail'];
export interface ProfileEdge { through: 'length' | 'width'; uFrom: CutFrom; vFrom: CutFrom }
export const PROFILE_EDGES: readonly ProfileEdge[] = (['length', 'width'] as const).flatMap((through) =>
  (['min', 'max'] as const).flatMap((uFrom) => (['min', 'max'] as const).map((vFrom) => ({ through, uFrom, vFrom }))));
export interface ProfileFields extends ProfileEdge {
  kind: ProfileKind; facing: 'u' | 'v';
  /** roundover/cove/bead: radius; ogee: s; thumbnail: reach a */
  size: number;
  /** thumbnail only: depth d (< size) */
  depth?: number;
  /** roundover/cove/ogee: fillet f (absent or 0 = none); bead: the quirk k (> 0) */
  fillet?: number;
}

type Seg = { type: 'line'; to: [number, number] } | { type: 'arc'; to: [number, number]; side: 'left' | 'right'; radius: number };
const line = (a: number, b: number): Seg => ({ type: 'line', to: [a, b] });
const arc = (a: number, b: number, side: 'left' | 'right', radius: number): Seg => ({ type: 'arc', to: [a, b], side, radius });

/** The outline in the canonical frame (spec §2.2), from (0, 0). */
function canonical(f: ProfileFields): Seg[] {
  const fl = f.fillet ?? 0;
  switch (f.kind) {
    case 'roundover':
    case 'cove': {
      const r = f.size;
      return [line(r + fl, 0), arc(fl, r, f.kind === 'roundover' ? 'left' : 'right', r), ...(fl > 0 ? [line(0, r)] : []), line(0, 0)];
    }
    case 'ogee': {
      const s = f.size;
      const h = s / 2;
      return [line(s + fl, 0), arc(h + fl, h, 'right', h), arc(fl, s, 'left', h), ...(fl > 0 ? [line(0, s)] : []), line(0, 0)];
    }
    case 'bead': {
      const r = f.size;
      const k = fl;
      return [line(r + k, 0), line(r + k, k), line(r, k), arc(0, r + k, 'left', r), line(0, 0)];
    }
    case 'thumbnail': {
      const a = f.size;
      const d = f.depth!;
      return [line(a, 0), arc(0, d, 'left', (a * a + d * d) / (2 * d)), line(0, 0)];
    }
  }
}

export function profileCurve(f: ProfileFields): Omit<CurveCut, 'id'> {
  const segs = canonical(f).map((s): CurveSegment => {
    if (f.facing === 'v') return s as CurveSegment;
    const to: [number, number] = [s.to[1], s.to[0]];
    return (s.type === 'line' ? { type: 'line', to } : { type: 'arc', to, side: s.side === 'left' ? 'right' : 'left', radius: s.radius }) as CurveSegment;
  });
  return { through: f.through, uFrom: f.uFrom, vFrom: f.vFrom, start: [0, 0], segments: segs };
}

/** A profile whose two faces are not interchangeable: its row shows Facing. */
export function profileAsymmetric(f: Pick<ProfileFields, 'kind' | 'fillet'>): boolean {
  return f.kind === 'ogee' || f.kind === 'bead' || f.kind === 'thumbnail' || (f.fillet ?? 0) > 0;
}

const ORDER: ProfileKind[] = ['roundover', 'cove', 'ogee', 'bead', 'thumbnail'];

/** Candidate fields lifted from canonical points (`to` of each segment) and the arcs' radii, or null. Lifting decides
 *  nothing: the caller rewrites and compares exactly. */
function lift(kind: ProfileKind, to: [number, number][], segs: CurveSegment[]): Pick<ProfileFields, 'size' | 'depth' | 'fillet'> | null {
  const radius = (i: number) => { const s = segs[i]; return s && s.type === 'arc' && s.radius !== undefined ? s.radius : null; };
  const at = (i: number, k: 0 | 1) => to[i]?.[k] ?? null;
  switch (kind) {
    case 'roundover':
    case 'cove': { const r = radius(1); return r === null ? null : { size: r, fillet: segs.length === 4 ? at(1, 0) ?? 0 : 0 }; }
    case 'ogee': { const h = radius(1); return h === null ? null : { size: 2 * h, fillet: segs.length === 5 ? at(2, 0) ?? 0 : 0 }; }
    case 'bead': { const r = radius(3); const k = at(1, 1); return r === null || k === null ? null : { size: r, fillet: k }; }
    case 'thumbnail': { const a = at(0, 0); const d = at(1, 1); return segs.length === 3 && radius(1) !== null && a !== null && d !== null ? { size: a, depth: d } : null; }
  }
}

/**
 * A stored curve's profile, or null (spec §2.3): for each facing and kind, lift the parameters from the stored points,
 * rewrite them with `profileCurve`, and accept only an EXACT match (`sameCurve`). Never a profile through the thickness
 * (R3: that is a Curves Rounded corner). A symmetric profile reads at facing 'v' first.
 */
export function profileFields(c: Omit<CurveCut, 'id'>): ProfileFields | null {
  if (c.through === 'thickness' || c.start[0] !== 0 || c.start[1] !== 0) return null;
  const through = c.through;
  // A view curve's span (P18) is no part of the outline: the recogniser compares the stored fields only.
  const bare = spanOf(c) ? (({ span: _span, ...rest }) => rest)(c as ViewCurve) : c;
  for (const facing of ['v', 'u'] as const) {
    const to = c.segments.map((s): [number, number] => (facing === 'v' ? [s.to[0], s.to[1]] : [s.to[1], s.to[0]]));
    for (const kind of ORDER) {
      const p = lift(kind, to, c.segments);
      if (!p || !(p.size > 0) || (p.depth !== undefined && !(p.depth > 0 && p.depth < p.size)) || (p.fillet ?? 0) < 0) continue;
      if (kind === 'bead' && !((p.fillet ?? 0) > 0)) continue;
      const f: ProfileFields = { through, uFrom: c.uFrom, vFrom: c.vFrom, kind, facing, size: p.size,
        ...(p.depth !== undefined ? { depth: p.depth } : {}), ...(kind === 'thumbnail' ? {} : { fillet: p.fillet ?? 0 }) };
      if (sameCurve(profileCurve(f), bare)) return f;
    }
  }
  return null;
}

export const DEFAULT_PROFILE_EDGE: ProfileEdge = { through: 'length', uFrom: 'max', vFrom: 'max' };
const BASE: Record<ProfileKind, Pick<ProfileFields, 'size' | 'depth' | 'fillet'>> = {
  roundover: { size: 0.25, fillet: 0 }, cove: { size: 0.375, fillet: 0 }, ogee: { size: 0.5, fillet: 0 },
  bead: { size: 0.25, fillet: 0.0625 }, thumbnail: { size: 0.75, depth: 0.25 },
};
/** The profile's extents along the canonical a (top face) and b (edge face) axes. */
function extents(kind: ProfileKind, p: Pick<ProfileFields, 'size' | 'depth' | 'fillet'>): [number, number] {
  const fl = p.fillet ?? 0;
  if (kind === 'thumbnail') return [p.size, p.depth!];
  return [p.size + fl, p.size + (kind === 'bead' ? fl : 0)];
}
/**
 * A preset (spec §2.3): router-bit sizes, the top long edge by default, every length scaled by ONE factor so each canonical
 * extent fits half the dimension it runs along (amended in planning: per axis, so a thumbnail's reach along a 20" top is not
 * shrunk by the 3/4" thickness). Exact sizes when no scaling is needed (k = 1 multiplies nothing).
 */
export function defaultProfile(board: Pick<Board, Dimension>, kind: ProfileKind, edge: ProfileEdge = DEFAULT_PROFILE_EDGE, facing: 'u' | 'v' = 'v'): Omit<CurveCut, 'id'> {
  const [u, v] = uvDims(edge.through);
  const [aDim, bDim] = facing === 'v' ? [u, v] : [v, u];
  const base = BASE[kind];
  const [ea, eb] = extents(kind, base);
  const k = Math.min(1, board[aDim] / 2 / ea, board[bDim] / 2 / eb);
  const s = (n: number | undefined) => (n === undefined ? undefined : k === 1 ? n : n * k);
  return profileCurve({ ...edge, kind, facing, size: s(base.size)!,
    ...(base.depth !== undefined ? { depth: s(base.depth) } : {}), ...(base.fillet !== undefined ? { fillet: s(base.fillet) } : {}) });
}

/** Every ProfileCut field but `id`, compared exactly (invariant 40's table, checked against the type). */
export const PROFILE_FIELDS = {
  face: true, kind: true, size: true, depth: true, fillet: true, facing: true, run: true,
} as const satisfies Record<Exclude<keyof ProfileCut, 'id'>, true>;
const PROFILE_KEYS = Object.keys(PROFILE_FIELDS) as (keyof typeof PROFILE_FIELDS)[];
const pnum = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
const endText = (e: ProfileEnd) => `${e.side.across}:${e.side.from}:${'through' in e ? `t${e.through}` : `${e.from}${pnum(e.at)}`}`;

/** One profile's comparable value, exact, in PROFILE_KEYS order (a shape's grouping signature reads it). */
export function profileValues(p: Omit<ProfileCut, 'id'>): string {
  return PROFILE_KEYS.map((k) => {
    if (k === 'run') return 'loop' in p.run ? 'loop' : `${endText(p.run.start)}>${endText(p.run.end)}`;
    const v = p[k];
    return v === undefined ? '-' : typeof v === 'number' ? pnum(v) : v;
  }).join('|');
}
type Idless = Omit<ProfileCut, 'id'> & { id?: string };
export const sameProfile = (a: Idless, b: Idless): boolean => profileValues(a) === profileValues(b);

/** A deep copy: no two parts ever hold one run or side object. */
export function copyProfile(p: ProfileCut): ProfileCut {
  const end = (e: ProfileEnd): ProfileEnd => ('through' in e ? { side: { ...e.side }, through: e.through } : { side: { ...e.side }, from: e.from, at: e.at });
  return { ...p, run: 'loop' in p.run ? { loop: true } : { start: end(p.run.start), end: end(p.run.end) } };
}

type ThroughEnd = { side: ProfileSide; through: CutFrom };
/** A chunk-1 run: out through both end faces of one side (spec P3). */
export function endToEnd(run: ProfileCut['run']): run is { start: ThroughEnd; end: ThroughEnd } {
  return !('loop' in run) && 'through' in run.start && 'through' in run.end
    && run.start.side.across === run.end.side.across && run.start.side.from === run.end.side.from;
}

/** The dimension a side runs along: a side at width's end runs along the length, and the reverse. */
export const runDim = (side: ProfileSide): 'length' | 'width' => (side.across === 'width' ? 'length' : 'width');
/**
 * The direction a run travels along its side (profile runs spec P11): +1 toward the run dimension's max end. It flips with
 * the side's `from` and with `face`, never with the run, so every reflection reverses it (mirrorProfile swaps the ends to match).
 */
export function travelSign(face: CutFrom, side: ProfileSide): 1 | -1 {
  const base = side.across === 'width' ? (side.from === 'min' ? 1 : -1) : side.from === 'max' ? 1 : -1;
  return (face === 'max' ? base : -base) as 1 | -1;
}
/** An end's local position along its side's run dimension (the one place a station is read as a coordinate, inv 44). */
export function endPos(board: Pick<Board, Dimension>, e: ProfileEnd): number {
  const L = board[runDim(e.side)];
  if ('through' in e) return e.through === 'min' ? 0 : L;
  return e.from === 'min' ? e.at : L - e.at;
}
/** Both ends on one side (chunk a2 builds these; a loop or two sides refuse on load). */
export function oneSide(run: ProfileRun): run is { start: ProfileEnd; end: ProfileEnd } {
  return !('loop' in run) && run.start.side.across === run.end.side.across && run.start.side.from === run.end.side.from;
}
/** The stored order (P11): End to end min → max (P3); a station run with start before end along `travelSign`. */
export function canonicalRun(board: Pick<Board, Dimension>, face: CutFrom, run: { start: ProfileEnd; end: ProfileEnd }): { start: ProfileEnd; end: ProfileEnd } {
  if (endToEnd(run)) {
    return run.start.through === 'min' ? run : { start: { ...run.end, side: { ...run.end.side } }, end: { ...run.start, side: { ...run.start.side } } };
  }
  const s = travelSign(face, run.start.side);
  const before = (endPos(board, run.start) - endPos(board, run.end)) * s <= 0;
  return before ? run : { start: run.end, end: run.start };
}

/**
 * An End to end profile as chunk 1's fields. Through the length or width, `uvDims(through)` is [u, 'thickness']: the face is
 * `vFrom`, the side is u at `uFrom`, and facing 'face' is chunk 1's 'v' (T on the broad face). A symmetric kind is written at
 * 'v', as chunk 1's writers did. Throws on a run chunk a1 cannot build (the loader refuses those, spec P2).
 */
export function profileToFields(p: Omit<ProfileCut, 'id'>): ProfileFields {
  // A swept run (profile runs b1: a loop; b2: ends on two sides) has no chunk-1 fields: the view never passes one here.
  if (!oneSide(p.run)) throw new Error('profileToFields: a loop or a run on two sides is swept, never a chunk-1 curve');
  const side = p.run.start.side;
  const f: ProfileFields = {
    through: side.across === 'width' ? 'length' : 'width', uFrom: side.from, vFrom: p.face, kind: p.kind, facing: 'v', size: p.size,
    ...(p.depth !== undefined ? { depth: p.depth } : {}), ...(p.fillet !== undefined ? { fillet: p.fillet } : {}),
  };
  return profileAsymmetric(f) && p.facing === 'edge' ? { ...f, facing: 'u' } : f;
}

/** Chunk 1's fields as a stored End to end profile (the inverse of profileToFields). */
export function profileFromFields(f: ProfileFields): Omit<ProfileCut, 'id'> {
  const [u] = uvDims(f.through) as ['length' | 'width', Dimension];
  const side: ProfileSide = { across: u, from: f.uFrom };
  return {
    face: f.vFrom, kind: f.kind, size: f.size,
    ...(f.depth !== undefined ? { depth: f.depth } : {}), ...(f.kind === 'thumbnail' ? {} : { fillet: f.fillet ?? 0 }),
    facing: profileAsymmetric(f) && f.facing === 'u' ? 'edge' : 'face',
    run: { start: { side, through: 'min' }, end: { side: { ...side }, through: 'max' } },
  };
}

/** THE profile → geometry step (spec P4): the exact CurveCut chunk 1 stored for this profile, with its id. */
export function profileAsCurve(p: ProfileCut): CurveCut {
  return { id: p.id, ...profileCurve(profileToFields(p)) };
}

/** A stored curve's profile (the migration's reader, spec §3.2), or null when it is not one. */
export function profileOf(c: Omit<CurveCut, 'id'>): Omit<ProfileCut, 'id'> | null {
  const f = profileFields(c);
  return f ? profileFromFields(f) : null;
}

const flip = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');
/**
 * A profile reflected along `d` (invariant 44): flag flips only. `face` flips through the thickness; a side's `from` when its
 * `across` is `d`. A run travels counter-clockwise seen looking at `face` from outside the part, and EVERY reflection reverses
 * that travel, so a station run's start and end swap for all three dimensions: along the run dimension each end's `from` also
 * flips; along the side's `across` the run lands on the opposite side; through the thickness it moves to the other face, where
 * the same outline reads reversed. An End to end run keeps min→max (a full side has no travel to reverse, spec P3), and a loop
 * is unchanged apart from `face` (chunk a2 builds station runs).
 */
export function mirrorProfile(p: ProfileCut, d: Dimension): ProfileCut {
  if ('loop' in p.run) return d === 'thickness' ? { ...p, face: flip(p.face) } : p;
  if (d === 'thickness') return { ...p, face: flip(p.face), run: endToEnd(p.run) ? p.run : { start: p.run.end, end: p.run.start } };
  const side = (s: ProfileSide): ProfileSide => (s.across === d ? { ...s, from: flip(s.from) } : s);
  if (endToEnd(p.run)) return { ...p, run: { start: { ...p.run.start, side: side(p.run.start.side) }, end: { ...p.run.end, side: side(p.run.end.side) } } };
  const end = (e: ProfileEnd): ProfileEnd => {
    const runDim = e.side.across === 'width' ? 'length' : 'width';
    if (d !== runDim) return { ...e, side: side(e.side) };
    return 'through' in e ? { side: side(e.side), through: flip(e.through) } : { side: side(e.side), from: flip(e.from), at: e.at };
  };
  return { ...p, run: { start: end(p.run.end), end: end(p.run.start) } };
}

/**
 * A stopped profile's extent along its run dimension (P18): lo and hi from `endPos` (THE station → coordinate), a stop flag
 * where that end is a station. Undefined for End to end, and for a run chunk a2 does not build. The geometry is symmetric in
 * the run, so the canonical order never matters here.
 */
export function profileSpan(board: Pick<Board, Dimension>, p: ProfileCut): CurveSpan | undefined {
  if (endToEnd(p.run) || !oneSide(p.run)) return undefined;
  const a = endPos(board, p.run.start);
  const b = endPos(board, p.run.end);
  const [lo, hi] = a <= b ? [p.run.start, p.run.end] : [p.run.end, p.run.start];
  return { lo: Math.min(a, b), hi: Math.max(a, b), stopLo: !('through' in lo), stopHi: !('through' in hi) };
}

export type ProfileFault = { kind: 'stop-off' } | { kind: 'overlap'; other: string } | { kind: 'runs-off' } | { kind: 'too-tight' };
/** A one-side run's extent along its side, End to end included ([0, L]); null for a run chunk a2 does not build. */
function extentOf(board: Pick<Board, Dimension>, p: ProfileCut): [number, number] | null {
  if (!oneSide(p.run)) return null;
  const a = endPos(board, p.run.start);
  const b = endPos(board, p.run.end);
  return [Math.min(a, b), Math.max(a, b)];
}
const OVERLAP_EPS = 1e-9;
type FaultBoard = Pick<Board, Dimension> & { curves?: readonly CurveCut[]; profiles: readonly ProfileCut[] };
const NO_CURVES: readonly CurveCut[] = Object.freeze([]);
const withCurves = (b: FaultBoard): Pick<Board, Dimension | 'curves'> & { profiles: readonly ProfileCut[] } => (b.curves ? (b as Pick<Board, Dimension | 'curves'> & { profiles: readonly ProfileCut[] }) : { ...b, curves: NO_CURVES as CurveCut[] });
/** A profile's two extents (canonical a along T, b down the other face), as stored: [reach in plan, depth down the edge]. */
export function reachDepth(p: Omit<ProfileCut, 'id'>): [number, number] {
  const [ea, eb] = extents(p.kind, p);
  return p.facing === 'edge' ? [eb, ea] : [ea, eb];
}
/**
 * The plan outline a profile covers (Q6: overlap on outline stretches), per outline chord index: the chord parameter
 * interval [t0, t1] it covers. A SWEPT profile's comes from its PATH (`ProfilePath.cover`: a loop every chord, an End to
 * end run its stretch, trimmed at a B1a mitre), the one source of truth; null when it has no path. A straight or station
 * run (a2's construction) covers the part of its side's STRAIGHT chords (no curve's: a2's prism follows none, I2) whose
 * run-dimension coordinate lies within its extent (B2: stations are measured along the run dimension). Null when the
 * stretch cannot be traced.
 */
function coverage(board: Pick<Board, Dimension | 'curves'> & { profiles: readonly ProfileCut[] }, outline: FaceOutline, p: ProfileCut): Map<number, [number, number]> | null {
  const out = new Map<number, [number, number]>();
  if (isSwept(board, p)) {
    const path = profilePath(board, p);
    if (!path) return null;
    for (const c of path.cover) out.set(c.chord, [c.t0, c.t1]);
    return out;
  }
  if (!oneSide(p.run)) return null;
  const side = p.run.start.side;
  const s = sideStretch(board, outline, side);
  if (!s) return null;
  const [lo, hi] = extentOf(board, p)!;
  const k = runDim(side) === 'length' ? 0 : 1;
  const n = outline.chords.length;
  for (let i = s.from; ; i = (i + 1) % n) {
    const c: OutlineChord = outline.chords[i]!;
    // I2 (final review, the controller's ruling): a2's prism follows no curve, so a station run claims only the straight
    // side chords of its stretch — never a corner arc's or an arch's, where its prism cuts only the curve's waste.
    if (c.curve !== undefined) { if (i === s.to) break; continue; }
    const xa = c.a[k]!, xb = c.b[k]!;
    let t0: number, t1: number;
    if (xa === xb) { if (xa < lo || xa > hi) { if (i === s.to) break; continue; } t0 = 0; t1 = 1; }
    else {
      const ta = (lo - xa) / (xb - xa), tb = (hi - xa) / (xb - xa);
      t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(1, Math.max(ta, tb));
    }
    if (t1 > t0) out.set(i, [t0, t1]);
    if (i === s.to) break;
  }
  return out;
}
/** The length two coverages share on the outline. */
function sharedLength(outline: FaceOutline, a: Map<number, [number, number]>, b: Map<number, [number, number]>): number {
  let sum = 0;
  for (const [i, [a0, a1]] of a) {
    const r = b.get(i);
    if (!r) continue;
    const t = Math.min(a1, r[1]) - Math.max(a0, r[0]);
    if (t <= 0) continue;
    const c = outline.chords[i]!;
    sum += t * Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
  }
  return sum;
}
/**
 * THE profile fault decider (P12, P13, Q6): `stop-off` when a station lies at or past an end of its side, or the span is
 * empty or reversed (lo >= hi); `overlap` once for each OTHER profile on the same face that fights for its wood. Two
 * profiles neither of which is swept keep a2's rule exactly: the same side, extents overlapping by more than 1e-9
 * (touching is not overlap; an End to end profile spans the whole side). A pair with a SWEPT profile (`isSwept`) is judged
 * on outline coverage (from the swept profile's PATH): they share more than 1e-9 of length (a loop covers everything; two
 * End to end profiles meeting in a B1a mitre at a shared corner arc's midpoint only touch). A run-out past
 * the end is no fault (P13): only the stations are judged.
 * A SWEPT profile also faults `runs-off` (its reach over half the face's smaller dimension, its depth over the thickness, or
 * no path: `profilePath` null) and `too-tight` (an arc of its path: convex with a radius under the reach, R10; concave — bowing into
 * the wood — under the bearing's `BEARING`, B5; touching is not tight). A straight profile keeps chunk 1's prism faults
 * (`curveFaults` on its view curve), so its fault list is a2's byte for byte. Judged on the STORED part (curves included).
 */
export function profileFaults(board: FaultBoard, p: ProfileCut): ProfileFault[] {
  const out: ProfileFault[] = [];
  const stored = withCurves(board);
  const swept = isSwept(stored, p);
  if (swept) {
    const [reach, depth] = reachDepth(p);
    const path = profilePath(stored, p);
    // b1 Task 3: a path whose plan chain cannot be built has no wood to build (runs-off); one whose skeleton swallows an
    // END chord before the reach is too tight (the skeleton's null, never a throw).
    const chain = path ? planChain(stored, path, p.face) : null;
    const runsOff = !path || !chain || reach > Math.min(board.length, board.width) / 2 || depth > board.thickness;
    if (runsOff) out.push({ kind: 'runs-off' });
    const arcTight = !!path && path.chords.some((c) => c.arc && (c.arc.concave ? c.arc.r < BEARING : c.arc.r < reach));
    if (arcTight || (!runsOff && !pathSkeleton(chain!.chords, chain!.loop, reach, chain!.rays))) out.push({ kind: 'too-tight' });
  }
  if (oneSide(p.run)) {
    const run = p.run;
    const L = board[runDim(run.start.side)];
    const station = (e: ProfileEnd) => !('through' in e) && (endPos(board, e) <= 0 || endPos(board, e) >= L);
    const [lo, hi] = extentOf(board, p)!;
    if (station(run.start) || station(run.end) || lo >= hi) out.push({ kind: 'stop-off' });
  }
  let outline: FaceOutline | null | undefined;
  let mine: Map<number, [number, number]> | null | undefined;
  for (const q of board.profiles) {
    if (q === p || q.id === p.id || q.face !== p.face) continue;
    if (!swept && !isSwept(stored, q)) {
      // a2's rule, exactly.
      if (!oneSide(p.run) || !oneSide(q.run)) continue;
      const side = p.run.start.side;
      if (q.run.start.side.across !== side.across || q.run.start.side.from !== side.from) continue;
      const [lo, hi] = extentOf(board, p)!;
      const [qlo, qhi] = extentOf(board, q)!;
      if (Math.min(hi, qhi) - Math.max(lo, qlo) > OVERLAP_EPS) out.push({ kind: 'overlap', other: q.id });
      continue;
    }
    if (outline === undefined) outline = faceOutline(stored);
    if (!outline) continue;   // no traceable outline: the swept profile is runs-off and builds nothing
    if (mine === undefined) mine = coverage(stored, outline, p);
    const theirs = coverage(stored, outline, q);
    if (mine && theirs && sharedLength(outline, mine, theirs) > OVERLAP_EPS) out.push({ kind: 'overlap', other: q.id });
  }
  return out;
}

const views = new WeakMap<object, object>();
/** Each geometry view's profile curve, or swept profile → the part it was built from and its stored profile (one home:
 *  `geometryBoard`). A swept profile in the view is the view's own copy, so no two parts ever share an entry. */
const viewSources = new WeakMap<object, { board: FaultBoard; profile: ProfileCut }>();
/**
 * The stored profile's faults for a curve of a geometry view, or a swept profile of one (`view.profiles`), or none for
 * anything else. The words read the view; the faults are judged on the STORED profile and the original part (its curves
 * and other profiles), never re-derived from the view.
 */
export function viewProfileFaults(c: object): ProfileFault[] {
  const src = viewSources.get(c);
  return src ? profileFaults(src.board, src.profile) : [];
}
/**
 * THE geometry view (profile runs spec P4, Q1). Every reader that turns a part into geometry, words or faults reads this:
 * the part's curves, then each STRAIGHT profile as the CurveCut chunk 1 stored; its `profiles` holds exactly the SWEPT
 * ones (`isSwept`, judged on the stored part), in stored order, each the view's own copy. The SAME object when the part
 * has no profiles; else one memoised object per part, memoised to itself, so a second call returns it unchanged. A part
 * with no swept profile has `profiles: []`, exactly as a1/a2 built it.
 */
export function geometryBoard<T extends Pick<Board, Dimension | 'curves'> & { profiles?: readonly ProfileCut[] }>(b: T): T {
  if (!b.profiles || b.profiles.length === 0) return b;
  const hit = views.get(b);
  if (hit) return hit as T;
  const dims = b as T & { profiles: readonly ProfileCut[] };
  const asCurve = (p: ProfileCut): ViewCurve => {
    const span = profileSpan(dims, p);
    const c: ViewCurve = { ...profileAsCurve(p), ...(span ? { span } : {}) };
    viewSources.set(c, { board: dims, profile: p });
    return c;
  };
  const curves: CurveCut[] = [...b.curves];
  const swept: ProfileCut[] = [];
  for (const p of dims.profiles) {
    if (isSwept(b, p)) {
      const vp = { ...p };
      viewSources.set(vp, { board: dims, profile: p });
      swept.push(vp);
    } else curves.push(asCurve(p));
  }
  const view = { ...b, curves, profiles: swept } as T;
  views.set(b, view);
  views.set(view, view);
  return view;
}

/** THE routing predicate (Q1): a part is SHAPED — routed to the curved builders, edges, mesh and drawings — when its
 *  geometry view holds a curve or a swept profile. Replaces every `curves.length === 0` routing gate. */
export const shapedPart = (v: { curves: readonly unknown[]; profiles?: readonly unknown[] }): boolean =>
  v.curves.length > 0 || (v.profiles?.length ?? 0) > 0;

const NO_SWEPT: readonly ProfileCut[] = Object.freeze([]);
/** A part's swept profiles: its geometry view's `profiles` (none for a part with no profiles). Safe on a stored part or a
 *  view alike (geometryBoard is idempotent and memoised). */
export function sweptProfiles(b: Pick<Board, Dimension | 'curves'> & { profiles?: readonly ProfileCut[] }): readonly ProfileCut[] {
  return geometryBoard(b).profiles ?? NO_SWEPT;
}
