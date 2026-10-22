import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { createBoard, flatDocument, migrateDocument } from '../../document/document';
import type { Board, CurveCut, CutFrom, FlatDocument, Posture, ProfileCut, Rotation } from '../../document/document';
import { worldBox } from '../../document/designCheck';
import { archCurve, cornerCurve, curveKindChoice, localSegments, uvDims } from '../../document/curves';
import type { P2 } from '../../document/curves';
import { endPos, profileSpan } from '../../document/profiles';
import { axisDimensions, boardExtents, endFacing } from '../../document/geometry';
import { twoSide } from '../../document/sweepFixtures';
import { findSites } from './sites';
import { applyJoints, rebaseCurves, rebaseProfiles } from './recipes';
import type { JointChoice } from './recipes';
import { GATE_TOLERANCE, gateUnjoin, readJoints } from './unjoin';

// Joinery-curves spec §4.2, §4.3, §4.5: a curve coordinate or profile station measured from a grown or trimmed end shifts
// with it, and readJoints' resizeAt is the exact inverse. Joinery still refuses curved projects at runJoinery (until
// Task 5), so these drive applyJoints and readJoints on a flat document directly.

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const flip = (e: CutFrom): CutFrom => (e === 'min' ? 'max' : 'min');
const side = (across: 'length' | 'width', from: CutFrom) => ({ across, from });
const station = (s: ReturnType<typeof side>, from: CutFrom, at: number) => ({ side: s, from, at });
const stopped = (id: string, s: ReturnType<typeof side>, from: CutFrom, lo: number, hi: number): ProfileCut =>
  ({ id, face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { start: station(s, from, lo), end: station(s, from, hi) } });
const throughRun = (id: string, s: ReturnType<typeof side>): ProfileCut =>
  ({ id, face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { start: { side: s, through: 'min' }, end: { side: { ...s }, through: 'max' } } });
const loopOf = (id: string): ProfileCut => ({ id, face: 'min', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { loop: true } });

/** Every endpoint of a curve's segments, as a world point, through localSegments and the one local-to-world mapping. */
const curvePoints = (b: Board, curves: readonly CurveCut[] = b.curves): Map<string, number[]> => {
  const out = new Map<string, number[]>();
  for (const c of curves) {
    const [u, v] = uvDims(c.through);
    const at = (p: P2) => worldBox(b, { length: [0, 0], width: [0, 0], thickness: [0, 0], [u]: [p[0], p[0]], [v]: [p[1], p[1]] }).min;
    localSegments(b, c).forEach((s, i) => { out.set(`${c.id}/${i}a`, at(s.a)); out.set(`${c.id}/${i}b`, at(s.b)); });
  }
  return out;
};
/** A station's world coordinate on the world axis its run dimension shows (the other two axes do not depend on it). */
const stationWorld = (b: Board, p: ProfileCut): number[] => {
  if ('loop' in p.run) return [];
  return [p.run.start, p.run.end].filter((e) => !('through' in e)).map((e) => {
    const dim = e.side.across === 'width' ? 'length' : 'width';
    const k = axisDimensions(b).indexOf(dim);
    return worldBox(b, { length: [0, 0], width: [0, 0], thickness: [0, 0], [dim]: [endPos(b, e), endPos(b, e)] }).min[k];
  }).sort((x, y) => x - y); // migrateDocument may re-order a run's ends (canonicalRun)
};
const expectSame = (a: Map<string, number[]>, b: Map<string, number[]>) => {
  expect([...b.keys()]).toEqual([...a.keys()]);
  for (const [key, p] of a) p.forEach((v, i) => expect(Math.abs(b.get(key)![i] - v), key).toBeLessThan(1e-12));
};
const deepFreeze = <T,>(x: T): T => {
  if (x && typeof x === 'object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); }
  return x;
};
/** A value's numbers in walk order, and its shape with every number zeroed. */
const numbers = (x: unknown, out: number[] = []): number[] => {
  if (typeof x === 'number') out.push(x);
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => numbers(v, out));
  return out;
};
/** A profile with its run's ends in station order: migrateDocument may swap them (canonicalRun), which is not under test. */
const ordered = (p: ProfileCut) => ('loop' in p.run ? p : { ...p, run: [p.run.start, p.run.end].sort((a, b) => ('at' in a ? a.at : 0) - ('at' in b ? b.at : 0)) });
const shape = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'number' ? 0 : v));
const expectClose = (got: unknown, want: unknown, label: string) => {
  expect(shape(got), label).toBe(shape(want));
  const g = numbers(got); const w = numbers(want);
  w.forEach((n, i) => expect(Math.abs(g[i] - n), `${label}[${i}]`).toBeLessThanOrEqual(GATE_TOLERANCE));
};

