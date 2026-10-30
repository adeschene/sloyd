import type { Board, CutFrom, ProfileCut, ProfileSide, SloydDocument } from './types';
import { axisDimensions, boardExtents, endFacing } from './geometry';
import { angleCutRemovesNothing } from './angleCuts';
import { fingerSetAt } from './boxJoints';
import { dovetailAt } from './dovetailModel';
import { featureTouchesEnd, shapedFeatures } from './featureRegions';
import { leans } from './lean';
import { profileWord } from './ruledOutText';
import { tenonAt } from './roundTenons';
import { TOUCH } from './checkTolerances';
import { displayNames, instancesOn, parentPath, worldParts } from './tree';
import { storageKey } from './treeEdit';
import {
  CAM_JOINT_CONTAINERS, CAM_JOINT_END_FEATURE, CAM_JOINT_LEAN, CAM_JOINT_MIRRORED, CAM_JOINT_NONE, CAM_JOINT_SAME_PART,
  type CamEndFeature,
} from './camJointText';

/**
 * The cam-and-bolt joint (fu 568 chunk 2; cam-and-bolt joint spec §3): the ONE two-part cam-and-bolt planner. Two selected
 * parts, the END of one (A, a shelf) butting a FACE of the other (B, a side); A gets chunk 1's cam lock rows at that end and
 * B one bore per fitting on its bolt's axis. Nothing new is stored. Pure; the store writes the plan. This half finds the
 * joint and decides the refusals that need no layout (§3.1, §3.4 checks 2–6).
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
