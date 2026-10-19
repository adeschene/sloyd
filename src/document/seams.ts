import { HOLE_EPS, minusCover } from './holes';
import type { Body, BodyFace } from './bodies';
import type { V3 } from './angleCuts';

/**
 * A part's seams (chunk c2: moved from viewport/grainTiling.ts, where the mesh used them, so the edges can read the same
 * cover). A seam is a face another body of the part lies against — coplanar, facing the opposite way — so between them is
 * stock and that much of the face is never seen. `uncovered` (ruling R11; curves spec §3.4) subtracts the covers;
 * `faceCover` (chunk c2, stage 2) gives every face its remainder, an exact twin pair short-circuited.
 */

/**
 * A holed body's face minus every part of it another body of the part covers (ruling R11): a coplanar face of another
 * body facing the opposite way lies against it, so between them is stock — a seam inside the part, never seen, and
 * punching it with every ring that crosses it was most of a holed part's rebuild. Coincident faces drop entirely; a
 * face a neighbour only partly covers keeps the rest (a dado's floor, beside the bodies on either side). A face nothing
 * covers comes back as the same object. Also run on a split curved body (curves spec §3.4): the walls between the slices
 * of a curve's split lie against each other the same way.
 */
export function uncovered(f: BodyFace, body: Body, index: SeamIndex): BodyFace[] {
  let pieces: V3[][] = [f.verts];
  const q = f.verts[0]!;
  for (const k of facingAgainst(index, body, f.n[0], f.n[1], f.n[2], q[0], q[1], q[2])) {
    const g = index.faces[k]!;
    pieces = pieces.flatMap((piece) => minusCover(piece, f.n, g.verts));
  }
  if (pieces.length === 1 && pieces[0] === f.verts) return [f];
  return pieces.map((verts) => ({ ...f, verts }));
}

/** The indices, in order, of every face of ANOTHER body lying against a face (normal n, first vertex q): coplanar and
 *  facing the opposite way, within HOLE_EPS (the test `uncovered` always made, unchanged). Only the faces whose normal
 *  KEY lies in the window that test allows are visited (see SeamIndex), so a part with hundreds of faces does not test
 *  every pair. */
function facingAgainst(index: SeamIndex, body: Body, n0: number, n1: number, n2: number, q0: number, q1: number, q2: number): number[] {
  const { num, owner, keys, order } = index;
  const want = -(n0 * KEY[0] + n1 * KEY[1] + n2 * KEY[2]);
  // First sorted position with key >= want − KEY_WINDOW.
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid]! < want - KEY_WINDOW) lo = mid + 1; else hi = mid; }
  const out: number[] = [];
  for (let j = lo; j < keys.length && keys[j]! <= want + KEY_WINDOW; j += 1) {
    const k = order[j]!;
    const o = k * 6;
    if (n0 * num[o]! + n1 * num[o + 1]! + n2 * num[o + 2]! > -1 + HOLE_EPS) continue;
    if (Math.abs(n0 * (num[o + 3]! - q0) + n1 * (num[o + 4]! - q1) + n2 * (num[o + 5]! - q2)) > HOLE_EPS) continue;
    if (owner[k] !== body) out.push(k);
  }
  return out.sort((a, b) => a - b);   // body order, then face order: the order the covers are subtracted in
}

/**
 * The normal key: n · KEY, a fixed unit direction leaning on no axis. Two (near-)unit normals with n·m <= −1 + HOLE_EPS
 * have |n + m|² = |n|² + |m|² + 2 n·m <= 2·HOLE_EPS (+ rounding), so their keys sum to at most √(2e-9) ≈ 4.5e-5 in
 * magnitude: KEY_WINDOW = 1e-4 cannot miss a face the full test would take.
 */
const KEY = (() => { const v = [1, 0.618, 0.382]; const l = Math.hypot(...v); return v.map((x) => x / l) as V3; })();
const KEY_WINDOW = 1e-4;

/**
 * Every face of a part's bodies, in body order then face order (the order `uncovered` subtracts in), with its normal
 * and first vertex as plain numbers, and sorted by normal key (`order`, `keys`): a split curved part has hundreds of
 * faces (an L-shaped notch's ear-clipped waste: 83 bodies, 477 faces — some 237 000 pairs per rebuild tested one by
 * one). Built once per FROZEN bodies array (partGeometry's, shared and never mutated) and kept by its identity; an
 * unfrozen array is indexed afresh on every call (invariant 50's rule: never memoise what can change). Module-level
 * is safe here, unlike `worldOffsets`' memo: the index holds no pose (board-local faces only), so every part sharing
 * those frozen bodies — in any pose — shares one correct index, and the WeakMap lets it go with the bodies.
 */
export interface SeamIndex { owner: Body[]; faces: BodyFace[]; num: Float64Array; keys: Float64Array; order: Int32Array }
const seamIndexes = new WeakMap<readonly Body[], SeamIndex>();
export function seamIndex(bodies: readonly Body[]): SeamIndex {
  const hit = seamIndexes.get(bodies);
  if (hit) return hit;
  const owner: Body[] = [];
  const faces: BodyFace[] = [];
  for (const b of bodies) for (const g of b.faces) { owner.push(b); faces.push(g); }
  const num = new Float64Array(faces.length * 6);
  const key = new Float64Array(faces.length);
  for (let k = 0; k < faces.length; k += 1) {
    const g = faces[k]!;
    const p = g.verts[0]!;
    const o = k * 6;
    num[o] = g.n[0]; num[o + 1] = g.n[1]; num[o + 2] = g.n[2]; num[o + 3] = p[0]; num[o + 4] = p[1]; num[o + 5] = p[2];
    key[k] = g.n[0] * KEY[0] + g.n[1] * KEY[1] + g.n[2] * KEY[2];
  }
  const order = Int32Array.from(faces.keys()).sort((a, b) => key[a]! - key[b]!);
  const keys = Float64Array.from(order, (k) => key[k]!);
  const index = { owner, faces, num, keys, order };
  if (Object.isFrozen(bodies)) seamIndexes.set(bodies, index);
  return index;
}
