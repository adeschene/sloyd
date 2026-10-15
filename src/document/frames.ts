import type { Board, Dimension, Instance, Rotation } from './types';
import { axisFrame, boardExtents } from './geometry';
import { mirrorCut } from './mirrorCut';
import { mirrorAngleCut } from './angleCuts';
import { mirrorHoleRow } from './holes';
import { mirrorCurveCut } from './curves';

export type Vec3 = [number, number, number];

/** Where a frame sits in its parent: an Instance satisfies this. A mirrored
 *  frame reflects its own local X before it turns (mirrored-instances spec §2). */
export interface Frame { position: readonly number[]; rotation: Rotation; mirrored?: boolean }

/** `x` with its mirror flag set to `m`: the key present only when true (spec §2). */
export function withMirror<T extends { mirrored?: boolean }>(x: T, m: boolean): T {
  const { mirrored: _drop, ...rest } = x;
  return (m ? { ...rest, mirrored: true } : rest) as T;
}

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

/** The part dimension on X at turn 0 for the part's posture (v12 axisFrame):
 *  length for flat and on-edge, width for upright. A reflection of X is a
 *  reflection of this dimension, whichever way it runs (spec §3). */
export function mirrorDim(b: Board): Dimension {
  return axisFrame({ ...b, rotation: 0 })[0]!.dim;
}

/**
 * A part reflected across x = 0 of its container (spec §3): M R(s) = R(-s) M,
 * and M F = F M_d0 for the turn-0 frame F, so the turn is negated, the cuts, angle cuts, hole rows and curves are
 * mirrored along d0, and the box's min corner is reflected. Posture and sizes
 * are unchanged (turns s and -s put the same dimensions on the same axes).
 * `0 - v` keeps a zero +0.
 */
export function mirrorPart(b: Board): Board {
  const d = mirrorDim(b);
  const ex = boardExtents(b)[0];
  return {
    ...b,
    rotation: inverseTurn(b.rotation),
    position: [0 - (b.position[0] + ex), b.position[1], b.position[2]],
    cuts: b.cuts.map((c) => mirrorCut(c, d, b[d])),
    angleCuts: b.angleCuts.map((c) => mirrorAngleCut(c, d)),
    holes: b.holes.map((r) => mirrorHoleRow(r, d)),
    curves: b.curves.map((c) => mirrorCurveCut(c, d)),
  };
}

/** A nested instance reflected across x = 0 of its container (spec §3):
 *  M T(o) R(t) M^m = T(Mo) R(-t) M^(m+1). */
function mirrorFrame(j: Instance): Instance {
  return withMirror({ ...j, rotation: inverseTurn(j.rotation), position: [0 - j.position[0], j.position[1], j.position[2]] }, j.mirrored !== true);
}

/** A chain's linear part (spec §4): world vector = R(rotation) . M^mirrored . local vector. */
export interface Linear { rotation: Rotation; mirrored: boolean }
export const IDENTITY_LINEAR: Linear = { rotation: 0, mirrored: false };

/** outer . f: R(a) M^p R(b) M^q = R(a + (p ? -b : b)) M^(p xor q). */
export function composeLinear(outer: Linear, f: { rotation: Rotation; mirrored?: boolean }): Linear {
  return {
    rotation: addTurns(outer.rotation, outer.mirrored ? inverseTurn(f.rotation) : f.rotation),
    mirrored: outer.mirrored !== (f.mirrored === true),
  };
}

/** A world vector in the chain's local frame: M^m . R(-r) . w. Exact (quarter turns swap and negate). */
export function toLocal(l: Linear, w: readonly number[]): Vec3 {
  const v = rotateVec(inverseTurn(l.rotation), w);
  return l.mirrored ? [0 - v[0], v[1], v[2]] : v;
}

const unmirrored = (f: Frame): Frame => ({ position: f.position, rotation: f.rotation });

const isIdentity = (f: Frame) =>
  f.rotation === 0 && f.position[0] === 0 && f.position[1] === 0 && f.position[2] === 0;

/**
 * A part in a child frame, expressed in its parent's frame: THE composition
 * step for parts (assemblies spec §2.1). worldParts applies it once per level,
 * innermost first, and Ungroup applies the same one step, which is why Ungroup
 * leaves direct children bit-identical. The identity frame returns the part's
 * own coordinates untouched, which is why Group moves nothing, bit for bit.
 * Evaluated as (origin + R(p)) + shift, in that order, everywhere.
 * A mirrored frame first reflects the part in its own coordinates
 * (`mirrorPart`), then places it as below.
 */
export function placeBoard(f: Frame, b: Board): Board {
  if (f.mirrored) return placeBoard(unmirrored(f), mirrorPart(b));
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
  if (f.mirrored) return placeInstance(unmirrored(f), mirrorFrame(j));
  const rp = rotateVec(f.rotation, j.position);
  return {
    ...j,
    rotation: addTurns(f.rotation, j.rotation),
    position: [f.position[0]! + rp[0], f.position[1]! + rp[1], f.position[2]! + rp[2]],
  };
}
