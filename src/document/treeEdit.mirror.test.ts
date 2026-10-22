import { describe, expect, it } from 'vitest';
import { applyWorldEdits, translateItems } from './treeEdit';
import { mirrorDim } from './frames';
import { mirrorBands, withBands } from './bandModel';
import { createDocument } from './document';
import { flatDocument, worldParts } from './tree';
import { profileAsCurve, profileFromFields, sameProfile } from './profiles';
import { curvedRefusal } from './curvedRefusal';
import { boardExtents } from './geometry';
import { worldSolids } from './designCheck';
import { chiralAngled, chiralCurved, chiralHoled, chiralPart, sameSet } from './turnFixtures';
import { sameHoleRow } from './holes';
import { archCurve, archFields, sameCurve } from './curves';
import { sameAngleCut } from './angleCuts';
import { SHARED_KEYS, sameShared, sharedOf } from './links';
import { CUT_GEOMETRY_KEYS } from './cuts';
import type { Board, Cut, Instance, ProfileCut, Rotation, SloydDocument } from './types';

const TURNS: Rotation[] = [0, 90, 180, 270];
const POSTURES = ['flat', 'on-edge', 'upright'] as const;

/** Root -> i1 (frame A) -> [depth 2: i2 (frame B) ->] part b1. */
const doc = (b: Board, A: Partial<Instance>, B?: Partial<Instance>): SloydDocument => {
  const inner: Instance = { id: 'i2', name: 'Inner', definition: 'd2', position: [1, 0.5, -2], rotation: 90, ...B };
  return {
    ...createDocument('Mirror'),
    instances: [{ id: 'i1', name: 'Outer', definition: 'd1', position: [6, 0, 3], rotation: 0, ...A }],
    definitions: B
      ? [{ id: 'd1', boards: [], instances: [inner], hardware: [] }, { id: 'd2', boards: [{ ...b, id: 'b1' }], instances: [], hardware: [] }]
      : [{ id: 'd1', boards: [{ ...b, id: 'b1' }], instances: [], hardware: [] }],
  };
};
const occ = (d: SloydDocument) => worldParts(d).find((p) => p.id.endsWith('b1'))!;
const stored = (d: SloydDocument) => d.definitions.flatMap((x) => x.boards).find((p) => p.id === 'b1') as Board;
const solids = (b: Board) => worldSolids(b).map((s) => [...s.min, ...s.max]);
const sameCutGeometry = (a: Cut, b: Cut) => CUT_GEOMETRY_KEYS.every((k) => {
  const x = a[k]; const y = b[k];
  return typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 1e-9 : x === y;
});
/** Place(lower(after)) returns after: same turn, posture and sizes; position and solids within 1e-9. */
const expectPlacedBack = (got: Board, after: Board, label: string) => {
  expect([got.rotation, got.posture, got.length, got.width, got.thickness], label).toEqual([after.rotation, after.posture, after.length, after.width, after.thickness]);
  got.position.forEach((v, i) => expect(Math.abs(v - after.position[i]!), label).toBeLessThan(1e-9));
  expect(sameSet(solids(got), solids(after)), label).toBe(true);
  expect(got.cuts.length, label).toBe(after.cuts.length);
  got.cuts.forEach((c, i) => expect(sameCutGeometry(c, after.cuts[i]!), `${label} cut ${i}`).toBe(true));
};
const CHAINS: Array<[string, Partial<Instance>, Partial<Instance> | undefined]> = [
  ['plain', { rotation: 90 }, undefined],
  ['mirrored', { rotation: 90, mirrored: true }, undefined],
  ['mirrored outer', { rotation: 180, mirrored: true }, { rotation: 90 }],
  ['mirrored inner', { rotation: 270 }, { rotation: 90, mirrored: true }],
  ['both mirrored', { rotation: 90, mirrored: true }, { rotation: 270, mirrored: true }],
];

