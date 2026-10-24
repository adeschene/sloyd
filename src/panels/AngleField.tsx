import { DimensionField } from './DimensionField';
import { IMPERIAL } from '../units/length';

const parseDegrees = (text: string): number | null => {
  const t = text.trim().replace(/°\s*$/, '').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};
const formatDegrees = (v: number) => `${v.toFixed(1)}°`;

/** Degrees, 0 < a < 90 and ≤ `max` (spec §7); `min0` admits 0 itself (the Lean section: no rake is a legal rake). A null
 *  `value` is MIXED (several parts differ; DimensionField's empty box, inv 5). DimensionField with a degree
 *  parse/format: one set of edit rules. */
/** `onCommit` may return a refusal message: the field shows it as its own error and keeps focus (DimensionField, R7). */
export function AngleField({ label, value, onCommit, max, min0 }: { label: string; value: number | null; onCommit: (degrees: number) => string | void; max?: number; min0?: boolean }) {
  // Floored to the 0.1° the field displays (epsilon keeps an exact 45.0): the stated bound is always typeable (fu 293).
  const limit = Math.floor(Math.min(max ?? Infinity, 89.9) * 10 + 1e-9) / 10;
  return (
    <DimensionField label={label} value={value} onCommit={onCommit} max={limit} min={min0 ? 0 : undefined}
      units={IMPERIAL} // unused: parse and format are supplied
      parse={parseDegrees} format={formatDegrees} invalid="Enter an angle in degrees, e.g. 45 or 22.5" />
  );
}
