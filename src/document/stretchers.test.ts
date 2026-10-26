import { describe, expect, it } from 'vitest';
import type { Board, Definition, HoleRow, Instance, SloydDocument } from './types';
import { DEFAULT_MATERIAL } from './types';
import type { Units } from '../units/length';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import { chooseFace, slopeOf } from './lean';
import { boreRow, partAxis } from './legSockets';
import { holeInstances } from './holes';
import { toWorld } from './snapPoints';
import { worldBodies } from './drawing';
import { checkDesign, type DesignLimits } from './designCheck';
import { tenonJoints } from './tenonJoints';
import { tenonsOf, withTenons } from './roundTenons';
import { tenonFaultText } from './tenonText';
import { displayNames, worldParts } from './tree';
import { mapWorld } from './treeEdit';
import { squareStoolDocument, stoolDocument } from './stoolFixture';
import { linkByRole } from './roleLinks';
import { levelPlan } from './levelEnds';
import {
  defaultHeight, refitPlan, rungLegAt, rungLine, shoulderStation, stretcherOf, stretcherPlan, type RefitPlan, type StretcherPlan,
} from './stretchers';
import {
  STRETCHER_CONTAINERS, STRETCHER_NOT_SQUARE, stretcherAmbiguous, stretcherClosureDisagrees, stretcherDifferentSocket,
  stretcherLinkNote, stretcherMirrored, stretcherOutOfReach, stretcherSocketFaulted, stretcherTurned, stretcherTurnedLeg,
} from './stretcherText';

type V3 = [number, number, number];
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const len = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);
const onGrid = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) <= 1e-9;

