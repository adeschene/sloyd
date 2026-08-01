import { band, fitView, DRAW_WIDTH, MAX_ASPECT, MAX_HEIGHT, MIN_FEATURE, MIN_WIDTH } from './diagramScale';

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

describe('band', () => {
  it('places a comfortable band at true scale', () => {
    const fit = fitView(24, 5.5);
    const b = band([6, 6.75], fit);
    expect(b.x).toBeCloseTo(6 * fit.sx, 10);
    expect(b.width).toBeCloseTo(0.75 * fit.sx, 10);
  });

  it('widens a hairline band to the minimum', () => {
    const fit = fitView(96, 3.5);          // sx ~= 10.4 units per inch
    const b = band([84, 84.125], fit);     // 1/8" -> ~1.3 units, too thin
    expect(b.width).toBe(MIN_FEATURE);
  });

  it('widens about the centre, so position stays honest', () => {
    const fit = fitView(96, 3.5);
    const centre = (84 * fit.sx + 84.125 * fit.sx) / 2 + fit.offsetX;
    const b = band([84, 84.125], fit);
    expect(b.x + b.width / 2).toBeCloseTo(centre, 10);
  });

  it('respects the horizontal offset of a centred drawing', () => {
    const fit = fitView(24, 24);
    expect(band([0, 24], fit).x).toBeCloseTo(fit.offsetX, 10);
  });
});
