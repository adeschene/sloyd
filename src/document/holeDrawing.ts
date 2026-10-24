import type { Board } from './types';
import type { V3 } from './angleCuts';
import { DIMENSION_ORDER } from './geometry';
import { partGeometry } from './bodies';
import { holeBottom, holeRing, tiltedHole, type Hole } from './holes';
import { holeInStock, stockChecks } from './holeFaults';
import { toWorld } from './snapPoints';

type Vec3 = [number, number, number];

/** The polygon a hole's rim is DRAWN as on the sheet (print scale; spec §3.4). The viewport keeps HOLE_SEGMENTS (48). */
export const DRAWING_HOLE_SEGMENTS = 96;

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * One part's hole lines for a view looking along `toward` (from the model to the viewer), in world space, no explode
 * offset (spec §3.4): every hole's entry rim and far rim (a through hole's exit, a blind hole's bottom) as
 * DRAWING_HOLE_SEGMENTS-gons — a rim whose plane is edge-on to the view as the ONE segment it projects to (ruling R2) —
 * and, unless the view looks down the axis, the wall's two silhouette generators, the lines where the cylinder's surface turns away from the viewer. Built only from `toWorld` of board-local points
 * (invariant 44): the radial directions U, V and the axis A are differences of mapped points, so every turn, posture and
 * mirror is the one composition's. The silhouette's radial r = (V·T)·U − (U·T)·V, scaled to the radius, is the one
 * direction in the disc plane perpendicular to T. drawView decides what is hidden; this module decides nothing about it.
 * Rims come first, then the silhouettes.
 *
 * `visibleOnly` (fu 344: a view that draws no hidden lines, the Plans sheet's exploded isometric): a CLEAN hole's
 * (holeInStock) blind bottom rim and wall silhouettes are left out — they lie inside the hole-free occluding body, so they
 * are always hidden, and the hidden-line pass only threw them away. A faulted hole keeps every line (its wall can run
 * into air).
 */
export function holeDrawingSegments(b: Board, toward: readonly number[], visibleOnly = false): [Vec3, Vec3][] {
  return holeDrawingTagged(b, toward, visibleOnly).map(({ A, E }) => [A, E]);
}

/** `holeDrawingSegments` with each segment's ROW id, so the Plans sheet can key a row's lines (feature callouts spec §4.1). */
export function holeDrawingTagged(b: Board, toward: readonly number[], visibleOnly = false): { A: Vec3; E: Vec3; row: string }[] {
  const holes = partGeometry(b).holes;
  if (holes.length === 0) return [];
  const checks = visibleOnly ? stockChecks(b) : null;
  const inside = (h: (typeof holes)[number]) => checks !== null && holeInStock(b, h, checks);
  const P = (p: readonly number[]): Vec3 => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! });
  // Per hole: its rims, then its wall silhouettes; the sheet takes every hole's rims first, then every wall.
  const lines = holes.map((h): { rims: Line[]; walls: Line[] } =>
    tiltedHole(h) ? tiltedLines(h, P, toward, inside(h)) : squareLines(h, P, toward, inside(h)));
  return [...lines.flatMap((l) => l.rims), ...lines.flatMap((l) => l.walls)];
}

type Line = { A: Vec3; E: Vec3; row: string };
type ToWorld = (p: readonly number[]) => Vec3;

/** A square hole's lines, as they always were (drawingIdentity): its world frame from mapped points only — centre C,
 *  axis A (entry to far rim), silhouette radial r (null when the view looks down the axis), and whether the rim's plane
 *  is edge-on to the view. */
