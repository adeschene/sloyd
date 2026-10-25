import type { BandType, Board } from './types';
import type { Vec3 } from './frames';
import { partGeometry } from './bodies';
import { worldBox } from './designCheck';
import { axisFrame, boardExtents } from './geometry';
import { toWorld } from './snapPoints';
import { holeDrawingTagged } from './holeDrawing';
import { angleCutRemovesNothing, keptHalfSpace } from './angleCuts';
import { featureTag } from './featureKeys';
import { curveDrawEdges, curveEdgeLifts, ownWoodLift, profileSilhouettes, silhouetteLines } from './curveDrawing';
import { sectionAxisIndex, sectionCaps, SECTION_EPS, type Section } from './section';
import { geometryBoard, shapedPart } from './profiles';
import { BAND_SIDES, bandFaults, glueLines, sameSide } from './banding';
import { faceOutline, sideStretch } from './profilePath';
import { leanMap, leans } from './lean';
import { squareSpan } from './curves';
import { hasTenons, onTenonSurface } from './roundTenons';
import { partBounds } from './worldBounds';

/**
 * An orthographic view (plans-sheet spec §2.2). `toward` points from the model TO the viewer;
 * `right` and `up` are the screen axes. World Y is up. The names label dimension axes.
 */
export interface View {
  toward: Vec3; right: Vec3; up: Vec3;
  title: string; rightName: string; upName: string;
}

const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const R6 = Math.sqrt(6);
export const FRONT: View = { toward: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], title: 'Front', rightName: 'Width', upName: 'Height' };
export const SIDE: View = { toward: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0], title: 'Side', rightName: 'Depth', upName: 'Height' };
/** `up = -Z` puts the piece's front edge at the bottom of the plan, next to the front view (third-angle). */
export const TOP: View = { toward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1], title: 'Plan', rightName: 'Width', upName: 'Depth' };
/** From front-right-above; `up = toward × right`. */
export const ISO: View = {
  toward: [1 / R3, 1 / R3, 1 / R3], right: [1 / R2, 0, -1 / R2], up: [-1 / R6, 2 / R6, -1 / R6],
  title: 'Exploded', rightName: '', upName: '',
};

export type P2 = [number, number];
/** `feature`: the hole row, angle cut, curve or band type the segment is drawn for (`featureTag`; feature callouts spec §4.1) — ABSENT,
 *  not undefined, on every other segment, so a featureless part's drawing is byte-for-byte what it was. */
export interface Seg2 { a: P2; b: P2; part: string; feature?: string }
/** A part's section cap on paper (section views spec §3.1): the cut faces' pieces, projected, and their outline. */
export interface CapDrawing { part: string; polys: P2[][]; outline: Seg2[] }
/** `caps`: present only when drawn with a section, so a section-less drawing is byte-for-byte what it was. */
export interface Drawing { visible: Seg2[]; hidden: Seg2[]; bounds: { min: P2; max: P2 }; caps?: CapDrawing[] }

/**
 * Inches. Well above the float drift of `position + toWorldOffset` sums at furniture scale, far
 * below anything visible at print scale. Not TOUCH, not FLUSH_EPSILON — do not unify them.
 */
export const DRAW_EPS = 1e-6;

const dot = (p: readonly number[], v: readonly number[]) => p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]!;
const plus = (p: readonly number[], o: readonly number[] | undefined): Vec3 =>
  [p[0]! + (o?.[0] ?? 0), p[1]! + (o?.[1] ?? 0), p[2]! + (o?.[2] ?? 0)];

/** Keep the part of a convex (t, s) polygon where a·t + b·s + c ≥ 0 (Sutherland–Hodgman, one edge). */
function clip(poly: P2[], a: number, b: number, c: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const fp = a * p[0] + b * p[1] + c;
    const fq = a * q[0] + b * q[1] + c;
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const r = fp / (fp - fq);
      out.push([p[0] + r * (q[0] - p[0]), p[1] + r * (q[1] - p[1])]);
    }
  }
  return out;
}

