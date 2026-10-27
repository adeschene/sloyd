import type { Board, Cut, CutFrom, Dimension, Region, Shape, SloydDocument, StoredBoard } from './types';
import type { Units } from '../units/length';
import { clippedRegion, cutsThatRemoveStock } from './cuts';
import { axisDimensions, boardExtents, endFacing, positionAxisOf } from './geometry';
import { resizeEnd } from './resizeEnd';
import { leans } from './lean';
import { boardHoles, holeTouchesBox } from './holes';
import { TOUCH } from './checkTolerances';
import { mirrorDim } from './frames';
import { SHARED_KEYS, sharedOf } from './links';
import { resolveBoard } from './shapes';
import { displayNames, instancesOn, parentPath, partAt, worldParts } from './tree';
import { storageKey, writeBackParts } from './treeEdit';

/**
 * The corner planner (box-joints spec §3, §6; dovetails spec §3.1, §6): the ONE home of corner finding, the exact run-out
 * of both parts to the other's outside face, the corner-region refusals and the linked-Shape planning that every corner
 * joint shares. A joint kind (`JointKind`) supplies only what is its own: the features it refuses, how its old joint is
 * removed from an end, the per-corner layout, the cuts or features it adds at an end, and its Shape-local signature.
 * Pure: no store. Imports only a TYPE from `units` (CLAUDE.md, the `→ units` edge rule); every sentence comes through the
 * kind's `CornerCopy` (shared wording in `cornerText.ts`).
 */

const EPS = 1e-9;

/** One part end in one corner: the world axis `k` it runs along into the corner, the world side its end faces, the
 *  other part's OUTSIDE face on `k` (`far`) and the other part's thickness (the joint's depth). */
export interface CornerEnd { part: Board; k: number; side: -1 | 1; far: number; depth: number }
/** A corner: its two ends (in selection order) and the joint line `J`, the third world axis. */
export interface Corner { ends: [CornerEnd, CornerEnd]; J: number }

/** One jointed end's run-out, in part terms: the run dimension `d` and its end, the move (`k`, `side`, the new size,
 *  `far`) and the depth. Kind-free: what a kind adds at the end is the kind's (`JointKind.addAt`). Replayed on a Shape's
 *  own board for a linked part. */
export interface EndOp { k: number; side: -1 | 1; d: Dimension; end: CutFrom; size: number; depth: number; far: number }

/**
 * How a Shape's own board differs from a user's frame at one end, from the user's own `mirrored` flag along `mirrorDim`
 * (all false for an unmirrored user, and for every world part's own call). `dim`: the mirror runs along the end's run
 * dimension (the end itself is flipped; `addAt` already receives the Shape-local end). `j`: it runs along the end's joint
 * line, the part's non-thickness dimension other than `d` (a phase or an odd end is flipped). `thickness`: it runs along
 * the part's thickness (a face named on the thickness axis is flipped).
 */
export interface EndFlips { dim: boolean; j: boolean; thickness: boolean }
export const NO_FLIPS: EndFlips = Object.freeze({ dim: false, j: false, thickness: false });

/** The flips a user's own flag puts on `op`'s end (`EndFlips`). */
export function flipsOf(u: Board, op: EndOp): EndFlips {
  const m = u.mirrored === true;
  return {
    dim: m && op.d === mirrorDim(u),
    j: m && positionAxisOf(op.d, 'thickness') === mirrorDim(u),
    thickness: m && mirrorDim(u) === 'thickness',
  };
}

/**
 * A kind's copy for every sentence the corner planner can return (verbatim per kind; the shared wording lives in
 * `cornerText.ts`). `F` is the kind's plain-stock feature word, which must include `'lean'` (a leaning candidate refuses
 * with it before the per-part feature test).
 */
export interface CornerCopy<F extends string> {
  noCorner: string;
  mirrored(part: string): string;
  containers(a: string, b: string): string;
  heights(a: string, b: string): string;
  twoCorners(part: string): string;
  threeWay(part: string): string;
  plainStock(part: string, f: F | 'lean'): string;
  cutInTheWay(part: string): string;
  holeInTheWay(part: string): string;
  linkedMate(part: string, mate: string): string;
  linkedDisagree(parts: readonly string[]): string;
  linkSplit(parts: readonly string[]): string;
  ignored(part: string): string;
  length(part: string, delta: number, units: Units): string;
}

