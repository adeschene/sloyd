import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { stretchPart } from './stretchPart';
import { chiralPart } from './turnFixtures';
import { cutRegion } from './cuts';
import { holeInstances, holeRegion } from './holes';
import { touchedRegion } from './angleCuts';
import { archCurve, cornerCurve } from './curves';
import { fingerSets } from './boxJoints';
import { spanToWorldOffset } from './geometry';
import { IMPERIAL } from '../units/length';
import type { AngleCut, Board, Cut, Dovetail, HoleRow, ProfileCut, ProfileEnd, Span } from './types';

// Every expectation below is computed by hand (parametric-resize spec §5). Dyadic numbers, so `toBe` is exact.

/** A 30 × 3 × 0.75 rail, flat at turn 0: X is its length (far = 'max'), Z its width, Y its thickness. */
const rail = (o: Partial<Board> = {}): Board =>
  createBoard({ name: 'Rail', length: 30, width: 3, thickness: 0.75, position: [0, 0, 0], ...o });
/** A raised 1.5 × 1.5 × 30 leg, upright: Y is its length, from y 4 to 34 (far = 'max'). */
const leg = (o: Partial<Board> = {}): Board =>
  createBoard({ name: 'Leg', length: 30, width: 1.5, thickness: 1.5, posture: 'upright', position: [0, 4, 0], ...o });

const run = (b: Board, k: 0 | 1 | 2, s: number, delta: number) => {
  const before = structuredClone(b);
  const r = stretchPart(b, k, s, delta, IMPERIAL);
  expect(b).toEqual(before); // pure: the input is never mutated
  return r;
};
const ok = (r: ReturnType<typeof stretchPart>): Board => {
  if ('refused' in r) throw new Error(`refused: ${r.refused}`);
  return r;
};
const refused = (r: ReturnType<typeof stretchPart>): string => {
  if (!('refused' in r)) throw new Error('expected a refusal');
  return r.refused;
};

const row = (o: Partial<HoleRow>): HoleRow => ({
  id: 'h', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.5, along: 'length', alongFrom: 'min',
  station: 3, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.75, ...o,
});
const cut = (o: Partial<Cut>): Cut => ({
  id: 'c', face: 'width', from: 'min', across: 'thickness', offset: 2, width: 2, depth: 0.5, stopMin: 0.25, stopMax: 0.25, ...o,
});
const angle = (o: Partial<AngleCut>): AngleCut => ({
  id: 'a', kind: 'miter', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[28, 0], [30, 0.75]], ...o,
});
const SIDE = { across: 'width', from: 'min' } as const; // runs along the length
const at = (from: 'min' | 'max', a: number): ProfileEnd => ({ side: SIDE, from, at: a });
const profile = (o: Partial<ProfileCut>): ProfileCut => ({
  id: 'p', face: 'max', kind: 'roundover', size: 0.25, facing: 'face', run: { start: at('min', 2), end: at('min', 6) }, ...o,
});

describe('stretchPart: plain', () => {
  it('a 30-long rail at x 0, line 10, grow 6: length 36, same position, every list the same object', () => {
    const b = rail();
    const r = ok(run(b, 0, 10, 6));
    expect(r).not.toBe(b);
    expect(r.length).toBe(36);
    expect(r.width).toBe(3);
    expect(r.thickness).toBe(0.75);
    expect(r.position).toEqual([0, 0, 0]);
    for (const f of ['cuts', 'angleCuts', 'holes', 'curves', 'profiles', 'bands', 'hardware'] as const) expect(r[f]).toBe(b[f]);
    expect('tenons' in r).toBe(false);
    expect('dovetails' in r).toBe(false);
  });
});

