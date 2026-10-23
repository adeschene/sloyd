import type { Board, CurveCut, CurveSegment, CutFrom, Dimension, ProfileCut, ProfileEnd, ProfileKind, ProfileRun, ProfileSide } from './types';
import { curveFaults, sameCurve, spanOf, uvDims, type CurveSpan, type ViewCurve } from './curves';
import { faceOutline, isSwept, profilePath, sideStretch, stationPoint, throughConsistent, type FaceOutline, type OutlineChord, type Opts as PathOpts } from './profilePath';
import { BEARING } from './runout';
import { pathSkeleton, planChain } from './skeleton';
import { bandReach, keptSection } from './sweep';

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
/** The bench word of each kind, as it reads mid-sentence (Refine's change list): the ONE home of the words; a proper noun keeps its capital. */
export const PROFILE_KIND_WORD: Record<ProfileKind, string> = { roundover: 'roundover', cove: 'cove', ogee: 'Roman ogee', bead: 'bead', thumbnail: 'thumbnail' };
/** The same words as the Profiles panel's labels: the first letter capitalised. */
export const PROFILE_KIND_LABEL: Record<ProfileKind, string> = Object.fromEntries(
  PROFILE_KINDS.map((k) => [k, PROFILE_KIND_WORD[k].charAt(0).toUpperCase() + PROFILE_KIND_WORD[k].slice(1)])) as Record<ProfileKind, string>;
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
export const PROFILE_KEYS = Object.keys(PROFILE_FIELDS) as (keyof typeof PROFILE_FIELDS)[];
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
/** The stored order (P11): End to end min → max (P3); a station run with start before end along `travelSign`. A run with
 *  ends on two sides is never re-ordered (Q16: it travels from Start to Stop as stored). */