/**
 * A rail in the given pose whose `sign` end butts a big leg, so the rail is the entering part of a mortise and tenon at
 * that end. The leg is a flat, unturned block larger than the rail's cross-section.
 */
function railAndLeg(posture: Posture, rotation: Rotation, curves: CurveCut[], profiles: ProfileCut[], sign: -1 | 1 = 1, length = 18): { doc: FlatDocument; k: number; end: CutFrom } {
  const rail = createBoard({ name: 'Rail', length, width: 3.5, thickness: 0.75, posture, rotation, curves, profiles });
  const k = axisDimensions(rail).indexOf('length');
  const re = boardExtents(rail);
  const leg = createBoard({ name: 'Leg', length: 1, width: 1, thickness: 1, posture: k === 1 ? 'flat' : 'upright' });
  const dims = axisDimensions(leg);
  const sizes = [0, 1, 2].map((a) => (a === k ? 1.75 : re[a] + 4));
  dims.forEach((d, a) => { leg[d] = sizes[a]; });
  rail.position = [0, 0, 0];
  leg.position = [0, 0, 0];
  for (let a = 0; a < 3; a++) if (a !== k) rail.position[a] = 2;
  if (sign === 1) leg.position[k] = re[k]; else rail.position[k] = 1.75;
  const base = flatDocument(designToDocument({ name: 'T', parts: [{ name: 'P', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }] }).doc);
  return { doc: { ...base, boards: [leg, rail] }, k, end: endFacing(rail, k, sign) };
}
const tenon = (doc: FlatDocument, L = 1) => {
  const sites = findSites(doc);
  const site = sites.find((s) => doc.boards[s.enter].name === 'Rail');
  if (!site) throw new Error('no site');
  const choices: JointChoice[] = [{ site: site.id, joint: 'mortise-tenon', tenonLength: L }];
  return applyJoints(doc, sites, choices);
};
const railOf = (doc: FlatDocument) => doc.boards.find((b) => b.name === 'Rail')!;

const curvesFor = (end: CutFrom): CurveCut[] => [
  { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: end, start: 2, span: 5, rise: 0.5 }) },
  { id: 'c', ...cornerCurve({ through: 'thickness', uFrom: end, vFrom: 'min', radius: 0.5 }) },
  { id: 'far', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: flip(end), start: 2, span: 3, rise: 0.5 }) },
  { id: 'thru', ...archCurve({ through: 'length', along: 'width', side: 'min', from: 'min', start: 0.5, span: 1.5, rise: 0.25 }) },
];
const profilesFor = (end: CutFrom): ProfileCut[] => [
  stopped('p1', side('width', 'min'), end, 2, 6),
  stopped('p2', side('width', 'max'), flip(end), 3, 7),
];

