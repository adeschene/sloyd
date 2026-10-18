import { describe, expect, it } from 'vitest';
import { arcOf, archCurve, bowCurve, cornerCurve, curveFaults, curveValues, mirrorCurveCut, sameCurve, spanOf } from './curves';
import { createBoard, partGeometry } from './document';
import type { P2 } from './curves';
import { DEFAULT_PROFILE_EDGE, PROFILE_EDGES, PROFILE_KINDS, copyProfile, defaultProfile, geometryBoard, mirrorProfile, profileAsCurve, profileAsymmetric, profileCurve, profileFields, endToEnd, profileFromFields, profileOf, profileToFields, profileValues, sameProfile, runDim, endPos, travelSign, canonicalRun, profileSpan, profileFaults, viewProfileFaults } from './profiles';
import { apronArch, endToEnd as sweepEndToEnd, frontOnly, loop, notchEdge, plainLoop, stopped as sweepStopped, topCorners } from './sweepFixtures';
import type { ProfileFields } from './profiles';
import type { CurveCut, ProfileCut } from './types';

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

describe('defaultProfile (spec §2.3, scaled per axis)', () => {
  const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
  const f = (k: (typeof PROFILE_KINDS)[number], b = top) => profileFields(defaultProfile(b, k))!;
  it('router-bit sizes on a 3/4" top, the top long edge, facing v', () => {
    expect(f('roundover')).toMatchObject({ ...DEFAULT_PROFILE_EDGE, facing: 'v', size: 0.25, fillet: 0 });
    expect(f('cove')).toMatchObject({ size: 0.375, fillet: 0 });
    expect(f('ogee')).toMatchObject({ size: 0.375 });
    expect(f('bead')).toMatchObject({ size: 0.25, fillet: 0.0625 });
    expect(f('thumbnail')).toMatchObject({ size: 0.75, depth: 0.25 });
  });
  it('a thin strip gets a proportionate profile, no fault', () => {
    const strip = createBoard({ length: 36, width: 0.5, thickness: 0.25 });
    for (const k of PROFILE_KINDS) {
      const c = defaultProfile(strip, k);
      expect(curveFaults(strip, c)).toEqual([]);
      expect(profileFields(c)!.kind).toBe(k);
    }
  });
  it('no default faults on a 3/4" top', () => {
    for (const k of PROFILE_KINDS) expect(curveFaults(top, defaultProfile(top, k))).toEqual([]);
  });
  it('keeps a given edge and facing', () => {
    const e = { through: 'width', uFrom: 'min', vFrom: 'max' } as const;
    expect(profileFields(defaultProfile(top, 'ogee', e, 'u'))).toMatchObject({ ...e, facing: 'u', kind: 'ogee' });
  });
  it('unscaled defaults are the exact base sizes (bytes of profileCurve)', () => {
    const base = { ...DEFAULT_PROFILE_EDGE, facing: 'v' } as const;
    const big = createBoard({ length: 36, width: 20, thickness: 4 });
    expect(sameCurve(defaultProfile(big, 'bead') as CurveCut, profileCurve({ ...base, kind: 'bead', size: 0.25, fillet: 0.0625 }) as CurveCut)).toBe(true);
    expect(sameCurve(defaultProfile(big, 'ogee') as CurveCut, profileCurve({ ...base, kind: 'ogee', size: 0.5, fillet: 0 }) as CurveCut)).toBe(true);
  });
  it('scaled sizes stay strict: bead quirk > 0, thumbnail 0 < depth < size', () => {
    const strip = createBoard({ length: 36, width: 0.3, thickness: 0.1 });
    expect(f('bead', strip).fillet).toBeGreaterThan(0);
    const t = f('thumbnail', strip);
    expect(t.depth!).toBeGreaterThan(0);
    expect(t.depth!).toBeLessThan(t.size);
  });
  it('a bead scales by its edge-face extent, quirk included', () => {
    const b = createBoard({ length: 36, width: 20, thickness: 0.3 });
    const k = 0.15 / 0.3125;
    const r = f('bead', b);
    expect(r.size).toBeCloseTo(0.25 * k, 12);
    expect(r.fillet!).toBeCloseTo(0.0625 * k, 12);
  });
  it('facing u scales against the swapped axes', () => {
    const e = { through: 'length', uFrom: 'max', vFrom: 'max' } as const;
    const b = createBoard({ length: 36, width: 0.75, thickness: 20 });
    expect(profileFields(defaultProfile(b, 'thumbnail', e, 'u'))).toMatchObject({ facing: 'u', size: 0.75, depth: 0.25 });
  });
});

