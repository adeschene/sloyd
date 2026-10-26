import type { Board, HoleRow, RoundTenon, SloydDocument } from './types';
import type { Units } from '../units/length';
import type { V3 } from './angleCuts';
import { DEFAULT_MATERIAL } from './types';
import { snapStep, snapToGrid } from './geometry';
import { createBoard } from './document';
import { nextId } from './ids';
import { uniqueName } from './names';
import { mm } from './holes';
import { leans, leanTwist } from './lean';
import { holeFaults, type HoleFaultKind } from './holeFaults';
import { socketFaultWords } from './holeText';
import { worldBodies } from './drawing';
import { toWorld } from './snapPoints';
import { boreAlongAxis, boreEnds, faceCrossing, partAxis, rungEntryOf, rungSocketRow, socketTooSteep, type WorldAxis } from './legSockets';
import { shoulderAt, tenonFaults, tenonStep, withTenons } from './roundTenons';
import { tenonFaultText } from './tenonText';
import { seatedIn } from './tenonJoints';
import { TOUCH } from './checkTolerances';
import { containerAt, displayNames, instancesOn, parentPath, worldParts } from './tree';
import { mapWorld, storageKey } from './treeEdit';
import {
  STRETCHER_CONTAINERS, STRETCHER_NOT_SQUARE, stretcherDifferentSocket, stretcherLinkNote, stretcherMirrored,
  stretcherOutOfReach, stretcherSocketFaulted, stretcherTurnedLeg,
} from './stretcherText';

/**
 * Stretchers (splayed legs chunk 3, fu 438; stretchers spec §3, §6.1): a level rung between two upright legs at a typed
 * height, a round tenon on each end, each seated in a blind socket bored along the rung's exact axis into its leg. Nothing
 * new is stored: the rung is an ordinary flat part with two `RoundTenon`s, its sockets ordinary single-hole `HoleRow`s. Pure;
 * the store writes the plan (the rung into the legs' container, each leg's holes through `mapWorld`, inv 46).
 */

/** World comparisons (Global Constraints): every number comes through one `partAxis` and the placement, ~1e-15. */
const EPS = 1e-9;
/** The two axis points must differ in exactly one of X and Z by more than this (spec §3.1). */
const SQUARE_EPS = 1e-6;

/** Defaults (Global Constraints): the rung size, the tenon diameter and the default height's stagger, per the units. */
export const RUNG_SIZE = { imperial: 1, metric: mm(25) } as const;
export const RUNG_TENON = { imperial: 5 / 8, metric: mm(16) } as const;
export const RUNG_STAGGER = { imperial: 1.5, metric: mm(40) } as const;
const metric = (u: Units) => u.display === 'metric-mm';
export const rungSize = (u: Units) => (metric(u) ? RUNG_SIZE.metric : RUNG_SIZE.imperial);
export const rungTenon = (u: Units) => (metric(u) ? RUNG_TENON.metric : RUNG_TENON.imperial);

/** `v` rounded DOWN to the drag grid (`snapStep`; spec §3.3), with `roundUp`'s tolerance so a value a hair under a grid
 *  point keeps it. Metric as `k / 25.4` (snapToGrid's form, so the stored length is what a typed `k` mm gives). */
function floorToGrid(v: number, units: Units): number {
  return metric(units) ? Math.floor(v * 25.4 + EPS) / 25.4 : Math.floor(v / snapStep(units) + EPS) * snapStep(units);
}

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const along = (p: readonly number[], w: readonly number[], s: number): V3 => [p[0]! + s * w[0]!, p[1]! + s * w[1]!, p[2]! + s * w[2]!];

/** The world points where `leg`'s axis meets its length's two end faces (at the centre: square or mitered, `shoulderAt`
 *  with a zero length), `min` end first. */
function axisEnds(leg: Board): [V3, V3] {
  const at = (end: RoundTenon['end']) =>
    toWorld(leg, { length: shoulderAt(leg, { end, length: 0 }), width: leg.width / 2, thickness: leg.thickness / 2 });
  return [at('min'), at('max')];
}

/** A part's top height: its axis's highest world Y (Global Constraints' default height). */
export function axisTop(leg: Board): number {
  const [a, b] = axisEnds(leg);
  return Math.max(a[1], b[1]);
}

