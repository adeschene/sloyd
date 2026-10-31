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

/** Where a placed dimension's label sits: centred in its span, just past `to`, or just before `from`. */
export type PlacedLabel = 'centre' | 'past' | 'before';
export interface PackedLine { line: PlacedLine; row: number; label: PlacedLabel }

/**
 * Placed dimensions into rows beyond the overall dimension (placed-dimensions spec §6.2, as amended, rulings 1–3). A span
 * is `[from, to]·scale`, in the view's own direction (up the paper for a vertical one). A centred label lies inside its own
 * span, so only DIM_LABEL_PAD parts two neighbours (ruling 1). A label that does not fit its span (with its pad) sits by
 * ROOM (ruling 3), `lo`/`hi` being how far the figure lets a label reach before `from` and after `to`, in the same scaled
 * coordinates: just past `to` (occupying `EXT_GAP + labelWidth` more) when it ends by `hi`; else just before `from` when
 * it starts by `lo`; else past `to` all the same, and `overhang` says how far beyond `hi` the farthest such label reaches,
 * for the layout to reserve: a label is never clipped.
 * Sorted by the occupied start (`from·scale` unless the label is before it), then `from`, `to`, input order; each into the
 * first row whose last occupied end + DIM_LABEL_PAD ≤ its start, else a new row, but never more than `maxRows`: a line
 * that would open one more is `dropped`, for the figure's note to name (ruling 2). The strings arrive built (inv 19).
 * `packed` and `dropped` are in packing order.
 */
export function packPlaced(lines: readonly PlacedLine[], scale: number, room: { lo?: number; hi?: number; maxRows?: number } = {}):
  { packed: PackedLine[]; dropped: PlacedLine[]; overhang: number } {
  const lo = room.lo ?? -Infinity;
  const hi = room.hi ?? Infinity;
  const maxRows = room.maxRows ?? Infinity;
  const order = lines.map((line, i) => {
    const w = labelWidth(line.label);
    const pastEnd = line.to * scale + EXT_GAP + w;
    const beforeStart = line.from * scale - EXT_GAP - w;
    const label: PlacedLabel = w + DIM_LABEL_PAD <= (line.to - line.from) * scale ? 'centre'
      : pastEnd <= hi || beforeStart < lo ? 'past' : 'before';
    const start = label === 'before' ? beforeStart : line.from * scale;
    const end = label === 'past' ? pastEnd : line.to * scale;
    return { line, i, label, start, end };
  }).sort((p, q) => p.start - q.start || p.line.from - q.line.from || p.line.to - q.line.to || p.i - q.i);
  const ends: number[] = [];
  const packed: PackedLine[] = [];
  const dropped: PlacedLine[] = [];
  let overhang = 0;
  for (const { line, label, start, end } of order) {
    let row = ends.findIndex((e) => e + DIM_LABEL_PAD <= start);
    if (row < 0) {
      if (ends.length >= maxRows) { dropped.push(line); continue; }
      row = ends.length;
      ends.push(end);
    } else ends[row] = end;
    if (label === 'past') overhang = Math.max(overhang, end - hi);
    packed.push({ line, row, label });
  }
  return { packed, dropped, overhang };
}

type NotDrawn = readonly { axis: 'X' | 'Y' | 'Z'; line: PlacedLine }[];
const notDrawn = (view: string, dropped: NotDrawn, why: (n: number) => string): string | null => {
  if (dropped.length === 0) return null;
  const n = dropped.length;
  return `${view}: ${n} placed dimension${n === 1 ? '' : 's'} not drawn — ${why(n)} (${dropped.map((d) => `${d.axis} ${d.line.label}`).join(', ')})`;
};

/** One view's note for the placed dimensions its rows had no room for (ruling 2), each named by its axis and its own
 *  label as `placedDimLines` built it; `null` when none. */
export const noRoomNote = (view: string, dropped: NotDrawn) => notDrawn(view, dropped, () => 'no room');

/** One view's note for the placed dimensions reaching past its drawing (ruling 4), named as `noRoomNote` names them. */
export const offDrawingNote = (view: string, dropped: NotDrawn) =>
  notDrawn(view, dropped, (n) => (n === 1 ? 'it reaches past the drawing' : 'they reach past the drawing'));
