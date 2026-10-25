import { addTurns, inverseTurn, mirrorDim, mirrorFeatures, mirrorInPlace, mirrorPart, placeBoard, placeInstance, rotateVec } from './frames';
import { chiralAll } from './sweepFixtures';
import { boardExtents } from './geometry';
import { boardHoles } from './holes';
import { toWorld } from './snapPoints';
import { chiralPart, rotateQuarter, sameSet } from './turnFixtures';
import { worldSolids } from './designCheck';
import { createBoard } from './document';
import type { Board, Instance, Lean, Posture, Rotation, ShapedBoard } from './types';
import { bodyVerts, boardBodies } from './bodies';
import { chooseFace, leanFlip, leanMap, slopeOf } from './lean';
import { sharedOf } from './links';
import { resolveBoard } from './shapes';

const TURNS: Rotation[] = [0, 90, 180, 270];
const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];

describe('rotateVec', () => {
  it('a quarter turn is turnFixtures.rotateQuarter about the origin, the turn axisFrame uses', () => {
    const p: [number, number, number] = [1.3, 2.7, -0.9];
    expect(rotateVec(90, p)).toEqual(rotateQuarter(p, [0, 0, 0]));
  });
  it('composes by addition', () => {
    const p = [1.3, 2.7, -0.9];
    for (const a of TURNS) for (const b of TURNS) {
      expect(rotateVec(a, rotateVec(b, p))).toEqual(rotateVec(addTurns(a, b), p));
    }
  });
  it('inverseTurn undoes a turn', () => {
    for (const r of TURNS) expect(addTurns(r, inverseTurn(r))).toBe(0);
  });
});

describe('placeBoard (assemblies spec §2.1)', () => {
  it('the identity frame moves nothing, bit for bit, on decimal and millimetre values', () => {
    const b = createBoard({ position: [0.1, 0.2, 300 / 25.4], length: 7.3, rotation: 270, posture: 'on-edge' });
    const out = placeBoard({ position: [0, 0, 0], rotation: 0 }, b);
    expect(out.position).toEqual(b.position);
    expect(out.rotation).toBe(b.rotation);
  });

  it('is a true rotation for every posture, part turn and frame turn', () => {
    const origin = [3.3, 1.7, -2.9];
    for (const posture of POSTURES) for (const rb of TURNS) for (const rf of TURNS) {
      const b = { ...chiralPart(posture), rotation: rb, position: [0.4, 0.6, -1.2] as [number, number, number] };
      const placed = placeBoard({ position: origin, rotation: rf }, b);
      const expected = worldSolids(b).map((s) => {
        const a = rotateVec(rf, s.min), c = rotateVec(rf, s.max);
        return [0, 1, 2].flatMap((i) => [Math.min(a[i]!, c[i]!) + origin[i]!, Math.max(a[i]!, c[i]!) + origin[i]!]);
      });
      const got = worldSolids(placed).map((s) => [0, 1, 2].flatMap((i) => [s.min[i]!, s.max[i]!]));
      expect(sameSet(got, expected), `${posture} rb=${rb} rf=${rf}`).toBe(true);
    }
  });
});

describe('placeInstance', () => {
  it('placing through a composed frame agrees with placing twice, within rounding', () => {
    const outer: Instance = { id: 'o', name: 'O', definition: 'd', position: [10.1, 0.3, 3.3], rotation: 90 };
    const inner: Instance = { id: 'i', name: 'I', definition: 'e', position: [0.7, 1.1, 2.3], rotation: 270 };
    const b = { ...chiralPart('upright'), rotation: 180 as Rotation, position: [0.2, 0.1, 0.05] as [number, number, number] };
    const twice = placeBoard(outer, placeBoard(inner, b));
    const once = placeBoard(placeInstance(outer, inner), b);
    expect(once.rotation).toBe(twice.rotation);
    once.position.forEach((v, i) => expect(v).toBeCloseTo(twice.position[i]!, 9));
  });
});

