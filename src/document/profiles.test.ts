import { describe, expect, it } from 'vitest';
import { arcOf, cornerCurve, sameCurve } from './curves';
import type { P2 } from './curves';
import { PROFILE_EDGES, profileAsymmetric, profileCurve } from './profiles';
import type { ProfileFields } from './profiles';

const edge = { through: 'length', uFrom: 'max', vFrom: 'max' } as const;
const at = (f: Partial<ProfileFields> & Pick<ProfileFields, 'kind' | 'size'>): ProfileFields => ({ ...edge, facing: 'v', ...f });
/** The outline's points (start, then each segment's `to`) and every arc's centre, in stored (u, v). */
const shape = (f: ProfileFields) => {
  const c = profileCurve(f);
  const pts: P2[] = [c.start, ...c.segments.map((s) => s.to)];
  const centres = c.segments.flatMap((s, i) => (s.type === 'arc' ? [arcOf(pts[i]!, s.to, s.side, { radius: s.radius! }, i).centre] : []));
  return { c, pts, centres };
};
const close = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 1e-12);

describe('profileCurve (edge profiles spec §2.2, canonical frame = stored frame at facing v)', () => {
  it('roundover, fillet 0, is byte-identical to cornerCurve', () => {
    expect(profileCurve(at({ kind: 'roundover', size: 0.25 }))).toEqual(cornerCurve({ ...edge, radius: 0.25 }));
    expect(sameCurve(profileCurve(at({ kind: 'roundover', size: 0.25, fillet: 0 })), cornerCurve({ ...edge, radius: 0.25 }))).toBe(true);
  });
  it('roundover with a fillet: the arc set f in from the edge face, a shoulder line back to it', () => {
    const { pts, centres } = shape(at({ kind: 'roundover', size: 0.25, fillet: 0.0625 }));
    expect(pts).toEqual([[0, 0], [0.3125, 0], [0.0625, 0.25], [0, 0.25], [0, 0]]);
    expect(close(centres[0]!, [0.3125, 0.25])).toBe(true);
  });
  it('cove: concave, centred on the corner (fillet 0)', () => {
    const { pts, centres } = shape(at({ kind: 'cove', size: 0.375 }));
    expect(pts).toEqual([[0, 0], [0.375, 0], [0, 0.375], [0, 0]]);
    expect(close(centres[0]!, [0, 0])).toBe(true);
  });
  it('Roman ogee: concave entering the top, convex onto the edge face', () => {
    const { pts, centres } = shape(at({ kind: 'ogee', size: 0.5 }));
    expect(pts).toEqual([[0, 0], [0.5, 0], [0.25, 0.25], [0, 0.5], [0, 0]]);
    expect(close(centres[0]!, [0.25, 0])).toBe(true);
    expect(close(centres[1]!, [0.25, 0.5])).toBe(true);
  });
  it('bead: a roundover set k below the top behind a k × k quirk', () => {
    const { pts, centres } = shape(at({ kind: 'bead', size: 0.25, fillet: 0.0625 }));
    expect(pts).toEqual([[0, 0], [0.3125, 0], [0.3125, 0.0625], [0.25, 0.0625], [0, 0.3125], [0, 0]]);
    expect(close(centres[0]!, [0.25, 0.3125])).toBe(true);
  });
  it('thumbnail: tangent to the top at (a, 0), radius (a² + d²) / 2d, a crisp line on the edge face', () => {
    const { c, pts, centres } = shape(at({ kind: 'thumbnail', size: 0.75, depth: 0.25 }));
    expect(pts).toEqual([[0, 0], [0.75, 0], [0, 0.25], [0, 0]]);
    expect(c.segments[1]).toMatchObject({ type: 'arc', side: 'left', radius: (0.75 * 0.75 + 0.25 * 0.25) / (2 * 0.25) });
    expect(close(centres[0]!, [0.75, 1.25])).toBe(true);
  });
  it('facing u swaps the stored axes and flips every arc side', () => {
    const v = profileCurve(at({ kind: 'ogee', size: 0.5 }));
    const u = profileCurve(at({ kind: 'ogee', size: 0.5, facing: 'u' }));
    expect(u.segments.map((s) => s.to)).toEqual(v.segments.map((s) => [s.to[1], s.to[0]]));
    expect(u.segments.map((s) => (s.type === 'arc' ? s.side : null))).toEqual(v.segments.map((s) => (s.type === 'arc' ? (s.side === 'left' ? 'right' : 'left') : null)));
  });
  it('PROFILE_EDGES: the 8 edges along the length or width', () => {
    expect(PROFILE_EDGES).toHaveLength(8);
    expect(PROFILE_EDGES.every((e) => e.through !== ('thickness' as string))).toBe(true);
  });
  it('asymmetric: ogee, bead, thumbnail, or any fillet', () => {
    expect(profileAsymmetric(at({ kind: 'roundover', size: 0.25 }))).toBe(false);
    expect(profileAsymmetric(at({ kind: 'cove', size: 0.25, fillet: 0 }))).toBe(false);
    expect(profileAsymmetric(at({ kind: 'cove', size: 0.25, fillet: 0.0625 }))).toBe(true);
    for (const kind of ['ogee', 'bead', 'thumbnail'] as const) expect(profileAsymmetric(at({ kind, size: 0.5, depth: 0.25, fillet: 0.0625 }))).toBe(true);
  });
});