/**
 * A corner joint kind. `P` is one corner's plan: whatever `planCorner` decides for the corner (a layout, and each side's
 * part-local facts read off the WORLD corner, e.g. a phase or an odd end). Side 0 is the corner's first end, side 1 its
 * second.
 * - `featureOf`: the first feature a part may not carry for this kind, or null.
 * - `removeAt`: remove this kind's existing joint at one end (before the end moves).
 * - `planCorner`: the corner's plan, or a refusal sentence. Called after every end has moved, once per corner in corner
 *   order, each followed at once by `addAt` for side 0 then side 1. `nameOf` gives a world part's display name.
 * - `addAt`: add the joint at `end` of `b` for `side`. For a world part `b` is its moved clone, `end` its own end and
 *   `flips` NO_FLIPS. For a Shape's own board `end` is already Shape-local and `flips` are the representative user's
 *   (`flipsOf`); the kind applies `j`/`thickness` to anything it reads on those axes. Ids are minted here.
 * - `signature`: the kind's part of one end's Shape-local signature, compared EXACTLY between linked users (after the
 *   generic run dimension and Shape-local end, before the depth and the final size).
 */
export interface JointKind<P, F extends string = string> {
  copy: CornerCopy<F>;
  featureOf(b: Board): F | null;
  removeAt(b: Board, d: Dimension, end: CutFrom): void;
  planCorner(c: Corner, ops: [EndOp, EndOp], doc: SloydDocument, nameOf: (b: Board) => string): P | string;
  addAt(b: Board, op: EndOp, end: CutFrom, plan: P, side: 0 | 1, flips: EndFlips): void;
  signature(plan: P, side: 0 | 1, flips: EndFlips): unknown[];
}

/** The planned corners. `parts` maps every jointed WORLD part (its occurrence id) to its full new world board; another
 *  placement of a definition follows through the write-back (inv 46). A Shape's users all carry the Shape's ONE new set
 *  of shared fields, read through their own flags. `lengths` and `ignored` are success-note lines, in part order. */
export interface CornerPlan<P> {
  parts: Map<string, Board>;
  corners: { a: string; b: string; plan: P }[];
  ignored: string[];
  lengths: string[];
}

/** The phase order (box-joints spec, Amended 2026-10-27): the part whose run axis comes first in Z, X, Y takes the
 *  leading role (box joints: a finger at the start edge). Indexed by world axis. */
export const RUN_RANK: readonly number[] = [1, 2, 0];

const thicknessAxis = (b: Board) => axisDimensions(b).indexOf('thickness');
const spanOn = (b: Board, k: number): [number, number] => [b.position[k]!, b.position[k]! + boardExtents(b)[k]!];

/** `p`'s end along `k` (the other part's thickness axis) facing `q`, when it lies in `q`'s thickness slab to `TOUCH`
 *  (spec §3.1). The facing side and `q`'s far face are judged by the parts' centres on `k`. */
function reach(p: Board, q: Board, k: number): CornerEnd | null {
  const [p0, p1] = spanOn(p, k);
  const [q0, q1] = spanOn(q, k);
  const side: -1 | 1 = (p0 + p1) / 2 < (q0 + q1) / 2 ? 1 : -1;
  const end = side === 1 ? p1 : p0;
  if (end < q0 - TOUCH || end > q1 + TOUCH) return null;
  return { part: p, k, side, far: side === 1 ? q1 : q0, depth: q.thickness };
}

/**
 * A candidate corner (spec §3.1's first and third tests): perpendicular thickness axes, each end in the other's slab.
 * Also (my reading of "make a corner", box joints Task 3 report): the two spans along `J` must OVERLAP (beyond 1e-9).
 * Without it a part far along the joint line (a shelf beside a drawer, a drawer stacked above another) whose ends happen
 * to line up would be a candidate and refuse the whole selection with the heights sentence.
 */
function candidate(a: Board, b: Board): Corner | null {
  const ta = thicknessAxis(a);
  const tb = thicknessAxis(b);
  if (ta === tb) return null;
  const J = 3 - ta - tb;
  const [ja, jb] = [spanOn(a, J), spanOn(b, J)];
  if (Math.min(ja[1], jb[1]) - Math.max(ja[0], jb[0]) <= EPS) return null;
  const ea = reach(a, b, tb);
  const eb = ea && reach(b, a, ta);
  return ea && eb ? { ends: [ea, eb], J } : null;
}

