import type { Board, Lean } from './types';
import { axisFrame, boardExtents } from './geometry';
import { rotateVec, type Vec3 } from './frames';

/**
 * The ONE home of the lean math (splayed legs spec §3.3): slopes ↔ degrees, the resultant and sightline, and the
 * rotation, its pivot and the point and direction maps both ways. Nothing else computes a lean.
 *
 * A lean is stored as slopes (`Lean`, §3.1), never degrees: degrees exist only in display and typed input, the
 * `angleCuts.ts` field-conversion rule, so editing one slope never drifts the other.
 */

/** Row-major 3 × 3 matrix: `m[i][j]` is row i, column j. */
export type Mat3 = [Vec3, Vec3, Vec3];

const DEG = Math.PI / 180;
/** The bound's tolerance (Global Constraints: each comparison within 1e-9). */
const BOUND_EPS = 1e-9;
/** A twist tie between the two facing dimensions (|twist| = 45° within this) goes to width (§3.1). */
const TIE_EPS = 1e-9;

/** `tan` of an angle in degrees: a typed rake or splay becomes a slope only here (§3.1). */
export function slopeOf(deg: number): number { return Math.tan(deg * DEG); }

/** `atan` of a slope, in degrees, for display. */
export function degreesOf(slope: number): number { return Math.atan(slope) / DEG; }

/** The resultant lean from vertical, in degrees: `atan(hypot(x, z))` (§3.3). Turn- and mirror-invariant. */
export function resultantDeg(l: Pick<Lean, 'x' | 'z'>): number { return degreesOf(Math.hypot(l.x, l.z)); }

/**
 * The sightline, in degrees from the front edge (0–90): `atan2(|wz|, |wx|)` on WORLD slopes. NOT `atan` of the ratio
 * of the degrees (rake 8°, splay 12° is 33.4724°, not 33.69°; Global Constraints).
 */
export function sightlineDeg(wx: number, wz: number): number { return Math.atan2(Math.abs(wz), Math.abs(wx)) / DEG; }

/** Whether slopes (x, z) are within the bound: each at most 1 and the resultant at most 45°, within 1e-9; a
 *  non-finite slope is out (Global Constraints). */
export function withinBound(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return Math.abs(x) <= 1 + BOUND_EPS && Math.abs(z) <= 1 + BOUND_EPS && Math.hypot(x, z) <= 1 + BOUND_EPS;
}

/** The stored (turn-0) slopes `(x, z)` turned by `b.rotation`, the same turn `rotateVec` makes for the part (inv 44):
 *  the foot's world travel per inch of drop along X and Z. [0, 0] for a part with no lean. */
export function worldSlopes(b: Board): [number, number] {
  return slopesAt(b, b.lean?.x ?? 0, b.lean?.z ?? 0);
}

function slopesAt(b: Board, x: number, z: number): [number, number] {
  const w = rotateVec(b.rotation, [x, 0, z]);
  return [w[0], w[2]];
}

/** `a` reduced into (−π/2, π/2]: the facing dimension is an axis LINE, so the twist is taken modulo a half turn. The
 *  closed end is never reached by `leanMap`: `seamFree` removes the one case that would land on it. */
function reduceHalfTurn(a: number): number {
  return a - Math.PI * Math.ceil((a - Math.PI / 2) / Math.PI);
}

/**
 * `l` with the seam removed: a lean whose sightline is exactly perpendicular to its facing dimension — a rake-only lean
 * (`x === 0`) kept on width, or a splay-only lean (`z === 0`) kept on thickness, in the stored turn-0 frame where an
 * upright part's width is on X and thickness on Z — faces the OTHER dimension instead; any other lean is returned as
 * the same object. Why: such a lean twists by exactly ±90°, the closed end of the reduction, and a mirror maps it to
 * itself while S · Ry(90°) · S = Ry(−90°), so the mirrored twin would come out spun 180° and mirror conjugation
 * (§3.4) would fail. Facing the other dimension twists 0, which conjugates exactly, and the leg's box is the same
 * either way. So `leanMap` is total: τ is never ±π/2. The stored `face` is untouched (§3.1: stored, kept by edits).
 */
export function seamFree(l: Lean): Lean {
  if (l.face === 'width' && l.x === 0) return { ...l, face: 'thickness' };
  if (l.face === 'thickness' && l.z === 0) return { ...l, face: 'width' };
  return l;
}

/**
 * The twist (§3.3), in radians: the signed angle from facing dimension `face`'s world axis line to the sightline of
 * world slopes (wx, wz), reduced into (−π/2, π/2]. The axis line comes from `axisFrame` (inv 44), so a turned part
 * finds its own facing axis. Null when `face` is not horizontal (a part that is not upright cannot lean, §3.2).
 * The ONE twist computation: `chooseFace` and `leanMap` both read it.
 */
function twistOf(b: Board, face: Lean['face'], wx: number, wz: number): number | null {
  const axis = axisFrame(b).findIndex((a) => a.dim === face);
  if (axis !== 0 && axis !== 2) return null;
  const theta = axis === 0 ? 0 : Math.PI / 2;
  return reduceHalfTurn(Math.atan2(wz, wx) - theta);
}

