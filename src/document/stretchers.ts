import type { Board, HoleRow, RoundTenon, SloydDocument } from './types';
import type { Units } from '../units/length';
import type { V3 } from './angleCuts';
import { DEFAULT_MATERIAL } from './types';
import { boardExtents, snapStep, snapToGrid } from './geometry';
import { createBoard } from './document';
import { nextId } from './ids';
import { uniqueName } from './names';
import { holeRowValues, mm } from './holes';
import { leans, leanTwist } from './lean';
import { holeFaults, type HoleFaultKind } from './holeFaults';
import { socketFaultWords } from './holeText';
import { worldBodies } from './drawing';
import { toWorld } from './snapPoints';
import { boreAlongAxis, boreEnds, faceCrossing, partAxis, rungEntryOf, rungSocketRow, socketTooSteep, type WorldAxis } from './legSockets';
import { shoulderAt, tenonAt, tenonFaults, tenonsOf, tenonStep, withTenons } from './roundTenons';
import { tenonFaultText } from './tenonText';
import { seatedIn } from './tenonJoints';
import { TOUCH } from './checkTolerances';
import { containerAt, displayNames, instancesOn, parentPath, worldParts } from './tree';
import { mapWorld, storageKey } from './treeEdit';
import {
  STRETCHER_CONTAINERS, STRETCHER_NOT_SQUARE, stretcherAmbiguous, stretcherClosureDisagrees, stretcherDifferentSocket,
  stretcherLinkNote, stretcherMirrored, stretcherOutOfReach, stretcherSocketFaulted, stretcherTurned, stretcherTurnedLeg,
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

/** A rung's section in the world, square to its (horizontal) axis: `cross` across on the other horizontal axis, `up` on Y.
 *  Add stretcher's is square (the typed rung size); Fit again reads the rung's own (`sectionOf`). */
interface Section { cross: number; up: number }
const squareSection = (size: number): Section => ({ cross: size, up: size });

/** The four corner lines' offsets from the axis (section `s`, parallel to `w`): ±up/2 on Y and ±cross/2 on the other
 *  horizontal axis. */
function cornerOffsets(w: V3, s: Section): V3[] {
  const c = w[0] !== 0 ? 2 : 0;
  const out: V3[] = [];
  for (const y of [-1, 1]) for (const x of [-1, 1]) {
    const o: V3 = [0, y * s.up / 2, 0];
    o[c] = x * s.cross / 2;
    out.push(o);
  }
  return out;
}

/** Along the line `q(s) = q0 + s·w`, the interval `[lo, hi]` of `s` inside each of `leg`'s world bodies that it meets
 *  (`worldBodies`: the leaned bodies, R1, each convex — a box, or inside half-spaces `m·x + c ≥ 0`). The ONE line-vs-body
 *  clip: `exitAlong` (the shoulder station) and `rungLegAt` (the finder) both read it. */
function bodySpans(leg: Board, q0: V3, w: V3): [number, number][] {
  const out: [number, number][] = [];
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
    if (lo <= hi + EPS && Number.isFinite(hi)) out.push([lo, hi]);
  }
  return out;
}

/** Along the line `q(s) = q0 + s·w`, the largest `s` inside any of `leg`'s world bodies (`bodySpans`), or null when the
 *  line meets none. */
function exitAlong(leg: Board, q0: V3, w: V3): number | null {
  const spans = bodySpans(leg, q0, w);
  return spans.length === 0 ? null : Math.max(...spans.map(([, hi]) => hi));
}

/** Each corner line's exit from the leg's wood, as a distance from the end's point (`endOf`) toward the other end; null
 *  when a corner line meets no wood. */
