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

/**
 * Placed dimensions into rows beyond the overall dimension (placed-dimensions spec §6.2, as amended): sorted by `from`,
 * then `to`, then input order, each into the first row whose last occupied end + DIM_LABEL_PAD ≤ its start, else a new
 * row. A span is `[from, to]·scale`. A label that does not fit its span (with its pad) is `past`: drawn just past `to`,
 * so the span occupies `EXT_GAP + labelWidth` more; a centred label lies inside its own span, so only the pad parts two.
 * The strings arrive built (inv 19); never dropped (the user placed them). Returned in packing order.
 */
export function packPlaced(lines: readonly PlacedLine[], scale: number): { line: PlacedLine; row: number; past: boolean }[] {
  const order = lines.map((line, i) => ({ line, i }))
    .sort((p, q) => p.line.from - q.line.from || p.line.to - q.line.to || p.i - q.i);
  const ends: number[] = [];
  return order.map(({ line }) => {
    const span = (line.to - line.from) * scale;
    const w = labelWidth(line.label);
    const past = w + DIM_LABEL_PAD > span;
    const start = line.from * scale;
    const end = line.to * scale + (past ? EXT_GAP + w : 0);
    let row = ends.findIndex((e) => e + DIM_LABEL_PAD <= start);
    if (row < 0) { row = ends.length; ends.push(end); } else ends[row] = end;
    return { line, row, past };
  });
}
