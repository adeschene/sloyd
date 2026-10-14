import type { Board } from './types';
import type { V3 } from './angleCuts';
import { axisFrame, boardExtents, DIMENSION_ORDER, fromWorldOffset } from './geometry';
import { clipConvex, partGeometry, BODY_EPS, type BodyFace } from './bodies';
import { holePrism, minusPrism } from './holes';
import { toWorld } from './snapPoints';

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
  const k = AXIS_INDEX[s.axis];
  const { dim, reversed } = axisFrame(board)[k]!;
  const li = DIMENSION_ORDER.indexOf(dim);
  // The GPU clips the part where it is DRAWN (position + explode offset), so the plane moves into the undrawn frame.
  const u = fromWorldOffset(board, k, s.at - (offset?.[k] ?? 0) - board.position[k]!);
  if (u < -BODY_EPS || u > board[dim] + BODY_EPS) return null;
  // Kept side in local terms: the world kept side, reflected when this axis runs reversed.
  const keepLow = s.flip === reversed;
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
  for (const hole of holes) {
    const prism = holePrism(hole);
    pieces = pieces.flatMap((p) => minusPrism(p, prism));
  }
  return pieces.length ? { pieces, li, u } : null;
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
  const local = localCapPieces(board, s, offset);
  if (!local) return null;
  const o = offset ?? [0, 0, 0];
  const w = (p: readonly number[]): V3 => {
    const q = toWorld(board, { length: p[0]!, width: p[1]!, thickness: p[2]! });
    return [q[0] + o[0]!, q[1] + o[1]!, q[2] + o[2]!];
  };
  return {
    pieces: local.pieces.map((poly) => poly.map(w)),
    outline: unionOutline(local.pieces, local.li).map(([a, b]) => [w(a), w(b)] as [V3, V3]),
  };
}

/**
 * The boundary of the union of coplanar, disjoint, consistently wound convex pieces in the plane x[li] = const: every
 * piece edge, grouped by its supporting line, with each line's stretches weighted +1 along the line's canonical
 * direction and −1 against it; a stretch whose weights sum to zero is interior (a seam between pocket cells, or one of
 * minusPrism's splits, always meets its twin running the other way) and is dropped. What is left is the cut's outline.
 */
export function unionOutline(pieces: readonly V3[][], li: number): [V3, V3][] {
  const [i, j] = [0, 1, 2].filter((d) => d !== li) as [number, number];
  const plane = pieces[0]?.[0]?.[li] ?? 0;
  interface Line { dx: number; dy: number; c: number; spans: { t0: number; t1: number; w: number }[] }
  const lines: Line[] = [];
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
      let line = lines.find((m) => Math.abs(m.dx - dx) <= 1e-9 && Math.abs(m.dy - dy) <= 1e-9 && Math.abs(m.c - c) <= SECTION_EPS);
      if (!line) { line = { dx, dy, c, spans: [] }; lines.push(line); }
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
    let runStart: number | null = null;
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const mid = (cuts[k]! + cuts[k + 1]!) / 2;
      const sum = m.spans.reduce((s, sp) => s + (sp.t0 < mid && mid < sp.t1 ? sp.w : 0), 0);
      if (sum !== 0) { if (runStart === null) runStart = cuts[k]!; }
      else if (runStart !== null) { out.push([at(m, runStart), at(m, cuts[k]!)]); runStart = null; }
    }
    if (runStart !== null) out.push([at(m, runStart), at(m, cuts[cuts.length - 1]!)]);
  }
  return out;
}
