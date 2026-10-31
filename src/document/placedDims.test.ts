import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { boardSnapPoints, cutSnapPoints, fromWorld, snapPointsFor, toWorld } from './snapPoints';
import type { SnapPoint } from './snapPoints';
import { setMirrored } from './treeOps';
import { worldParts } from './tree';
import { assemblyDoc, cabinetsDoc } from './treeFixtures';
import { chiralAngled, chiralHoled, chiralPart } from './turnFixtures';
import { DIM_EPS, anchorFor, dimensionAxis, dimensionValue, rekeyDimensions, resolveAnchor } from './placedDims';
import type { Board, Shape, SloydDocument } from './types';

const near = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= DIM_EPS);

const leaning = (): Board => ({
  ...createBoard({ id: 'leg', length: 16, width: 1.5, thickness: 1.5, posture: 'upright', position: [3.3, 0.2, 1.1] }),
  lean: { x: 0.2, z: 0.1, face: 'width', square: true },
});

const cutAndAngled = (): Board => ({
  ...chiralAngled('flat'),
  id: 'ca',
  cuts: [{ id: 'c9', face: 'thickness', from: 'max', across: 'width', offset: 1, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 }],
});

const ownMirror = (): SloydDocument => {
  const c = chiralPart('flat');
  const shape: Shape = {
    id: 's1', length: c.length, width: c.width, thickness: c.thickness, material: 'pine', grain: 'length', posture: 'flat',
    cuts: c.cuts, angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: [],
  };
  return {
    ...createDocument(),
    boards: [{ id: 'm1', name: 'M', position: [2.5, 0, 1.5], rotation: 90, shape: 's1', mirrored: true }],
    shapes: [shape],
  };
};

const mirroredInstance = (): SloydDocument => {
  const doc = assemblyDoc();
  return setMirrored(doc, 'i1', true);
};

const fixtures: Array<[string, () => Board[]]> = [
  ['plain', () => [createBoard({ id: 'p', position: [1.3, 0.7, 2.1] })]],
  ['turned 90', () => [createBoard({ id: 't', length: 20, width: 4, thickness: 1.5, rotation: 90, position: [1.3, 0.7, 2.1] })]],
  ['posture changed', () => [createBoard({ id: 'e', length: 20, width: 4, thickness: 1.5, posture: 'on-edge', position: [1.3, 0.7, 2.1] })]],
  ['chiralPart with an own mirror', () => worldParts(ownMirror())],
  ['part in a mirrored instance', () => worldParts(mirroredInstance())],
  ['leaning (square-set)', () => [leaning()]],
  ['holed', () => [{ ...chiralHoled('flat'), id: 'h', position: [1, 2, 3] }]],
  ['rectangular cut and angle cut', () => [cutAndAngled()]],
];

describe('anchorFor / resolveAnchor round trip (spec §2.2)', () => {
  for (const [name, make] of fixtures) {
    it(`${name}: every snap point resolves back to its own position`, () => {
      const parts = make();
      let n = 0;
      for (const b of parts) {
        for (const p of snapPointsFor(b)) {
          const anchor = anchorFor(parts, p);
          expect(anchor).not.toBeNull();
          const back = resolveAnchor(parts, anchor!);
          expect(back, `${b.id} ${p.kind}`).not.toBeNull();
          expect(near(back!, p.at), `${b.id} ${p.kind} ${p.at} vs ${back}`).toBe(true);
          n += 1;
        }
      }
      expect(n).toBeGreaterThan(0);
    });
  }
});

