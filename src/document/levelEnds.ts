import type { AngleCut, Board, Dimension, HoleRow, Lean } from './types';
import type { Units } from '../units/length';
import { axisFrame, boardExtents, snapStep } from './geometry';
import { depthAt } from './angleCuts';
import { leanMap, seamFree } from './lean';
import { toWorld } from './snapPoints';
import { nextId } from './ids';
import { levelEndHoles, storableRow } from './holeRebase';
import type { Vec3 } from './frames';

/**
 * Level the ends (splayed legs spec §5): a leaning leg's foot cut to stand on the world floor (`y = 0`, the design
 * checks' floor) and its top cut level, its length set at each end so every corner of that end just reaches its plane,
 * each end's change rounded UP to the drag grid (Global Constraints) so the cut list prints a buyable blank.
 *
 * Both cuts are end miters (`face 'length'`). On a TURNED lean each slopes along the dimension the lean faces
 * (`seamFree`'s, the one `leanMap` twists onto the sightline), so the floor's normal lies in the length × face plane
 * (§3.3) and one sloped line stores the plane exactly. On a SQUARE-SET lean (schema 25; square-set legs spec §3.3) the
 * part is never twisted, so the normal tilts in both cross dimensions: each end is ONE compound miter, `along` the cross
 * dimension with the larger slope (ties: width), `points` its single-slope line through the end's CENTRE, and `across`
 * the remaining slope (none stored for a zero one, so a rake- or splay-only square-set lean writes a plain miter). Either
 * way the stored lines are offset after the round-up, so `miterFields` reads them as null: the rows show the bench line
 * and Remove only (re-level instead).
 */

/** The refusals, verbatim (Global Constraints), all decided before any mutation. */
export const LEVEL_FOOT_CUT = 'Remove the angle cut on the foot first.';
export const LEVEL_TOP_CUT = 'Remove the angle cut on the top first.';
export const LEVEL_BELOW_FLOOR = 'The top of this part is at or below the floor.';
/** Angled holes §7 (builder's copy): a re-anchored row the loader would drop (station or inset below 0, a blind depth at
 *  or below 0) — a shortened end cut the hole away. Refused rather than lost on the next load. */
export const LEVEL_CUTS_HOLE = 'Levelling the ends would cut away a hole — move it or remove it first.';
export const levelUsersDisagree = (names: readonly string[]): string =>
  `These linked parts' tops are at different heights, so one length can't level them all: ${names.join(', ')}.`;

/** Comparisons through `leanMap` round trips carry ~1e-15; everything here is judged at 1e-9. */
const EPS = 1e-9;

/** `holes` (angled holes §7): every row re-anchored by `levelEndHoles`, so each hole stays where it was in the wood. */
export interface LevelPlan { length: number; position: Vec3; angleCuts: AngleCut[]; holes: HoleRow[] }

/** The dimension a TURNED lean's level cut slopes along: the facing dimension `leanMap` actually twists (seam-free,
 *  §3.3). A square-set lean's is read off its map instead (`levelPlan`). */
function faceOf(lean: Lean): 'width' | 'thickness' {
  return seamFree(lean).face;
}

/** The world PRE-lean direction in which dimension `d`'s local coordinate grows (`axisFrame`, inv 44: a reversed axis
 *  runs along the world axis's negative). */
function dirOf(b: Board, d: Dimension): Vec3 {
  const v: Vec3 = [0, 0, 0];
  const i = axisFrame(b).findIndex((a) => a.dim === d);
  v[i] = axisFrame(b)[i]!.reversed ? -1 : 1;
  return v;
}

/**
 * Which end a cut levels, or null (spec §5's structural recognition): ANY end miter — `kind 'miter'`, `face 'length'` —
 * whatever its line (offset lines included: the round-up makes them so, and a stale cut levelled for another lean must
 * still be replaced) and whichever cross dimension it slopes along. Width OR thickness, because a later lean edit can
 * flip the seam-free facing dimension (`seamFree`: a lean made rake- or splay-only), and the cuts levelled along the old
 * one must still be replaced, never refused as foreign (Task 6 review ruling). Level writes its new cut along
 * `seamFree(lean).face`. `from 'min'` is the foot, `'max'` the top. An end bevel or chamfer (`face 'length'`, another
 * kind) is not a level cut: it refuses.
 *
 * Only a `face 'length'` cut is ON an end. A taper (or any cut along the length, `face` width or thickness) may reach
 * the end's stock but never stands on its face: it slopes a side, its stations ride with the end when the length
 * changes, and a level cut through it still leaves a flat foot. So it neither blocks levelling nor is replaced.
 */
export function levelCutOf(c: AngleCut): 'foot' | 'top' | null {
  if (c.kind !== 'miter' || c.face !== 'length') return null;
  return c.from === 'min' ? 'foot' : 'top';
}

/** Round an end's change UP to the grid (Global Constraints): a negative foot change rounds toward zero. `+ 0` makes −0
 *  a plain 0. THE one rounding rule: Bore leg sockets' fitted tenon length rounds with it too (round tenons spec §6.1). */
