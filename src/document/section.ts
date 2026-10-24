import type { Board } from './types';
import type { V3 } from './angleCuts';
import { axisFrame, boardExtents, DIMENSION_ORDER, fromWorldOffset, toWorldOffset } from './geometry';
import { leanMap, leans, type LeanMap } from './lean';
import { partBounds } from './worldBounds';
import { clipConvex, geometryKey, partGeometry, BODY_EPS, type BodyFace } from './bodies';
import { HOLE_EPS, holePrism, holeRegion, holeRing, minusPrism, ringInside, tiltedHole } from './holes';
import { SECTION_EPS, unionOutline } from './outline';

/**
 * The viewport's section cut (section-cut spec): ONE axis-aligned plane, view state only (never in the document).
 * `axis` names the standard view the cut is seen from (drawing.ts' FRONT/SIDE/TOP): front → z = at, side → x = at,
 * top → y = at. The kept half-space is the FAR side seen from that view (world axis value ≤ at); `flip` keeps the near
 * side. This module is the one home of the side test (`keptBySection`, invariant 51) and of the caps (`sectionCaps`).
 */
export type SectionAxis = 'front' | 'side' | 'top';
export interface Section { axis: SectionAxis; at: number; flip: boolean }

// SECTION_EPS and unionOutline live in outline.ts (curvedEdges needs them, and bodies.ts cannot import this module):
// re-exported here so every existing import keeps working.
export { SECTION_EPS, unionOutline };

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
    // A leaning part's drawn extent is its real bounds (splayed legs spec §6.1 R2); an unleaned part takes today's sum.
    if (leanMap(b)) {
      const r = partBounds(b);
      const o = offsets?.get(b.id)?.[k] ?? 0;
      lo = Math.min(lo, r.min[k]! + o);
      hi = Math.max(hi, r.max[k]! + o);
      continue;
    }
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
  // A leaning part's cut is not one of its own axis planes (splayed legs spec §6.2): it has no such local cap.
  if (leaningMap(board)) return null;
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
  const built = buildLocalPieces(board, li, u, keepLow);
  const cap: LocalCap | null = built
    ? freezeContainers({ pieces: built.pieces, outline: built.outline ?? unionOutline(built.pieces, li), li, u }) : null;
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

/**
 * The cap's pieces, and its outline when it can be had without `unionOutline` over the bored pieces (fu 348): when every
 * bore the plane meets is cut ACROSS its axis, strictly between mouth and bottom, its ring strictly inside one unbored
 * piece and clear of every other ring, the bored union's boundary is the unbored pieces' boundary plus each ring — so the
 * outline is `unionOutline` over the few unbored pieces and the rings' edges, and the ~2000 wedges minusPrism leaves
 * across a pin row are never walked (measured: ~5 ms of a drilled side's ~15). Otherwise `outline` is undefined and the
 * caller unions the pieces, as before. The pieces are minusPrism's either way.
 */
