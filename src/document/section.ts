import type { Board } from './types';
import type { V3 } from './angleCuts';
import { axisFrame, boardExtents, DIMENSION_ORDER, fromWorldOffset, toWorldOffset } from './geometry';
import { clipConvex, geometryKey, partGeometry, BODY_EPS, type BodyFace } from './bodies';
import { holePrism, minusPrism } from './holes';

/**
 * The viewport's section cut (section-cut spec): ONE axis-aligned plane, view state only (never in the document).
 * `axis` names the standard view the cut is seen from (drawing.ts' FRONT/SIDE/TOP): front → z = at, side → x = at,
 * top → y = at. The kept half-space is the FAR side seen from that view (world axis value ≤ at); `flip` keeps the near
 * side. This module is the one home of the side test (`keptBySection`, invariant 51) and of the caps (`sectionCaps`).
 */
export type SectionAxis = 'front' | 'side' | 'top';
export interface Section { axis: SectionAxis; at: number; flip: boolean }

/** Inches: a point this close to the plane is ON it, and kept. Well above float drift of `position + offset` sums at
 *  furniture scale, far below anything visible. */
export const SECTION_EPS = 1e-7;

const AXIS_INDEX: Readonly<Record<SectionAxis, 0 | 1 | 2>> = { side: 0, top: 1, front: 2 };

export function sectionAxisIndex(axis: SectionAxis): 0 | 1 | 2 {
  return AXIS_INDEX[axis];
}

/** THE side test: picking, snapping and the caps' kept side all read it. No section keeps everything. */
export function keptBySection(s: Section | null, p: readonly number[]): boolean {
  if (!s) return true;
  const v = p[AXIS_INDEX[s.axis]]! - s.at;
  return s.flip ? v >= -SECTION_EPS : v <= SECTION_EPS;
}

/** The plane as THREE.Plane wants it: kept where normal·p + constant ≥ 0 (three clips the negative side). */
export function sectionPlaneOf(s: Section): { normal: V3; constant: number } {
  const normal: V3 = [0, 0, 0];
  normal[AXIS_INDEX[s.axis]] = s.flip ? 1 : -1;
  return { normal, constant: s.flip ? -s.at : s.at };
}

/** The parts' drawn extent along the axis (explode offsets added, as framing's subsetBounds), or null with no parts. */
export function sectionSpan(
  boards: readonly Board[], offsets: ReadonlyMap<string, readonly number[]> | null, axis: SectionAxis,
): [number, number] | null {
  if (boards.length === 0) return null;
  const k = AXIS_INDEX[axis];
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of boards) {
    const min = b.position[k]! + (offsets?.get(b.id)?.[k] ?? 0);
    lo = Math.min(lo, min);
    hi = Math.max(hi, min + boardExtents(b)[k]!);
  }
  return [lo, hi];
}

export interface SectionCap { pieces: V3[][]; outline: [V3, V3][] }

/**
 * A part's cap in its own coordinates: the plane is one of the part's axis planes, because a placed part turns only in
 * quarter turns and the composition resolves mirroring before the part is drawn (invariants 44, 46). Pieces are convex
 * and wound counter-clockwise about the cap's normal (which faces the REMOVED side), so `unionOutline` can cancel seams.
 * Null when the plane misses the part or nothing of it is cut.
 */
export function localCapPieces(
  board: Board, s: Section, offset?: readonly number[],
): { pieces: V3[][]; li: number; u: number } | null {
  const local = localCap(board, s, offset);
  // A COPY: the cached pieces never leave this module (see LOCAL_CAPS).
  return local && { pieces: local.pieces.map((poly) => poly.map((p) => [p[0], p[1], p[2]] as V3)), li: local.li, u: local.u };
}

/** A part's cap in its own coordinates, pieces AND outline. Cached and shared between calls: never mutated. */
interface LocalCap { pieces: readonly (readonly V3[])[]; outline: readonly (readonly [V3, V3])[]; li: number; u: number }

