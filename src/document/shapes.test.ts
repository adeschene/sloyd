import { describe, expect, it } from 'vitest';
import { LINK_FIELDS, SHARED_KEYS, createBoard, createDocument, isShaped, resolveBoard, shapeMap, worldParts } from './document';
import { ARCH } from './curveFixtures';
import type { Shape, ShapedBoard, SloydDocument } from './document';

const leg: Shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length', posture: 'upright',
  cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 20, width: 2, depth: 0.5, stopMin: 0.25, stopMax: 0.25 }], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const };
const user = (id: string, x: number, rotation: 0 | 90 | 180 | 270 = 0): ShapedBoard =>
  ({ id, name: `Leg ${id}`, position: [x, 0, 0], rotation, shape: 's1' });

describe('shapes', () => {
  it('isShaped tells a shaped part from a plain one', () => {
    expect(isShaped(user('a', 0))).toBe(true);
    expect(isShaped(createBoard())).toBe(false);
  });

  it('resolveBoard fills a shaped part from its shape and keeps its own fields', () => {
    const b = resolveBoard(new Map([['s1', leg]]), user('a', 5, 90))!;
    expect(b).toMatchObject({ id: 'a', name: 'Leg a', position: [5, 0, 0], rotation: 90, shape: 's1', length: 28, posture: 'upright' });
    expect(b.cuts).toEqual(leg.cuts);
    expect(b.cuts[0]).not.toBe(leg.cuts[0]); // copies: no two parts hold one Cut object
  });

  it('resolveBoard reads EVERY shared field of the table from the shape, and only own fields from the part', () => {
    const b = resolveBoard(new Map([['s1', leg]]), user('a', 5, 90))!;
    for (const k of SHARED_KEYS) expect(b[k]).toEqual(leg[k]);
    const own = Object.entries(LINK_FIELDS).filter(([, v]) => v === 'own').map(([k]) => k);
    expect(Object.keys(b).sort()).toEqual([...own, ...SHARED_KEYS].sort());
  });

  it('resolveBoard leaves a shared field the shape lacks ABSENT, not undefined', () => {
    const { grain: _g, ...noGrain } = leg;
    const b = resolveBoard(new Map([['s1', noGrain as unknown as Shape]]), user('a', 0))!;
    expect('grain' in b).toBe(false);
  });

  it('resolveBoard returns a plain part as the SAME object, and null for a missing shape', () => {
    const p = createBoard();
    expect(resolveBoard(new Map(), p)).toBe(p);
    expect(resolveBoard(new Map(), user('a', 0))).toBeNull();
  });

  it('worldParts resolves root shaped parts', () => {
    const doc: SloydDocument = { ...createDocument(), boards: [user('a', 0), user('b', 10)], shapes: [leg] };
    const w = worldParts(doc);
    expect(w.map((b) => [b.id, b.length, b.shape])).toEqual([['a', 28, 's1'], ['b', 28, 's1']]);
    expect(shapeMap(doc).get('s1')).toBe(leg);
  });
});

describe('resolveBoard copies angle cuts', () => {
  it('gives each user its own copy', () => {
    const shape = { id: 's1', length: 29, width: 1.75, thickness: 1.75, posture: 'upright' as const, grain: 'length' as const, material: 'oak', cuts: [],
      angleCuts: [{ id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.625], [24, 0]] as [[number, number], [number, number]] }], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const };
    const shapes = new Map([['s1', shape]]);
    const one = resolveBoard(shapes, { id: 'x', name: 'L1', position: [0, 0, 0], rotation: 0, shape: 's1' })!;
    const two = resolveBoard(shapes, { id: 'y', name: 'L2', position: [3, 0, 0], rotation: 0, shape: 's1' })!;
    expect(one.angleCuts).toEqual(shape.angleCuts);
    expect(one.angleCuts[0]).not.toBe(two.angleCuts[0]);
    expect(one.angleCuts[0]!.points).not.toBe(shape.angleCuts[0]!.points);
  });
});

describe('resolveBoard copies holes', () => {
  it('gives each user its own rows', () => {
    const row = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
    const shape = { id: 's1', length: 30, width: 11.25, thickness: 0.75, posture: 'flat' as const, grain: 'length' as const, material: 'oak', cuts: [], angleCuts: [], holes: [row], curves: [], profiles: [], bands: [], cornerRule: 'long' as const };
    const shapes = new Map([['s1', shape]]);
    const one = resolveBoard(shapes, { id: 'x', name: 'S1', position: [0, 0, 0], rotation: 0, shape: 's1' })!;
    const two = resolveBoard(shapes, { id: 'y', name: 'S2', position: [12, 0, 0], rotation: 0, shape: 's1' })!;
    expect(one.holes).toEqual([row]);
    expect(one.holes).not.toBe(shape.holes);
    expect(one.holes[0]).not.toBe(two.holes[0]);
  });
});

describe('resolveBoard copies curves', () => {
  it('gives each user its own curves', () => {
    const shape = { id: 's1', length: 30, width: 5, thickness: 0.75, posture: 'flat' as const, grain: 'length' as const, material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [ARCH], profiles: [], bands: [], cornerRule: 'long' as const };
    const shapes = new Map([['s1', shape]]);
    const one = resolveBoard(shapes, { id: 'x', name: 'A1', position: [0, 0, 0], rotation: 0, shape: 's1' })!;
    const two = resolveBoard(shapes, { id: 'y', name: 'A2', position: [12, 0, 0], rotation: 0, shape: 's1' })!;
    expect(one.curves).toEqual([ARCH]);
    expect(one.curves).not.toBe(shape.curves);
    expect(one.curves[0]).not.toBe(two.curves[0]);
  });
});
