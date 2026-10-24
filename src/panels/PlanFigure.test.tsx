import { IMPERIAL } from '../units/length';
import { render, screen } from '@testing-library/react';
import { createBoard, createDocument, defaultShelfPinRow } from '../document/document';
import type { HoleRow } from '../document/types';
import { chooseFace, slopeOf } from '../document/lean';
import { PlanTrio, ExplodedFigure, pathOf, SectionBlock, trioScale } from './PlanFigure';

// 2in shelves: the trio's scale is 752 / (30 + 12) ≈ 17.9 per inch (Task 7), so a 2in spacing is
// ≈ 35.8 drawn, room for a 2-char label (24.8 + 8 = 32.8). 1in spacings (17.9) would be dropped.
const slab = (y: number) => createBoard({ length: 30, width: 12, thickness: 2, position: [0, y, 0] });
const mortised = createBoard({
  length: 20, width: 4, thickness: 2,
  cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 8, width: 1, depth: 1, stopMin: 1, stopMax: 1 }],
});

describe('PlanTrio', () => {
  it('draws three views with overall and chain dimensions', () => {
    const { container } = render(<PlanTrio parts={[slab(0), slab(10), slab(20)]} units={IMPERIAL} label="Shelf unit" />);
    expect(screen.getByRole('img', { name: 'Shelf unit: front, side and plan' })).toBeInTheDocument();
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    // Coordinates 0,2,10,12,20,22: chain 2, 8, 2, 8, 2; overall 22.
    expect(labels).toContain('22"');   // overall height, front and side
    expect(labels).toContain('30"');   // overall width
    expect(labels).toContain('8"');    // chain
    expect(labels).toContain('2"');    // chain
    expect(container.querySelector('svg')!.getAttribute('font-size')).toBe('20');
  });

  it('draws hidden lines dashed in the elevations', () => {
    const { container } = render(<PlanTrio parts={[mortised]} units={IMPERIAL} label="Leg" />);
    expect(container.querySelector('path.plan-hidden')!.getAttribute('d')).toMatch(/M/);
  });

  it('a hidden 96-chord rim is ONE subpath, so it draws dashed (ruling R2)', () => {
    // Plan (drawn first) of a blind pin hole: the bottom rim's 96 chords are all hidden. One more `M` than the plain part.
    const pin: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 2 };
    const part = (holes: HoleRow[]) => createBoard({ length: 30, width: 11.25, thickness: 0.75, holes });
    const moves = (holes: HoleRow[]) => {
      const { container, unmount } = render(<PlanTrio parts={[part(holes)]} units={IMPERIAL} label="Side" />);
      const plan = container.querySelector('path.plan-hidden')!.getAttribute('d')!;
      unmount();
      return { m: (plan.match(/M/g) ?? []).length, l: (plan.match(/L/g) ?? []).length };
    };
    const plain = moves([]);
    const holed = moves([pin]);
    expect(holed.l - plain.l).toBe(96);
    expect(holed.m - plain.m).toBe(1);
  });

  it('chains segments only within one part: edges of two parts meeting end to end are separate subpaths', () => {
    const map = (p: readonly [number, number]): [number, number] => [p[0], p[1]];
    const seg = (part: string, a: [number, number], b: [number, number]) => ({ a, b, part });
    const moves = (d: string) => (d.match(/M/g) ?? []).length;
    // Two parts' edges meet at (1, 0): not one dashed run.
    expect(moves(pathOf([seg('A', [0, 0], [1, 0]), seg('B', [1, 0], [2, 0])], map))).toBe(2);
    // One part's chords still chain into one subpath.
    expect(moves(pathOf([seg('A', [0, 0], [1, 0]), seg('A', [1, 0], [2, 0]), seg('A', [2, 0], [3, 0])], map))).toBe(1);
  });

  it('lists a note when a chain is omitted', () => {
    // Thirteen 3in boards stacked: 13 chain segments > CHAIN_MAX, and every one must FIT or it is
    // dropped rather than counted. Trio scale = 752 / (front width 30 + side width 12) = 17.9; a
    // 3in segment is 3·17.9 = 53.7 wide; its label is 2 chars → 12.4·2 + 8 = 32.8 ≤ 53.7: all 13 survive.
    const parts = Array.from({ length: 13 }, (_, k) => createBoard({ length: 30, width: 12, thickness: 3, position: [0, 3 * k, 0] }));
    render(<PlanTrio parts={parts} units={IMPERIAL} label="Stack" />);
    expect(screen.getAllByText(/Height chain omitted — too dense/).length).toBeGreaterThan(0);
  });
});