/**
 * The local cap depends only on the part's geometry (`geometryKey`, what `partGeometry` reads), the local axis `li`,
 * the plane's local place `u` (exact) and the kept side. A move that leaves `u` alone (a gizmo or group move across the
 * plane's direction, a resize along another axis) only translates the cap, so the pieces and outline are kept and only
 * the world map is redone (section-cut final review I3, measured in sectionPerf.test.ts: about 12-14 ms -> 0.5 ms).
 *
 * ONE entry per (part id, li, side), holding the geometry key and `u` it was built for: a slider drag never revisits an
 * exact `u`, and a resize drag never revisits a geometry, so keeping old ones would only retain megabytes of pieces for
 * the collector (measured: an LRU keyed on every geometry and `u` cost the fresh-geometry case about 2 ms a cap). The
 * id only picks the slot; a hit needs the same geometry key and the same `u` (Object.is), so two parts sharing an id
 * across projects can never read each other's cap. At most LOCAL_CAPS_MAX slots, least recently used evicted.
 *
 * Never mutated: the containers (piece list, each piece, outline list, each segment) are frozen, and no cached POINT
 * is reachable outside this module — `sectionCaps` maps every point into new world arrays and `localCapPieces` copies —
 * so freezing the 6000-odd points of a drilled side's cap (measured: about 1 ms, and slower reads after) buys nothing.
 */
const LOCAL_CAPS = new Map<string, { geo: string; u: number; cap: LocalCap | null }>();
const LOCAL_CAPS_MAX = 64;

function localCap(board: Board, s: Section, offset?: readonly number[]): LocalCap | null {
  const k = AXIS_INDEX[s.axis];
  const { dim, reversed } = axisFrame(board)[k]!;
  const li = DIMENSION_ORDER.indexOf(dim);
  // The GPU clips the part where it is DRAWN (position + explode offset), so the plane moves into the undrawn frame.
  const u = fromWorldOffset(board, k, s.at - (offset?.[k] ?? 0) - board.position[k]!);
  if (u < -BODY_EPS || u > board[dim] + BODY_EPS) return null;
  // Kept side in local terms: the world kept side, reflected when this axis runs reversed.
  const keepLow = s.flip === reversed;
  const key = `${li}|${keepLow ? 'lo' : 'hi'}|${board.id}`;
  const geo = geometryKey(board);
  const hit = LOCAL_CAPS.get(key);
  if (hit) LOCAL_CAPS.delete(key);                     // re-inserted below: most recently used
  // Object.is: exact, and -0 is not 0 (the halfspace's `d` would differ in sign).
  if (hit && hit.geo === geo && Object.is(hit.u, u)) { LOCAL_CAPS.set(key, hit); return hit.cap; }
  const pieces = buildLocalPieces(board, li, u, keepLow);
  const cap: LocalCap | null = pieces ? freezeContainers({ pieces, outline: unionOutline(pieces, li), li, u }) : null;
  LOCAL_CAPS.set(key, { geo, u, cap });
  if (LOCAL_CAPS.size > LOCAL_CAPS_MAX) LOCAL_CAPS.delete(LOCAL_CAPS.keys().next().value!);
  return cap;
}

function freezeContainers(o: { pieces: V3[][]; outline: [V3, V3][]; li: number; u: number }): LocalCap {
  for (const poly of o.pieces) Object.freeze(poly);
  for (const seg of o.outline) Object.freeze(seg);
  Object.freeze(o.pieces);
  Object.freeze(o.outline);
  return Object.freeze(o);
}