function squareLines(h: Hole, P: ToWorld, toward: readonly number[], clean: boolean): { rims: Line[]; walls: Line[] } {
  const rims: Line[] = [];
  const walls: Line[] = [];
  const a = DIMENSION_ORDER.indexOf(h.axis);
  const [u, v] = [0, 1, 2].filter((i) => i !== a) as [number, number];
  const at = (du: number, dv: number, t: number): Vec3 => {
    const p: V3 = [h.centre[0], h.centre[1], h.centre[2]];
    p[u] += du; p[v] += dv; p[a] += h.dir * t;
    return P(p);
  };
  const C = at(0, 0, 0);
  const U = at(h.radius, 0, 0).map((x, i) => x - C[i]!);
  const V = at(0, h.radius, 0).map((x, i) => x - C[i]!);
  const A = at(0, 0, h.depth).map((x, i) => x - C[i]!);
  const tu = dot(U, toward);
  const tv = dot(V, toward);
  const n = Math.hypot(tu, tv);
  // Looking down the axis: the rim covers the wall, no silhouettes.
  const r = n <= 1e-9 * h.radius ? null : [0, 1, 2].map((i) => (tv * U[i]! - tu * V[i]!) / n);
  const edgeOn = Math.abs(dot(A, toward)) <= 1e-9 * Math.hypot(A[0]!, A[1]!, A[2]!);
  for (const t of [0, h.depth]) {
    if (clean && !h.through && t === h.depth) continue;   // visibleOnly: a clean blind bottom is always hidden
    if (edgeOn && r) {
      // Edge-on, the rim projects to exactly the diameter across r (ruling R2): ONE segment, not 96 chords folded back
      // along one line, so a hidden rim reads dashed on the sheet.
      const k = t / h.depth;
      const c = [C[0] + k * A[0]!, C[1] + k * A[1]!, C[2] + k * A[2]!];
      rims.push({
        A: [c[0]! - r[0]!, c[1]! - r[1]!, c[2]! - r[2]!],
        E: [c[0]! + r[0]!, c[1]! + r[1]!, c[2]! + r[2]!],
        row: h.row,
      });
      continue;
    }
    const ring = holeRing(h, t, DRAWING_HOLE_SEGMENTS).map(P);
    for (let i = 0; i < ring.length; i += 1) rims.push({ A: ring[i]!, E: ring[(i + 1) % ring.length]!, row: h.row });
  }
  if (r && !clean) {   // visibleOnly: a clean hole's wall is always hidden
    for (const s of [1, -1]) {
      const p0: Vec3 = [C[0] + s * r[0]!, C[1] + s * r[1]!, C[2] + s * r[2]!];
      walls.push({ A: p0, E: [p0[0] + A[0]!, p0[1] + A[1]!, p0[2] + A[2]!], row: h.row });
    }
  }
  return { rims, walls };
}

/**
 * A tilted bore's lines (angled holes spec §8), from mapped points only as the square path's: the mouth and the exit
 * (through) are ellipses on face-parallel planes, `holeRing` at axial 0 and `reach`; a blind bottom is the disc square to
 * the bit, `holeBottom`. The edge-on single-segment rule reads each RIM PLANE's normal — the face axis for a mouth and a
 * through exit, the unit bit b̂ for a blind bottom — never the bit for a face-parallel rim. Edge-on, the rim (centre c,
 * world half-axes P0 = ring vertex θ 0 − c and Q0 = vertex θ π/2 − c) projects to its extent along s, the in-plane line
 * square to the view: the two rim points `c ± (P0·s P0 + Q0·s Q0) / hypot(P0·s, Q0·s)`. The silhouettes are the general
 * cylinder's: the generators at `±r·(b̂ × toward)/|b̂ × toward|` off the bit's line (none looking down the bit), each run
 * from the mouth plane to the far rim's plane — slid along the bit onto a face plane, square to the bit already on a
 * bottom disc.
 */
