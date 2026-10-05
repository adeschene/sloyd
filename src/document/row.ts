/**
 * The arithmetic of a row of copies (copy-in-a-row spec §2): the step from one
 * copy to the next, the clear gap between them, and the row's outer length.
 * `s` is the unit's extent along the row's axis. The count is the TOTAL in the
 * row, original included.
 *
 * Nothing here rounds: every value comes from what the person typed, so it is
 * kept exact (invariant 25). A refusal is a CODE, not a sentence, so this
 * module stays free of `units`; the panel words it.
 */
export type RowMode = 'gap' | 'pitch' | 'fit';
export const MAX_ROW = 100;
export type RowRefusal = 'count' | 'value' | 'negative-gap' | 'pitch-short' | 'no-room';
export type RowLayout =
  | { ok: true; step: number; gap: number; length: number }
  | { ok: false; reason: RowRefusal };

export function rowLayout(mode: RowMode, value: number, s: number, count: number): RowLayout {
  if (!Number.isInteger(count) || count < 2 || count > MAX_ROW) return { ok: false, reason: 'count' };
  if (!Number.isFinite(value) || !(s > 0)) return { ok: false, reason: 'value' };
  const n = count - 1;
  switch (mode) {
    case 'gap':
      if (value < 0) return { ok: false, reason: 'negative-gap' };
      return { ok: true, step: s + value, gap: value, length: s + n * (s + value) };
    case 'pitch':
      if (value < s) return { ok: false, reason: 'pitch-short' };
      return { ok: true, step: value, gap: value - s, length: s + n * value };
    case 'fit':
      if (value < count * s) return { ok: false, reason: 'no-room' };
      return { ok: true, step: (value - s) / n, gap: (value - count * s) / n, length: value };
  }
}
