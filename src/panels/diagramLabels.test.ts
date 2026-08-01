import { labelWidth, packRow, CHAR_W, LABEL_SIZE, LABEL_EM } from './diagramLabels';

describe('labelWidth', () => {
  it('is linear in the character count', () => {
    // Measured in a real browser at font-size 20 with --font-num: every glyph
    // is exactly 12.05 units. See the spec's section 2 table.
    expect(labelWidth('6"')).toBeCloseTo(2 * CHAR_W, 10);
    expect(labelWidth('3/4"')).toBeCloseTo(4 * CHAR_W, 10);
    expect(labelWidth('100-15/16"')).toBeCloseTo(10 * CHAR_W, 10);
  });

  it('bounds the measured advance from ABOVE, never below', () => {
    // 12.05 was measured; CHAR_W must exceed it or the packer under-spaces and
    // the browser overlaps while every test here passes.
    expect(CHAR_W).toBeGreaterThan(12.05);
    expect(CHAR_W).toBe(LABEL_SIZE * LABEL_EM);
  });

  it('counts the space in a label that has one', () => {
    expect(labelWidth('3/8" deep')).toBeCloseTo(9 * CHAR_W, 10);
  });

  it('is zero for an empty label', () => {
    expect(labelWidth('')).toBe(0);
  });
});

describe('packRow', () => {
  it('leaves comfortably-spaced labels exactly where they asked to be', () => {
    const out = packRow([{ centre: 100, width: 20 }, { centre: 300, width: 20 }], 0, 1000, 8);
    expect(out).toEqual([100, 300]);
  });

  it('pushes an overlapping pair apart to exactly the gap', () => {
    const out = packRow([{ centre: 100, width: 40 }, { centre: 110, width: 40 }], 0, 1000, 8);
    expect(out[0]).toBeCloseTo(100, 10);          // the leftmost never moves...
    expect(out[1] - out[0]).toBeCloseTo(48, 10);  // ...the next one cascades right
    expect(out[1] - 20 - (out[0] + 20)).toBeCloseTo(8, 10);
  });

  it('preserves order, whatever the ideal centres ask for', () => {
    const out = packRow(
      [{ centre: 500, width: 100 }, { centre: 10, width: 100 }, { centre: 20, width: 100 }],
      0, 1000, 8,
    );
    expect(out[0]).toBeLessThan(out[1]);
    expect(out[1]).toBeLessThan(out[2]);
  });

  it('shifts the whole row left rather than overflowing the right bound', () => {
    const out = packRow([{ centre: 90, width: 40 }, { centre: 95, width: 40 }], 0, 100, 8);
    expect(out[1] + 20).toBeCloseTo(100, 10);     // right edge sits exactly on max
    expect(out[1] - out[0]).toBeCloseTo(48, 10);  // the gap survived the shift
  });

  it('overflows RIGHT, never left, when a row genuinely cannot fit', () => {
    // Two 40-wide labels plus a gap need 88 units; the interval is 50.
    const out = packRow([{ centre: 25, width: 40 }, { centre: 25, width: 40 }], 0, 50, 8);
    expect(out[0] - 20).toBe(0);                  // clamped at min, not pushed past it
    expect(out[1] + 20).toBeGreaterThan(50);      // the overflow goes right
  });

  it('handles the degenerate rows without returning NaN', () => {
    expect(packRow([], 0, 100, 8)).toEqual([]);
    expect(packRow([{ centre: 50, width: 0 }], 0, 100, 8)).toEqual([50]);
    for (const c of packRow([{ centre: 5, width: 30 }], 0, 100, 8)) {
      expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('clamps a single over-left label into the interval', () => {
    expect(packRow([{ centre: 5, width: 30 }], 0, 100, 8)).toEqual([15]);
  });
});
