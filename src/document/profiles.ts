import type { CurveCut, CurveSegment, CutFrom } from './types';

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