/** Remove the kind's joint at `op`'s end and move that end (spec §3.2, §3.5): the exact new size, never grid-rounded
 *  (inv 25). `side` is the world side to move (`op.side`, or its opposite on a mirrored Shape's own board). False when
 *  `resizeEnd` refuses a cut stored into the moving end that cannot be re-faced (it is in the corner region). */
function moveEnd<P, F extends string>(kind: JointKind<P, F>, b: Board, op: EndOp, end: CutFrom, side: -1 | 1, exact: boolean): boolean {
  kind.removeAt(b, op.d, end);
  const was = b[op.d];
  try {
    resizeEnd(b, op.k, side, op.size - was);
  } catch (e) {
    // resizeEnd's one refusal (rebaseCuts): a cut stored into the moving end that cannot be re-faced.
    if (e instanceof Error && e.message.includes('grows at an end it is already cut into')) return false;
    throw e;
  }
  b[op.d] = op.size;
  // A world part's moving MIN face lands EXACTLY on the other part's outside face (its max face is `position + size`,
  // the size computed from that face). A Shape's own board has no world position to keep.
  if (exact && side === -1) b.position[op.k] = op.far;
  return true;
}

const flipEnd = (e: CutFrom): CutFrom => (e === 'min' ? 'max' : 'min');

/** The corner region of a moved end (spec §3.5, box joints task brief step 4): the last `depth` of the run dimension at
 *  that end, full thickness, full `J` dimension. */
function cornerRegion(b: Board, op: EndOp): Region {
  const L = b[op.d];
  const jd = positionAxisOf(op.d, 'thickness');
  const r = { [op.d]: op.end === 'min' ? [0, op.depth] : [L - op.depth, L], thickness: [0, b.thickness], [jd]: [0, b[jd]] };
  return r as Region;
}

/**
 * A cut that may stay in a corner region (spec §3.5): one running straight THROUGH the corner along the run dimension
 * (`across` = the run dimension, as §3.5 words it: a drawer bottom's groove), from the end face to past the region's
 * inner face. Anything else meeting the region beyond 1e-9 refuses: a rabbet across the end (any width, any depth; the
 * recogniser ignores a partial-thickness one), a tenon's cheeks, a hand-made notch.
 */
function cutInTheWay(b: Board, op: EndOp): boolean {
  const R = cornerRegion(b, op);
  return cutsThatRemoveStock(b).some((c) => {
    const r = clippedRegion(b, c);
    const meets = (['length', 'width', 'thickness'] as Dimension[])
      .every((x) => Math.min(r[x][1], R[x][1]) - Math.max(r[x][0], R[x][0]) > EPS);
    if (!meets) return false;
    return !cutRunsThrough(b, c, op.d, op.end, op.depth);
  });
}

/**
 * The ONE "runs straight through the corner" predicate (box-joints spec §3.5, dovetails spec §3.6): cut `c` on part `b`
 * runs along the run dimension `d` (`across === d`) and its clipped region reaches from the `end` face (within 1e-9) to
 * past the corner region's inner face, `depth` back from it (by more than 1e-9) — a drawer bottom's groove. The corner
 * planner (`cutInTheWay`) and the dovetail zone check (`dovetailCutRefusal`) both read it.
 */
export function cutRunsThrough(b: Board, c: Cut, d: Dimension, end: CutFrom, depth: number): boolean {
  if (c.across !== d) return false;
  const r = clippedRegion(b, c);
  const L = b[d];
  return end === 'min'
    ? r[d][0] <= EPS && r[d][1] > depth + EPS
    : r[d][1] >= L - EPS && r[d][0] < L - depth - EPS;
}

/** The stored part at a world occurrence (its Shape reference and own flag). */
const storedOf = (doc: SloydDocument, id: string): StoredBoard => partAt(doc, id)!;

/** `world` with every shared field read from `shape` through the stored part's own flag (box joints Spec difference 3
 *  revised): exactly what the Shape's users will resolve to, so `regroupShapes` keeps them together by construction. */