describe('stretchPart: refusals', () => {
  it('the line through the thickness', () => {
    expect(refused(run(rail(), 1, 0.375, 1))).toBe('Rail would get thicker — the line runs through its thickness; move the line.');
  });
  it('a leaning part', () => {
    expect(refused(run(leg({ lean: { x: 0.125, z: 0, face: 'width' } }), 1, 14, 6)))
      .toBe("Leg leans, so it can't be stretched — move the line off it.");
  });
  it('a compound end cut', () => {
    const b = rail({ angleCuts: [angle({ face: 'length', from: 'max', along: 'width', points: [[0, 0], [3, 0.5]], across: { rise: 0.25, from: 'min' } })] });
    expect(refused(run(b, 0, 10, 6))).toBe("Rail has a compound end cut, so it can't be stretched — move the line off it.");
  });
  it('a shrink past the far end: too short', () => {
    expect(refused(run(rail(), 0, 28, -4))).toBe('Rail is too short to shrink by 4" at this line.');
  });
  it('a shrink that just reaches the far end is not too short', () => {
    expect(ok(run(rail(), 0, 26, -4)).length).toBe(26);
  });
});

describe('stretchPart: cuts', () => {
  it('a shrink whose band partly overlaps a plain mortise: the cut sentence', () => {
    // Mortise u [12, 16]; line 10, shrink 4: band [10, 14] covers only part of it.
    const m = cut({ face: 'thickness', from: 'max', across: 'width', offset: 12, width: 4, depth: 0.25, stopMin: 1, stopMax: 1 });
    expect(refused(run(rail({ cuts: [m] }), 0, 10, -4))).toBe("Rail's cut crosses the stretch line — move the line.");
  });
});

describe('stretchPart: holes', () => {
  it('near row (station 3): the same object', () => {
    const h = row({ station: 3 });
    expect(ok(run(rail({ holes: [h] }), 0, 10, 6)).holes[0]).toBe(h);
  });
  it('far row (station 25 from min): station 31', () => {
    expect(ok(run(rail({ holes: [row({ station: 25 })] }), 0, 10, 6)).holes).toEqual([row({ station: 31 })]);
  });
  it('a row spanning 8–14 crosses', () => {
    expect(refused(run(rail({ holes: [row({ station: 8, count: 3, pitch: 3 })] }), 0, 10, 6)))
      .toBe("Rail's hole row crosses the stretch line — move the line.");
  });
  it('a row bored into the max end face: the same object', () => {
    const h = row({ face: 'length', from: 'max', depth: 1, along: 'width', station: 1.5, acrossFrom: 'min', inset: 0.375 });
    expect(ok(run(rail({ holes: [h] }), 0, 10, 6)).holes[0]).toBe(h);
  });
  it('untouched rows keep their objects, in order', () => {
    const near = row({ id: 'n', station: 3 });
    const far = row({ id: 'f', station: 25 });
    const r = ok(run(rail({ holes: [near, far] }), 0, 10, 6));
    expect(r.holes[0]).toBe(near);
    expect(r.holes[1]).toEqual(row({ id: 'f', station: 31 }));
  });
});

