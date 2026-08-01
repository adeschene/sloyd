import { bandOn, fitView, DRAW_WIDTH, MAX_ASPECT, MAX_HEIGHT, MIN_FEATURE, MIN_WIDTH } from './diagramScale';

describe('fitView', () => {
  it('scales uniformly when the aspect ratio is comfortable', () => {
    const fit = fitView(24, 5.5);
    expect(fit.sx).toBeCloseTo(fit.sy, 10);
    expect(fit.drawnH).toBe(DRAW_WIDTH);
    expect(fit.offsetX).toBe(0);
  });

  it('clamps a sliver so there is something to draw into', () => {
    // 96" x 3-1/2" is 27:1 — at true scale the board is a hairline.
    const fit = fitView(96, 3.5);
    expect(fit.drawnV).toBe(DRAW_WIDTH / MAX_ASPECT);
    expect(fit.sy).toBeGreaterThan(fit.sx);
    expect(fit.drawnH).toBe(DRAW_WIDTH);
  });

  it('shrinks a tall board uniformly rather than squashing it', () => {
    const fit = fitView(24, 24);
    expect(fit.drawnV).toBe(MAX_HEIGHT);
    expect(fit.sx).toBeCloseTo(fit.sy, 10);
    expect(fit.drawnH).toBeCloseTo(MAX_HEIGHT, 10);
  });

  it('centres a shrunken drawing in the nominal width', () => {
    const fit = fitView(24, 24);
    expect(fit.offsetX).toBeCloseTo((DRAW_WIDTH - fit.drawnH) / 2, 10);
  });

  it('cannot trip both clamps, whatever the input', () => {
    // An invariant of the CONSTANTS, not of the inputs. If you change either
    // constant, re-read the ladder before changing this expectation.
    expect(DRAW_WIDTH / MAX_ASPECT).toBeLessThan(MAX_HEIGHT);
  });

  it('floors a tall, narrow board so the shrink branch cannot squeeze it to a hairline', () => {
    // 0.75" x 24" — a full-length groove in a board's edge (face: 'width',
    // across: 'length' gives along: 'thickness'). Without a floor this comes
    // out at drawnH ~= 13.12, a MIN_FEATURE band nearly half the board's width.
    const fit = fitView(0.75, 24);
    expect(fit.drawnH).toBe(MIN_WIDTH);
    expect(fit.drawnV).toBe(MAX_HEIGHT);
    expect(fit.sx).not.toBeCloseTo(fit.sy, 5);
  });

  it('still centres the drawing once drawnH is floored', () => {
    const fit = fitView(0.75, 24);
    expect(fit.offsetX).toBeCloseTo((DRAW_WIDTH - fit.drawnH) / 2, 10);
  });

  it('never returns a non-finite scale for a degenerate board', () => {
    for (const fit of [fitView(0, 5), fitView(5, 0), fitView(-1, 5)]) {
      expect(Number.isFinite(fit.sx)).toBe(true);
      expect(Number.isFinite(fit.sy)).toBe(true);
    }
  });
});

// These exercise bandOn through a real DiagramFit on the horizontal axis —
// the same widening/ordering/clamping coverage the now-deleted `band()`
// wrapper carried, re-expressed against the function it always delegated to.
describe('bandOn, applied to a horizontal-axis fit', () => {
  it('places a comfortable band at true scale', () => {
    const fit = fitView(24, 5.5);
    const b = bandOn([6, 6.75], fit.sx, fit.offsetX, fit.drawnH);
    expect(b.start).toBeCloseTo(6 * fit.sx, 10);
    expect(b.size).toBeCloseTo(0.75 * fit.sx, 10);
  });

  it('widens a hairline band to the minimum', () => {
    const fit = fitView(96, 3.5);          // sx ~= 10.4 units per inch
    const b = bandOn([84, 84.125], fit.sx, fit.offsetX, fit.drawnH);     // 1/8" -> ~1.3 units, too thin
    expect(b.size).toBe(MIN_FEATURE);
  });

  it('widens about the centre, so position stays honest', () => {
    const fit = fitView(96, 3.5);
    const centre = (84 * fit.sx + 84.125 * fit.sx) / 2 + fit.offsetX;
    const b = bandOn([84, 84.125], fit.sx, fit.offsetX, fit.drawnH);
    expect(b.start + b.size / 2).toBeCloseTo(centre, 10);
  });

  it('respects the horizontal offset of a centred drawing', () => {
    const fit = fitView(24, 24);
    expect(bandOn([0, 24], fit.sx, fit.offsetX, fit.drawnH).start).toBeCloseTo(fit.offsetX, 10);
  });

  it('keeps a widened band inside the outline at the min edge', () => {
    // Follow-up 59's third instance: a cut at offset 0 narrower than
    // MIN_FEATURE used to get x = centre - 3, i.e. LEFT of the board's own
    // edge, and `overflow: visible` drew it there rather than clipping it.
    const fit = fitView(24, 5.5);
    const b = bandOn([0, 0.125], fit.sx, fit.offsetX, fit.drawnH);
    expect(b.start).toBeGreaterThanOrEqual(fit.offsetX);
    expect(b.size).toBe(MIN_FEATURE);
  });

  it('keeps a widened band inside the outline at the max edge', () => {
    const fit = fitView(24, 5.5);
    const b = bandOn([23.875, 24], fit.sx, fit.offsetX, fit.drawnH);
    expect(b.start + b.size).toBeLessThanOrEqual(fit.offsetX + fit.drawnH);
    expect(b.size).toBe(MIN_FEATURE);
  });

  it('respects the offset of a centred drawing when it clamps', () => {
    const fit = fitView(0.75, 24);            // the MIN_WIDTH branch: offsetX > 0
    const b = bandOn([0, 0.01], fit.sx, fit.offsetX, fit.drawnH);
    expect(b.start).toBeGreaterThanOrEqual(fit.offsetX);
  });

  it('normalises an out-of-order span instead of drawing it in the wrong place', () => {
    // Follow-up 62, closed. A [max, min] span gives a NEGATIVE width, which
    // fails the MIN_FEATURE test and falls into the widening branch — so it
    // used to draw a plausible-looking narrow band centred between the two
    // values, with no error anywhere. cutRegion never emits one, but bandOn is
    // a small exported pure function a future caller can reach without reading
    // cutRegion's contract first.
    const fit = fitView(24, 5.5);
    expect(bandOn([6.75, 6], fit.sx, fit.offsetX, fit.drawnH))
      .toEqual(bandOn([6, 6.75], fit.sx, fit.offsetX, fit.drawnH));
  });
});

describe('bandOn', () => {
  it('places a comfortable band at true scale on either axis', () => {
    expect(bandOn([6, 6.75], 40, 0, 1000)).toEqual({ start: 240, size: 30 });
    expect(bandOn([6, 6.75], 40, 100, 1000)).toEqual({ start: 340, size: 30 });
  });

  it('widens a hairline band about its centre', () => {
    const b = bandOn([6, 6.05], 40, 0, 1000);
    expect(b.size).toBe(MIN_FEATURE);
    expect(b.start + b.size / 2).toBeCloseTo(6.025 * 40, 10);
  });

  it('clamps a widened band inside the extent at both ends', () => {
    expect(bandOn([0, 0.01], 40, 0, 1000).start).toBe(0);
    const far = bandOn([24, 24], 40, 0, 960);
    expect(far.start + far.size).toBeLessThanOrEqual(960);
  });

  it('normalises an out-of-order span', () => {
    expect(bandOn([6.75, 6], 40, 0, 1000)).toEqual(bandOn([6, 6.75], 40, 0, 1000));
  });
});
