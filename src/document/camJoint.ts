import type { Board, CutFrom, SloydDocument } from './types';
import { axisDimensions, boardExtents, endFacing } from './geometry';
import { touchedRegion } from './angleCuts';
import { fingerSetAt } from './boxJoints';
import { dovetailAt } from './dovetailModel';
import { featureTouchesEnd, shapedFeatures } from './featureRegions';
import { leans } from './lean';
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

/** The first feature A's joined end may not carry (spec §3.4 check 6), in the copy's order, or null: a round tenon, a
 *  dovetail, a box joint's finger set at that end; an angle cut whose touched box (`touchedRegion`, conservative) reaches
 *  that end face; a curve or profile whose region touches that end face (`featureTouchesEnd`, joinery's P6). */
function endFeature(b: Board, end: CutFrom): CamEndFeature | null {
  if (tenonAt(b, end)) return 'round tenon';
  if (dovetailAt(b, 'length', end)) return 'dovetails';
  if (fingerSetAt(b, 'length', end)) return 'box joints';
  const atEnd = (r: [number, number]) => (end === 'min' ? r[0] <= 1e-9 : r[1] >= b.length - 1e-9);
  if (b.angleCuts.some((c) => { const r = touchedRegion(b, c); return r !== null && atEnd(r.length); })) return 'angle cut';
  const { view, features } = shapedFeatures(b);
  const f = features.find((x) => featureTouchesEnd(view, x, 'length', end));
  return f ? f.word as CamEndFeature : null;
}

/**
 * The joint between the two selected world parts `ids`, in either order (spec §3.1), or the first refusal of §3.4 checks
 * 2–6 in the spec's order: either part leans; different containers; a part reached through a mirrored instance; the two
 * share one holes storage (users of one Shape); no end-into-face contact; A's joined end not plain square stock. More than
 * one candidate is a bug (two axis-aligned boxes admit at most one: both ends of A cannot touch one box, and each part's
 * end on the other's face leaves at most a TOUCH-wide sliver the "within" bound excludes), thrown, never a sentence.
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
  if (found.length > 1) throw new Error(`findCamJoint: ${found.length} candidates between ${ids[0]} and ${ids[1]}`);
  const joint = found[0];
  if (!joint) return CAM_JOINT_NONE(nameOf(parts[0]), nameOf(parts[1]));
  // 6. A's joined end is plain square stock.
  const a = joint.a === parts[0].id ? parts[0] : parts[1];
  const f = endFeature(a, joint.end);
  if (f) return CAM_JOINT_END_FEATURE(nameOf(a), f);
  return joint;
}