function buildLocalPieces(board: Board, li: number, u: number, keepLow: boolean): V3[][] | null {
  const n: V3 = [0, 0, 0];
  n[li] = keepLow ? -1 : 1;
  const h = { n, d: keepLow ? u : -u };          // kept where n·x + d ≥ 0
  const capN: V3 = [-n[0], -n[1], -n[2]];          // the cap faces the removed side
  const onPlane = (p: readonly number[]) => Math.abs(p[li]! - u) <= BODY_EPS;
  const { bodies, holes } = partGeometry(board);
  let pieces: V3[][] = [];
  for (const body of bodies) {
    const faces = body.faces as BodyFace[];
    const clipped = clipConvex(faces, h);
    if (clipped.length === 0) continue;
    if (clipped === faces) {
      // Nothing removed: a face of this body lying ON the plane and facing the removed side is the cut (a seam a
      // holed body's mesh subtracts, or an outer face) — cap it, so the part never reads hollow (plan amendment).
      const f = faces.find((g) => g.n[li] === capN[li] && g.verts.every(onPlane));
      if (f) pieces.push(f.verts.map((p) => [p[0], p[1], p[2]] as V3));
      continue;
    }
    const cap = clipped.find((g) => g.cut === '');
    if (cap) pieces.push(cap.verts);
  }
  // ONE winding for every piece (counter-clockwise about capN): `clip`'s cap is ringed about the KEPT side's normal,
  // a body face is wound about its own outward normal (capN) — opposite ways. pocketCells MERGES cells (mergeAlong),
  // so a plane on a grid line can both cut a merged slab and lie on a neighbour's face, mixing the two; unionOutline's
  // cancellation needs them to agree. minusPrism keeps a polygon's winding.
  pieces = pieces.map((poly) => (newellAlong(poly, li) * capN[li]! < 0 ? [...poly].reverse() : poly));
  // A hole can only touch a piece whose box meets the hole's (centre ± radius + depth, generous on every axis), so
  // minusPrism sees only those; the rest pass through untouched (its own first test would have returned them too).
  const boxOf = (poly: V3[]) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of poly) for (let k = 0; k < 3; k += 1) { if (p[k]! < lo[k]!) lo[k] = p[k]!; if (p[k]! > hi[k]!) hi[k] = p[k]!; }
    return { poly, lo, hi };
  };
  let boxed = pieces.map(boxOf);
  for (const hole of holes) {
    const reach = hole.radius + hole.depth + 1e-4;
    if (Math.abs(hole.centre[li]! - u) > reach) continue;       // the plane is farther from the bore than it can reach
    const prism = holePrism(hole);
    const next: typeof boxed = [];
    for (const b of boxed) {
      let near = true;
      for (let k = 0; k < 3; k += 1) if (b.hi[k]! < hole.centre[k]! - reach || b.lo[k]! > hole.centre[k]! + reach) { near = false; break; }
      if (!near) next.push(b);
      else for (const q of minusPrism(b.poly, prism)) next.push(q === b.poly ? b : boxOf(q));
    }
    boxed = next;
  }
  pieces = boxed.map((b) => b.poly);
  return pieces.length ? pieces : null;
}

/** Twice the signed area of a polygon projected along index `li` (Newell's component `li`). */
function newellAlong(poly: readonly V3[], li: number): number {
  const [i, j] = [(li + 1) % 3, (li + 2) % 3] as const;
  let a = 0;
  for (let n = 0; n < poly.length; n += 1) {
    const p = poly[n]!, q = poly[(n + 1) % poly.length]!;
    a += (p[i] - q[i]) * (p[j] + q[j]);
  }
  return a;
}

/** THE caps (section-cut spec §3.1): a part's cut faces in world inches where the part is DRAWN (explode offset
 *  added), or null. */
export function sectionCaps(board: Board, s: Section, offset?: readonly number[]): SectionCap | null {
  const local = localCap(board, s, offset);
  if (!local) return null;
  const o = offset ?? [0, 0, 0];
  // toWorld is affine per axis (position + a reflection or not): evaluate axisFrame's helper once at 0 and 1 per axis.
  const frame = axisFrame(board);
  const li: number[] = [], base: number[] = [], scale: number[] = [];
  for (let k = 0; k < 3; k += 1) {
    li[k] = DIMENSION_ORDER.indexOf(frame[k]!.dim);
    const at0 = toWorldOffset(board, k, 0, frame);
    base[k] = board.position[k]! + at0 + o[k]!;
    scale[k] = toWorldOffset(board, k, 1, frame) - at0;
  }
  const w = (p: readonly number[]): V3 => [
    base[0]! + scale[0]! * p[li[0]!]!, base[1]! + scale[1]! * p[li[1]!]!, base[2]! + scale[2]! * p[li[2]!]!,
  ];
  return {
    pieces: local.pieces.map((poly) => poly.map(w)),
    outline: local.outline.map(([a, b]) => [w(a), w(b)] as [V3, V3]),
  };
}

/**
 * The boundary of the union of coplanar, disjoint, consistently wound convex pieces in the plane x[li] = const: every
 * piece edge, grouped by its supporting line, with each line's stretches weighted +1 along the line's canonical
 * direction and −1 against it; a stretch whose weights sum to zero is interior (a seam between pocket cells, or one of
 * minusPrism's splits, always meets its twin running the other way) and is dropped. What is left is the cut's outline.
 */