export function canonicalRun(board: Pick<Board, Dimension>, face: CutFrom, run: { start: ProfileEnd; end: ProfileEnd }): { start: ProfileEnd; end: ProfileEnd } {
  if (!oneSide(run)) return run;
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
type CurvedFaultBoard = Pick<Board, Dimension | 'curves'> & { profiles: readonly ProfileCut[] };
/** A fault board with a `curves` key: the board itself when it has one, else ONE derived copy per board object (Task 6, the
 *  Task 3 review's M5: a fresh copy per call missed every per-part memo keyed on it — paths, outline, stops, skeletons). */
const curvedCopies = new WeakMap<object, CurvedFaultBoard>();
const withCurves = (b: FaultBoard): CurvedFaultBoard => {
  if (b.curves) return b as CurvedFaultBoard;
  let c = curvedCopies.get(b);
  if (!c) { c = { ...b, curves: NO_CURVES as CurveCut[] }; curvedCopies.set(b, c); }
  return c;
};
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
function coverage(board: Pick<Board, Dimension | 'curves'> & { profiles: readonly ProfileCut[] }, outline: FaceOutline, p: ProfileCut, swept = isSwept(board, p), opts?: PathOpts): Map<number, [number, number]> | null {
  const out = new Map<number, [number, number]>();
  if (swept) {
    const path = profilePath(board, p, opts);
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
 * `opts.straight` judges `p` in its STRAIGHT form (the chunk 1/a2 view curve it would be if it were not swept: I1's
 * "straight faults"), the other profiles still by their shape (`isSwept`), so no judgement depends on another's fallback;
 * for a profile that is not swept-shaped it changes nothing.
 * Memoised (final review M1) for a STORED part whose geometry view exists and one of its own stored profiles: the view's
 * fault cache, filled by `geometryBoard`, keyed on the view as `sweep.ts` keys its pieces; the result is deep-frozen. Any
 * other part (a panel's trial `after`, a view itself) is judged afresh.
 */
export function profileFaults(board: FaultBoard, p: ProfileCut, opts?: { straight?: boolean }): readonly ProfileFault[] {
  const straight = !!opts?.straight;
  const view = views.get(board);
  const cache = view && view !== board ? faultCaches.get(view)?.get(p) : undefined;
  if (!cache) return straight ? judge(board, p, true) : withHarm(board, p, judge(board, p, false));
  return straight ? (cache.straight ??= frozenFaults(judge(board, p, true))) : (cache.judged ??= frozenFaults(withHarm(board, p, judge(board, p, false))));
}
/** A fault's identity (kind, and the other profile for an overlap): `withHarm` adds each one once. */
const faultKey = (f: ProfileFault) => (f.kind === 'overlap' ? `overlap:${f.other}` : f.kind);
/** `faults` (a swept judgement of `p`) with the faults its FOLLOWING causes in its neighbours (`harmFaults`), each once. */
function withHarm(board: FaultBoard, p: ProfileCut, faults: ProfileFault[]): ProfileFault[] {
  const seen = new Set(faults.map(faultKey));
  for (const f of harmFaults(board, p)) if (!seen.has(faultKey(f))) { seen.add(faultKey(f)); faults.push(f); }
  return faults;
}
const harmMemo = new WeakMap<object, Map<ProfileCut, readonly ProfileFault[]>>();
/**
 * Q10 extended (Task 3 fix round 1, the controller's ruling I2): a stop that follows must never change a neighbour's build.
 * For a swept-shaped one-side STATION run `q`, the faults its following ADDS to the other profiles on its face: each
 * neighbour judged in phase 1 with `q` ALONE following — every other one-side station run read as fallen back (straight,
 * no B1a partner: `without`) — against phase 1 with every station run read so (b1's view: a1/a2 built every station run
 * straight). Measured against that baseline, never against the other stops' shapes, so two stops that only TOGETHER would
 * change a neighbour (each mitring one of its corners) are each charged with it. A fault naming `q` itself (their
 * overlap) is `q`'s own already. Phase 1 only — no fallback depends on another's and nothing cycles. Empty for any other
 * run. Memoised per part object, frozen.
 */
function harmFaults(board: FaultBoard, q: ProfileCut): readonly ProfileFault[] {
  if (!oneSide(q.run) || endToEnd(q.run)) return NO_FAULTS;
  let m = harmMemo.get(board);
  if (!m) { m = new Map(); harmMemo.set(board, m); }
  const hit = m.get(q);
  if (hit) return hit;
  const out: ProfileFault[] = [];
  if (isSwept(withCurves(board), q)) {
    const all = stationRuns(board), others = new Set([...all].filter((x) => x !== q));
    for (const r of board.profiles) {
      if (r === q || r.id === q.id || r.face !== q.face) continue;
      const before = new Set(judge(board, r, false, true, all).map(faultKey));
      for (const f of judge(board, r, false, true, others)) {
        if ((f.kind === 'overlap' && f.other === q.id) || before.has(faultKey(f))) continue;
        if (!out.some((g) => faultKey(g) === faultKey(f))) out.push(f);
      }
    }
  }
  const frozen = frozenFaults(out);
  m.set(q, frozen);
  return frozen;
}
const NO_FAULTS: readonly ProfileFault[] = Object.freeze([]);
const stationMemo = new WeakMap<object, ReadonlySet<ProfileCut>>();
/** A part's one-side STATION runs (what a1/a2 built straight), one set object per part (the path memo keys on it). */
function stationRuns(board: FaultBoard): ReadonlySet<ProfileCut> {
  let s = stationMemo.get(board);
  if (!s) { s = new Set(board.profiles.filter((x) => oneSide(x.run) && !endToEnd(x.run))); stationMemo.set(board, s); }
  return s;
}
/**
 * One judgement (above). `phase1` (Q10, profile runs b2): every other profile read by its SHAPE and every path by STORED
 * presence (b1's rule) — the judgement `stopFallsBack` decides a stop's fallback by, so no fallback depends on another's.
 * Otherwise (phase 2, what `profileFaults` returns) a one-side station run that falls back is read STRAIGHT (a2's rule
 * beside a straight profile, else its I2 coverage), and takes no B1a mitre (`neighbourTakes`) — except `p` itself, read as
 * present by the others' paths (its swept judgement asks what it would claim if it followed). `without` (phase 1 only,
 * `harmFaults`): those profiles read as fallen back — straight, and no B1a partner.
 */
function judge(board: FaultBoard, p: ProfileCut, straight: boolean, phase1 = false, without?: ReadonlySet<ProfileCut>): ProfileFault[] {
  const out: ProfileFault[] = [];
  const stored = withCurves(board);
  const popts: PathOpts | undefined = phase1 ? { presence: true, ...(without ? { without } : {}) } : undefined;
  const swept = !straight && isSwept(stored, p);
  // stop-off (P12; b2: Q16, Q17), decided first: a two-side run whose path is null for its own ends is stop-off, never runs-off.
  let stopOff = false;
  if (oneSide(p.run)) {
    const run = p.run;
    const L = board[runDim(run.start.side)];
    const station = (e: ProfileEnd) => !('through' in e) && (endPos(board, e) <= 0 || endPos(board, e) >= L);
    const [lo, hi] = extentOf(board, p)!;
    stopOff = station(run.start) || station(run.end) || lo >= hi;
  } else if (!('loop' in p.run)) {
    // b2, a run with ends on two sides: a station at or past an end of its side (a2's rule), or off its side's stretch; an
    // inconsistent through end (Q17); or — the outline traced — no path (the two ends one point, or a walk re-entering a
    // side: Q16 as ruled, M-d).
    const run = p.run as { start: ProfileEnd; end: ProfileEnd };
    const outline = faceOutline(stored);
    const atEnd = (e: ProfileEnd) => !('through' in e) && (endPos(board, e) <= 0 || endPos(board, e) >= board[runDim(e.side)]);
    const offStretch = (e: ProfileEnd) => !('through' in e) && !!outline && !stationPoint(stored, outline, e.side, endPos(board, e));
    stopOff = atEnd(run.start) || atEnd(run.end) || !throughConsistent(p) || offStretch(run.start) || offStretch(run.end)
      || (!!outline && profilePath(stored, p, popts) === null);
  }
  if (swept) {
    const [reach, depth] = reachDepth(p);
    const path = profilePath(stored, p, popts);
    // b2 (Q13): the skeleton reads the JUDGED path (each stop's end-chord zone); for a loop or End to end it is the path.
    const b2 = !('loop' in p.run) && !endToEnd(p.run);
    const judged = b2 && path ? profilePath(stored, p, { ...popts, snap: true }) : path;
    // b1 Task 3: a path whose plan chain cannot be built has no wood to build (runs-off); one whose skeleton swallows an
    // END chord before the reach is too tight (the skeleton's null, never a throw).
    const chain = judged ? planChain(stored, judged, p.face) : null;
    const runsOff = (!path && !stopOff) || (!!judged && !chain) || reach > Math.min(board.length, board.width) / 2 || depth > board.thickness;
    if (runsOff) out.push({ kind: 'runs-off' });
    // R10/B5 on the PATH's arcs only (Q15); b2 (the Task 2 review, I2): a stop never silently builds nothing — a path whose
    // judged or built path is null (the zone moved both ends onto one vertex) is too tight.
    const arcTight = !!path && path.chords.some((c) => c.arc && (c.arc.concave ? c.arc.r < BEARING : c.arc.r < reach));
    const vanishes = b2 && !!path && (!judged || !profilePath(stored, p, { ...popts, build: true }));
    // Fix round 1 (I1): the PLAN the build makes (sweptPlan: the built path, the band's reach — a bead's quirk wall adds
    // WALL_MARGIN) must exist too; a swept profile whose plan is null builds nothing, so it is too tight, never clean.
    const builds = () => {
      const built = profilePath(stored, p, { ...popts, build: true });
      const bc = built ? planChain(stored, built, p.face) : null;
      return !!bc && skeletonFits(board, bc, bandReach(keptSection(stored, p)));
    };
    if (arcTight || vanishes || (!runsOff && !!chain && (!skeletonFits(board, chain, reach) || !builds()))) out.push({ kind: 'too-tight' });
  }
  if (stopOff) out.push({ kind: 'stop-off' });
  let outline: FaceOutline | null | undefined;
  let mine: Map<number, [number, number]> | null | undefined;
  for (const q of board.profiles) {
    if (q === p || q.id === p.id || q.face !== p.face) continue;
    // Q10: a fallen-back stop is read straight (never in phase 1, where the fallbacks are being decided).
    const qSwept = isSwept(stored, q) && !without?.has(q) && (phase1 || !stopFallsBack(board, q));
    if (!swept && !qSwept) {
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
    if (mine === undefined) mine = coverage(stored, outline, p, swept, popts);
    const theirs = coverage(stored, outline, q, qSwept, phase1 ? popts : { keep: p });
    if (mine && theirs && sharedLength(outline, mine, theirs) > OVERLAP_EPS) out.push({ kind: 'overlap', other: q.id });
  }
  return out;
}

/** Whether the path's offset survives to the reach (the skeleton's null is too tight), memoised per part object on the
 *  chain's content: Q10's two phases judge one stop's path twice, usually the same path (b2 Task 3, Step 5b). */
const skeletonMemo = new WeakMap<object, Map<string, boolean>>();
function skeletonFits(board: object, chain: NonNullable<ReturnType<typeof planChain>>, reach: number): boolean {
  let m = skeletonMemo.get(board);
  if (!m) { m = new Map(); skeletonMemo.set(board, m); }
  // Task 6: the key holds exactly what `pathSkeleton` reads — each chord's two ends, never its curve id or arc (the JSON
  // of those was ~20% of a fresh trial part's profileFaults) — every number in its exact round-trip form.
  let key = `${reach}|${chain.loop}|${chain.rays ? chain.rays.join(',') : ''}|`;
  for (const c of chain.chords) key += `${c.a[0]},${c.a[1]},${c.b[0]},${c.b[1]};`;
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const ok = !!pathSkeleton(chain.chords, chain.loop, reach, chain.rays);
  m.set(key, ok);
  return ok;
}

const views = new WeakMap<object, object>();
/** Per geometry view, each of its part's STORED profiles' faults as judged (`profileFaults`) and in their straight form
 *  (`opts.straight`), filled lazily or by `geometryBoard`'s fallback decision; deep-frozen (final review M1, and M2:
 *  `builtSwept`, the rows, words and keys read them through `viewProfileFaults`). */
type FaultCache = { judged?: readonly ProfileFault[]; straight?: readonly ProfileFault[] };
const faultCaches = new WeakMap<object, Map<ProfileCut, FaultCache>>();
const frozenFaults = (fs: ProfileFault[]): readonly ProfileFault[] => { fs.forEach((f) => Object.freeze(f)); return Object.freeze(fs); };
/** Each geometry view's profile curve, or swept profile → the part it was built from and its stored profile (one home:
 *  `geometryBoard`). A swept profile in the view is the view's own copy, so no two parts ever share an entry. `straight`:
 *  a view curve (judged in its straight form); `fallback`: a swept-shaped End to end that runs straight (I1). */
const viewSources = new WeakMap<object, { board: FaultBoard; profile: ProfileCut; straight: boolean; fallback: boolean }>();
/**
 * The stored profile's faults for a curve of a geometry view, or a swept profile of one (`view.profiles`), or none for
 * anything else. The words read the view; the faults are judged on the STORED profile and the original part (its curves
 * and other profiles), never re-derived from the view. A view curve's are its STRAIGHT form's (`opts.straight`), which for
 * a profile that is not swept-shaped are its faults as they always were; a fallen-back End to end's are therefore a2's.
 */
export function viewProfileFaults(c: object): readonly ProfileFault[] {
  const src = viewSources.get(c);
  return src ? profileFaults(src.board, src.profile, src.straight ? { straight: true } : undefined) : [];
}
/** True for a geometry view's curve that is a swept-shaped End to end running STRAIGHT because it is too tight to follow
 *  its curve (I1, the user's ruling): `geometryBoard`'s one decision, read back (the Profiles row's note). */
export function runsStraight(c: object): boolean {
  return viewSources.get(c)?.fallback ?? false;
}
/** The fallback note's cause (Q10): for a view curve that runs straight (`runsStraight`), the first kind of the SWEPT
 *  judgement that decided it — a stop's phase-1 judgement (`stopFallsBack`; its phase-2 one, `profileFaults`, can be empty
 *  once a neighbour stop is read straight), an End to end's `profileFaults` (b1's I1); null for anything else. */
export function fallbackCause(c: object): ProfileFault['kind'] | null {
  const src = viewSources.get(c);
  if (!src?.fallback) return null;
  const decided = stopMemo.get(src.board)?.get(src.profile)?.swept ?? profileFaults(src.board, src.profile);
  return decided[0]?.kind ?? null;
}
/** True for a geometry view itself (`geometryBoard`'s result): its `profiles` already hold only what is built swept. */
export const isGeometryView = (b: object): boolean => views.get(b) === b;

const stopMemo = new WeakMap<object, Map<ProfileCut, { falls: boolean; swept?: readonly ProfileFault[] }>>();
/**
 * Q10 (B10 for stops; profile runs b2): a SAVED a2 stop on a turned path follows its outline when the bit fits. A
 * swept-shaped one-side STATION run whose swept faults are non-empty while its straight faults (a2's: its view curve's
 * `curveFaults` and a2's profile faults) are none falls back: built, drawn, worded and keyed exactly as a2 built it. Stops
 * are decided FIRST, each judged against every other profile by its shape (`judge`'s phase 1), so b1's I2 holds: every
 * other judgement then reads a fallen-back stop as straight. End to end keeps b1's `fallsBack`; a loop or a two-side run
 * never falls back. Memoised per part object (a panel's trial part is a new object, judged afresh).
 */
export function stopFallsBack(board: FaultBoard, q: ProfileCut): boolean {
  if (!oneSide(q.run) || endToEnd(q.run)) return false;
  let m = stopMemo.get(board);
  if (!m) { m = new Map(); stopMemo.set(board, m); }
  const hit = m.get(q);
  if (hit) return hit.falls;
  const stored = withCurves(board);
  const swept = isSwept(stored, q) ? frozenFaults(withHarm(board, q, judge(board, q, false, true))) : undefined;
  const falls = !!swept && swept.length > 0 && judge(board, q, true, true).length === 0 && curveFaults(stored, profileAsCurve(q)).length === 0;
  m.set(q, { falls, ...(falls ? { swept } : {}) });
  return falls;
}
/**
 * I1 (final review, the user's ruling, "Fall back to straight"): a swept-shaped End to end profile (never a loop) whose
 * SWEPT faults are non-empty while its STRAIGHT form — chunk 1's view curve and a2's profile faults — has none is built,
 * drawn, worded and keyed exactly as a2 built it; it follows its curve only when the bit fits. Decided ONLY in
 * `geometryBoard` (memoised with the view), so every reader follows the view. `isSwept` stays the shape predicate that
 * authoring judges by.
 */
function fallsBack(board: FaultBoard & Pick<Board, 'curves'>, p: ProfileCut, cache: FaultCache): boolean {
  // A loop never falls back, nor a run with ends on two sides (new in b2: it has no a2 form, and profileToFields throws on
  // it — M-e); a one-side station run is decided stops-first (Q10).
  if ('loop' in p.run || !oneSide(p.run)) return false;
  if (!endToEnd(p.run)) return stopFallsBack(board, p);
  return (cache.judged = frozenFaults(judge(board, p, false))).length > 0
    && (cache.straight = frozenFaults(judge(board, p, true))).length === 0
    && curveFaults(board, profileAsCurve(p)).length === 0;
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
  const asCurve = (p: ProfileCut, fallback: boolean): ViewCurve => {
    const span = profileSpan(dims, p);
    const c: ViewCurve = { ...profileAsCurve(p), ...(span ? { span } : {}) };
    viewSources.set(c, { board: dims, profile: p, straight: true, fallback });
    return c;
  };
  const curves: CurveCut[] = [...b.curves];
  const swept: ProfileCut[] = [];
  const caches = new Map<ProfileCut, FaultCache>();
  for (const p of dims.profiles) {
    const cache: FaultCache = {};
    caches.set(p, cache);
    const shape = isSwept(b, p);
    const fallback = shape && fallsBack(dims as FaultBoard & Pick<Board, 'curves'>, p, cache);
    if (shape && !fallback) {
      const vp = { ...p };
      viewSources.set(vp, { board: dims, profile: p, straight: false, fallback: false });
      swept.push(vp);
    } else curves.push(asCurve(p, fallback));
  }
  const view = { ...b, curves, profiles: swept } as T;
  views.set(b, view);
  views.set(view, view);
  faultCaches.set(view, caches);
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