describe('stretchPart: a raised leg, features stored from either end (Review Focus 2)', () => {
  // Leg at y 4..34, line at y 14: u = 10, grow 6. Near features keep their distance to y 4, far to the top.
  it('mortises: near stays, far moves, whichever end they are stored from', () => {
    const nearPos = cut({ id: 'np', offset: 2, width: 2 }); // u [2, 4], offset from min
    const farPos = cut({ id: 'fp', offset: 24, width: 3 }); // u [24, 27]
    const stopped = { face: 'width', from: 'min', across: 'length', offset: 0.5, width: 0.5 } as const;
    const nearStop = cut({ id: 'ns', ...stopped, stopMin: 2, stopMax: 26 }); // u [2, 4], its far stop from max
    const farStop = cut({ id: 'fs', ...stopped, stopMin: 24, stopMax: 3 }); // u [24, 27]
    const r = ok(run(leg({ cuts: [nearPos, farPos, nearStop, farStop] }), 1, 14, 6));
    expect(r.length).toBe(36);
    expect(r.position).toEqual([0, 4, 0]);
    expect(r.cuts[0]).toBe(nearPos);
    expect(r.cuts[1]).toEqual(cut({ id: 'fp', offset: 30, width: 3 }));
    expect(r.cuts[2]).toEqual(cut({ id: 'ns', ...stopped, stopMin: 2, stopMax: 32 }));
    expect(r.cuts[3]).toEqual(cut({ id: 'fs', ...stopped, stopMin: 30, stopMax: 3 }));
  });
  it('hole rows: near stays, far moves, whichever end they are stored from', () => {
    const nearMin = row({ id: 'a', face: 'width', inset: 0.75, alongFrom: 'min', station: 3 }); // u 3
    const nearMax = row({ id: 'b', face: 'width', inset: 0.75, alongFrom: 'max', station: 27 }); // u 3
    const farMin = row({ id: 'c', face: 'width', inset: 0.75, alongFrom: 'min', station: 25 }); // u 25
    const farMax = row({ id: 'd', face: 'width', inset: 0.75, alongFrom: 'max', station: 5 }); // u 25
    const r = ok(run(leg({ holes: [nearMin, nearMax, farMin, farMax] }), 1, 14, 6));
    expect(r.holes[0]).toBe(nearMin);
    expect(r.holes[1]).toEqual({ ...nearMax, station: 33 });
    expect(r.holes[2]).toEqual({ ...farMin, station: 31 });
    expect(r.holes[3]).toBe(farMax);
  });
});

describe('stretchPart: angle cuts', () => {
  it('an end miter at the max end stored from min: points shifted by 6', () => {
    const r = ok(run(rail({ angleCuts: [angle({})] }), 0, 10, 6));
    expect(r.angleCuts).toEqual([angle({ points: [[34, 0], [36, 0.75]] })]);
  });
  it('an end miter at the min end stored from max: points shifted by 6 (near, measured from the moving end)', () => {
    const r = ok(run(rail({ angleCuts: [angle({ alongFrom: 'max' })] }), 0, 10, 6));
    expect(r.angleCuts).toEqual([angle({ alongFrom: 'max', points: [[34, 0], [36, 0.75]] })]);
  });
  it('an end miter at the max end stored from max: the same object', () => {
    const a = angle({ alongFrom: 'max', points: [[0, 0.75], [2, 0]] }); // u [28, 30]
    expect(ok(run(rail({ angleCuts: [a] }), 0, 10, 6)).angleCuts[0]).toBe(a);
  });
  it('a full-length edge chamfer through d is a prism along it: the same object, the part grows (Ruling 2)', () => {
    const ch = angle({ kind: 'chamfer', face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', points: [[0, 0.25], [0.25, 0]] });
    const r = ok(run(rail({ angleCuts: [ch] }), 0, 10, 6));
    expect(r.angleCuts[0]).toBe(ch);
    expect(r.length).toBe(36);
  });
  it('a full-length taper crosses', () => {
    const t = angle({ kind: 'taper', from: 'max', points: [[0, 0], [30, 1]] });
    expect(refused(run(rail({ angleCuts: [t] }), 0, 10, 6))).toBe("Rail's taper crosses the stretch line — move the line.");
  });
});

describe('stretchPart: curves', () => {
  const arch = (from: 'min' | 'max', start: number, span: number) =>
    ({ id: 'cv', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from, start, span, rise: 1 }) });
  it('an arch wholly past the line (from min) is shifted', () => {
    const r = ok(run(rail({ curves: [arch('min', 20, 6)] }), 0, 10, 6));
    expect(r.curves).toEqual([{ id: 'cv', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [26, 0],
      segments: [{ type: 'arc', to: [32, 0], side: 'left', rise: 1 }, { type: 'line', to: [26, 0] }] }]);
  });
  it('an arch wholly before the line, stored from max, is shifted (its numbers are measured from the moving end)', () => {
    const r = ok(run(rail({ curves: [arch('max', 22, 4)] }), 0, 10, 6)); // u [4, 8]
    expect(r.curves).toEqual([{ id: 'cv', through: 'thickness', uFrom: 'max', vFrom: 'min', start: [28, 0],
      segments: [{ type: 'arc', to: [32, 0], side: 'left', rise: 1 }, { type: 'line', to: [28, 0] }] }]);
  });
  it('an arch wholly before the line, stored from min: the same object', () => {
    const c = arch('min', 2, 6);
    expect(ok(run(rail({ curves: [c] }), 0, 10, 6)).curves[0]).toBe(c);
  });
  it('an arch spanning the line crosses', () => {
    expect(refused(run(rail({ curves: [arch('min', 8, 4)] }), 0, 10, 6))).toBe("Rail's curve crosses the stretch line — move the line.");
  });
  it('a curve through d is a prism along it: the same object, the part grows (Ruling 2)', () => {
    const c = { id: 'cc', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'min', radius: 0.25 }) };
    const r = ok(run(rail({ curves: [c] }), 0, 10, 6));
    expect(r.curves[0]).toBe(c);
    expect(r.length).toBe(36);
  });
});

