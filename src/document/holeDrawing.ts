import type { Board } from './types';
import type { V3 } from './angleCuts';
import { DIMENSION_ORDER } from './geometry';
import { partGeometry } from './bodies';
import { holeRing } from './holes';
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
  const out: { A: Vec3; E: Vec3; row: string }[] = [];
  // Each hole's world frame, from mapped points only: centre C, axis A (entry to far rim), silhouette radial r (null when
  // the view looks down the axis), and whether the rim's plane is edge-on to the view.
  const frames = holes.map((h) => {
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
    return { h, C, A, r, edgeOn, clean: inside(h) };
  });
  for (const { h, C, A, r, edgeOn, clean } of frames) {
    for (const t of [0, h.depth]) {
      if (clean && !h.through && t === h.depth) continue;   // visibleOnly: a clean blind bottom is always hidden
      if (edgeOn && r) {
        // Edge-on, the rim projects to exactly the diameter across r (ruling R2): ONE segment, not 96 chords folded back
        // along one line, so a hidden rim reads dashed on the sheet.
        const k = t / h.depth;
        const c = [C[0] + k * A[0]!, C[1] + k * A[1]!, C[2] + k * A[2]!];
        out.push({
          A: [c[0]! - r[0]!, c[1]! - r[1]!, c[2]! - r[2]!],
          E: [c[0]! + r[0]!, c[1]! + r[1]!, c[2]! + r[2]!],
          row: h.row,
        });
        continue;
      }
      const ring = holeRing(h, t, DRAWING_HOLE_SEGMENTS).map(P);
      for (let i = 0; i < ring.length; i += 1) out.push({ A: ring[i]!, E: ring[(i + 1) % ring.length]!, row: h.row });
    }
  }
  for (const { h, C, A, r, clean } of frames) {
    if (!r || clean) continue;   // visibleOnly: a clean hole's wall is always hidden
    for (const s of [1, -1]) {
      const p0: Vec3 = [C[0] + s * r[0]!, C[1] + s * r[1]!, C[2] + s * r[2]!];
      out.push({ A: p0, E: [p0[0] + A[0]!, p0[1] + A[1]!, p0[2] + A[2]!], row: h.row });
    }
  }
  return out;
}
