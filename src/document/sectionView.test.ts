import { createBoard } from './document';
import { IMPERIAL, type Units } from '../units/length';
import { drawView, FRONT, SIDE, TOP, type View } from './drawing';
import type { Section } from './section';
import { cuttingLine, hatchPatterns, markedView, sectionTitle, sectionViewOf } from './sectionView';

const METRIC: Units = { display: 'metric-mm', precision: 16 } as Units;
const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const close = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 12));
const box = (id: string, length: number, width: number, thickness: number, position: [number, number, number] = [0, 0, 0]) =>
  createBoard({ id, name: id, length, width, thickness, position });

describe('sectionViewOf', () => {
  it('is the standard view unflipped', () => {
    expect(sectionViewOf({ axis: 'front', at: 0, flip: false })).toBe(FRONT);
    expect(sectionViewOf({ axis: 'side', at: 0, flip: false })).toBe(SIDE);
    expect(sectionViewOf({ axis: 'top', at: 0, flip: false })).toBe(TOP);
  });
  it.each([
    ['front', 'Back', [0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ['side', 'Left side', [-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    ['top', 'Underside', [0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ] as const)('flipped %s is the proper opposite view %s', (axis, title, toward, right, up) => {
    const v: View = sectionViewOf({ axis, at: 0, flip: true });
    expect(v.title).toBe(title);
    close(v.toward, toward); close(v.right, right); close(v.up, up);
    close(cross([...v.right], [...v.up]), [...v.toward]);
  });
  it('every standard view is proper too (the table agrees with drawing.ts)', () => {
    for (const v of [FRONT, SIDE, TOP]) close(cross([...v.right], [...v.up]), [...v.toward]);
  });
});

describe('markedView', () => {
  it('marks the Plan for a Front or Side cut and the Front for a Top cut', () => {
    expect(markedView({ axis: 'front', at: 0, flip: false })).toBe('top');
    expect(markedView({ axis: 'side', at: 0, flip: true })).toBe('top');
    expect(markedView({ axis: 'top', at: 0, flip: false })).toBe('front');
  });
});

describe('sectionTitle', () => {
  // Flat 30 x 11.25 x 0.75 at (2, 1, 3): X 2..32, Y 1..1.75, Z 3..14.25.
  const parts = [box('b', 30, 11.25, 0.75, [2, 1, 3])];
  it.each([
    [{ axis: 'front', at: 10.5, flip: false }, 'Section A–A — Front cut 7-1/2" from the back, looking toward the back'],
    [{ axis: 'front', at: 10.5, flip: true }, 'Section A–A — Front cut 7-1/2" from the back, looking toward the front'],
    [{ axis: 'side', at: 17, flip: false }, 'Section A–A — Side cut 15" from the left, looking toward the left'],
    [{ axis: 'side', at: 17, flip: true }, 'Section A–A — Side cut 15" from the left, looking toward the right'],
    [{ axis: 'top', at: 1.5, flip: false }, 'Section A–A — Plan cut 1/2" from the bottom, looking down'],
    [{ axis: 'top', at: 1.5, flip: true }, 'Section A–A — Plan cut 1/2" from the bottom, looking up'],
  ] as [Section, string][])('%o', (s, title) => {
    expect(sectionTitle(s, parts, IMPERIAL)).toBe(title);
  });
  it('reads whole mm in a metric project', () => {
    expect(sectionTitle({ axis: 'front', at: 10.5, flip: false }, parts, METRIC))
      .toBe('Section A–A — Front cut 191 mm from the back, looking toward the back');
  });
});

describe('cuttingLine', () => {
  const parts = [box('b', 30, 11.25, 0.75)];
  it('a Front cut is a horizontal line across the Plan at -at, sight toward the back (up the page)', () => {
    const d = drawView(parts, TOP);
    const line = cuttingLine({ axis: 'front', at: 5, flip: false }, TOP, d)!;
    expect(line.a).toEqual([0, -5]);
    expect(line.b).toEqual([30, -5]);
    close(line.sight, [0, 1]);
    close(cuttingLine({ axis: 'front', at: 5, flip: true }, TOP, d)!.sight, [0, -1]);
  });
  it('a Side cut is a vertical line across the Plan, sight toward the left', () => {
    const d = drawView(parts, TOP);
    const line = cuttingLine({ axis: 'side', at: 12, flip: false }, TOP, d)!;
    expect(line.a).toEqual([12, -11.25]);
    expect(line.b).toEqual([12, 0]);
    close(line.sight, [-1, 0]);
  });
  it('a Top cut is a horizontal line across the Front, sight down', () => {
    const d = drawView(parts, FRONT);
    const line = cuttingLine({ axis: 'top', at: 0.5, flip: false }, FRONT, d)!;
    expect(line.a).toEqual([0, 0.5]);
    expect(line.b).toEqual([30, 0.5]);
    close(line.sight, [0, -1]);
  });
  it('is null for a view that looks across the plane', () => {
    expect(cuttingLine({ axis: 'front', at: 5, flip: false }, FRONT, drawView(parts, FRONT))).toBeNull();
  });
});

describe('hatchPatterns', () => {
  const caps = (boxes: ReturnType<typeof box>[]) =>
    drawView(boxes, FRONT, undefined, { section: { axis: 'front', at: 1, flip: false } }).caps!;
  it('touching caps differ; a third touching both takes the third pattern; apart caps may repeat', () => {
    // Front cut through flat boards (thickness on Y): A X 0..2, B X 2..4 side by side; C across both on top; D apart.
    const A = box('A', 2, 4, 1);
    const B = box('B', 2, 4, 1, [2, 0, 0]);
    const C = box('C', 4, 4, 1, [0, 1, 0]);
    const D = box('D', 2, 4, 1, [20, 0, 0]);
    const h = hatchPatterns(caps([A, B, C, D]));
    expect(h.get('A')).toBe(0);
    expect(h.get('B')).toBe(1);
    expect(h.get('C')).toBe(2);
    expect(h.get('D')).toBe(0);
  });
});