describe('write-back through a mirror is the exact inverse (mirrored-instances spec §4)', () => {
  it('a move, for every chain x posture x stored turn', () => {
    for (const [name, A, B] of CHAINS) for (const posture of POSTURES) for (const s of TURNS) {
      const d = doc({ ...chiralPart(posture), rotation: s, position: [0.5, 0.25, 1.25] }, A, B);
      const before = occ(d);
      const after = { ...before, position: [before.position[0] + 1.5, before.position[1] + 0.25, before.position[2] - 0.75] as [number, number, number] };
      expectPlacedBack(occ(applyWorldEdits(d, [{ before, after }])), after, `${name} ${posture} ${s}`);
    }
  });

  it('a turn: placed back exactly; under an odd mirror the stored turn moves the other way and the stored cuts are the SAME objects', () => {
    for (const [name, A, B] of CHAINS) for (const posture of POSTURES) for (const s of TURNS) {
      const d = doc({ ...chiralPart(posture), rotation: s, position: [0.5, 0.25, 1.25] }, A, B);
      const before = occ(d);
      const after = { ...before, rotation: ((before.rotation + 90) % 360) as Rotation };
      const out = applyWorldEdits(d, [{ before, after }], { keepWorld: true });
      expectPlacedBack(occ(out), after, `${name} ${posture} ${s}`);
      expect(stored(out).cuts, `${name} ${posture} ${s}`).toBe(stored(d).cuts);
    }
    const one = doc({ ...chiralPart('flat'), rotation: 0 }, { rotation: 0, mirrored: true });
    const b0 = occ(one);
    expect(b0.rotation).toBe(0);
    expect(stored(applyWorldEdits(one, [{ before: b0, after: { ...b0, rotation: 90 } }], { keepWorld: true })).rotation).toBe(270);
  });

  it('an added cut is stored mirrored back and placed back within 1e-9; the old cuts stay the same objects', () => {
    for (const [name, A, B] of CHAINS) for (const posture of POSTURES) {
      const d = doc({ ...chiralPart(posture), rotation: 90 }, A, B);
      const before = occ(d);
      const extra: Cut = { id: 'x', face: 'thickness', from: 'max', across: 'width', offset: 3, width: 0.5, depth: 0.25, stopMin: 0.5, stopMax: 0 };
      const after = { ...before, cuts: [...before.cuts, extra] };
      const out = applyWorldEdits(d, [{ before, after }]);
      expectPlacedBack(occ(out), after, `${name} ${posture}`);
      stored(d).cuts.forEach((c, i) => expect(stored(out).cuts[i], `${name} ${posture} ${i}`).toBe(c));
    }
  });

  it('flat <-> upright under one mirror re-mirrors the stored cuts so the edited part stays as seen', () => {
    for (const [from, to] of [['flat', 'upright'], ['upright', 'flat'], ['on-edge', 'upright']] as const) {
      const d = doc({ ...chiralPart(from), rotation: 0 }, { rotation: 0, mirrored: true });
      const before = occ(d);
      const after = { ...before, posture: to };
      const out = applyWorldEdits(d, [{ before, after }], { keepWorld: true });
      expectPlacedBack(occ(out), after, `${from}->${to}`);
      expect(stored(out).cuts, `${from}->${to}`).not.toBe(stored(d).cuts);
    }
    // flat <-> on-edge keeps d0 = length: the stored cuts are untouched.
    const d = doc({ ...chiralPart('flat'), rotation: 0 }, { rotation: 0, mirrored: true });
    const before = occ(d);
    const out = applyWorldEdits(d, [{ before, after: { ...before, posture: 'on-edge' } }], { keepWorld: true });
    expect(stored(out).cuts).toBe(stored(d).cuts);
  });

  it('an untouched cut survives ten moves bit-identical (no float drift)', () => {
    let d = doc({ ...chiralPart('upright'), rotation: 90, position: [0.1, 0.2, 0.3] }, { rotation: 90, mirrored: true }, { rotation: 270, mirrored: true });
    const original = stored(d).cuts;
    for (let k = 0; k < 10; k += 1) {
      const before = occ(d);
      d = applyWorldEdits(d, [{ before, after: { ...before, position: [before.position[0] + 0.1, before.position[1], before.position[2] + 0.3] } }]);
    }
    expect(stored(d).cuts).toBe(original);
  });

  it('a resize (Properties rule) in a mirrored copy grows the copy as the mirror of the original', () => {
    const base = doc({ ...chiralPart('flat'), rotation: 0, position: [1, 0, 1] }, { rotation: 0 });
    const twin: SloydDocument = {
      ...base,
      instances: [...base.instances, { id: 'i9', name: 'Right', definition: 'd1', position: [40, 0, 3], rotation: 0, mirrored: true }],
    };
    const left = worldParts(twin).find((p) => p.id === 'i1/b1')!;
    const out = applyWorldEdits(twin, [{ before: left, after: { ...left, length: left.length + 2 } }]);
    const L = worldParts(out).find((p) => p.id === 'i1/b1')!;
    const R = worldParts(out).find((p) => p.id === 'i9/b1')!;
    // Left grew toward +X from its kept min corner; the right grew toward -X from its kept max corner.
    expect(L.position[0]).toBe(left.position[0]);
    const rBefore = worldParts(twin).find((p) => p.id === 'i9/b1')!;
    expect(R.position[0] + R.length).toBeCloseTo(rBefore.position[0] + rBefore.length, 9);
    expect(R.position[0]).toBeCloseTo(rBefore.position[0] - 2, 9);
  });

  it('translateItems moves a part inside a mirrored, turned chain by the world delta exactly', () => {
    for (const [name, A, B] of CHAINS) {
      const d = doc({ ...chiralPart('flat'), rotation: 90 }, A, B);
      const p = occ(d);
      const id = B ? 'i1/i2/b1' : 'i1/b1';
      const moved = occ(translateItems(d, [id], [2, 0.5, -1]));
      [2, 0.5, -1].forEach((dw, i) => expect(Math.abs(moved.position[i]! - (p.position[i]! + dw)), name).toBeLessThan(1e-9));
    }
  });

  it('a Properties resize (no keepWorld) leaves the stored cuts the SAME object through a mirrored occurrence, as through a plain one', () => {
    const base = doc({ ...chiralPart('flat'), rotation: 0, position: [1, 0, 1] }, { rotation: 0 });
    const twin: SloydDocument = {
      ...base,
      instances: [...base.instances, { id: 'i9', name: 'Right', definition: 'd1', position: [40, 0, 3], rotation: 0, mirrored: true }],
    };
    const grow = (id: string) => {
      const p = worldParts(twin).find((q) => q.id === id)!;
      return applyWorldEdits(twin, [{ before: p, after: { ...p, length: p.length + 2 } }]);
    };
    const viaPlain = grow('i1/b1');
    const viaMirror = grow('i9/b1');
    expect(stored(viaPlain).cuts).toBe(stored(twin).cuts);
    expect(stored(viaMirror).cuts).toBe(stored(twin).cuts);
    expect(stored(viaMirror)).toEqual(stored(viaPlain));
    // Independently stated: i1 sits at x+6, i9 reflects local x about 40, so
    // world x_R = 46 - x_L (instances are unturned). Compare every solid.
    const L = worldParts(viaMirror).find((q) => q.id === 'i1/b1')!;
    const R = worldParts(viaMirror).find((q) => q.id === 'i9/b1')!;
    const reflected = solids(L).map(([a, b, c, d, e, f]) => [46 - d!, b!, c!, 46 - a!, e!, f!]);
    expect(sameSet(solids(R), reflected)).toBe(true);
  });

  it('a keepWorld resize under a mirror (min kept, or max kept) is placed back exactly', () => {
    for (const [name, A, B] of CHAINS) for (const posture of POSTURES) for (const s of TURNS) for (const keep of ['min', 'max'] as const) {
      const d = doc({ ...chiralPart(posture), rotation: s, position: [0.5, 0.25, 1.25] }, A, B);
      const before = occ(d);
      const grown = { ...before, length: before.length + 2 };
      const ext0 = boardExtents(before);
      const ext1 = boardExtents(grown);
      const position = before.position.map((v, a) => (keep === 'min' ? v : v - (ext1[a]! - ext0[a]!))) as [number, number, number];
      const after = { ...grown, position };
      expectPlacedBack(occ(applyWorldEdits(d, [{ before, after }], { keepWorld: true })), after, `${name} ${posture} ${s} ${keep}`);
    }
  });

  it('a posture change moving d0 (Properties rule) keeps the world cuts as seen with stored cuts re-reflected; one that keeps d0 leaves them', () => {
    for (const [from, to] of [['flat', 'upright'], ['upright', 'flat'], ['on-edge', 'upright']] as const) {
      const d = doc({ ...chiralPart(from), rotation: 0 }, { rotation: 0, mirrored: true });
      const before = occ(d);
      const out = applyWorldEdits(d, [{ before, after: { ...before, posture: to } }]);
      expect(stored(out).cuts, `${from}->${to}`).not.toBe(stored(d).cuts);
      const now = occ(out);
      expect(now.cuts.length).toBe(before.cuts.length);
      now.cuts.forEach((c, i) => expect(sameCutGeometry(c, before.cuts[i]!), `${from}->${to} cut ${i}`).toBe(true));
    }
    const d = doc({ ...chiralPart('flat'), rotation: 0 }, { rotation: 0, mirrored: true });
    const before = occ(d);
    const out = applyWorldEdits(d, [{ before, after: { ...before, posture: 'on-edge' } }]);
    expect(stored(out).cuts).toBe(stored(d).cuts);
  });
});

