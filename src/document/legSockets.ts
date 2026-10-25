import type { AngleCut, Board, CutFrom, Dimension, HoleRow, RoundTenon, SloydDocument } from './types';
import type { Units } from '../units/length';
import type { Vec3 } from './frames';
import type { Point } from './cuts';
import type { V3 } from './angleCuts';
import { axisFrame, DIMENSION_ORDER } from './geometry';
import { leanMap, leans } from './lean';
import { levelFaces, overlapArea } from './leanContacts';
import { REST_AREA, TOUCH } from './checkTolerances';
import { fromWorld, toWorld } from './snapPoints';
import { holeInstances, holeRowValues, othersOf } from './holes';
import { holeFaults } from './holeFaults';
import { isTilted, withinTiltBound } from './holeTilt';
import { socketFaultWords } from './holeText';
import { displayNames, partAt, worldParts } from './tree';
import { mapWorld, storageKey } from './treeEdit';
import { isShaped, shapeMap } from './shapes';
import { nextId } from './ids';
import { isLevelled, levelPlan, roundUp, sameLevelLine } from './levelEnds';
import { shoulderAt, tenonAt, tenonFaults, tenonsOf, tenonStep } from './roundTenons';
import { legTenonFaulted } from './tenonText';

/**
 * Bore leg sockets (angled holes spec §5): the ONE decider. A seat's sockets copy each leaning leg's AXIS — the line
 * through the leg's pivot (`leanMap`) along its leaned length — into a through row of the seat, entering from the face
 * opposite the one the leg meets, tilted so the bore runs along the axis in the seat's own frame. Pure: the store writes
 * the plan through `mapWorld` (inv 46), so a turned, mirrored or shared seat is lowered like every hole edit.
 */

/** World comparisons: every number here comes through one `leanMap` and the placement, ~1e-15 of error (spec §5: 1e-9). */
const EPS = 1e-9;

/** Copy (verbatim, Global Constraints): a leg's socket no longer lies on its axis (a later lean edit, resize or move). */
export const socketStale = (leg: string) => `${leg}'s socket no longer follows its leg — Bore leg sockets again.`;
/** Copy (verbatim): the seat's copies (placements and Shape users) would store different sockets. */
export const socketsDisagree = (names: readonly string[]) =>
  `Its copies stand over different legs (${names.join(', ')}) — make them match, or make this part unique first.`;
/** Copy (verbatim): a socket with a hole fault (`socketFaultWords`) is not bored. */
export const socketFaulted = (leg: string, words: string) => `${leg}'s socket would ${words} — move the leg, or choose a smaller diameter.`;
/** Copy (verbatim, final review F1): the socket's slopes would pass the tilt bound (`withinTiltBound`), which the loader
 *  would drop; not bored. */
export const socketTooSteep = (leg: string) => `${leg}'s socket would tilt past 45° — reduce the leg's lean.`;
/** Copy (verbatim): the diameter is at or above the leg's smaller section dimension. */
export const socketTooWide = (leg: string) => `The socket must be narrower than ${leg}.`;

const idx = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: readonly number[], b: readonly number[]): V3 =>
  [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);
const unit = (a: readonly number[]): V3 => { const n = norm(a); return [a[0]! / n, a[1]! / n, a[2]! / n]; };
const point = (v: readonly number[]): Point => ({ length: v[0]!, width: v[1]!, thickness: v[2]! });
const sign = (f: CutFrom) => (f === 'min' ? 1 : -1);

/** A socket's entry: the seat dimension on world Y, from its upper side — world y max is the face dimension's max unless
 *  that axis is reversed (no turn or posture reverses world Y today, `axisFrame`; read through the frame all the same,
 *  inv 44). */
function entryOf(seat: Board): { face: Dimension; from: CutFrom } {
  const y = axisFrame(seat)[1]!;
  return { face: y.dim, from: y.reversed ? 'min' : 'max' };
}

/** A line in the world: a point on it and a unit direction. */
export interface WorldAxis { p: V3; u: V3 }

/**
 * ANY part's axis in the world (round tenons spec §5.1): the length's centre line through the part's placement and lean,
 * `u` (unit) pointing from the length's `min` end to its `max` end. A leaning part: through its pivot (`leanMap`), along
 * its leaned length — exactly the numbers `legAxis` always used, so Bore leg sockets' rows are unchanged. An unleaned part:
 * through its `max` end's section centre (`toWorld`), along the world axis showing its length, signed by that axis's
 * reversal (inv 44: a turned rung runs max → min along −X).
 */
