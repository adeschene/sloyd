import { DimensionField } from './DimensionField';

const parseDegrees = (text: string): number | null => {
  const t = text.trim().replace(/°\s*$/, '').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};
const formatDegrees = (v: number) => `${v.toFixed(1)}°`;

/** Degrees, 0 < a < 90 and ≤ `max` (spec §7). DimensionField with a degree parse/format: one set of edit rules. */
export function AngleField({ label, value, onCommit, max }: { label: string; value: number; onCommit: (degrees: number) => void; max?: number }) {
  const limit = Math.min(max ?? Infinity, 89.9);
  return (
    <DimensionField label={label} value={value} onCommit={onCommit} max={limit}
      parse={parseDegrees} format={formatDegrees} invalid="Enter an angle in degrees, e.g. 45 or 22.5" />
  );
}