describe('mirrorInPlace (mirrored links, fu 432, spec §3)', () => {
  const boxes = (b: Board) => worldSolids(b).map((s) => [...s.min, ...s.max]);
  const holeCentres = (b: Board) => boardHoles(b).map((h) => toWorld(b, { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] }));
  /** Shift every x (box min/max at 0 and 3; a point at 0) by dx. */
  const shiftBox = (dx: number) => (s: number[]) => [s[0]! + dx, s[1]!, s[2]!, s[3]! + dx, s[4]!, s[5]!];
  /** Reflect a box about x = c by hand: x -> 2c - x, min and max swapped. */
  const reflectBox = (c: number) => (s: number[]) => [2 * c - s[3]!, s[1]!, s[2]!, 2 * c - s[0]!, s[4]!, s[5]!];

  it('keeps the box for every posture x turn (position unchanged)', () => {
    for (const posture of POSTURES) for (const r of TURNS) {
      const b = { ...chiralAll(posture), rotation: r, position: [0.4, 0.6, -1.2] as [number, number, number] };
      const m = mirrorInPlace(b);
      expect(boardExtents(m), `${posture} ${r}`).toEqual(boardExtents(b));
      expect(m.position).toEqual(b.position);
      expect(m.rotation).toBe(inverseTurn(r));
    }
  });

  it('is mirrorPart reflected back about the box centre: world solids and hole centres, every posture x turn', () => {
    for (const posture of POSTURES) for (const r of TURNS) {
      const b = { ...chiralAll(posture), rotation: r, position: [0.4, 0.6, -1.2] as [number, number, number] };
      const m = mirrorInPlace(b);
      const ex = boardExtents(b)[0];
      const dx = 2 * b.position[0] + ex; // mirrorPart reflects about x = 0; in place reflects about the box's centre
      expect(sameSet(boxes(m), boxes(mirrorPart(b)).map(shiftBox(dx))), `${posture} ${r} vs mirrorPart`).toBe(true);
      expect(sameSet(boxes(m), boxes(b).map(reflectBox(b.position[0] + ex / 2))), `${posture} ${r} by hand`).toBe(true);
      const hm = holeCentres(m), hp = holeCentres(mirrorPart(b)).map(([x, y, z]) => [x + dx, y, z]);
      expect(sameSet(hm, hp), `${posture} ${r} holes`).toBe(true);
      // Chiral: the reflection is not the part itself.
      expect(sameSet(hm, holeCentres(b)), `${posture} ${r} chiral`).toBe(false);
    }
  });

  it('mirrorFeatures changes only the six feature arrays', () => {
    const b = { ...chiralAll('upright'), rotation: 90 as Rotation };
    const f = mirrorFeatures(b);
    const { cuts: _c, angleCuts: _a, holes: _h, curves: _k, profiles: _p, bands: _b, ...rest } = f;
    const { cuts: _c2, angleCuts: _a2, holes: _h2, curves: _k2, profiles: _p2, bands: _b2, ...restB } = b;
    expect(rest).toEqual(restB);
    expect(f).toEqual({ ...mirrorPart(b), rotation: b.rotation, position: b.position });
  });
});