/** Where `leg`'s axis (`partAxis`) crosses `y = h`, or null when `h` is not strictly between the axis's lowest and
 *  highest world Y (spec §3.1). */
function axisAt(leg: Board, h: number): V3 | null {
  const [a, b] = axisEnds(leg);
  if (!(h > Math.min(a[1], b[1]) + EPS && h < Math.max(a[1], b[1]) - EPS)) return null;
  const { p, u } = partAxis(leg);
  const t = (h - p[1]) / u[1];
  return [p[0] + t * u[0], h, p[2] + t * u[2]];
}

/** A rung's axis (spec §3.1): from leg `a`'s axis point `p0` to leg `b`'s `p1`, both at `y = h`, EXACTLY along world axis
 *  `axis` (X 0, Z 2) — the cross coordinate the two points' midpoint. */
export interface RungLine { p0: V3; p1: V3; axis: 0 | 2 }

/**
 * The rung's axis between legs `a` and `b` at height `h` (spec §3.1): the points where the legs' axes (`partAxis`) cross
 * `y = h`, which must differ in exactly one of X and Z (to 1e-6), made exactly axis-aligned (the cross coordinate their
 * midpoint, Y = h), so both sockets are bored along one exact line and the joints seat at 1e-9 by construction. Refusals:
 * a leg whose axis does not reach `h` (strictly inside, `stretcherOutOfReach`, named by `names` or the part's own name),
 * then the not-square sentence.
 */
export function rungLine(a: Board, b: Board, h: number, names: readonly [string, string] = [a.name, b.name]): RungLine | string {
  const pa = axisAt(a, h);
  if (!pa) return stretcherOutOfReach(names[0]);
  const pb = axisAt(b, h);
  if (!pb) return stretcherOutOfReach(names[1]);
  const dx = Math.abs(pa[0] - pb[0]) > SQUARE_EPS;
  const dz = Math.abs(pa[2] - pb[2]) > SQUARE_EPS;
  if (dx === dz) return STRETCHER_NOT_SQUARE;
  const axis = dx ? 0 : 2;
  const c = axis === 0 ? 2 : 0;
  const mid = (pa[c] + pb[c]) / 2;
  const p0: V3 = [pa[0], h, pa[2]];
  const p1: V3 = [pb[0], h, pb[2]];
  p0[c] = mid;
  p1[c] = mid;
  return { p0, p1, axis };
}

/** The end's axis point and the unit direction toward the other end (exactly ±X or ±Z: the line is axis-aligned). */
function endOf(line: Pick<RungLine, 'p0' | 'p1'>, atStart: boolean): { p: V3; w: V3 } {
  const d = sub(line.p1, line.p0);
  const k = Math.abs(d[0]) >= Math.abs(d[2]) ? 0 : 2;
  const w: V3 = [0, 0, 0];
  w[k] = (d[k] > 0) === atStart ? 1 : -1;
  return { p: atStart ? line.p0 : line.p1, w };
}

/** The four corner lines' offsets from the axis (square section `size`, parallel to `w`): ±size/2 on Y and on the other
 *  horizontal axis. */
function cornerOffsets(w: V3, size: number): V3[] {
  const c = w[0] !== 0 ? 2 : 0;
  const out: V3[] = [];
  for (const y of [-1, 1]) for (const x of [-1, 1]) {
    const o: V3 = [0, y * size / 2, 0];
    o[c] = x * size / 2;
    out.push(o);
  }
  return out;
}

/** Along the line `q(s) = q0 + s·w`, the largest `s` inside any of `leg`'s world bodies (`worldBodies`: the leaned bodies,
 *  each convex — a box, or inside half-spaces `m·x + c ≥ 0`), or null when the line meets none. */