export function partAxis(b: Board): WorldAxis {
  const frame = axisFrame(b);
  const k = frame.findIndex((a) => a.dim === 'length');
  const e: V3 = [0, 0, 0];
  e[k] = frame[k]!.reversed ? -1 : 1;
  const m = leanMap(b);
  if (m) return { p: m.pivot, u: unit(m.applyDir(e)) };
  return { p: toWorld(b, { length: b.length, width: b.width / 2, thickness: b.thickness / 2 }), u: e };
}

/** A leaning leg's axis in the world: `partAxis`, pointing UP. Null for a part that does not lean (Bore leg sockets only
 *  bores for leaning legs). */
function legAxis(leg: Board): WorldAxis | null {
  if (!leans(leg)) return null;
  const { p, u } = partAxis(leg);
  return { p, u: u[1] < 0 ? [0 - u[0], 0 - u[1], 0 - u[2]] : u };
}

/**
 * The leaning parts standing under `seat` (spec §5): a leaning part with an up-facing level face (`levelFaces`, inv 57,
 * level to LEVEL_EPS) within `TOUCH` in height of one of `seat`'s down-facing level faces, overlapping it in plan by more
 * than `REST_AREA` — the resting rule the design checks use (`designCheck`'s `rests`). The height gap is `TOUCH`, not
 * LEVEL_EPS (a bound on a face's NORMAL, never a gap): a lean edit then Level the ends keeps the old top cut's
 * reference, so the re-levelled top lands a hair off the seat (0.0013" for rake 8° → 10° on the stool), and the leg must
 * still be found, noted stale and re-bored. `world` is `worldParts`, so the legs and the seat may sit in
 * different assemblies. World order.
 *
 * OR, a TENONED leg (round tenons spec §6.3, amended T9a): its top tenon in the seat (`tenonInSeat`, the ONE predicate
 * `staleSocketOf` shares) and its top levelled (`isLevelled`, here only: `staleSocketOf`'s callers have already found the
 * leg through this function). Structural: being found grants no support (support is the joint's, `tenonJoints`). `units`
 * is the project's: `isLevelled` rounds as Level the ends does.
 */
export function legsUnder(world: readonly Board[], seat: Board, units: Units): Board[] {
  if (leans(seat)) return [];
  const faces = levelFaces(seat);
  const downs = faces.filter((f) => !f.up);
  if (downs.length === 0) return [];
  const ups = faces.filter((f) => f.up);
  return world.filter((w) => w.id !== seat.id && leans(w) && (levelFaces(w).some((u) => u.up
    && downs.some((d) => Math.abs(u.y - d.y) <= TOUCH && overlapArea(u.poly, d.poly) > REST_AREA))
    || (tenonInSeat(w, downs, ups) && isLevelled(w, units))));
}

type Face = ReturnType<typeof levelFaces>[number];

/** The world height band of a seat's stock over its down face `d`: from `d` to the up faces above it, inclusive to TOUCH
 *  both ways (round tenons spec §6.3), met by the world segment from height `lo` to `hi`. */
function meetsStock(lo: number, hi: number, d: Face, ups: readonly Face[]): boolean {
  return hi >= d.y - TOUCH && ups.some((u) => u.y > d.y && lo <= u.y + TOUCH);
}

/** The world point on a part's axis at tenon `t`'s shoulder (`t.length` 0: the end's centre, where the axis meets that
 *  end's face, square or mitered). */
function centreAt(b: Board, t: Pick<RoundTenon, 'end' | 'length'>): V3 {
  return toWorld(b, { length: shoulderAt(b, t), width: b.width / 2, thickness: b.thickness / 2 });
}

/**
 * Spec §6.3's tenoned rule (amended T9a), the ONE predicate `legsUnder` and `staleSocketOf` share: a leaning part whose
 * TOP end carries a tenon whose CENTRE SEGMENT — shoulder centre to tip centre, in the world — meets the seat's stock
 * over one of its down-facing level faces (between that face and an up-facing one above it, inclusive to `TOUCH`), and
 * whose axis meets that down face's plane inside its outline. Not the tip alone: a seat lowered under fitted legs leaves
 * the tips above its top, and the leg must still be found, its sockets replaced in place and the leg shortened (shared
 * with `staleSocketOf`, or the re-fit would bore a second socket beside each old one and refuse). Known limit: a seat
 * RAISED clear of the tips (a gap above them) is not found, as an untenoned leg's is not. `isLevelled` is not part of
 * it (it needs the units); `legsUnder` adds it.
 */