describe('lattice vs local', () => {
  it('every lattice point of a leaning part is a frac anchor, never local', () => {
    const b = leaning();
    const parts = [b];
    const pts = boardSnapPoints(b);
    expect(pts.length).toBe(26);
    for (const p of pts) expect(anchorFor(parts, p)).toHaveProperty('frac');
  });
  const cutBoard = (offset: number): Board => createBoard({
    id: 'cb', length: 10, width: 4, thickness: 1.5, position: [1, 2, 3],
    cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 }],
  });
  it("a cut's floor corner is a local anchor at the cut floor", () => {
    const b = cutBoard(1);
    const corners = cutSnapPoints(b).filter((p) => p.kind === 'corner');
    expect(corners.length).toBeGreaterThan(0);
    // depth 0.5 from max on a 1.5 board: the floor is at thickness 1.0 (by hand).
    const floor = corners.filter((p) => Math.abs(fromWorld(b, p.at).thickness - 1) < 1e-9);
    expect(floor.length).toBeGreaterThan(0);
    for (const p of floor) {
      const a = anchorFor([b], p)!;
      expect(a).toHaveProperty('local');
      expect((a as { local: { thickness: number } }).local.thickness).toBeCloseTo(1, 9);
    }
  });
  it('a feature point 1e-6 from a lattice value stays local (the tolerance is 1e-9)', () => {
    const b = cutBoard(1e-6);
    const near1e6 = cutSnapPoints(b).filter((p) => {
      const l = fromWorld(b, p.at);
      // the mouth corner: width and thickness sit on the lattice (0, 1.5); only length is 1e-6 off it
      return Math.abs(l.length - 1e-6) < 1e-9 && Math.abs(l.width) < 1e-12 && Math.abs(l.thickness - 1.5) < 1e-9;
    });
    expect(near1e6.length).toBeGreaterThan(0);
    for (const p of near1e6) expect(anchorFor([b], p)).toHaveProperty('local');
  });
  it('a board-owned point whose part is missing yields null, not { at }', () => {
    const b = cutBoard(1);
    expect(anchorFor([], boardSnapPoints(b)[0]!)).toBeNull();
  });
  it('a hole centred on a face anchors as the face centre (frac)', () => {
    const b = createBoard({
      id: 'hc', length: 10, width: 4, thickness: 1.5,
      holes: [{ id: 'h', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.5, along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 2 }],
    });
    const pts = boardSnapPoints(b);
    expect(pts.length).toBe(26);
    for (const p of pts) expect(anchorFor([b], p)).toHaveProperty('frac');
  });
});

describe('resize (spec §2.1)', () => {
  it('a frac max-end corner follows the resize; a local anchor keeps its part-space station', () => {
    const b = cutAndAngled();
    const lat = boardSnapPoints({ ...b, cuts: [], angleCuts: [] });
    const lattice = new Set(lat.map((p) => p.at.join()));
    const local = boardSnapPoints(b).find((p) => p.kind === 'corner' && !lattice.has(p.at.join()))!;
    const maxCorner = boardSnapPoints(b).find((p) => {
      const l = fromWorld(b, p.at);
      return Math.abs(l.length - b.length) < 1e-9 && Math.abs(l.width) < 1e-9 && Math.abs(l.thickness) < 1e-9;
    })!;
    const fa = anchorFor([b], maxCorner)!;
    const la = anchorFor([b], local)!;
    expect(fa).toHaveProperty('frac');
    expect(la).toHaveProperty('local');
    const bigger = { ...b, length: b.length + 6 };
    const before = resolveAnchor([b], fa)!;
    const after = resolveAnchor([bigger], fa)!;
    const delta = after.map((v, i) => v - before[i]!);
    const expected = toWorld(bigger, { length: bigger.length, width: 0, thickness: 0 }).map((v, i) => v - maxCorner.at[i]!);
    expect(near(delta, expected)).toBe(true);
    expect(Math.hypot(...delta)).toBeCloseTo(6, 9);
    const loc = (la as { local: Record<string, number> }).local;
    expect(near(Object.values(fromWorld(bigger, resolveAnchor([bigger], la)!)), Object.values(loc))).toBe(true);
  });
});

describe('detached anchors', () => {
  it('a missing part resolves to null, and so does the dimension', () => {
    const parts = [createBoard({ id: 'p' })];
    expect(resolveAnchor(parts, { part: 'gone', frac: { length: 0, width: 0, thickness: 0 } })).toBeNull();
    expect(resolveAnchor(parts, { part: 'gone', local: { length: 1, width: 1, thickness: 1 } })).toBeNull();
    expect(dimensionValue(parts, {
      id: 'd', axis: 'x', a: { at: [0, 0, 0] }, b: { part: 'gone', frac: { length: 1, width: 0, thickness: 0 } },
    })).toBeNull();
  });
  it('an at-only dimension has a value', () => {
    expect(dimensionValue([], { id: 'd', axis: 'y', a: { at: [0, 1, 0] }, b: { at: [3, 5, 9] } })).toBe(4);
  });
});

