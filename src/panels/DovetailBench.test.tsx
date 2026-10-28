import { render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Dovetail, SloydDocument } from '../document/types';
import { dovetailBenches } from '../document/dovetailBench';
import { IMPERIAL, type Units } from '../units/length';
import { DovetailBench } from './DovetailBench';
import { CutList } from './CutList';
import { VIEW_W } from './PartDiagram';
import { labelWidth, LABEL_ASCENT, LABEL_BOX_H, LABEL_DESCENT, LABEL_SIZE } from './diagramLabels';

/**
 * Dovetails Task 7 (spec §5.2): the bench drawings render, side by side, with no label overlapping another — the same
 * attribute arithmetic as `PartDiagram.test.tsx`'s sweep (copied here, never imported from a test module). As there, this
 * proves the LAYOUT logic, not the font metrics: the browser check is the arbiter of those (Task 10).
 */

interface Box { text: string; left: number; right: number; top: number; bottom: number }

const boxes = (svg: SVGSVGElement): Box[] =>
  [...svg.querySelectorAll('text')].map((t) => {
    const text = t.textContent ?? '';
    const w = labelWidth(text);
    const x = Number(t.getAttribute('x'));
    const y = Number(t.getAttribute('y'));
    // `x` is the CENTRE under text-anchor: middle and the LEFT EDGE otherwise.
    const left = t.getAttribute('text-anchor') === 'middle' ? x - w / 2 : x;
    const mid = t.getAttribute('dominant-baseline') === 'middle';
    return {
      text, left, right: left + w,
      top: mid ? y - LABEL_BOX_H / 2 : y - LABEL_ASCENT,
      bottom: mid ? y + LABEL_BOX_H / 2 : y + LABEL_DESCENT,
    };
  });

const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const check = (svg: SVGSVGElement) => {
  const [, , vbW, vbH] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
  const bs = boxes(svg);
  expect(bs.length).toBeGreaterThan(0);
  for (let i = 0; i < bs.length; i += 1) {
    for (let j = i + 1; j < bs.length; j += 1) {
      expect(overlaps(bs[i]!, bs[j]!), `"${bs[i]!.text}" overlaps "${bs[j]!.text}"`).toBe(false);
    }
    expect(bs[i]!.left, `"${bs[i]!.text}" reaches left of the viewBox`).toBeGreaterThanOrEqual(0);
    expect(bs[i]!.right, `"${bs[i]!.text}" reaches right of the viewBox`).toBeLessThanOrEqual(vbW!);
    expect(bs[i]!.top, `"${bs[i]!.text}" reaches above the viewBox`).toBeGreaterThanOrEqual(0);
    expect(bs[i]!.bottom, `"${bs[i]!.text}" reaches below the viewBox`).toBeLessThanOrEqual(vbH!);
  }
};

const tails = (over: Partial<Dovetail> = {}): Dovetail =>
  ({ id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75, ...over });
const benchOf = (width: number, d: Partial<Dovetail> = {}, units: Units = IMPERIAL, both = false) => {
  const list = both ? [tails({ id: 'a', end: 'min', ...d }), tails(d)] : [tails(d)];
  return dovetailBenches(createBoard({ name: 'Side', length: 18, width, thickness: 0.5, dovetails: list }), units)[0]!;
};
const svgs = (c: HTMLElement) => [...c.querySelectorAll('svg')] as SVGSVGElement[];

