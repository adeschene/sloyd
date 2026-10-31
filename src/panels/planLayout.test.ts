import { layoutTrio, layoutSingle, PLAN_WIDTH, DIM_BAND, DIM_ROW, VIEW_GAP, MAX_PLAN_SCALE, TRIO_MAX_HEIGHT } from './planLayout';

const rect = (w: number, h: number) => ({ min: [0, 0] as [number, number], max: [w, h] as [number, number] });

describe('layoutTrio', () => {
  it('fills the width at one shared scale and aligns the views third-angle', () => {
    // Front 30 wide × 20 high, side 12 × 20, plan 30 × 12. Room = 1000 − 4·56 − 24 = 752; 752 / 42.
    const l = layoutTrio(rect(30, 20), rect(12, 20), rect(30, 12));
    expect(l.scale).toBeCloseTo(752 / 42, 12);
    expect(l.width).toBeCloseTo(PLAN_WIDTH, 9);
    expect(l.top.x).toBe(l.front.x);          // plan directly above front
    expect(l.side.y).toBe(l.front.y);         // side level with front
    expect(l.front.y).toBeCloseTo(DIM_BAND + 12 * l.scale + DIM_BAND + VIEW_GAP + DIM_BAND, 9);
    expect(l.height).toBeCloseTo(l.front.y + 20 * l.scale + DIM_BAND, 9);
  });
  it('caps the height so a tall piece fits a printed page (fu 254)', () => {
    // A 36w × 12d × 72h bookcase: front 36 × 72, side 12 × 72, plan 36 × 12.
    // By width: 752 / (36 + 12) = 15.67/in → height 248 + 84·15.67 ≈ 1564 (the overflow fu 254 measured).
    // By height: (1250 − 4·56 − 24) / (12 + 72) = 1002 / 84 ≈ 11.93/in, the smaller, so it binds.
    expect(TRIO_MAX_HEIGHT).toBe(1250);
    const l = layoutTrio(rect(36, 72), rect(12, 72), rect(36, 12));
    expect(l.scale).toBeCloseTo(1002 / 84, 12);
    expect(l.height).toBeCloseTo(1250, 9);
    // Narrower than the page: 248 + 48 · 1002/84 ≈ 820.6.
    expect(l.width).toBeCloseTo(248 + (48 * 1002) / 84, 9);
    expect(l.top.x).toBe(l.front.x);
    expect(l.side.y).toBe(l.front.y);
  });
  it('caps the scale for a small piece', () => {
    expect(layoutTrio(rect(1, 1), rect(1, 1), rect(1, 1)).scale).toBe(MAX_PLAN_SCALE);
  });
  it('does not divide by zero', () => {
    const l = layoutTrio(rect(0, 0), rect(0, 0), rect(0, 0));
    expect(Number.isFinite(l.width) && Number.isFinite(l.height)).toBe(true);
  });
});

describe('layoutTrio with placed-dimension rows (placed-dimensions spec §6.2)', () => {
  it('zero extras are exactly the layout without them', () => {
    for (const args of [[rect(30, 20), rect(12, 20), rect(30, 12)], [rect(36, 72), rect(12, 72), rect(36, 12)]] as const) {
      expect(layoutTrio(...args, { frontBelow: 0, frontRight: 0, sideBelow: 0 })).toEqual(layoutTrio(...args));
    }
  });
  it('frontRight rows widen the gap between front and side, and enter the width\'s band sum', () => {
    expect(DIM_ROW).toBe(40);
    // Width-bound: (1000 − 4·56 − 24 − 2·40) / (30 + 12) = 672 / 42 = 16 exactly (height: (1250 − 248) / 32 ≈ 31).
    const l = layoutTrio(rect(30, 20), rect(12, 20), rect(30, 12), { frontBelow: 0, frontRight: 2, sideBelow: 0 });
    expect(l.scale).toBe(16);
    // 56 + 30·16 + 56 + 2·40 + 24 + 56: the side sits 2·DIM_ROW further right than the same scale would put it.
    expect(l.side.x).toBe(752);
    expect(l.width).toBe(752 + 12 * 16 + 56);
    expect(l.front).toEqual({ x: 56, y: 56 + 12 * 16 + 56 + 24 + 56 });
  });
  it('the larger of frontBelow and sideBelow adds rows under both, and enters the height\'s band sum', () => {
    // Height-bound: (1250 − 248 − 3·40) / (12 + 72) = 882 / 84 = 10.5 (width: 752 / 48 ≈ 15.7).
    const l = layoutTrio(rect(36, 72), rect(12, 72), rect(36, 12), { frontBelow: 1, frontRight: 0, sideBelow: 3 });
    expect(l.scale).toBe(10.5);
    expect(l.front.y).toBe(56 + 12 * 10.5 + 56 + 24 + 56);
    expect(l.height).toBe(1250);
    expect(l.height).toBe(l.front.y + 72 * 10.5 + 56 + 3 * 40);
    const swapped = layoutTrio(rect(36, 72), rect(12, 72), rect(36, 12), { frontBelow: 3, frontRight: 0, sideBelow: 1 });
    expect(swapped).toEqual(l);
  });
});

describe('layoutSingle', () => {
  it('fits the width or the height, whichever binds', () => {
    // Wide: (1000 − 32) / 100 = 9.68 < 640 / 10 = 64.
    expect(layoutSingle(rect(100, 10)).scale).toBeCloseTo(9.68, 12);
    // Tall: 640 / 200 = 3.2 < 968 / 10.
    expect(layoutSingle(rect(10, 200)).scale).toBeCloseTo(3.2, 12);
  });
});