function exitAlong(leg: Board, q0: V3, w: V3): number | null {
  let best: number | null = null;
  for (const body of worldBodies(leg)) {
    let lo = -Infinity;
    let hi = Infinity;
    const clip = (num: number, den: number) => {
      // num + s·den ≥ 0
      if (Math.abs(den) <= 1e-15) { if (num < -EPS) lo = Infinity; return; }
      const s = -num / den;
      if (den > 0) lo = Math.max(lo, s); else hi = Math.min(hi, s);
    };
    if (body.box) {
      for (let i = 0; i < 3; i += 1) {
        clip(q0[i]! - body.box.min[i]!, w[i]!);
        clip(body.box.max[i]! - q0[i]!, 0 - w[i]!);
      }
    } else {
      for (const pl of body.planes) clip(dot(pl.m, q0) + pl.c, dot(pl.m, w));
    }
    if (lo <= hi + EPS && Number.isFinite(hi)) best = best === null ? hi : Math.max(best, hi);
  }
  return best;
}

/** Each corner line's exit from the leg's wood, as a distance from the end's axis point toward the other end; null when a
 *  corner line meets no wood. */
function cornerExits(leg: Board, line: Pick<RungLine, 'p0' | 'p1'>, size: number, atStart: boolean): number[] | null {
  const { p, w } = endOf(line, atStart);
  const out: number[] = [];
  for (const o of cornerOffsets(w, size)) {
    const s = exitAlong(leg, [p[0] + o[0], p[1] + o[1], p[2] + o[2]], w);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

/**
 * The shoulder station (spec §3.3): how far from the end's axis point (`line.p0` when `atStart`, else `line.p1`) the rung's
 * square section of side `size` has fully left `leg`'s (leaned) wood — the largest distance, over the four lines parallel
 * to the axis through the section's corners, to where that line leaves the leg's bodies. Throws when a corner line meets
 * no wood (the caller refuses first: `stretcherPlan`'s reach check).
 */
export function shoulderStation(leg: Board, line: Pick<RungLine, 'p0' | 'p1'>, size: number, atStart: boolean): number {
  const e = cornerExits(leg, line, size, atStart);
  if (!e) throw new Error(`shoulderStation: a corner line misses ${leg.id}`);
  return stationOf(e);
}

/** The station and the gap from one end's four corner exits (`cornerExits`): the plan computes the exits once per end. */
const stationOf = (exits: readonly number[]) => Math.max(...exits);
const gapOf = (exits: readonly number[], shoulder: number) => shoulder - Math.min(...exits);

/**
 * THE shoulder gap (spec §5.3, ruling P1; `stretcherPlan` and Task 3's `stretcherOf` both call it): with the shoulder placed
 * `shoulder` from the end's axis point, the most any of its four corners stands off `leg`'s wood — the shoulder's distance
 * less the nearest corner line's exit. Throws as `shoulderStation`.
 */
export function shoulderGap(leg: Board, line: Pick<RungLine, 'p0' | 'p1'>, size: number, atStart: boolean, shoulder: number): number {
  const e = cornerExits(leg, line, size, atStart);
  if (!e) throw new Error(`shoulderGap: a corner line misses ${leg.id}`);
  return gapOf(e, shoulder);
}

/** Whether the rung's section at this end lies on `leg`'s entry face (ruling T1a, before `rungSocketRow`, which throws
 *  otherwise): the centre line and the four corner lines, run into the leg, cross the entry face's plane (`rungEntryOf`,
 *  THE choice) inside its rectangle; and the tip, `tipAt` from the axis point, is short of the centre line's crossing. */
function onEntryFace(leg: Board, line: Pick<RungLine, 'p0' | 'p1'>, size: number, atStart: boolean, tipAt: number): boolean {
  const { p, w } = endOf(line, atStart);
  const { face, from } = rungEntryOf(leg, w);
  const cross = (q0: V3): number | null => faceCrossing(leg, q0, w, face, from);
  const centre = cross(p);
  if (centre === null || centre <= tipAt + EPS) return false;
  return cornerOffsets(w, size).every((o) => cross([p[0] + o[0], p[1] + o[1], p[2] + o[2]]) !== null);
}

/** Whether rung tenon `t` (of `rung`) enters the single bore `row` of `leg` by more than `TOUCH` along its outward
 *  direction `w` from the shoulder at world point `s` (`seatedIn`'s rule 5, measured the same way). */
function enters(leg: Board, row: HoleRow, s: V3, w: V3, length: number): boolean {
  const [m, f] = boreEnds(leg, row).map((q) => dot(sub(q, s), w)) as [number, number];
  return Math.min(length, Math.max(m, f)) - Math.max(0, Math.min(m, f)) > TOUCH;
}

/** Whether `leg` leans TURNED with a non-zero twist (`leanTwist`, lean.ts' ONE twist computation; it reads the slopes, never
 *  `square`, so the square-set test is here). A turned lean with zero twist (rake-only, splay-only) is the square-set map. */
function turnedLeg(leg: Board): boolean {
  if (!leans(leg) || !leg.lean || leg.lean.square) return false;
  return Math.abs(leanTwist(leg, leg.lean) ?? 0) > EPS;
}

/** One leg's entry in the plan: see `StretcherPlan.legs`. */
export interface StretcherLeg { id: string; holes: HoleRow[] }

/** The add plan (spec §3, §6.1). */
export interface StretcherPlan {
  /** The new rung as a WORLD part (its id a fresh stored id, `nextId`; its name `uniqueName` among the legs' container's
   *  parts and assemblies, inv 8): the store adds it to `container` through the write-back (inv 46). */
  rung: Board;
  /** The legs' container path (`parentPath` of their world ids): null for the root. */
  container: string | null;
  /**
   * One entry per STORAGE target the plan writes (a Shape, inv 45, or one stored part shared by every placement of its
   * definition): `id` is the WORLD occurrence id of the selected leg that stands for that target, and `holes` that world
   * part's FULL new hole list in its own frame — its existing rows plus the new socket, or the existing list unchanged when
   * a row is reused. The store writes `{ ...worldPart, holes }` through `mapWorld` once per entry, which lowers it to the
   * Shape or the stored part (and through a mirrored Shape user's own flag). Two selected legs sharing one target share one
   * entry, carrying both sockets.
   */
  legs: StretcherLeg[];
  /** One `stretcherLinkNote` per OTHER world part (not the two legs) whose resolved holes gain a row, world order. */
  notes: string[];
  /** The larger end's widest shoulder-corner gap (`shoulderGap`, ruling P1). */
  gap: number;
}

/** A refusal, and the hole fault behind it when it is a socket's (`defaultHeight` steps over `meets-hole`). */
interface Refusal { sentence: string; holeFault?: HoleFaultKind }

function plan(doc: SloydDocument, legIds: readonly [string, string], o: { height: number; size: number; diameter: number }):
  StretcherPlan | Refusal {
  const refuse = (sentence: string, holeFault?: HoleFaultKind): Refusal => (holeFault ? { sentence, holeFault } : { sentence });
  const world = worldParts(doc);
  const legs = legIds.map((id) => {
    const w = world.find((b) => b.id === id);
    if (!w) throw new Error(`stretcherPlan: no part ${id}`);
    return w;
  }) as [Board, Board];
  const names = displayNames(doc);
  const nameOf = (b: Board) => names.get(b.id) ?? b.name;
  // A leg leaning TURNED with a non-zero twist is turned about its length (spec Amended S1): checked first.
  const turned = legs.find(turnedLeg);
  if (turned) return refuse(stretcherTurnedLeg(nameOf(turned)));
  const container = parentPath(legs[0].id);
  if (parentPath(legs[1].id) !== container) return refuse(STRETCHER_CONTAINERS);
  // "Reached through a mirrored instance": any instance on the chain, not the parity (two mirrors are still mirrors).
  const throughMirror = container === null ? false : (instancesOn(doc, container) ?? []).some((i) => i.mirrored === true);
  if (throughMirror) return refuse(stretcherMirrored(nameOf(legs[0])));

  const line = rungLine(legs[0], legs[1], o.height, [nameOf(legs[0]), nameOf(legs[1])]);
  if (typeof line === 'string') return refuse(line);
  const k = line.axis;
  const D = Math.abs(line.p1[k] - line.p0[k]);
  const L = floorToGrid(D, doc.units);
  const tipAt = (D - L) / 2;
  // The rung's section must lie on each leg's entry face, with the tip inside (T1a), before any station is measured.
  const ends = [true, false] as const;
  const exits: number[][] = [];
  for (const [i, atStart] of ends.entries()) {
    const leg = legs[i]!;
    const e = onEntryFace(leg, line, o.size, atStart, tipAt) ? cornerExits(leg, line, o.size, atStart) : null;
    if (!e) return refuse(stretcherOutOfReach(nameOf(leg)));
    exits.push(e);
  }
  const sA = stationOf(exits[0]!);
  const sB = stationOf(exits[1]!);
  const S = floorToGrid(D - sA - sB, doc.units);
  const slack = (D - sA - sB) - S;
  // Each shoulder's distance from its leg's axis point, the slack split evenly; each tenon what that placement leaves.
  const shoulders = [sA + slack / 2, sB + slack / 2];

  // The rung: flat, its length along the axis (turn 0 along X, 90 along Z), centred between the axis points.
  const c = (line.p0[k] + line.p1[k]) / 2;
  const cross = line.p0[k === 0 ? 2 : 0];
  const y = o.height - o.size / 2;
  const position: V3 = k === 0 ? [c - L / 2, y, cross - o.size / 2] : [cross - o.size / 2, y, c - L / 2];
  const home = containerAt(doc, container)!;
  const base = createBoard({
    name: uniqueName('Stretcher', [...home.boards, ...home.instances]),
    posture: 'flat', rotation: k === 0 ? 0 : 90, length: L, width: o.size, thickness: o.size, position,
    grain: 'length', material: legs[0].material === legs[1].material ? legs[0].material : DEFAULT_MATERIAL,
  });
  // Which rung end meets which leg: by the rung's own axis (a turn-90 rung runs max → min along +Z, inv 44).
  const mid: V3 = k === 0 ? [c, o.height, cross] : [cross, o.height, c];
  const aAtMax = dot(partAxis(base).u, sub(line.p0, mid)) > 0;
  const endAt = [aAtMax ? 'max' : 'min', aAtMax ? 'min' : 'max'] as const;
  const tenons: RoundTenon[] = ends.map((_, i) => ({ id: nextId(), end: endAt[i]!, diameter: o.diameter, length: shoulders[i]! - tipAt }));
  if (tenons.some((t) => t.length <= EPS)) return refuse(stretcherOutOfReach(nameOf(legs[tenons.findIndex((t) => t.length <= EPS)]!)));
  const rung = withTenons(base, tenons);
  for (const t of tenons) {
    const f = tenonFaults(rung, t);
    if (f.length > 0) return refuse(tenonFaultText(f[0]!));
  }

  // The sockets, leg by leg, through `mapWorld` on a trial document, so a leg whose storage the first leg shares (a Shape,
  // a definition's part) is judged with the first socket already in it, in its own frame.
  const keyOf = (b: Board) => (b.shape !== undefined ? `shape:${b.shape}` : `part:${storageKey(doc, b.id) ?? b.id}`);
  const written = new Set<string>();
  const axis: WorldAxis = { p: line.p0, u: k === 0 ? [1, 0, 0] : [0, 0, 1] };
  let trial = doc;
  for (const [i, atStart] of ends.entries()) {
    const leg = worldParts(trial).find((b) => b.id === legs[i]!.id)!;
    const t = tenons[i]!;
    const { p, w } = endOf(line, atStart);
    if (leg.holes.some((r) => seatedIn(rung, t, leg, r))) continue;
    // A bore on the rung's axis the tenon would enter but not be seated in: never bored beside (spec §6.1).
    const shoulder = along(p, w, shoulders[i]!);
    const out: V3 = [0 - w[0], 0 - w[1], 0 - w[2]];
    if (leg.holes.some((r) => r.count === 1 && boreAlongAxis(leg, r, axis) && enters(leg, r, shoulder, out, t.length))) {
      return refuse(stretcherDifferentSocket(nameOf(leg)));
    }
    const r = rungSocketRow(leg, axis, w, o.diameter, along(p, w, tipAt), tenonStep(doc.units));
    if (typeof r === 'string') return refuse(socketTooSteep(nameOf(leg)));
    const row: HoleRow = { ...r, id: nextId() };
    const faults = holeFaults({ ...leg, holes: [...leg.holes, row] }, row);
    if (faults.length > 0) {
      const meets = faults.some((f) => f.kind === 'meets-hole');
      return refuse(stretcherSocketFaulted(nameOf(leg), socketFaultWords(faults[0]!)), meets ? 'meets-hole' : faults[0]!.kind);
    }
    trial = mapWorld(trial, (ws) => ws.map((b) => (b.id === leg.id ? { ...b, holes: [...b.holes, row] } : b)));
    written.add(keyOf(leg));
  }

  const after = worldParts(trial);
  const seen = new Set<string>();
  const out: StretcherLeg[] = [];
  for (const leg of legs) {
    const key = keyOf(leg);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: leg.id, holes: written.has(key) ? after.find((b) => b.id === leg.id)!.holes : leg.holes });
  }
  const before = new Map(world.map((b) => [b.id, b]));
  const notes = after.filter((b) => !legIds.includes(b.id) && JSON.stringify(b.holes) !== JSON.stringify(before.get(b.id)?.holes))
    .map((b) => stretcherLinkNote(nameOf(b)));
  const gap = Math.max(gapOf(exits[0]!, shoulders[0]!), gapOf(exits[1]!, shoulders[1]!));
  return { rung, container, legs: out, notes, gap };
}