describe('a lean through mirrors and assemblies (splayed legs spec §3.4)', () => {
  type V = [number, number, number];
  /** Every vertex of `b`'s bodies in the world, put through its lean map. */
  const leanedVerts = (b: Board): number[][] => {
    const m = leanMap(b)!;
    return boardBodies(b).flatMap(bodyVerts).map(([l, w, t]) => m.apply(toWorld(b, { length: l!, width: w!, thickness: t! })));
  };
  const upright = chiralPart('upright');
  /** Rake = splay (the tie, faces width) and a chiral pair: both slopes non-zero and unequal (the `chiralPart` rule). */
  const LEANS: Lean[] = [
    { x: slopeOf(10), z: slopeOf(10), face: 'width' },
    { x: 0.1, z: 0.25, face: chooseFace(upright, 0.1, 0.25) },
    { x: -0.3, z: 0.05, face: chooseFace(upright, -0.3, 0.05) },
  ];

  it('mirrored user of a diagonal lean is the reflection: every leaned body vertex, every turn', () => {
    for (const lean of LEANS) for (const r of TURNS) {
      const shapes = new Map([['s1', { id: 's1', ...sharedOf({ ...upright, lean }) }]]);
      const at: V = [0.4, 0.6, -1.2];
      const user = (id: string, rotation: Rotation, mirrored: boolean): Board =>
        resolveBoard(shapes, { id, name: id, position: at, rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) } satisfies ShapedBoard)!;
      const plain = user('a', r, false);
      // The X-reflection about the box's centre plane of a part at turn r is its mirror at turn -r (mirrorInPlace).
      const mirrored = user('b', inverseTurn(r), true);
      const c = at[0] + boardExtents(plain)[0] / 2;
      const reflected = leanedVerts(plain).map(([x, y, z]) => [2 * c - x!, y!, z!]);
      expect(sameSet(leanedVerts(mirrored), reflected), `${JSON.stringify(lean)} r=${r}`).toBe(true);
      // Chiral: the reflection is not the part itself.
      expect(sameSet(leanedVerts(mirrored), leanedVerts(plain)), `${JSON.stringify(lean)} r=${r} chiral`).toBe(false);
    }
  });

  it('a part in a turned, mirrored assembly: the world map is the instance frame composed with the part map (8 corners)', () => {
    for (const lean of LEANS) for (const mirrored of [true, false]) for (const ri of TURNS) for (const rb of TURNS) {
      const inst: Instance = { id: 'i', name: 'I', definition: 'd', position: [5.1, 0.3, 2.3], rotation: ri, ...(mirrored ? { mirrored: true } : {}) };
      const part: Board = { ...upright, lean, rotation: rb, position: [0.4, 0.2, -1.1] };
      const world = placeBoard(inst, part);
      /** The instance frame on a point: reflect local X when mirrored, then turn, then translate (placeBoard's order). */
      const frame = (p: readonly number[]): V => {
        const q = rotateVec(ri, mirrored ? [0 - p[0]!, p[1]!, p[2]!] : p);
        return [inst.position[0] + q[0], inst.position[1] + q[1], inst.position[2] + q[2]];
      };
      const e = boardExtents(part);
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k): V => [0, 1, 2].map((i) => part.position[i]! + ((k >> i) & 1) * e[i]!) as V);
      const local = leanMap(part)!, mapped = leanMap(world)!;
      const tag = `${JSON.stringify(lean)} m=${mirrored} ri=${ri} rb=${rb}`;
      for (const p of corners) {
        const want = frame(local.apply(p));
        const got = mapped.apply(frame(p));
        for (let i = 0; i < 3; i += 1) expect(Math.abs(got[i]! - want[i]!), tag).toBeLessThan(1e-9);
      }
    }
  });

  it('mirrorFeatures flips a lean by leanFlip (its own inverse, bit for bit) and adds no key to a lean-free part', () => {
    const lean = LEANS[1]!;
    const f = mirrorFeatures({ ...upright, lean });
    expect(f.lean).toEqual(leanFlip(lean));
    expect(Object.is(mirrorFeatures(f).lean!.x, lean.x)).toBe(true);
    expect(mirrorFeatures(f).lean).toEqual(lean);
    expect('lean' in mirrorFeatures(upright)).toBe(false);
    expect('lean' in mirrorPart(upright)).toBe(false);
  });
});

describe('round tenons through mirrors (round tenons spec §3.1, inv 44)', () => {
  // Chiral: a tenon on the max end only.
  const TENON = { id: 't1', end: 'max' as const, diameter: 0.75, length: 1 };
  const rung = (posture: Posture): Board => ({ ...chiralPart(posture), tenons: [TENON] });

  it('a mirrored instance\'s world part has its tenon on the mirrored end', () => {
    for (const posture of ['flat', 'on-edge'] as const) for (const r of TURNS) {
      const b = rung(posture);
      expect(mirrorDim(b), posture).toBe('length');   // else the brief's "don't swap" mutation could not fail
      const plain: Instance = { id: 'i', name: 'I', definition: 'd', position: [5, 0, 2], rotation: r };
      expect(placeBoard({ ...plain, mirrored: true }, b).tenons, `${posture} ${r}`).toEqual([{ ...TENON, end: 'min' }]);
      // Unmirrored: unchanged.
      expect(placeBoard(plain, b).tenons, `${posture} ${r} plain`).toEqual([TENON]);
    }
    // Upright: the mirror runs across the width, so the ends stay (the same array).
    const up = rung('upright');
    expect(mirrorDim(up)).toBe('width');
    expect(mirrorPart(up).tenons).toBe(up.tenons);
  });

  it('mirrorFeatures adds no tenons key to a tenon-free part; a mirrored user resolves to the reflection', () => {
    expect('tenons' in mirrorFeatures(chiralPart('flat'))).toBe(false);
    expect('tenons' in mirrorPart(chiralPart('flat'))).toBe(false);
    const shapes = new Map([['s1', { id: 's1', ...sharedOf(rung('flat')) }]]);
    const user = resolveBoard(shapes, { id: 'u', name: 'U', position: [0, 0, 0], rotation: 0, shape: 's1', mirrored: true } satisfies ShapedBoard)!;
    expect(user.tenons).toEqual([{ ...TENON, end: 'min' }]);
  });
});