function tenonInSeat(w: Board, downs: readonly Face[], ups: readonly Face[]): boolean {
  const t = tenonAt(w, 'max');
  if (!t) return false;
  const ax = legAxis(w);
  if (!ax) return false;
  const a = centreAt(w, t)[1];
  const b = centreAt(w, { end: 'max', length: 0 })[1];
  return downs.some((d) => {
    if (!meetsStock(Math.min(a, b), Math.max(a, b), d, ups)) return false;
    const k = (d.y - ax.p[1]) / ax.u[1];
    return inConvex(d.poly, [ax.p[0] + k * ax.u[0], ax.p[2] + k * ax.u[2]]);
  });
}

/**
 * The socket `leg` needs in `seat` (spec §5), a single THROUGH bore:
 * - entering from the seat's face OPPOSITE the one the leg meets: the face dimension on world Y, from its upper side;
 * - its mouth centre where the leg's axis meets that face (`fromWorld`, exact on an unleaned seat);
 * - its bit along the axis, read into the seat's frame by mapping two points, scaled so the axial component is ±1
 *   (`bitVector`'s form), the lateral components stored as flag-relative slopes;
 * - `along` as the presets choose it (`othersOf`: the longer, length on a tie), so every copy stores the same layout;
 *   `alongFrom` / `acrossFrom` the nearer end / side (the mouth's centre half, `min` on the exact middle).
 * A zero slope is omitted (Global Constraints). The leg must lean (`legsUnder` only returns leaning parts).
 */
export function socketRow(seat: Board, leg: Board, diameter: number): Omit<HoleRow, 'id'> {
  const ax = legAxis(leg);
  if (!ax) throw new Error(`socketRow: ${leg.id} does not lean`);
  const { face, from } = entryOf(seat);
  const top = seat.position[1] + seat[face];
  const t = (top - ax.p[1]) / ax.u[1];
  const at: V3 = [ax.p[0] + t * ax.u[0], top, ax.p[2] + t * ax.u[2]];
  const local = fromWorld(seat, at);
  const below = fromWorld(seat, sub(at, ax.u));
  const d: V3 = [below.length - local.length, below.width - local.width, below.thickness - local.thickness];
  const s = sign(from) / d[idx(face)]!;
  const [along, across] = othersOf(seat, face);
  const alongFrom: CutFrom = local[along] <= seat[along] / 2 ? 'min' : 'max';
  const acrossFrom: CutFrom = local[across] <= seat[across] / 2 ? 'min' : 'max';
  // m[along] = sign(alongFrom) · tiltAlong (bitVector), so the slope is that product again; `+ 0` keeps a zero plus.
  const tiltAlong = sign(alongFrom) * s * d[idx(along)]! + 0;
  const tiltAcross = sign(acrossFrom) * s * d[idx(across)]! + 0;
  return {
    face, from, diameter, depth: 'through', along, alongFrom,
    station: alongFrom === 'min' ? local[along] : seat[along] - local[along],
    count: 1, pitch: 0, acrossFrom,
    inset: acrossFrom === 'min' ? local[across] : seat[across] - local[across],
    ...(tiltAlong !== 0 ? { tiltAlong } : {}),
    ...(tiltAcross !== 0 ? { tiltAcross } : {}),
  };
}

/** A single bore's mouth centre and far centre (the exit, through; the bottom disc's centre, blind) in the world. */
export function boreEnds(seat: Board, row: HoleRow): [V3, V3] {
  const h = holeInstances(seat, row)[0]!;
  const far = [0, 1, 2].map((i) => h.centre[i]! + h.reach * h.bit[i]!);
  return [toWorld(seat, point(h.centre)), toWorld(seat, point(far))];
}

/** `holder`'s bore `row` (its FIRST hole: a caller asks this of a single bore) lies along the world line `axis`: its mouth
 *  centre on the line and its bit parallel to it (either way), both to 1e-9 (spec §5; round tenons spec §5.1). The
 *  coaxial test ONLY — through or blind, any face: `isSocketOf` and the tenon joint (`seatedIn`) add their own rules. */
export function boreAlongAxis(holder: Board, row: HoleRow, axis: WorldAxis): boolean {
  const [m, f] = boreEnds(holder, row);
  return norm(cross(sub(m, axis.p), axis.u)) <= EPS && norm(cross(unit(sub(f, m)), axis.u)) <= EPS;
}

/** Whether `row` is `leg`'s socket: a single THROUGH bore entering where `socketRow` enters (the seat's top) whose world
 *  axis IS the leg's axis (`boreAlongAxis`, spec §5). A blind bore along the same axis is not the socket. */
export function isSocketOf(seat: Board, row: HoleRow, leg: Board): boolean {
  const ax = legAxis(leg);
  if (!ax || row.count !== 1 || row.depth !== 'through') return false;
  const entry = entryOf(seat);
  if (row.face !== entry.face || row.from !== entry.from) return false;
  return boreAlongAxis(seat, row, ax);
}

