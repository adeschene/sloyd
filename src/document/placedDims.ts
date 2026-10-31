import { toWorld, fromWorld } from './snapPoints';
import type { SnapPoint } from './snapPoints';
import { geometryBoard } from './profiles';
import type { Rekey } from './treeOps';
import type { Board, DimAnchor, DimFrac, Dimension, PlacedDimension, SloydDocument, TapeAxis } from './types';
import type { Vec3 } from './lineModel';
import { FRONT, SIDE, type P2, type View } from './drawing';
import { formatLengthBare, type Units } from '../units/length';

/**
 * Placed dimensions: anchors, the D decider and re-key (placed-dimensions spec §2, §2.1, §2.2, §3).
 *
 * Imports `units/length` for `placedDimLines`' sheet labels alone (the `→ units` edge rule: a string a person reads off
 * the page); the two refusals carry no length.
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
 * point (crossing, line-face hit included) are fixed in the world as `{ at }`. Callers pass `worldParts(doc)`; `null`
 * means a board-owned point whose part is not in `parts`, and the caller refuses (never silently fixed in the world).
 */
export function anchorFor(parts: readonly Board[], p: SnapPoint): DimAnchor | null {
  if (p.kind === 'offset' || p.owner.type !== 'board') return { at: [p.at[0], p.at[1], p.at[2]] };
  const board = parts.find((b) => b.id === p.owner.id);
  if (!board) return null;
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

/** One placed dimension on the Plans sheet (spec §6.2), in its view's drawing coordinates (inches): `from < to` along the
 *  view direction, `a` and `b` the anchors projected into the view, the label built here (inv 19). */
export interface PlacedLine { id: string; from: number; to: number; a: P2; b: P2; label: string }

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * The sheet's placed dimensions (spec §6.1): X in Front along the paper, Y in Front up it, Z in Side along it (Side's right
 * is −Z); Plan gets none. Anchors resolve through `resolveAnchor` only (inv 65); a detached dimension is counted, never
 * listed. Labels are `formatLengthBare` (inv 52: bare mm in metric), measured later by the panel layer (inv 19).
 */
export function placedDimLines(parts: readonly Board[], dims: readonly PlacedDimension[], units: Units):
  { frontH: PlacedLine[]; frontV: PlacedLine[]; sideH: PlacedLine[]; detached: number } {
  const out = { frontH: [] as PlacedLine[], frontV: [] as PlacedLine[], sideH: [] as PlacedLine[], detached: 0 };
  const route: Record<TapeAxis, [View, 0 | 1, PlacedLine[]]> = { x: [FRONT, 0, out.frontH], y: [FRONT, 1, out.frontV], z: [SIDE, 0, out.sideH] };
  for (const d of dims) {
    const pa = resolveAnchor(parts, d.a);
    const pb = resolveAnchor(parts, d.b);
    if (!pa || !pb) { out.detached++; continue; }
    const [view, k, list] = route[d.axis];
    const a: P2 = [dot(pa, view.right), dot(pa, view.up)];
    const b: P2 = [dot(pb, view.right), dot(pb, view.up)];
    const from = Math.min(a[k], b[k]);
    const to = Math.max(a[k], b[k]);
    list.push({ id: d.id, from, to, a, b, label: formatLengthBare(to - from, units) });
  }
  return out;
}

/** The sheet's one note for detached dimensions (spec §6.3): nothing disappears silently. */
export const detachedNote = (n: number) =>
  n === 1 ? '1 placed dimension not drawn — its part was deleted' : `${n} placed dimensions not drawn — their parts were deleted`;
