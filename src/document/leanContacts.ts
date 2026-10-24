import type { Board } from './types';
import { partGeometry, type BodyFace } from './bodies';
import { axisFrame, toWorldOffset } from './geometry';
import { leanMap } from './lean';

/**
 * What the design checks can trust of a LEANING part (splayed legs spec §7, invs 38, 39): its bodies in world space, the
 * level faces among them, and the plan overlap of two such faces. Its own module so the crossing has one home that
 * `designCheck.ts` (which `drawing.ts` imports) can read without a cycle.
 */

/**
 * How far a face's unit world normal may lean off ±Y and still be LEVEL (§7.2). For floating error only, never a slope:
 * a level end is built by `levelPlan` from `leanMap` in one pass and its normal is mapped back through the same rotation
 * once (`applyDir`), so it carries ~1e-15 of error (`levelEnds.test` pins it within 1e-12); 0.5° off level is
 * sin 0.5° ≈ 8.7e-3, six orders of magnitude out. Do not widen it to make a near-level foot stand (inv 22's lesson:
 * the tolerance matches the arithmetic actually done).
 */
export const LEVEL_EPS = 1e-9;

const DIM_INDEX = { length: 0, width: 1, thickness: 2 } as const;
type P3 = [number, number, number];

/**
 * A part's bodies (boardBodies: pocket cells clipped by its angle cuts) in WORLD space, each as faces with outward
 * normals — the checks' home of the body crossing (drawing.ts' worldBodies is the drawings'; a box body's extents are
 * pinned against worldBox in every posture and turn by test) — the same crossing as worldBox (position + toWorldOffset on
 * the dimension each axis shows; a reversed axis flips the normal), THEN the lean for a leaning part (§6.1 R1: vertices
 * through `apply`, normals through `applyDir`, one map per part — `toWorld`'s and `worldBodies`' composition). The checks
 * read it only for an angled or leaning part (fu 302, 303; §7.1).
 */
export function worldBodyFaces(b: Board): BodyFace[][] {
  const frame = axisFrame(b);
  const lean = leanMap(b);
  const placed = (p: readonly number[]): P3 => [0, 1, 2].map((i) => b.position[i]! + toWorldOffset(b, i, p[DIM_INDEX[frame[i]!.dim]]!)) as P3;
  const placedDir = (n: readonly number[]): P3 => [0, 1, 2].map((i) => n[DIM_INDEX[frame[i]!.dim]]! * (frame[i]!.reversed ? -1 : 1)) as P3;
  return partGeometry(b).bodies.map((body) => body.faces.map((f) => ({
    n: lean ? lean.applyDir(placedDir(f.n)) : placedDir(f.n),
    verts: f.verts.map(lean ? (p) => lean.apply(placed(p)) : placed),
  })));
}

/** A level face of a part: its world height (the mean of its vertices' y), whether it faces up, and its plan (x, z). */
export interface LevelFace { y: number; up: boolean; poly: [number, number][] }

/**
 * The faces of `b`'s world bodies (`worldBodyFaces`, lean included) whose unit world normal has |n_x|, |n_z| ≤ LEVEL_EPS
 * (§7.2: the only faces a leaning part touches through), each with its plan polygon in (x, z).
 */
export function levelFaces(b: Board): LevelFace[] {
  const out: LevelFace[] = [];
  for (const body of worldBodyFaces(b)) {
    for (const f of body) {
      const len = Math.hypot(f.n[0], f.n[1], f.n[2]);
      if (!(len > 0) || f.verts.length < 3) continue;
      if (Math.abs(f.n[0] / len) > LEVEL_EPS || Math.abs(f.n[2] / len) > LEVEL_EPS) continue;
      const y = f.verts.reduce((s, v) => s + v[1]!, 0) / f.verts.length;
      out.push({ y, up: f.n[1] > 0, poly: f.verts.map((v) => [v[0]!, v[2]!]) });
    }
  }
  return out;
}

type P2 = [number, number];
const signedArea = (p: readonly P2[]) => {
  let s = 0;
  for (let k = 0; k < p.length; k += 1) {
    const a = p[k]!;
    const c = p[(k + 1) % p.length]!;
    s += a[0] * c[1] - c[0] * a[1];
  }
  return s / 2;
};
/** `p` counter-clockwise: a down face's plan is wound the other way from an up face's. */
const ccw = (p: readonly P2[]): P2[] => (signedArea(p) < 0 ? [...p].reverse() : [...p]);

/**
 * The area of two CONVEX polygons' intersection (Sutherland–Hodgman: `a` clipped by each edge of `b`), either winding.
 * 0 when they share only an edge or a corner, or do not meet.
 */
export function overlapArea(a: readonly P2[], b: readonly P2[]): number {
  if (a.length < 3 || b.length < 3) return 0;
  const clipper = ccw(b);
  let poly = ccw(a);
  for (let k = 0; k < clipper.length && poly.length > 0; k += 1) {
    const p = clipper[k]!;
    const q = clipper[(k + 1) % clipper.length]!;
    // Inside: on or left of p → q (counter-clockwise).
    const side = (v: P2) => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]);
    const next: P2[] = [];
    for (let m = 0; m < poly.length; m += 1) {
      const u = poly[m]!;
      const v = poly[(m + 1) % poly.length]!;
      const su = side(u);
      const sv = side(v);
      if (su >= 0) next.push(u);
      if ((su >= 0) !== (sv >= 0)) {
        const t = su / (su - sv);
        next.push([u[0] + t * (v[0] - u[0]), u[1] + t * (v[1] - u[1])]);
      }
    }
    poly = next;
  }
  return poly.length < 3 ? 0 : Math.abs(signedArea(poly));
}