function buildLocalPieces(board: Board, li: number, u: number, keepLow: boolean): { pieces: V3[][]; outline?: [V3, V3][] } | null {
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
  // The direct outline's rings, or null once any bore the plane meets is not a clean ring inside one piece.
  let rings: V3[][] | null = [];
  const base = pieces;
  for (const hole of holes) {
    if (!rings) break;
    if (tiltedHole(hole)) {
      // A tilted bore's slice is an ellipse, or meets a slanted wall, a tilted bottom or a mouth off the plane: the
      // pieces' own union decides its outline (angled holes spec §6.2). The plane passes beside it only outside its box.
      const [lo, hi] = holeRegion(hole)[DIMENSION_ORDER[li]!];
      if (u < lo - 1e-6 || u > hi + 1e-6) continue;
      rings = null; break;
    }
    const a = DIMENSION_ORDER.indexOf(hole.axis);
    if (a !== li) {
      if (Math.abs(u - hole.centre[li]!) > hole.radius + 1e-6) continue;   // the plane passes beside this bore
      rings = null; break;
    }
    const t = hole.dir * (u - hole.centre[a]!);
    if (t < -1e-6 || t > hole.depth + 1e-6) continue;                     // above its mouth or below its bottom
    if (t < 1e-6 || t > hole.depth - 1e-6) { rings = null; break; }       // on the mouth or the bottom: the prism's caps decide
    const ring = holeRing(hole, t).map((p) => { const q: V3 = [p[0], p[1], p[2]]; q[li] = u; return q; });
    if (!base.some((poly) => ringInside(poly, capN, ring))) { rings = null; break; }
    rings.push(ring);
  }
  if (rings) {
    const [i, j] = [0, 1, 2].filter((k) => k !== li) as [number, number];
    const c = rings.map((r) => [r.reduce((s2, p) => s2 + p[i]!, 0) / r.length, r.reduce((s2, p) => s2 + p[j]!, 0) / r.length]);
    const rad = rings.map((r, k) => Math.hypot(r[0]![i]! - c[k]![0]!, r[0]![j]! - c[k]![1]!));
    if (!rings.every((_, k) => rings!.every((__, m) => m <= k || Math.hypot(c[k]![0]! - c[m]![0]!, c[k]![1]! - c[m]![1]!) > rad[k]! + rad[m]! + HOLE_EPS))) rings = null;
  }
  let boxed = pieces.map(boxOf);
  for (const hole of holes) {
    // A square bore's reach is its centre ± (radius + depth); a tilted one's is its box (`holeRegion`, exact for the true
    // cylinder), which a steep bore's far mouth or a tilted mouth's ellipse can carry past that (angled holes spec §6.2).
    const lo: number[] = [], hi: number[] = [];
    if (tiltedHole(hole)) {
      const r = holeRegion(hole);
      DIMENSION_ORDER.forEach((d, k) => { lo[k] = r[d][0] - 1e-4; hi[k] = r[d][1] + 1e-4; });
    } else {
      const reach = hole.radius + hole.depth + 1e-4;
      for (let k = 0; k < 3; k += 1) { lo[k] = hole.centre[k]! - reach; hi[k] = hole.centre[k]! + reach; }
    }
    if (u < lo[li]! || u > hi[li]!) continue;                   // the plane is farther from the bore than it can reach
    const prism = holePrism(hole);
    const next: typeof boxed = [];
    for (const b of boxed) {
      let near = true;
      for (let k = 0; k < 3; k += 1) if (b.hi[k]! < lo[k]! || b.lo[k]! > hi[k]!) { near = false; break; }
      if (!near) next.push(b);
      else for (const q of minusPrism(b.poly, prism)) next.push(q === b.poly ? b : boxOf(q));
    }
    boxed = next;
  }
  pieces = boxed.map((b) => b.poly);
  if (!pieces.length) return null;
  if (!rings || rings.length === 0) return { pieces };
  return { pieces, outline: [...unionOutline(base, li), ...rings.flatMap((r) => r.map((p, k) => [p, r[(k + 1) % r.length]!] as [V3, V3]))] };
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

/** The lean `sectionCaps` draws, under BoardMesh's own gate (`leans` and a map): a part the renderer does not lean
 *  is capped unleaned, so a cap never disagrees with the mesh it closes. */
function leaningMap(board: Board): LeanMap | null {
  return leans(board) ? leanMap(board) : null;
}

/**
 * A leaning part's cap (splayed legs spec §6.2), in the PIVOT frame: q = m · (the pre-lean world point − pivot), so the
 * drawn world point is q + pivot + offset — the map `leanMap(board).apply` makes, then the explode offset, as BoardMesh's
 * leaned group draws it. The frame does not depend on the part's position (the pivot is position + fixed extents), so the
 * world plane x[k] = at is the pivot-frame plane q[k] = u = at − offset[k] − pivot[k], axis-aligned again. Each convex
 * body (invariant 48) is clipped, in board-local terms, by that plane taken through the lean's inverse (`inverseDir`) and
 * the part's own frame (inv 44); the cut faces are carried into the pivot frame, wound counter-clockwise about the cap's
 * normal and outlined there by `unionOutline` along k, as an unleaned cap is along its local axis.
 *
 * Its bores are subtracted (angled holes spec §6.2): each cut face, still board-local, loses every bore's prism
 * (`minusPrism`, the part's own frame) BEFORE it is carried into the pivot frame, so a leaned bore is capped exactly as an
 * unleaned one, through the same lean as the wood around it.
 */
function buildLeaningPieces(board: Board, map: LeanMap, k: number, u: number, flip: boolean): LocalCap | null {
  const frame = axisFrame(board);
  const ext = boardExtents(board);
  const half = [ext[0] / 2, ext[1], ext[2] / 2];   // pivot − position (leanMap's pivot: the top face's centre)
  // Board-local → pre-lean world − pivot, per world axis j: b0[j] + scale[j] · p[li[j]] (affine per axis, as sectionCaps).
  const li: number[] = [], b0: number[] = [], scale: number[] = [];
  for (let j = 0; j < 3; j += 1) {
    li[j] = DIMENSION_ORDER.indexOf(frame[j]!.dim);
    const at0 = toWorldOffset(board, j, 0, frame);
    b0[j] = at0 - half[j]!;
    scale[j] = toWorldOffset(board, j, 1, frame) - at0;
  }
  // The kept side in the pivot frame: N·q − N[k]·u ≥ 0, N the world plane's kept normal (sectionPlaneOf's).
  const N: V3 = [0, 0, 0];
  N[k] = flip ? 1 : -1;
  const nW = map.inverseDir(N);                    // the same normal before the lean
  const n: V3 = [0, 0, 0];
  let d = -N[k]! * u;
  for (let j = 0; j < 3; j += 1) { n[li[j]!] = nW[j]! * scale[j]!; d += nW[j]! * b0[j]!; }
  const h = { n, d };                              // kept where n·p + d ≥ 0, p board-local
  const g = (p: readonly number[]) => n[0] * p[0]! + n[1] * p[1]! + n[2] * p[2]! + d;
  const toPivot = (p: readonly number[]): V3 => {
    const w = [b0[0]! + scale[0]! * p[li[0]!]!, b0[1]! + scale[1]! * p[li[1]!]!, b0[2]! + scale[2]! * p[li[2]!]!];
    const m = map.m;
    return [
      m[0][0] * w[0]! + m[0][1] * w[1]! + m[0][2] * w[2]!,
      m[1][0] * w[0]! + m[1][1] * w[1]! + m[1][2] * w[2]!,
      m[2][0] * w[0]! + m[2][1] * w[1]! + m[2][2] * w[2]!,
    ];
  };
  const { bodies, holes } = partGeometry(board);
  let local: V3[][] = [];
  for (const body of bodies) {
    const faces = body.faces as BodyFace[];
    const clipped = clipConvex(faces, h);
    if (clipped.length === 0) continue;
    if (clipped === faces) {
      // Nothing removed: a face lying ON the plane and facing the removed side is the cut (a levelled foot under a Top
      // plane at the floor), capped so the part never reads hollow, as the unleaned path does. A turned face's normal
      // is not exact, so the facing test takes a tolerance.
      const f = faces.find((q) => q.n[0] * n[0] + q.n[1] * n[1] + q.n[2] * n[2] < -1 + BODY_EPS
        && q.verts.every((p) => Math.abs(g(p)) <= BODY_EPS));
      if (f) local.push(f.verts);
      continue;
    }
    const cap = clipped.find((q) => q.cut === '');
    if (cap) local.push(cap.verts);
  }
  // The bores, board-local (minusPrism's own box test passes a piece the bore misses through whole).
  for (const hole of holes) {
    const prism = holePrism(hole);
    local = local.flatMap((poly) => minusPrism(poly, prism));
  }
  let pieces = local.map((poly) => poly.map(toPivot));
  if (!pieces.length) return null;
  // ONE winding, counter-clockwise about the cap's normal −N (it faces the removed side), for unionOutline's cancellation.
  pieces = pieces.map((poly) => (newellAlong(poly, k) * -N[k]! < 0 ? [...poly].reverse() : poly));
  return freezeContainers({ pieces, outline: unionOutline(pieces, k), li: k, u });
}

/** `v` exactly, `-0` apart from 0, for a cache key. */
const exact = (v: number) => (Object.is(v, -0) ? '-0' : String(v));

/**
 * A leaning part's cap through the local-cap cache (invariant 51), in the pivot frame. ONE slot per (part id, axis, side),
 * as `localCap`'s, under its own prefix; a hit needs the same geometry key, the same lean (x, z, face, exact), the same
 * turn and posture (the frame and the twist read them), and the same pivot-frame plane `u` (Object.is). A move that keeps
 * `u` (across the plane's direction) only translates the cap, as a placed part's does.
 */
function leaningCap(board: Board, map: LeanMap, s: Section, offset?: readonly number[]): LocalCap | null {
  const k = AXIS_INDEX[s.axis];
  const u = s.at - (offset?.[k] ?? 0) - map.pivot[k]!;
  const lean = board.lean!;
  const key = `lean|${k}|${s.flip ? 'near' : 'far'}|${board.id}`;
  const geo = `${geometryKey(board)}|${exact(lean.x)},${exact(lean.z)},${lean.face}|${board.rotation}|${board.posture}`;
  const hit = LOCAL_CAPS.get(key);
  if (hit) LOCAL_CAPS.delete(key);
  if (hit && hit.geo === geo && Object.is(hit.u, u)) { LOCAL_CAPS.set(key, hit); return hit.cap; }
  const cap = buildLeaningPieces(board, map, k, u, s.flip);
  LOCAL_CAPS.set(key, { geo, u, cap });
  if (LOCAL_CAPS.size > LOCAL_CAPS_MAX) LOCAL_CAPS.delete(LOCAL_CAPS.keys().next().value!);
  return cap;
}

/** THE caps (section-cut spec §3.1): a part's cut faces in world inches where the part is DRAWN (explode offset
 *  added), or null. A leaning part's are where its lean draws it (splayed legs spec §6.2): BoardMesh renders that cap
 *  OUTSIDE the leaned group, so it is never leaned twice. */
export function sectionCaps(board: Board, s: Section, offset?: readonly number[]): SectionCap | null {
  const map = leaningMap(board);
  if (map) {
    const cap = leaningCap(board, map, s, offset);
    if (!cap) return null;
    const o = offset ?? [0, 0, 0];
    const t = [map.pivot[0] + o[0]!, map.pivot[1] + o[1]!, map.pivot[2] + o[2]!];
    // New arrays every call: no cached point leaves this module.
    const w = (p: readonly number[]): V3 => [p[0]! + t[0]!, p[1]! + t[1]!, p[2]! + t[2]!];
    return {
      pieces: cap.pieces.map((poly) => poly.map(w)),
      outline: cap.outline.map(([a, b]) => [w(a), w(b)] as [V3, V3]),
    };
  }
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