describe('sharp lines along `through` (inv 16: a line only at a SHARP outline vertex, judged on the true arc)', () => {
  // A 36 x 20 x 3/4 board, one profile on the default edge. Segments of length 36 are the lines along the length. The box
  // has 4 long edges, one consumed by the profile's corner, so 3 remain; each profile adds its own sharp vertices. Counted
  // from the §2.2 outlines (edge face u = 0, top face v = 0; tangent = the arc's radius is square to the line it meets):
  //   roundover (r,0) and (0,r): both tangent                                  -> 3
  //   cove      centre (0,0): (r,0) and (0,r) both meet their lines square     -> 3 + 2
  //   ogee      (s,0) centre (s/2,0) is square to the top: sharp; the S join and (0,s) (centre (s/2,s)) tangent -> 3 + 1
  //   bead      (r+k,0) and (r+k,k) are line-line corners; the arc is tangent to the floor and the edge face   -> 3 + 2
  //   thumbnail (a,0) centre (a,R) tangent to the top; (0,d) is a crisp line on the edge face                  -> 3 + 1
  const lengthLines = (kind: (typeof PROFILE_KINDS)[number]) => {
    const b = createBoard({ length: 36, width: 20, thickness: 0.75 });
    const board = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [{ id: 'p', ...defaultProfile(b, kind) }] });
    return partGeometry(board).edges.filter(([p, q]) => Math.abs(Math.hypot(q.length - p.length, q.width - p.width, q.thickness - p.thickness) - 36) < 1e-9).length;
  };
  it('the box has 4 long edges', () => {
    expect(partGeometry(createBoard({ length: 36, width: 20, thickness: 0.75 })).edges.filter(([p, q]) => Math.abs(Math.hypot(q.length - p.length, q.width - p.width, q.thickness - p.thickness) - 36) < 1e-9).length).toBe(4);
  });
  it.each([['roundover', 3], ['cove', 5], ['ogee', 4], ['bead', 5], ['thumbnail', 4]] as const)('%s draws %i lines along the length', (kind, n) => {
    expect(lengthLines(kind)).toBe(n);
  });
});

/** Every chunk-1 profile a writer can store: each kind × 8 edges × both facings (symmetric kinds collapse to v), with and
 *  without a fillet where the kind takes one. */
const corpus = (): ProfileFields[] => PROFILE_EDGES.flatMap((e) => PROFILE_KINDS.flatMap((kind) => {
  const sizes: Pick<ProfileFields, 'size' | 'depth' | 'fillet'>[] = kind === 'thumbnail' ? [{ size: 0.75, depth: 0.25 }]
    : kind === 'bead' ? [{ size: 0.25, fillet: 0.0625 }] : [{ size: 0.375, fillet: 0 }, { size: 0.375, fillet: 0.0625 }];
  return sizes.flatMap((s) => (['v', 'u'] as const).map((facing) => ({ ...e, kind, ...s, facing })))
    .filter((f) => profileAsymmetric(f) || f.facing === 'v');
}));

