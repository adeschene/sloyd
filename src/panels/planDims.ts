import type { DimAxis, DimLine } from '../document/dimensions';
import { labelWidth } from './diagramLabels';

/** More surviving chain segments than this and the chain is omitted (spec §5.3). */
export const CHAIN_MAX = 12;
/** Drawn room a label needs beyond its own width (SVG user units). */
export const DIM_LABEL_PAD = 8;

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
