import type { Board, CutFrom, HoleRow, ProfileCut, ProfileSide, SloydDocument } from './types';
import type { V3 } from './angleCuts';
import { axisDimensions, boardExtents, endFacing } from './geometry';
import { broadFace, defaultCamLock, holeInstances, mm } from './holes';
import { camPairRows, camPartners, camRole } from './camBolt';
import { holeFaults } from './holeFaults';
import { socketFaultWords } from './holeText';
import { boreAlongAxis, boreEnds, boreRow, faceCrossing, type WorldAxis } from './legSockets';
import { toWorld } from './snapPoints';
import { nextId } from './ids';
import { angleCutRemovesNothing } from './angleCuts';
import { fingerSetAt } from './boxJoints';
import { dovetailAt } from './dovetailModel';
import { featureTouchesEnd, shapedFeatures } from './featureRegions';
import { leans } from './lean';
import { profileWord } from './ruledOutText';
import { tenonAt } from './roundTenons';
import { TOUCH } from './checkTolerances';
import { displayNames, instancesOn, parentPath, worldParts } from './tree';
import { mapWorld, storageKey } from './treeEdit';
import {
  CAM_JOINT_ALREADY, CAM_JOINT_CONTAINERS, CAM_JOINT_COUNT, CAM_JOINT_END_FEATURE, CAM_JOINT_LEAN, CAM_JOINT_MIRRORED,
  CAM_JOINT_NONE, CAM_JOINT_ON_EDGE, CAM_JOINT_PARTIAL, CAM_JOINT_SAME_PART, CAM_JOINT_THIN, CAM_JOINT_TWO_LOCKS,
  camFaceWord, camJointFaulted, camJointLinkNote, type CamEndFeature,
} from './camJointText';

/**
 * The cam-and-bolt joint (fu 568 chunk 2; cam-and-bolt joint spec §3): the ONE two-part cam-and-bolt planner. Two selected
 * parts, the END of one (A, a shelf) butting a FACE of the other (B, a side); A gets chunk 1's cam lock rows at that end and
 * B one bore per fitting on its bolt's axis. Nothing new is stored. Pure; the store writes the plan. `findCamJoint` finds
 * the joint and decides the refusals that need no layout (§3.1, §3.4 checks 2–6); `camJointPlan` lays it out, reuses what
 * is there and decides the rest (§3.2–§3.5, checks 7–8).
 */

/** The most fittings one joint takes (spec §3.2). */
export const CAM_JOINT_MAX = 12;

/** One end-into-face joint: A's and B's world ids, A's joined end in A's OWN frame (its length dimension's `min`/`max`),
 *  the world axis A's length runs along, and the world direction from A into B along it. */
export interface CamJoint { a: string; b: string; end: CutFrom; k: 0 | 1 | 2; side: -1 | 1 }

interface Box { min: [number, number, number]; max: [number, number, number] }

/** A part's world box: its min corner and its extents (inv 2; a leaning part never reaches here, check 2). */
function boxOf(b: Board): Box {
  const e = boardExtents(b);
  const p = b.position;
  return { min: [p[0], p[1], p[2]], max: [p[0] + e[0], p[1] + e[1], p[2] + e[2]] };
}

/** Where a part's holes are stored (`stretchers.ts`' rule): a Shape's users share one, else its storage target. */
const holesKey = (doc: SloydDocument, b: Board) => (b.shape !== undefined ? `shape:${b.shape}` : `part:${storageKey(doc, b.id) ?? b.id}`);

/**
 * The end-into-face candidates with A = `a` (spec §3.1), joinery's rule 2 restated (`sites.ts`; `document/` cannot import
 * `generate/`): A's length runs along world axis `k`; B's dimension on `k` is not its length (rule 1: two ends meeting is
 * no joint, and a bolt into end grain does not hold); B's face OPPOSITE A's end face on `k` lies within `TOUCH` of it (B
 * on the far side); and A's end rectangle lies within B's face rectangle on the two other axes, each bound within `TOUCH`.
 */
function candidatesFrom(a: Board, b: Board): CamJoint[] {
  const k = axisDimensions(a).indexOf('length') as 0 | 1 | 2;
  if (axisDimensions(b)[k] === 'length') return [];
  const A = boxOf(a);
  const B = boxOf(b);
  const within = ([0, 1, 2] as const).filter((p) => p !== k)
    .every((p) => A.min[p] >= B.min[p] - TOUCH && A.max[p] <= B.max[p] + TOUCH);
  if (!within) return [];
  const out: CamJoint[] = [];
  for (const side of [-1, 1] as const) {
    const gap = side === -1 ? A.min[k] - B.max[k] : B.min[k] - A.max[k];
    if (Math.abs(gap) <= TOUCH) out.push({ a: a.id, b: b.id, end: endFacing(a, k, side), k, side });
  }
  return out;
}

