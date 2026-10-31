import { toWorld, fromWorld } from './snapPoints';
import type { SnapPoint } from './snapPoints';
import { geometryBoard } from './profiles';
import type { Rekey } from './treeOps';
import type { Board, DimAnchor, DimFrac, Dimension, PlacedDimension, SloydDocument, TapeAxis } from './types';
import type { Vec3 } from './lineModel';

/**
 * Placed dimensions: anchors, the D decider and re-key (placed-dimensions spec §2, §2.1, §2.2, §3).
 *
 * Imports nothing from `units/` on purpose (the `→ units` edge rule): the only strings here are the two refusals,
 * and neither carries a length.
 */

/** "Differ" and "zero" both mean by more than this (spec §3): a leaning part's `toWorld` carries ~1e-15 noise. */
export const DIM_EPS = 1e-9;

const DIMS: readonly Dimension[] = ['length', 'width', 'thickness'];
const AXES: readonly TapeAxis[] = ['x', 'y', 'z'];

/**
 * An anchor's world point (spec §2.1), the ONE reader of an anchor. `null` when its part is not among `parts`
 * (detached, never repaired). A `frac` anchor scales the part's CURRENT geometry size, so it follows a resize; a
 * `local` anchor is a fixed station in the part's own space; both map through `toWorld` (inv 44, lean composed),
 * and this is the only caller of `toWorld` in this module (inv 65).
 */
export function resolveAnchor(parts: readonly Board[], a: DimAnchor): [number, number, number] | null {
  if (!('part' in a)) return [a.at[0], a.at[1], a.at[2]];
  const board = parts.find((b) => b.id === a.part);
  if (!board) return null;
  if ('frac' in a) {
    const g = geometryBoard(board);
    const p = {} as Record<Dimension, number>;
    for (const d of DIMS) p[d] = a.frac[d] * g[d];
    return toWorld(board, p);
  }
  return toWorld(board, a.local);
}

/**
 * The anchor a snap point keeps (spec §2.2). A board-owned point becomes `frac` when every part-space coordinate is a
 * lattice value (0, ½ or all of the geometry size, within `DIM_EPS`), else `local`; an offset point, a guide-owned
 * point (crossing, line-face hit included) and a point whose part is absent are fixed in the world as `{ at }`.
 */
export function anchorFor(parts: readonly Board[], p: SnapPoint): DimAnchor {
  const fixed: DimAnchor = { at: [p.at[0], p.at[1], p.at[2]] };
  if (p.kind === 'offset' || p.owner.type !== 'board') return fixed;
  const board = parts.find((b) => b.id === p.owner.id);
  if (!board) return fixed;
  const local = fromWorld(board, p.at);
  const g = geometryBoard(board);
  const frac = {} as Record<Dimension, DimFrac>;
  for (const d of DIMS) {
    const size = g[d];
    const v = local[d];
    const hit = ([0, 0.5, 1] as const).find((f) => Math.abs(v - f * size) <= DIM_EPS);
    if (hit === undefined) return { part: board.id, local };
    frac[d] = hit;
  }
  return { part: board.id, frac };
}

/** A placed dimension's length: `|b − a|` along its axis, or `null` when either end is detached (spec §2). */
export function dimensionValue(parts: readonly Board[], d: PlacedDimension): number | null {
  const a = resolveAnchor(parts, d.a);
  const b = resolveAnchor(parts, d.b);
  if (!a || !b) return null;
  const i = AXES.indexOf(d.axis);
  return Math.abs(b[i]! - a[i]!);
}

/**
 * The ONE D decider (spec §3): which axis a kept Tape measurement measures along, or why it refuses. With a lock, that
 * axis (refused when the points are level along it); otherwise the one axis they differ on. Two or three differing axes
 * with none locked refuse: guessing would print a number the user did not mean. Said before `edit()`.
 */
export function dimensionAxis(a: Vec3, b: Vec3, locked: TapeAxis | null): { axis: TapeAxis } | { refusal: string } {
  const differs = AXES.filter((_, i) => Math.abs(b[i]! - a[i]!) > DIM_EPS);
  if (locked) {
    if (!differs.includes(locked)) return { refusal: `The two points are level along ${locked.toUpperCase()}.` };
    return { axis: locked };
  }
  if (differs.length === 1) return { axis: differs[0]! };
  if (differs.length === 0) return { refusal: 'The two points are level along X.' };
  return { refusal: 'Lock an axis (X, Y or Z) to keep a dimension.' };
}

/**
 * Re-key every `part` anchor with `rekey` (spec §2.3: the paths are hints, kept in step with Group/Ungroup/rename).
 * `{ at }` anchors are untouched. Returns the SAME document when nothing changes (inv 4: no work for nothing).
 */
export function rekeyDimensions(doc: SloydDocument, rekey: Rekey): SloydDocument {
  let changed = false;
  const anchor = (a: DimAnchor): DimAnchor => {
    if (!('part' in a)) return a;
    const part = rekey(a.part);
    if (part === a.part) return a;
    changed = true;
    return { ...a, part };
  };
  const dimensions = doc.dimensions.map((d) => {
    const na = anchor(d.a);
    const nb = anchor(d.b);
    return na === d.a && nb === d.b ? d : { ...d, a: na, b: nb };
  });
  return changed ? { ...doc, dimensions } : doc;
}