/**
 * Add stretcher's plan (spec §3, §6.1) between the world parts `legIds` (flat WORLD ids, `worldParts`' occurrence ids) at
 * height `o.height` (world Y of the rung's axis), with a square rung of side `o.size` and two round tenons of `o.diameter`:
 * - the axis (`rungLine`); the stock length `L` = the axis points' distance `D` rounded DOWN to the drag grid, centred, so
 *   each tip stops `(D − L)/2` short of its leg's axis; the shoulder-to-shoulder `S` = `D − sA − sB` (`shoulderStation`)
 *   rounded DOWN to the same grid, its slack split evenly; each tenon the length that placement leaves (exact);
 * - each leg's socket (`rungSocketRow`): REUSED when the planned tenon is already `seatedIn` a row of the leg (a linked
 *   leg's mate bored it, inv 45), else bored, judged by `holeFaults` (THE decider, inv 50) on the leg holding it.
 * Every refusal is decided here, before anything is written, in this order: a leg leaning TURNED with a
 * non-zero twist (`stretcherTurnedLeg`, spec Amended S1: first, before the geometry), the legs' container
 * (`STRETCHER_CONTAINERS`), a leg reached through a mirrored instance, out of reach (the axis), not square, out of reach
 * again (the section must lie on the entry face, its tip inside: ruling T1a), the tenons' faults (`tenonFaults`: the too-wide sentence first), then per leg a
 * different socket on the axis, too steep (`socketTooSteep`) and a socket fault (`stretcherSocketFaulted`).
 */