/** The sides of the broad face in the order a run travels round them on its `max` face (`travelSign` +1 on each): the
 *  width-min side toward length max, the length-max side toward width max, and so on; a run on the `min` face goes the
 *  other way round. */
const SIDE_CYCLE: readonly ProfileSide[] = [
  { across: 'width', from: 'min' }, { across: 'length', from: 'max' }, { across: 'width', from: 'max' }, { across: 'length', from: 'min' },
];
const sideIndex = (s: ProfileSide) => SIDE_CYCLE.findIndex((x) => x.across === s.across && x.from === s.from);

/** The sides a profile runs along: every side for a loop; its one side; or, for a run with ends on two sides (stored as
 *  travelled, never re-ordered, Q16), every side from its start's to its end's in its face's travel order. */
function profileSides(p: ProfileCut): ProfileSide[] {
  if ('loop' in p.run) return [...SIDE_CYCLE];
  const step = p.face === 'max' ? 1 : SIDE_CYCLE.length - 1;
  const out: ProfileSide[] = [];
  const last = sideIndex(p.run.end.side);
  for (let i = sideIndex(p.run.start.side); ; i = (i + step) % SIDE_CYCLE.length) {
    out.push(SIDE_CYCLE[i]!);
    if (i === last || out.length === SIDE_CYCLE.length) return out;
  }
}

/**
 * The first feature that changes A's joined END itself (spec §3.4 check 6, ruling R4), in the copy's order, or null: a round
 * tenon, a dovetail or a box joint's finger set at that end; an END angle cut (into the length from that end: a miter, an
 * end bevel or chamfer) that removes stock; a curve whose waste touches that end face (`featureTouchesEnd`, joinery's P6);
 * a profile running along one of that end face's own edges. A profile or chamfer along a LONG edge that only runs out
 * through the end face does not refuse (R4: `holeFaults` judges any real clash with a bore), nor does edge banding (R5).
 */
function endFeature(b: Board, end: CutFrom): CamEndFeature | null {
  if (tenonAt(b, end)) return 'round tenon';
  if (dovetailAt(b, 'length', end)) return 'dovetails';
  if (fingerSetAt(b, 'length', end)) return 'box joints';
  if (b.angleCuts.some((c) => c.face === 'length' && c.from === end && !angleCutRemovesNothing(b, c))) return 'angle cut';
  const { view, features } = shapedFeatures(b);
  if (features.some((f) => f.word === 'curve' && featureTouchesEnd(view, f, 'length', end))) return 'curve';
  const onEnd = (s: ProfileSide) => s.across === 'length' && s.from === end;
  const p = b.profiles.find((x) => profileSides(x).some(onEnd));
  return p ? profileWord(p.kind) : null;
}

/**
 * The joint between the two selected world parts `ids`, in either order (spec §3.1), or the first refusal of §3.4 checks
 * 2–6 in the spec's order: either part leans; different containers; a part reached through a mirrored instance; the two
 * share one holes storage (users of one Shape); no end-into-face contact; A's joined end not plain square stock. More than
 * one candidate refuses as none (ruling R8): two axis-aligned boxes admit more only when a part is a sliver at most 2·TOUCH
 * across.
 */
export function findCamJoint(doc: SloydDocument, ids: [string, string]): CamJoint | string {
  const world = worldParts(doc);
  const parts = ids.map((id) => {
    const w = world.find((b) => b.id === id);
    if (!w) throw new Error(`findCamJoint: no part ${id}`);
    return w;
  }) as [Board, Board];
  const names = displayNames(doc);
  const nameOf = (b: Board) => names.get(b.id) ?? b.name;

  // 2. A leaning part's box is its pre-lean placement (inv 57 R2): no contact can be read off it.
  const leaning = parts.find(leans);
  if (leaning) return CAM_JOINT_LEAN(nameOf(leaning));
  // 3. One container, not reached through a mirrored instance (as `legRefusal` in `stretchers.ts`): any instance on the
  // chain, not the parity.
  const container = parentPath(parts[0].id);
  if (parentPath(parts[1].id) !== container) return CAM_JOINT_CONTAINERS;
  if (container !== null && (instancesOn(doc, container) ?? []).some((i) => i.mirrored === true)) {
    return CAM_JOINT_MIRRORED(nameOf(parts[0]));
  }
  // 4. One holes storage: a row bored into B would land in A too.
  if (holesKey(doc, parts[0]) === holesKey(doc, parts[1])) return CAM_JOINT_SAME_PART(nameOf(parts[0]), nameOf(parts[1]));
  // 5. The contact.
  const found = [...candidatesFrom(parts[0], parts[1]), ...candidatesFrom(parts[1], parts[0])];
  // More than one (ruling R8) needs a part at most 2·TOUCH across, a sliver: no joint to offer, never a throw (the panel
  // reads this in render).
  const joint = found.length === 1 ? found[0] : undefined;
  if (!joint) return CAM_JOINT_NONE(nameOf(parts[0]), nameOf(parts[1]));
  // 6. A's joined end is plain square stock.
  const a = joint.a === parts[0].id ? parts[0] : parts[1];
  const f = endFeature(a, joint.end);
  if (f) return CAM_JOINT_END_FEATURE(nameOf(a), f);
  return joint;
}