describe('stretchPart: profiles', () => {
  it('a stopped run with both stations near: the same object', () => {
    const p = profile({});
    expect(ok(run(rail({ profiles: [p] }), 0, 10, 6)).profiles[0]).toBe(p);
  });
  it('its end station far (from min): at + 6; its near start untouched', () => {
    const p = profile({ run: { start: at('min', 2), end: at('min', 20) } });
    const r = ok(run(rail({ profiles: [p] }), 0, 10, 6));
    expect(r.profiles).toEqual([profile({ run: { start: at('min', 2), end: at('min', 26) } })]);
    expect((r.profiles[0]!.run as { start: ProfileEnd }).start).toBe((p.run as { start: ProfileEnd }).start);
  });
  it('a near station stored from max: at + 6', () => {
    const p = profile({ run: { start: at('max', 25), end: at('max', 28) } }); // u 5 and 2
    expect(ok(run(rail({ profiles: [p] }), 0, 10, 6)).profiles).toEqual([profile({ run: { start: at('max', 31), end: at('max', 34) } })]);
  });
  it('a loop and through ends: the same objects', () => {
    const loop = profile({ id: 'l', run: { loop: true } });
    const thru = profile({ id: 't', run: { start: { side: SIDE, through: 'min' }, end: { side: SIDE, through: 'max' } } });
    const r = ok(run(rail({ profiles: [loop, thru] }), 0, 10, 6));
    expect(r.profiles[0]).toBe(loop);
    expect(r.profiles[1]).toBe(thru);
  });
  it('a station on a side running along another dimension: the same object', () => {
    const end = { across: 'length', from: 'max' } as const; // the max end's side, runs along the width
    const p = profile({ run: { start: { side: end, from: 'min', at: 0.5 }, end: { side: end, from: 'min', at: 2.5 } } });
    expect(ok(run(rail({ profiles: [p] }), 0, 10, 6)).profiles[0]).toBe(p);
  });
  it('shrink: a far station moves back, a station inside the removed band crosses', () => {
    // Line 10, shrink 4: band [10, 14].
    const far = profile({ run: { start: at('min', 2), end: at('min', 20) } });
    expect(ok(run(rail({ profiles: [far] }), 0, 10, -4)).profiles).toEqual([profile({ run: { start: at('min', 2), end: at('min', 16) } })]);
    const inside = profile({ run: { start: at('min', 2), end: at('min', 12) } });
    expect(refused(run(rail({ profiles: [inside] }), 0, 10, -4))).toBe("Rail's profile crosses the stretch line — move the line.");
  });
  it('a part with curves and profiles', () => {
    const c = { id: 'cv', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 2, span: 4, rise: 1 }) };
    expect(refused(run(rail({ curves: [c], profiles: [profile({})] }), 0, 10, 6)))
      .toBe("Rail has curves and profiles, so it can't be stretched — move the line off it.");
  });
});