export function stretcherPlan(doc: SloydDocument, legIds: [string, string], o: { height: number; size: number; diameter: number }):
  StretcherPlan | string {
  const p = plan(doc, legIds, o);
  return 'sentence' in p ? p.sentence : p;
}

/**
 * The panel's default height (Global Constraints): one third of the lower leg's top height (`axisTop`), rounded to the
 * drag grid, stepped up by 1-1/2" (40 mm) while a trial plan there (the default rung size, this `diameter`) refuses with a
 * `meets-hole` socket fault on either leg (two rungs meeting a leg at one height; spec §3.4). At most 20 steps; then the
 * last height tried.
 */
export function defaultHeight(doc: SloydDocument, legIds: [string, string], diameter: number): number {
  const world = worldParts(doc);
  const top = Math.min(...legIds.map((id) => axisTop(world.find((b) => b.id === id)!)));
  const units = doc.units;
  const base = snapToGrid(top / 3, units);
  // Metric heights stay `k / 25.4` (snapToGrid's form).
  const at = (n: number) => (metric(units) ? (Math.round(base * 25.4) + Math.round(RUNG_STAGGER.metric * 25.4) * n) / 25.4 : base + n * RUNG_STAGGER.imperial);
  const size = rungSize(units);
  let n = 0;
  while (n < 20) {
    const p = plan(doc, legIds, { height: at(n), size, diameter });
    if (!('sentence' in p) || p.holeFault !== 'meets-hole') break;
    n += 1;
  }
  return at(n);
}