/** Whether plan point `q` is inside (or on) convex polygon `poly`, either winding. */
function inConvex(poly: readonly [number, number][], q: readonly [number, number]): boolean {
  let pos = false;
  let neg = false;
  for (let k = 0; k < poly.length; k += 1) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    const c = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    if (c > EPS) pos = true;
    else if (c < -EPS) neg = true;
  }
  return !(pos && neg);
}

/**
 * `leg`'s STALE socket in `seat` (spec §5), or null: a single TILTED THROUGH bore entering from the seat's top (what
 * `socketRow` writes, `isSocketOf`'s entry: a user's blind or underside bore, or own square clearance hole over a leg top,
 * is never taken for a socket; final review M4) whose axis LINE passes through one of the leg's up-facing level faces —
 * at that face's height, inside its plan polygon — that `legsUnder` finds it by: for a leg with a top tenon, any of them
 * when `tenonInSeat` holds (the ONE predicate both share, T9a: the tenon's centre segment in the seat's stock), none
 * otherwise; for any other leg, one in the resting band (within TOUCH in height of one of the seat's down-facing level
 * faces). The line, not the mouth-to-exit segment: a top up to
 * TOUCH BELOW the seat's bottom is under the seat too (one band for both; Task 10 review, fix 1). The structural test of
 * "the socket this leg once had": a later lean edit, resize or move left it pointing the old way. Null when some row
 * already IS the leg's socket (`isSocketOf`; the plan skips that leg). `skip` names rows already claimed (another leg's
 * match or replacement).
 */
export function staleSocketOf(seat: Board, leg: Board, skip: ReadonlySet<string> = new Set()): HoleRow | null {
  if (seat.holes.some((r) => !skip.has(r.id) && isSocketOf(seat, r, leg))) return null;
  const faces = levelFaces(seat);
  const downs = faces.filter((f) => !f.up);
  const seatUps = faces.filter((f) => f.up);
  // A tenoned leg's top is inside the seat (round tenons spec §6.3, T9a): `legsUnder`'s own predicate, then its up faces
  // (its tip's). Any other leg's, as before: within TOUCH of the underside.
  const ups = tenonAt(leg, 'max') !== undefined
    ? (tenonInSeat(leg, downs, seatUps) ? levelFaces(leg).filter((f) => f.up) : [])
    : levelFaces(leg).filter((f) => f.up && downs.some((d) => Math.abs(f.y - d.y) <= TOUCH));
  if (ups.length === 0) return null;
  const entry = entryOf(seat);
  for (const row of seat.holes) {
    // Only a row socketRow could have written (final review M4, the T10d precedent): a tilted single THROUGH bore entering
    // from the seat's top, as `isSocketOf` requires. A user's blind or underside bore along the old line is left alone.
    if (row.count !== 1 || row.depth !== 'through' || row.face !== entry.face || row.from !== entry.from) continue;
    if (!isTilted(row) || skip.has(row.id)) continue;
    const [m, f] = boreEnds(seat, row);
    const dy = f[1] - m[1];
    if (Math.abs(dy) <= EPS) continue;
    for (const face of ups) {
      const t = (face.y - m[1]) / dy;
      if (inConvex(face.poly, [m[0] + t * (f[0] - m[0]), m[2] + t * (f[2] - m[2])])) return row;
    }
  }
  return null;
}

/** One copy's outcome: its new world rows (placeholder ids for new sockets), the legs it bores, its first fault, and every
 *  leg that HAS its socket after the plan (bored now, or found already bored) with that row: the legs Tenon the legs fits. */
interface CopyPlan { rows: HoleRow[]; bored: Board[]; tooWide: Board | null; faults: string[]; socketed: { leg: Board; row: HoleRow }[] }

/** A placeholder id for the k-th new socket while the copies are compared (never stored: the final write mints ids). */
const trialId = (k: number) => `__socket${k}`;

/**
 * One copy's sockets, in its own world frame: per leg in world order, skipped when a row already is its socket,
 * otherwise its socket replaces the leg's stale socket IN PLACE (the id kept) or is appended. Each socket is judged by
 * `holeFaults` on the seat holding every row accepted so far; a faulted one is not added, and named (one sentence each).
 */