describe('stretchPart: round tenons', () => {
  const tenons = [{ id: 't1', end: 'min' as const, diameter: 0.5, length: 1 }, { id: 't2', end: 'max' as const, diameter: 0.5, length: 1 }];
  it('tenons on both ends, the line between: the same tenons object', () => {
    const b = rail({ tenons });
    expect(ok(run(b, 0, 10, 6)).tenons).toBe(b.tenons);
  });
  it('the line inside a tenon zone crosses', () => {
    expect(refused(run(rail({ tenons }), 0, 29.5, 6))).toBe("Rail's round tenon crosses the stretch line — move the line.");
  });
  it('a tenoned part spanning on its width: the centred sentence', () => {
    expect(refused(run(rail({ tenons }), 2, 1.5, 1)))
      .toBe("Rail's round tenon is centred on its section, so it can't be stretched across it — move the line off it.");
  });
});

describe('stretchPart: dovetails and box joints', () => {
  const dovetails: Dovetail[] = [{ id: 'dv', dim: 'length', end: 'max', role: 'tails', count: 2, slope: 8, pin: 0.25, depth: 0.75 }];
  it('dovetails: the line outside the zone passes, the same object', () => {
    const b = rail({ dovetails });
    expect(ok(run(b, 0, 10, 6)).dovetails).toBe(b.dovetails);
  });
  it('dovetails: the line in the zone', () => {
    expect(refused(run(rail({ dovetails }), 0, 29.5, 6))).toBe('Rail has dovetails across the stretch line — move the line.');
  });
  it('dovetails: d is J', () => {
    expect(refused(run(rail({ dovetails }), 2, 1.5, 1))).toBe('Rail has dovetails across the stretch line — move the line.');
  });

  // A 30 × 5 × 0.75 rail, notched at its max end: five 1-wide segments across the width, notches at [1, 2] and [3, 4].
  const notch = (id: string, offset: number): Cut =>
    ({ id, face: 'length', from: 'max', across: 'thickness', offset, width: 1, depth: 0.75, stopMin: 0, stopMax: 0 });
  const boxed = () => rail({ width: 5, cuts: [notch('n1', 1), notch('n2', 3)] });
  it('the fixture is a finger set', () => {
    expect(fingerSets(boxed()).map((f) => [f.dim, f.end, f.depth])).toEqual([['length', 'max', 0.75]]);
  });
  it('box joints: the line outside the zone passes, the notches follow the far end', () => {
    const b = boxed();
    const r = ok(run(b, 0, 10, 6));
    expect(r.cuts[0]).toBe(b.cuts[0]);
    expect(r.cuts[1]).toBe(b.cuts[1]);
    expect(cutRegion(r, r.cuts[0]!).length).toEqual([35.25, 36]);
    expect(fingerSets(r).map((f) => [f.dim, f.end, f.depth])).toEqual([['length', 'max', 0.75]]);
  });
  it('box joints: the line in the zone', () => {
    expect(refused(run(boxed(), 0, 29.5, 6))).toBe('Rail has box joints across the stretch line — move the line.');
  });
  it('box joints: a shrink whose band meets the zone gets the box-joint sentence, not the cut one (corner joints first)', () => {
    expect(refused(run(boxed(), 0, 28, -1.5))).toBe('Rail has box joints across the stretch line — move the line.');
  });
  it('box joints: d is J (the line between two notches, so no notch crosses)', () => {
    expect(refused(run(boxed(), 2, 2.5, 1))).toBe('Rail has box joints across the stretch line — move the line.');
  });
});