describe.each(POSTURES.flatMap((p) => TURNS.flatMap((r) => ([1, -1] as const).map((s) => [p, r, s] as const))))('growth, %s turn %s world side %s', (posture, rotation, sign) => {
  const { end } = railAndLeg(posture, rotation, [], [], sign);
  const input = railAndLeg(posture, rotation, curvesFor(end), profilesFor(end), sign).doc;
  const out = tenon(input, 1);
  const before = railOf(input);
  const after = railOf(out.doc);

  it('a curve measured from the moving end stays put in world space', () => {
    expect(after.length).toBe(19);
    // 'thru' is left out: its through coordinate is measured from the end that moves, so its probe point moves with the end.
    expectSame(curvePoints(before, before.curves.slice(0, 3)), curvePoints(after, after.curves.slice(0, 3)));
    expect(after.curves.find((c) => c.id === 'a')!.start[0]).toBe(3);
    expect(after.curves.find((c) => c.id === 'c')!.start[0]).toBe(before.curves[1].start[0] + 1);
  });

  it('a curve measured from the far end is untouched', () => {
    expect(after.curves.find((c) => c.id === 'far')).toEqual(before.curves[2]);
    const b = structuredClone(before);
    const kept = [...b.curves];
    rebaseCurves(b, 'length', end, 1);
    expect(b.curves[2]).toBe(kept[2]);
    expect(b.curves[0]).not.toBe(kept[0]);
  });

  it('a through-d curve keeps its numbers', () => {
    const b = structuredClone(before);
    const kept = [...b.curves];
    rebaseCurves(b, 'length', end, 1);
    expect(b.curves[3]).toBe(kept[3]);
    expect(after.curves.find((c) => c.id === 'thru')).toEqual(before.curves[3]);
  });

  it('a station measured from the moving end stays put', () => {
    const p1 = after.profiles.find((p) => p.id === 'p1')!;
    expect(stationWorld(after, p1)).toHaveLength(2);
    stationWorld(before, before.profiles[0]).forEach((v, i) => expect(Math.abs(stationWorld(after, p1)[i] - v)).toBeLessThan(1e-12));
    const s0 = profileSpan(before, before.profiles[0])!; const s1 = profileSpan(after, p1)!;
    expect(s1.hi - s1.lo).toBeCloseTo(s0.hi - s0.lo, 12);
    const p2 = after.profiles.find((p) => p.id === 'p2')!;
    expect(ordered(p2)).toEqual(ordered(before.profiles[1]));
  });

  it('a joined part keeps every curve and profile id', () => {
    expect(after.curves.map((c) => c.id)).toEqual(['a', 'c', 'far', 'thru']);
    expect(after.profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('resize then resizeAt restores every number within GATE_TOLERANCE', () => {
    const back = readJoints(out.doc);
    if ('refused' in back) throw new Error(back.refused);
    const plain = back.plain.find((b) => b.name === 'Rail')!;
    expect(plain.length).toBe(18);
    expectClose(plain.curves, before.curves, 'curves');
    expectClose(plain.profiles.map(ordered), before.profiles.map(ordered), 'profiles');
  });
});

describe('the identity and the input', () => {
  const end: CutFrom = 'max';
  it('through ends and loops are untouched', () => {
    const b = createBoard({ length: 18, width: 3.5, thickness: 0.75, profiles: [throughRun('t', side('width', 'min')), loopOf('l')] });
    const kept = [...b.profiles];
    rebaseProfiles(b, 'length', 'min', 1);
    rebaseProfiles(b, 'length', end, 1);
    expect(b.profiles[0]).toBe(kept[0]);
    expect(b.profiles[1]).toBe(kept[1]);
  });

  it('a two-side run shifts only its station on the moving dimension', () => {
    // Start: the width-min side, which runs along the LENGTH, at 4 from min. End: the length-max side, along the WIDTH, at 2.
    const p = twoSide('p', side('width', 'min'), 4, side('length', 'max'), 2);
    const b = createBoard({ length: 18, width: 3.5, thickness: 0.75, profiles: [p] });
    rebaseProfiles(b, 'length', 'max', 1);
    expect(b.profiles[0]).toBe(p);
    rebaseProfiles(b, 'length', 'min', 0.5);
    const run = b.profiles[0].run as { start: { at: number }; end: { at: number } };
    expect(run.start.at).toBe(4.5);
    expect(run.end.at).toBe(2);
    rebaseProfiles(b, 'width', 'min', 0.25);
    expect((b.profiles[0].run as { end: { at: number } }).end.at).toBe(2.25);
    expect((b.profiles[0].run as { start: { at: number } }).start.at).toBe(4.5);
  });

  it('a coordinate measured from v shifts when d is v, and u is left alone', () => {
    const c: CurveCut = { id: 'n', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'max', radius: 1 }) };
    const b = createBoard({ length: 18, width: 3.5, thickness: 0.75, curves: [c] });
    rebaseCurves(b, 'width', 'max', 2);
    expect(b.curves[0].start[0]).toBe(c.start[0]);
    expect(b.curves[0].start[1]).toBe(c.start[1] + 2);
    expect(b.curves[0].segments.map((s) => s.to[0])).toEqual(c.segments.map((s) => s.to[0]));
    expect(b.curves[0].segments.map((s) => s.to[1])).toEqual(c.segments.map((s) => s.to[1] + 2));
  });

  it('the input is never mutated, and the rebase replaces entries', () => {
    const { end: e } = railAndLeg('flat', 0, [], []);
    const input = railAndLeg('flat', 0, curvesFor(e), profilesFor(e)).doc;
    const rail = railOf(input);
    rail.curves.forEach(deepFreeze);
    rail.profiles.forEach(deepFreeze);
    deepFreeze(rail.curves);
    deepFreeze(rail.profiles);
    expect(() => tenon(input, 1)).not.toThrow();
    const b = { ...rail };
    expect(() => { rebaseCurves(b, 'length', e, 1); rebaseProfiles(b, 'length', e, 1); }).not.toThrow();
    expect(rail.curves[0].start[0]).toBe(2);
    expect(b.curves[0].start[0]).toBe(3);
  });

  it('curve and profile ids and counts survive applyJoints and its closing migrateDocument', () => {
    const { end: e } = railAndLeg('flat', 0, [], []);
    const out = tenon(railAndLeg('flat', 0, curvesFor(e), profilesFor(e)).doc, 1);
    const again = railOf(flatDocument(migrateDocument(JSON.parse(JSON.stringify(out.doc)))));
    expect(again.curves.map((c) => c.id)).toEqual(['a', 'c', 'far', 'thru']);
    expect(again.profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('a trim (rabbet)', () => {
  const bookcase = (posture: Posture, rotation: Rotation) => {
    const doc = flatDocument(designToDocument({
      name: 'T',
      parts: [
        { name: 'Left', at: { x: 0, y: 0, z: 0 }, size: { x: 0.75, y: 30, z: 11.25 } },
        { name: 'Right', at: { x: 20.75, y: 0, z: 0 }, size: { x: 0.75, y: 30, z: 11.25 } },
        { name: 'Shelf', at: { x: 0.75, y: 12, z: 0 }, size: { x: 20, y: 0.75, z: 11.25 } },
        { name: 'Back', at: { x: 0, y: 0, z: 11.25 }, size: { x: 21.5, y: 30, z: 0.25 } },
      ].map((p) => ({ ...p, material: 'oak' })),
    }).doc);
    const shelf = doc.boards.find((b) => b.name === 'Shelf')!;
    // The same 20 x 0.75 x 11.25 box in the world, in any pose: each world extent is given to the dimension that shows it.
    const extents = boardExtents(shelf);
    shelf.posture = posture;
    shelf.rotation = rotation;
    axisDimensions(shelf).forEach((dim, a) => { shelf[dim] = extents[a]; });
    const d = axisDimensions(shelf)[2]; // the dimension the Back's trim shortens
    const e = endFacing(shelf, 2, 1);
    // The arch runs along d from the trimmed end (through a dimension that is not d); the stations lie on the sides that
    // run along d (when d is thickness no side does, and they sit on the width sides, untouched). Everything starts 2 in
    // from the end, clear of the 0.25 slab the trim removes.
    const through = d === 'thickness' ? 'width' : 'thickness';
    shelf.curves = [{ id: 'a', ...archCurve({ through, along: d, side: 'min', from: e, start: 2, span: 3, rise: 0.5 }) }];
    const across = d === 'width' ? 'length' : 'width';
    shelf.profiles = [stopped('p1', side(across, 'min'), e, 2, 5), stopped('p2', side(across, 'max'), flip(e), 2, 5)];
    return { doc, shelf, d };
  };
  const rabbet = (doc: FlatDocument) => {
    const sites = findSites(doc);
    return applyJoints(doc, sites, sites.filter((s) => s.kind === 'face-against-edge').map((s): JointChoice => ({ site: s.id, joint: 'rabbet', depth: 0.375 })));
  };

  it.each(POSTURES.flatMap((p) => TURNS.map((r) => [p, r] as const)))('a curve and a station measured from the trimmed end stay put (%s turn %s)', (posture, rotation) => {
    const { doc, shelf, d } = bookcase(posture, rotation);
    const out = rabbet(doc);
    expect(out.trimmed).toContain('Shelf');
    const after = out.doc.boards.find((b) => b.name === 'Shelf')!;
    expect(after.curves.map((c) => c.id)).toEqual(['a']);
    expectSame(curvePoints(shelf), curvePoints(after));
    // The arch's start is its one coordinate along d: 2 in from the end before, 1.75 after the 0.25 trim.
    const at = uvDims(shelf.curves[0].through).indexOf(d);
    expect(shelf.curves[0].start[at]).toBe(2);
    expect(after.curves[0].start[at]).toBe(1.75);
    expect(after.profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
    shelf.profiles.forEach((p, i) => {
      stationWorld(shelf, p).forEach((v, j) => expect(Math.abs(stationWorld(after, after.profiles[i])[j] - v)).toBeLessThan(1e-12));
    });
    expect(ordered(after.profiles[1])).toEqual(ordered(shelf.profiles[1]));
    if (d !== 'thickness') {
      const run = after.profiles[0].run as { start: { at: number }; end: { at: number } };
      expect([run.start.at, run.end.at].sort()).toEqual([1.75, 4.75]);
    }
    const back = readJoints(out.doc);
    if ('refused' in back) throw new Error(back.refused);
    const plain = back.plain.find((b) => b.name === 'Shelf')!;
    expectClose(plain.curves, shelf.curves, 'curves');
    expectClose(plain.profiles.map(ordered), shelf.profiles.map(ordered), 'profiles');
  });
});

// Final review C1: an arc stored exactly AT the half-circle bound (the Half-round notch preset: rise === span / 2; or a
// radius-form arc at radius === chord / 2) must survive a re-anchor. Two separate float additions do not preserve a
// difference, so a shifted chord of 2 can come back 1.9999999999999991 and the loader (rise > chord / 2) would DROP the
// curve in applyJoints' closing migrateDocument. rebaseCurves keeps the arc at the bound of its NEW chord.
describe('an arc at the half-circle bound survives a re-anchor (final review C1)', () => {
  const MM = 25.4;
  /** A Half-round notch AT its bound: notchAt's placement (2 wide, centred along the length, measured from `from`) with
   *  rise = the STORED chord / 2. (notchAt's own rise 1 is not at the bound on every metric length: (s + 2) − s is not
   *  always 2, a preset matter outside joinery and noted in the final-fix report.) */
  const half = (s: number) => ((s + 2) - s) / 2;
  const notch = (L: number, from: CutFrom): CurveCut => {
    const s = L / 2 - 1;
    return { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from, start: s, span: 2, rise: half(s) }) };
  };
  /** The same notch in radius form: radius === chord / 2. */
  const radiusNotch = (L: number, from: CutFrom): CurveCut => {
    const s = L / 2 - 1;
    return { id: 'r', through: 'thickness', uFrom: from, vFrom: 'min', start: [s, 0],
      segments: [{ type: 'arc', to: [s + 2, 0], side: 'left', radius: half(s) }, { type: 'line', to: [s, 0] }] };
  };
  const reload = (doc: FlatDocument) => flatDocument(migrateDocument(JSON.parse(JSON.stringify(doc))));
  const arcOf = (c: CurveCut) => c.segments.find((g) => g.type === 'arc') as Extract<CurveCut['segments'][number], { type: 'arc' }>;
  const chordOf = (c: CurveCut) => { const a = arcOf(c); const at = c.segments[c.segments.indexOf(a) - 1]?.to ?? c.start; return Math.hypot(a.to[0] - at[0], a.to[1] - at[1]); };

  /** One rail: tenoned, reloaded, and read back; null where everything held, else what failed. */
  const survives = (L: number, tenonLength: number, make: (L: number, from: CutFrom) => CurveCut): string | null => {
    const { end } = railAndLeg('flat', 0, [], [], 1, L);
    const input = railAndLeg('flat', 0, [make(L, end)], [], 1, L).doc;
    const c = railOf(input).curves[0];
    if (chordOf(c) / 2 !== (arcOf(c).rise ?? arcOf(c).radius)) return 'the input is not at the bound';
    const out = tenon(input, tenonLength);
    const joined = railOf(reload(out.doc));
    if (joined.curves.length !== 1) return `joined: ${joined.curves.length} curves`;
    const back = readJoints(out.doc);
    if ('refused' in back) return `readJoints: ${back.refused}`;
    const plain = reload({ ...out.doc, boards: back.plain });
    if (railOf(plain).curves.length !== 1) return `plain: ${railOf(plain).curves.length} curves`;
    return null;
  };

  it('(1) a mortise-and-tenon growth at a 305 mm rail keeps the Half-round notch, a notch, in place', () => {
    const L = 305 / MM;
    const { end } = railAndLeg('flat', 0, [], [], 1, L);
    const input = railAndLeg('flat', 0, [notch(L, end)], [], 1, L).doc;
    const before = railOf(input);
    expect(curveKindChoice(before.curves[0])).toBe('notch');
    expect(arcOf(before.curves[0]).rise).toBe(1); // notchAt's own numbers at 305 mm: the reviewer's repro exactly
    const out = tenon(input, 1);
    const after = railOf(reload(out.doc));
    expect(after.curves).toHaveLength(1);
    expect(curveKindChoice(after.curves[0])).toBe('notch');
    expect(arcOf(after.curves[0]).rise).toBe(chordOf(after.curves[0]) / 2);
    const want = curvePoints(before); const got = curvePoints(after);
    expect([...got.keys()]).toEqual([...want.keys()]);
    for (const [key, p] of want) p.forEach((v, i) => expect(Math.abs(got.get(key)![i] - v), key).toBeLessThanOrEqual(1e-9));
    expect(Math.abs(arcOf(after.curves[0]).rise! - 1)).toBeLessThanOrEqual(GATE_TOLERANCE);
    expect('refused' in gateUnjoin(out.doc)).toBe(false);
  });

  it('(3) resize then resizeAt brings the notch back a notch, within GATE_TOLERANCE, and the gate passes', () => {
    const L = 305 / MM;
    const { end } = railAndLeg('flat', 0, [], [], 1, L);
    const input = railAndLeg('flat', 0, [notch(L, end)], [], 1, L).doc;
    const out = tenon(input, 1);
    const back = readJoints(out.doc);
    if ('refused' in back) throw new Error(back.refused);
    const plain = railOf(reload({ ...out.doc, boards: back.plain }));
    expect(plain.curves).toHaveLength(1);
    expect(curveKindChoice(plain.curves[0])).toBe('notch');
    expectClose(plain.curves, railOf(input).curves, 'curves');
    const gate = gateUnjoin(out.doc);
    expect('refused' in gate).toBe(false);
  });

  it('a radius-form arc at radius === chord / 2 survives growth and the round trip', () => {
    const L = 305 / MM;
    const { end } = railAndLeg('flat', 0, [], [], 1, L);
    const input = railAndLeg('flat', 0, [radiusNotch(L, end)], [], 1, L).doc;
    const out = tenon(input, 1);
    const after = railOf(reload(out.doc));
    expect(after.curves).toHaveLength(1);
    expect(arcOf(after.curves[0]).radius).toBe(chordOf(after.curves[0]) / 2);
    expect(Math.abs(arcOf(after.curves[0]).radius! - 1)).toBeLessThanOrEqual(GATE_TOLERANCE);
    expect(survives(L, 1, radiusNotch)).toBeNull();
    expect('refused' in gateUnjoin(out.doc)).toBe(false);
  });

  it('an arc below the bound keeps its stored rise exactly; one shifted past nothing is the same object', () => {
    const c: CurveCut = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'max', start: 305 / MM / 2 - 1, span: 2, rise: 0.5 }) };
    const b = createBoard({ length: 305 / MM, width: 3.5, thickness: 0.75, curves: [c] });
    rebaseCurves(b, 'length', 'max', 1);
    expect(arcOf(b.curves[0]).rise).toBe(0.5);
    const kept = b.curves[0];
    rebaseCurves(b, 'length', 'min', 1);
    expect(b.curves[0]).toBe(kept);
  });

  it('an arc an ulp inside the bound whose shifted chord would put it past the bound is clamped to it, and kept', () => {
    // A rise one ulp under its stored chord / 2, or a radius one ulp over it (legal to the loader; not a notch): a shift can
    // shorten the chord by an ulp, past which the loader would drop the curve. The number is clamped to the new bound.
    const step = (x: number, by: bigint) => { const f = new Float64Array([x]); new BigInt64Array(f.buffer)[0] += by; return f[0]; };
    const below = (x: number) => step(x, -1n);
    const above = (x: number) => step(x, 1n);
    let seen = 0;
    for (let mm = 40; mm <= 200; mm += 1) {
      for (let sp = 20; sp <= 120; sp += 7) {
        for (const amount of [1, 6 / MM, 0.75]) {
          const s0 = mm / MM;
          const t0 = s0 + sp / MM;
          const half0 = Math.hypot(t0 - s0, 0) / 2;
          const half1 = Math.hypot((t0 + amount) - (s0 + amount), 0) / 2;
          const rise = below(half0);
          const radius = above(half0);
          for (const arc of [rise > half1 && { rise }, radius < half1 && { radius }]) {
            if (!arc) continue;
            seen += 1;
            const c = { id: 'a', through: 'thickness', uFrom: 'max', vFrom: 'min', start: [s0, 0],
              segments: [{ type: 'arc', to: [t0, 0], side: 'left', ...arc }, { type: 'line', to: [s0, 0] }] } as CurveCut;
            const b = createBoard({ length: 100, width: 3.5, thickness: 0.75, curves: [c] });
            rebaseCurves(b, 'length', 'max', amount);
            const got = arcOf(b.curves[0]);
            const n = 'rise' in arc ? got.rise! : got.radius!;
            expect(n).toBe(chordOf(b.curves[0]) / 2);
            expect(Math.abs(n - ('rise' in arc ? rise : radius))).toBeLessThanOrEqual(GATE_TOLERANCE);
            expect(flatDocument(migrateDocument(JSON.parse(JSON.stringify({ version: 20, name: 'T', boards: [b] })))).boards[0].curves).toHaveLength(1);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(100);
  });

  it('a sweep of metric rails 300-1500 mm x tenon lengths drops no notch (growth and the round trip)', () => {
    const failed: string[] = [];
    for (let mm = 300; mm <= 1500; mm += 5) {
      for (const t of [1, 0.75, 25 / MM]) {
        for (const make of [notch, radiusNotch]) {
          const why = survives(mm / MM, t, make);
          if (why) failed.push(`${mm} mm, tenon ${t}, ${make === notch ? 'rise' : 'radius'}: ${why}`);
        }
      }
    }
    expect(failed).toEqual([]);
  });

  it('(2) a rabbet trim keeps a Half-round notch measured from the trimmed end, a notch, in place', () => {
    const failed: string[] = [];
    for (let mm = 40; mm <= 200; mm += 1) for (const thin of [0.25, 6 / MM, 9 / MM]) {
      const doc = flatDocument(designToDocument({
        name: 'T',
        parts: [
          { name: 'Left', at: { x: 0, y: 0, z: 0 }, size: { x: 0.75, y: 30, z: 11.25 } },
          { name: 'Right', at: { x: 20.75, y: 0, z: 0 }, size: { x: 0.75, y: 30, z: 11.25 } },
          { name: 'Shelf', at: { x: 0.75, y: 12, z: 0 }, size: { x: 20, y: 0.75, z: 11.25 } },
          { name: 'Back', at: { x: 0, y: 0, z: 11.25 }, size: { x: 21.5, y: 30, z: 0.25 } },
        ].map((p) => ({ ...p, material: 'oak' })),
      }).doc);
      // A metric back (designToDocument snaps sizes to 1/16, so it is set here): the shelf's trim is the back's
      // thickness, and a dyadic trim (0.25) shifts every coordinate exactly, which cannot show the bug.
      const backPart = doc.boards.find((b) => b.name === 'Back')!;
      backPart[axisDimensions(backPart)[2]] = thin;
      const shelf = doc.boards.find((b) => b.name === 'Shelf')!;
      const d = axisDimensions(shelf)[2];
      const e = endFacing(shelf, 2, 1);
      const through = d === 'thickness' ? 'width' : 'thickness';
      shelf.curves = [{ id: 'n', ...archCurve({ through, along: d, side: 'min', from: e, start: mm / MM, span: 2, rise: half(mm / MM) }) }];
      if (curveKindChoice(shelf.curves[0]) !== 'notch') { failed.push(`${mm} mm, back ${thin}: the input is not a notch`); continue; }
      const sites = findSites(doc);
      const out = applyJoints(doc, sites, sites.filter((s) => s.kind === 'face-against-edge').map((s): JointChoice => ({ site: s.id, joint: 'rabbet', depth: 0.375 })));
      if (!out.trimmed.includes('Shelf')) { failed.push(`${mm} mm, back ${thin}: not trimmed`); continue; }
      const after = reload(out.doc).boards.find((b) => b.name === 'Shelf')!;
      if (after.curves.length !== 1) { failed.push(`${mm} mm, back ${thin}: dropped`); continue; }
      if (curveKindChoice(after.curves[0]) !== 'notch') failed.push(`${mm} mm, back ${thin}: ${curveKindChoice(after.curves[0])}`);
      const want = curvePoints(shelf); const got = curvePoints(after);
      for (const [key, p] of want) p.forEach((v, i) => { if (Math.abs(got.get(key)![i] - v) > 1e-9) failed.push(`${mm} mm, back ${thin}: ${key} moved`); });
      if ('refused' in gateUnjoin(out.doc)) failed.push(`${mm} mm, back ${thin}: gate refused`);
      const back = readJoints(out.doc);
      if ('refused' in back) { failed.push(`${mm} mm, back ${thin}: ${back.refused}`); continue; }
      const plain = reload({ ...out.doc, boards: back.plain }).boards.find((b) => b.name === 'Shelf')!;
      if (plain.curves.length !== 1 || curveKindChoice(plain.curves[0]) !== 'notch') failed.push(`${mm} mm, back ${thin}: plain lost the notch`);
    }
    expect(failed).toEqual([]);
  });
});
