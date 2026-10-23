import { describe, expect, it } from 'vitest';
import { POSTURE_ACROSS_MIRROR, applyWorldEdits, postureRefusal, sameSideFirst } from './treeEdit';
import { createDocument } from './document';
import { mirroredAt, sideAt, worldParts } from './tree';
import { mirrorDim, mirrorFeatures } from './frames';
import { mirrorCut } from './mirrorCut';
import { mirrorAngleCut } from './angleCuts';
import { mirrorHoleRow } from './holes';
import { archCurve, mirrorCurveCut } from './curves';
import { mirrorProfile } from './profiles';
import { BUILT_IN_BAND_ID, mirrorBands, withBands } from './bandModel';
import { sharedOf } from './links';
import { chiralAll } from './sweepFixtures';
import type { Board, Instance, Posture, ProfileCut, ProfileSide, Rotation, Shape, ShapedBoard, SloydDocument } from './types';

/**
 * Mirrored links, Task 2 (fu 432, spec §4): an edit made through a part's own mirror flag lowers through it, so a shared
 * write lands in the Shape's hand. Every fixture is chiralAll (all six feature kinds with a hand, inv 44).
 */
const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const shapeOf = (posture: Posture): Shape => ({ id: 's1', ...sharedOf(chiralAll(posture)) });
const user = (id: string, position: [number, number, number], rotation: Rotation, mirrored: boolean): ShapedBoard =>
  ({ id, name: id.toUpperCase(), position, rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) });

/** Root: `a` (unmirrored user), `b` (mirrored user, turned). With `inAssembly`, `b` sits in definition d1 under instance i1. */
const linkDoc = (posture: Posture, opts: { bRotation?: Rotation; inAssembly?: Partial<Instance>; bMirrored?: boolean } = {}): SloydDocument => {
  const b = user('b', [40, 0, 0], opts.bRotation ?? 90, opts.bMirrored ?? true);
  const base = { ...createDocument('Mirrored links'), shapes: [shapeOf(posture)] };
  if (!opts.inAssembly) return { ...base, boards: [user('a', [0, 0, 0], 0, false), b] };
  return {
    ...base,
    boards: [user('a', [0, 0, 0], 0, false)],
    instances: [{ id: 'i1', name: 'Side', definition: 'd1', position: [60, 0, 0], rotation: 0, ...opts.inAssembly }],
    definitions: [{ id: 'd1', boards: [b], instances: [], hardware: [] }],
  };
};
const occ = (d: SloydDocument, id: string): Board => worldParts(d).find((p) => p.id === id)!;
const shape = (d: SloydDocument): Shape => d.shapes.find((s) => s.id === 's1')!;
/** The Shape read as a plain board (the unmirrored user's local form, before its own turn). */
const shapeBoard = (d: SloydDocument): Board => occ(d, 'a');
const edit1 = (d: SloydDocument, id: string, fn: (b: Board) => Board): SloydDocument => {
  const before = occ(d, id);
  return applyWorldEdits(d, [{ before, after: fn(before) }]);
};

