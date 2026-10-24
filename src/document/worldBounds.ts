import type { Board } from './types';
import { boardsBounds, type Bounds } from './geometry';
import { partGeometry } from './bodies';
import { leanMap } from './lean';
import { toWorld } from './snapPoints';
import type { Point } from './cuts';

/**
 * The ONE real-bounds helper (splayed legs spec §6.1, R2): a part's world extent. Every reader of a world box — the
 * group move, Copy in a row, the section heading and span, the Gizmo, framing, explode, Plans dimension chains — reads
 * it, never `position + boardExtents`, which is a leaning part's PRE-lean box (inv 2) and never its extent (anti-goal).
 *
 * Its own module because it reads bodies: `geometry.ts` sits below `bodies.ts` and must not import it, so
 * `boardsBounds` stays there, lean-free, and this composes it.
 */

/**
 * `b`'s world box. An unleaned part: exactly `boardsBounds([b])` (byte for byte today's numbers). A leaning part: the
 * min/max of every LEANED body vertex (`toWorld` composes the lean, R1) — the bodies, not the box's 8 corners, because a
 * levelled foot cuts away the wedge a box corner would still count. A part whose cuts left no bodies leans the box it
 * draws (the ghost, inv 21).
 */
export function partBounds(b: Board): Bounds {
  const lean = leanMap(b);
  if (!lean) return boardsBounds([b])!;
  // `toWorld`'s two steps with the lean's map built once per part: the pre-lean placement (`toWorld` of the part
  // without its lean), then `apply`.
  const { lean: _lean, ...upright } = b;
  const world = (p: Point) => lean.apply(toWorld(upright, p));
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const take = (w: readonly number[]) => {
    for (let k = 0; k < 3; k += 1) {
      if (w[k]! < min[k]!) min[k] = w[k]!;
      if (w[k]! > max[k]!) max[k] = w[k]!;
    }
  };
  const { bodies } = partGeometry(b);
  if (bodies.length === 0) {
    for (let i = 0; i < 8; i += 1) {
      take(world({ length: i & 1 ? b.length : 0, width: i & 2 ? b.width : 0, thickness: i & 4 ? b.thickness : 0 }));
    }
    return { min, max };
  }
  for (const body of bodies) {
    for (const f of body.faces) for (const v of f.verts) take(world({ length: v[0], width: v[1], thickness: v[2] }));
  }
  return { min, max };
}

/**
 * The world box around `bs`, or null for none. No part leans: `boardsBounds(bs)` itself, so lean-free callers are byte
 * for byte unchanged; otherwise the union of `partBounds`.
 */
export function partsBounds(bs: readonly Board[]): Bounds | null {
  if (!bs.some((b) => leanMap(b))) return boardsBounds(bs);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of bs) {
    const r = partBounds(b);
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, r.min[k]!);
      max[k] = Math.max(max[k]!, r.max[k]!);
    }
  }
  return { min, max };
}