describe('DovetailBench (spec §5.2)', () => {
  it('side by side at PartDiagram\'s label size: each figure\'s CSS share of the row over its viewBox width is PartDiagram\'s', () => {
    // A PartDiagram spans the row with a viewBox VIEW_W wide: a 20-unit label renders at rowWidth * 20 / VIEW_W. A figure
    // `share` of the row wide with a viewBox `w` wide renders it at rowWidth * share * 20 / w: equal when share / w = 1 / VIEW_W.
    const { container } = render(<DovetailBench bench={benchOf(6)} />);
    const figs = [...container.querySelectorAll<HTMLElement>('.cutlist-bench-figure')];
    expect(figs).toHaveLength(2);
    let total = 0;
    for (const f of figs) {
      const share = parseFloat(f.style.width) / 100;
      const w = Number(f.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]);
      expect((share * VIEW_W) / w).toBeCloseTo(1, 12);
      // The label size's one home is the <svg> attribute (inv 19).
      expect(f.querySelector('svg')!.getAttribute('font-size')).toBe(String(LABEL_SIZE));
      total += share;
    }
    // Both fit on the row (side by side, the user's ruling), with room for a gap.
    expect(total).toBeLessThan(1);
  });

  it('A carries 5 pin sockets and the dashed baseline; B 4 tail sockets and none', () => {
    const { container } = render(<DovetailBench bench={benchOf(6)} />);
    const [a, b] = svgs(container);
    expect(a!.querySelectorAll('.cutlist-bench-waste')).toHaveLength(5);
    expect(a!.querySelectorAll('.cutlist-bench-baseline')).toHaveLength(1);
    expect(b!.querySelectorAll('.cutlist-bench-waste')).toHaveLength(4);
    expect(b!.querySelectorAll('.cutlist-bench-baseline')).toHaveLength(0);
  });

  const CHAIN6 = ['1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"'];
  const texts = (s: SVGSVGElement) => [...s.querySelectorAll('text')].map((t) => t.textContent);

  it('the 6"/4/1:8 mockup corner draws the FULL chain (two tiers), in chain order; B has no overall H', () => {
    const { container } = render(<DovetailBench bench={benchOf(6, {}, IMPERIAL, true)} />);
    expect(container.querySelector('.cutlist-bench')!.getAttribute('data-mode')).toBe('full');
    const [a, b] = svgs(container);
    expect(texts(a!)).toEqual([...CHAIN6, 'baseline 3/4"', '6"', '1:8', 'both ends']);
    expect(texts(b!)).toEqual(['outside face', ...CHAIN6, 'inside face']);
    const ys = [...a!.querySelectorAll('text')].slice(0, 9).map((t) => t.getAttribute('y'));
    expect(new Set(ys).size).toBe(2);
  });

  it('single-value mode (18", 12 tails): each value once at its first span, and the overall H on BOTH figures', () => {
    const { container } = render(<DovetailBench bench={benchOf(18, { count: 12 })} />);
    expect(container.querySelector('.cutlist-bench')!.getAttribute('data-mode')).toBe('single');
    const [a, b] = svgs(container);
    const chainOf = (s: SVGSVGElement) => [...s.querySelectorAll('text[data-span]')].map((t) => [t.getAttribute('data-span'), t.textContent]);
    const once = [['0', '1/4"'], ['1', '1-1/4"'], ['2', '1/4"']];
    expect(chainOf(a!)).toEqual(once);
    expect(chainOf(b!)).toEqual(once);
    expect(texts(a!)).toContain('18"');
    expect(texts(b!)).toContain('18"');
    // Ticks at EVERY bound still: 2N + 2.
    expect(a!.querySelectorAll('.cutlist-bench-tick')).toHaveLength(26);
    expect(b!.querySelectorAll('.cutlist-bench-tick')).toHaveLength(26);
  });

  const cases: [string, number, Partial<Dovetail>, Units?][] = [
    ['the 6"/4/1:8 drawer side', 6, {}],
    ['9", 6 tails', 9, { count: 6 }],
    ['12", 8 tails', 12, { count: 8 }],
    ['18", 12 tails', 18, { count: 12 }],
    ['a wide carcass side (30", 20 tails)', 30, { count: 20 }],
    ['3", 2 tails', 3, { count: 2 }],
    ['a single tail on a narrow part (1-1/2")', 1.5, { count: 1, depth: 0.25 }],
    ['metric (150 mm, 4 tails, 6 mm pins)', 150 / 25.4, { pin: 6 / 25.4, depth: 19 / 25.4 }, { display: 'metric-mm', precision: 1 }],
  ];
  it.each(cases)('no label overlaps another or leaves its viewBox: %s', (_n, width, d, units) => {
    const { container } = render(<DovetailBench bench={benchOf(width, d, units ?? IMPERIAL, true)} />);
    for (const s of svgs(container)) check(s);
  });

  it.each(cases)('every chain label sits inside its own span\'s ticks (at most two tiers when full): %s', (_n, width, d, units) => {
    const { container } = render(<DovetailBench bench={benchOf(width, d, units ?? IMPERIAL, true)} />);
    const full = container.querySelector('.cutlist-bench')!.getAttribute('data-mode') === 'full';
    for (const s of svgs(container)) {
      const ticks = [...s.querySelectorAll('.cutlist-bench-tick')].map((t) => Number(t.getAttribute('x1')));
      const marks = [...s.querySelectorAll('text[data-span]')];
      expect(marks.length).toBe(full ? ticks.length - 1 : Math.min(3, ticks.length - 1));
      for (const m of marks) {
        const i = Number(m.getAttribute('data-span'));
        const x = Number(m.getAttribute('x'));
        expect(x, `"${m.textContent}" (span ${i}) off its span`).toBeGreaterThanOrEqual(ticks[i]! - 1e-9);
        expect(x, `"${m.textContent}" (span ${i}) off its span`).toBeLessThanOrEqual(ticks[i + 1]! + 1e-9);
      }
      if (full) expect(new Set(marks.map((m) => m.getAttribute('y'))).size).toBeLessThanOrEqual(2);
    }
  });
});