/** The joint plan (spec §3.5). */
export interface CamJointPlan {
  joint: CamJoint;
  /** N: the bolt holes at A's joined end. */
  fittings: number;
  /** The broad face A's cam enters: the chosen one, or the reused pair's. */
  camFrom: CutFrom;
  /** A's whole pair reused (no rows added to A, the typed count ignored); how many of B's bores were already there. */
  reused: { a: boolean; b: number };
  /**
   * One entry per STORAGE target the plan writes (`StretcherPlan.legs`' rule: a Shape, inv 45, or one stored part every
   * placement of a definition shares): `id` the WORLD occurrence id of the selected part standing for it, `holes` that
   * world part's FULL new hole list in its own frame — its rows plus the new ones (fresh ids, `nextId`), or its list
   * unchanged when nothing is added. A first, then B (check 4: never one target). The store writes `{ ...worldPart, holes }`
   * through `mapWorld`, which lowers it to the Shape or the stored part (and through a mirrored user's own flag).
   */
  writes: { id: string; holes: HoleRow[] }[];
  /** One `camJointLinkNote` per OTHER world part (not A or B) whose resolved holes gain a row, world order. */
  notes: string[];
}

const EPS = 1e-9;
const point = (v: readonly number[]) => ({ length: v[0]!, width: v[1]!, thickness: v[2]! });
const same = (p: readonly number[], q: readonly number[]) => [0, 1, 2].every((i) => Math.abs(p[i]! - q[i]!) <= EPS);

/** The joint and its two world parts, or the refusal of checks 2–6. */
function partsOf(doc: SloydDocument, ids: [string, string]): { joint: CamJoint; a: Board; b: Board } | string {
  const joint = findCamJoint(doc, ids);
  if (typeof joint === 'string') return joint;
  const world = worldParts(doc);
  return { joint, a: world.find((x) => x.id === joint.a)!, b: world.find((x) => x.id === joint.b)! };
}

/**
 * A's cam lock at its joined `end` (spec §3.3): its one WHOLE pair (`camPairRows`, the bolt row entering the length from
 * `end`); null when no hole there is paired; `two` for more than one whole pair; `partial` when a hole there is paired
 * (a bolt hole into `end`, or its cam) but its rows are not that one whole pair.
 */
function lockAt(a: Board, end: CutFrom): { cam: HoleRow; bolt: HoleRow } | null | 'two' | 'partial' {
  const whole = camPairRows(a).filter((p) => p.bolt.face === 'length' && p.bolt.from === end);
  if (whole.length > 1) return 'two';
  const holes = a.holes.flatMap((r) => holeInstances(a, r));
  const into = end === 'min' ? 1 : -1;
  const there = new Set<string>();
  for (const [h, mate] of camPartners(holes)) {
    if (h.axis === 'length' && h.dir === into && camRole(h, mate) === 'bolt') there.add(h.row).add(mate.row);
  }
  const pair = whole[0];
  if ([...there].some((id) => id !== pair?.cam.id && id !== pair?.bolt.id)) return 'partial';
  return pair ?? null;
}

/** §3.2's default cam face: when A's broad face lies on world Y, the one pointing DOWN (a housing on a shelf's top shows);
 *  otherwise `'max'`, chunk 1's. */
function defaultFrom(a: Board): CutFrom {
  return axisDimensions(a)[1] === broadFace(a) ? endFacing(a, 1, -1) : 'max';
}

