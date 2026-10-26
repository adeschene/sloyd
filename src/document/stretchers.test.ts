import { describe, expect, it } from 'vitest';
import type { Board, Definition, Instance, SloydDocument } from './types';
import type { Units } from '../units/length';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import { chooseFace, slopeOf } from './lean';
import { partAxis } from './legSockets';
import { holeInstances } from './holes';
import { toWorld } from './snapPoints';
import { worldBodies } from './drawing';
import { checkDesign, type DesignLimits } from './designCheck';
import { tenonJoints } from './tenonJoints';
import { tenonsOf } from './roundTenons';
import { tenonFaultText } from './tenonText';
import { displayNames, worldParts } from './tree';
import { mapWorld } from './treeEdit';
import { squareStoolDocument, stoolDocument } from './stoolFixture';
import { linkByRole } from './roleLinks';
import { defaultHeight, rungLine, shoulderStation, stretcherPlan, type StretcherPlan } from './stretchers';
import {
  STRETCHER_CONTAINERS, STRETCHER_NOT_SQUARE, stretcherDifferentSocket, stretcherLinkNote, stretcherMirrored,
  stretcherOutOfReach, stretcherSocketFaulted, stretcherTurnedLeg,
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
  return tenonJoints(flat).filter((j) => flat.boards[j.a]!.name.startsWith('Stretcher'));
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