describe('angle cuts through a mirrored instance (Review Focus 1)', () => {
  it('an untouched edit keeps the stored angle cuts object', () => {
    const d0 = doc(chiralAngled('flat'), { mirrored: true });
    const before = occ(d0);
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, length: before.length + 1 } }]);
    expect(stored(d1).angleCuts).toBe(stored(d0).angleCuts);
  });

  it('an edit to a world taper writes back the mirror of it, and placing it again shows the edit', () => {
    const d0 = doc(chiralAngled('upright'), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const edited = before.angleCuts.map((c) => (c.id === 'a1' ? { ...c, points: [[0, 1], [10, 0]] as [[number, number], [number, number]] } : c));
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, angleCuts: edited } }]);
    const shown = occ(d1).angleCuts.find((c) => c.id === 'a1')!;
    expect(sameAngleCut(shown, edited.find((c) => c.id === 'a1')!)).toBe(true);
    // Repeated identical edits do not drift.
    const d2 = applyWorldEdits(d1, [{ before: occ(d1), after: { ...occ(d1), angleCuts: occ(d1).angleCuts.map((c) => ({ ...c })) } }]);
    stored(d1).angleCuts.forEach((c, i) => expect(stored(d2).angleCuts[i]).toBe(c));
  });

  it('a posture change moving d0 keeps the world angle cuts as seen (stored ones re-reflected); one keeping d0 leaves them', () => {
    for (const A of [{ mirrored: true }, { mirrored: true, rotation: 90 as const }]) {
      for (const [from, to] of [['flat', 'upright'], ['upright', 'on-edge']] as const) {
        const d = doc(chiralAngled(from), A);
        const before = occ(d);
        const out = applyWorldEdits(d, [{ before, after: { ...before, posture: to } }]);
        expect(stored(out).angleCuts, `${from}->${to}`).not.toBe(stored(d).angleCuts);
        const now = occ(out);
        expect(now.angleCuts.length).toBe(before.angleCuts.length);
        now.angleCuts.forEach((c, i) => expect(sameAngleCut(c, before.angleCuts[i]!), `${from}->${to} ${i}`).toBe(true));
      }
      const d = doc(chiralAngled('flat'), A);
      const before = occ(d);
      const out = applyWorldEdits(d, [{ before, after: { ...before, posture: 'on-edge' } }]);
      expect(stored(out).angleCuts).toBe(stored(d).angleCuts);
    }
  });

  it('a shaped part (all users on the mirrored side) keeps its world angle cuts through a d0-moving posture change', () => {
    const d0 = doc(chiralAngled('flat'), { mirrored: true });
    const b = stored(d0);
    const own = Object.fromEntries(Object.entries(b).filter(([k]) => !(SHARED_KEYS as string[]).includes(k)));
    const shaped = { ...own, shape: 's1' } as unknown as Board;
    const d = { ...d0, shapes: [{ id: 's1', ...sharedOf(b) }], definitions: [{ ...d0.definitions[0]!, boards: [shaped] }] };
    const before = occ(d);
    expect(before.shape).toBe('s1');
    const out = applyWorldEdits(d, [{ before, after: { ...before, posture: 'upright' } }]);
    const now = occ(out);
    expect(now.angleCuts.length).toBe(before.angleCuts.length);
    now.angleCuts.forEach((c, i) => expect(sameAngleCut(c, before.angleCuts[i]!), `cut ${i}`).toBe(true));
    expect(out.shapes[0]!.angleCuts).not.toEqual(d.shapes[0]!.angleCuts);
  });
});