function withShapeFields(world: Board, stored: StoredBoard, shape: Shape): Board {
  const r = resolveBoard(new Map([[shape.id, shape]]), stored)! as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...world };
  for (const k of SHARED_KEYS) {
    if (k in r) out[k] = r[k];
    else delete out[k];
  }
  return out as unknown as Board;
}

/** A Shape's shared fields (its own arrays), for its own board. */
function shapeFields(s: Shape): Omit<Shape, 'id'> {
  const { id: _id, ...rest } = s;
  void _id;
  return rest;
}

/**
 * Plan the corners among the selected world parts `ids` for one joint `kind` (box-joints spec §3, §6). Every refusal is
 * decided here, before any mutation (on clones), in this order (a kind's own input refusals come before the call):
 * 2. A part reached through a mirrored instance.
 * 3. The candidate corners (spec §3.1: thickness axes perpendicular and each end in the other's slab, to `TOUCH`); none
 *    refuses. A leaning candidate refuses with the plain-stock lean sentence. Per candidate: its parts in different
 *    containers, then a different span along `J` (1e-9). Then one end in two corners, then a part jointed at ends of two
 *    different dimensions (no three-way corners).
 * 4. Per jointed part, then per end: a feature it may not carry (`kind.featureOf`); then that end's old joint is removed
 *    (`kind.removeAt`), the end moved exactly to the other part's outside face (`resizeEnd`), and the corner region
 *    judged: a cut not running through it, then a hole touching it.
 * 5. Per corner, `kind.planCorner` (a string refuses), then `kind.addAt` for each side.
 * 6. Linked parts: every user of a jointed part's Shape must be jointed at the same Shape-local ends (through its own
 *    `mirrored` flag along `mirrorDim`), with the same `kind.signature` (through its flips), depth and new size (the
 *    size at 1e-9); else the mate or disagreement sentence. The Shape's new shared fields are planned ONCE on the Shape's
 *    own board (a non-mirrored user's frame, the ends flipped for a mirrored one; ids minted once), and every user's
 *    world after-state reads them through its flag.
 * Last, the link post-condition: the plan is written (`writeCorners`) and every Shape with two or more users must still
 * hold them all; else `copy.linkSplit`.
 * Selected ids that are not world parts are skipped.
 */
