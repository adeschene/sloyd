import { createBoard } from './document';
import { keptBySection, sectionAxisIndex, sectionPlaneOf, sectionSpan, SECTION_EPS, type Section } from './section';

describe('section side test', () => {
  const front: Section = { axis: 'front', at: 3, flip: false };
  it('maps the axis to the world index of the standard view it is seen from', () => {
    expect(sectionAxisIndex('side')).toBe(0);
    expect(sectionAxisIndex('top')).toBe(1);
    expect(sectionAxisIndex('front')).toBe(2);
  });
  it('keeps the far side by default and the near side when flipped; on the plane is kept both ways', () => {
    expect(keptBySection(front, [0, 0, 2])).toBe(true);
    expect(keptBySection(front, [0, 0, 4])).toBe(false);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 2])).toBe(false);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 4])).toBe(true);
    expect(keptBySection(front, [0, 0, 3 + SECTION_EPS / 2])).toBe(true);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 3 - SECTION_EPS / 2])).toBe(true);
    expect(keptBySection(front, [0, 0, 3 + 1e-5])).toBe(false);
  });
  it('keeps everything with no section', () => {
    expect(keptBySection(null, [0, 0, 1e9])).toBe(true);
  });
  it('reads only its own axis', () => {
    const side: Section = { axis: 'side', at: 1, flip: false };
    expect(keptBySection(side, [0.5, 100, 100])).toBe(true);
    expect(keptBySection(side, [1.5, -100, -100])).toBe(false);
  });
});

describe('sectionPlaneOf', () => {
  const signed = (s: Section, p: number[]) => {
    const { normal, constant } = sectionPlaneOf(s);
    return normal[0] * p[0]! + normal[1] * p[1]! + normal[2] * p[2]! + constant;
  };
  it('agrees with keptBySection on both sides, for every axis and both flips', () => {
    for (const axis of ['front', 'side', 'top'] as const) {
      for (const flip of [false, true]) {
        const s: Section = { axis, at: 2.5, flip };
        const k = sectionAxisIndex(axis);
        for (const v of [1, 4]) {
          const p = [7, 7, 7]; p[k] = v;
          expect(signed(s, p) >= 0).toBe(keptBySection(s, p));
        }
      }
    }
  });
});

describe('sectionSpan', () => {
  // Flat at turn 0: X = length, Y = thickness, Z = width.
  const a = createBoard({ id: 'a', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0] });
  const b = createBoard({ id: 'b', length: 10, width: 4, thickness: 0.75, position: [5, 1.5, -3] });
  it('is the drawn extent of the parts along the axis', () => {
    expect(sectionSpan([a, b], null, 'front')).toEqual([-3, 6]);
    expect(sectionSpan([a, b], null, 'top')).toEqual([0, 2.25]);
    expect(sectionSpan([a, b], null, 'side')).toEqual([0, 20]);
  });
  it('adds explode offsets (the parts where they are drawn)', () => {
    expect(sectionSpan([a, b], new Map([['b', [0, 10, 0]]]), 'top')).toEqual([0, 12.25]);
  });
  it('is null with no parts', () => {
    expect(sectionSpan([], null, 'front')).toBeNull();
  });
});
