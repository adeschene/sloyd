import { MAX_ROW, rowLayout } from './row';

describe('rowLayout', () => {
  it('gap: step is the part plus the gap; gap 0 is touching', () => {
    expect(rowLayout('gap', 0.5, 3.5, 4)).toEqual({ ok: true, step: 4, gap: 0.5, length: 15.5 });
    expect(rowLayout('gap', 0, 3.5, 2)).toEqual({ ok: true, step: 3.5, gap: 0, length: 7 });
    expect(rowLayout('gap', -1 / 16, 3.5, 2)).toEqual({ ok: false, reason: 'negative-gap' });
  });

  it('pitch: step is the pitch; a pitch shorter than the part is refused', () => {
    expect(rowLayout('pitch', 4, 1.5, 3)).toEqual({ ok: true, step: 4, gap: 2.5, length: 9.5 });
    expect(rowLayout('pitch', 1.5, 1.5, 3)).toEqual({ ok: true, step: 1.5, gap: 0, length: 4.5 });
    expect(rowLayout('pitch', 1.4, 1.5, 3)).toEqual({ ok: false, reason: 'pitch-short' });
  });

  it('fit: N parts spread evenly across D, outer to outer', () => {
    expect(rowLayout('fit', 20, 2, 4)).toEqual({ ok: true, step: 6, gap: 4, length: 20 });
    expect(rowLayout('fit', 8, 2, 4)).toEqual({ ok: true, step: 2, gap: 0, length: 8 });
    expect(rowLayout('fit', 7.9, 2, 4)).toEqual({ ok: false, reason: 'no-room' });
  });

  it('fit does not round: 8 parts of 3/4in across 30in', () => {
    const r = rowLayout('fit', 30, 0.75, 8);
    const step = r.ok ? r.step : NaN;
    const gap = r.ok ? r.gap : NaN;
    expect(step).toBe((30 - 0.75) / 7);
    expect(gap).toBe((30 - 8 * 0.75) / 7);
    // Guard: step must not already be on the 1/16 grid, or rounding mutation becomes vacuous
    expect(Math.round(step * 16) / 16).not.toBe(step);
  });

  it('refuses a count outside 2..MAX_ROW or not whole, and a non-finite value', () => {
    expect(rowLayout('gap', 0, 1, 1)).toEqual({ ok: false, reason: 'count' });
    expect(rowLayout('gap', 0, 1, MAX_ROW + 1)).toEqual({ ok: false, reason: 'count' });
    expect(rowLayout('gap', 0, 1, 2.5)).toEqual({ ok: false, reason: 'count' });
    expect(rowLayout('gap', 0, 1, MAX_ROW).ok).toBe(true);
    expect(rowLayout('gap', Number.NaN, 1, 2)).toEqual({ ok: false, reason: 'value' });
    // Follow-up 219: a unit with no extent on the axis makes no row.
    expect(rowLayout('gap', 0, 0, 2)).toEqual({ ok: false, reason: 'value' });
  });
});
