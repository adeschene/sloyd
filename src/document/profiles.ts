import type { Board, CurveCut, CurveSegment, CutFrom, Dimension, ProfileCut, ProfileEnd, ProfileKind, ProfileRun, ProfileSide } from './types';
import { sameCurve, uvDims } from './curves';

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
export function profileAsymmetric(f: ProfileFields): boolean {
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
  for (const facing of ['v', 'u'] as const) {
    const to = c.segments.map((s): [number, number] => (facing === 'v' ? [s.to[0], s.to[1]] : [s.to[1], s.to[0]]));
    for (const kind of ORDER) {
      const p = lift(kind, to, c.segments);
      if (!p || !(p.size > 0) || (p.depth !== undefined && !(p.depth > 0 && p.depth < p.size)) || (p.fillet ?? 0) < 0) continue;
      if (kind === 'bead' && !((p.fillet ?? 0) > 0)) continue;
      const f: ProfileFields = { through, uFrom: c.uFrom, vFrom: c.vFrom, kind, facing, size: p.size,
        ...(p.depth !== undefined ? { depth: p.depth } : {}), ...(kind === 'thumbnail' ? {} : { fillet: p.fillet ?? 0 }) };
      if (sameCurve(profileCurve(f), c)) return f;
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
  if (!oneSide(p.run)) throw new Error('profileToFields: a loop or a run on two sides is not built until chunk b');
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

const views = new WeakMap<object, object>();
/**
 * THE geometry view (profile runs spec P4). Every reader that turns a part into geometry, words or faults reads this: the
 * part's curves, then each profile as the CurveCut chunk 1 stored. The SAME object when the part has no profiles; else one
 * memoised object per part, its `profiles` emptied so a second call returns it unchanged.
 */
export function geometryBoard<T extends Pick<Board, 'curves'> & { profiles?: readonly ProfileCut[] }>(b: T): T {
  if (!b.profiles || b.profiles.length === 0) return b;
  const hit = views.get(b);
  if (hit) return hit as T;
  const view = { ...b, curves: [...b.curves, ...b.profiles.map(profileAsCurve)], profiles: [] } as T;
  views.set(b, view);
  return view;
}
