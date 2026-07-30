import { gridDensity, MIN_LINE_SPACING_PX } from './gridDensity';

describe('gridDensity', () => {
  it('draws inch cells when an inch is comfortably readable', () => {
    // 12 px per inch: a cell line every 12 px.
    expect(gridDensity(12)).toEqual({ cellSize: 1, sectionSize: 12 });
  });

  it('keeps inch cells right at the readability threshold', () => {
    expect(gridDensity(MIN_LINE_SPACING_PX)).toEqual({ cellSize: 1, sectionSize: 12 });
  });

  it('drops to foot cells once an inch would be sub-threshold', () => {
    // Just under 4 px per inch — inch lines would start sharing pixels, but a
    // foot is still 47 px apart.
    expect(gridDensity(MIN_LINE_SPACING_PX - 0.01)).toEqual({ cellSize: 12, sectionSize: 144 });
  });

  it('keeps foot cells while a foot is still readable', () => {
    // 1 px per inch: an inch is 1 px (too fine), a foot is 12 px (fine).
    expect(gridDensity(1)).toEqual({ cellSize: 12, sectionSize: 144 });
  });

  it('drops to twelve-foot cells when even a foot is sub-threshold', () => {
    // 0.1 px per inch: a foot is 1.2 px, twelve feet is 14.4 px.
    expect(gridDensity(0.1)).toEqual({ cellSize: 144, sectionSize: 1728 });
  });

  it('stays at the coarsest tier however far out the camera goes', () => {
    // Nothing coarser exists; it must not return undefined or divide down.
    expect(gridDensity(0.00001)).toEqual({ cellSize: 144, sectionSize: 1728 });
  });

  it('each tier is 12x the last, so coarser lines land on finer ones', () => {
    // A tier whose lines did not coincide with the finer tier's would make the
    // grid appear to shift sideways when the tier changes.
    for (const px of [12, 1, 0.1]) {
      const { cellSize, sectionSize } = gridDensity(px);
      expect(sectionSize / cellSize).toBe(12);
    }
  });

  it('falls back to the coarsest tier for a degenerate camera', () => {
    // Zero zoom, a negative value, or a zero-size canvas.
    for (const bad of [0, -1, Number.NaN]) {
      expect(gridDensity(bad).cellSize).toBe(144);
    }
  });

  it('treats an infinite density as infinitely zoomed in, not as degenerate', () => {
    // Distinct from the degenerate cases above: +Infinity means every tier is
    // readable, so the finest one wins.
    expect(gridDensity(Number.POSITIVE_INFINITY)).toEqual({ cellSize: 1, sectionSize: 12 });
  });
});