describe('figure width on the page (fu 254)', () => {
  it('draws a height-capped trio at its share of the page width, not stretched to 100%', () => {
    // Bookcase 36w × 12d × 72h as three boards spanning it: the trio is 248 + 48·1002/84 ≈ 820.6 wide of
    // PLAN_WIDTH 1000 (planLayout.test.ts) → 82.06% of the page. Stretched to 100% it would be ~1523 tall again.
    const parts = [
      createBoard({ length: 36, width: 12, thickness: 0.75, position: [0, 0, 0] }),
      createBoard({ length: 36, width: 12, thickness: 0.75, position: [0, 71.25, 0] }),
      createBoard({ length: 72, width: 12, thickness: 0.75, posture: 'upright', rotation: 90, position: [0, 0, 0] }),
    ];
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="Bookcase" />);
    const width = parseFloat((container.querySelector('svg') as SVGSVGElement).style.width);
    expect(width).toBeCloseTo(((248 + (48 * 1002) / 84) / 1000) * 100, 6);
  });
  it('draws a full-width trio at 100%', () => {
    const { container } = render(<PlanTrio parts={[slab(0)]} units={IMPERIAL} label="Slab" />);
    expect((container.querySelector('svg') as SVGSVGElement).style.width).toBe('100%');
  });
});

describe('ExplodedFigure', () => {
  it('draws visible lines only', () => {
    const doc = { ...createDocument('X'), boards: [mortised] };
    const { container } = render(<ExplodedFigure doc={doc} amount={0.6} />);
    expect(container.querySelector('path.plan-visible')!.getAttribute('d')).toMatch(/M/);
    expect(container.querySelector('path.plan-hidden')).toBeNull();
    expect(screen.getByRole('img', { name: 'Exploded view' })).toHaveAttribute('data-amount', '0.6');
  });
});

describe('PlanTrio in metric (chunk 2)', () => {
  const MM = { display: 'metric-mm' as const, precision: 16 };
  const texts = (c: HTMLElement) => [...c.querySelectorAll('text')].map((t) => t.textContent!);

  it('draws bare mm dimensions, no inch mark', () => {
    const { container } = render(<PlanTrio parts={[slab(0), slab(10), slab(20)]} units={MM} label="Shelf unit" />);
    const labels = texts(container);
    expect(labels).toContain('559');   // 22in overall height
    expect(labels).toContain('762');   // 30in overall width
    expect(labels.some((t) => /^\d+$/.test(t))).toBe(true);
    expect(labels.join(' ')).not.toContain('"');
  });

  it('re-labels when only the units change (inv 15)', () => {
    const parts = [slab(0), slab(10), slab(20)];
    const { container, rerender } = render(<PlanTrio parts={parts} units={IMPERIAL} label="Shelf unit" />);
    expect(texts(container)).toContain('30"');
    rerender(<PlanTrio parts={parts} units={MM} label="Shelf unit" />);
    expect(texts(container)).toContain('762');
    expect(texts(container).join(' ')).not.toContain('"');
  });
});

describe('PlanTrio: feature keys (feature callouts spec §4.5)', () => {
  // Two case sides on edge (posture so the pin rows face each other is NOT needed: rows in each side's thickness face).
  const sideAt = (id: string, x: number) => {
    const b = createBoard({ id, name: id, length: 30, width: 11.25, thickness: 0.75, position: [x, 0, 0] });
    return { ...b, holes: [{ id: 'r', ...defaultShelfPinRow(b)! }] };
  };
  const parts = [sideAt('L', 0), sideAt('R', 40)];
  it('without keyed, nothing changes: no tags, no key list', () => {
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="Sides" />);
    expect(container.querySelector('.plans-key-mark')).toBeNull();
    expect(container.querySelector('.plans-key')).toBeNull();
  });
  it('keyed: one letter for the two identical rows, counted (2×), a tag per side', () => {
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="Sides" keyed={new Set(['L', 'R'])} />);
    const items = [...container.querySelectorAll('.plans-key li')].map((li) => li.textContent);
    expect(items).toEqual(['A Row of 21 holes, 1/4" dia × 3/8" deep, every 1-17/64" (32 mm) (2×)']);
    const letters = [...container.querySelectorAll('.plans-key-mark text')].map((t) => t.textContent);
    expect(letters).toEqual(['A', 'A']);
  });
  it('a part not keyed here draws no tag', () => {
    const { container } = render(<PlanTrio parts={parts} units={IMPERIAL} label="Sides" keyed={new Set(['L'])} />);
    expect(container.querySelectorAll('.plans-key-mark')).toHaveLength(1);
    expect(container.querySelector('.plans-key li')!.textContent).not.toMatch(/×\)$/);
  });
});

