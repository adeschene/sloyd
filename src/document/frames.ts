import type { Board, Instance, Rotation } from './types';
import { boardExtents } from './geometry';

export type Vec3 = [number, number, number];

/** Where a frame sits in its parent: an Instance satisfies this. */
export interface Frame { position: readonly number[]; rotation: Rotation }

/**
 * A vector turned by r about the vertical, counter-clockwise from above: the
 * SAME turn axisFrame's table makes for a part (invariant 44), so a part's turn
 * and its assemblies' turns compose by addition. Quarter turns only swap and
 * negate, so this is exact.
 */
export function rotateVec(r: Rotation, v: readonly number[]): Vec3 {
  switch (r) {
    case 90: return [v[2]!, v[1]!, -v[0]!];
    case 180: return [-v[0]!, v[1]!, -v[2]!];
    case 270: return [-v[2]!, v[1]!, v[0]!];
    default: return [v[0]!, v[1]!, v[2]!];
  }
}

export function inverseTurn(r: Rotation): Rotation { return ((360 - r) % 360) as Rotation; }
export function addTurns(a: Rotation, b: Rotation): Rotation { return ((a + b) % 360) as Rotation; }

/**
 * Where the min corner of `b`'s box lands, relative to the turned position,
 * when the box is turned by r: turning [p, p+e] puts the new min at R(p) plus
 * this. Depends only on the extents, so it is exact.
 */
export function cornerShift(r: Rotation, b: Board): Vec3 {
  const [ex, , ez] = boardExtents(b);
  switch (r) {
    case 90: return [0, 0, -ex];
    case 180: return [-ex, 0, -ez];
    case 270: return [-ez, 0, 0];
    default: return [0, 0, 0];
  }
}

const isIdentity = (f: Frame) =>
  f.rotation === 0 && f.position[0] === 0 && f.position[1] === 0 && f.position[2] === 0;

/**
 * A part in a child frame, expressed in its parent's frame: THE composition
 * step for parts (assemblies spec §2.1). worldParts applies it once per level,
 * innermost first, and Ungroup applies the same one step, which is why Ungroup
 * leaves direct children bit-identical. The identity frame returns the part's
 * own coordinates untouched, which is why Group moves nothing, bit for bit.
 * Evaluated as (origin + R(p)) + shift, in that order, everywhere.
 */
export function placeBoard(f: Frame, b: Board): Board {
  if (isIdentity(f)) return { ...b, position: [b.position[0], b.position[1], b.position[2]] };
  const rp = rotateVec(f.rotation, b.position);
  const s = cornerShift(f.rotation, b);
  return {
    ...b,
    rotation: addTurns(f.rotation, b.rotation),
    position: [
      f.position[0]! + rp[0] + s[0],
      f.position[1]! + rp[1] + s[1],
      f.position[2]! + rp[2] + s[2],
    ],
  };
}

/** A nested instance's frame, expressed in its parent's frame. An origin is a
 *  point, so it has no corner shift. Ungroup's step for nested assemblies. */
export function placeInstance(f: Frame, j: Instance): Instance {
  const rp = rotateVec(f.rotation, j.position);
  return {
    ...j,
    rotation: addTurns(f.rotation, j.rotation),
    position: [f.position[0]! + rp[0], f.position[1]! + rp[1], f.position[2]! + rp[2]],
  };
}