function tiltedLines(h: Hole, P: ToWorld, toward: readonly number[], clean: boolean): { rims: Line[]; walls: Line[] } {
  const rims: Line[] = [];
  const walls: Line[] = [];
  const a = DIMENSION_ORDER.indexOf(h.axis);
  const local = (t: number, scale: number): V3 => [h.centre[0] + t * scale * h.bit[0], h.centre[1] + t * scale * h.bit[1], h.centre[2] + t * scale * h.bit[2]];
  const C = P(h.centre);
  const minus = (p: readonly number[], q: readonly number[]): Vec3 => [p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!];
  const unit = (p: readonly number[]): Vec3 => { const m = Math.hypot(p[0]!, p[1]!, p[2]!); return [p[0]! / m, p[1]! / m, p[2]! / m]; };
  const B = minus(P(local(1, 1)), C);                       // the bit in world: axial component ±1 along the face normal
  const bHat = unit(B);
  const axisLocal: V3 = [h.centre[0], h.centre[1], h.centre[2]]; axisLocal[a] += h.dir;
  const N = minus(P(axisLocal), C);                         // the face normal, entry toward the far face (unit)
  const far = minus(P(local(h.reach, 1)), C);               // mouth centre → far rim's centre, `reach` along the bit
  const rimsOf: { ring: Vec3[]; centre: Vec3; normal: Vec3 }[] = [
    { ring: holeRing(h, 0, DRAWING_HOLE_SEGMENTS).map(P), centre: C, normal: N },
  ];
  const farCentre: Vec3 = [C[0] + far[0], C[1] + far[1], C[2] + far[2]];
  if (h.through) rimsOf.push({ ring: holeRing(h, h.reach, DRAWING_HOLE_SEGMENTS).map(P), centre: farCentre, normal: N });
  else if (!clean) rimsOf.push({ ring: holeBottom(h, DRAWING_HOLE_SEGMENTS).map(P), centre: farCentre, normal: bHat });   // visibleOnly: a clean blind bottom is always hidden
  for (const { ring, centre, normal } of rimsOf) {
    const s = cross(normal, toward);
    const sn = Math.hypot(s[0], s[1], s[2]);
    if (Math.abs(dot(normal, toward)) <= 1e-9 && sn > 0) {
      // Edge-on (ruling R2): ONE segment between the rim's two extremes along s.
      const P0 = minus(ring[0]!, centre);
      const Q0 = minus(ring[DRAWING_HOLE_SEGMENTS / 4]!, centre);
      const ps = dot(P0, s) / sn; const qs = dot(Q0, s) / sn;
      const m = Math.hypot(ps, qs);
      const e = [0, 1, 2].map((i) => (ps * P0[i]! + qs * Q0[i]!) / m);
      rims.push({ A: [centre[0] - e[0]!, centre[1] - e[1]!, centre[2] - e[2]!], E: [centre[0] + e[0]!, centre[1] + e[1]!, centre[2] + e[2]!], row: h.row });
      continue;
    }
    for (let i = 0; i < ring.length; i += 1) rims.push({ A: ring[i]!, E: ring[(i + 1) % ring.length]!, row: h.row });
  }
  const g = cross(bHat, toward);
  const gn = Math.hypot(g[0], g[1], g[2]);
  if (gn > 1e-9 && !clean) {   // looking down the bit: the rims cover the wall; visibleOnly: a clean hole's wall is hidden
    const bn = dot(B, N);                                   // ±… exactly the bit's axial component, through the map
    for (const sg of [1, -1]) {
      const w = [0, 1, 2].map((i) => (sg * h.radius * g[i]!) / gn);
      // Slid along the bit onto the entry plane (and onto a through exit's): λ with (w + λB)·N = 0.
      const lam = -dot(w, N) / bn;
      const p0: Vec3 = [C[0] + w[0]! + lam * B[0], C[1] + w[1]! + lam * B[1], C[2] + w[2]! + lam * B[2]];
      const k = h.through ? lam : 0;                        // a blind bottom is square to the bit: w is already in it
      const p1: Vec3 = [farCentre[0] + w[0]! + k * B[0], farCentre[1] + w[1]! + k * B[1], farCentre[2] + w[2]! + k * B[2]];
      walls.push({ A: p0, E: p1, row: h.row });
    }
  }
  return { rims, walls };
}

const cross = (p: readonly number[], q: readonly number[]): Vec3 => [p[1]! * q[2]! - p[2]! * q[1]!, p[2]! * q[0]! - p[0]! * q[2]!, p[0]! * q[1]! - p[1]! * q[0]!];

