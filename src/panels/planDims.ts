import type { DimAxis, DimLine } from '../document/dimensions';
import type { PlacedLine } from '../document/placedDims';
import { labelWidth } from './diagramLabels';

/** More surviving chain segments than this and the chain is omitted (spec §5.3). */
export const CHAIN_MAX = 12;
/** Drawn room a label needs beyond its own width (SVG user units). */
export const DIM_LABEL_PAD = 8;
/** The gap between a drawing and its extension lines, and between a dimension line and its label (SVG user units). */
export const EXT_GAP = 4;

/**
 * Measure, drop and cap a chain at a drawn scale (user units per inch). The strings arrive built
 * (invariant 19); this only decides which are drawn. Nothing disappears silently: the note says so.
 */
export function fitChain(axis: DimAxis, scale: number): { chain: DimLine[]; note: string | null } {
  const total = axis.chain.length;
  if (total === 0) return { chain: [], note: null };
  const fits = axis.chain.filter((d) => labelWidth(d.label) + DIM_LABEL_PAD <= (d.to - d.from) * scale);
  const dropped = total - fits.length;
  if (fits.length > CHAIN_MAX) {
    return { chain: [], note: `${axis.name} chain omitted — too dense` };
  }
  const note = dropped === 0 ? null
    : `${dropped} small ${axis.name.toLowerCase()} spacing${dropped === 1 ? '' : 's'} not labelled`;
  return { chain: fits, note };
}

/** Where a placed dimension's label sits: centred in its span, just past `to`, or (no room past `to`) just before `from`. */
export type PlacedLabel = 'centre' | 'past' | 'before';
export interface PackedLine { line: PlacedLine; row: number; label: PlacedLabel }

/**
 * Placed dimensions into rows beyond the overall dimension (placed-dimensions spec §6.2, as amended, rulings 1–3). A span
 * is `[from, to]·scale`, in the view's own direction (up the paper for a vertical one). A label that does not fit its span
 * (with its pad) goes just past `to`, occupying `EXT_GAP + labelWidth` more; when that would reach beyond `limit` (the
 * view's outer edge plus its room, in the same scaled coordinates) it goes just BEFORE `from` instead, occupying as much
 * before it. A centred label lies inside its own span, so only DIM_LABEL_PAD parts two neighbours (ruling 1).
 * Sorted by the occupied start (`from·scale` unless the label is before it), then `from`, `to`, input order; each into the
 * first row whose last occupied end + DIM_LABEL_PAD ≤ its start, else a new row, but never more than `maxRows`: a line
 * that would open one more is `dropped`, for the figure's note to name (ruling 2). The strings arrive built (inv 19).
 * `packed` and `dropped` are in packing order.
 */
export function packPlaced(lines: readonly PlacedLine[], scale: number, room: { limit?: number; maxRows?: number } = {}):
  { packed: PackedLine[]; dropped: PlacedLine[] } {
  const limit = room.limit ?? Infinity;
  const maxRows = room.maxRows ?? Infinity;
  const order = lines.map((line, i) => {
    const w = labelWidth(line.label);
    const past = w + DIM_LABEL_PAD > (line.to - line.from) * scale;
    const label: PlacedLabel = !past ? 'centre' : line.to * scale + EXT_GAP + w > limit ? 'before' : 'past';
    const start = line.from * scale - (label === 'before' ? EXT_GAP + w : 0);
    const end = line.to * scale + (label === 'past' ? EXT_GAP + w : 0);
    return { line, i, label, start, end };
  }).sort((p, q) => p.start - q.start || p.line.from - q.line.from || p.line.to - q.line.to || p.i - q.i);
  const ends: number[] = [];
  const packed: PackedLine[] = [];
  const dropped: PlacedLine[] = [];
  for (const { line, label, start, end } of order) {
    let row = ends.findIndex((e) => e + DIM_LABEL_PAD <= start);
    if (row < 0) {
      if (ends.length >= maxRows) { dropped.push(line); continue; }
      row = ends.length;
      ends.push(end);
    } else ends[row] = end;
    packed.push({ line, row, label });
  }
  return { packed, dropped };
}

/** One view's note for the placed dimensions its rows had no room for (ruling 2), each named by its axis and its own
 *  label as `placedDimLines` built it; `null` when none. */
export function noRoomNote(view: string, dropped: readonly { axis: 'X' | 'Y' | 'Z'; line: PlacedLine }[]): string | null {
  if (dropped.length === 0) return null;
  const n = dropped.length;
  return `${view}: ${n} placed dimension${n === 1 ? '' : 's'} not drawn — no room (${dropped.map((d) => `${d.axis} ${d.line.label}`).join(', ')})`;
}