describe('ProfileCut, the stored form (profile runs spec §3.1, chunk a1)', () => {
  it('every chunk-1 profile converts to a ProfileCut and back to the BYTES chunk 1 stored', () => {
    for (const f of corpus()) {
      const c = profileCurve(f);
      const p = profileOf(c);
      expect(p, JSON.stringify(f)).not.toBeNull();
      expect(profileAsCurve({ id: 'x', ...p! })).toEqual({ id: 'x', ...c });
    }
  });
  it('the mapping: face is vFrom, the side is u at uFrom, facing v is the face, End to end runs min to max', () => {
    const p = profileOf(profileCurve({ through: 'length', uFrom: 'max', vFrom: 'min', kind: 'ogee', size: 0.5, fillet: 0, facing: 'u' }))!;
    expect(p).toEqual({ face: 'min', kind: 'ogee', size: 0.5, fillet: 0, facing: 'edge',
      run: { start: { side: { across: 'width', from: 'max' }, through: 'min' }, end: { side: { across: 'width', from: 'max' }, through: 'max' } } });
    const q = profileOf(profileCurve({ through: 'width', uFrom: 'min', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' }))!;
    expect(q.face).toBe('max');
    expect(q.facing).toBe('face');
    expect('loop' in q.run ? null : q.run.start.side).toEqual({ across: 'length', from: 'min' });
  });
  it('a symmetric profile is always stored facing face (P5: a facing-u roundover reads as face)', () => {
    const v = profileCurve({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
    const u = profileCurve({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'u' });
    expect(profileOf(u)!.facing).toBe('face');
    expect(profileAsCurve({ id: 'x', ...profileOf(u)! })).toEqual({ id: 'x', ...v });
  });
  it('a plain arch is not a profile', () => {
    expect(profileOf(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }))).toBeNull();
  });
  it('mirrorProfile is mirrorCurveCut by flags, in every dimension (inv 44)', () => {
    for (const f of corpus()) for (const d of ['length', 'width', 'thickness'] as const) {
      const p: ProfileCut = { id: 'x', ...profileFromFields(f) };
      expect(profileAsCurve(mirrorProfile(p, d)), `${JSON.stringify(f)} ${d}`).toEqual(mirrorCurveCut(profileAsCurve(p), d));
      expect(mirrorProfile(mirrorProfile(p, d), d)).toEqual(p);
    }
  });
  it('sameProfile compares every field but id, exactly; copyProfile shares no object', () => {
    const p: ProfileCut = { id: 'a', ...profileFromFields(corpus()[0]!) };
    expect(sameProfile(p, { ...p, id: 'b' })).toBe(true);
    expect(sameProfile(p, { ...p, size: p.size + 1e-12 })).toBe(false);
    expect(sameProfile(p, { ...p, face: p.face === 'min' ? 'max' : 'min' })).toBe(false);
    const c = copyProfile(p);
    expect(c).toEqual(p);
    expect(c.run).not.toBe(p.run);
    if (!('loop' in c.run) && !('loop' in p.run)) expect(c.run.start.side).not.toBe(p.run.start.side);
    expect(profileValues({ ...p, depth: undefined })).toBe(profileValues(p));
  });
  it('geometryBoard: the same object with no profiles; else curves then profiles as curves, memoised, idempotent', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const plain = createBoard({ length: 30, width: 5, curves: [arch] });
    expect(geometryBoard(plain)).toBe(plain);
    // b1 (B10): the profile sits on the UNCUT width-max side; one on the arched width-min side is swept (below).
    const p: ProfileCut = { id: 'p1', ...profileFromFields(corpus().find((f) => f.through === 'length' && f.uFrom === 'max')!) };
    const b = createBoard({ length: 30, width: 5, curves: [arch], profiles: [p] });
    const g = geometryBoard(b);
    expect(g.curves).toEqual([arch, profileAsCurve(p)]);
    expect(g.profiles).toEqual([]);
    expect(geometryBoard(b)).toBe(g);
    expect(geometryBoard(g)).toBe(g);
  });
  it('geometryBoard (b1, B10): an End to end profile on the side an arch cuts is swept: in the view\'s profiles, not its curves', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    const p: ProfileCut = { id: 'p1', ...profileFromFields(corpus()[0]!) };
    const g = geometryBoard(createBoard({ length: 30, width: 5, curves: [arch], profiles: [p] }));
    expect(g.curves).toEqual([arch]);
    expect(g.profiles).toEqual([p]);
    expect(geometryBoard(g)).toBe(g);
  });
  const side = (from: 'min' | 'max') => ({ across: 'width' as const, from });
  const station: ProfileCut = { id: 'x', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face',
    run: { start: { side: side('min'), from: 'min', at: 3 }, end: { side: side('min'), from: 'min', at: 27 } } };
  it('a station run swaps start and end on every mirror, thickness included, and flips the expected flags', () => {
    const run = station.run as Extract<ProfileCut['run'], { start: unknown }>;
    const l = mirrorProfile(station, 'length').run as typeof run;
    expect(l).toEqual({ start: { side: side('min'), from: 'max', at: 27 }, end: { side: side('min'), from: 'max', at: 3 } });
    const w = mirrorProfile(station, 'width');
    expect(w.run).toEqual({ start: { side: side('max'), from: 'min', at: 27 }, end: { side: side('max'), from: 'min', at: 3 } });
    const th = mirrorProfile(station, 'thickness');
    expect(th.face).toBe('min');
    expect(th.run).toEqual({ start: run.end, end: run.start });
    for (const d of ['length', 'width', 'thickness'] as const) expect(mirrorProfile(mirrorProfile(station, d), d)).toEqual(station);
  });
  it('endToEnd is false for a station run and for ends on two sides; profileToFields throws on two sides and a loop (a station run reads, a2)', () => {
    expect(endToEnd(station.run)).toBe(false);
    expect(endToEnd({ start: { side: side('min'), through: 'min' }, end: { side: side('max'), through: 'max' } })).toBe(false);
    expect(endToEnd({ start: { side: side('min'), through: 'min' }, end: { side: side('min'), through: 'max' } })).toBe(true);
    const twoSides = { ...station, run: { start: { side: side('min'), through: 'min' as const }, end: { side: side('max'), through: 'max' as const } } };
    expect(() => profileToFields(twoSides)).toThrow();
    expect(() => profileToFields({ ...station, run: { loop: true } })).toThrow();
  });
});

describe('station runs: order and mirror (profile runs a2, P11)', () => {
  const B = { length: 30, width: 10, thickness: 0.75 };
  const side = { across: 'width', from: 'max' } as const;
  const st = (at: number) => ({ side, from: 'min' as const, at });
  it('runDim and endPos: a station from min reads `at`, from max reads length − at; a through end its face', () => {
    expect(runDim(side)).toBe('length');
    expect(runDim({ across: 'length', from: 'min' })).toBe('width');
    expect(endPos(B, st(3))).toBe(3);
    expect(endPos(B, { side, from: 'max', at: 3 })).toBe(27);
    expect(endPos(B, { side, through: 'max' })).toBe(30);
  });
  it('travelSign flips with the side and with the face, never with the run', () => {
    expect(travelSign('max', { across: 'width', from: 'min' })).toBe(-travelSign('max', { across: 'width', from: 'max' }));
    expect(travelSign('min', side)).toBe(-travelSign('max', side));
  });
  it('canonicalRun orders a station run along travel; an End to end run stays min → max', () => {
    const fwd = travelSign('max', side) > 0;
    const run = canonicalRun(B, 'max', { start: st(27), end: st(3) });
    expect([endPos(B, run.start), endPos(B, run.end)]).toEqual(fwd ? [3, 27] : [27, 3]);
    const e2e = { start: { side, through: 'max' as const }, end: { side, through: 'min' as const } };
    expect(canonicalRun(B, 'max', e2e)).toEqual({ start: { side, through: 'min' }, end: { side, through: 'max' } });
  });
  it('mirrorProfile keeps a canonical station run canonical, in every dimension (Review Focus 1)', () => {
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'cove', size: 0.375, fillet: 0, facing: 'v' });
    const p: ProfileCut = { id: 'x', ...base, run: canonicalRun(B, base.face, { start: st(3), end: st(20) }) };
    for (const d of ['length', 'width', 'thickness'] as const) {
      const m = mirrorProfile(p, d);
      if ('loop' in m.run) throw new Error('loop');
      expect(canonicalRun(B, m.face, m.run), d).toEqual(m.run);
    }
  });
  it('profileToFields reads a one-side station run as its side\'s fields', () => {
    const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
    const p: ProfileCut = { id: 'x', ...base, run: { start: st(3), end: st(27) } };
    expect(profileToFields(p)).toEqual(profileToFields({ ...base }));
  });
});