describe('holes through a mirror (Review Focus 3)', () => {
  it('an edit elsewhere keeps the stored rows (the same array)', () => {
    const d0 = doc(chiralHoled('flat'), { mirrored: true });
    const before = occ(d0);
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, name: 'Renamed' } }]);
    expect(stored(d1).holes).toBe(stored(d0).holes);
  });
  it('a resize keeps the stored rows (the same array)', () => {
    const d0 = doc(chiralHoled('flat'), { mirrored: true });
    const before = occ(d0);
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, length: before.length + 1 } }]);
    expect(stored(d1).holes).toBe(stored(d0).holes);
  });
  it('an edit to a world row writes back its mirror; placing again shows the edit; repeats do not drift', () => {
    const d0 = doc(chiralHoled('upright'), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const edited = before.holes.map((r) => (r.id === 'h1' ? { ...r, station: 6 } : r));
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, holes: edited } }]);
    expect(sameHoleRow(occ(d1).holes.find((r) => r.id === 'h1')!, edited.find((r) => r.id === 'h1')!)).toBe(true);
    expect(stored(d1).holes.find((r) => r.id === 'h1')).not.toEqual(edited.find((r) => r.id === 'h1'));   // stored is the mirror
    const d2 = applyWorldEdits(d1, [{ before: occ(d1), after: { ...occ(d1), holes: occ(d1).holes.map((r) => ({ ...r })) } }]);
    stored(d1).holes.forEach((r, i) => expect(stored(d2).holes[i]).toBe(r));
  });
  it('a posture change moving d0 keeps the world rows as seen (stored ones re-reflected); one keeping d0 leaves them', () => {
    // The ONLY path to changedKeys' second clause (cur.holes !== after.holes && cur.holes !== resolved.holes): the
    // rows are not edited, but the lowering re-reflects them along the NEW d0.
    for (const A of [{ mirrored: true }, { mirrored: true, rotation: 90 as const }]) {
      for (const [from, to] of [['flat', 'upright'], ['upright', 'on-edge']] as const) {
        const d = doc(chiralHoled(from), A);
        const before = occ(d);
        const out = applyWorldEdits(d, [{ before, after: { ...before, posture: to } }]);
        expect(stored(out).holes, `${from}->${to}`).not.toBe(stored(d).holes);
        const now = occ(out);
        expect(now.holes.length).toBe(before.holes.length);
        now.holes.forEach((r, i) => expect(sameHoleRow(r, before.holes[i]!), `${from}->${to} ${i}`).toBe(true));
      }
      const d = doc(chiralHoled('flat'), A);
      const before = occ(d);
      const out = applyWorldEdits(d, [{ before, after: { ...before, posture: 'on-edge' } }]);
      expect(stored(out).holes).toBe(stored(d).holes);
    }
  });
});