function copyPlan(world: readonly Board[], seat: Board, diameter: number, names: ReadonlyMap<string, string>, units: Units): CopyPlan {
  let rows = seat.holes;
  const claimed = new Set<string>();
  const bored: Board[] = [];
  const socketed: { leg: Board; row: HoleRow }[] = [];
  let tooWide: Board | null = null;
  const faulted: string[] = [];
  let k = 0;
  for (const leg of legsUnder(world, seat, units)) {
    const mine = seat.holes.find((r) => !claimed.has(r.id) && isSocketOf(seat, r, leg));
    if (mine) { claimed.add(mine.id); socketed.push({ leg, row: mine }); continue; }
    if (diameter >= Math.min(leg.width, leg.thickness)) { tooWide ??= leg; continue; }
    const stale = staleSocketOf(seat, leg, claimed);
    const row: HoleRow = { ...socketRow(seat, leg, diameter), id: stale ? stale.id : trialId(k++) };
    // Past the ONE tilt bound the loader would drop the row (final review F1): a faulted socket, named, nothing written.
    if (!withinTiltBound(row.tiltAlong ?? 0, row.tiltAcross ?? 0)) {
      faulted.push(socketTooSteep(names.get(leg.id) ?? leg.name));
      continue;
    }
    const trial = stale ? rows.map((r) => (r.id === stale.id ? row : r)) : [...rows, row];
    const faults = holeFaults({ ...seat, holes: trial }, row);
    if (faults.length > 0) {
      faulted.push(socketFaulted(names.get(leg.id) ?? leg.name, socketFaultWords(faults[0]!)));
      continue;
    }
    if (stale) claimed.add(stale.id);
    rows = trial;
    bored.push(leg);
    socketed.push({ leg, row });
  }
  return { rows, bored, tooWide, faults: faulted, socketed };
}

/** The STORED rows a copy's world rows would write (`mapWorld`, so lowered through every turn and mirror on its path and
 *  through a mirrored Shape user's own flag, inv 46): the Shape's, or the stored part's. */
function storedRows(doc: SloydDocument, copy: Board, rows: HoleRow[]): readonly HoleRow[] {
  const d = mapWorld(doc, (w) => w.map((b) => (b.id === copy.id ? { ...b, holes: rows } : b)));
  const stored = partAt(d, copy.id)!;
  return isShaped(stored) ? shapeMap(d).get(stored.shape)!.holes : stored.holes;
}

/** A row in a flag-free form for comparison: stations, insets and slopes measured from `min`, so two copies that chose
 *  the other end for a socket on the seat's exact middle (float noise) still compare. */
function canonical(r: HoleRow, size: Pick<Board, Dimension>): (string | number)[] {
  const across = DIMENSION_ORDER.find((x) => x !== r.face && x !== r.along)!;
  const a = r.alongFrom === 'max';
  const c = r.acrossFrom === 'max';
  return holeRowValues({
    ...r, alongFrom: 'min', acrossFrom: 'min',
    station: a ? size[r.along] - r.station : r.station, inset: c ? size[across] - r.inset : r.inset,
    ...(r.tiltAlong !== undefined ? { tiltAlong: a ? 0 - r.tiltAlong : r.tiltAlong } : {}),
    ...(r.tiltAcross !== undefined ? { tiltAcross: c ? 0 - r.tiltAcross : r.tiltAcross } : {}),
  });
}

const nearValues = (x: (string | number)[], y: (string | number)[]) => x.length === y.length
  && x.every((v, i) => (typeof v === 'number' && typeof y[i] === 'number' ? Math.abs(v - (y[i] as number)) <= EPS : v === y[i]));

/** Two stored row sets agree: equal as a MULTISET of canonical rows, every number to 1e-9 (ids ignored: a new socket's
 *  id is a placeholder until the write). */
