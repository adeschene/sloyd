import { IMPERIAL } from '../units/length';
import { gridDensity, MIN_LINE_SPACING_PX } from './gridDensity';

describe('gridDensity', () => {
  it('draws inch cells when an inch is comfortably readable', () => {
    // 12 px per inch: a cell line every 12 px.
    expect(gridDensity(12, IMPERIAL)).toEqual({ cellSize: 1, sectionSize: 12 });
  });

  it('keeps inch cells right at the readability threshold', () => {
    expect(gridDensity(MIN_LINE_SPACING_PX, IMPERIAL)).toEqual({ cellSize: 1, sectionSize: 12 });
  });

  it('drops to foot cells once an inch would be sub-threshold', () => {
    // Just under 4 px per inch — inch lines would start sharing pixels, but a
    // foot is still 47 px apart.
    expect(gridDensity(MIN_LINE_SPACING_PX - 0.01, IMPERIAL)).toEqual({ cellSize: 12, sectionSize: 144 });
  });

  it('keeps foot cells while a foot is still readable', () => {
    // 1 px per inch: an inch is 1 px (too fine), a foot is 12 px (fine).
    expect(gridDensity(1, IMPERIAL)).toEqual({ cellSize: 12, sectionSize: 144 });
  });

  it('drops to twelve-foot cells when even a foot is sub-threshold', () => {
    // 0.1 px per inch: a foot is 1.2 px, twelve feet is 14.4 px.
    expect(gridDensity(0.1, IMPERIAL)).toEqual({ cellSize: 144, sectionSize: 1728 });
  });

  it('stays at the coarsest tier however far out the camera goes', () => {
    // Nothing coarser exists; it must not return undefined or divide down.
    expect(gridDensity(0.00001, IMPERIAL)).toEqual({ cellSize: 144, sectionSize: 1728 });
  });

  it('each tier is 12x the last, so coarser lines land on finer ones', () => {
    // A tier whose lines did not coincide with the finer tier's would make the
    // grid appear to shift sideways when the tier changes.
    for (const px of [12, 1, 0.1]) {
      const { cellSize, sectionSize } = gridDensity(px, IMPERIAL);
      expect(sectionSize / cellSize).toBe(12);
    }
  });

  it('falls back to the coarsest tier for a degenerate camera', () => {
    // Zero zoom, a negative value, or a zero-size canvas.
    for (const bad of [0, -1, Number.NaN]) {
      expect(gridDensity(bad, IMPERIAL).cellSize).toBe(144);
    }
  });

  it('treats an infinite density as infinitely zoomed in, not as degenerate', () => {
    // Distinct from the degenerate cases above: +Infinity means every tier is
    // readable, so the finest one wins.
    expect(gridDensity(Number.POSITIVE_INFINITY, IMPERIAL)).toEqual({ cellSize: 1, sectionSize: 12 });
  });
});

const MM = { display: 'metric-mm' as const, precision: 16 };
const mm = (n: number) => n / 25.4;
describe('gridDensity, metric', () => {
  it('metric ladder: 10 mm / 100 mm / 1 m, sections 10×', () => {
    expect(gridDensity(1000, MM)).toEqual({ cellSize: mm(10), sectionSize: mm(100) });
    expect(gridDensity(4 / mm(10) - 1e-6, MM)).toEqual({ cellSize: mm(100), sectionSize: mm(1000) });
    expect(gridDensity(1e-6, MM)).toEqual({ cellSize: mm(1000), sectionSize: mm(10000) });
  });
  it('metric degenerate camera falls back to the coarsest METRIC tier', () => {
    expect(gridDensity(NaN, MM)).toEqual({ cellSize: mm(1000), sectionSize: mm(10000) });
    expect(gridDensity(0, MM)).toEqual({ cellSize: mm(1000), sectionSize: mm(10000) });
  });
  it('imperial is unchanged', () => {
    expect(gridDensity(1000, IMPERIAL)).toEqual({ cellSize: 1, sectionSize: 12 });
  });
});