describe('stretchPart: a part turned 180 (far === min)', () => {
  // chiralPart('flat') at turn 180, min corner at 0: X runs along its length REVERSED, so world x = L − u, and the world
  // +X end is the part's MIN end. Line at x 10 (u 10).
  const world = (b: Board, s: Span): Span => {
    const w = spanToWorldOffset(b, 0, s);
    return [w[0] + b.position[0], w[1] + b.position[0]];
  };
  const holeSpan = (b: Board, r: HoleRow): Span => holeRegion(holeInstances(b, r)[0]!).length;
  const holed = (o: Partial<Board> = {}) => ({
    ...chiralPart('flat'), rotation: 180 as const, position: [0, 0, 0] as [number, number, number],
    holes: [
      row({ id: 'nMax', face: 'thickness', alongFrom: 'max', station: 2, inset: 3 }), // u 18, world 2
      row({ id: 'fMin', face: 'thickness', alongFrom: 'min', station: 3, inset: 3 }), // u 3, world 17
      row({ id: 'nMin', face: 'thickness', alongFrom: 'min', station: 18, inset: 3 }), // u 18, world 2
      row({ id: 'fMax', face: 'thickness', alongFrom: 'max', station: 17, inset: 3 }), // u 3, world 17
    ],
    angleCuts: [angle({ alongFrom: 'max', points: [[18, 0], [20, 0.75]] })], // u [0, 2], world [18, 20]
    ...o,
  });

  it('grow 6: near spans stay, far spans move +6 in the world', () => {
    const b = holed();
    const r = ok(run(b, 0, 10, 6));
    expect(r.length).toBe(26);
    expect(r.position).toEqual([0, 0, 0]);
    const cutW = (x: Board) => x.cuts.map((c) => world(x, cutRegion(x, c).length));
    expect(cutW(b)).toEqual([[15.25, 16], [12, 18], [5, 20]]);
    expect(cutW(r)).toEqual([[21.25, 22], [18, 24], [5, 26]]); // c1, c2 far; c3 crosses and grows
    const holeW = (x: Board) => x.holes.map((h) => world(x, holeSpan(x, h)));
    expect(holeW(b)).toEqual([[1.875, 2.125], [16.875, 17.125], [1.875, 2.125], [16.875, 17.125]]);
    expect(holeW(r)).toEqual([[1.875, 2.125], [22.875, 23.125], [1.875, 2.125], [22.875, 23.125]]);
    expect(r.holes[1]).toBe(b.holes[1]); // far, stored from the (moving) min end
    expect(r.holes[3]).toEqual({ ...b.holes[3], station: 23 }); // far, stored from the fixed max end
    expect(r.holes[2]).toEqual({ ...b.holes[2], station: 24 }); // near, stored from the moving min end
    expect(r.holes[0]).toBe(b.holes[0]);
    expect(world(b, touchedRegion(b, b.angleCuts[0]!)!.length)).toEqual([18, 20]);
    expect(world(r, touchedRegion(r, r.angleCuts[0]!)!.length)).toEqual([24, 26]);
    expect(r.angleCuts[0]!.points).toEqual([[24, 0], [26, 0.75]]);
  });

  it('shrink 4: band [6, 10]; a far row moves −4 in the world, a near row stays, one inside the band crosses', () => {
    const near = row({ id: 'n', face: 'thickness', alongFrom: 'min', station: 15, inset: 3 }); // u 15, world 5
    const far = row({ id: 'f', face: 'thickness', alongFrom: 'min', station: 3, inset: 3 }); // u 3, world 17
    const b = { ...chiralPart('flat'), rotation: 180 as const, position: [0, 0, 0] as [number, number, number], cuts: [], holes: [near, far] };
    const r = ok(run(b, 0, 10, -4));
    expect(r.length).toBe(16);
    expect(r.holes[0]).toEqual({ ...near, station: 11 });
    expect(r.holes[1]).toBe(far);
    expect(world(r, holeSpan(r, r.holes[0]!))).toEqual([4.875, 5.125]);
    expect(world(r, holeSpan(r, r.holes[1]!))).toEqual([12.875, 13.125]);
    const inBand = row({ id: 'x', face: 'thickness', alongFrom: 'min', station: 8, inset: 3 }); // u 8
    expect(refused(run({ ...b, holes: [inBand] }, 0, 10, -4))).toBe("Chiral's hole row crosses the stretch line — move the line.");
  });
});