describe('DovetailBench: half-blind (half-blind spec §5.2)', () => {
  // Figure B of a half-blind bench: the lap band, the sockets from the lap plane, the chain along it, the `lap <x>` label.
  const hbCases: [string, number, Partial<Dovetail>, Units?][] = [
    ['the 6"/4/1:8 drawer side, a 1/4" lap', 6, { depth: 0.5, lap: 0.25 }],
    ['18", 12 tails (single-value mode)', 18, { count: 12, depth: 0.5, lap: 0.25 }],
    ['a single tail on a narrow part (1-1/2")', 1.5, { count: 1, depth: 0.25, lap: 0.125 }],
    ['a thin 1/16" lap', 6, { depth: 0.6875, lap: 0.0625 }],
    ['a deep lap (1/2" of a 3/4" front)', 6, { depth: 0.25, lap: 0.5 }],
    ['metric (150 mm, 6 mm pins, 12 mm deep, 6 mm lap)', 150 / 25.4, { pin: 6 / 25.4, depth: 12 / 25.4, lap: 6 / 25.4 }, { display: 'metric-mm', precision: 1 }],
  ];
  const texts = (s: SVGSVGElement) => [...s.querySelectorAll('text')].map((t) => t.textContent);

  it.each(hbCases)('no label overlaps another or leaves its viewBox: %s', (_n, width, d, units) => {
    const { container } = render(<DovetailBench bench={benchOf(width, d, units ?? IMPERIAL, true)} />);
    for (const s of svgs(container)) check(s);
  });

  it.each(hbCases)('every chain label sits inside its own span\'s ticks: %s', (_n, width, d, units) => {
    const { container } = render(<DovetailBench bench={benchOf(width, d, units ?? IMPERIAL, true)} />);
    const full = container.querySelector('.cutlist-bench')!.getAttribute('data-mode') === 'full';
    for (const s of svgs(container)) {
      const ticks = [...s.querySelectorAll('.cutlist-bench-tick')].map((t) => Number(t.getAttribute('x1')));
      const marks = [...s.querySelectorAll('text[data-span]')];
      expect(marks.length).toBe(full ? ticks.length - 1 : Math.min(3, ticks.length - 1));
      for (const m of marks) {
        const i = Number(m.getAttribute('data-span'));
        const x = Number(m.getAttribute('x'));
        expect(x).toBeGreaterThanOrEqual(ticks[i]! - 1e-9);
        expect(x).toBeLessThanOrEqual(ticks[i + 1]! + 1e-9);
      }
    }
  });

  it('figure B draws ONE lap band and labels it `lap 1/4"` on the outside face\'s row; figure A and a through B draw none', () => {
    const { container } = render(<DovetailBench bench={benchOf(6, { depth: 0.5, lap: 0.25 }, IMPERIAL, true)} />);
    const [a, b] = svgs(container);
    expect(a!.querySelectorAll('.cutlist-bench-lap')).toHaveLength(0);
    expect(b!.querySelectorAll('.cutlist-bench-lap')).toHaveLength(1);
    expect(texts(a!)).not.toContain('lap 1/4"');
    expect(texts(b!)[0]).toBe('outside face');
    expect(texts(b!)[1]).toBe('lap 1/4"');
    const row = (t: string) => [...b!.querySelectorAll('text')].find((x) => x.textContent === t)!.getAttribute('y');
    expect(row('lap 1/4"')).toBe(row('outside face'));
    // The ticks reach the lap plane: below the outline's top edge (the outside face).
    const top = Math.min(...b!.querySelector('.cutlist-diagram-outline')!.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1])));
    const lapY = Math.max(...b!.querySelector('.cutlist-bench-lap')!.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1])));
    expect(lapY).toBeGreaterThan(top);
    for (const t of b!.querySelectorAll('.cutlist-bench-tick')) expect(Number(t.getAttribute('y2'))).toBeCloseTo(lapY, 9);
    const { container: c2 } = render(<DovetailBench bench={benchOf(6)} />);
    for (const s of svgs(c2)) expect(s.querySelectorAll('.cutlist-bench-lap')).toHaveLength(0);
  });
});

describe('the cut list sheet shows the benches on the tail row only', () => {
  const load = (doc: SloydDocument) => useStore.getState().replaceDocument(doc);

  it('a dovetailed side gets its bench under its diagrams; a pin part gets none', () => {
    load({
      ...createDocument('D'),
      boards: [
        createBoard({ name: 'Side', length: 18, width: 6, thickness: 0.5, dovetails: [tails()] }),
        createBoard({ name: 'Front', length: 12, width: 6, thickness: 0.75,
          dovetails: [{ id: 'p', dim: 'length', end: 'max', role: 'pins', count: 4, slope: 8, pin: 0.25, depth: 0.5, outside: 'max' }] }),
      ],
    });
    const { container } = render(<CutList onClose={() => {}} />);
    expect(container.querySelectorAll('.cutlist-bench')).toHaveLength(1);
    const row = container.querySelector('.cutlist-bench')!.closest('.cutlist-row')!;
    expect(row.querySelector('.cutlist-names')!.textContent).toBe('Side');
    expect(screen.getAllByRole('img', { name: "Dovetails — the tail board's face" })).toHaveLength(1);
  });
});