describe('PlanTrio: the lean note (splayed legs spec §6.2)', () => {
  const base = createBoard({ id: 'L', name: 'Leg', length: 16, width: 1.5, thickness: 1.25, posture: 'upright' });
  const leg = { ...base, lean: { x: slopeOf(12), z: slopeOf(8), face: chooseFace(base, slopeOf(12), slopeOf(8)) } };
  const NOTE = 'Leg: rake 8.0° toward the front, splay 12.0° toward the right — resultant 14.3° on a 33.5° sightline';
  const notes = (c: HTMLElement) => [...c.querySelectorAll('.plans-notes li')].map((li) => li.textContent);
  it('a keyed leaning part: its note, as HTML under the figure, never an SVG label (inv 19)', () => {
    const { container } = render(<PlanTrio parts={[leg]} units={IMPERIAL} label="Stool" keyed={new Set(['L'])} />);
    expect(notes(container)).toContain(NOTE);
    expect([...container.querySelectorAll('svg text')].some((t) => t.textContent?.includes('rake'))).toBe(false);
  });
  it('not keyed here: no note (the trio that keys the part notes it)', () => {
    const { container } = render(<PlanTrio parts={[leg]} units={IMPERIAL} label="Stool" keyed={new Set()} />);
    expect(notes(container)).not.toContain(NOTE);
  });
});

describe('section views (fu 256)', () => {
  const shelf = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75 });
  const metric = { display: 'metric-mm', precision: 16 } as typeof IMPERIAL;

  it('PlanTrio marks the cut on the Plan for a Front cut and on the Front for a Top cut, once', () => {
    const front = render(<PlanTrio parts={[shelf]} units={IMPERIAL} label="P" section={{ axis: 'front', at: 5, flip: false }} />);
    const marks = front.container.querySelectorAll('.plans-cut-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute('data-view', 'Plan');
    expect([...marks[0]!.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['A', 'A']);
    front.unmount();
    const top = render(<PlanTrio parts={[shelf]} units={IMPERIAL} label="P" section={{ axis: 'top', at: 0.5, flip: false }} />);
    expect(top.container.querySelector('.plans-cut-mark')).toHaveAttribute('data-view', 'Front');
  });

  it('PlanTrio without a section draws no marker', () => {
    const { container } = render(<PlanTrio parts={[shelf]} units={IMPERIAL} label="P" />);
    expect(container.querySelector('.plans-cut-mark')).toBeNull();
  });

  it('SectionBlock: titled, hatched caps, visible lines only, no dimensions', () => {
    const parts = [shelf];
    const { container } = render(<SectionBlock parts={parts} section={{ axis: 'front', at: 5, flip: false }}
      units={IMPERIAL} scale={trioScale(parts)} exploded={false} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Section A–A — Front cut 5" from the back, looking toward the back');
    const fig = screen.getByRole('img', { name: 'Section A–A — Front cut 5" from the back, looking toward the back' });
    expect(fig.querySelectorAll('path.plans-cap')).toHaveLength(1);
    expect(fig.querySelector('path.plans-cap')).toHaveAttribute('data-hatch', '0');
    expect(fig.querySelectorAll('path.plans-cap-outline')).toHaveLength(1);
    expect(fig.querySelector('path.plan-hidden')).toBeNull();
    expect(fig.querySelector('.plan-dim')).toBeNull();
    expect(container.querySelectorAll('pattern')).toHaveLength(4);
    expect(screen.queryByText("Cut through the assembled piece at the viewport's position.")).toBeNull();
  });

  it('SectionBlock: the explode note, and one line when the cut meets no wood', () => {
    const parts = [shelf];
    const a = render(<SectionBlock parts={parts} section={{ axis: 'front', at: 5, flip: false }} units={IMPERIAL} scale={10} exploded />);
    expect(screen.getByText("Cut through the assembled piece at the viewport's position.")).toBeInTheDocument();
    a.unmount();
    render(<SectionBlock parts={parts} section={{ axis: 'front', at: 50, flip: false }} units={IMPERIAL} scale={10} exploded={false} />);
    expect(screen.getByText('Section A–A: the cut meets no part of the assembled piece.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('SectionBlock reads whole mm in a metric project', () => {
    render(<SectionBlock parts={[shelf]} section={{ axis: 'front', at: 5, flip: false }} units={metric} scale={10} exploded={false} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Front cut 127 mm from the back');
  });

  it('the section is drawn at the trio scale', () => {
    const parts = [shelf];
    const scale = trioScale(parts);
    render(<SectionBlock parts={parts} section={{ axis: 'front', at: 5, flip: false }} units={IMPERIAL} scale={scale} exploded={false} />);
    // 30" wide plus a 16-unit margin each side.
    expect(screen.getByRole('img').getAttribute('viewBox')).toBe(`0 0 ${30 * scale + 32} ${0.75 * scale + 32}`);
  });
});