/**
 * The t-range of the edge a→e hidden by one CLOSED box (spec §2.3): some s ≥ DRAW_EPS with both
 * P(t) + s·toward and P(t) + (s + DRAW_EPS)·toward inside the box grown by DRAW_EPS/2. Closed, so a
 * ray along the seam between two abutting solids of one part counts as inside (the union is solid).
 * The second sample requires the ray to spend at least DRAW_EPS inside the box; an edge drifted
 * ~1.5·DRAW_EPS inside a face the ray leaves through still counts as visible. An edge exactly on
 * such a face is already rejected by the s ≥ DRAW_EPS floor plus the DRAW_EPS/2 growth.
 */
export function hiddenSpan(
  a: Vec3, e: Vec3, box: { min: readonly number[]; max: readonly number[] }, toward: Vec3, sMax: number,
): [number, number] | null {
  const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
  const grow = DRAW_EPS / 2;
  let poly: P2[] = [[0, DRAW_EPS], [1, DRAW_EPS], [1, sMax], [0, sMax]];
  for (let i = 0; i < 3; i++) {
    const v = toward[i]!;
    for (const sigma of [0, DRAW_EPS]) {
      poly = clip(poly, d[i]!, v, a[i]! + sigma * v - box.min[i]! + grow);
      poly = clip(poly, -d[i]!, -v, box.max[i]! + grow - a[i]! - sigma * v);
      if (poly.length === 0) return null;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const [t] of poly) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return hi > lo ? [lo, hi] : null;
}

const DIM_INDEX = { length: 0, width: 1, thickness: 2 } as const;

/** A body in world space for the drawings (spec §3.5): its box when no angle cut clipped it (today's exact
 *  path), else its world vertices and its faces as inside-half-spaces m·x + c >= 0 (derived from the faces:
 *  m is the negated world outward normal, c = n·v0). */
export interface WorldBody { box: { min: Vec3; max: Vec3 } | null; verts: Vec3[]; planes: { m: Vec3; c: number }[] }

/** A board-local direction in the part's pre-lean placement: the turn table's axis and sign (inv 44). */
const placedDir = (frame: ReturnType<typeof axisFrame>, n: readonly number[]): Vec3 =>
  [0, 1, 2].map((i) => n[DIM_INDEX[frame[i]!.dim]]! * (frame[i]!.reversed ? -1 : 1)) as Vec3;

export function worldBodies(b: Board): WorldBody[] {
  const frame = axisFrame(b);
  // Splayed legs §6.1: a leaning part's body is never its axis-aligned box (R3), and its normals turn with the lean as its
  // vertices do (R1: `toWorld` composes the lean, `applyDir` the same rotation). An unleaned part takes today's path.
  const lean = leanMap(b);
  return partGeometry(b).bodies.map((body) => {
    if (body.box && !lean) {
      const w = worldBox(b, body.box);
      return { box: { min: w.min as unknown as Vec3, max: w.max as unknown as Vec3 }, verts: [], planes: [] };
    }
    const toW = ([l, w, t]: readonly number[]) => toWorld(b, { length: l!, width: w!, thickness: t! });
    const verts = body.faces.flatMap((f) => f.verts.map(toW));
    const planes = body.faces.map((f) => {
      const n = lean ? lean.applyDir(placedDir(frame, f.n)) : placedDir(frame, f.n);
      const v0 = toW(f.verts[0]!);
      return { m: [-n[0], -n[1], -n[2]] as Vec3, c: dot(n, v0) };
    });
    return { box: null, verts, planes };
  });
}

/** hiddenSpan against any convex solid given as inside half-spaces m·x + c >= 0, |m| = 1. Same clip, same grow. */
export function hiddenSpanPlanes(
  a: Vec3, e: Vec3, planes: readonly { m: readonly number[]; c: number }[], toward: Vec3, sMax: number,
): [number, number] | null {
  const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
  const grow = DRAW_EPS / 2;
  let poly: P2[] = [[0, DRAW_EPS], [1, DRAW_EPS], [1, sMax], [0, sMax]];
  for (const { m, c } of planes) {
    const md = dot(m, d);
    const mv = dot(m, toward);
    const ma = dot(m, a);
    for (const sigma of [0, DRAW_EPS]) {
      poly = clip(poly, md, mv, ma + sigma * mv + c + grow);
      if (poly.length === 0) return null;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const [t] of poly) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return hi > lo ? [lo, hi] : null;
}

/** A part's BOARD box in world space, offset. Bounds read this, not the solids (Review Focus 1). A leaning part's is its
 *  real bounds (`partBounds`, splayed legs §6.1 R2), never the pre-lean box; an unleaned part's is today's sum. */
function boardBox(b: Board, off: readonly number[] | undefined): { min: Vec3; max: Vec3 } {
  if (leans(b)) {
    const r = partBounds(b);
    return { min: plus(r.min, off), max: plus(r.max, off) };
  }
  const ext = boardExtents(b);
  const min = plus(b.position, off);
  return { min, max: [min[0] + ext[0], min[1] + ext[1], min[2] + ext[2]] };
}

const corners = (bx: { min: readonly number[]; max: readonly number[] }): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [
    (k & 1 ? bx.max : bx.min)[0]!, (k & 2 ? bx.max : bx.min)[1]!, (k & 4 ? bx.max : bx.min)[2]!,
  ]);

/** One line to draw, world space, no explode offset: a chord and, on a curved part, the fine path along it (curves spec
 *  §5.1, ruling Q2: visibility is decided on the chord A→E; the path only changes what is drawn). */
interface Seg3 { A: Vec3; E: Vec3; path?: { pts: Vec3[]; at: number[] }; lift?: Vec3; feature?: string }

/** The angle cut whose plane holds both board-local ends (feature callouts spec §4.1): the first in stored order. Edges
 *  are NOT built from faces here, so `bodyEdges` stays byte-for-byte; plane membership is the whole test. */
function angleTag(b: Board, p: readonly number[], q: readonly number[]): string | undefined {
  for (const c of b.angleCuts) {
    // A cut that removes nothing has no feature (`partFeatures`), and its plane can be the part's own face.
    if (angleCutRemovesNothing(b, c)) continue;
    const h = keptHalfSpace(b, c);
    if (!h) continue;
    const on = (x: readonly number[]) => Math.abs(h.n[0] * x[0]! + h.n[1] * x[1]! + h.n[2] * x[2]! + h.d) <= DRAW_EPS;
    if (on(p) && on(q)) return featureTag(b.id, 'angle', c.id);
  }
  return undefined;
}
/** `s` with its feature key, or `s` itself (no key at all) when it has none. */
const withTag = <T extends object>(s: T, feature: string | undefined): T & { feature?: string } => (feature ? { ...s, feature } : s);
const local = (s: { length: number; width: number; thickness: number }) => [s.length, s.width, s.thickness];

/** A band's side plane on paper (edge banding chunk 2, Q6): the local axis index across the side, the plane's coordinate
 *  there, and the band's tag. Every unfaulted band with a stretch, in `BAND_SIDES` order, so an edge on two planes (a
 *  corner's through-thickness edge) takes the first side's tag. A stretch of several chords (round corner arcs, along an
 *  arch) counts too (final review 2): only its edges ON the plane take the tag, and a chord a curve or angle cut already
 *  tags keeps that tag. Read off the STORED part (the one `bandFaults` and the outline judge); nothing without band types
 *  or bands. */
interface BandPlane { k: 0 | 1; at: number; tag: string }
function bandPlanes(b: Board, bandTypes: readonly BandType[] | undefined): BandPlane[] {
  if (!bandTypes || bandTypes.length === 0 || b.bands.length === 0) return [];
  const faults = bandFaults(b, bandTypes);
  const outline = faceOutline(b);
  const out: BandPlane[] = [];
  for (const side of BAND_SIDES) {
    const band = b.bands.find((x) => sameSide(x.side, side));
    if (!band || !bandTypes.some((t) => t.id === band.type)) continue;
    if (faults.some((f) => sameSide(f.side, side))) continue;
    const st = outline && sideStretch(b, outline, side);
    if (!st) continue;
    out.push({ k: side.across === 'length' ? 0 : 1, at: side.from === 'min' ? 0 : b[side.across], tag: featureTag(b.id, 'band', band.type) });
  }
  return out;
}
const BAND_EPS = 1e-9;
function bandTag(planes: readonly BandPlane[], p: readonly number[], q: readonly number[]): string | undefined {
  for (const pl of planes) {
    if (Math.abs(p[pl.k]! - pl.at) <= BAND_EPS && Math.abs(q[pl.k]! - pl.at) <= BAND_EPS) return pl.tag;
  }
  return undefined;
}

/**
 * Splayed legs §6.2: each edge of a LEANING part, board-local (p, q), with its own-wood probe lift (`ownWoodLift`): the
 * faces holding it are those of its bodies whose plane holds both ends (judged board-local, free of the lean's round-trip
 * noise), their normals then turned to the world (`placedDir`, then the lean). Null for a part that does not lean, whose
 * edges keep today's bytes (`drawingIdentity`).
 */
function leanLifts(b: Board, toward: readonly number[]): ((p: readonly number[], q: readonly number[]) => Vec3 | undefined) | null {
  const lean = leanMap(b);
  if (!lean) return null;
  const frame = axisFrame(b);
  const faces = partGeometry(b).bodies.flatMap((body) => body.faces).map((f) => {
    const l = Math.hypot(f.n[0], f.n[1], f.n[2]);
    const n = [f.n[0] / l, f.n[1] / l, f.n[2] / l];
    return { n, d: -dot(n, f.verts[0]!), world: lean.applyDir(placedDir(frame, f.n)) };
  });
  return (p, q) => {
    const on = (x: readonly number[], f: { n: readonly number[]; d: number }) => Math.abs(dot(f.n, x) + f.d) <= 1e-9;
    return ownWoodLift(faces.filter((f) => on(p, f) && on(q, f)).map((f) => f.world), toward);
  };
}

/**
 * Which of a TENONED part's edges are the tenon's (round tenons spec §8: a tenon adds no tags; its callouts are out of scope):
 * one on a tenon's view curve (`squareSpan`), or one whose two ends lie on a built tenon's round surface (`onTenonSurface`:
 * the shoulder ring, the round side, a mitered tip's ring). Null for a tenon-free part, which keeps its path exactly.
 * `b` is the geometry view.
 */
function tenonUntagged(b: Board): ((curve: string | undefined, p: readonly number[], q: readonly number[]) => boolean) | null {
  if (!hasTenons(b)) return null;
  const views = new Set(b.curves.filter(squareSpan).map((c) => c.id));
  const at = (x: readonly number[]) => ({ length: x[0]!, width: x[1]!, thickness: x[2]! });
  return (curve, p, q) => (curve !== undefined && views.has(curve)) || (onTenonSurface(b, at(p)) && onTenonSurface(b, at(q)));
}

function partSegments(b: Board, toward: readonly number[], bandTypes?: readonly BandType[]): Seg3[] {
  const planes = bandPlanes(b, bandTypes);
  b = geometryBoard(b);
  const leanLift = leanLifts(b, toward);
  if (!shapedPart(b)) {
    return partGeometry(b).edges.map(([p, q]) => {
      const lp = local(p);
      const lq = local(q);
      const lift = leanLift?.(lp, lq);
      return withTag(lift ? { A: toWorld(b, p), E: toWorld(b, q), lift } : { A: toWorld(b, p), E: toWorld(b, q) },
        angleTag(b, lp, lq) ?? (planes.length ? bandTag(planes, lp, lq) : undefined));
    });
  }
  const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! });
  // Final review F1: an edge a curve's outline bounds carries the silhouettes' lift, so a shallow viewer-facing face
  // does not graze it hidden in its own wood. The lift moves only the hidden-line probe.
  const lifts = curveEdgeLifts(b, toward);
  const untagged = tenonUntagged(b);
  return curveDrawEdges(b).map((e, i) => {
    const A = W(e.p);
    const E = W(e.q);
    // A round tenon's edges carry NO tag (round tenons spec §8: no callouts), decided BEFORE the angle fall-through, or a
    // mitered tip's ring would take the miter's tag.
    const tag = untagged?.(e.curve, e.p, e.q) ? undefined
      : e.curve ? featureTag(b.id, 'curve', e.curve) : angleTag(b, e.p, e.q) ?? (planes.length ? bandTag(planes, e.p, e.q) : undefined);
    // A leaning part's edge no outline face lifts (a level cut's face) takes its own-wood lift (splayed legs §6.2).
    const lift = lifts[i] ?? leanLift?.(e.p, e.q);
    if (!e.path) return withTag(lift ? { A, E, lift } : { A, E }, tag);
    const step = [e.p[0], e.p[1], e.p[2]];
    step[e.path.k] = step[e.path.k]! + 1;
    // Edge-on (ruling Q3): the outline's plane holds the view direction, so a fine path would fold over itself on
    // screen (holes chunk 2 R2) — the model chord stands.
    const n = W(step).map((x, i) => x - A[i]!);
    if (Math.abs(dot(n, toward)) <= 1e-9) return withTag(lift ? { A, E, lift } : { A, E }, tag);
    return withTag({ A, E, path: { pts: e.path.pts.map(W), at: e.path.at }, ...(lift ? { lift } : {}) }, tag);
  });
}