/**
 * Which horizontal dimension faces the sightline when a lean (x, z) is first set (§3.1): the one needing the smaller
 * twist; width on a tie (|twist| = 45° within 1e-9), so rake equal to splay faces width. It never chooses a seam
 * face (`seamFree`): a rake-only lean needs no twist on thickness, a splay-only one none on width.
 */
export function chooseFace(b: Board, x: number, z: number): 'width' | 'thickness' {
  const [wx, wz] = slopesAt(b, x, z);
  const tw = twistOf(b, 'width', wx, wz);
  const tt = twistOf(b, 'thickness', wx, wz);
  // Unreachable once the loader keeps leans on upright parts only (§3.2); a plausible wrong face is worse than a throw.
  if (tw === null || tt === null) throw new Error('chooseFace: the part is not upright, so it cannot lean');
  return Math.abs(tw) <= Math.abs(tt) + TIE_EPS ? 'width' : 'thickness';
}

/**
 * A lean's map of WORLD points of the part's pre-lean placement (§3.2): a rotation `m` about `pivot`, the centre of
 * the box's top face. `m` is row-major, orthonormal, det +1; `inverse` and `inverseDir` use its transpose.
 */
export interface LeanMap {
  pivot: Vec3;
  m: Mat3;
  apply(p: Vec3): Vec3;
  applyDir(d: Vec3): Vec3;
  inverse(p: Vec3): Vec3;
  inverseDir(d: Vec3): Vec3;
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const row = (i: number): Vec3 => [0, 1, 2].map((j) => a[i]![0] * b[0]![j]! + a[i]![1] * b[1]![j]! + a[i]![2] * b[2]![j]!) as Vec3;
  return [row(0), row(1), row(2)];
}

function times(m: Mat3, v: readonly number[]): Vec3 {
  return [0, 1, 2].map((i) => m[i]![0] * v[0]! + m[i]![1] * v[1]! + m[i]![2] * v[2]!) as Vec3;
}

function timesT(m: Mat3, v: readonly number[]): Vec3 {
  return [0, 1, 2].map((j) => m[0]![j]! * v[0]! + m[1]![j]! * v[1]! + m[2]![j]! * v[2]!) as Vec3;
}

/**
 * `b`'s lean as a map (§3.3), or null when `b` has no lean (or its facing dimension is not horizontal, which the
 * loader never lets through, §3.2). `m = T · Ry(τ)`:
 * - the facing dimension is `seamFree`'s, so τ is never ±π/2;
 * - `Ry(τ)` twists by τ about the vertical, `(x, z) → (x cos τ − z sin τ, x sin τ + z cos τ)`, turning the facing
 *   dimension's axis line onto the sightline σ = atan2(wz, wx);
 * - `T` is the Rodrigues rotation taking straight down to `normalize(wx, −1, wz)`, so the foot travels along the
 *   slopes; its axis, `(0, −1, 0) × n ∝ (−wz, 0, wx)`, is the horizontal perpendicular to the sightline, so the
 *   facing dimension stays in the sightline's vertical plane. The identity when the resultant is 0.
 * A mirror conjugates the whole map (§3.4): the flipped lean (`leanFlip`) on the reflected part gives `S · m · S`.
 */
export function leanMap(b: Board): LeanMap | null {
  if (!b.lean) return null;
  const [wx, wz] = worldSlopes(b);
  const tau = twistOf(b, seamFree(b.lean).face, wx, wz);
  if (tau === null) return null;
  const c = Math.cos(tau);
  const s = Math.sin(tau);
  const twist: Mat3 = [[c, 0, -s], [0, 1, 0], [s, 0, c]];

  const len = Math.hypot(wx, 1, wz);
  const n: Vec3 = [wx / len, -1 / len, wz / len];
  // Rodrigues from a = (0, −1, 0) to n: T = I + K + K² / (1 + a·n), K the skew of a × n = (−n_z, 0, n_x).
  // a·n = 1/len ≥ 1/√2 under the bound, so 1 + a·n never nears 0.
  const k: Vec3 = [-n[2], 0, n[0]];
  const K: Mat3 = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  const K2 = mul(K, K);
  const f = 1 / (1 + 1 / len);
  const tilt: Mat3 = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + K[i]![j]! + K2[i]![j]! * f)) as Mat3;

  const m = mul(tilt, twist);
  const [e0, e1, e2] = boardExtents(b);
  const pivot: Vec3 = [b.position[0] + e0 / 2, b.position[1] + e1, b.position[2] + e2 / 2];
  const about = (v: Vec3): Vec3 => [pivot[0] + v[0], pivot[1] + v[1], pivot[2] + v[2]];
  const from = (p: Vec3): Vec3 => [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
  return {
    pivot,
    m,
    apply: (p) => about(times(m, from(p))),
    applyDir: (d) => times(m, d),
    inverse: (p) => about(timesT(m, from(p))),
    inverseDir: (d) => timesT(m, d),
  };
}

/** A lean reflected along the part's turn-0 X (§3.4): the X slope negated, the facing dimension kept; its own inverse.
 *  `0 - x` keeps a zero +0. With `mirrorPart`, the map is conjugated by the reflection exactly. */
export function leanFlip(l: Lean): Lean {
  return { x: 0 - l.x, z: l.z, face: l.face };
}