export function unionOutline(pieces: readonly (readonly V3[])[], li: number): [V3, V3][] {
  const [i, j] = [0, 1, 2].filter((d) => d !== li) as [number, number];
  const plane = pieces[0]?.[0]?.[li] ?? 0;
  interface Line { dx: number; dy: number; c: number; spans: { t0: number; t1: number; w: number }[] }
  const lines: Line[] = [];
  // Lines are bucketed on (dx, dy, c) quantised to their tolerances; a lookup visits the 27 neighbouring cells and takes
  // the EARLIEST-created line within tolerance, which is what a linear first-match scan returned.
  const buckets = new Map<number, number[]>();
  const hash = (x: number, y: number, z: number) => (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)) | 0;
  // Cells are 10x the tolerance, so a value is within tolerance of at most one neighbouring cell, and only when it sits
  // in the cell's outer tenth.
  const QA = 1e-8, QC = SECTION_EPS * 10;
  const qa = (v: number) => Math.floor(v / QA);
  const qc = (v: number) => Math.floor(v / QC);
  // The cell below (-1), the cell itself (0) or the cell above (+1) may hold a match; `lo`/`hi` say which are in reach.
  const reach = (v: number, cell: number, tol: number, out: number[]): number => {
    const q = Math.floor(v / cell), f = v - q * cell;
    out[0] = q;
    if (f <= 2 * tol) { out[1] = q - 1; return 2; }
    if (cell - f <= 2 * tol) { out[1] = q + 1; return 2; }
    return 1;
  };
  const rx: number[] = [0, 0], ry: number[] = [0, 0], rz: number[] = [0, 0];
  const findLine = (dx: number, dy: number, c: number): Line | undefined => {
    let best = -1;
    const nx = reach(dx, QA, 1e-9, rx), ny = reach(dy, QA, 1e-9, ry), nz = reach(c, QC, SECTION_EPS, rz);
    for (let a = 0; a < nx; a += 1) for (let b = 0; b < ny; b += 1) for (let e = 0; e < nz; e += 1) {
      const ids = buckets.get(hash(rx[a]!, ry[b]!, rz[e]!));
      if (!ids) continue;
      for (const id of ids) {
        if (best !== -1 && id > best) break;
        const m = lines[id]!;
        if (Math.abs(m.dx - dx) <= 1e-9 && Math.abs(m.dy - dy) <= 1e-9 && Math.abs(m.c - c) <= SECTION_EPS) { best = id; break; }
      }
    }
    return best === -1 ? undefined : lines[best];
  };
  for (const poly of pieces) {
    for (let n = 0; n < poly.length; n += 1) {
      const p = poly[n]!, q = poly[(n + 1) % poly.length]!;
      let dx = q[i] - p[i], dy = q[j] - p[j];
      const l = Math.hypot(dx, dy);
      if (l <= SECTION_EPS) continue;
      dx /= l; dy /= l;
      let w = 1;
      if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; w = -1; }
      const c = -dy * p[i] + dx * p[j];                    // offset along the line's normal (−dy, dx)
      const ta = dx * p[i] + dy * p[j], tb = dx * q[i] + dy * q[j];
      let line = findLine(dx, dy, c);
      if (!line) {
        line = { dx, dy, c, spans: [] };
        const key = hash(qa(dx), qa(dy), qc(c));
        const ids = buckets.get(key);
        if (ids) ids.push(lines.length); else buckets.set(key, [lines.length]);
        lines.push(line);
      }
      line.spans.push({ t0: Math.min(ta, tb), t1: Math.max(ta, tb), w });
    }
  }
  const out: [V3, V3][] = [];
  const at = (m: Line, t: number): V3 => {
    const v: V3 = [0, 0, 0];
    v[li] = plane;
    v[i] = -m.dy * m.c + m.dx * t;
    v[j] = m.dx * m.c + m.dy * t;
    return v;
  };
  for (const m of lines) {
    const ts = m.spans.flatMap((s) => [s.t0, s.t1]).sort((a, b) => a - b);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > SECTION_EPS) cuts.push(t);
    // A span is live at mid when t0 < mid < t1: a sweep over starts and ends sorted by t (t0 < t1 always).
    const starts = [...m.spans].sort((a, b) => a.t0 - b.t0);
    const ends = [...m.spans].sort((a, b) => a.t1 - b.t1);
    let si = 0, ei = 0, sum = 0;
    let runStart: number | null = null;
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const mid = (cuts[k]! + cuts[k + 1]!) / 2;
      while (si < starts.length && starts[si]!.t0 < mid) { sum += starts[si]!.w; si += 1; }
      while (ei < ends.length && ends[ei]!.t1 <= mid) { sum -= ends[ei]!.w; ei += 1; }
      if (sum !== 0) { if (runStart === null) runStart = cuts[k]!; }
      else if (runStart !== null) { out.push([at(m, runStart), at(m, cuts[k]!)]); runStart = null; }
    }
    if (runStart !== null) out.push([at(m, runStart), at(m, cuts[cuts.length - 1]!)]);
  }
  return out;
}