/** Each bolt hole's world axis (`boreEnds`' form, hole by hole): the mouth centre, and the unit bit, pointing into A. */
function boltAxes(a: Board, bolt: HoleRow): WorldAxis[] {
  return holeInstances(a, bolt).map((h) => {
    const p = toWorld(a, point(h.centre));
    const f = toWorld(a, point(h.centre.map((c, i) => c + h.reach * h.bit[i]!)));
    const d = [f[0] - p[0], f[1] - p[1], f[2] - p[2]];
    const n = Math.hypot(d[0]!, d[1]!, d[2]!);
    return { p, u: [d[0]! / n, d[1]! / n, d[2]! / n] };
  });
}

/**
 * B's bore for the bolt on `axis` (spec §3.2), through the ONE bore core (`boreRow`): entering B's dimension on world axis
 * `k` from the face toward A, its bit the NEGATED bolt bit (the bolt's points into A), its mouth where the bolt's axis
 * crosses that face (`faceCrossing`, never A's mouth, which is only within `TOUCH` of it), 5 mm × 12 mm. Coaxial by test:
 * a line missing the face, a tilt or a bore off the bolt's axis is a bug, thrown.
 */
function boreFor(b: Board, joint: CamJoint, axis: WorldAxis): Omit<HoleRow, 'id'> {
  const face = axisDimensions(b)[joint.k];
  const from = endFacing(b, joint.k, joint.side === 1 ? -1 : 1);
  const dir: V3 = [0 - axis.u[0], 0 - axis.u[1], 0 - axis.u[2]];
  const t = faceCrossing(b, axis.p, dir, face, from);
  if (t === null) throw new Error(`camJointPlan: the bolt's axis misses ${b.id}'s ${face} ${from} face`);
  const mouth: V3 = [axis.p[0] + t * dir[0], axis.p[1] + t * dir[1], axis.p[2] + t * dir[2]];
  const row = boreRow(b, face, from, mouth, dir, mm(5), mm(12));
  if ('tiltAlong' in row || 'tiltAcross' in row) throw new Error(`camJointPlan: ${b.id}'s bore tilts`);
  if (!boreAlongAxis(b, { ...row, id: '' }, axis)) throw new Error(`camJointPlan: ${b.id}'s bore is off the bolt's axis`);
  return row;
}

/** B's stored bore that IS `row` in the world (spec §3.3): a single, headless bore whose mouth and far centres both equal
 *  `row`'s (`boreEnds`, 1e-9), of the same diameter and depth. Never `sameHoleRow`: a bore at B's exact middle lowered
 *  through a mirrored Shape user reads its `alongFrom`/`acrossFrom` flipped from what `boreRow` picks. */
function existingBore(b: Board, row: Omit<HoleRow, 'id'>): HoleRow | undefined {
  const [m, f] = boreEnds(b, { ...row, id: '' });
  return b.holes.find((r) => r.count === 1 && r.head === undefined && r.diameter === row.diameter && r.depth === row.depth
    && (([rm, rf]) => same(rm, m) && same(rf, f))(boreEnds(b, r)));
}

/**
 * Add cam-and-bolt joint's plan (spec §3.2–§3.5) between the world parts `ids`, in either order. `count` the fittings
 * (null: chunk 1's rule, two from 150 mm wide, else one); `camFrom` the broad face A's cam enters (null: `defaultFrom`).
 * Every refusal is decided here, before anything is written, in this order: checks 2–6 (`findCamJoint`); then A's lock at
 * that end — two whole locks (`CAM_JOINT_TWO_LOCKS`), a partial one (`CAM_JOINT_PARTIAL`); when there is no lock to reuse,
 * the count (`CAM_JOINT_COUNT`: a whole number from 1 to `CAM_JOINT_MAX`; never read when the lock is reused), A's broad
 * face on its length (`CAM_JOINT_ON_EDGE`) and A at 1/2" or thinner (`CAM_JOINT_THIN`), `defaultCamLock`'s own order;
 * everything already there (`CAM_JOINT_ALREADY`); then the faults (check 8): A's new rows judged together (the pair's
 * exemption applies), then B's together with `camPairs: false` (a B bore is never a pair) — `camJointFaulted`.
 * Tilt and head checks are vacuous: every row made here is square (thrown otherwise) and headless.
 */