export function roundUp(v: number, step: number): number {
  return Math.ceil(v / step - EPS) * step + 0;
}

/** World Y of board-local point (ℓ, f, t) on dimensions length × `face` × `through`, leaned (`toWorld`, R1). */
function heightAt(b: Board, face: Dimension, through: Dimension, l: number, f: number, t: number): number {
  return toWorld(b, { length: l, [face]: f, [through]: t } as Record<Dimension, number>)[1];
}

/**
 * The plan for world part `world` (it must lean; a part that does not is a caller's bug and throws): the new length,
 * the new world PRE-lean position (inv 2), the hole rows re-anchored (`levelEndHoles`) and the full angle-cut list with
 * the recognised end cuts replaced (in place, keeping their ids; a new one appended). Or a refusal.
 *
 * - `u` is the leaned axis's up direction (`m` applied to world up; length runs up an upright part).
 * - Foot: `e_f = max over the 4 foot corners of y / u_y`, negative when the foot runs past the floor (shortened).
 * - Top: through the reference R (or `opts.topAt`, a given world height: round tenons spec §6.1) — where an existing RECOGNISED top cut's plane meets the leaned axis (its centre
 *   station), else the pivot P — so the seat-joint height is kept across re-levels and a levelled part plans no change
 *   (idempotent; controller ruling, Task 6). `e_t = (R.y − min over the 4 top corners of y) / u_y`: from an uncut top it
 *   is always positive (the top is always extended, §5); on a re-level it may be negative, and it is 0 on a levelled
 *   part after the round-up.
 * - `L' = L + e_f + e_t`; the new pivot is `P' = P + e_t·u`, so the leaned axis is the same line (the rotation does not
 *   depend on length or position); `position' = P' − (e0/2, L', e2/2)`.
 * - Depths come from the NEW board's own map: the length-wise distance from each end face to its plane at stations 0 and
 *   A (the facing dimension, or a square-set lean's `along`), stations from `min`. A turned lean reads them at through
 *   position 0 (its plane has no through slope; byte for byte as before schema 25); a square-set one at the through
 *   CENTRE, so `depthAt(c, A/2)` is the depth on the axis and R stays exact, and its `across` is the depth's slope across
 *   the through dimension, `{ rise: |s|, from: the side the depth grows from }`, stored only when `|s| > 1e-9`.
 */
