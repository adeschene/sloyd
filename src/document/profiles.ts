import type { Board, CurveCut, CurveSegment, CutFrom, Dimension } from './types';
import { sameCurve, uvDims } from './curves';

/**
 * Edge profiles (edge profiles spec, chunk 1): a full-length routed edge is a plain `CurveCut` running along the edge
 * (`through` = the edge's run), its waste outline written here in a canonical frame — a along the TOP face, b down the
 * EDGE face, from the edge's corner — and mapped to stored (u, v) by `facing` ('v': T is the v = 0 face, (u, v) = (a, b);
 * 'u': T is the u = 0 face, swapped, every arc side flipped). Recognised structurally (`profileFields`, read by
 * rewriting): no stored kind, no schema change. Through the thickness the same shape is a Curves Rounded corner (R3).
 * Runtime imports: none beyond types (the reader adds `curves` for `sameCurve`).
 */
export type ProfileKind = 'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail';
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