function cornerExits(leg: Board, line: Pick<RungLine, 'p0' | 'p1'>, sec: Section, atStart: boolean): number[] | null {
  const { p, w } = endOf(line, atStart);
  const out: number[] = [];
  for (const o of cornerOffsets(w, sec)) {
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
  const e = cornerExits(leg, line, squareSection(size), atStart);
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
  const e = cornerExits(leg, line, squareSection(size), atStart);
  if (!e) throw new Error(`shoulderGap: a corner line misses ${leg.id}`);
  return gapOf(e, shoulder);
}

/** Whether the rung's section at this end lies on `leg`'s entry face (ruling T1a, before `rungSocketRow`, which throws
 *  otherwise): the centre line and the four corner lines, run into the leg, cross the entry face's plane (`rungEntryOf`,
 *  THE choice) inside its rectangle; and the tip, `tipAt` from the axis point, is short of the centre line's crossing. */
function onEntryFace(leg: Board, line: Pick<RungLine, 'p0' | 'p1'>, sec: Section, atStart: boolean, tipAt: number): boolean {
  const { p, w } = endOf(line, atStart);
  const { face, from } = rungEntryOf(leg, w);
  const cross = (q0: V3): number | null => faceCrossing(leg, q0, w, face, from);
  const centre = cross(p);
  if (centre === null || centre <= tipAt + EPS) return false;
  return cornerOffsets(w, sec).every((o) => cross([p[0] + o[0], p[1] + o[1], p[2] + o[2]]) !== null);
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

/** The checks on the two legs before any geometry, in order (spec Amended S1, §3.2): a leg leaning TURNED with a non-zero
 *  twist (first), the legs' container, a leg reached through a mirrored instance. Add stretcher and Fit again share them. */
function legRefusal(doc: SloydDocument, legs: readonly [Board, Board], nameOf: (b: Board) => string): string | null {
  // A leg leaning TURNED with a non-zero twist is turned about its length (spec Amended S1): checked first.
  const turned = legs.find(turnedLeg);
  if (turned) return stretcherTurnedLeg(nameOf(turned));
  const container = parentPath(legs[0].id);
  if (parentPath(legs[1].id) !== container) return STRETCHER_CONTAINERS;
  // "Reached through a mirrored instance": any instance on the chain, not the parity (two mirrors are still mirrors).
  const throughMirror = container === null ? false : (instancesOn(doc, container) ?? []).some((i) => i.mirrored === true);
  if (throughMirror) return stretcherMirrored(nameOf(legs[0]));
  return null;
}

/** The two ends, `line.p0`'s first. */
const ENDS = [true, false] as const;

/** THE fit on a rung's axis (spec §3.3), Add stretcher's and Fit again's: `L`, each tip `tipAt` short of its leg's axis
 *  point, each end's corner exits and its shoulder's distance from the axis point (`shoulders`, the slack split evenly), and
 *  the axis's middle `mid` (the rung's centre). */
interface Fit { L: number; tipAt: number; exits: [number[], number[]]; shoulders: [number, number]; mid: V3 }

/** The fit between `legs` (end 0 at `line.p0`) for a section `sec`; the refusal is T1a's out-of-reach sentence. */
function fitOn(legs: readonly [Board, Board], line: RungLine, sec: Section, units: Units, nameOf: (b: Board) => string): Fit | string {
  const k = line.axis;
  const D = Math.abs(line.p1[k] - line.p0[k]);
  const L = floorToGrid(D, units);
  const tipAt = (D - L) / 2;
  // The rung's section must lie on each leg's entry face, with the tip inside (T1a), before any station is measured.
  const exits: number[][] = [];
  for (const [i, atStart] of ENDS.entries()) {
    const leg = legs[i]!;
    const e = onEntryFace(leg, line, sec, atStart, tipAt) ? cornerExits(leg, line, sec, atStart) : null;
    if (!e) return stretcherOutOfReach(nameOf(leg));
    exits.push(e);
  }
  const sA = stationOf(exits[0]!);
  const sB = stationOf(exits[1]!);
  const S = floorToGrid(D - sA - sB, units);
  const slack = (D - sA - sB) - S;
  // Each shoulder's distance from its leg's axis point, the slack split evenly; each tenon what that placement leaves.
  const c = (line.p0[k] + line.p1[k]) / 2;
  const cross = line.p0[k === 0 ? 2 : 0];
  const h = line.p0[1];
  return {
    L, tipAt, exits: [exits[0]!, exits[1]!], shoulders: [sA + slack / 2, sB + slack / 2],
    mid: k === 0 ? [c, h, cross] : [cross, h, c],
  };
}

/** A min corner centring world extents `e` on `mid`. */
const centredOn = (mid: V3, e: readonly number[]): V3 => [mid[0] - e[0]! / 2, mid[1] - e[1]! / 2, mid[2] - e[2]! / 2];

/** Which of `rung`'s length ends faces `line.p0` (its first) and `line.p1`: by the rung's own axis (a turn-90 rung runs
 *  max → min along +Z, inv 44). `rung` centred on `mid`. */
function endsFacing(rung: Board, line: RungLine, mid: V3): readonly [RoundTenon['end'], RoundTenon['end']] {
  const aAtMax = dot(partAxis(rung).u, sub(line.p0, mid)) > 0;
  return aAtMax ? ['max', 'min'] : ['min', 'max'];
}

/** End `atStart`'s socket in `leg` (`rungSocketRow`, spec §3.4): along the rung's exact axis, its depth to the tip (`tipAt`
 *  short of the axis point), or `socketTooSteep`. Leg-local, so the holes already in the leg do not change it. */
function socketFor(leg: Board, line: RungLine, atStart: boolean, diameter: number, tipAt: number, units: Units, name: string):
  Omit<HoleRow, 'id'> | string {
  const { p, w } = endOf(line, atStart);
  const axis: WorldAxis = { p: line.p0, u: line.axis === 0 ? [1, 0, 0] : [0, 0, 1] };
  const r = rungSocketRow(leg, axis, w, diameter, along(p, w, tipAt), tenonStep(units));
  return typeof r === 'string' ? socketTooSteep(name) : r;
}

/** The storage target a world part's holes are written to (a Shape, inv 45, or the stored part every placement of a
 *  definition shares). */
const holesKey = (doc: SloydDocument, b: Board) => (b.shape !== undefined ? `shape:${b.shape}` : `part:${storageKey(doc, b.id) ?? b.id}`);

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
  const legsRefuse = legRefusal(doc, legs, nameOf);
  if (legsRefuse) return refuse(legsRefuse);
  const container = parentPath(legs[0].id);

  const line = rungLine(legs[0], legs[1], o.height, [nameOf(legs[0]), nameOf(legs[1])]);
  if (typeof line === 'string') return refuse(line);
  const k = line.axis;
  const fit = fitOn(legs, line, squareSection(o.size), doc.units, nameOf);
  if (typeof fit === 'string') return refuse(fit);
  const { L, tipAt, exits, shoulders, mid } = fit;

  // The rung: flat, its length along the axis (turn 0 along X, 90 along Z), centred between the axis points.
  const position = centredOn(mid, k === 0 ? [L, o.size, o.size] : [o.size, o.size, L]);
  const home = containerAt(doc, container)!;
  const base = createBoard({
    name: uniqueName('Stretcher', [...home.boards, ...home.instances]),
    posture: 'flat', rotation: k === 0 ? 0 : 90, length: L, width: o.size, thickness: o.size, position,
    grain: 'length', material: legs[0].material === legs[1].material ? legs[0].material : DEFAULT_MATERIAL,
  });
  const endAt = endsFacing(base, line, mid);
  const tenons: RoundTenon[] = ENDS.map((_, i) => ({ id: nextId(), end: endAt[i]!, diameter: o.diameter, length: shoulders[i]! - tipAt }));
  if (tenons.some((t) => t.length <= EPS)) return refuse(stretcherOutOfReach(nameOf(legs[tenons.findIndex((t) => t.length <= EPS)]!)));
  const rung = withTenons(base, tenons);
  for (const t of tenons) {
    const f = tenonFaults(rung, t);
    if (f.length > 0) return refuse(tenonFaultText(f[0]!));
  }

  // The sockets, leg by leg, through `mapWorld` on a trial document, so a leg whose storage the first leg shares (a Shape,
  // a definition's part) is judged with the first socket already in it, in its own frame.
  const keyOf = (b: Board) => holesKey(doc, b);
  const written = new Set<string>();
  const axis: WorldAxis = { p: line.p0, u: k === 0 ? [1, 0, 0] : [0, 0, 1] };
  let trial = doc;
  for (const [i, atStart] of ENDS.entries()) {
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
    const r = socketFor(leg, line, atStart, o.diameter, tipAt, doc.units, nameOf(leg));
    if (typeof r === 'string') return refuse(r);
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

// ---------------------------------------------------------------------------------------------------------------------
// Finding a stretcher's legs again (spec §6.2) and fitting it again (§6.3, §6.4). Nothing is stored about which legs a rung
// belongs to: they are found from the geometry, every time.

/** The world point on `b`'s axis (its section's centre) at local length `l`. */
const onAxis = (b: Board, l: number): V3 => toWorld(b, { length: l, width: b.width / 2, thickness: b.thickness / 2 });

/** Tenon `t`'s centre segment in the world: its shoulder's centre, then its tip's (the end face's centre: a rung's ends
 *  are square, and an end cut is read through `shoulderAt` with a zero length, as `axisEnds` does). */
function tenonSegment(rung: Board, t: RoundTenon): [V3, V3] {
  return [onAxis(rung, shoulderAt(rung, t)), onAxis(rung, shoulderAt(rung, { end: t.end, length: 0 }))];
}

/**
 * The leg tenon `t` of `rung` sits in (spec §6.2; a NEW predicate — chunk 2b's `tenonInSeat` reads only the `max` tenon,
 * needs the tenoned part to lean and measures a seat between its level faces): the first part in world order, other than
 * the rung, that is UPRIGHT and whose world BODIES (`worldBodies`, the lean composed, R1; hole-free, inv 50) the tenon's
 * centre segment (shoulder centre → tip centre) meets by more than `TOUCH` — the length of the segment inside a body, the
 * one line-vs-body clip (`bodySpans`), `seatedIn`'s "enters" measure. Null when it meets none.
 */
export function rungLegAt(world: readonly Board[], rung: Board, t: RoundTenon): Board | null {
  const [s, tip] = tenonSegment(rung, t);
  const d = sub(tip, s);
  const n = Math.hypot(d[0], d[1], d[2]);
  if (n <= EPS) return null;
  const w: V3 = [d[0] / n, d[1] / n, d[2] / n];
  for (const b of world) {
    if (b.id === rung.id || b.posture !== 'upright') continue;
    if (bodySpans(b, s, w).some(([lo, hi]) => Math.min(n, hi) - Math.max(0, lo) > TOUCH)) return b;
  }
  return null;
}

/** A found stretcher (spec §6.2). */
export interface FoundStretcher {
  /** The legs in tenon order: the `min` tenon's leg, then the `max` tenon's. */
  legs: [Board, Board];
  /** The rung's axis height (world Y). */
  height: number;
  /** Both tenons `seatedIn` a row of their leg. */
  seated: boolean;
  /** The larger end's widest shoulder-corner gap (THE gap helper, ruling P1), measured along the rung's own axis. */
  gap: number;
}

/** The rung's tenons by end, `min` first, when it has both. */
function tenonPair(rung: Board): [RoundTenon, RoundTenon] | null {
  const a = tenonAt(rung, 'min');
  const b = tenonAt(rung, 'max');
  return a && b ? [a, b] : null;
}

/** The rung's world section across its (horizontal) axis: its extents on Y and on the other horizontal axis. */
function sectionOf(rung: Board, k: 0 | 2): Section {
  const e = boardExtents(rung);
  return { cross: e[k === 0 ? 2 : 0], up: e[1] };
}

/** The world axis (X 0, Z 2) a level part's length runs along, or null when its length is not horizontal. */
function rungAxisOf(rung: Board): 0 | 2 | null {
  const { u } = partAxis(rung);
  if (u[1] !== 0) return null;
  return u[0] !== 0 ? 0 : 2;
}

/**
 * `rung` as a stretcher (spec §6.2), or null: non-null only for an UNLEANED rung whose length is level (along world X or
 * Z) and whose two tenons (`min` and `max`) find two DIFFERENT upright legs (`rungLegAt`). `seated` when both tenons are
 * `seatedIn` a row of their leg; otherwise it is stale (the panel's note and Fit again). `gap` (ruling P1) is `shoulderGap`'s
 * measure along the rung's OWN axis — the line through its two tip centres, each shoulder its tenon's length from its tip —
 * so it is the add plan's number on a fitted rung and still a number on a stale one; an end whose corner lines miss its leg
 * adds no gap.
 */
export function stretcherOf(world: readonly Board[], rung: Board): FoundStretcher | null {
  if (leans(rung)) return null;
  const k = rungAxisOf(rung);
  const ts = tenonPair(rung);
  if (k === null || !ts) return null;
  const a = rungLegAt(world, rung, ts[0]);
  const b = rungLegAt(world, rung, ts[1]);
  if (!a || !b || a.id === b.id) return null;
  const seated = ([[ts[0], a], [ts[1], b]] as const).every(([t, leg]) => leg.holes.some((r) => seatedIn(rung, t, leg, r)));
  const line = { p0: tenonSegment(rung, ts[0])[1], p1: tenonSegment(rung, ts[1])[1] };
  const sec = sectionOf(rung, k);
  let gap = 0;
  for (const [i, atStart] of ENDS.entries()) {
    const e = cornerExits(i === 0 ? a : b, line, sec, atStart);
    if (e) gap = Math.max(gap, gapOf(e, ts[i]!.length));
  }
  return { legs: [a, b], height: partAxis(rung).p[1], seated, gap };
}

/** Whether two rows agree to 1e-9: every `holeRowValues` entry, strings exactly, numbers within 1e-9. */
function rowsAgree(a: Omit<HoleRow, 'id'>, b: Omit<HoleRow, 'id'>): boolean {
  const x = holeRowValues(a);
  const y = holeRowValues(b);
  return x.length === y.length && x.every((v, i) => {
    const u = y[i]!;
    return typeof v === 'number' && typeof u === 'number' ? Math.abs(v - u) <= EPS : v === u;
  });
}

/**
 * The row tenon `t` of `rung` used in `leg` (spec §6.2): the first row it is `seatedIn`; once stale, the single blind bore of
 * the tenon's diameter (to 1e-9) whose bottom centre is nearest the tip's centre — `{ tied }` when two are equally near
 * (to 1e-9: a hand-made duplicate needs a human), null when the leg has none.
 */
function usedRow(rung: Board, t: RoundTenon, leg: Board): HoleRow | null | { tied: HoleRow[] } {
  const seated = leg.holes.find((r) => seatedIn(rung, t, leg, r));
  if (seated) return seated;
  const tip = tenonSegment(rung, t)[1];
  const near = leg.holes
    .filter((r) => r.count === 1 && r.depth !== 'through' && Math.abs(r.diameter - t.diameter) <= EPS)
    .map((r) => ({ r, d: Math.hypot(...sub(boreEnds(leg, r)[1], tip)) }))
    .sort((p, q) => p.d - q.d);
  if (near.length === 0) return null;
  const tied = near.filter((n) => n.d - near[0]!.d <= EPS);
  return tied.length > 1 ? { tied: tied.map((n) => n.r) } : near[0]!.r;
}

/** Fit again's plan (spec §6.3, §6.4). */
export interface RefitPlan {
  /** Every rung in the closure, the selected one first, then in the order found: its WORLD id and the fields it changes
   *  (`length`, `position`, `tenons` — the same ids, by end). A value within 1e-9 of the stored one is the stored one. */
  rungs: { id: string; patch: Partial<Board> }[];
  /** One entry per STORAGE target whose rows move, as `StretcherPlan.legs`: a world leg standing for it and that world
   *  part's FULL new hole list in its own frame, each moved row in place (its index and id kept). */
  legs: StretcherLeg[];
}

/** A closure member: the rung, its found legs (tenon order) and the row each tenon used (null: none; a new one is bored). */
interface Member { rung: Board; found: FoundStretcher; rows: [HoleRow | null, HoleRow | null] }

/**
 * Fit the stretcher again (spec §6.3, §6.4): the CLOSURE of the world rung `rungId` (which must be a stretcher,
 * `stretcherOf`; thrown otherwise — the button shows only for one) — the rung itself, every other stretcher seated in (or,
 * stale, found at, `usedRow`) a row the re-fit moves, and so on, a linked leg's rows being SHARED (inv 45: on the stool the
 * front and back rungs, or the two side rungs) — each re-planned at its OWN axis height through THE add geometry (`legRefusal`,
 * `rungLine`, `fitOn`, `socketFor`), its tenons and section its own. A re-fit changes only the rung's length, position and
 * tenon lengths (ids kept by end) and moves each used row IN PLACE (index and id kept); a tenon with no row gets a new one.
 * Every refusal is decided before anything is written, in this order: a tenon that could be in two rows
 * (`stretcherAmbiguous`), found as the closure grows; then each rung in closure order — its legs' checks, the axis, the
 * turned-rung sentence when the axis now runs along the other world axis (or the other way along it), the fit, the tenons'
 * faults, too steep; then the shared rows: one planned by two rungs must agree to 1e-9 (`stretcherClosureDisagrees`, the
 * two rungs named); then, on the final rows, a different socket on a rung's axis and a socket fault (`holeFaults`).
 */
export function refitPlan(doc: SloydDocument, rungId: string): RefitPlan | string {
  const world = worldParts(doc);
  const names = displayNames(doc);
  const nameOf = (b: Board) => names.get(b.id) ?? b.name;
  const keyOf = (leg: Board, row: HoleRow) => `${holesKey(doc, leg)}#${row.id}`;

  // The closure. A candidate's rows are resolved once; a tie refuses only a rung that joins.
  const memberOf = (rung: Board): { m: Member; keys: string[] } | { ambiguous: Board; keys: string[] } | null => {
    const found = stretcherOf(world, rung);
    if (!found) return null;
    const ts = tenonPair(rung)!;
    const rows: (HoleRow | null)[] = [];
    let ambiguous: Board | null = null;
    const keys: string[] = [];
    for (const [i, leg] of found.legs.entries()) {
      const r = usedRow(rung, ts[i]!, leg);
      if (r && 'tied' in r) {
        ambiguous ??= leg;
        keys.push(...r.tied.map((x) => keyOf(leg, x)));
        rows.push(null);
      } else {
        if (r) keys.push(keyOf(leg, r));
        rows.push(r);
      }
    }
    return ambiguous ? { ambiguous, keys } : { m: { rung, found, rows: [rows[0]!, rows[1]!] }, keys };
  };
  const rung0 = world.find((b) => b.id === rungId);
  const first = rung0 ? memberOf(rung0) : null;
  if (!first) throw new Error(`refitPlan: ${rungId} is not a stretcher`);
  const candidates = new Map(world.filter((b) => b.id !== rungId && tenonPair(b) !== null).map((b) => [b.id, memberOf(b)]));
  const members: Member[] = [];
  const moved = new Set<string>();
  const join = (c: NonNullable<ReturnType<typeof memberOf>>): string | null => {
    if ('ambiguous' in c) return stretcherAmbiguous(nameOf(c.ambiguous));
    members.push(c.m);
    for (const key of c.keys) moved.add(key);
    return null;
  };
  const r0 = join(first);
  if (r0) return r0;
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, c] of candidates) {
      if (!c || !c.keys.some((key) => moved.has(key))) continue;
      candidates.delete(id);
      const r = join(c);
      if (r) return r;
      grew = true;
    }
  }

  // Each rung re-planned at its own height.
  interface Planned { m: Member; patch: Partial<Board>; rung: Board; rows: [Omit<HoleRow, 'id'>, Omit<HoleRow, 'id'>]; line: RungLine; shoulders: [number, number] }
  const planned: Planned[] = [];
  for (const m of members) {
    const { rung, found } = m;
    const legs = found.legs;
    const legsRefuse = legRefusal(doc, legs, nameOf);
    if (legsRefuse) return legsRefuse;
    const line = rungLine(legs[0], legs[1], found.height, [nameOf(legs[0]), nameOf(legs[1])]);
    if (typeof line === 'string') return line;
    if (line.axis !== rungAxisOf(rung)) return stretcherTurned(nameOf(rung));
    const fit = fitOn(legs, line, sectionOf(rung, line.axis), doc.units, nameOf);
    if (typeof fit === 'string') return fit;
    const keep = (v: number, stored: number) => (Math.abs(v - stored) <= EPS ? stored : v);
    const length = keep(fit.L, rung.length);
    const at = centredOn(fit.mid, boardExtents({ ...rung, length: fit.L }));
    const position: V3 = [keep(at[0], rung.position[0]), keep(at[1], rung.position[1]), keep(at[2], rung.position[2])];
    // The rung's min end must still face its min tenon's leg (line.p0): a rung reversed along its axis runs the other way.
    const moved0 = { ...rung, length, position };
    if (endsFacing(moved0, line, fit.mid)[0] !== 'min') return stretcherTurned(nameOf(rung));
    const tenons = tenonPair(rung)!.map((t, i) => ({ ...t, length: keep(fit.shoulders[i]! - fit.tipAt, t.length) }));
    const bad = tenons.findIndex((t) => t.length <= EPS);
    if (bad >= 0) return stretcherOutOfReach(nameOf(legs[bad]!));
    const next = withTenons(moved0, tenonsOf(rung).map((t) => tenons.find((x) => x.id === t.id) ?? t));
    for (const t of tenons) {
      const f = tenonFaults(next, t);
      if (f.length > 0) return tenonFaultText(f[0]!);
    }
    const rows: Omit<HoleRow, 'id'>[] = [];
    for (const [i, atStart] of ENDS.entries()) {
      const r = socketFor(legs[i]!, line, atStart, tenons[i]!.diameter, fit.tipAt, doc.units, nameOf(legs[i]!));
      if (typeof r === 'string') return r;
      const old = m.rows[i];
      rows.push(old && rowsAgree(old, r) ? old : r);
    }
    planned.push({ m, patch: { length, position, tenons: next.tenons }, rung: next, rows: [rows[0]!, rows[1]!], line, shoulders: fit.shoulders });
  }

  // The rows, written on a trial document through `mapWorld` (lowered to each storage target in its own frame); a row two
  // rungs plan is compared in the second rung's leg, after the first's write.
  let trial = doc;
  const writer = new Map<string, Planned>();
  const firstLeg = new Map<string, string>();
  const placed: { p: Planned; i: number; legId: string; rowId: string }[] = [];
  for (const p of planned) {
    for (const [i, leg0] of p.m.found.legs.entries()) {
      const leg = worldParts(trial).find((b) => b.id === leg0.id)!;
      const old = p.m.rows[i];
      // No row to move (removed by hand): reuse one an earlier rung of the closure just bored that this tenon now seats in
      // (Add's reuse, spec §6.1: the shared row of a linked leg), else bore a new one.
      const reused = old ? undefined : leg.holes.find((r) => seatedIn(p.rung, tenonPair(p.rung)![i]!, leg, r));
      if (reused) {
        placed.push({ p, i, legId: leg.id, rowId: reused.id });
        continue;
      }
      const row: HoleRow = { ...p.rows[i]!, id: old?.id ?? nextId() };
      const key = keyOf(leg, row);
      const by = old ? writer.get(key) : undefined;
      if (by) {
        if (!rowsAgree(leg.holes.find((r) => r.id === row.id)!, row)) return stretcherClosureDisagrees([nameOf(by.m.rung), nameOf(p.m.rung)]);
      } else {
        writer.set(key, p);
        if (!firstLeg.has(holesKey(doc, leg))) firstLeg.set(holesKey(doc, leg), leg.id);
        trial = mapWorld(trial, (ws) => ws.map((b) => (b.id !== leg.id ? b
          : { ...b, holes: old ? b.holes.map((r) => (r.id === old.id ? row : r)) : [...b.holes, row] })));
      }
      placed.push({ p, i, legId: leg.id, rowId: row.id });
    }
  }

  // On the final rows: a different socket on the rung's axis (never bored beside, spec §6.1), then a socket fault.
  const after = worldParts(trial);
  for (const { p, i, legId, rowId } of placed) {
    const leg = after.find((b) => b.id === legId)!;
    const row = leg.holes.find((r) => r.id === rowId)!;
    const { p: q, w } = endOf(p.line, i === 0);
    const axis: WorldAxis = { p: p.line.p0, u: p.line.axis === 0 ? [1, 0, 0] : [0, 0, 1] };
    const t = tenonPair(p.rung)![i]!;
    const out: V3 = [0 - w[0], 0 - w[1], 0 - w[2]];
    if (leg.holes.some((r) => r.id !== rowId && r.count === 1 && boreAlongAxis(leg, r, axis) && enters(leg, r, along(q, w, p.shoulders[i]!), out, t.length))) {
      return stretcherDifferentSocket(nameOf(leg));
    }
    const faults = holeFaults(leg, row);
    if (faults.length > 0) return stretcherSocketFaulted(nameOf(leg), socketFaultWords(faults[0]!));
  }

  const legsOut: StretcherLeg[] = [...firstLeg.values()].map((id) => ({ id, holes: after.find((b) => b.id === id)!.holes }));
  return { rungs: planned.map((p) => ({ id: p.m.rung.id, patch: p.patch })), legs: legsOut };
}
