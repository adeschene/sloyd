import type { SloydDocument } from './types';
import type { Vec3 } from './frames';
import { parentPath, worldParts } from './tree';
import { boardExtents } from './geometry';

/** Slider 0..1 → amount (spec §3). Callers apply it; tuned by eye with the user. */
export const EXPLODE_SPREAD = 1;
/**
 * The weight of every level below the top one (spec §3, amended). MUST stay below 1: with equal
 * weights the per-level terms telescope to `amount·(centre(part) − centre(root))`, plain radial
 * explode, and an assembly no longer moves out as a unit.
 */
export const EXPLODE_INNER = 0.5;

const ROOT = '';
const cache = new WeakMap<SloydDocument, Map<number, ReadonlyMap<string, Vec3>>>();

/** ['', 'A', 'A/B', 'A/B/p'] for occurrence 'A/B/p'. */
function chainOf(id: string): string[] {
  const out = [id];
  for (let p = parentPath(id); p !== null; p = parentPath(p)) out.unshift(p);
  return [ROOT, ...out];
}

/**
 * Each placed part's exploded offset, by occurrence id. Hidden parts count toward centres, so a
 * part never jumps when another is hidden. Pure; cached per (document object, amount).
 */
export function explodeOffsets(doc: SloydDocument, amount: number): ReadonlyMap<string, Vec3> {
  let byAmount = cache.get(doc);
  if (!byAmount) { byAmount = new Map(); cache.set(doc, byAmount); }
  const hit = byAmount.get(amount);
  if (hit) return hit;

  const parts = worldParts(doc);
  const lo = new Map<string, Vec3>();
  const hi = new Map<string, Vec3>();
  for (const b of parts) {
    const ext = boardExtents(b);
    const min: Vec3 = [b.position[0], b.position[1], b.position[2]];
    const max: Vec3 = [min[0] + ext[0], min[1] + ext[1], min[2] + ext[2]];
    for (const key of chainOf(b.id)) {
      const l = lo.get(key);
      const h = hi.get(key);
      lo.set(key, l ? [Math.min(l[0], min[0]), Math.min(l[1], min[1]), Math.min(l[2], min[2])] : min);
      hi.set(key, h ? [Math.max(h[0], max[0]), Math.max(h[1], max[1]), Math.max(h[2], max[2])] : max);
    }
  }
  const centre = (key: string): Vec3 => {
    const l = lo.get(key)!;
    const h = hi.get(key)!;
    return [(l[0] + h[0]) / 2, (l[1] + h[1]) / 2, (l[2] + h[2]) / 2];
  };

  const out = new Map<string, Vec3>();
  for (const b of parts) {
    const chain = chainOf(b.id);
    const off: Vec3 = [0, 0, 0];
    for (let i = 1; i < chain.length; i++) {
      const w = amount * (i === 1 ? 1 : EXPLODE_INNER);
      const c1 = centre(chain[i]!);
      const c0 = centre(chain[i - 1]!);
      for (let k = 0; k < 3; k++) off[k] += w * (c1[k] - c0[k]);
    }
    out.set(b.id, off);
  }
  byAmount.set(amount, out);
  return out;
}
