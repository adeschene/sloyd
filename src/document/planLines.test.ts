import { planLines } from './planLines';
import { FRONT, SIDE, TOP } from './drawing';
import type { AnyLine } from './types';

const xLine: AnyLine = { id: 'l1', at: [0, 2, 1], axis: 'x' };
const bounds = { min: [0, 0] as [number, number], max: [24, 30] as [number, number] };

describe('planLines', () => {
  it('clips an X line to the Front bounds', () => {
    expect(planLines([xLine], FRONT, bounds)).toEqual([{ a: [0, 2], b: [24, 2] }]);
  });

  it('skips a line seen end-on (an X line in Side)', () => {
    expect(planLines([xLine], SIDE, bounds)).toEqual([]);
  });

  it('projects with the Plan view\'s up = -Z, and drops a line outside the bounds', () => {
    expect(planLines([xLine], TOP, { min: [0, -5], max: [24, 5] })).toEqual([{ a: [0, -1], b: [24, -1] }]);
    expect(planLines([xLine], TOP, { min: [0, 0], max: [24, 5] })).toEqual([]);
  });

  it('clips an oblique line to the rectangle', () => {
    const ray: AnyLine = { id: 'r', at: [0, 0, 0], to: [1, 1, 0] };
    const out = planLines([ray], FRONT, { min: [0, 0], max: [10, 5] });
    expect(out).toHaveLength(1);
    expect(out[0]!.a[0]).toBeCloseTo(0); expect(out[0]!.a[1]).toBeCloseTo(0);
    expect(out[0]!.b[0]).toBeCloseTo(5); expect(out[0]!.b[1]).toBeCloseTo(5);
  });

  // Covers planLines' end-on branch with an axis-DIRECTION input. No stored oblique line can be edge-on in FRONT/SIDE/TOP
  // (their sight directions are axis directions, and an axis-parallel pair loads as an axis line), so this is the fixture
  // for the branch, not a reachable oblique case.
  it('skips a line parallel to the sight direction (the end-on branch, axis-direction input)', () => {
    const ray: AnyLine = { id: 'r', at: [0, 0, 0], to: [0, 0, 3] };
    expect(planLines([ray], FRONT, bounds)).toEqual([]);
  });
});