/** The part of a box on `s`'s kept side, or null when less than SECTION_EPS of it is kept (a face on the plane). */
function keptBox(bx: { min: Vec3; max: Vec3 }, s: Section): { min: Vec3; max: Vec3 } | null {
  const k = sectionAxisIndex(s.axis);
  const min = [...bx.min] as Vec3;
  const max = [...bx.max] as Vec3;
  if (s.flip) min[k] = Math.max(min[k], s.at);
  else max[k] = Math.min(max[k], s.at);
  return max[k] - min[k] > SECTION_EPS ? { min, max } : null;
}

/** The kept side of `s` as one more inside half-space m·x + c >= 0, |m| = 1. */
function keptHalf(s: Section): { m: Vec3; c: number } {
  const m: Vec3 = [0, 0, 0];
  m[sectionAxisIndex(s.axis)] = s.flip ? 1 : -1;
  return { m, c: s.flip ? -s.at : s.at };
}

/** The chord-parameter range of A→E on `s`'s kept side (keptBySection's test), or null when none of it is kept. */
function keptRange(A: Vec3, E: Vec3, s: Section): [number, number] | null {
  const k = sectionAxisIndex(s.axis);
  const sg = s.flip ? -1 : 1;
  const fa = sg * (A[k] - s.at);
  const fe = sg * (E[k] - s.at);
  const inA = fa <= SECTION_EPS;
  const inE = fe <= SECTION_EPS;
  if (inA && inE) return [0, 1];
  if (!inA && !inE) return null;
  const t = Math.min(1, Math.max(0, fa / (fa - fe)));
  return inA ? [0, t] : [t, 1];
}

