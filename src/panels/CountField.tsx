import { forwardRef } from 'react';
import { DimensionField } from './DimensionField';
import { IMPERIAL } from '../units/length';
import { HOLE_COUNT_MAX } from '../document/document';

const parseCount = (text: string): number | null => (/^\s*\d+\s*$/.test(text) ? Number(text.trim()) : null);

/** A whole number, 1 to `max` (holes spec §7, amended; hardware spec §5.1: bound and invalid words are props, the hole
 *  defaults unchanged): DimensionField with a whole-number parse/format, AngleField's pattern — one set of edit rules
 *  (invariant 5: refuses, never clamps). `onCommit`'s refusal string (ruling R7) passes straight through to DimensionField,
 *  which shows it as its own error. The ref reaches the input (Hardware focuses a new row's count). */
export const CountField = forwardRef<HTMLInputElement, {
  label: string; value: number; onCommit: (n: number) => string | void; max?: number; invalid?: string;
}>(function CountField({ label, value, onCommit, max = HOLE_COUNT_MAX, invalid = 'Enter a whole number of holes, e.g. 12' }, ref) {
  return (
    <DimensionField ref={ref} label={label} value={value} onCommit={onCommit} min={1} max={max}
      units={IMPERIAL} // unused: parse and format are supplied
      parse={parseCount} format={String} invalid={invalid} />
  );
});