export function planCorners<P, F extends string>(
  doc: SloydDocument, ids: readonly string[], kind: JointKind<P, F>,
): CornerPlan<P> | string {
  const { copy } = kind;
  const world = worldParts(doc);
  const byId = new Map(world.map((b) => [b.id, b]));
  const sel = [...new Set(ids)].flatMap((id) => byId.get(id) ?? []);
  const names = displayNames(doc);
  const nameOf = (b: Board) => names.get(b.id) ?? b.name;

  // 2. A part inside a mirrored copy (as stretchers: any mirrored instance on the chain).
  for (const b of sel) {
    const c = parentPath(b.id);
    if (c !== null && (instancesOn(doc, c) ?? []).some((i) => i.mirrored === true)) return copy.mirrored(nameOf(b));
  }

  // 3. The corners.
  const corners: Corner[] = [];
  for (let i = 0; i < sel.length; i += 1) {
    for (let j = i + 1; j < sel.length; j += 1) {
      const c = candidate(sel[i]!, sel[j]!);
      if (c) corners.push(c);
    }
  }
  if (corners.length === 0) return copy.noCorner;
  // A LEANING candidate was found by its pre-lean box (inv 57 R2: never its extent); §3.1 premises unleaned parts, so
  // it refuses with the plain-stock lean sentence before any test that reads that box further.
  for (const { ends } of corners) {
    const leaning = ends.find((e) => leans(e.part));
    if (leaning) return copy.plainStock(nameOf(leaning.part), 'lean');
  }
  for (const { ends: [ea, eb], J } of corners) {
    if (parentPath(ea.part.id) !== parentPath(eb.part.id)) return copy.containers(nameOf(ea.part), nameOf(eb.part));
    const [sa, sb] = [spanOn(ea.part, J), spanOn(eb.part, J)];
    if (Math.abs(sa[0] - sb[0]) > EPS || Math.abs(sa[1] - sb[1]) > EPS) return copy.heights(nameOf(ea.part), nameOf(eb.part));
  }
  const endsOf = new Map<string, CornerEnd[]>();   // world id -> its jointed ends, corner order
  for (const c of corners) for (const e of c.ends) endsOf.set(e.part.id, [...(endsOf.get(e.part.id) ?? []), e]);
  const jointed = sel.filter((b) => endsOf.has(b.id));
  for (const b of jointed) {
    const keys = endsOf.get(b.id)!.map((e) => `${e.k}:${e.side}`);
    if (new Set(keys).size < keys.length) return copy.twoCorners(nameOf(b));
  }
  for (const b of jointed) {
    if (new Set(endsOf.get(b.id)!.map((e) => e.k)).size > 1) return copy.threeWay(nameOf(b));
  }

  // 4. Per part end: plain stock, the old joint removed, the move, the corner region.
  const ops = new Map<CornerEnd, EndOp>();
  const planned = new Map<string, Board>();   // world id -> working clone
  for (const b of jointed) {
    const f = kind.featureOf(b);
    if (f) return copy.plainStock(nameOf(b), f);
    const clone = structuredClone(b);
    for (const e of endsOf.get(b.id)!) {
      const d = axisDimensions(b)[e.k]!;
      const end = endFacing(b, e.k, e.side);
      const [p0, p1] = spanOn(clone, e.k);
      const size = e.side === 1 ? e.far - p0 : p1 - e.far;
      const op: EndOp = { k: e.k, side: e.side, d, end, size, depth: e.depth, far: e.far };
      if (!moveEnd(kind, clone, op, end, e.side, true)) return copy.cutInTheWay(nameOf(b));
      if (cutInTheWay(clone, op)) return copy.cutInTheWay(nameOf(b));
      const R = cornerRegion(clone, op);
      if (boardHoles(clone).some((h) => holeTouchesBox(h, R))) return copy.holeInTheWay(nameOf(b));
      ops.set(e, op);
    }
    planned.set(b.id, clone);
  }

  // 5. The kind's plan and its joint, per corner.
  const out: CornerPlan<P>['corners'] = [];
  const placed = new Map<CornerEnd, { plan: P; side: 0 | 1 }>();
  for (const c of corners) {
    const [ea, eb] = c.ends;
    const plan = kind.planCorner(c, [ops.get(ea)!, ops.get(eb)!], doc, nameOf);
    if (typeof plan === 'string') return plan;
    for (const [e, side] of [[ea, 0], [eb, 1]] as const) {
      const op = ops.get(e)!;
      placed.set(e, { plan, side });
      kind.addAt(planned.get(e.part.id)!, op, op.end, plan, side, NO_FLIPS);
    }
    out.push({ a: ea.part.id, b: eb.part.id, plan });
  }

  // 6. Linked parts: one Shape, planned once, read by every user through its own flag.
  const parts = new Map<string, Board>();
  const byShape = new Map<string, Board[]>();
  for (const b of jointed) {
    if (b.shape === undefined) parts.set(b.id, planned.get(b.id)!);
    else byShape.set(b.shape, [...(byShape.get(b.shape) ?? []), b]);
  }
  const shapes = new Map(doc.shapes.map((s) => [s.id, s]));
  const keyedUsers = (sid: string) => world.filter((w) => w.shape === sid);
  for (const [sid, users] of byShape) {
    // Every stored user of the Shape (by storage key) needs a jointed occurrence.
    const jointedKeys = new Set(users.map((u) => storageKey(doc, u.id)));
    const mate = keyedUsers(sid).find((w) => !jointedKeys.has(storageKey(doc, w.id)));
    if (mate) return copy.linkedMate(nameOf(users[0]!), nameOf(mate));
    const localEnd = (u: Board, op: EndOp): CutFrom => (flipsOf(u, op).dim ? flipEnd(op.end) : op.end);
    // Per Shape-local end: [the run dimension, the Shape-local end, ...the kind's signature (through the user's flips),
    // the depth, the run dimension's FINAL size] (an op's own `size` is the size after that end's move, which depends on
    // the order the ends were planned in).
    const sigOf = (u: Board) => endsOf.get(u.id)!.map((e) => {
      const op = ops.get(e)!;
      const { plan, side } = placed.get(e)!;
      return [op.d, localEnd(u, op), ...kind.signature(plan, side, flipsOf(u, op)), op.depth, planned.get(u.id)![op.d]];
    }).sort((x, y) => (`${x[0]}${x[1]}` < `${y[0]}${y[1]}` ? -1 : 1));
    const endsKey = (u: Board) => JSON.stringify(sigOf(u).map((s) => [s[0], s[1]]));
    const first = users[0]!;
    const missing = users.find((u) => endsKey(u) !== endsKey(first));
    if (missing) return copy.linkedMate(nameOf(first), nameOf(missing));
    // Everything but the size compares exactly; the size is a world subtraction (`e.far - p0`), so the same part at
    // another world offset can plan it an ulp off (the recognised-number ruling's class), and it compares at 1e-9. The
    // Shape still takes the representative's size below, and the link post-condition guards the written result.
    const sameSig = (x: ReturnType<typeof sigOf>, y: ReturnType<typeof sigOf>) => x.length === y.length && x.every((s, i) =>
      s.length === y[i]!.length && JSON.stringify(s.slice(0, -1)) === JSON.stringify(y[i]!.slice(0, -1))
      && Math.abs((s[s.length - 1] as number) - (y[i]![s.length - 1] as number)) <= EPS);
    if (users.some((u) => !sameSig(sigOf(u), sigOf(first)))) return copy.linkedDisagree(users.map(nameOf));
    // The Shape's own board: a user's frame with the Shape's own features; a mirrored user's ends are flipped along
    // mirrorDim, and its world side with them (the turn is the same); so is what the kind reads along a flipped axis.
    const rep = users.find((u) => u.mirrored !== true) ?? first;
    const shape = shapes.get(sid)!;
    const own: Board = structuredClone({ ...rep, ...shapeFields(shape) });
    const repEnds = endsOf.get(rep.id)!;
    for (const e of repEnds) {
      const op = ops.get(e)!;
      const side = flipsOf(rep, op).dim ? (op.side === 1 ? -1 : 1) : op.side;
      if (!moveEnd(kind, own, op, localEnd(rep, op), side, false)) return copy.cutInTheWay(nameOf(rep));
    }
    for (const e of repEnds) {
      const op = ops.get(e)!;
      const { plan, side } = placed.get(e)!;
      kind.addAt(own, op, localEnd(rep, op), plan, side, flipsOf(rep, op));
    }
    const next: Shape = { id: sid, ...sharedOf(own) };
    for (const u of users) parts.set(u.id, withShapeFields(planned.get(u.id)!, storedOf(doc, u.id), next));
  }

  // The success-note lines: a length line per resized part, an ignored line per selected part in no corner.
  const lengths: string[] = [];
  for (const b of jointed) {
    const d = axisDimensions(b)[endsOf.get(b.id)![0]!.k]!;
    const delta = parts.get(b.id)![d] - b[d];
    if (Math.abs(delta) > EPS) lengths.push(copy.length(nameOf(b), delta, doc.units));
  }
  const ignored = sel.filter((b) => !endsOf.has(b.id)).map((b) => copy.ignored(nameOf(b)));

  // The link post-condition (box joints Spec difference 3 revised): every Shape with two or more users keeps them all.
  const after = writeCorners(doc, parts);
  for (const s of doc.shapes) {
    const users = world.filter((w) => w.shape === s.id);
    const keys = [...new Set(users.map((u) => storageKey(doc, u.id)))];
    if (keys.length < 2) continue;
    const now = new Set(users.map((u) => {
      const p = partAt(after, u.id);
      return p && 'shape' in p && !('length' in p) ? p.shape : `plain:${u.id}`;
    }));
    if (now.size > 1) return copy.linkSplit(users.map(nameOf));
  }
  return { parts, corners: out, ignored, lengths };
}

/** Write planned corners (box joints Spec difference 3 revised): `writeBackParts`, one `{ before, after }` per planned
 *  world part, with `keepWorld` (spec §6), so every placement of a definition and every user of a Shape follows. */
export function writeCorners(doc: SloydDocument, parts: ReadonlyMap<string, Board>): SloydDocument {
  const world = worldParts(doc);
  const edits = [...parts].map(([id, after]) => ({ before: world.find((b) => b.id === id)!, after }));
  return writeBackParts(doc, edits);
}