export function camJointPlan(doc: SloydDocument, ids: [string, string], count: number | null, camFrom: CutFrom | null):
  CamJointPlan | string {
  const found = partsOf(doc, ids);
  if (typeof found === 'string') return found;
  const { joint, a, b } = found;
  const names = displayNames(doc);
  const nameOf = (x: Board) => names.get(x.id) ?? x.name;

  // Check 7: A's lock, reused or laid out.
  const lock = lockAt(a, joint.end);
  if (lock === 'two') return CAM_JOINT_TWO_LOCKS(nameOf(a));
  if (lock === 'partial') return CAM_JOINT_PARTIAL(nameOf(a));
  let aRows: HoleRow[] = [];
  let pair = lock;
  if (!pair) {
    if (count !== null && !(Number.isInteger(count) && count >= 1 && count <= CAM_JOINT_MAX)) return CAM_JOINT_COUNT;
    if (broadFace(a) === 'length') return CAM_JOINT_ON_EDGE(nameOf(a));
    const rows = defaultCamLock(a, joint.end, count ?? undefined, camFrom ?? defaultFrom(a));
    if (!rows) return CAM_JOINT_THIN(nameOf(a));
    aRows = rows.map((r) => ({ ...r, id: nextId() }));
    pair = { cam: aRows[0]!, bolt: aRows[1]! };
  }
  const aAfter: Board = aRows.length > 0 ? { ...a, holes: [...a.holes, ...aRows] } : a;

  // B's bores, one per fitting, those already there reused.
  const axes = boltAxes(aAfter, pair.bolt);
  const planned = axes.map((axis) => boreFor(b, joint, axis));
  const bRows = planned.filter((r) => !existingBore(b, r)).map((r) => ({ ...r, id: nextId() }));
  if (lock && bRows.length === 0) return CAM_JOINT_ALREADY(nameOf(a), nameOf(b));

  // Check 8: A's new rows on A holding both, then B's on B holding all of its.
  for (const r of aRows) {
    const f = holeFaults(aAfter, r);
    if (f.length > 0) return camJointFaulted(nameOf(a), socketFaultWords(f[0]!));
  }
  const bAfter: Board = { ...b, holes: [...b.holes, ...bRows] };
  for (const r of bRows) {
    const f = holeFaults(bAfter, r, { camPairs: false });
    if (f.length > 0) return camJointFaulted(nameOf(b), socketFaultWords(f[0]!));
  }

  // The writes, through `mapWorld` on a trial document, read back per storage target (`stretchers.ts`' assembly).
  const trial = mapWorld(doc, (ws) => ws.map((x) => (x.id === a.id && aRows.length > 0 ? { ...x, holes: aAfter.holes }
    : x.id === b.id && bRows.length > 0 ? { ...x, holes: bAfter.holes } : x)));
  const after = worldParts(trial);
  const write = (x: Board, rows: readonly HoleRow[]) => ({ id: x.id, holes: rows.length > 0 ? after.find((y) => y.id === x.id)!.holes : x.holes });
  const writes = [write(a, aRows), write(b, bRows)];
  const before = new Map(worldParts(doc).map((x) => [x.id, x]));
  const notes = after.filter((x) => x.id !== a.id && x.id !== b.id && JSON.stringify(x.holes) !== JSON.stringify(before.get(x.id)?.holes))
    .map((x) => camJointLinkNote(nameOf(x)));
  return {
    joint, fittings: axes.length, camFrom: pair.cam.from, reused: { a: aRows.length === 0, b: planned.length - bRows.length },
    writes, notes,
  };
}

/** The panel's default `Fittings` (spec §4): a reused lock's own count, else chunk 1's rule; null when there is no joint
 *  (or no lock can be laid out or reused). */
export function defaultCamJointCount(doc: SloydDocument, ids: [string, string]): number | null {
  const found = partsOf(doc, ids);
  if (typeof found === 'string') return null;
  const lock = lockAt(found.a, found.joint.end);
  if (lock === 'two' || lock === 'partial') return null;
  return lock ? lock.cam.count : (defaultCamLock(found.a, found.joint.end)?.[0].count ?? null);
}

/** The `Cam face` select's two options (ruling R2), the default (`defaultCamFrom`) first, each named by the world direction
 *  its face points (`camFaceWord`); null when there is no joint or A's broad face is its length. */
export function camFaceOptions(doc: SloydDocument, ids: [string, string]): { from: CutFrom; label: string }[] | null {
  const found = partsOf(doc, ids);
  if (typeof found === 'string') return null;
  const { a } = found;
  const face = broadFace(a);
  const j = axisDimensions(a).indexOf(face);
  if (face === 'length' || j < 0) return null;
  const first = defaultFrom(a);
  return [first, first === 'min' ? 'max' : 'min'].map((from) => (
    { from: from as CutFrom, label: camFaceWord(j as 0 | 1 | 2, endFacing(a, j, -1) === from ? -1 : 1) }));
}

/** §3.2's default cam face for the joint between `ids`; null when there is no joint. */
export function defaultCamFrom(doc: SloydDocument, ids: [string, string]): CutFrom | null {
  const found = partsOf(doc, ids);
  return typeof found === 'string' ? null : defaultFrom(found.a);
}