describe('the span and the profile faults (profile runs a2, P12/P13)', () => {
  const B = { length: 30, width: 10, thickness: 0.75 };
  const side = { across: 'width', from: 'max' } as const;
  const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
  const stopped = (a: number, b: number, id = 'p'): ProfileCut => ({ id, ...base, run: canonicalRun(B, base.face, { start: { side, from: 'min', at: a }, end: { side, from: 'min', at: b } }) });
  it('an End to end profile has no span; its view curve is chunk 1\'s bytes', () => {
    const p: ProfileCut = { id: 'p', ...base };
    expect(profileSpan(B, p)).toBeUndefined();
    const board = createBoard({ ...B, profiles: [p] });
    expect(geometryBoard(board).curves[0]).toEqual(profileAsCurve(p));
  });
  it('a stopped profile spans its stations, stop flags set; a through end sets none', () => {
    expect(profileSpan(B, stopped(3, 27))).toEqual({ lo: 3, hi: 27, stopLo: true, stopHi: true });
    const half: ProfileCut = { id: 'p', ...base, run: canonicalRun(B, base.face, { start: { side, through: 'min' }, end: { side, from: 'min', at: 20 } }) };
    expect(profileSpan(B, half)).toEqual({ lo: 0, hi: 20, stopLo: false, stopHi: true });
  });
  it('the view carries the span, and curveValues tells a stopped curve from a full one', () => {
    const g = geometryBoard(createBoard({ ...B, profiles: [stopped(3, 27)] }));
    expect(spanOf(g.curves[0]!)).toEqual({ lo: 3, hi: 27, stopLo: true, stopHi: true });
    expect(curveValues(g.curves[0]!)).not.toBe(curveValues(profileAsCurve(stopped(3, 27))));
    expect(curveValues(profileAsCurve(stopped(3, 27)))).toBe(curveValues(profileAsCurve({ id: 'p', ...base })));
  });
  it('stop-off: a station at or past an end, or a start not before its stop (P12); none for a fit', () => {
    const b = (p: ProfileCut) => profileFaults(createBoard({ ...B, profiles: [p] }), p).map((f) => f.kind);
    expect(b(stopped(3, 27))).toEqual([]);
    expect(b(stopped(3, 30))).toEqual(['stop-off']);
    expect(b(stopped(3, 31))).toEqual(['stop-off']);
    expect(b(stopped(0, 20))).toEqual(['stop-off']);
    expect(b(stopped(12, 12))).toEqual(['stop-off']);
  });
  it('a stop 0.1" in is no fault: the run-out runs off the end (P13)', () => {
    expect(profileFaults(createBoard({ ...B, profiles: [stopped(0.1, 27)] }), stopped(0.1, 27))).toEqual([]);
  });
  it('overlap: same face and side, spans overlapping with positive length; touching is not (P12)', () => {
    const a = stopped(3, 15, 'a'), c = stopped(12, 27, 'c'), d = stopped(15, 27, 'd');
    expect(profileFaults(createBoard({ ...B, profiles: [a, c] }), a)).toEqual([{ kind: 'overlap', other: 'c' }]);
    expect(profileFaults(createBoard({ ...B, profiles: [a, d] }), a)).toEqual([]);
    const full: ProfileCut = { id: 'f', ...base };
    expect(profileFaults(createBoard({ ...B, profiles: [a, full] }), a)).toEqual([{ kind: 'overlap', other: 'f' }]);
    const otherSide: ProfileCut = { id: 'o', ...profileFromFields({ through: 'length', uFrom: 'min', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' }) };
    expect(profileFaults(createBoard({ ...B, profiles: [a, otherSide] }), a)).toEqual([]);
  });
});

describe('swept profile faults (profile runs b1, Q6)', () => {
  const kinds = (b: { profiles: ProfileCut[] } & Parameters<typeof profileFaults>[0], id = 'p1') => profileFaults(b, b.profiles.find((p) => p.id === id)!).map((f) => f.kind);
  const notch = (span: number, profiles: ProfileCut[] = [sweepEndToEnd('p1', { across: 'width', from: 'min' }, 0.375)]) => createBoard({ length: 30, width: 5, thickness: 0.75,
    curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span, rise: span / 2 }) }], profiles });
  it('the fixtures as built fault nothing', () => {
    for (const b of [apronArch, notchEdge, frontOnly, topCorners(2), topCorners(0.5), plainLoop]) expect(kinds(b, b.profiles[0]!.id)).toEqual([]);
  });
  it('too-tight: a convex corner arc under the reach (1/4" corners, a 3/8" roundover all round)', () => {
    expect(kinds(topCorners(0.25, loop('p1', 0.375)))).toEqual(['too-tight']);
  });
  it('a convex arc exactly the reach is not tight (touching)', () => {
    expect(kinds(topCorners(0.375, loop('p1', 0.375)))).toEqual([]);
  });
  it('too-tight: a concave arc under the bearing\'s 1/4" (a 0.2" notch), whatever the reach', () => {
    expect(kinds(notch(0.4))).toEqual(['too-tight']);
  });
  it('a concave arc of exactly 1/4" is not tight (touching), though the reach is larger', () => {
    expect(kinds(notch(0.5))).toEqual([]);
  });
  it('runs-off: a reach over half the face\'s smaller dimension (3" on a 5" apron)', () => {
    expect(kinds({ ...apronArch, profiles: [{ ...apronArch.profiles[0]!, size: 3 }] })).toContain('runs-off');
  });
  it('runs-off at the reach bound: half the width is no fault, a hair over is', () => {
    const strip = (size: number) => createBoard({ length: 30, width: 1, thickness: 0.75, profiles: [{ ...loop('p1', size, 'thumbnail') }] });
    expect(kinds(strip(0.5))).toEqual([]);
    expect(kinds(strip(0.5 + 1e-9))).toEqual(['runs-off']);
  });
  it('runs-off at the depth bound: a thumbnail on its edge exactly the thickness deep is no fault, past it is', () => {
    const edge = (thickness: number) => createBoard({ length: 30, width: 10, thickness, profiles: [{ ...loop('p1', 0.75, 'thumbnail'), facing: 'edge' }] });
    expect(kinds(edge(0.75))).toEqual([]);
    expect(kinds(edge(0.74))).toEqual(['runs-off']);
  });
  it('runs-off: a loop with no traceable outline (two corner curves overlapping on one side)', () => {
    const c = (u: 'min' | 'max', id: string) => ({ id, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: 'min', radius: 4 }) });
    const b = createBoard({ length: 6, width: 10, thickness: 0.75, curves: [c('min', 'a'), c('max', 'b')], profiles: [loop('p1')] });
    expect(kinds(b)).toEqual(['runs-off']);
  });
  it('overlap: a front End to end round its corner arcs meets an End to end on the length min end (the corner arc is shared)', () => {
    const b = topCorners(2, frontOnly.profiles[0]!);
    const both = { ...b, profiles: [b.profiles[0]!, sweepEndToEnd('e', { across: 'length', from: 'min' })] };
    expect(profileFaults(both, both.profiles[0]!)).toEqual([{ kind: 'overlap', other: 'e' }]);
    expect(profileFaults(both, both.profiles[1]!)).toEqual([{ kind: 'overlap', other: 'p1' }]);
  });
  it('overlap: a loop overlaps every other profile on its face, straight ones included; not one on the other face', () => {
    const b = { ...plainLoop, profiles: [...plainLoop.profiles, sweepEndToEnd('e', { across: 'width', from: 'max' }), { ...sweepEndToEnd('m', { across: 'width', from: 'max' }), face: 'min' as const }] };
    expect(profileFaults(b, b.profiles[0]!)).toEqual([{ kind: 'overlap', other: 'e' }]);
    expect(profileFaults(b, b.profiles[1]!)).toEqual([{ kind: 'overlap', other: 'w1' }]);
    expect(profileFaults(b, b.profiles[2]!)).toEqual([]);
  });
  it('overlap on outline stretches: End to end round the front corners does not meet the back (sharp-free, no shared stretch)', () => {
    const b = topCorners(2, frontOnly.profiles[0]!);
    const both = { ...b, profiles: [b.profiles[0]!, sweepEndToEnd('k', { across: 'width', from: 'max' })] };
    expect(profileFaults(both, both.profiles[0]!)).toEqual([]);
  });
  it('a station run beside a swept profile overlaps where its span lies on the swept stretch, not elsewhere', () => {
    const near = sweepStopped('s', { across: 'width', from: 'min' }, 10, 20), off = sweepStopped('s', { across: 'width', from: 'max' }, 10, 20);
    expect(profileFaults({ ...apronArch, profiles: [apronArch.profiles[0]!, near] }, near)).toEqual([{ kind: 'overlap', other: 'p1' }]);
    expect(profileFaults({ ...apronArch, profiles: [apronArch.profiles[0]!, off] }, off)).toEqual([]);
  });
  it('B10 × path overlap: a saved four-edge set on a rounded-corner top loads with every profile overlapping its two neighbours', () => {
    // In a2 each was a straight prism through the corner waste; under B10 each carries round both its corner arcs, and
    // each arc is shared by two sides. Pinned as the spec reads (§4.1 (B) + B10); flagged for the user's ruling.
    const s = (across: 'length' | 'width', from: 'min' | 'max') => ({ across, from });
    const four = [sweepEndToEnd('f', s('width', 'min')), sweepEndToEnd('r', s('length', 'max')), sweepEndToEnd('k', s('width', 'max')), sweepEndToEnd('l', s('length', 'min'))];
    const b = { ...topCorners(2), profiles: four };
    expect(four.map((p) => profileFaults(b, p).map((f) => (f.kind === 'overlap' ? f.other : f.kind)).sort())).toEqual([
      ['l', 'r'], ['f', 'k'], ['l', 'r'], ['f', 'k'],
    ]);
    // the same set on sharp corners: straight, no fault (a2's four-edge set)
    const sharp = { ...createBoard({ length: 36, width: 20, thickness: 0.75 }), profiles: four };
    expect(four.map((p) => profileFaults(sharp, p))).toEqual([[], [], [], []]);
  });
  it('two straight profiles on one side keep a2\'s overlap result exactly (straight pairs never take the outline path)', () => {
    const B = createBoard({ length: 30, width: 10, thickness: 0.75 });
    const s = { across: 'width', from: 'max' } as const;
    const a = sweepStopped('a', s, 3, 15), c = sweepStopped('c', s, 12, 27), d = sweepStopped('d', s, 15, 27), full = sweepEndToEnd('f', s);
    expect(profileFaults({ ...B, profiles: [a, c] }, a)).toEqual([{ kind: 'overlap', other: 'c' }]);
    expect(profileFaults({ ...B, profiles: [a, d] }, a)).toEqual([]);
    expect(profileFaults({ ...B, profiles: [a, full] }, a)).toEqual([{ kind: 'overlap', other: 'f' }]);
    expect(profileFaults({ ...B, profiles: [full, { ...full, id: 'g' }] }, full)).toEqual([{ kind: 'overlap', other: 'g' }]);
  });
  it('a straight profile takes no swept fault: its prism faults stay chunk 1\'s (a 3" roundover on the uncut side of a 5" apron)', () => {
    const big = { ...sweepEndToEnd('s', { across: 'width', from: 'max' }), size: 3 };
    expect(profileFaults({ ...apronArch, profiles: [apronArch.profiles[0]!, big] }, big)).toEqual([]);
  });
  it('the view\'s swept profile reads its stored faults (viewProfileFaults)', () => {
    const b = topCorners(0.25, loop('p1', 0.375));
    expect(viewProfileFaults(geometryBoard(b).profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
    expect(viewProfileFaults(b.profiles[0]!)).toEqual([]);   // the stored object is not a view's
  });
});
