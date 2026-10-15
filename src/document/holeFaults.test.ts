import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { holeFaults } from './holeFaults';
import { ARCH } from './curveFixtures';
import type { Board, HoleRow } from './types';

const one = (over: Partial<HoleRow> = {}): HoleRow => ({
  id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
  station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 2, ...over,
});
const part = (over: Partial<Board> = {}) => createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75, ...over });
const kinds = (b: Board, r: HoleRow) => holeFaults({ ...b, holes: [...b.holes.filter((x) => x.id !== r.id), r] }, r).map((f) => `${f.index}:${f.kind}`);

describe('holeFaults (spec §2.4)', () => {
  it('a hole on clean stock has no fault', () => {
    expect(kinds(part(), one())).toEqual([]);
  });
  it('tangent to an edge is allowed; 1e-6 past it breaks out, naming the edge', () => {
    expect(kinds(part(), one({ inset: 0.125 }))).toEqual([]);
    const r = one({ inset: 0.125 - 1e-6 });
    expect(holeFaults({ ...part(), holes: [r] }, r)).toEqual([{ index: 0, kind: 'breaks-out', edge: { dim: 'width', side: 'min' } }]);
  });
  it('a row whose last hole runs past the far end faults only that hole', () => {
    const r = one({ station: 2, count: 24, pitch: 32 / 25.4 });      // hole 24's centre at 30.976
    expect(kinds(part(), r)).toEqual(['23:breaks-out']);
    expect(kinds(part(), { ...r, count: 23 })).toEqual([]);
  });
  it('too deep: a blind depth equal to the face dimension', () => {
    expect(kinds(part(), one({ depth: 0.75 }))).toEqual(['0:too-deep']);
    expect(kinds(part(), one({ depth: 'through' }))).toEqual([]);
  });
  it('off flat: a hole whose cylinder meets a dado; one clear of it does not', () => {
    // A 3/4 dado across the width, 1/4 deep from the max face, at length 10 to 10.75.
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(kinds(part({ cuts: [dado] }), one({ station: 10.875 - 1e-6 }))).toEqual(['0:off-flat']);
    expect(kinds(part({ cuts: [dado] }), one({ station: 10.875 }))).toEqual([]);           // tangent to the dado wall
    // Review Focus 1's layout: a shelf-pin row on the same face, clear of the dado, is fine.
    expect(kinds(part({ cuts: [dado] }), one({ station: 2, count: 6, pitch: 32 / 25.4 }))).toEqual([]);
  });
  it('off flat: a blind hole whose bottom meets a dado\'s floor leaves zero skin (ruling R3)', () => {
    // The dado above (thickness [0.5, 0.75]); a pin from the MIN face under it, at the dado's centre (length 10.375).
    // Depth 0.5 puts its bottom ON the floor: zero skin, judged as too-deep judges depth = thickness.
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const under = (depth: number) => one({ from: 'min', station: 10.375, depth });
    expect(kinds(part({ cuts: [dado] }), under(0.5))).toEqual(['0:off-flat']);
    expect(kinds(part({ cuts: [dado] }), under(0.5 - 1e-6))).toEqual([]);
    // Same face beside the dado, deeper than it (axial spans overlap), tangent to its near wall in-plane: clean.
    expect(kinds(part({ cuts: [dado] }), one({ station: 9.875 }))).toEqual([]);
    expect(kinds(part({ cuts: [dado] }), one({ station: 9.875 + 1e-6 }))).toEqual(['0:off-flat']);
  });
  it('a cut that a shrink left removing nothing never faults', () => {
    const gone = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 40, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(kinds(part({ cuts: [gone] }), one())).toEqual([]);
    // Added in review (mutation): a cut clipped to zero length at the end ([30, 30]) adds no off-flat to a hole that
    // already breaks out past that end.
    const atEnd = { ...gone, offset: 30 };
    expect(kinds(part({ cuts: [atEnd] }), one({ station: 29.9 }))).toEqual(['0:breaks-out']);
  });
  it('off flat: a chamfer whose plane passes within the radius', () => {
    // 1/2 x 1/2 chamfer on the thickness-max / width-min edge, along the length.
    const ch = { id: 'a1', kind: 'chamfer' as const, face: 'thickness' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0.5], [0.5, 0]] as [[number, number], [number, number]] };
    expect(kinds(part({ angleCuts: [ch] }), one({ inset: 0.5 }))).toEqual(['0:off-flat']);
    expect(kinds(part({ angleCuts: [ch] }), one({ inset: 0.625 }))).toEqual([]);           // the chamfer ends at width 0.5
  });
  it('meets another hole: parallel, touching is meeting', () => {
    const a = one();
    expect(kinds(part({ holes: [a] }), one({ id: 'h2', station: 5.25 }))).toEqual(['0:meets-hole']);
    expect(kinds(part({ holes: [a] }), one({ id: 'h2', station: 5.25 + 1e-6 }))).toEqual([]);
    expect(holeFaults({ ...part(), holes: [a, one({ id: 'h2', station: 5.1 })] }, one({ id: 'h2', station: 5.1 }))[0]!.other).toEqual({ row: 'h1', index: 0 });
  });
  it('meets another hole within its own row (pitch below the diameter)', () => {
    expect(kinds(part(), one({ count: 3, pitch: 0.2 }))).toEqual(['0:meets-hole', '1:meets-hole', '2:meets-hole']);
  });
  it('meets another hole: perpendicular, the closed form', () => {
    // A 3/8 dowel hole 1" into the length min end, centred in the thickness, 2" from the width min side;
    // a 1/4 pin from the broad face at length 0.875: its cylinder spans thickness 0.375..0.75, the dowel's 0.1875..0.5625.
    const end = one({ id: 'e', face: 'length', from: 'min', diameter: 0.375, depth: 1, along: 'width', station: 2, acrossFrom: 'min', inset: 0.375 });
    const pin = (station: number) => one({ id: 'p', station, inset: 2 });
    expect(kinds(part({ holes: [end] }), pin(0.875))).toEqual(['0:meets-hole']);
    expect(kinds(part({ holes: [end] }), pin(1.125 + 1e-6))).toEqual([]);     // just past the dowel's bottom
  });
  it('meets another hole: perpendicular, the half-chord where the pin stops short of the dowel\'s axis', () => {
    // Added in review (mutation): the case above has the axes coplanar, so it never reads the half-chords.
    // A 1/4" pin 1/4" deep from the max face spans thickness 0.5..0.75; the dowel (r 3/16, axis at thickness 0.375)
    // is widest there at 0.5, half-chord sqrt((3/16)^2 - (1/8)^2) = sqrt(0.01953125). With the pin over the dowel
    // (length 0.5), they meet iff the width offset is <= 1/8 + that, not 1/8 + 3/16.
    const end = one({ id: 'e', face: 'length', from: 'min', diameter: 0.375, depth: 1, along: 'width', station: 2, acrossFrom: 'min', inset: 0.375 });
    const reach = 0.125 + Math.sqrt(0.01953125);
    const pin = (inset: number) => one({ id: 'p', station: 0.5, depth: 0.25, inset });
    expect(kinds(part({ holes: [end] }), pin(2 + reach - 1e-6))).toEqual(['0:meets-hole']);
    expect(kinds(part({ holes: [end] }), pin(2 + reach + 1e-6))).toEqual([]);
  });
  it('tangent to the far end through an inexact sum passes (the max side\'s HOLE_EPS)', () => {
    // Added in review (mutation): centre + radius lands 1.8e-15 past the 399mm end.
    const p = 32 / 25.4;
    const L = 399 / 25.4;
    expect(kinds(part({ length: L }), one({ station: L - 0.125 - 6 * p, count: 7, pitch: p }))).toEqual([]);
  });
});

