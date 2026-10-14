import type { Board } from './types';
import type { V3 } from './angleCuts';
import { DIMENSION_ORDER } from './geometry';
import { partGeometry } from './bodies';
import { holeRing } from './holes';
import { toWorld } from './snapPoints';

type Vec3 = [number, number, number];

/** The polygon a hole's rim is DRAWN as on the sheet (print scale; spec §3.4). The viewport keeps HOLE_SEGMENTS (48). */
export const DRAWING_HOLE_SEGMENTS = 96;

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * One part's hole lines for a view looking along `toward` (from the model to the viewer), in world space, no explode
 * offset (spec §3.4): every hole's entry rim and far rim (a through hole's exit, a blind hole's bottom) as
 * DRAWING_HOLE_SEGMENTS-gons, and — unless the view looks down the axis — the wall's two silhouette generators, the
 * lines where the cylinder's surface turns away from the viewer. Built only from `toWorld` of board-local points
 * (invariant 44): the radial directions U, V and the axis A are differences of mapped points, so every turn, posture and
 * mirror is the one composition's. The silhouette's radial r = (V·T)·U − (U·T)·V, scaled to the radius, is the one
 * direction in the disc plane perpendicular to T. drawView decides what is hidden; this module decides nothing about it.
 * Rims come first, then the silhouettes.
 */
export function holeDrawingSegments(b: Board, toward: readonly number[]): [Vec3, Vec3][] {
  const holes = partGeometry(b).holes;
  if (holes.length === 0) return [];
  const P = (p: readonly number[]): Vec3 => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! });
  const out: [Vec3, Vec3][] = [];
  for (const h of holes) {
    for (const t of [0, h.depth]) {
      const ring = holeRing(h, t, DRAWING_HOLE_SEGMENTS).map(P);
      for (let i = 0; i < ring.length; i += 1) out.push([ring[i]!, ring[(i + 1) % ring.length]!]);
    }
  }
  for (const h of holes) {
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
    if (n <= 1e-9 * h.radius) continue; // looking down the axis: the rim covers the wall
    const r = [0, 1, 2].map((i) => (tv * U[i]! - tu * V[i]!) / n);
    for (const s of [1, -1]) {
      const p0: Vec3 = [C[0] + s * r[0]!, C[1] + s * r[1]!, C[2] + s * r[2]!];
      out.push([p0, [p0[0] + A[0]!, p0[1] + A[1]!, p0[2] + A[2]!]]);
    }
  }
  return out;
}