function sameRowSet(a: readonly HoleRow[], b: readonly HoleRow[], size: Pick<Board, Dimension>): boolean {
  if (a.length !== b.length) return false;
  const left = b.map((r) => canonical(r, size));
  return a.every((r) => {
    const v = canonical(r, size);
    const i = left.findIndex((w) => nearValues(v, w));
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

// ---- Tenon the legs (round tenons spec §6) ---------------------------------------------------------------------------

/** A leg's fitted top (spec §6.1), in its WORLD frame: Level the ends' fields with the top through the seat's top face,
 *  and the leg's tenons with the top one fitted. */
export interface LegTenonPlan { length: number; position: Vec3; angleCuts: AngleCut[]; holes: HoleRow[]; tenons: RoundTenon[] }

/** The fields a leg's patch may carry: the plan's, or a Shape mate's own `position` alone. */
export type LegPatch = Partial<LegTenonPlan>;

/**
 * The fit, unjudged (spec §6.1, §6.4): the top through `levelPlan(leg, units, { topAt })`, `topAt` the seat's top face, so
 * the tip's level plane is exact and the length change (either way: it sets, not adds) rounds UP to the drag grid; the
 * shoulder `ℓs = min over the 4 section corners of (y_under − c_k(0)) / u_y` on the NEW board (heights are linear in ℓ with
 * slope u_y), where the highest corner just clears the underside; the tenon from there to the tip's centre, its length
 * rounded UP to `tenonStep` (Level the ends' `roundUp`), so the shoulder only drops. The leg's `max` tenon is replaced
 * (its id kept), or a new one; its `min` tenon is never touched. Or Level the ends' refusal (an end already cut another
 * way, a hole the new length would cut away).
 */
function fitTop(seat: Board, leg: Board, diameter: number, units: Units): LegTenonPlan | string {
  const { face } = entryOf(seat);
  const under = seat.position[1];
  const lv = levelPlan(leg, units, { topAt: under + seat[face] });
  if (typeof lv === 'string') return lv;
  const nb: Board = { ...leg, length: lv.length, position: lv.position, angleCuts: lv.angleCuts, holes: lv.holes };
  const uy = partAxis(nb).u[1];
  const ls = Math.min(...[[0, 0], [nb.width, 0], [0, nb.thickness], [nb.width, nb.thickness]]
    .map(([w, t]) => (under - toWorld(nb, { length: 0, width: w!, thickness: t! })[1]) / uy));
  const tip = shoulderAt(nb, { end: 'max', length: 0 });
  const old = tenonAt(leg, 'max');
  const top: RoundTenon = { id: old?.id ?? nextId(), end: 'max', diameter, length: roundUp(tip - ls, tenonStep(units)) };
  return { ...lv, tenons: [...tenonsOf(leg).filter((t) => t.end !== 'max'), top] };
}

/** The fitted top tenon's faults, judged on the fitted board (`tenonFaults`, THE decider). */
function fitFaults(leg: Board, plan: LegTenonPlan) {
  const b: Board = { ...leg, ...plan };
  return tenonFaults(b, tenonAt(b, 'max')!);
}

/**
 * `leg`'s fitted top tenon under `seat` (round tenons spec §6.1, §6.4): `fitTop`'s plan, judged by `tenonFaults` before it
 * is returned — a fault gives one sentence naming the leg (`<name>'s tenon: <fault>`, `legTenonFaulted`) — or Level the
 * ends' refusal. `diameter` is the socket's. Pure; `socketPlan` judges every copy and writes nothing itself.
 */
export function legTenonPlan(seat: Board, leg: Board, diameter: number, units: Units, name = leg.name): LegTenonPlan | string {
  const plan = fitTop(seat, leg, diameter, units);
  if (typeof plan === 'string') return plan;
  const faults = fitFaults(leg, plan);
  return faults.length > 0 ? legTenonFaulted(name, faults[0]!) : plan;
}

const near = (a: number, b: number) => Math.abs(a - b) <= EPS;
const sameCuts = (a: readonly AngleCut[], b: readonly AngleCut[], size: Pick<Board, Dimension>) => a.length === b.length
  && a.every((c, i) => { const d = b[i]!; return c === d || sameLevelLine(c, d, size[c.along]) || JSON.stringify({ ...c, id: '' }) === JSON.stringify({ ...d, id: '' }); });
const sameTenons = (a: readonly RoundTenon[], b: readonly RoundTenon[]) => a.length === b.length
  && a.every((t, i) => { const u = b[i]!; return t.end === u.end && near(t.diameter, u.diameter) && near(t.length, u.length); });

/** The plan would change nothing on world part `w` (1e-9; inv 4: a second press pushes no entry). */
function changesNothing(w: Board, p: LegTenonPlan): boolean {
  return near(p.length, w.length) && p.position.every((v, i) => near(v, w.position[i]!))
    && sameCuts(p.angleCuts, w.angleCuts, w) && (p.holes === w.holes || sameRowSet(p.holes, w.holes, w))
    && sameTenons(p.tenons, tenonsOf(w)) && p.tenons.every((t, i) => t.id === tenonsOf(w)[i]!.id);
}

/** What world part `w`'s plan would STORE (`mapWorld`, lowered through every turn and mirror on its path and a mirrored
 *  Shape user's own flag, inv 46): the Shape's fields, or the stored part's; and the stored part's own position (a Shape
 *  user's too: its own field), with its storage target, since placements of one stored part share it. */
function storedFit(doc: SloydDocument, w: Board, p: LegTenonPlan): StoredFit {
  const d = mapWorld(doc, (ws) => ws.map((b) => (b.id === w.id ? { ...b, ...p } : b)));
  const stored = partAt(d, w.id)!;
  const key = storageKey(doc, w.id) ?? w.id;
  return { b: isShaped(stored) ? shapeMap(d).get(stored.shape)! : stored as Board, key, position: stored.position };
}

/** The shared fields a fit stores (a Shape's, or a stored part's), and the stored part's own position and storage key. */
interface StoredFit { b: Pick<Board, Dimension | 'angleCuts' | 'holes' | 'tenons'>; key: string; position: Vec3 }

/** Two copies' fits agree in the shared frame, to 1e-9: length, end cuts, holes and tenons (ids ignored), and, for
 *  placements of ONE stored part (a plain part or a Shape user: the same storage key), the stored position. Reachable for
 *  a Shape user only in principle (two placements k·u_y/16 apart in height under seats at one height, on a first press;
 *  Task 9 review, Minor 2), but only one placement's position is written, so it is compared like a plain part's. */
function sameStoredFit(x: StoredFit, y: StoredFit): boolean {
  const a = x.b;
  const b = y.b;
  return near(a.length, b.length) && sameCuts(a.angleCuts, b.angleCuts, a) && sameRowSet(a.holes, b.holes, a)
    && sameTenons(tenonsOf(a), tenonsOf(b)) && (x.key !== y.key || x.position.every((v, i) => near(v, y.position[i]!)));
}

/**
 * Tenon the legs over every copy's socketed legs (spec §6.1, §6.2): each leg's fit against the copy it stands under; then,
 * per storage group (a Shape's users, or one stored part's placements, since `length`, `angleCuts`, `holes` and `tenons`
 * are stored once), EVERY member is judged against its OWN seat — a member under no seat counts as disagreeing — and the
 * group is written only when every member's fit stores the same thing. A group whose fit faults is named (each of its
 * legs under THIS seat) and not written; a group its fit leaves unchanged is not written (inv 4). The write is levelEnds'
 * shape: the shared fields once, through the group's first leg; each other storage target its OWN position.
 */
function fitLegs(doc: SloydDocument, world: readonly Board[], copies: readonly Board[], plans: readonly CopyPlan[], seat: Board,
  names: ReadonlyMap<string, string>): { legs: { id: string; patch: LegPatch }[]; faults: string[] } | string {
  const units = doc.units;
  const name = (b: Board) => names.get(b.id) ?? b.name;
  const fits = new Map<string, LegTenonPlan>();
  const order: Board[] = [];
  for (let i = 0; i < copies.length; i += 1) {
    for (const { leg, row } of plans[i]!.socketed) {
      if (fits.has(leg.id)) continue;
      const p = fitTop(copies[i]!, leg, row.diameter, units);
      if (typeof p === 'string') return p;
      fits.set(leg.id, p);
      order.push(leg);
    }
  }
  const mine = new Set(plans[copies.indexOf(seat)]!.socketed.map((x) => x.leg.id));
  const groupOf = (b: Board) => (b.shape !== undefined ? `shape:${b.shape}` : `part:${storageKey(doc, b.id) ?? b.id}`);
  const done = new Set<string>();
  const legs: { id: string; patch: LegPatch }[] = [];
  const faults: string[] = [];
  for (const rep of order) {
    const g = groupOf(rep);
    if (done.has(g)) continue;
    done.add(g);
    const users = world.filter((w) => groupOf(w) === g);
    const repFit = fits.get(rep.id)!;
    const userFits = new Map<string, LegTenonPlan>();
    const off: Board[] = [];
    const ref = storedFit(doc, rep, repFit);
    // Each storage target's first fit: a later placement of it must store the same position (`sameStoredFit`'s key rule).
    const byKey = new Map<string, StoredFit>([[ref.key, ref]]);
    for (const u of users) {
      let p = fits.get(u.id);
      if (!p) {
        // Not under any copy of this seat: judged against the seat it stands under, with this tenon's diameter.
        const own = world.find((s) => s.id !== u.id && !leans(s) && legsUnder(world, s, units).some((x) => x.id === u.id));
        const q = own ? fitTop(own, u, tenonAt({ tenons: repFit.tenons }, 'max')!.diameter, units) : null;
        if (typeof q === 'string') return q;
        if (!q) { off.push(u); continue; }
        p = q;
      }
      if (u !== rep) {
        const sf = storedFit(doc, u, p);
        const first = byKey.get(sf.key);
        if (!sameStoredFit(ref, sf) || (first && !sameStoredFit(first, sf))) { off.push(u); continue; }
        if (!first) byKey.set(sf.key, sf);
      }
      userFits.set(u.id, p);
    }
    if (off.length > 0) return socketsDisagree([...new Set([rep, ...off].map(name))]);
    // Judged ONCE, on the representative's fit, and the sentence given to every member under THIS seat: every member's fit
    // stores the same fields (just checked, to 1e-9), and a tenon's faults read only board-local fields (its zone, the end
    // cuts, the part's features; never the pose), so each member's own fit would fault alike (Task 9 review, Minor 5).
    const f = fitFaults(rep, repFit);
    if (f.length > 0) {
      const named = users.filter((u) => mine.has(u.id));
      for (const u of named.length > 0 ? named : [rep]) faults.push(legTenonFaulted(name(u), f[0]!));
      continue;
    }
    if (users.every((u) => changesNothing(u, userFits.get(u.id)!))) continue;
    // One edit per storage target (placements of one stored part share one), the representative's first.
    const seen = new Set<string>([storageKey(doc, rep.id) ?? rep.id]);
    legs.push({ id: rep.id, patch: repFit });
    for (const u of users) {
      const k = storageKey(doc, u.id) ?? u.id;
      if (seen.has(k)) continue;
      seen.add(k);
      legs.push({ id: u.id, patch: { position: userFits.get(u.id)!.position } });
    }
  }
  // World order, every leg's sentence (one each).
  return { legs, faults };
}

/**
 * Bore leg sockets on the world part `seatId` (spec §5): the seat's new WORLD rows, written by the store through
 * `mapWorld`, or a refusal sentence. Every copy of the seat — each Shape user, or each placement of its stored part, as
 * `levelEnds` collects them — plans its OWN legs (`copyPlan`); the stored row sets they would write must agree, or the
 * action refuses naming the copies, since the rows are stored once and a socket bored from one copy lands in all.
 * Refusals, in the spec's order: a diameter at or above a leg's smaller section (`socketTooWide`); copies that disagree
 * (`socketsDisagree`); and, when no socket can be bored, the faulted ones (`socketFaulted`, or `socketTooSteep` past the
 * tilt bound; one sentence per leg). A
 * faulted socket among others is not added and the rest are bored (§5: "The others are bored"): the plan then carries
 * those sentences as `note`.
 * `holes` is the seat's own array, unchanged, when every leg already has its socket (the store pushes no entry). New
 * sockets get fresh ids; a replaced stale socket keeps its id.
 *
 * `tenonLegs` (round tenons spec §6, the checkbox): every leg that has its socket after the plan also gets its top tenon
 * fitted (`fitLegs`), as `legs` — the WORLD patches the store writes in the same `mapWorld` edit. Refused, before anything,
 * on Level the ends' refusal for a leg, or when a leg's copies (Shape users, placements) would store different tenons or
 * lengths (`socketsDisagree`, naming them). A leg whose tenon would fault is named in `note` (`<leg>'s tenon: …`) and not
 * patched; its socket is still bored. Off, no leg is touched and `legs` is absent: today's plan.
 */
export function socketPlan(doc: SloydDocument, seatId: string, diameter: number, tenonLegs = false):
  { holes: HoleRow[]; legs?: { id: string; patch: LegPatch }[]; note?: string } | string {
  const world = worldParts(doc);
  const seat = world.find((b) => b.id === seatId);
  if (!seat || leans(seat)) return { holes: seat?.holes ?? [] };
  const names = displayNames(doc);
  const key = storageKey(doc, seatId);
  const copies = world.filter((w) => (seat.shape !== undefined ? w.shape === seat.shape : storageKey(doc, w.id) === key));
  const plans = copies.map((c) => copyPlan(world, c, diameter, names, doc.units));
  const wide = plans.find((p) => p.tooWide)?.tooWide;
  if (wide) return socketTooWide(names.get(wide.id) ?? wide.name);
  const own = plans[copies.indexOf(seat)]!;
  const ref = storedRows(doc, seat, own.rows);
  const off = copies.filter((c, i) => c !== seat && !sameRowSet(ref, storedRows(doc, c, plans[i]!.rows), seat));
  if (off.length > 0) return socketsDisagree([...new Set([seat, ...off].map((c) => names.get(c.id) ?? c.name))]);
  const fitted = tenonLegs ? fitLegs(doc, world, copies, plans, seat, names) : null;
  if (typeof fitted === 'string') return fitted;
  // Every faulted leg is named, one sentence each, in world order: the sockets', then the tenons'.
  const sentences = [...own.faults, ...(fitted?.faults ?? [])];
  const note = sentences.length > 0 ? sentences.join(' ') : undefined;
  const legs = fitted ? { legs: fitted.legs } : {};
  if (own.bored.length === 0) {
    if (!fitted || fitted.legs.length === 0) return note ?? { holes: seat.holes, ...legs };
    return note ? { holes: seat.holes, ...legs, note } : { holes: seat.holes, ...legs };
  }
  const holes = own.rows.map((r) => (r.id.startsWith('__socket') ? { ...r, id: nextId() } : r));
  return note ? { holes, ...legs, note } : { holes, ...legs };
}