describe('a hole into a curve\'s waste is breaks-out (curves spec §6.3)', () => {
  const apron = (row: HoleRow) => createBoard({ length: 30, width: 5, thickness: 0.75, holes: [row], curves: [ARCH] });
  const fault = [{ index: 0, kind: 'breaks-out', curve: { id: 'c1', kind: 'arch' } }];
  // A 1/2" through bore along the thickness (the curve's through), centred 15" along: its disc's nearest point to the
  // arch's crown (15, 1.5) is at v = inset − 1/4.
  const down = (inset: number): HoleRow => ({ id: 'h', face: 'thickness', from: 'max', diameter: 0.5, depth: 'through', along: 'length', alongFrom: 'min', station: 15, count: 1, pitch: 0, acrossFrom: 'min', inset });
  it('a bore along through: touching the crown meets (inset 1.75); a micro-inch clear does not', () => {
    expect(holeFaults(apron(down(1.75)), down(1.75))).toEqual(fault);
    expect(holeFaults(apron(down(1.75 + 1e-6)), down(1.75 + 1e-6))).toEqual([]);
  });
  // A 3/8" dowel hole 1" deep drilled into the arched EDGE (the width min face): its projection on (length, width) is the
  // rectangle [station − 3/16, station + 3/16] × [0, 1].
  const edge = (station: number): HoleRow => ({ id: 'h', face: 'width', from: 'min', diameter: 0.375, depth: 1, along: 'length', alongFrom: 'min', station, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.375 });
  it('a hole square to through: its rectangle inside the waste meets; beside the arch it does not', () => {
    expect(holeFaults(apron(edge(15)), edge(15))).toEqual(fault);
    expect(holeFaults(apron(edge(1.5)), edge(1.5))).toEqual([]);
  });
});