const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };
const kindsOf = (doc: SloydDocument) => checkDesign(flatDocument(doc), NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`);
const MM: Units = { display: 'metric-mm', precision: 16 };
const O = { size: 1, diameter: 5 / 8 };

const world = (doc: SloydDocument) => worldParts(doc);
const part = (doc: SloydDocument, name: string) => world(doc).find((b) => b.name === name)!;
const ids = (doc: SloydDocument, a: string, b: string): [string, string] => [part(doc, a).id, part(doc, b).id];

/** Where `leg`'s axis crosses y = h, computed here from `partAxis` (independent of `rungLine`). */
function axisPoint(leg: Board, h: number): V3 {
  const { p, u } = partAxis(leg);
  const t = (h - p[1]) / u[1];
  return [p[0] + t * u[0], h, p[2] + t * u[2]];
}

function planOf(doc: SloydDocument, legIds: [string, string], o: { height: number; size: number; diameter: number }): StretcherPlan {
  const p = stretcherPlan(doc, legIds, o);
  if (typeof p === 'string') throw new Error(p);
  return p;
}

/** The plan applied by hand (Task 4's store does this): the rung into the root, each leg's holes through `mapWorld`. */
function apply(doc: SloydDocument, p: StretcherPlan): SloydDocument {
  let out: SloydDocument = { ...doc, boards: [...doc.boards, p.rung] };
  for (const e of p.legs) out = mapWorld(out, (w) => w.map((b) => (b.id === e.id ? { ...b, holes: e.holes } : b)));
  return out;
}

/** Whether world point `q` is inside (or on) one of `leg`'s world bodies. */
function inWood(leg: Board, q: readonly number[]): boolean {
  return worldBodies(leg).some((body) => (body.box
    ? [0, 1, 2].every((i) => q[i]! >= body.box!.min[i]! && q[i]! <= body.box!.max[i]!)
    : body.planes.every((pl) => pl.m[0] * q[0]! + pl.m[1] * q[1]! + pl.m[2] * q[2]! + pl.c >= 0)));
}

/** Along `q0 + s·w`, where the line leaves the leg's wood, by bisection (independent of the planner's plane clipping):
 *  `s` from 0 (inside) out to `far` (outside). */
function exitByBisection(leg: Board, q0: V3, w: V3, far = 3): number {
  const at = (s: number): V3 => [q0[0] + s * w[0], q0[1] + s * w[1], q0[2] + s * w[2]];
  let lo = 0;
  let hi = far;
  expect(inWood(leg, at(lo))).toBe(true);
  expect(inWood(leg, at(hi))).toBe(false);
  for (let k = 0; k < 80; k += 1) {
    const mid = (lo + hi) / 2;
    if (inWood(leg, at(mid))) lo = mid; else hi = mid;
  }
  return lo;
}

/** The rung's four section corners at local length `l` (world). */
const cornersAt = (rung: Board, l: number) => [[0, 0], [rung.width, 0], [0, rung.thickness], [rung.width, rung.thickness]]
  .map(([w, t]) => toWorld(rung, { length: l, width: w!, thickness: t! }));
const centreAt = (rung: Board, l: number) => toWorld(rung, { length: l, width: rung.width / 2, thickness: rung.thickness / 2 });

/** The tenon at the rung end facing `leg`'s axis point `p` (the nearer end). */
function endFacing(rung: Board, p: V3) {
  const [lo, hi] = [centreAt(rung, 0), centreAt(rung, rung.length)];
  const end = len(sub(lo, p)) < len(sub(hi, p)) ? 'min' : 'max';
  return { end, tenon: tenonsOf(rung).find((t) => t.end === end)!, tipL: end === 'min' ? 0 : rung.length,
    shoulderL: end === 'min' ? tenonsOf(rung).find((t) => t.end === end)!.length : rung.length - tenonsOf(rung).find((t) => t.end === end)!.length };
}

const rungJoints = (doc: SloydDocument) => {
  const flat = flatDocument(doc);
  return tenonJoints(flat).filter((j) => flat.boards[j.a]!.name.includes('Stretcher'));
};

describe('stretchers: the front rung on the square-set stool (spec §3, Amended S1)', () => {
  const doc = squareStoolDocument();
  const legIds = ids(doc, 'Front right', 'Front left');
  const right = part(doc, 'Front right');
  const left = part(doc, 'Front left');
  const pr = axisPoint(right, 6);
  const pl = axisPoint(left, 6);
  const D = Math.abs(pr[0] - pl[0]);

  it('the axis points differ only in X; rungLine runs exactly along X at y = 6 through their mid z', () => {
    expect(Math.abs(pr[2] - pl[2])).toBeLessThanOrEqual(1e-6);
    const line = rungLine(right, left, 6);
    if (typeof line === 'string') throw new Error(line);
    expect(line.axis).toBe(0);
    expect(line.p0[1]).toBe(6);
    expect(line.p1[1]).toBe(6);
    expect(line.p0[2]).toBe(line.p1[2]);
    expect(Math.abs(line.p0[2] - (pr[2] + pl[2]) / 2)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(line.p0[0] - pr[0])).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(line.p1[0] - pl[0])).toBeLessThanOrEqual(1e-12);
  });

  it('the rung: flat along X, level, L and S on the 1/16 grid, each tip (D − L)/2 short of its leg axis', () => {
    const p = planOf(doc, legIds, { height: 6, ...O });
    const rung = p.rung;
    expect([rung.posture, rung.rotation, rung.width, rung.thickness]).toEqual(['flat', 0, 1, 1]);
    expect(world(doc).some((b) => b.id === rung.id)).toBe(false);
    expect(rung.name).toBe('Stretcher');
    expect(partAxis(rung).u).toEqual([1, 0, 0]);
    // L = D rounded DOWN to 1/16.
    expect(onGrid(rung.length, 1 / 16)).toBe(true);
    expect(rung.length).toBeLessThanOrEqual(D + 1e-9);
    expect(rung.length).toBeGreaterThan(D - 1 / 16);
    const ts = tenonsOf(rung);
    expect(ts.map((t) => t.end).sort()).toEqual(['max', 'min']);
    expect(ts.every((t) => t.diameter === 5 / 8)).toBe(true);
    const S = rung.length - ts[0]!.length - ts[1]!.length;
    expect(onGrid(S, 1 / 16)).toBe(true);
    for (const [leg, ap] of [[right, pr], [left, pl]] as const) {
      const e = endFacing(rung, ap);
      // Level: the tenon's tip and shoulder centres at y = 6.
      expect(Math.abs(centreAt(rung, e.tipL)[1] - 6)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(centreAt(rung, e.shoulderL)[1] - 6)).toBeLessThanOrEqual(1e-9);
      // The tip short of the leg's axis point by (D − L)/2, on the axis.
      expect(Math.abs(len(sub(centreAt(rung, e.tipL), ap)) - (D - rung.length) / 2)).toBeLessThanOrEqual(1e-9);
      // Every shoulder corner clear of the leg: a probe 1e-6 inside the shoulder plane (toward the rung's middle).
      const inward = e.end === 'min' ? 1e-6 : -1e-6;
      for (const c of cornersAt(rung, e.shoulderL + inward)) expect(inWood(leg, c), `${leg.name} corner`).toBe(false);
    }
  });

  it('the shoulder station is the farthest corner exit (bisection), the slack split evenly; the gap the widest corner gap', () => {
    const p = planOf(doc, legIds, { height: 6, ...O });
    const rung = p.rung;
    const line = rungLine(right, left, 6);
    if (typeof line === 'string') throw new Error(line);
    let gap = -Infinity;
    const stations: number[] = [];
    const shoulders: number[] = [];
    for (const [leg, ap, atStart] of [[right, line.p0, true], [left, line.p1, false]] as const) {
      const w: V3 = atStart ? [-1, 0, 0] : [1, 0, 0];
      const exits = [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]]
        .map(([y, z]) => exitByBisection(leg, [ap[0], ap[1] + y!, ap[2] + z!], w));
      const s = shoulderStation(leg, line, 1, atStart);
      expect(Math.abs(s - Math.max(...exits))).toBeLessThanOrEqual(1e-9);
      stations.push(s);
      const e = endFacing(rung, ap as V3);
      const shoulder = len(sub(centreAt(rung, e.shoulderL), ap));
      shoulders.push(shoulder);
      gap = Math.max(gap, shoulder - Math.min(...exits));
    }
    const slack = (D - stations[0]! - stations[1]!) - (rung.length - tenonsOf(rung)[0]!.length - tenonsOf(rung)[1]!.length);
    expect(slack).toBeGreaterThanOrEqual(-1e-9);
    expect(slack).toBeLessThan(1 / 16);
    expect(Math.abs(shoulders[0]! - stations[0]! - slack / 2)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(shoulders[1]! - stations[1]! - slack / 2)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(p.gap - gap)).toBeLessThanOrEqual(1e-9);
    expect(p.gap).toBeGreaterThan(0);
  });

  it('the sockets: one new blind row per leg, along the exact axis; Front right enters width min (T1c, pinned)', () => {
    const p = planOf(doc, legIds, { height: 6, ...O });
    expect(p.legs.map((e) => e.id)).toEqual(legIds);
    const fr = p.legs[0]!;
    expect(fr.holes).toHaveLength(right.holes.length + 1);
    const row = fr.holes.at(-1)!;
    expect([row.face, row.from]).toEqual(PINNED_FRONT_RIGHT_ENTRY);
    // The key numbers, measured on the square-set stool and pinned: L, S, both sockets 50/64 deep.
    expect(p.rung.length).toBe(14.25);
    expect(p.rung.length - tenonsOf(p.rung)[0]!.length - tenonsOf(p.rung)[1]!.length).toBeCloseTo(12.4375, 12);
    expect(p.legs.map((e) => e.holes.at(-1)!.depth)).toEqual([50 / 64, 50 / 64]);
    expect(row.count).toBe(1);
    expect(row.diameter).toBe(5 / 8);
    expect(typeof row.depth).toBe('number');
    expect(onGrid(row.depth as number, 1 / 64)).toBe(true);
    // The mouth on the rung's line.
    const h = holeInstances(right, row)[0]!;
    const mouth = toWorld(right, { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] });
    expect(Math.abs(mouth[1] - 6)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(mouth[2] - pr[2])).toBeLessThanOrEqual(1e-6);
  });

  it('applied by hand: two rung joints, the check clean', () => {
    const p = planOf(doc, legIds, { height: 6, ...O });
    const next = apply(doc, p);
    expect(rungJoints(next)).toHaveLength(2);
    expect(kindsOf(next)).toEqual([]);
  });

  it('linked legs (Review Focus 1): Front right\'s socket appears on Back left; the notes name Back left and Back right', () => {
    const p = planOf(doc, legIds, { height: 6, ...O });
    expect(p.notes).toEqual([stretcherLinkNote('Back left'), stretcherLinkNote('Back right')]);
    const next = apply(doc, p);
    expect(part(next, 'Back left').holes).toHaveLength(part(doc, 'Back left').holes.length + 1);
    expect(part(next, 'Back left').holes.at(-1)).toEqual(p.legs[0]!.holes.at(-1));
    expect(part(next, 'Back right').holes).toHaveLength(part(doc, 'Back right').holes.length + 1);
  });

  it('then the back rung at 6 REUSES those rows: hole counts unchanged, four rung joints, the check clean', () => {
    const one = apply(doc, planOf(doc, legIds, { height: 6, ...O }));
    const back = ids(one, 'Back left', 'Back right');
    const p = planOf(one, back, { height: 6, ...O });
    expect(p.notes).toEqual([]);
    expect(p.rung.name).not.toBe('Stretcher');
    for (const e of p.legs) expect(e.holes).toEqual(world(one).find((b) => b.id === e.id)!.holes);
    const two = apply(one, p);
    for (const n of ['Front right', 'Front left', 'Back left', 'Back right']) {
      expect(part(two, n).holes).toHaveLength(part(one, n).holes.length);
    }
    expect(rungJoints(two)).toHaveLength(4);
    expect(kindsOf(two)).toEqual([]);
  });

  it('a side rung at the same height meets the front socket: the socket-fault sentence (Review Focus 2)', () => {
    const one = apply(doc, planOf(doc, legIds, { height: 6, ...O }));
    expect(stretcherPlan(one, ids(one, 'Front right', 'Back right'), { height: 6, ...O }))
      .toBe(stretcherSocketFaulted('Front right', 'meet another hole'));
  });

  it('the default height: one third of the axis top on the grid (5-5/16), stepping 1-1/2 over a rung already there', () => {
    expect(defaultHeight(doc, legIds, 5 / 8)).toBe(5 + 5 / 16);
    const one = apply(doc, planOf(doc, legIds, { height: defaultHeight(doc, legIds, 5 / 8), ...O }));
    const side = ids(one, 'Front right', 'Back right');
    const h = defaultHeight(one, side, 5 / 8);
    expect(h).toBe(5 + 5 / 16 + 1.5);
    const two = apply(one, planOf(one, side, { height: h, ...O }));
    expect(rungJoints(two)).toHaveLength(4);
    expect(kindsOf(two)).toEqual([]);
  });
});

/** Front right's entry face on the square-set stool's front rung (ruling T1c), measured and pinned. */
const PINNED_FRONT_RIGHT_ENTRY = ['width', 'min'];

describe('stretchers: refusals', () => {
  it('a leg leaning TURNED with a twist: the turned-leg sentence, before anything else (Amended S1)', () => {
    const doc = stoolDocument();
    expect(stretcherPlan(doc, ids(doc, 'Front right', 'Front left'), { height: 6, ...O })).toBe(stretcherTurnedLeg('Front right'));
    expect(stretcherPlan(doc, ids(doc, 'Front left', 'Front right'), { height: 6, ...O })).toBe(stretcherTurnedLeg('Front left'));
  });

  it('a turned lean with zero twist (rake only) is allowed', () => {
    const z = slopeOf(8);
    const mk = (name: string, x: number) => createBoard({ name, posture: 'upright', length: 20, width: 1.5, thickness: 1.5,
      position: [x, 0, -0.75], lean: { x: 0, z, face: chooseFace(createBoard({ posture: 'upright' }), 0, z) } });
    const doc = migrateDocument({ ...createDocument('Rake'), boards: [mk('A', -6.75), mk('B', 5.25)] });
    expect(world(doc).every((b) => b.lean !== undefined && !b.lean.square)).toBe(true);
    const p = stretcherPlan(doc, ids(doc, 'A', 'B'), { height: 6, ...O });
    expect(typeof p === 'string' ? p : 'ok').toBe('ok');
  });

  it('legs not square to each other (one nudged 0.01 in Z): the not-square sentence', () => {
    const doc0 = squareStoolDocument();
    const doc = mapWorld(doc0, (w) => w.map((b) => (b.name === 'Front left'
      ? { ...b, position: [b.position[0], b.position[1], b.position[2] + 0.01] as V3 } : b)));
    expect(stretcherPlan(doc, ids(doc, 'Front right', 'Front left'), { height: 6, ...O })).toBe(STRETCHER_NOT_SQUARE);
  });

  it('a height above a leg\'s top: out of reach, naming it', () => {
    const doc = squareStoolDocument();
    expect(stretcherPlan(doc, ids(doc, 'Front right', 'Front left'), { height: 16.5, ...O })).toBe(stretcherOutOfReach('Front right'));
  });

  it('the SECOND leg short of the height: out of reach, naming that leg', () => {
    const doc = migrateDocument({ ...createDocument('Short'), boards: [
      createBoard({ name: 'Tall', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [-6.75, 0, -0.75] }),
      createBoard({ name: 'Short', posture: 'upright', length: 12, width: 1.5, thickness: 1.5, position: [5.25, 0, -0.75] }),
    ] });
    expect(stretcherPlan(doc, ids(doc, 'Tall', 'Short'), { height: 20, ...O })).toBe(stretcherOutOfReach('Short'));
  });

  it('a rung whose section would not lie on a long face (too near the top): out of reach (ruling T1a)', () => {
    const doc = squareStoolDocument();
    expect(stretcherPlan(doc, ids(doc, 'Front right', 'Front left'), { height: 15.8, ...O })).toBe(stretcherOutOfReach('Front right'));
  });

  it('a corner line that enters an unlevelled splayed leg through its TOP, not its long face: out of reach (ruling T1a)', () => {
    // Splay only (zero twist), feet outward, tops at y = 16 tilted 12°: each inner face's top edge is 0.75·sin 12° ≈ 0.156
    // below the top's centre, so the rung's upper corner lines at y = 15.95 cross the entry plane above the face and enter
    // the wood through the tilted top.
    const x = slopeOf(12);
    const mk = (name: string, c: number, sx: number) => createBoard({ name, posture: 'upright', length: 16, width: 1.5,
      thickness: 1.5, position: [c - 0.75, 0, -0.75], lean: { x: sx, z: 0, face: chooseFace(createBoard({ posture: 'upright' }), sx, 0) } });
    const doc = migrateDocument({ ...createDocument('Splay'), boards: [mk('A', -6, -x), mk('B', 6, x)] });
    expect(stretcherPlan(doc, ids(doc, 'A', 'B'), { height: 15.45, ...O })).toBe(stretcherOutOfReach('A'));
    // Lower down the same legs take the rung.
    expect(typeof stretcherPlan(doc, ids(doc, 'A', 'B'), { height: 10, ...O })).not.toBe('string');
  });

  it('a tip that would stop short of the leg\'s face (a 1/64" plate): out of reach (ruling T1a), never a throw', () => {
    // Axes 12.04 apart, so L = 12 and each tip stops 0.02 short of its axis: outside the plate (its face 1/128 from the
    // axis), while the 1.5" post's deep shoulder leaves the plate's tenon a positive length.
    const doc = migrateDocument({ ...createDocument('Plate'), boards: [
      createBoard({ name: 'Plate', posture: 'upright', length: 30, width: 3, thickness: 1 / 64, position: [-1.5, 0, -1 / 128] }),
      createBoard({ name: 'Post', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [-0.75, 0, 12.04 - 0.75] }),
    ] });
    expect(stretcherPlan(doc, ids(doc, 'Plate', 'Post'), { height: 10, ...O })).toBe(stretcherOutOfReach('Plate'));
  });

  it('a tenon as wide as the rung: the too-wide sentence', () => {
    const doc = squareStoolDocument();
    expect(stretcherPlan(doc, ids(doc, 'Front right', 'Front left'), { height: 6, size: 1, diameter: 1 }))
      .toBe(tenonFaultText({ kind: 'too-wide' }));
  });

  it('legs in two assemblies: the container sentence', () => {
    const a = createBoard({ id: 'a', name: 'Post A', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [-6.75, 0, -0.75] });
    const b = createBoard({ id: 'b', name: 'Post B', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [0, 0, 0] });
    const d: Definition = { id: 'd', boards: [b], instances: [], hardware: [] };
    const i: Instance = { id: 'i', name: 'Frame', definition: 'd', position: [5.25, 0, -0.75], rotation: 0 };
    const doc = migrateDocument({ ...createDocument('Two'), boards: [a], instances: [i], definitions: [d] });
    expect(stretcherPlan(doc, ['a', 'i/b'], { height: 10, ...O })).toBe(STRETCHER_CONTAINERS);
  });

  it('a leg inside a mirrored copy: the mirrored-copy sentence, naming it', () => {
    const a = createBoard({ id: 'a', name: 'Post A', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [0, 0, 0] });
    const b = createBoard({ id: 'b', name: 'Post B', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [12, 0, 0] });
    const d: Definition = { id: 'd', boards: [a, b], instances: [], hardware: [] };
    const mk = (mirrored: boolean): SloydDocument => migrateDocument({ ...createDocument('Mirror'),
      instances: [{ id: 'i', name: 'Frame', definition: 'd', position: [0, 0, 0], rotation: 0, ...(mirrored ? { mirrored: true } : {}) }],
      definitions: [d] });
    const plain = mk(false);
    expect(typeof stretcherPlan(plain, ['i/a', 'i/b'], { height: 10, ...O })).not.toBe('string');
    const doc = mk(true);
    expect(stretcherPlan(doc, ['i/a', 'i/b'], { height: 10, ...O })).toBe(stretcherMirrored(displayNames(doc).get('i/a')!));
  });

  it('a different socket already on the axis (a 1/2" bore where the 5/8" goes): the different-socket sentence', () => {
    const doc = postsDocument();
    const legIds = ids(doc, 'Post A', 'Post B');
    const half = apply(doc, planOf(doc, legIds, { height: 10, size: 1, diameter: 0.5 }));
    // Without the rung: the posts keep only the 1/2" bores.
    const bored = { ...half, boards: half.boards.filter((b) => !b.name.startsWith('Stretcher')) };
    expect(stretcherPlan(bored, legIds, { height: 10, ...O })).toBe(stretcherDifferentSocket('Post A'));
  });
});

/** Two unleaned upright 1.5" posts, axes 12" apart along X (Review Focus 4). */
function postsDocument(widthB = 1.5, alongZ = false): SloydDocument {
  const at = (c: number, w: number): V3 => (alongZ ? [-w / 2, 0, c - w / 2] : [c - w / 2, 0, -w / 2]);
  return migrateDocument({ ...createDocument('Posts'), boards: [
    createBoard({ name: 'Post A', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: at(-6, 1.5) }),
    createBoard({ name: 'Post B', posture: 'upright', length: 30, width: widthB, thickness: widthB, position: at(6, widthB) }),
  ] });
}

/** A post, upright 1.5" square, its axis at x = `c` (z = 0). `lean` a TURNED compound lean (a non-zero twist) when set. */
const postAt = (id: string, name: string, c: number, o: { length?: number; material?: string; turned?: boolean } = {}) => {
  const x = slopeOf(12);
  const z = slopeOf(8);
  return createBoard({ id, name, posture: 'upright', length: o.length ?? 30, width: 1.5, thickness: 1.5, position: [c - 0.75, 0, -0.75],
    ...(o.material ? { material: o.material } : {}),
    ...(o.turned ? { lean: { x: c < 0 ? -x : x, z, face: chooseFace(createBoard({ posture: 'upright' }), x, z) } } : {}) });
};

describe('stretchers: fix round 1 (review minors 1-5)', () => {
  it('a turned leg is refused FIRST: before the container and the mirrored-copy refusals', () => {
    // In two containers: the turned sentence, not the container one.
    const d: Definition = { id: 'd', boards: [postAt('b', 'Post B', 0)], instances: [], hardware: [] };
    const two = migrateDocument({ ...createDocument('Two'), boards: [postAt('a', 'Post A', -6, { turned: true })],
      instances: [{ id: 'i', name: 'Frame', definition: 'd', position: [6, 0, 0], rotation: 0 }], definitions: [d] });
    expect(stretcherPlan(two, ['a', 'i/b'], { height: 10, ...O })).toBe(stretcherTurnedLeg('Post A'));
    // Inside a mirrored copy: the turned sentence, not the mirrored one.
    const dm: Definition = { id: 'd', boards: [postAt('a', 'Post A', -6, { turned: true }), postAt('b', 'Post B', 6, { turned: true })],
      instances: [], hardware: [] };
    const mirrored = migrateDocument({ ...createDocument('Mirror'), definitions: [dm],
      instances: [{ id: 'i', name: 'Frame', definition: 'd', position: [0, 0, 0], rotation: 0, mirrored: true }] });
    expect(world(mirrored).every((b) => b.lean !== undefined)).toBe(true);
    expect(stretcherPlan(mirrored, ['i/a', 'i/b'], { height: 10, ...O })).toBe(stretcherTurnedLeg(displayNames(mirrored).get('i/a')!));
  });

  it('a mirrored OUTER instance over a plain inner one: the mirrored-copy sentence', () => {
    const inner: Definition = { id: 'd', boards: [postAt('a', 'Post A', -6), postAt('b', 'Post B', 6)], instances: [], hardware: [] };
    const outer: Definition = { id: 'do', boards: [], hardware: [],
      instances: [{ id: 'i', name: 'Frame', definition: 'd', position: [0, 0, 0], rotation: 0 }] };
    const mk = (mirrored: boolean) => migrateDocument({ ...createDocument('Nested'), definitions: [inner, outer],
      instances: [{ id: 'o', name: 'Outer', definition: 'do', position: [0, 0, 0], rotation: 0, ...(mirrored ? { mirrored: true } : {}) }] });
    expect(typeof stretcherPlan(mk(false), ['o/i/a', 'o/i/b'], { height: 10, ...O })).not.toBe('string');
    const doc = mk(true);
    expect(stretcherPlan(doc, ['o/i/a', 'o/i/b'], { height: 10, ...O })).toBe(stretcherMirrored(displayNames(doc).get('o/i/a')!));
  });

  it('the rung\'s name is unique among the legs\' CONTAINER\'s siblings only (inv 8)', () => {
    const taken = migrateDocument({ ...createDocument('Root'), boards: [postAt('a', 'Post A', -6), postAt('b', 'Post B', 6),
      createBoard({ id: 's', name: 'Stretcher', position: [0, 0, 20] })] });
    expect(planOf(taken, ['a', 'b'], { height: 10, ...O }).rung.name).toBe('Stretcher (1)');
    // A part named Stretcher at the root does not count for legs inside an assembly.
    const d: Definition = { id: 'd', boards: [postAt('a', 'Post A', -6), postAt('b', 'Post B', 6)], instances: [], hardware: [] };
    const nested = migrateDocument({ ...createDocument('Nested'), boards: [createBoard({ id: 's', name: 'Stretcher', position: [0, 0, 20] })],
      instances: [{ id: 'i', name: 'Frame', definition: 'd', position: [0, 0, 0], rotation: 0 }], definitions: [d] });
    const p = planOf(nested, ['i/a', 'i/b'], { height: 10, ...O });
    expect(p.rung.name).toBe('Stretcher');
    expect(p.container).toBe('i');
  });

  it('the default height reads the LOWER leg\'s top, either order', () => {
    const doc = migrateDocument({ ...createDocument('Heights'), boards: [postAt('a', 'Tall', -6), postAt('b', 'Short', 6, { length: 12 })] });
    expect(defaultHeight(doc, ['a', 'b'], 5 / 8)).toBe(4);
    expect(defaultHeight(doc, ['b', 'a'], 5 / 8)).toBe(4);
  });

  it('the rung\'s material: the legs\' when they share one, else the default', () => {
    const same = migrateDocument({ ...createDocument('Oak'), boards: [postAt('a', 'Post A', -6, { material: 'oak' }),
      postAt('b', 'Post B', 6, { material: 'oak' })] });
    expect(planOf(same, ['a', 'b'], { height: 10, ...O }).rung.material).toBe('oak');
    const mixed = migrateDocument({ ...createDocument('Mixed'), boards: [postAt('a', 'Post A', -6, { material: 'oak' }),
      postAt('b', 'Post B', 6, { material: 'walnut' })] });
    expect(DEFAULT_MATERIAL).not.toBe('oak');
    expect(planOf(mixed, ['a', 'b'], { height: 10, ...O }).rung.material).toBe(DEFAULT_MATERIAL);
  });
});

describe('stretchers: unleaned posts and a metric project (Review Focus 3, 4)', () => {
  it('two unleaned posts 12" apart: L = 12, tenons 3/4, square sockets (no tilt keys), gap 0, joined and clean', () => {
    const doc = postsDocument();
    const p = planOf(doc, ids(doc, 'Post A', 'Post B'), { height: 10, ...O });
    expect(p.rung.length).toBe(12);
    expect(tenonsOf(p.rung).map((t) => t.length)).toEqual([0.75, 0.75]);
    expect(p.gap).toBe(0);
    for (const e of p.legs) {
      const row = e.holes.at(-1)!;
      expect(Object.keys(row)).not.toContain('tiltAlong');
      expect(Object.keys(row)).not.toContain('tiltAcross');
      expect(row.depth).toBe(0.75);
    }
    const next = apply(doc, p);
    expect(rungJoints(next)).toHaveLength(2);
    expect(kindsOf(next)).toEqual([]);
  });

  it('two legs sharing ONE Shape: one entry, the second socket judged with the first already in it (meets-hole)', () => {
    const doc0 = postsDocument();
    const doc = linkByRole(doc0, new Map(doc0.boards.map((b) => [b.id, 'post'])));
    expect(world(doc).every((b) => b.shape !== undefined && b.shape === world(doc)[0]!.shape)).toBe(true);
    // Each post's 3/4" socket reaches its axis, so in the shared holes the two sockets meet at the middle.
    expect(stretcherPlan(doc, ids(doc, 'Post A', 'Post B'), { height: 10, ...O }))
      .toBe(stretcherSocketFaulted('Post B', 'meet another hole'));
    // Shallower sockets (the axes 12.061 apart: L = 12, each tip 0.0305 short of its axis) clear: ONE entry, both rows.
    const far = mapWorld(doc, (w) => w.map((b) => (b.name === 'Post B' ? { ...b, position: [b.position[0] + 0.061, 0, b.position[2]] as V3 } : b)));
    const p = planOf(far, ids(far, 'Post A', 'Post B'), { height: 10, ...O });
    expect(p.legs.map((e) => e.id)).toEqual([part(far, 'Post A').id]);
    expect(p.legs[0]!.holes).toHaveLength(2);
    expect(p.notes).toEqual([]);
    const next = apply(far, p);
    expect(part(next, 'Post B').holes).toHaveLength(2);
    expect(rungJoints(next)).toHaveLength(2);
    expect(kindsOf(next)).toEqual([]);
  });

  it('along Z (turn 90), a 1.5" and a 2" post: each tenon joins its own post, 3/4 and 1 long', () => {
    const doc = postsDocument(2, true);
    const p = planOf(doc, ids(doc, 'Post A', 'Post B'), { height: 10, ...O });
    expect(p.rung.rotation).toBe(90);
    expect(p.rung.length).toBe(12);
    const next = apply(doc, p);
    const flat = flatDocument(next);
    const joints = rungJoints(next);
    expect(joints).toHaveLength(2);
    const lengthIn = (name: string) => {
      const j = joints.find((x) => flat.boards[x.b]!.name === name)!;
      return tenonsOf(flat.boards[j.a]!).find((t) => t.id === j.tenon)!.length;
    };
    expect(lengthIn('Post A')).toBe(0.75);
    expect(lengthIn('Post B')).toBe(1);
    expect(kindsOf(next)).toEqual([]);
  });

  it('the square-set stool in mm: the length on the 1 mm grid, each tip under 0.5 mm short of its axis, joined and clean', () => {
    const doc = { ...squareStoolDocument(), units: MM };
    const legIds = ids(doc, 'Front right', 'Front left');
    const h = 150 / 25.4;
    const p = planOf(doc, legIds, { height: h, size: 25 / 25.4, diameter: 16 / 25.4 });
    const D = Math.abs(axisPoint(part(doc, 'Front right'), h)[0] - axisPoint(part(doc, 'Front left'), h)[0]);
    expect(onGrid(p.rung.length * 25.4, 1)).toBe(true);
    expect(p.rung.length).toBeLessThanOrEqual(D + 1e-9);
    expect((D - p.rung.length) / 2).toBeLessThan(0.5 / 25.4);
    const S = p.rung.length - tenonsOf(p.rung)[0]!.length - tenonsOf(p.rung)[1]!.length;
    expect(onGrid(S * 25.4, 1)).toBe(true);
    for (const e of p.legs) expect(onGrid((e.holes.at(-1)!.depth as number) * 25.4, 0.1)).toBe(true);
    // The default height in mm: one third of the 16" top on the 1 mm grid (135 mm), stepping 40 mm over a rung there.
    expect(defaultHeight(doc, legIds, 16 / 25.4)).toBe(135 / 25.4);
    const front = apply(doc, planOf(doc, legIds, { height: 135 / 25.4, size: 25 / 25.4, diameter: 16 / 25.4 }));
    const side = ids(front, 'Front right', 'Back right');
    expect(defaultHeight(front, side, 16 / 25.4)).toBe(175 / 25.4);
    const next = apply(doc, p);
    expect(rungJoints(next)).toHaveLength(2);
    expect(kindsOf(next)).toEqual([]);
  });
});


/** The square-set stool with its front rung (Front right → Front left) and back rung (Back left → Back right) at `h`, each
 *  applied from its plan (the back one reuses the front's rows through the links). */
function twoRungs(units?: Units, h = 6): SloydDocument {
  const doc0 = units ? { ...squareStoolDocument(), units } : squareStoolDocument();
  const o = units ? { size: 25 / 25.4, diameter: 16 / 25.4 } : O;
  const one = apply(doc0, planOf(doc0, ids(doc0, 'Front right', 'Front left'), { height: h, ...o }));
  return apply(one, planOf(one, ids(one, 'Back left', 'Back right'), { height: h, ...o }));
}

/** A lean edit then Level the ends, as the store does them (`setLean`, `levelEnds`): the world slope of `name` set (the
 *  Shape carries it to its mate), then every user levelled from its own plan — the shared length, cuts and holes written
 *  once through `name`, each user's own position from its own plan. */
function releaned(doc: SloydDocument, name: string, slope: { x?: number; z?: number }): SloydDocument {
  const leg = part(doc, name);
  const one = mapWorld(doc, (w) => w.map((b) => (b.id === leg.id ? { ...b, lean: { ...b.lean!, ...slope } } : b)));
  const users = world(one).filter((b) => b.shape === leg.shape);
  const plans = new Map(users.map((u) => {
    const q = levelPlan(u, one.units);
    if (typeof q === 'string') throw new Error(q);
    return [u.id, q] as const;
  }));
  return mapWorld(one, (w) => w.map((x) => {
    const q = plans.get(x.id);
    if (!q) return x;
    return x.id === leg.id ? { ...x, length: q.length, position: q.position, angleCuts: q.angleCuts, holes: q.holes } : { ...x, position: q.position };
  }));
}

function refitOf(doc: SloydDocument, rungId: string): RefitPlan {
  const p = refitPlan(doc, rungId);
  if (typeof p === 'string') throw new Error(p);
  return p;
}

/** The re-fit applied by hand (Task 4's store does this): every rung's patch and every leg's holes in ONE `mapWorld`. */
function applyRefit(doc: SloydDocument, p: RefitPlan): SloydDocument {
  return mapWorld(doc, (w) => w.map((b) => {
    const r = p.rungs.find((e) => e.id === b.id);
    const l = p.legs.find((e) => e.id === b.id);
    return r || l ? { ...b, ...(r ? r.patch : {}), ...(l ? { holes: l.holes } : {}) } : b;
  }));
}

/** `doc`'s parts as one definition placed twice: `i1` at the origin, `i2` 30" along X. */
function twicePlaced(doc: SloydDocument): SloydDocument {
  const d: Definition = { id: 'd', boards: doc.boards, instances: [], hardware: [] };
  return migrateDocument({ ...doc, boards: [], definitions: [d], instances: [
    { id: 'i1', name: 'Stool', definition: 'd', position: [0, 0, 0], rotation: 0 },
    { id: 'i2', name: 'Stool', definition: 'd', position: [30, 0, 0], rotation: 0 },
  ] });
}

/** A unleaned upright 1.5" post, axis at (x, z = 0), 30 long. */
const plainPost = (name: string, x: number) =>
  createBoard({ name, posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [x - 0.75, 0, -0.75] });

/** Deep equality with every number within `tol`. */
function expectClose(a: unknown, b: unknown, tol = 1e-9, path = '$'): void {
  if (typeof a === 'number' && typeof b === 'number') {
    expect(Math.abs(a - b), path).toBeLessThanOrEqual(tol);
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) expectClose((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], tol, `${path}.${k}`);
  } else {
    expect(a, path).toEqual(b);
  }
}

const rungsOf = (doc: SloydDocument) => world(doc).filter((b) => b.name.startsWith('Stretcher'));
const nameIn = (b: Board | null) => (b ? b.name : null);

describe('stretchers: the finder (spec §6.2)', () => {
  it('on the fitted stool: each rung finds its two legs, seated, at its height; the gap is the plan\'s (ruling P1)', () => {
    const doc0 = squareStoolDocument();
    const p = planOf(doc0, ids(doc0, 'Front right', 'Front left'), { height: 6, ...O });
    const one = apply(doc0, p);
    const front = rungsOf(one)[0]!;
    const s = stretcherOf(world(one), front);
    expect(s && s.legs.map((b) => b.name)).toEqual(['Front left', 'Front right']);
    expect(s!.seated).toBe(true);
    expect(s!.height).toBe(6);
    expect(Math.abs(s!.gap - p.gap)).toBeLessThanOrEqual(1e-9);
    const doc = twoRungs();
    const [f, b] = rungsOf(doc);
    // Legs in tenon order, the min end's first: the back rung runs +X from Back left.
    expect(stretcherOf(world(doc), b!)!.legs.map((x) => x.name)).toEqual(['Back left', 'Back right']);
    expect(stretcherOf(world(doc), f!)!.seated).toBe(true);
    expect(stretcherOf(world(doc), b!)!.seated).toBe(true);
  });

  it('rungLegAt: each tenon\'s leg; a part other than an upright one, or the rung itself, is never found', () => {
    const doc = twoRungs();
    const front = rungsOf(doc)[0]!;
    const w = world(doc);
    const [min, max] = (['min', 'max'] as const).map((e) => tenonsOf(front).find((t) => t.end === e)!);
    expect(nameIn(rungLegAt(w, front, min!))).toBe('Front left');
    expect(nameIn(rungLegAt(w, front, max!))).toBe('Front right');
    // A flat block round the max tenon, FIRST in world order: not upright, so passed over for Front right.
    const [s, t] = [tenonsOf(front).find((x) => x.end === 'max')!.length, front.position];
    const block = createBoard({ name: 'Block', posture: 'flat', length: 2, width: 2, thickness: 2,
      position: [t[0] + front.length - s - 1, t[1] - 0.5, t[2] - 0.5] });
    expect(rungLegAt([block, ...w], front, max!)!.name).toBe('Front right');
    expect(rungLegAt([{ ...block, posture: 'upright' }, ...w], front, max!)!.name).toBe('Block');
    // The rung itself is never its own leg (stood upright).
    expect(rungLegAt([{ ...front, posture: 'upright' }], front, max!)).toBeNull();
  });

  it('rungLegAt: a part the tenon enters by TOUCH or less is passed over (to TOUCH, the checks\' tolerance)', () => {
    // Post A round the min tenon's tip; Post C first in world order, overlapping the tenon's segment by 1/64 only.
    const post = (name: string, x: number) => createBoard({ name, posture: 'upright', length: 20, width: 1.5, thickness: 1.5, position: [x, 0, -0.75] });
    const rung = withTenons(createBoard({ name: 'Rung', posture: 'flat', length: 12, width: 1, thickness: 1, position: [0, 5.5, -0.5] }),
      [{ id: 't1', end: 'min', diameter: 5 / 8, length: 0.5 }, { id: 't2', end: 'max', diameter: 5 / 8, length: 0.5 }]);
    const t = tenonsOf(rung).find((x) => x.end === 'min')!;
    expect(rungLegAt([post('Post C', 0.5 - 1 / 64), post('Post A', -0.75), rung], rung, t)!.name).toBe('Post A');
    expect(rungLegAt([post('Post C', 0.5 - 1 / 16), post('Post A', -0.75), rung], rung, t)!.name).toBe('Post C');
  });

  it('a rung moved 3" off its legs (along Z): its tenons miss every leg, so it is no stretcher', () => {
    const doc0 = twoRungs();
    const front = rungsOf(doc0)[0]!;
    const doc = mapWorld(doc0, (w) => w.map((b) => (b.id === front.id ? { ...b, position: [b.position[0], b.position[1], b.position[2] + 3] as V3 } : b)));
    const moved = rungsOf(doc)[0]!;
    for (const t of tenonsOf(moved)) expect(rungLegAt(world(doc), moved, t)).toBeNull();
    expect(stretcherOf(world(doc), moved)).toBeNull();
  });

  it('a rung whose two tenons find the SAME leg is no stretcher', () => {
    const doc = twoRungs();
    const front = rungsOf(doc)[0]!;
    // A 1" stub at the min end, both tenons 0.4: each tenon's centre segment is inside Front left.
    const [a, b] = tenonsOf(front);
    const stub = withTenons({ ...front, length: 1 }, [{ ...a!, length: 0.4 }, { ...b!, length: 0.4 }]);
    for (const t of tenonsOf(stub)) expect(rungLegAt(world(doc), stub, t)!.name).toBe('Front left');
    expect(stretcherOf(world(doc), stub)).toBeNull();
  });
});

describe('stretchers: Fit the stretcher again (spec §6.3, §6.4)', () => {
  it('on a fitted rung changes nothing: the plan applied is the document (toEqual), from either rung', () => {
    const doc = twoRungs();
    for (const r of rungsOf(doc)) {
      const p = refitOf(doc, r.id);
      expect(p.rungs.map((e) => e.id).sort()).toEqual(rungsOf(doc).map((b) => b.id).sort());
      expect(applyRefit(doc, p)).toEqual(doc);
    }
  });

  it('on a fitted METRIC rung changes nothing either (heights k / 25.4)', () => {
    // At 118 mm the height read back off the rung (its min corner plus half its section) is an ulp off the typed one, so
    // a recomputed tenon length is an ulp off the stored one: within 1e-9, the stored value stands.
    for (const h of [135, 118]) {
      const doc = twoRungs(MM, h / 25.4);
      for (const r of rungsOf(doc)) expect(applyRefit(doc, refitOf(doc, r.id))).toEqual(doc);
    }
  });

  it('a moved row keeps its index among its leg\'s rows', () => {
    // A 1/4" bore 3" up Front right's length after the socket (shared with Back left), then the splay edit.
    const doc0 = twoRungs();
    const fr0 = part(doc0, 'Front right');
    const extra = { ...fr0.holes[0]!, id: 'extra', diameter: 0.25, station: fr0.holes[0]!.station + 3 };
    const doc1 = mapWorld(doc0, (w) => w.map((b) => (b.id === fr0.id ? { ...b, holes: [...b.holes, extra] } : b)));
    const doc = releaned(doc1, 'Front right', { x: slopeOf(14) });
    const next = applyRefit(doc, refitOf(doc, rungsOf(doc)[0]!.id));
    expect(part(next, 'Front right').holes.map((r) => r.id)).toEqual([fr0.holes[0]!.id, 'extra']);
    expect(part(next, 'Front right').holes[1]).toEqual(part(doc, 'Front right').holes[1]);
    expect(rungJoints(next)).toHaveLength(4);
  });

  it('a leg of the rung now leaning turned with a twist: the turned-leg sentence (the add plan\'s leg checks, first)', () => {
    // Front left's Shape (shared with Back right) no longer square-set.
    const doc0 = twoRungs();
    const fl = part(doc0, 'Front left');
    const doc = mapWorld(doc0, (w) => w.map((b) => (b.id === fl.id ? { ...b, lean: { x: b.lean!.x, z: b.lean!.z, face: b.lean!.face } } : b)));
    expect(part(doc, 'Back right').lean!.square).toBeUndefined();
    expect(refitPlan(doc, rungsOf(doc)[0]!.id)).toBe(stretcherTurnedLeg('Front left'));
  });

  it('after Front right\'s splay 12 → 14 and Level the ends: both rungs stale; Fit again re-fits BOTH, ids kept, 4 joints, clean', () => {
    const before = twoRungs();
    const doc = releaned(before, 'Front right', { x: slopeOf(14) });
    expect(rungJoints(doc)).toHaveLength(2);
    const [front, back] = rungsOf(doc) as [Board, Board];
    for (const r of [front, back]) {
      const s = stretcherOf(world(doc), r);
      expect(s).not.toBeNull();
      expect(s!.seated).toBe(false);
      expect(s!.height).toBe(6);
    }
    const p = refitOf(doc, front.id);
    // The closure: the front rung, then the back rung (seated in, now stale at, the rows the re-fit moves).
    expect(p.rungs.map((e) => e.id)).toEqual([front.id, back.id]);
    const next = applyRefit(doc, p);
    // Ids kept: the rungs', the tenons' (by end), and every socket row's, in place.
    expect(rungsOf(next).map((b) => b.id)).toEqual([front.id, back.id]);
    for (const r of rungsOf(next)) {
      const old = rungsOf(doc).find((b) => b.id === r.id)!;
      expect(tenonsOf(r).map((t) => `${t.id}:${t.end}`)).toEqual(tenonsOf(old).map((t) => `${t.id}:${t.end}`));
      expect(r.length).toBeGreaterThan(old.length);
    }
    for (const n of ['Front right', 'Front left', 'Back left', 'Back right']) {
      expect(part(next, n).holes.map((r) => r.id)).toEqual(part(doc, n).holes.map((r) => r.id));
    }
    expect(part(next, 'Front right').holes[0]).not.toEqual(part(doc, 'Front right').holes[0]);
    expect(rungJoints(next)).toHaveLength(4);
    expect(kindsOf(next)).toEqual([]);
    for (const r of rungsOf(next)) expect(stretcherOf(world(next), r)!.seated).toBe(true);
    // From the back rung: the same closure (back first), the same document to 1e-9 (the first writer's row is the one
    // stored, so the two orders differ by ulps).
    const q = refitOf(doc, back.id);
    expect(q.rungs.map((e) => e.id)).toEqual([back.id, front.id]);
    expectClose(applyRefit(doc, q), next);
    // And once fitted, again changes nothing.
    expect(applyRefit(next, refitOf(next, front.id))).toEqual(next);
  });

  it('after Front right\'s RAKE 8 → 10: both rungs found (stale), but the legs are no longer square: the not-square sentence', () => {
    const doc = releaned(twoRungs(), 'Front right', { z: slopeOf(10) });
    for (const r of rungsOf(doc)) expect(stretcherOf(world(doc), r)!.seated).toBe(false);
    expect(refitPlan(doc, rungsOf(doc)[0]!.id)).toBe(STRETCHER_NOT_SQUARE);
  });

  it('a socket removed by hand: Fit again bores ONE new row, shared by both rungs through the link (4 joints, clean)', () => {
    const doc0 = twoRungs();
    const fr = part(doc0, 'Front right');
    const doc = mapWorld(doc0, (w) => w.map((b) => (b.id === fr.id ? { ...b, holes: [] } : b)));
    expect(part(doc, 'Back left').holes).toEqual([]);
    const p = refitOf(doc, rungsOf(doc)[0]!.id);
    expect(p.rungs).toHaveLength(2);
    const next = applyRefit(doc, p);
    expect(part(next, 'Front right').holes).toHaveLength(1);
    expect(part(next, 'Back left').holes).toEqual(part(next, 'Front right').holes);
    expect(rungJoints(next)).toHaveLength(4);
    expect(kindsOf(next)).toEqual([]);
  });

  it('a hand-made duplicate socket in a stale leg: the ambiguous-socket sentence, naming it', () => {
    const doc0 = releaned(twoRungs(), 'Front right', { x: slopeOf(14) });
    const fr = part(doc0, 'Front right');
    const doc = mapWorld(doc0, (w) => w.map((b) => (b.id === fr.id ? { ...b, holes: [...b.holes, { ...b.holes[0]!, id: 'dup' }] } : b)));
    expect(refitPlan(doc, rungsOf(doc)[0]!.id)).toBe(stretcherAmbiguous('Front right'));
    // Control: without the duplicate it plans.
    expect(typeof refitPlan(doc0, rungsOf(doc0)[0]!.id)).toBe('object');
  });

  it('the back rung moved up 1/4 (another height, found stale at the shared rows): the closure sentence, nothing planned', () => {
    const doc0 = twoRungs();
    const [front, back] = rungsOf(doc0) as [Board, Board];
    const doc = mapWorld(doc0, (w) => w.map((b) => (b.id === back.id ? { ...b, position: [b.position[0], b.position[1] + 0.25, b.position[2]] as V3 } : b)));
    const s = stretcherOf(world(doc), rungsOf(doc)[1]!);
    expect(s!.seated).toBe(false);
    expect(s!.height).toBe(6.25);
    expect(refitPlan(doc, front.id)).toBe(stretcherClosureDisagrees([front.name, back.name]));
    expect(refitPlan(doc, back.id)).toBe(stretcherClosureDisagrees([back.name, front.name]));
  });

  it('on the final rows: a different bore on the new axis, then a hole the moved socket meets, each refuses naming the leg', () => {
    const doc0 = releaned(twoRungs(), 'Front right', { x: slopeOf(14) });
    const front = rungsOf(doc0)[0]!;
    const fr = part(doc0, 'Front right');
    // Where the re-fit puts Front right's socket (the row with the stored id, in Front right's own frame).
    const target = refitOf(doc0, front.id).legs.find((e) => e.id === fr.id)!.holes.find((r) => r.id === fr.holes[0]!.id)!;
    const withRow = (row: HoleRow) => mapWorld(doc0, (w) => w.map((b) => (b.id === fr.id ? { ...b, holes: [...b.holes, row] } : b)));
    // A 1/2" bore along the new axis: the tenon would enter it but not be seated in it.
    expect(refitPlan(withRow({ ...target, id: 'half', diameter: 0.5 }), front.id)).toBe(stretcherDifferentSocket('Front right'));
    // A 1/4" bore 0.3 along the leg from it: the moved socket would meet it.
    expect(refitPlan(withRow({ ...target, id: 'near', diameter: 0.25, station: target.station + 0.3 }), front.id))
      .toBe(stretcherSocketFaulted('Front right', 'meet another hole'));
  });

  it('a rung whose tenon is now wider than its section: the too-wide sentence', () => {
    const doc0 = twoRungs();
    const front = rungsOf(doc0)[0]!;
    // The front rung made 1/2" square about its own axis: its 5/8" tenons fault (so seat nothing), found stale at the rows.
    const doc = mapWorld(doc0, (w) => w.map((b) => (b.id === front.id
      ? { ...b, width: 0.5, thickness: 0.5, position: [b.position[0], b.position[1] + 0.25, b.position[2] + 0.25] as V3 } : b)));
    expect(stretcherOf(world(doc), rungsOf(doc)[0]!)!.seated).toBe(false);
    expect(refitPlan(doc, front.id)).toBe('A round tenon must be narrower than the part\'s section.');
  });

  it('a rung whose legs now line up along the OTHER world axis: the turned-rung sentence', () => {
    // Post A at the origin, first in world order; a wide board B centred on A's X but 6 back in Z, holding the rung's far end.
    const doc = migrateDocument({ ...createDocument('Turned'), boards: [
      createBoard({ name: 'Post A', posture: 'upright', length: 20, width: 1.5, thickness: 1.5, position: [-0.75, 0, -0.75] }),
      createBoard({ name: 'Board B', posture: 'upright', length: 20, width: 26, thickness: 13, position: [-13, 0, -0.5] }),
      withTenons(createBoard({ name: 'Rung', posture: 'flat', length: 12, width: 1, thickness: 1, position: [0, 5.5, -0.5] }), [
        { id: 't1', end: 'min', diameter: 5 / 8, length: 0.5 }, { id: 't2', end: 'max', diameter: 5 / 8, length: 0.5 }]),
    ] });
    const rung = part(doc, 'Rung');
    expect(stretcherOf(world(doc), rung)!.legs.map((b) => b.name)).toEqual(['Post A', 'Board B']);
    expect(refitPlan(doc, rung.id)).toBe(stretcherTurned('Rung'));
  });

  it('a rung whose far leg\'s axis is now BEHIND its near leg\'s (the rung would run back on itself): the turned-rung sentence', () => {
    // Post A first in world order, round the min tenon; a long board B whose axis is 1" on A's far side (x = -1, on A's z)
    // reaching out to x = 12 round the max tenon. The axis runs along X, as the rung does, but from B toward A.
    const doc = migrateDocument({ ...createDocument('Reversed'), boards: [
      createBoard({ name: 'Post A', posture: 'upright', length: 20, width: 1.5, thickness: 1.5, position: [-0.75, 0, -0.75] }),
      createBoard({ name: 'Board B', posture: 'upright', length: 20, width: 26, thickness: 1.5, position: [-14, 0, -0.75] }),
      withTenons(createBoard({ name: 'Rung', posture: 'flat', length: 12, width: 1, thickness: 1, position: [0, 5.5, -0.5] }), [
        { id: 't1', end: 'min', diameter: 5 / 8, length: 0.5 }, { id: 't2', end: 'max', diameter: 5 / 8, length: 0.5 }]),
    ] });
    const rung = part(doc, 'Rung');
    expect(stretcherOf(world(doc), rung)!.legs.map((b) => b.name)).toEqual(['Post A', 'Board B']);
    expect(refitPlan(doc, rung.id)).toBe(stretcherTurned('Rung'));
  });

  it('a rung in the closure that refuses refuses the whole action (the back rung made 3" wide: out of reach)', () => {
    // The back rung widened to 3" about its own axis: still seated in the shared rows (so in the closure), but its section
    // no longer lies on Back left's face (T1a). The front rung alone would plan.
    const doc0 = twoRungs();
    const [front, back] = rungsOf(doc0) as [Board, Board];
    const doc = mapWorld(doc0, (w) => w.map((b) => (b.id === back.id
      ? { ...b, width: 3, position: [b.position[0], b.position[1], b.position[2] - 1] as V3 } : b)));
    expect(stretcherOf(world(doc), rungsOf(doc)[1]!)!.seated).toBe(true);
    expect(refitPlan(doc, front.id)).toBe(stretcherOutOfReach('Back left'));
  });
});

describe('stretchers: Fit again, fix round 1 (review I1, I2, M-3, M-4, M-5)', () => {
  it('I1: a stool in a definition placed twice: one rung entry per STORED rung, applied in one mapWorld, both copies fitted', () => {
    const doc = twicePlaced(releaned(twoRungs(), 'Front right', { x: slopeOf(14) }));
    const rungs = rungsOf(doc);
    expect(rungs.map((b) => b.id.split('/')[0])).toEqual(['i1', 'i1', 'i2', 'i2']);
    expect(rungJoints(doc)).toHaveLength(4);
    const p = refitOf(doc, rungs[0]!.id);
    expect(p.rungs.map((e) => e.id)).toEqual([rungs[0]!.id, rungs[1]!.id]);
    expect(p.legs).toHaveLength(2);
    const next = applyRefit(doc, p);
    expect(rungJoints(next)).toHaveLength(8);
    expect(kindsOf(next)).toEqual([]);
    for (const r of rungsOf(next)) expect(stretcherOf(world(next), r)!.seated).toBe(true);
    // From the second copy's rung: the same, through its placement.
    expectClose(applyRefit(doc, refitOf(doc, rungs[2]!.id)), next);
  });

  it('I1: Add between the legs of a twice-placed definition: one leg entry per storage target, both copies joined', () => {
    const doc = twicePlaced(squareStoolDocument());
    const legIds = ids(doc, 'Front right', 'Front left');
    expect(legIds.every((id) => id.startsWith('i1/'))).toBe(true);
    const p = planOf(doc, legIds, { height: 6, ...O });
    expect(p.container).toBe('i1');
    expect(p.legs.map((e) => e.id)).toEqual(legIds);
    // The rung into the definition (i1 sits at the origin unturned, so its frame is the world's); the legs in one mapWorld.
    const withRung = { ...doc, definitions: doc.definitions.map((d) => ({ ...d, boards: [...d.boards, p.rung] })) };
    const next = mapWorld(withRung, (w) => w.map((b) => {
      const e = p.legs.find((x) => x.id === b.id);
      return e ? { ...b, holes: e.holes } : b;
    }));
    expect(rungJoints(next)).toHaveLength(4);
    expect(kindsOf(next)).toEqual([]);
  });

  /** Posts A (x = -6) and B (x = 6), a rung at 10, then moved up 1.5 (stale); `extra` added to Post A. */
  function staleWith(extra: (a: Board, tip: V3) => Omit<HoleRow, 'id'>) {
    const doc0 = migrateDocument({ ...createDocument('Posts'), boards: [plainPost('Post A', -6), plainPost('Post B', 6)] });
    const one = apply(doc0, planOf(doc0, ids(doc0, 'Post A', 'Post B'), { height: 10, ...O }));
    const rung = rungsOf(one)[0]!;
    const up = mapWorld(one, (w) => w.map((b) => (b.id === rung.id ? { ...b, position: [b.position[0], b.position[1] + 1.5, b.position[2]] as V3 } : b)));
    const a = part(up, 'Post A');
    const row: HoleRow = { ...extra(a, [-6, 11.5, 0]), id: 'extra' };
    return mapWorld(up, (w) => w.map((b) => (b.id === a.id ? { ...b, holes: [...b.holes, row] } : b)));
  }

  function refitsOwnSocket(doc: SloydDocument) {
    const a = part(doc, 'Post A');
    const socket = a.holes[0]!;
    const next = applyRefit(doc, refitOf(doc, rungsOf(doc)[0]!.id));
    const after = part(next, 'Post A');
    expect(after.holes.map((r) => r.id)).toEqual([socket.id, 'extra']);
    expect(after.holes[0]!.station).not.toBe(socket.station);
    expect(after.holes[1]).toEqual(a.holes[1]);
    expect(rungJoints(next)).toHaveLength(2);
    expect(kindsOf(next)).toEqual([]);
  }

  it('I2: a stale tenon never takes a NEARER bore of another diameter (a 1/4" pin hole) as its socket', () => {
    // A 1/4" blind bore across the post, 0.4 past the stale tip (its bottom 0.4 from the tip; the socket's is 1.5 below).
    const doc = staleWith((a, tip) => boreRow(a, 'thickness', 'min', [tip[0] - 0.4, tip[1], -0.75], [0, 0, 1], 0.25, 0.75));
    refitsOwnSocket(doc);
  });

  it('I2: a stale tenon never takes a nearer THROUGH bore of its diameter as its socket', () => {
    const doc = staleWith((a, tip) => boreRow(a, 'thickness', 'min', [tip[0] - 0.4, tip[1], -0.75], [0, 0, 1], 5 / 8, 'through'));
    refitsOwnSocket(doc);
  });

  it('M-3: a stale tenon never takes a row another part\'s tenon is seated in (a one-tenon rail), however near', () => {
    // Post C at x = -18; a rail from C into Post A at 12.2, its C-end tenon removed (one tenon: no stretcher, never re-fitted).
    const doc0 = migrateDocument({ ...createDocument('Posts'), boards: [plainPost('Post A', -6), plainPost('Post B', 6), plainPost('Post C', -18)] });
    const one = apply(doc0, planOf(doc0, ids(doc0, 'Post A', 'Post B'), { height: 10, ...O }));
    const two = apply(one, planOf(one, ids(one, 'Post C', 'Post A'), { height: 12.2, ...O }));
    const [rung, rail] = rungsOf(two) as [Board, Board];
    const railTenonInA = tenonsOf(rail).find((t) => rungLegAt(world(two), rail, t)!.name === 'Post A')!;
    // The rung up 1.4: its tip 0.8 below the rail's socket bottom, 1.4 above its own.
    const doc = mapWorld(two, (w) => w.map((b) => (b.id === rung.id ? { ...b, position: [b.position[0], b.position[1] + 1.4, b.position[2]] as V3 }
      : b.id === rail.id ? withTenons(b, [railTenonInA]) : b)));
    const a = part(doc, 'Post A');
    expect(a.holes).toHaveLength(2);
    const next = applyRefit(doc, refitOf(doc, rungsOf(doc)[0]!.id));
    expect(part(next, 'Post A').holes[1]).toEqual(a.holes[1]);
    expect(part(next, 'Post A').holes[0]!.id).toBe(a.holes[0]!.id);
    expect(rungJoints(next)).toHaveLength(3);
  });

  it('M-4: the closure grows through a rung found LATER (world order B, C, A; A selected; B linked only through C)', () => {
    // Posts P1 / P2 share a Shape, and P3 / P4: A (P0–P1) shares its P1 row with C (P3–P2), C its P3 row with B (P4–P5).
    const posts = [plainPost('P0', 0), plainPost('P1', 12), plainPost('P3', 18), plainPost('P2', 30), plainPost('P4', 50), plainPost('P5', 62)];
    const base = migrateDocument({ ...createDocument('Chain'), boards: posts });
    const roles = new Map(world(base).map((b) => [b.id, b.name === 'P1' || b.name === 'P2' ? 'a' : b.name === 'P3' || b.name === 'P4' ? 'b' : b.name]));
    const doc0 = linkByRole(base, roles);
    expect(part(doc0, 'P1').shape).toBe(part(doc0, 'P2').shape);
    expect(part(doc0, 'P3').shape).toBe(part(doc0, 'P4').shape);
    const a = apply(doc0, planOf(doc0, ids(doc0, 'P0', 'P1'), { height: 10, ...O }));
    const c = apply(a, planOf(a, ids(a, 'P3', 'P2'), { height: 10, ...O }));
    const b = apply(c, planOf(c, ids(c, 'P4', 'P5'), { height: 10, ...O }));
    expect(rungJoints(b)).toHaveLength(6);
    const [rA, rC, rB] = rungsOf(b) as [Board, Board, Board];
    // World order B, C, A.
    const doc = { ...b, boards: [...b.boards.filter((x) => ![rA.id, rB.id, rC.id].includes(x.id)), rB, rC, rA] };
    expect(rungsOf(doc).map((x) => x.id)).toEqual([rB.id, rC.id, rA.id]);
    const p = refitOf(doc, rA.id);
    expect(p.rungs.map((e) => e.id)).toEqual([rA.id, rC.id, rB.id]);
    expect(applyRefit(doc, p)).toEqual(doc);
  });

  it('M-5: the side rungs (Front left → Back left, Front right → Back right at 7.5) re-fit together after a rake change', () => {
    const doc0 = squareStoolDocument();
    const one = apply(doc0, planOf(doc0, ids(doc0, 'Front left', 'Back left'), { height: 7.5, ...O }));
    const two = apply(one, planOf(one, ids(one, 'Front right', 'Back right'), { height: 7.5, ...O }));
    for (const n of ['Front right', 'Front left', 'Back left', 'Back right']) expect(part(two, n).holes).toHaveLength(1);
    const doc = releaned(two, 'Front right', { z: slopeOf(10) });
    const [left, right] = rungsOf(doc) as [Board, Board];
    for (const r of [left, right]) expect(stretcherOf(world(doc), r)!.seated).toBe(false);
    const p = refitOf(doc, left.id);
    expect(p.rungs.map((e) => e.id)).toEqual([left.id, right.id]);
    const next = applyRefit(doc, p);
    expect(rungJoints(next)).toHaveLength(4);
    expect(kindsOf(next)).toEqual([]);
  });
});
