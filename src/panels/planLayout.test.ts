import { layoutTrio, layoutSingle, PLAN_WIDTH, DIM_BAND, VIEW_GAP, MAX_PLAN_SCALE } from './planLayout';

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
  it('caps the scale for a small piece', () => {
    expect(layoutTrio(rect(1, 1), rect(1, 1), rect(1, 1)).scale).toBe(MAX_PLAN_SCALE);
  });
  it('does not divide by zero', () => {
    const l = layoutTrio(rect(0, 0), rect(0, 0), rect(0, 0));
    expect(Number.isFinite(l.width) && Number.isFinite(l.height)).toBe(true);
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
