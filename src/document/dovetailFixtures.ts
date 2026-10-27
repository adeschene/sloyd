// TEST-ONLY. The world partition of a dovetailed corner (dovetails spec §10): the two parts' wood inside the corner square is
// exactly the square, and no tail-part body shares volume with a pin-part body. Lifted from `dovetailGeometry.test.ts`'s
// hand-built corner check (left there unedited: no existing test is edited), for the planner's tests (`dovetailPlan.test.ts`),
// which read the square off the INPUT fixture's outside faces (inv 23: never a value the planner produced). Never import a
// test module instead.
import { expect } from 'vitest';
import type { Board, Dimension, Dovetail } from './types';
import type { V3 } from './angleCuts';
import { bodyVolume, clipConvex, partGeometry, type BodyFace } from './bodies';
import { axisFrame, boardExtents, DIMENSION_ORDER } from './geometry';
import { fromWorld, toWorld } from './snapPoints';
import { withDovetails } from './dovetailModel';
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
  // The tails entry of THIS corner: its depth is the pin part's thickness, less the lap on a half-blind corner (exact: the
  // builder writes `pins.thickness - lap`, and `pins.thickness - 0` is `pins.thickness`).
  const t = builtDovetails(tails).find((d) => d.role === 'tails' && d.depth === pins.thickness - (d.lap ?? 0))!;
  const { Te } = dovetailLayout(tails[jointLineOf(t.dim)], t.count, t.slope, t.pin);
  const expected = t.count * (Te - t.depth / t.slope) * t.depth * tails.thickness;
  const tVol = inT.reduce((s, f) => s + vol(f), 0);
  expect(Math.abs(tVol - expected) / V).toBeLessThanOrEqual(1e-9);
  const pinPlanes = insidePlanes(pins);
  let worst = 0;
  for (const f of inT) for (const h of pinPlanes) worst = Math.max(worst, vol(clipAll(f, h)));
  expect(worst).toBeLessThan(1e-12);
}

// ---- Half-blind (half-blind dovetails spec §3, Task 1) ------------------------------------------------------------

const worldBoxOf = (b: Board): WorldBox => {
  const e = boardExtents(b);
  return { min: [...b.position] as Vec, max: [0, 1, 2].map((i) => b.position[i]! + e[i]!) as Vec };
};
const meet = (a: WorldBox, b: WorldBox): WorldBox => ({
  min: [0, 1, 2].map((i) => Math.max(a.min[i]!, b.min[i]!)) as Vec, max: [0, 1, 2].map((i) => Math.min(a.max[i]!, b.max[i]!)) as Vec,
});
const near = (x: number, y: number) => Math.abs(x - y) <= 1e-9;
const localOf = (b: Board, w: readonly number[]) => fromWorld(b, w) as Record<Dimension, number>;

/** A half-blind corner: the two parts' dovetailed boards, the corner `box` (the tail part's world box within the pin part:
 *  `tT × (tP − lap) × H`) and the lap `slab` (the pin part's box from its outside face to the lap plane, over the corner's J
 *  span and the tail part's thickness). */
export interface HalfBlindCorner { tails: Board; pins: Board; box: WorldBox; slab: WorldBox }

/**
 * Half-blind one corner of two plain parts BY HAND (the through builder's twin, `dovetailGeometry.test.ts`' `dovetail`, with a
 * `lap`): the parts come in run out to each other's outside faces (the through corner); the tail part is then shortened by
 * `lap` at its corner end, in WORLD terms (its other end's world face stays put, so a corner end at the world min moves the
 * min corner, inv 2), so its end face sits on the lap plane. Asserted off the INPUT parts (inv 23): the shortened end face
 * lies exactly `lap` inside the pin part's outside face, and the pin part's end face still lies on the tail part's outside
 * face. Tails: `depth = tP − lap`; pins: `depth = tT`, `outside` the face the tail part's end used to land on; both carry `lap`.
 */
