import type { Dimension, HoleRow } from './types';
import type { V3 } from './angleCuts';
import { DIMENSION_ORDER } from './geometry';

/**
 * The ONE home of a hole row's tilt (angled holes spec §3, §6.1): the bit's board-local vector, the bound, degrees for
 * display and the edit rule. A tilt is stored as two slopes RELATIVE TO THE ROW'S FLAGS (`tiltAlong` positive toward the
 * far end from `alongFrom`, `tiltAcross` toward the far side from `acrossFrom`), so a mirror's flag flip carries it with no
 * arithmetic (inv 44); degrees exist only in display and typed input (the angle-cuts rule).
 *
 * The degree conversions are `lean.ts`' expressions written out again, not imported: holes.ts imports this module and
 * lean.ts imports frames.ts, which imports holes.ts (`mirrorHoleRow`) — importing lean.ts here would close that cycle.
 * `acrossOf` lives here for the same reason (holes.ts re-exports it).
 */

const DEG = Math.PI / 180;

/** The third dimension: neither the drill axis nor the row's direction. */
export function acrossOf(r: Pick<HoleRow, 'face' | 'along'>): Dimension {
  return DIMENSION_ORDER.find((d) => d !== r.face && d !== r.along)!;
}

/** A row stores a tilt: either slope present and non-zero (a stored slope is never 0, but a row being built may hold one). */
export function isTilted(r: Pick<HoleRow, 'tiltAlong' | 'tiltAcross'>): boolean {
  return (r.tiltAlong !== undefined && r.tiltAlong !== 0) || (r.tiltAcross !== undefined && r.tiltAcross !== 0);
}

const sign = (f: HoleRow['alongFrom']) => (f === 'min' ? 1 : -1);
/** `s · slope`, a plus zero for no slope: `-1 * 0` would be -0 and a square row's vector must be exactly the face axis. */
const lateral = (s: 1 | -1, slope: number | undefined) => (slope ? s * slope : 0);

/**
 * The bit's direction, board-local `[length, width, thickness]`, UNNORMALISED: the face-axis component is exactly `±1`
 * (+1 entering from the min face), so a lateral component is the bore's travel per inch of axial depth. A square row's
 * vector is exactly the face axis, its other two components `+0`.
 */
export function bitVector(r: HoleRow): V3 {
  const m: V3 = [0, 0, 0];
  m[DIMENSION_ORDER.indexOf(r.face)] = sign(r.from);
  m[DIMENSION_ORDER.indexOf(r.along)] = lateral(sign(r.alongFrom), r.tiltAlong);
  m[DIMENSION_ORDER.indexOf(acrossOf(r))] = lateral(sign(r.acrossFrom), r.tiltAcross);
  return m;
}

/** The two slopes in degrees, signed (toward the far end / far side positive), for display. */
export function tiltDegrees(r: Pick<HoleRow, 'tiltAlong' | 'tiltAcross'>): { along: number; across: number } {
  return { along: Math.atan(r.tiltAlong ?? 0) / DEG, across: Math.atan(r.tiltAcross ?? 0) / DEG };
}

/** The bore's angle off square, in degrees: `atan(hypot(along, across))`, lean.ts' `resultantDeg` on the same pair. */
export function tiltResultantDeg(r: Pick<HoleRow, 'tiltAlong' | 'tiltAcross'>): number {
  return Math.atan(Math.hypot(r.tiltAlong ?? 0, r.tiltAcross ?? 0)) / DEG;
}

/** The sightline, in degrees from the `along` dimension (0–90): `atan2(|across|, |along|)`, lean.ts' `sightlineDeg`. */
export function tiltSightlineDeg(r: Pick<HoleRow, 'tiltAlong' | 'tiltAcross'>): number {
  return Math.atan2(Math.abs(r.tiltAcross ?? 0), Math.abs(r.tiltAlong ?? 0)) / DEG;
}

/**
 * The ONE bound on a tilt (spec §3.1): each slope at most 1 (45°) and the resultant `hypot` at most 1 (45° in all),
 * EXACT — the loader (`validateHoleRows`) and the store refuse with it, so what one keeps the other accepts. Unlike
 * lean.ts' `withinBound` there is no 1e-9 allowance: `tan 45°` and (0.6, 0.8) are inside as computed. A non-finite slope
 * is out.
 */
export function withinTiltBound(a: number, c: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(c)) return false;
  return Math.abs(a) <= 1 && Math.abs(c) <= 1 && Math.hypot(a, c) <= 1;
}

/**
 * The edit rule (spec §3.1): `next` with its tilt re-derived from `prev`'s. A changed `face` or `from` is a new bore: no
 * tilt. Otherwise the bit keeps its BOARD-LOCAL direction — each dimension's signed lateral component of `prev`'s bit is
 * re-read through `next`'s `along`, `alongFrom` and `acrossFrom` (a sign flip at most, so exact). A zero component is
 * omitted. `next`'s own tilt keys are not read: an edit OF the tilt writes its slopes itself.
 */
export function retilt(prev: HoleRow, next: HoleRow): HoleRow {
  const { tiltAlong: _a, tiltAcross: _c, ...rest } = next;
  if (next.face !== prev.face || next.from !== prev.from) return rest;
  const m = bitVector(prev);
  const along = sign(next.alongFrom) * m[DIMENSION_ORDER.indexOf(next.along)]!;
  const across = sign(next.acrossFrom) * m[DIMENSION_ORDER.indexOf(acrossOf(next))]!;
  return { ...rest, ...(along !== 0 ? { tiltAlong: along } : {}), ...(across !== 0 ? { tiltAcross: across } : {}) };
}