describe('curves through a mirror (Review Focus 2)', () => {
  it('an edit elsewhere keeps the stored curves (the same array)', () => {
    const d0 = doc(chiralCurved('flat'), { mirrored: true });
    const before = occ(d0);
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, name: 'Renamed' } }]);
    expect(stored(d1).curves).toBe(stored(d0).curves);
  });
  it('a resize keeps the stored curves (the same array)', () => {
    const d0 = doc(chiralCurved('flat'), { mirrored: true });
    const before = occ(d0);
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, length: before.length + 1 } }]);
    expect(stored(d1).curves).toBe(stored(d0).curves);
  });
  it('an edit to a world curve writes back its mirror; placing again shows the edit; repeats do not drift', () => {
    const d0 = doc(chiralCurved('upright'), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const edit = (c: typeof before.curves[number]) => ({ ...c, ...archCurve({ ...archFields(c)!, start: 3 }) });
    const edited = before.curves.map((c) => (c.id === 'k1' ? edit(c) : c));
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, curves: edited } }]);
    expect(sameCurve(occ(d1).curves.find((c) => c.id === 'k1')!, edited.find((c) => c.id === 'k1')!)).toBe(true);
    expect(stored(d1).curves.find((c) => c.id === 'k1')).not.toEqual(edited.find((c) => c.id === 'k1'));   // stored is the mirror
    const d2 = applyWorldEdits(d1, [{ before: occ(d1), after: { ...occ(d1), curves: occ(d1).curves.map((c) => ({ ...c })) } }]);
    stored(d1).curves.forEach((c, i) => expect(stored(d2).curves[i]).toBe(c));
  });
  it('a posture change moving d0 keeps the world curves as seen (stored ones re-reflected); one keeping d0 leaves them', () => {
    // The ONLY path to changedKeys' second clause (cur.curves !== after.curves && cur.curves !== resolved.curves).
    for (const A of [{ mirrored: true }, { mirrored: true, rotation: 90 as const }]) {
      for (const [from, to] of [['flat', 'upright'], ['upright', 'on-edge']] as const) {
        const d = doc(chiralCurved(from), A);
        const before = occ(d);
        const out = applyWorldEdits(d, [{ before, after: { ...before, posture: to } }]);
        expect(stored(out).curves, `${from}->${to}`).not.toBe(stored(d).curves);
        const now = occ(out);
        expect(now.curves.length).toBe(before.curves.length);
        now.curves.forEach((c, i) => expect(sameCurve(c, before.curves[i]!), `${from}->${to} ${i}`).toBe(true));
      }
      const d = doc(chiralCurved('flat'), A);
      const before = occ(d);
      const out = applyWorldEdits(d, [{ before, after: { ...before, posture: 'on-edge' } }]);
      expect(stored(out).curves).toBe(stored(d).curves);
    }
  });
});

