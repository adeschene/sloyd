import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { holeFaults, holeInStock } from './holeFaults';
import { ARCH } from './curveFixtures';
import { loop } from './sweepFixtures';
import { distinctFaults, faultKey, holeFaultText } from './holeText';
import { holeBottom, holeInstances, holeRing, insideHole, type Hole } from './holes';
import type { V3 } from './angleCuts';
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

// ── Angled holes, Task 3 (spec §3.2, §6.3): faults for a tilted bore. Exact where the spec says exact (breaks-out,
// too-deep, off-flat against an angle cut), conservative elsewhere (may over-report, NEVER under-report). Every boundary
// below is derived by hand in its comment, not read off the code under test (inv 23).
describe('faults for a tilted bore (angled holes spec §6.3)', () => {
  const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);
  /** 30 × 11.25 × 1.5: a through bore here is 1.5" long, so a tilt carries its exit well away from its mouth. */
  const thick = (over: Partial<Board> = {}) => part({ thickness: 1.5, ...over });

  it('a tilted bore whose wall leaves a side below the mouth breaks out there', () => {
    // Mouth 0.3" from the width min side, r 1/8, through 1.5": tilted 20° toward that side its exit centre is at
    // 0.3 − 1.5·tan 20° < 0 — out by the width min side; tilted 20° away it is clean.
    const bore = (tiltAcross: number) => one({ diameter: 0.25, depth: 'through', inset: 0.3, tiltAcross });
    const toward = bore(-tan(20));
    expect(holeFaults({ ...thick(), holes: [toward] }, toward)).toEqual([{ index: 0, kind: 'breaks-out', edge: { dim: 'width', side: 'min' } }]);
    expect(kinds(thick(), bore(tan(20)))).toEqual([]);
    // Exact boundary. The exit ring is the circle square to the bit slid onto the exit face: an ellipse whose half-extent
    // across is r·√(1 + k²) for a slope k across (its semi-major, r / cos θ). Tangent to the side at the exit:
    //   0.3 − 1.5k − 0.125·√(1 + k²) = 0  ⇔  (0.3 − 1.5k)² = 0.125²(1 + k²)  ⇔  2.234375k² − 0.9k + 0.074375 = 0,
    // the smaller root (the larger has 0.3 − 1.5k < 0). Mutation: an exit half-extent of r (the disc, unslid) passes k + 1e-6.
    const k = (0.9 - Math.sqrt(0.81 - 4 * 2.234375 * 0.074375)) / (2 * 2.234375);
    expect(0.3 - 1.5 * k - 0.125 * Math.sqrt(1 + k * k)).toBeCloseTo(0, 14);
    expect(kinds(thick(), bore(-k))).toEqual([]);
    expect(kinds(thick(), bore(-(k + 1e-6)))).toEqual(['0:breaks-out']);
  });

  it('breaks-out at the mouth: the mouth ellipse, r·√(1 + k²) along the tilt', () => {
    // A blind bore tilted AWAY from the width min side (it never nears the side below the mouth): only the mouth's
    // ellipse can break out. Its half-extent across is r·√(1 + k²), so the boundary inset is 0.125·√(1 + 0.5²).
    // Mutation: the square twin's r passes inset − 1e-6.
    const at = (inset: number) => one({ inset, tiltAcross: 0.5 });
    const edge = 0.125 * Math.sqrt(1.25);
    expect(kinds(part(), at(edge))).toEqual([]);
    expect(kinds(part(), at(edge - 1e-6))).toEqual(['0:breaks-out']);
  });

  it('a blind bottom poking out a side is breaks-out (the disc, r·√(1 − m_i²/|m|²) across)', () => {
    // 3/8" deep along the bit, tilted 45° toward the width min side, from the max face of 3/4" stock. The bottom centre is
    // depth·sin 45° toward the side; the bottom disc (square to the bit) reaches r·cos 45° further. Boundary inset:
    // depth·sin 45° + r·cos 45° — the mouth (0.125·√2 out) is well inside it.
    const at = (inset: number) => one({ inset, tiltAcross: -1 });
    const edge = 0.375 * Math.SQRT1_2 + 0.125 * Math.SQRT1_2;
    expect(kinds(part(), at(edge))).toEqual([]);
    expect(kinds(part(), at(edge - 1e-6))).toEqual(['0:breaks-out']);
  });

  it('too-deep judges the bottom disc\'s deepest point', () => {
    // Blind, tilted 30°, r 1/8, into 3/4" stock from the max face. The bottom centre is depth·cos 30° in; the disc, square
    // to the bit, reaches r·sin 30° = 1/16 deeper on its downhill rim. Depth (along the bit) D = (3/4 − 1/16) / cos 30°
    // puts the centre 1/16 clear of the back face and the rim ON it: zero skin, too-deep (≥, as a square bore's).
    // Mutation: judging the centre alone (reach > thickness) passes D.
    const at = (depth: number) => one({ depth, tiltAlong: tan(30) });
    const D = (0.75 - 0.0625) / Math.cos(Math.PI / 6);
    expect(kinds(part(), at(D))).toEqual(['0:too-deep']);
    expect(kinds(part(), at(D - 1e-6))).toEqual([]);
    // Centre clear by 0.05, rim 0.0125 past: too-deep.
    expect(kinds(part(), at(0.7 / Math.cos(Math.PI / 6)))).toEqual(['0:too-deep']);
  });

  it('too-shallow: a blind bottom disc reaching back to the entry face (ruling T2d; touching is the fault)', () => {
    // Slope 0.75 (θ = atan 0.75, tan θ = 3/4), r 1/8: the bottom disc's uphill rim rises r·sin θ above its centre, which
    // is depth·cos θ in, so the rim reaches the mouth plane at depth = r·tan θ = 3/32 exactly (a dyadic: no rounding).
    // At 3/32 it touches — the fault, as too-deep's ≥; 3/32 + 1e-6 is clean. Mutation: `<` without HOLE_EPS passes 3/32.
    const at = (depth: number, over: Partial<HoleRow> = {}) => one({ depth, tiltAlong: 0.75, ...over });
    expect(kinds(part(), at(3 / 32))).toEqual(['0:too-shallow']);
    expect(kinds(part(), at(3 / 32 + 1e-6))).toEqual([]);
    // Either slope; the resultant decides (hypot(0.6, 0.45) = 0.75).
    expect(kinds(part(), at(3 / 32, { tiltAlong: 0.6, tiltAcross: 0.45 }))).toEqual(['0:too-shallow']);
    // A square bore never is, however shallow; a through bore never is.
    expect(kinds(part(), one({ depth: 1e-3 }))).toEqual([]);
    expect(kinds(part(), at(3 / 32, { depth: 'through' }))).toEqual([]);
    // After too-deep in the per-hole order; once per row in distinctFaults; its words; holeInStock false (clipped mesh).
    const row = at(3 / 32, { count: 3, pitch: 1 });
    const b = { ...part(), holes: [row] };
    expect(holeFaults(b, row).map((f) => f.kind)).toEqual(['too-shallow', 'too-shallow', 'too-shallow']);
    expect(distinctFaults(holeFaults(b, row))).toEqual([{ index: 0, kind: 'too-shallow' }]);
    expect(faultKey({ index: 2, kind: 'too-shallow' })).toBe('too-shallow');
    expect(holeFaultText({ index: 0, kind: 'too-shallow' }, row)).toBe('too shallow for its angle');
    expect(holeInStock(b, holeInstances(b, row)[0]!)).toBe(false);
    expect(holeInStock(b, holeInstances(b, at(3 / 32 + 1e-6))[0]!)).toBe(true);
  });

  it('off-flat against an angle cut is exact for a tilt', () => {
    // The 1/2 x 1/2 chamfer above: kept where w − z + 1/4 ≥ 0 (it meets the top face at width 1/2). A blind bore from the
    // max face tilted ACROSS, away from the chamfer (slope s = 0.5): it moves away as it deepens, so the mouth binds,
    // and the mouth is the face-parallel ellipse, reaching r·√(1 + s²) toward the chamfer. Boundary inset:
    // 1/2 + r·√(1 + s²). Mutation: the minimum over the circle square to the bit at the mouth centre (the bottom disc's
    // form, r·|n − (n·b̂)b̂| = r·|1 − s|/√(2(1 + s²)) here) passes inset − 1e-6 — that circle is not the mouth.
    const ch = { id: 'a1', kind: 'chamfer' as const, face: 'thickness' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0.5], [0.5, 0]] as [[number, number], [number, number]] };
    const edge = 0.5 + 0.125 * Math.sqrt(1.25);
    expect(kinds(part({ angleCuts: [ch] }), one({ inset: edge, tiltAcross: 0.5 }))).toEqual([]);
    expect(kinds(part({ angleCuts: [ch] }), one({ inset: edge - 1e-6, tiltAcross: 0.5 }))).toEqual(['0:off-flat']);
    // Tilted 45° TOWARD the chamfer (tiltAcross −1): m = (0, −1, −1) on (length, width, thickness), n = (0, 1, −1)/√2,
    // b̂ = (0, −1, −1)/√2, so n·b̂ = 0 and n·m = 0. The bottom centre (i − 3/8·√½, 3/4 − 3/8·√½) gives (i − 1/2)/√2 and the
    // disc spreads r·|n − (n·b̂)b̂| = r; the mouth gives (i − 1/2)/√2 too and spreads r·|n − dir·(n·m)e_a| = r. Both bind
    // at once: boundary inset 1/2 + r·√2.
    const toward = 0.5 + 0.125 * Math.SQRT2;
    expect(kinds(part({ angleCuts: [ch] }), one({ inset: toward, tiltAcross: -1 }))).toEqual([]);
    expect(kinds(part({ angleCuts: [ch] }), one({ inset: toward - 1e-6, tiltAcross: -1 }))).toEqual(['0:off-flat']);
  });

  it('off-flat against a rectangular cut is conservative for a tilt: the bore\'s box', () => {
    // A 3/4 dado across the width on the max face, length 10 to 10.75, 1/4 deep (thickness 0.5 to 0.75).
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    // Tilted 0.5 toward the dado (along +length), blind 3/8 along the bit. Truly meets at station 9.8: at axial 1/4 (the
    // dado's floor) the axis is at 9.925 and the slice reaches r·√1.25 ≈ 0.14 further, past 10 — inside the dado.
    expect(kinds(part({ cuts: [dado] }), one({ station: 9.8, tiltAlong: 0.5 }))).toEqual(['0:off-flat']);
    // Box clear: the box's far side is the bottom disc's, 9.5 + 0.375/√1.25·0.5 + r·√(1 − 0.25/1.25) ≈ 9.78 < 10.
    expect(kinds(part({ cuts: [dado] }), one({ station: 9.5, tiltAlong: 0.5 }))).toEqual([]);
  });

  it('meets-hole is conservative for a tilt: a capsule about each bore', () => {
    // Two through bores in 1.5" stock crossing at mid-depth: A tilted +20° along from station 5, B −20° from station
    // 5 + 1.5·tan 20°, so both axes pass length 5 + 0.75·tan 20° at axial 0.75. They truly meet.
    const k = tan(20);
    const A = one({ id: 'A', depth: 'through', tiltAlong: k });
    const B = one({ id: 'B', depth: 'through', station: 5 + 1.5 * k, tiltAlong: -k });
    expect(kinds(thick({ holes: [A] }), B)).toEqual(['0:meets-hole']);
    expect(kinds(thick({ holes: [B] }), A)).toEqual(['0:meets-hole']);
    // B a further 1" on: they never cross inside the stock, 0.454 apart along the length at the exit (> 2r): clean.
    expect(kinds(thick({ holes: [A] }), { ...B, station: 6 + 1.5 * k })).toEqual([]);
    // A parallel row, tilted alike, clearing by 0.05" square to the bits (pitch·cos θ = 2r + 0.05): clean.
    const th = Math.atan(0.5);
    expect(kinds(part(), one({ count: 2, pitch: 0.3 / Math.cos(th), tiltAlong: 0.5 }))).toEqual([]);
    expect(kinds(part(), one({ count: 2, pitch: 0.25 / Math.cos(th) - 1e-6, tiltAlong: 0.5 }))).toEqual(['0:meets-hole', '1:meets-hole']);
  });

  it('meets-hole: the mouth ellipse\'s uphill tip is inside the capsule (the segment runs r·tan θ past the mouth)', () => {
    // A tilted +s along from station 5; its mouth ellipse's tip on the −length side is at 5 − r·√(1 + s²), with its foot
    // on the bit's line BEHIND the mouth centre. A square bore B whose wall touches that tip truly meets A (touching
    // meets). A capsule about the mouth-to-bottom segment alone is r·√(1+s²) + r_B from B there and misses; the
    // segment run back by r·tan θ catches it. Mutation: no run-back passes this pair.
    const s = 0.75;
    const A = one({ id: 'A', tiltAlong: s });
    const at = 5 - 0.125 * Math.sqrt(1 + s * s) - 0.125;
    expect(kinds(part({ holes: [A] }), one({ id: 'B', station: at }))).toEqual(['0:meets-hole']);
    expect(kinds(part({ holes: [one({ id: 'B', station: at })] }), A)).toEqual(['0:meets-hole']);
  });

  it('meets-hole: a through exit\'s downhill tip is inside the capsule too (the segment runs r·tan θ past the exit)', () => {
    // The case above at the exit face: A through 3/4" from the max face, tilted +s along, exits centred at 5 + 0.75·s
    // with its exit ellipse's tip at + r·√(1 + s²). A square pin from the MIN face whose wall touches that tip truly meets
    // A. Mutation: no run-past at the exit passes this pair.
    const s = 0.75;
    const A = one({ id: 'A', depth: 'through', tiltAlong: s });
    const at = 5 + 0.75 * s + 0.125 * Math.sqrt(1 + s * s) + 0.125;
    expect(kinds(part({ holes: [A] }), one({ id: 'B', from: 'min', station: at }))).toEqual(['0:meets-hole']);
  });

  it('off-flat against an angle cut: a through exit binds by its ellipse', () => {
    // A 1/2 x 1/2 chamfer on the thickness-MIN / width-min edge: kept where w + z − 1/2 ≥ 0. A through bore from the max
    // face tilted 0.5 TOWARD it exits at (i − 0.75·0.5, 0); the exit is a face-parallel ellipse reaching r·√1.25 toward
    // the chamfer, so the boundary inset is 1/2 + 0.375 + r·√1.25 (the mouth, 3/4 higher, is far clear).
    // Mutation: judging the exit by the circle square to the bit (a blind bottom's form) passes inset − 1e-6.
    const ch = { id: 'a1', kind: 'chamfer' as const, face: 'thickness' as const, from: 'min' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0.5], [0.5, 0]] as [[number, number], [number, number]] };
    const edge = 0.5 + 0.375 + 0.125 * Math.sqrt(1.25);
    expect(kinds(part({ angleCuts: [ch] }), one({ depth: 'through', inset: edge, tiltAcross: -0.5 }))).toEqual([]);
    expect(kinds(part({ angleCuts: [ch] }), one({ depth: 'through', inset: edge - 1e-6, tiltAcross: -0.5 }))).toEqual(['0:off-flat']);
  });

  it('never under-reports: sampled points of the true bore (meets-hole, off-flat against a rectangular cut, breaks-out)', () => {
    // A seeded sweep of tilted bores. A point of the bore is a convex combination of a mouth ring vertex, a far ring
    // vertex (the exit ring, or the bottom disc) and the axis ends — the bore is the convex hull of its end curves. Any
    // sampled point strictly inside another bore, a cut's region or past a face edge must come with the fault.
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const points = (h: Hole): V3[] => {
      const mouth = holeRing(h, 0, 24);
      const far = h.through ? holeRing(h, h.reach, 24) : holeBottom(h, 24);
      const end: V3 = [0, 1, 2].map((i) => h.centre[i]! + h.reach * h.bit[i]!) as V3;
      const out: V3[] = [];
      for (let j = 0; j < 60; j += 1) {
        const p = mouth[Math.floor(rnd() * 24)]!; const q = far[Math.floor(rnd() * 24)]!;
        const a = rnd(); const c = rnd() * 0.3;
        out.push([0, 1, 2].map((i) => (1 - c) * ((1 - a) * p[i]! + a * q[i]!) + c * ((1 - a) * h.centre[i]! + a * end[i]!)) as V3);
      }
      return out;
    };
    let met = 0; let cut = 0; let out = 0;
    for (let n = 0; n < 300; n += 1) {
      const slope = () => (rnd() < 0.3 ? 0 : (rnd() * 2 - 1) * 0.7);
      const row = (id: string, station: number): HoleRow => one({
        id, station, inset: 0.05 + rnd() * 0.6, diameter: 0.15 + rnd() * 0.3, depth: rnd() < 0.4 ? 'through' : 0.2 + rnd() * 0.45,
        from: rnd() < 0.5 ? 'max' : 'min', tiltAlong: slope() || undefined, tiltAcross: slope() || undefined,
      });
      const a = row('a', 9.6 + rnd() * 0.8);
      const bRow = row('b', a.station + (rnd() - 0.5) * 0.8);
      const board = part({ cuts: [dado], holes: [a, bRow] });
      const f = holeFaults(board, a).map((x) => x.kind);
      const ha = holeInstances(board, a)[0]!;
      const hb = holeInstances(board, bRow)[0]!;
      const pts = points(ha);
      if (pts.some((p) => insideHole(hb, p))) { met += 1; expect(f).toContain('meets-hole'); }
      const inDado = (p: V3) => p[0] > 10 + 1e-7 && p[0] < 10.75 - 1e-7 && p[2] > 0.5 + 1e-7;
      if (pts.some(inDado)) { cut += 1; expect(f).toContain('off-flat'); }
      const past = (p: V3) => p[0] < -1e-7 || p[1] < -1e-7 || p[1] > 11.25 + 1e-7;
      if (pts.some(past)) { out += 1; expect(f).toContain('breaks-out'); }
    }
    // The sweep exercised every rule.
    expect(met).toBeGreaterThan(20);
    expect(cut).toBeGreaterThan(20);
    expect(out).toBeGreaterThan(20);
  });

  it('a tilted bore never reports less than its square twin would at the mouth', () => {
    // Inset 0.1 < r: the square bore's mouth disc breaks out; its tilted twins' mouth ellipses contain that disc.
    const square = one({ inset: 0.1 });
    expect(kinds(part(), square)).toEqual(['0:breaks-out']);
    for (const t of [{ tiltAlong: 0.3 }, { tiltAlong: -0.3 }, { tiltAcross: 0.3 }, { tiltAcross: -0.3 }, { tiltAlong: 0.4, tiltAcross: 0.5 }]) {
      expect(kinds(part(), one({ inset: 0.1, ...t }))).toContain('0:breaks-out');
    }
  });

  it('into a curve: a tilted bore\'s box (conservative), the arch and a swept loop', () => {
    // The ARCH apron: a 1/2" through bore along thickness at station 15, inset 1.75 + 1e-6, is clear of the crown square;
    // tilted across, its mouth ellipse reaches r·√(1 + k²) > r toward the crown: truly into the waste.
    const apron = (row: HoleRow) => createBoard({ length: 30, width: 5, thickness: 0.75, holes: [row], curves: [ARCH] });
    const down = (over: Partial<HoleRow>): HoleRow => ({ id: 'h', face: 'thickness', from: 'max', diameter: 0.5, depth: 'through', along: 'length', alongFrom: 'min', station: 15, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.75 + 1e-6, ...over });
    expect(holeFaults(apron(down({})), down({}))).toEqual([]);
    const t = down({ tiltAcross: 0.3 });
    expect(holeFaults(apron(t), t)).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'c1', kind: 'arch' } }]);
    const far = down({ inset: 3, tiltAcross: 0.3 });
    expect(holeFaults(apron(far), far)).toEqual([]);
    // A swept roundover loop round a 30 × 10 × 3/4 top: a pin at the edge, tilted inward, runs into it; one mid-panel is clean.
    const top = (row: HoleRow) => createBoard({ length: 30, width: 10, thickness: 0.75, holes: [row], profiles: [loop('w1')] });
    const pin = (inset: number): HoleRow => one({ diameter: 0.125, depth: 0.25, station: 15, inset, tiltAcross: 0.3 });
    expect(holeFaults(top(pin(0.1)), pin(0.1))).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'w1', kind: null, profile: 'roundover' } }]);
    expect(holeFaults(top(pin(3)), pin(3))).toEqual([]);
    // A 1/4" bore at inset 0.4 tilted 45° toward the edge: its mouth ellipse reaches 0.4 − r·√2 ≈ 0.223 on the top face,
    // inside the 1/4" roundover's waste there ((0.223, 0.75) is 0.2514 from the round's centre (0.25, 0.5)) — a true meet
    // its square twin's footprint (w from 0.275) misses. Mutation: the square footprint for a tilted bore passes it.
    const lean = (tiltAcross?: number): HoleRow => one({ diameter: 0.25, depth: 0.25, station: 15, inset: 0.4, ...(tiltAcross ? { tiltAcross } : {}) });
    expect(holeFaults(top(lean()), lean())).toEqual([]);
    expect(holeFaults(top(lean(-1)), lean(-1))).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'w1', kind: null, profile: 'roundover' } }]);
  });
});
