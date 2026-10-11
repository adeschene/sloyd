import { describe, expect, it } from 'vitest';
import { applyWorldEdits, translateItems } from './treeEdit';
import { createDocument } from './document';
import { worldParts } from './tree';
import { worldSolids } from './designCheck';
import { chiralPart, sameSet } from './turnFixtures';
import { CUT_GEOMETRY_KEYS } from './cuts';
import type { Board, Cut, Instance, Rotation, SloydDocument } from './types';

const TURNS: Rotation[] = [0, 90, 180, 270];
const POSTURES = ['flat', 'on-edge', 'upright'] as const;

/** Root -> i1 (frame A) -> [depth 2: i2 (frame B) ->] part b1. */
const doc = (b: Board, A: Partial<Instance>, B?: Partial<Instance>): SloydDocument => {
  const inner: Instance = { id: 'i2', name: 'Inner', definition: 'd2', position: [1, 0.5, -2], rotation: 90, ...B };
  return {
    ...createDocument('Mirror'),
    instances: [{ id: 'i1', name: 'Outer', definition: 'd1', position: [6, 0, 3], rotation: 0, ...A }],
    definitions: B
      ? [{ id: 'd1', boards: [], instances: [inner] }, { id: 'd2', boards: [{ ...b, id: 'b1' }], instances: [] }]
      : [{ id: 'd1', boards: [{ ...b, id: 'b1' }], instances: [] }],
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

  it('review focus 1: a resize (Properties rule) in a mirrored copy grows the copy as the mirror of the original', () => {
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
});
