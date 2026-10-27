// TEST-ONLY. The world partition of a dovetailed corner (dovetails spec §10): the two parts' wood inside the corner square is
// exactly the square, and no tail-part body shares volume with a pin-part body. Lifted from `dovetailGeometry.test.ts`'s
// hand-built corner check (left there unedited: no existing test is edited), for the planner's tests (`dovetailPlan.test.ts`),
// which read the square off the INPUT fixture's outside faces (inv 23: never a value the planner produced). Never import a
// test module instead.
import { expect } from 'vitest';
import type { Board } from './types';
import type { V3 } from './angleCuts';
import { bodyVolume, clipConvex, partGeometry, type BodyFace } from './bodies';
import { axisFrame, DIMENSION_ORDER } from './geometry';
import { toWorld } from './snapPoints';
import { worldBodies } from './drawing';
import { builtDovetails, dovetailLayout, jointLineOf } from './dovetails';

export type Vec = [number, number, number];
export interface WorldBox { min: Vec; max: Vec }

/** A part's bodies as world faces (true outward world normals: the turn table's per-axis sign; no lean here). */
function worldFaces(b: Board): BodyFace[][] {
  const frame = axisFrame(b);
  const W = (v: readonly number[]): V3 => toWorld(b, { length: v[0]!, width: v[1]!, thickness: v[2]! }) as V3;
  const dir = (n: readonly number[]): V3 => [0, 1, 2].map((i) => n[DIMENSION_ORDER.indexOf(frame[i]!.dim)]! * (frame[i]!.reversed ? -1 : 1)) as V3;
  return partGeometry(b).bodies.map((body) => body.faces.map((f) => ({ n: dir(f.n), verts: f.verts.map(W) })));
}
/** `worldBodies`' inside half-spaces of each body (a box's six when it took the box path). */
function insidePlanes(b: Board): { n: V3; d: number }[][] {
  return worldBodies(b).map((wb) => {
    if (!wb.box) return wb.planes.map(({ m, c }) => ({ n: [...m] as V3, d: c }));
    const out: { n: V3; d: number }[] = [];
    for (let i = 0; i < 3; i += 1) {
      const n: V3 = [0, 0, 0]; n[i] = 1;
      const m: V3 = [0, 0, 0]; m[i] = -1;
      out.push({ n, d: -wb.box.min[i]! }, { n: m, d: wb.box.max[i]! });
    }
    return out;
  });
}
const clipAll = (faces: BodyFace[], planes: readonly { n: V3; d: number }[]) => {
  let f = faces;
  for (const h of planes) { f = clipConvex(f, h); if (f.length === 0) break; }
  return f;
};
const vol = (faces: BodyFace[]) => (faces.length >= 4 ? bodyVolume({ box: null, faces }) : 0);
const boxPlanes = (box: WorldBox) => [0, 1, 2].flatMap((i) => {
  const n: V3 = [0, 0, 0]; n[i] = 1;
  const m: V3 = [0, 0, 0]; m[i] = -1;
  return [{ n, d: -box.min[i]! }, { n: m, d: box.max[i]! }];
});

/**
 * The partition (spec §10) of the corner `box` (world) between the WORLD parts `tails` and `pins`: their wood inside it is
 * exactly the box (1e-9 relative); the tail part's share is its tails, from the layout by hand (N tails of mean width
 * Te − X/s, X the pin part's thickness deep, through the tail part's thickness); no tail-part body shares volume with a
 * pin-part body (pairwise, < 1e-12).
 */
export function expectPartition(tails: Board, pins: Board, box: WorldBox) {
  expect(builtDovetails(tails).length).toBeGreaterThan(0);
  expect(builtDovetails(pins).length).toBeGreaterThan(0);
  const square = boxPlanes(box);
  const ext = [0, 1, 2].map((i) => box.max[i]! - box.min[i]!);
  const V = ext[0]! * ext[1]! * ext[2]!;
  const inT = worldFaces(tails).map((f) => clipAll(f, square)).filter((f) => vol(f) > 0);
  const inP = worldFaces(pins).map((f) => clipAll(f, square)).filter((f) => vol(f) > 0);
  const total = [...inT, ...inP].reduce((s, f) => s + vol(f), 0);
  expect(Math.abs(total - V) / V).toBeLessThanOrEqual(1e-9);
  const t = builtDovetails(tails).find((d) => d.role === 'tails' && d.depth === pins.thickness)!;
  const { Te } = dovetailLayout(tails[jointLineOf(t.dim)], t.count, t.slope, t.pin);
  const expected = t.count * (Te - t.depth / t.slope) * t.depth * tails.thickness;
  const tVol = inT.reduce((s, f) => s + vol(f), 0);
  expect(Math.abs(tVol - expected) / V).toBeLessThanOrEqual(1e-9);
  const pinPlanes = insidePlanes(pins);
  let worst = 0;
  for (const f of inT) for (const h of pinPlanes) worst = Math.max(worst, vol(clipAll(f, h)));
  expect(worst).toBeLessThan(1e-12);
}
