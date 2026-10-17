import { describe, expect, it } from 'vitest';
import { arcOf, archCurve, bowCurve, cornerCurve, mirrorCurveCut, sameCurve } from './curves';
import type { P2 } from './curves';
import { PROFILE_EDGES, PROFILE_KINDS, profileAsymmetric, profileCurve, profileFields } from './profiles';
import type { ProfileFields } from './profiles';
import type { CurveCut } from './types';

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

describe('profileFields: read by rewriting (spec §2.3)', () => {
  const variants = (kind: (typeof PROFILE_KINDS)[number]): Partial<ProfileFields>[] =>
    kind === 'thumbnail' ? [{ size: 0.75, depth: 0.25 }]
      : kind === 'bead' ? [{ size: 0.25, fillet: 0.0625 }]
        : [{ size: 0.375, fillet: 0 }, { size: 0.375, fillet: 0.0625 }];
  it('round-trips every kind × 8 edges × both facings × fillet', () => {
    for (const kind of PROFILE_KINDS) for (const e of PROFILE_EDGES) for (const facing of ['u', 'v'] as const) for (const v of variants(kind)) {
      const f: ProfileFields = { ...e, kind, facing, size: v.size!, ...(v.depth !== undefined ? { depth: v.depth } : {}), ...(v.fillet !== undefined ? { fillet: v.fillet } : {}) };
      const read = profileFields({ id: 'x', ...profileCurve(f) } as CurveCut)!;
      expect(read).not.toBeNull();
      expect(sameCurve(profileCurve(read), profileCurve(f))).toBe(true);
      expect(read.kind).toBe(kind);
    }
  });
  it('a symmetric profile written at facing v reads at facing v', () => {
    expect(profileFields(profileCurve(at({ kind: 'roundover', size: 0.25 })))!.facing).toBe('v');
    expect(profileFields(profileCurve(at({ kind: 'cove', size: 0.25 })))!.facing).toBe('v');
  });
  it('a symmetric profile written at facing u reads as the same kind and rewrites to the same bytes', () => {
    for (const kind of ['roundover', 'cove'] as const) {
      const c = profileCurve(at({ kind, size: 0.25, facing: 'u' }));
      const read = profileFields(c)!;
      expect(read.kind).toBe(kind);
      expect(read.facing).toBe('u');
      expect(profileCurve(read)).toEqual(c);
    }
  });
  it('a stored through-length Rounded corner (master today) reads as a Roundover (Review Focus 1)', () => {
    expect(profileFields(cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.375 })))
      .toMatchObject({ kind: 'roundover', through: 'length', uFrom: 'min', vFrom: 'max', size: 0.375 });
  });
  it('null through the thickness (a Curves Rounded corner), and for arches, bows and other curves', () => {
    expect(profileFields(cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }))).toBeNull();
    expect(profileFields(archCurve({ through: 'length', along: 'width', side: 'min', from: 'min', start: 1, span: 4, rise: 1 }))).toBeNull();
    expect(profileFields(bowCurve({ through: 'length', along: 'width', side: 'min', span: 10, rise: 0.5 }))).toBeNull();
    expect(profileFields({ through: 'length', uFrom: 'min', vFrom: 'min', start: [0, 0],
      segments: [{ type: 'line', to: [1, 0] }, { type: 'line', to: [0, 1] }, { type: 'line', to: [0, 0] }] })).toBeNull();
    // An arc stored by rise rather than radius is not a profile's (writers store radius).
    expect(profileFields({ through: 'length', uFrom: 'max', vFrom: 'max', start: [0, 0],
      segments: [{ type: 'line', to: [0.375, 0] }, { type: 'arc', to: [0, 0.375], side: 'right', rise: 0.375 - Math.sqrt(0.375 * 0.375 / 2) }, { type: 'line', to: [0, 0] }] })).toBeNull();
  });
  it('a malformed near-profile reads null, never nonsense (bead without a quirk, thumbnail without depth, off-origin start)', () => {
    // The WRITER emits these degenerate outlines for invalid fields; the reader must still refuse them.
    expect(profileFields(profileCurve({ ...edge, kind: 'bead', facing: 'v', size: 0.25, fillet: 0 }))).toBeNull();
    expect(profileFields(profileCurve({ ...edge, kind: 'bead', facing: 'v', size: 0.25 }))).toBeNull();
    // depth = reach is a quarter circle: the same bytes as a Roundover, and read as one.
    expect(profileFields(profileCurve({ ...edge, kind: 'thumbnail', facing: 'v', size: 0.25, depth: 0.25 }))!.kind).toBe('roundover');
    expect(profileFields(profileCurve({ ...edge, kind: 'thumbnail', facing: 'v', size: 0.25, depth: 0.5 }))).toBeNull();
    const thumb = profileCurve({ ...edge, kind: 'thumbnail', facing: 'v', size: 0.75, depth: 0.25 });
    expect(profileFields({ ...thumb, start: [0.1, 0] })).toBeNull();
    expect(profileFields({ ...thumb, segments: [] })).toBeNull();
  });
  it('a mirrored profile reads as the same kind with the mirrored edge (Review Focus 2, inv 44)', () => {
    const f = at({ kind: 'ogee', size: 0.5, fillet: 0.0625 });
    const c = { id: 'x', ...profileCurve(f) } as CurveCut;
    const m = profileFields(mirrorCurveCut(c, 'width'))!;      // through length: u = width
    expect(m).toMatchObject({ kind: 'ogee', facing: 'v', uFrom: 'min', vFrom: 'max', size: 0.5, fillet: 0.0625 });
    expect(profileFields(mirrorCurveCut(c, 'length'))).toEqual(profileFields(c));   // along through: unchanged
  });
});