describe('copies of a definition', () => {
  it('a path inside one placement resolves on THAT copy only', () => {
    const doc = cabinetsDoc();
    const parts = worldParts(doc);
    const c1 = parts.find((b) => b.id === 'c1/side')!;
    const c2 = parts.find((b) => b.id === 'c2/side')!;
    expect(c2.position[0] - c1.position[0]).toBe(30);
    const a = { part: 'c2/side', frac: { length: 0, width: 0, thickness: 0 } } as const;
    const at = resolveAnchor(parts, a)!;
    expect(near(at, toWorld(c2, { length: 0, width: 0, thickness: 0 }))).toBe(true);
    expect(near(at, toWorld(c1, { length: 0, width: 0, thickness: 0 }))).toBe(false);
  });
});

describe('guide-owned and offset points are fixed in the world', () => {
  const b = createBoard({ id: 'p' });
  const base: SnapPoint = { kind: 'guide', at: [1.5, 2.5, 3.5], owner: { type: 'guide', id: 'g1' } };
  it.each<[string, SnapPoint]>([
    ['a guide point', base],
    ['a line crossing', { ...base, kind: 'line-cross', owner: { type: 'guide', id: 'g1', cross: 'g2' } }],
    ['a line-face hit', { ...base, kind: 'line-face', owner: { type: 'guide', id: 'g1', board: 'p' } }],
    ['a stepped offset', { kind: 'offset', at: [1.5, 2.5, 3.5], owner: { type: 'board', id: 'p' }, base: { ...base, kind: 'corner', owner: { type: 'board', id: 'p' } } }],
  ])('%s yields { at }', (_n, p) => {
    expect(anchorFor([b], p)).toEqual({ at: [1.5, 2.5, 3.5] });
  });
});

describe('dimensionAxis, the D decider (spec §3)', () => {
  const O: [number, number, number] = [0, 0, 0];
  it('one differing axis, no lock, picks it', () => {
    expect(dimensionAxis(O, [0, 5, 0], null)).toEqual({ axis: 'y' });
  });
  it('an oblique pair with no lock refuses', () => {
    expect(dimensionAxis(O, [3, 5, 0], null)).toEqual({ refusal: 'Lock an axis (X, Y or Z) to keep a dimension.' });
  });
  it('an oblique pair with a lock takes the lock', () => {
    expect(dimensionAxis(O, [3, 5, 0], 'x')).toEqual({ axis: 'x' });
  });
  it('level along the locked axis refuses, per letter', () => {
    expect(dimensionAxis(O, [0, 5, 0], 'x')).toEqual({ refusal: 'The two points are level along X.' });
    expect(dimensionAxis(O, [5, 0, 0], 'y')).toEqual({ refusal: 'The two points are level along Y.' });
    expect(dimensionAxis(O, [5, 0, 0], 'z')).toEqual({ refusal: 'The two points are level along Z.' });
  });
  it('a 1e-12 difference on X plus 5 on Y is vertical (the tolerance)', () => {
    expect(dimensionAxis(O, [1e-12, 5, 0], null)).toEqual({ axis: 'y' });
  });
  it('a locked axis differing by only noise is level', () => {
    expect(dimensionAxis(O, [1e-12, 5, 0], 'x')).toEqual({ refusal: 'The two points are level along X.' });
  });
});

describe('rekeyDimensions (spec §2.3)', () => {
  const doc = (): SloydDocument => ({
    ...createDocument(),
    dimensions: [
      { id: 'd1', axis: 'x', a: { part: 'a', frac: { length: 0, width: 0, thickness: 0 } }, b: { at: [1, 2, 3] } },
      { id: 'd2', axis: 'y', a: { part: 'b', local: { length: 1, width: 2, thickness: 3 } }, b: { part: 'a', frac: { length: 1, width: 1, thickness: 1 } } },
    ],
  });
  it('maps every part, leaves at anchors alone', () => {
    const out = rekeyDimensions(doc(), (p) => `g/${p}`);
    expect(out.dimensions[0]!.a).toEqual({ part: 'g/a', frac: { length: 0, width: 0, thickness: 0 } });
    expect(out.dimensions[0]!.b).toEqual({ at: [1, 2, 3] });
    expect(out.dimensions[1]!.a).toEqual({ part: 'g/b', local: { length: 1, width: 2, thickness: 3 } });
    expect(out.dimensions[1]!.b).toEqual({ part: 'g/a', frac: { length: 1, width: 1, thickness: 1 } });
  });
  it('returns the same document for the identity', () => {
    const d = doc();
    expect(rekeyDimensions(d, (p) => p)).toBe(d);
  });
});