const SIDES: ProfileSide[] = [{ across: 'width', from: 'min' }, { across: 'width', from: 'max' }, { across: 'length', from: 'min' }, { across: 'length', from: 'max' }];
/** One edit per feature kind, applied to a world part; each touches only its feature's id. */
const EDITS: Array<[string, (b: Board) => Board, (d: SloydDocument) => unknown, (b: Board) => unknown]> = [
  ['a hole row\'s station', (b) => ({ ...b, holes: b.holes.map((r) => (r.id === 'h1' ? { ...r, station: r.station + 1.5 } : r)) }),
    (d) => shape(d).holes, (b) => b.holes],
  ['a band side', (b) => ({ ...b, bands: withBands(b.bands, [SIDES.find((x) => !b.bands.some((y) => y.side.across === x.across && y.side.from === x.from))!], BUILT_IN_BAND_ID) }),
    (d) => shape(d).bands, (b) => b.bands],
  ['a profile run', (b) => ({ ...b, profiles: b.profiles.map((p) => (p.id === 'p1'
    ? { ...p, run: 'start' in p.run ? { ...p.run, start: { ...p.run.start, at: 2.5 } } : p.run } as ProfileCut : p)) }),
    (d) => shape(d).profiles, (b) => b.profiles],
  ['an angle cut', (b) => ({ ...b, angleCuts: b.angleCuts.map((c) => (c.id === 'a1' ? { ...c, points: [[0, 1], [12, 0]] } : c)) }),
    (d) => shape(d).angleCuts, (b) => b.angleCuts],
  ['a curve', (b) => ({ ...b, curves: b.curves.map((c) => (c.id === 'k1'
    ? { id: 'k1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'max', start: 3, span: 5, rise: 0.5 }) } : c)) }),
    (d) => shape(d).curves, (b) => b.curves],
  ['a rectangular cut', (b) => ({ ...b, cuts: b.cuts.map((c) => (c.id === 'c1' ? { ...c, offset: c.offset + 1 } : c)) }),
    (d) => shape(d).cuts, (b) => b.cuts],
];
/** The Shape-hand form of a world part's features: each mirrored along d0 by its own flag flip. */
const reflected = (b: Board) => {
  const d = mirrorDim(b);
  return {
    holes: b.holes.map((r) => mirrorHoleRow(r, d)), bands: mirrorBands(b.bands, d), profiles: b.profiles.map((p) => mirrorProfile(p, d)),
    angleCuts: b.angleCuts.map((c) => mirrorAngleCut(c, d)), curves: b.curves.map((c) => mirrorCurveCut(c, d)),
    cuts: b.cuts.map((c) => mirrorCut(c, d, b[d])),
  };
};
const FEATURE_KEYS = ['cuts', 'angleCuts', 'holes', 'curves', 'profiles', 'bands'] as const;

describe('sideAt (mirrored links, spec §4)', () => {
  it('is the chain parity XOR the part\'s own flag', () => {
    const root = linkDoc('flat');
    expect([sideAt(root, 'a'), sideAt(root, 'b')]).toEqual([false, true]);
    expect(mirroredAt(root, 'b')).toBe(false);
    const both = linkDoc('flat', { inAssembly: { mirrored: true } });
    expect(mirroredAt(both, 'i1/b')).toBe(true);
    expect(sideAt(both, 'i1/b')).toBe(false);                                  // parities cancel
    const onlyAssembly = linkDoc('flat', { inAssembly: { mirrored: true }, bMirrored: false });
    expect(sideAt(onlyAssembly, 'i1/b')).toBe(true);
  });
});

describe('an edit through a mirrored user lowers through its own flag (spec §4)', () => {
  for (const posture of POSTURES) {
    for (const [what, fn, stored, world] of EDITS) {
      it(`${posture}: ${what} — the Shape holds it reflected, the unmirrored user shows it reflected, the other kinds untouched`, () => {
        const d0 = linkDoc(posture);
        const before = occ(d0, 'b');
        const after = fn(before);
        expect(world(after)).not.toEqual(world(before));                         // the edit is real
        const d1 = applyWorldEdits(d0, [{ before, after }]);
        const want = reflected(after);
        const key = FEATURE_KEYS.find((k) => world(after) === after[k])!;
        expect(stored(d1)).toEqual(want[key]);
        expect(world(occ(d1, 'a'))).toEqual(want[key]);                         // a at root, turn 0: its features ARE the Shape's
        expect(world(occ(d1, 'b'))).toEqual(world(after));                       // the edited side shows the edit as made
        for (const k of FEATURE_KEYS) if (k !== key) expect(shape(d1)[k], k).toBe(shape(d0)[k]);
      });
    }
  }

  it('an untouched edit (rename, resize) leaves every Shape feature array the SAME object', () => {
    for (const posture of POSTURES) {
      const d0 = linkDoc(posture);
      for (const after of [{ ...occ(d0, 'b'), name: 'Right' }, { ...occ(d0, 'b'), length: occ(d0, 'b').length + 2 }]) {
        const d1 = applyWorldEdits(d0, [{ before: occ(d0, 'b'), after }]);
        for (const k of FEATURE_KEYS) expect(shape(d1)[k], `${posture} ${k}`).toBe(shape(d0)[k]);
        if (after.name === 'Right') expect(shape(d1), `${posture} rename`).toBe(shape(d0));   // nothing shared written
      }
    }
  });

  it('three successive edits leave no drift: untouched features stay the stored objects; the edited numbers match one edit', () => {
    for (const posture of POSTURES) {
      const step = (k: number) => (b: Board): Board => ({
        ...b,
        holes: b.holes.map((r) => (r.id === 'h1' ? { ...r, station: 7 + k } : r)),
        cuts: b.cuts.map((c) => (c.id === 'c1' ? { ...c, offset: 15.25 - 0.5 * k } : c)),
      });
      const d0 = linkDoc(posture);
      let d = d0;
      for (const k of [1, 2, 3]) d = edit1(d, 'b', step(k));
      const once = edit1(d0, 'b', step(3));
      const c = (x: SloydDocument, id: string) => shape(x).cuts.find((q) => q.id === id)!;
      const h = (x: SloydDocument, id: string) => shape(x).holes.find((q) => q.id === id)!;
      for (const id of ['c2', 'c3']) expect(c(d, id), `${posture} ${id}`).toBe(c(d0, id));
      expect(h(d, 'h2')).toBe(h(d0, 'h2'));
      for (const k of ['angleCuts', 'curves', 'profiles', 'bands'] as const) expect(shape(d)[k]).toBe(shape(d0)[k]);
      for (const f of ['offset', 'width', 'depth', 'stopMin', 'stopMax'] as const) expect(c(d, 'c1')[f], `${posture} c1.${f}`).toBe(c(once, 'c1')[f]);
      expect(h(d, 'h1').station).toBe(h(once, 'h1').station);
      expect(h(d, 'h1').alongFrom).toBe(h(once, 'h1').alongFrom);
    }
  });

  it('a mirrored user inside a mirrored assembly lowers as unmirrored: parities cancel', () => {
    for (const posture of POSTURES) {
      const d0 = linkDoc(posture, { inAssembly: { mirrored: true, rotation: 90 } });
      const b = occ(d0, 'i1/b');
      // Its world features ARE the Shape's (two reflections), and an edit there is the same Shape write as through `a`.
      expect(b.holes).toEqual(shape(d0).holes);
      const fn = EDITS[0]![1];
      const viaB = shape(edit1(d0, 'i1/b', fn)).holes;
      const viaA = shape(edit1(d0, 'a', fn)).holes;
      expect(viaB).toEqual(viaA);
      expect(viaB.find((r) => r.id === 'h1')!.station).toBe(shape(d0).holes.find((r) => r.id === 'h1')!.station + 1.5);
      // A rectangular cut through two reflections: within 1e-9 (mirrorCut twice is not bit-exact).
      const rect = EDITS[5]![1];
      const cB = shape(edit1(d0, 'i1/b', rect)).cuts.find((c) => c.id === 'c1')!;
      const cA = shape(edit1(d0, 'a', rect)).cuts.find((c) => c.id === 'c1')!;
      for (const f of ['offset', 'width', 'depth', 'stopMin', 'stopMax'] as const) expect(Math.abs(cB[f] - cA[f])).toBeLessThan(1e-9);
      expect([cB.face, cB.from, cB.across]).toEqual([cA.face, cA.from, cA.across]);
    }
  });

  it('a user that is NOT mirrored but sits in a mirrored assembly still lowers through the assembly alone', () => {
    const d0 = linkDoc('flat', { inAssembly: { mirrored: true }, bMirrored: false });
    const before = occ(d0, 'i1/b');
    const after = EDITS[0]![1](before);
    expect(shape(applyWorldEdits(d0, [{ before, after }])).holes).toEqual(reflected(after).holes);
  });

  it('the mirrored user resolves to mirrorFeatures of the Shape after the edit (resolveBoard and lowering agree)', () => {
    for (const posture of POSTURES) {
      const d1 = edit1(linkDoc(posture, { bRotation: 0 }), 'b', EDITS[0]![1]);
      const sb = shapeBoard(d1);
      expect(occ(d1, 'b').holes).toEqual(mirrorFeatures(sb).holes);
    }
  });
});

describe('postureRefusal and sameSideFirst read sideAt (spec §4)', () => {
  it('a d0-moving posture change on a Shape with a mirrored and an unmirrored user is refused; one keeping d0 is not', () => {
    const d = linkDoc('flat');
    expect(postureRefusal(d, ['a'], 'upright')).toBe(POSTURE_ACROSS_MIRROR);
    expect(postureRefusal(d, ['b'], 'upright')).toBe(POSTURE_ACROSS_MIRROR);
    expect(postureRefusal(d, ['a'], 'on-edge')).toBeNull();
  });
  it('all users on one side: allowed (both mirrored; or a mirrored user in a mirrored assembly beside an unmirrored root user)', () => {
    const allMirrored: SloydDocument = { ...linkDoc('flat'), boards: [user('a', [0, 0, 0], 0, true), user('b', [40, 0, 0], 90, true)] };
    expect(postureRefusal(allMirrored, ['a'], 'upright')).toBeNull();
    expect(postureRefusal(linkDoc('flat', { inAssembly: { mirrored: true } }), ['a'], 'upright')).toBeNull();
  });
  it('sameSideFirst orders by sideAt', () => {
    const d = linkDoc('flat');
    expect(sameSideFirst(d, ['b', 'a'], () => false)).toEqual(['a', 'b']);
    expect(sameSideFirst(d, ['a', 'b'], () => true)).toEqual(['b', 'a']);
    const both = linkDoc('flat', { inAssembly: { mirrored: true } });
    expect(sameSideFirst(both, ['i1/b', 'a'], () => false)).toEqual(['i1/b', 'a']);   // both unmirrored-side: stable
  });
});
