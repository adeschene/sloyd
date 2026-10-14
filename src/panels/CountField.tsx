import { DimensionField } from './DimensionField';
import { HOLE_COUNT_MAX } from '../document/document';

const parseCount = (text: string): number | null => (/^\s*\d+\s*$/.test(text) ? Number(text.trim()) : null);

/** A whole number of holes, 1 to HOLE_COUNT_MAX (holes spec §7, amended): DimensionField with a whole-number
 *  parse/format, AngleField's pattern — one set of edit rules (invariant 5: refuses, never clamps). `onCommit`'s
 *  refusal string (ruling R7) passes straight through to DimensionField, which shows it as its own error. */
export function CountField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => string | void }) {
  return (
    <DimensionField label={label} value={value} onCommit={onCommit} min={1} max={HOLE_COUNT_MAX}
      parse={parseCount} format={String} invalid="Enter a whole number of holes, e.g. 12" />
  );
}