describe('profiles through a mirror (profile runs a1, Review Focus 2)', () => {
  const q = (over: Partial<ProfileCut> = {}): ProfileCut => ({ id: 'q1',
    ...profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'ogee', size: 0.5, fillet: 0, facing: 'u' }), ...over });
  const withProfile = (b: Board): Board => ({ ...b, profiles: [q()] });
  it('the world profile is the mirror of the stored one: the same curve chunk 1 mirror gives', () => {
    const asCurve = { ...chiralPart('upright'), curves: [profileAsCurve(q())] };
    const asProfile = withProfile(chiralPart('upright'));
    const a = occ(doc(asCurve, { mirrored: true, rotation: 90 }));
    const b = occ(doc(asProfile, { mirrored: true, rotation: 90 }));
    expect(profileAsCurve(b.profiles[0]!)).toEqual(a.curves[0]);
  });
  it('an edit elsewhere and a resize keep the stored profiles (the same array)', () => {
    const d0 = doc(withProfile(chiralPart('flat')), { mirrored: true });
    const before = occ(d0);
    expect(stored(applyWorldEdits(d0, [{ before, after: { ...before, name: 'Renamed' } }])).profiles).toBe(stored(d0).profiles);
    expect(stored(applyWorldEdits(d0, [{ before, after: { ...before, length: before.length + 1 } }])).profiles).toBe(stored(d0).profiles);
  });
  it('an edit to a world profile writes back its mirror; placing again shows the edit; repeats do not drift', () => {
    const d0 = doc(withProfile(chiralPart('upright')), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const edited = before.profiles.map((p) => ({ ...p, size: 0.375 }));
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, profiles: edited } }]);
    expect(sameProfile(occ(d1).profiles[0]!, edited[0]!)).toBe(true);
    expect(stored(d1).profiles[0]!.size).toBe(0.375);
    const d2 = applyWorldEdits(d1, [{ before: occ(d1), after: { ...occ(d1), profiles: occ(d1).profiles.map((p) => ({ ...p })) } }]);
    stored(d1).profiles.forEach((p, i) => expect(stored(d2).profiles[i]).toBe(p));
  });
  it('Link compares profiles by id and value, in order', () => {
    const a = withProfile(chiralPart('flat'));
    expect(sameShared(a, { ...a, profiles: [q()] })).toBe(true);
    expect(sameShared(a, { ...a, profiles: [q({ id: 'other' })] })).toBe(false);
    expect(sameShared(a, { ...a, profiles: [q({ size: 0.375 })] })).toBe(false);
  });
  it('Refine refuses a part with profiles and no curves (joinery accepts it)', () => {
    const d = doc(withProfile(chiralPart('flat')), {});
    expect(curvedRefusal(flatDocument(d), 'refine')).toMatch(/Refine doesn't handle parts with curves yet/);
  });
});