/**
 * Visible and hidden 2D segments for `parts` seen through `view` (spec §2). Edges from
 * `boardEdges` (invariant 16) — on a curved part through `curveDrawEdges`, the fine path drawn with its chord's
 * visibility (curves spec §5.1, Q2, Q3) — and hole lines from `holeDrawingSegments` (holes spec §3.4), through `toWorld`, and the curved surfaces' silhouettes from `silhouetteLines` (ruling Q1; each hidden-line probe is stepped PROBE = 4 x DRAW_EPS along the outward normal of each viewer-facing adjacent face, grazing lines still hide); occluders from `worldBodies` (invariant 38 as amended by angle-cuts spec §10).
 * No drawing order is involved, so cyclic overlaps are exact. With opts.section (section views spec §3.1), every line and
 * occluder is clipped to the kept half-space and the caps are returned. With opts.bandTypes (edge banding chunk 2, Q4–Q6),
 * each solid band's glue lines join the pass and the untagged outline edges on a banded side's plane carry its band tag;
 * without it nothing band-related is drawn or tagged.
 */
export function drawView(parts: readonly Board[], view: View, offsets?: ReadonlyMap<string, Vec3>, opts: { hiddenLines?: boolean; section?: Section; bandTypes?: readonly BandType[] } = {}): Drawing {
  const section = opts.section;
  const bandTypes = opts.bandTypes;
  // A view drawn without hidden lines (the exploded isometric, fu 344) skips the hole lines that can only be hidden.
  const visibleOnly = opts.hiddenLines === false;
  const proj = (p: readonly number[]): P2 => [dot(p, view.right), dot(p, view.up)];
  const visible: Seg2[] = [];
  const hidden: Seg2[] = [];
  if (parts.length === 0) {
    return section ? { visible, hidden, bounds: { min: [0, 0], max: [0, 0] }, caps: [] } : { visible, hidden, bounds: { min: [0, 0], max: [0, 0] } };
  }

  const boxes = parts.map((b) => boardBox(b, offsets?.get(b.id)));
  const drawn = section ? boxes.flatMap((bx) => keptBox(bx, section) ?? []) : boxes;
  const screen = drawn.flatMap((bx) => corners(bx).map(proj));
  const bounds = screen.length === 0 ? { min: [0, 0] as P2, max: [0, 0] as P2 } : {
    min: [Math.min(...screen.map((p) => p[0])), Math.min(...screen.map((p) => p[1]))] as P2,
    max: [Math.max(...screen.map((p) => p[0])), Math.max(...screen.map((p) => p[1]))] as P2,
  };
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((bx) => bx.min[i]!)));
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((bx) => bx.max[i]!)));
  const sMax = Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) + 1;

  const solids = parts.flatMap((b) => {
    const off = offsets?.get(b.id);
    return worldBodies(b).flatMap((w) => {
      let bx = w.box ? { min: plus(w.box.min, off), max: plus(w.box.max, off) } : null;
      let planes = w.box ? null : w.planes.map(({ m, c }) => ({ m, c: c - dot(m, off ?? [0, 0, 0]) }));
      if (section) {
        // Section views spec §3.1: an occluder is only its kept wood. A box stays a box; a planes body gains the plane.
        if (bx) { bx = keptBox(bx, section); if (!bx) return []; }
        else planes = [...planes!, keptHalf(section)];
      }
      // The prefilter reads the clipped box, or the unclipped vertices (conservative: it only skips work).
      const pts = bx ? corners(bx) : w.verts.map((p) => plus(p, off));
      const sp = pts.map(proj);
      return [{
        bx, planes,
        rmin: [Math.min(...sp.map((p) => p[0])), Math.min(...sp.map((p) => p[1]))],
        rmax: [Math.max(...sp.map((p) => p[0])), Math.max(...sp.map((p) => p[1]))],
        depthMax: Math.max(...pts.map((p) => dot(p, view.toward))),
      }];
    });
  });

  for (const b of parts) {
    const off = offsets?.get(b.id);
    // A part with no kept wood draws nothing, even a face lying ON the plane (review I1: a cut typed exactly at a joint
    // drew the removed neighbour's whole face over the section). The viewport keeps that face; paper does not.
    if (section && !keptBox(boardBox(b, off), section)) continue;
    // Board edges (invariant 16) and hole lines (holes spec §3.4): one list, one hidden-line pass, the same occluders —
    // the hole-free bodies, so a through-bore's far rim seen down its axis is hidden (spec §3.4, pinned by test).
    const views = hasTenons(b) ? new Set(geometryBoard(b).curves.filter(squareSpan).map((c) => c.id)) : null;
    const segments: Seg3[] = [
      ...partSegments(b, view.toward, bandTypes),
      ...holeDrawingTagged(b, view.toward, visibleOnly).map(({ A, E, row }) => ({ A, E, feature: featureTag(b.id, 'hole', row) })),
      // A round tenon's silhouettes (its round side) carry no tag (spec §8), as its edges.
      ...silhouetteLines(b, view.toward).map(({ curve, ...s }) => (views?.has(curve) ? s : { ...s, feature: featureTag(b.id, 'curve', curve) })),
      // Profile runs a2: a stopped profile's run-outs outline themselves by facet-chain silhouettes; b1: so does a swept
      // profile's surface (none on any other part).
      ...profileSilhouettes(b, view.toward).map(({ curve, ...s }) => ({ ...s, feature: featureTag(b.id, 'curve', curve) })),
      // Edge banding chunk 2 (Q4/Q5): a solid band's glue lines, board-local through `toWorld` (inv 44), in this one pass.
      ...(bandTypes ? glueLines(b, bandTypes).map(({ a, b: e, type }) => ({ A: toWorld(b, a), E: toWorld(b, e), feature: featureTag(b.id, 'band', type) })) : []),
    ];
    for (const seg of segments) {
      const A = plus(seg.A, off);
      const E = plus(seg.E, off);
      const pa = proj(A);
      const pe = proj(E);
      const length = Math.hypot(pe[0] - pa[0], pe[1] - pa[1]);
      if (length < DRAW_EPS) continue; // runs along the view direction: a point on screen
      const range = section ? keptRange(A, E, section) : null;
      if (section && !range) continue;
      const [t0, t1] = range ?? [0, 1];
      const depthMin = Math.min(dot(A, view.toward), dot(E, view.toward));
      const segMin = [Math.min(pa[0], pe[0]), Math.min(pa[1], pe[1])];
      const segMax = [Math.max(pa[0], pe[0]), Math.max(pa[1], pe[1])];

      const pA = seg.lift ? plus(A, seg.lift) : A; // the hidden test's probe (silhouettes only)
      const pE = seg.lift ? plus(E, seg.lift) : E;
      const spans: [number, number][] = [];
      for (const s of solids) {
        // Pure prefilter: a solid entirely behind the edge, or off to the side on screen, hides none of it.
        if (s.depthMax < depthMin) continue;
        if (s.rmax[0]! < segMin[0]! - DRAW_EPS || s.rmin[0]! > segMax[0]! + DRAW_EPS) continue;
        if (s.rmax[1]! < segMin[1]! - DRAW_EPS || s.rmin[1]! > segMax[1]! + DRAW_EPS) continue;
        const span = s.bx ? hiddenSpan(pA, pE, s.bx, view.toward, sMax) : hiddenSpanPlanes(pA, pE, s.planes!, view.toward, sMax);
        if (span) spans.push(span);
      }
      spans.sort((x, y) => x[0] - y[0]);
      const merged: [number, number][] = [];
      for (const s of spans) {
        const last = merged[merged.length - 1];
        if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
        else merged.push([s[0], s[1]]);
      }

      const at = (t: number): P2 => [pa[0] + t * (pe[0] - pa[0]), pa[1] + t * (pe[1] - pa[1])];
      const pp = seg.path?.pts.map((x) => proj(plus(x, off)));
      // The path's point at chord parameter t: between the two nodes bracketing it.
      const along = (t: number): P2 => {
        const ts = seg.path!.at;
        let i = 0;
        while (i < ts.length - 2 && ts[i + 1]! < t) i += 1;
        const f = (t - ts[i]!) / (ts[i + 1]! - ts[i]!);
        return [pp![i]![0] + f * (pp![i + 1]![0] - pp![i]![0]), pp![i]![1] + f * (pp![i + 1]![1] - pp![i]![1])];
      };
      const push = (out: Seg2[], t0: number, t1: number) => {
        if ((t1 - t0) * length < DRAW_EPS) return;
        if (!seg.path) { out.push(withTag({ a: at(t0), b: at(t1), part: b.id }, seg.feature)); return; }
        const pts = [along(t0), ...pp!.filter((_, i) => seg.path!.at[i]! > t0 && seg.path!.at[i]! < t1), along(t1)];
        for (let i = 0; i + 1 < pts.length; i += 1) {
          const [p, q] = [pts[i]!, pts[i + 1]!];
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= 1e-12) out.push(withTag({ a: p, b: q, part: b.id }, seg.feature));
        }
      };
      let cur = t0;
      for (const [s0, s1] of merged) {
        const h0 = Math.max(s0, t0);
        const h1 = Math.min(s1, t1);
        if (h1 <= h0) continue;
        push(visible, cur, Math.max(cur, h0));
        push(hidden, h0, h1);
        cur = Math.max(cur, h1);
      }
      push(visible, cur, t1);
    }
  }
  if (!section) return { visible, hidden, bounds };
  // The caps (invariant 51): only from sectionCaps, projected. They lie on the plane, in front of everything kept.
  const caps: CapDrawing[] = [];
  for (const b of parts) {
    const cap = sectionCaps(b, section, offsets?.get(b.id));
    if (!cap || cap.pieces.length === 0) continue;
    caps.push({
      part: b.id,
      polys: cap.pieces.map((poly) => poly.map(proj)),
      outline: cap.outline.map(([p, q]) => ({ a: proj(p), b: proj(q), part: b.id })),
    });
  }
  return { visible, hidden, bounds, caps };
}