export function halfBlindCorner(
  tail: Board, tailDim: Dovetail['dim'], pin: Board, pinDim: Dovetail['dim'], N: number, s: number, p: number, lap: number,
): HalfBlindCorner {
  const J = (dim: Dovetail['dim']) => (dim === 'length' ? 'width' : 'length');
  const full = meet(worldBoxOf(tail), worldBoxOf(pin));
  const H = tail[J(tailDim)];
  expect(pin[J(pinDim)]).toBe(H);
  const fe = [0, 1, 2].map((i) => full.max[i]! - full.min[i]!);
  expect(fe[0]! * fe[1]! * fe[2]!).toBeCloseTo(tail.thickness * pin.thickness * H, 12);
  const centre = [0, 1, 2].map((i) => (full.min[i]! + full.max[i]!) / 2);
  const endOf = (x: Board, dim: Dovetail['dim']): Dovetail['end'] => (localOf(x, centre)[dim] > x[dim] / 2 ? 'max' : 'min');
  const tEnd = endOf(tail, tailDim), pEnd = endOf(pin, pinDim);
  const faceAt = (b: Board, dim: Dovetail['dim'], end: Dovetail['end']) =>
    toWorld(b, { [dim]: end === 'max' ? b[dim] : 0, [J(dim)]: H / 2, thickness: b.thickness / 2 } as Record<Dimension, number>);
  // Through: the tail part's end face lies on the pin part's outside face.
  const onPin = localOf(pin, faceAt(tail, tailDim, tEnd)).thickness;
  const outside: 'min' | 'max' = near(onPin, 0) ? 'min' : 'max';
  expect(near(onPin, outside === 'min' ? 0 : pin.thickness)).toBe(true);
  // Shorten the tail part by `lap` at the corner end, in world terms.
  const k = axisFrame(tail).findIndex((a) => a.dim === tailDim);
  const endW = faceAt(tail, tailDim, tEnd)[k]!;
  const tb = worldBoxOf(tail);
  const atWorldMin = near(endW, tb.min[k]!);
  expect(atWorldMin || near(endW, tb.max[k]!)).toBe(true);
  const position = [...tail.position] as Vec;
  if (atWorldMin) position[k] += lap;
  const short: Board = { ...tail, [tailDim]: tail[tailDim] - lap, position };
  // The shortened end face is `lap` inside the pin part's outside face; the far end has not moved.
  const onPin2 = localOf(pin, faceAt(short, tailDim, tEnd)).thickness;
  expect(near(onPin2, outside === 'min' ? lap : pin.thickness - lap)).toBe(true);
  const far = (b: Board) => faceAt(b, tailDim, tEnd === 'max' ? 'min' : 'max')[k]!;
  expect(near(far(short), far(tail))).toBe(true);
  // And the pin part's end face still lies on the tail part's outside face (P runs out as before).
  const onTail = localOf(short, faceAt(pin, pinDim, pEnd)).thickness;
  expect(near(onTail, 0) || near(onTail, short.thickness)).toBe(true);
  const box = meet(worldBoxOf(short), worldBoxOf(pin));
  const be = [0, 1, 2].map((i) => box.max[i]! - box.min[i]!);
  expect(be[0]! * be[1]! * be[2]!).toBeCloseTo(tail.thickness * (pin.thickness - lap) * H, 12);
  const slab: WorldBox = { min: [...box.min] as Vec, max: [...box.max] as Vec };
  if (atWorldMin) { slab.min[k] = full.min[k]!; slab.max[k] = box.min[k]!; } else { slab.min[k] = box.max[k]!; slab.max[k] = full.max[k]!; }
  const t: Dovetail = { id: `d${tEnd}`, dim: tailDim, end: tEnd, role: 'tails', count: N, slope: s, pin: p, depth: pin.thickness - lap, lap };
  const q: Dovetail = { id: `d${pEnd}`, dim: pinDim, end: pEnd, role: 'pins', count: N, slope: s, pin: p, depth: tail.thickness, outside, lap };
  return {
    tails: withDovetails(short, [...(short.dovetails ?? []), t]), pins: withDovetails(pin, [...(pin.dovetails ?? []), q]), box, slab,
  };
}

/** The lap slab (half-blind spec §10) is the PIN part's wood to its full volume (1e-9 relative), and none of the tail part's. */
export function expectLapSlab(tails: Board, pins: Board, slab: WorldBox) {
  const planes = boxPlanes(slab);
  const ext = [0, 1, 2].map((i) => slab.max[i]! - slab.min[i]!);
  const V = ext[0]! * ext[1]! * ext[2]!;
  expect(V).toBeGreaterThan(0);
  const inP = worldFaces(pins).map((f) => clipAll(f, planes)).reduce((sum, f) => sum + vol(f), 0);
  const inT = worldFaces(tails).map((f) => clipAll(f, planes)).reduce((sum, f) => sum + vol(f), 0);
  expect(Math.abs(inP - V) / V).toBeLessThanOrEqual(1e-9);
  expect(inT / V).toBeLessThanOrEqual(1e-12);
}