describe('bands through a mirror (edge banding 1, Review Focus 1)', () => {
  const W0 = { across: 'width', from: 'min' } as const;
  const L1 = { across: 'length', from: 'max' } as const;
  const banded = (b: Board): Board => ({ ...b, bands: [{ side: W0, type: 'band-iron-on' }, { side: L1, type: 'band-iron-on' }] });
  it('the world bands are the stored ones flipped across the mirrored dimension', () => {
    const d0 = doc(banded(chiralPart('flat')), { mirrored: true });
    const world = occ(d0);
    const dMirror = mirrorDim(stored(d0) as Board);
    expect(world.bands).toEqual(mirrorBands(stored(d0).bands, dMirror));
  });
  it('an edit elsewhere and a resize keep the stored bands (the same array)', () => {
    const d0 = doc(banded(chiralPart('flat')), { mirrored: true });
    const before = occ(d0);
    expect(stored(applyWorldEdits(d0, [{ before, after: { ...before, name: 'Renamed' } }])).bands).toBe(stored(d0).bands);
    expect(stored(applyWorldEdits(d0, [{ before, after: { ...before, length: before.length + 1 } }])).bands).toBe(stored(d0).bands);
  });
  it('a band set on the mirrored occurrence is stored un-mirrored; placing again shows the edit', () => {
    const d0 = doc(banded(chiralPart('upright')), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const want = withBands(before.bands, [{ across: 'width', from: 'max' }], 'band-iron-on');
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, bands: want } }]);
    expect(occ(d1).bands).toEqual(want);
    expect(stored(d1).bands).toEqual(mirrorBands(want, mirrorDim(stored(d0) as Board)));
  });
});