export function levelPlan(world: Board, units: Units, opts?: { topAt?: number }): LevelPlan | string {
  const lean = world.lean;
  const lm = lean ? leanMap(world) : null;
  if (!lean || !lm) throw new Error('levelPlan: the part does not lean');
  // A square-set lean's cut slopes along the cross dimension whose world height changes faster (ties: width, §3.3).
  const square = lean.square === true;
  const face: 'width' | 'thickness' = square
    ? (Math.abs(lm.applyDir(dirOf(world, 'width'))[1]) + EPS >= Math.abs(lm.applyDir(dirOf(world, 'thickness'))[1]) ? 'width' : 'thickness')
    : faceOf(lean);
  const through: Dimension = face === 'width' ? 'thickness' : 'width';

  // A face 'length' cut on an end that is not a level cut: never stack a second cut on an end (§5).
  const onEnd = (from: 'min' | 'max') => world.angleCuts.filter((c) => c.face === 'length' && c.from === from);
  if (onEnd('min').some((c) => levelCutOf(c) === null)) return LEVEL_FOOT_CUT;
  if (onEnd('max').some((c) => levelCutOf(c) === null)) return LEVEL_TOP_CUT;

  // §3.3's guarantee for a TURNED lean: the floor normal has no component on the through dimension, so a line in
  // length × face holds the plane. Its leaned direction must be horizontal; anything else is a bug in lean.ts, not a part
  // to cut. A square-set lean's through slope is real and goes into `across` (square-set legs spec §3.3).
  const tDir = dirOf(world, through);
  const gt = lm.applyDir(tDir)[1];
  if (!square && Math.abs(gt) > EPS) throw new Error('levelPlan: the floor normal leaves the length × face plane');

  const u = lm.applyDir([0, 1, 0]);
  const uy = u[1];
  const A = world[face];
  const T = world[through];
  const L = world.length;
  const corners = (b: Board, l: number) =>
    [[0, 0], [A, 0], [0, T], [A, T]].map(([f, t]) => heightAt(b, face, through, l, f!, t!));

  const topCut = world.angleCuts.find((c) => levelCutOf(c) === 'top');
  // The cut's own centre station (its `along` may be the other cross dimension, after a seam-free flip): a depth there
  // is the same from either side, so `alongFrom` does not matter, and the axis runs through every cross centre.
  // `topAt` (round tenons spec §6.1, Bore leg sockets' tenoning): the top's reference height given, the seat's top face,
  // instead of R. Absent, R as always.
  const ry = opts?.topAt ?? lm.pivot[1] - (topCut ? depthAt(topCut, world[topCut.along] / 2) : 0) * uy;
  if (ry <= EPS) return LEVEL_BELOW_FLOOR;

  const step = snapStep(units);
  const eF = roundUp(Math.max(...corners(world, 0)) / uy, step);
  const eT = roundUp((ry - Math.min(...corners(world, L))) / uy, step);
  const length = L + eF + eT;
  // Angled holes §7: the rows follow the wood (decided before anything is written: a cut-away row refuses).
  const holes = levelEndHoles(world.holes, eF, eT, world);
  if (!holes.every(storableRow)) return LEVEL_CUTS_HOLE;
  const pivot: Vec3 = [lm.pivot[0] + eT * u[0], lm.pivot[1] + eT * u[1], lm.pivot[2] + eT * u[2]];
  const [e0, , e2] = boardExtents({ ...world, length });
  const position: Vec3 = [pivot[0] - e0 / 2, pivot[1] - length, pivot[2] - e2 / 2];

  // Depths off the new board's own map (its pivot is P'): y is linear in ℓ with slope u_y.
  const nb: Board = { ...world, length, position };
  // A square-set line runs through the through CENTRE (the across term is anchored there, spec §3.1); a turned one at 0.
  const tc = square ? T / 2 : 0;
  const footDepth = (s: number) => -heightAt(nb, face, through, 0, s, tc) / uy;
  const topDepth = (s: number) => (heightAt(nb, face, through, length, s, tc) - ry) / uy;
  // The depth's slope across the through dimension (per inch from its min side): the foot's depth falls as y rises, the
  // top's grows. The rotation is the same on the new board (it depends on neither length nor position).
  const acrossOf = (slope: number): AngleCut['across'] =>
    (square && Math.abs(slope) > EPS ? { rise: Math.abs(slope), from: slope > 0 ? 'min' : 'max' } : undefined);
  const cut = (from: 'min' | 'max', id: string | undefined, d: (s: number) => number, slope: number): AngleCut => {
    const across = acrossOf(slope);
    return {
      id: id ?? nextId(), kind: 'miter', face: 'length', from, along: face, alongFrom: 'min', points: [[0, d(0)], [A, d(A)]],
      ...(across ? { across } : {}),
    };
  };

  const foot = world.angleCuts.find((c) => levelCutOf(c) === 'foot');
  const footNew = cut('min', foot?.id, footDepth, -gt / uy);
  const topNew = cut('max', topCut?.id, topDepth, gt / uy);
  // Recognised cuts are replaced in place, the first per end; any FURTHER recognised cut on that end (only a hand-edited
  // file has one) is removed, deliberately: an end holds one level cut, never a stack. New ones append.
  const out: AngleCut[] = [];
  let footDone = false;
  let topDone = false;
  for (const c of world.angleCuts) {
    const which = levelCutOf(c);
    if (which === 'foot') { if (!footDone) out.push(footNew); footDone = true; }
    else if (which === 'top') { if (!topDone) out.push(topNew); topDone = true; }
    else out.push(c);
  }
  if (!footDone) out.push(footNew);
  if (!topDone) out.push(topNew);
  return { length, position, angleCuts: out, holes };
}

/** Depth into the length of `c`'s line at station `s` measured from `along`'s MIN end, whichever end the cut stores
 *  stations from (a mirror flips `alongFrom`, never the line). */
export function depthFromMin(c: AngleCut, alongSize: number, s: number): number {
  return depthAt(c, c.alongFrom === 'min' ? s : alongSize - s);
}

/** The same end line within 1e-9: every flag but `alongFrom`, the depths at both ends read from one side, and the same
 *  `across` (square-set legs spec §3.3): both absent, or the same `from` and rise within 1e-9. `from` is compared as
 *  stored: with `rise > 0` it names the one side the depth grows from, so unlike `alongFrom` it has no second spelling. */
export function sameLevelLine(a: AngleCut, b: AngleCut, alongSize: number): boolean {
  return a.kind === b.kind && a.face === b.face && a.from === b.from && a.along === b.along
    && (a.across === undefined ? b.across === undefined
      : b.across !== undefined && a.across.from === b.across.from && Math.abs(a.across.rise - b.across.rise) <= EPS)
    && [0, alongSize].every((s) => Math.abs(depthFromMin(a, alongSize, s) - depthFromMin(b, alongSize, s)) <= EPS);
}

/**
 * Whether `levelPlan` would change nothing (1e-9): the length, the position and both level cuts as planned. False for a
 * part that does not lean (there is nothing levelled to keep) and for a refused plan. Task 8's stale note reads it.
 */
export function isLevelled(world: Board, units: Units): boolean {
  if (!world.lean || !leanMap(world)) return false;
  const plan = levelPlan(world, units);
  if (typeof plan === 'string') return false;
  if (Math.abs(plan.length - world.length) > EPS) return false;
  if (plan.position.some((v, i) => Math.abs(v - world.position[i]!) > EPS)) return false;
  if (plan.angleCuts.length !== world.angleCuts.length) return false;
  return plan.angleCuts.every((c, i) => {
    const cur = world.angleCuts[i]!;
    return c === cur || sameLevelLine(c, cur, world[cur.along]);
  });
}
