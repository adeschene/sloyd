import { render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Dovetail, SloydDocument } from '../document/types';
import { dovetailBenches } from '../document/dovetailBench';
import { IMPERIAL, type Units } from '../units/length';
import { DovetailBench } from './DovetailBench';
import { CutList } from './CutList';
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
  it('draws figure A and figure B side by side, at one viewBox width (one scale)', () => {
    const { container } = render(<DovetailBench bench={benchOf(6)} />);
    const [a, b] = svgs(container);
    expect(svgs(container)).toHaveLength(2);
    expect(container.querySelector('.cutlist-bench')!.children).toHaveLength(2);
    expect(a!.getAttribute('viewBox')!.split(' ')[2]).toBe(b!.getAttribute('viewBox')!.split(' ')[2]);
    // The label size's one home is the <svg> attribute (inv 19).
    for (const s of [a!, b!]) expect(s.getAttribute('font-size')).toBe(String(LABEL_SIZE));
    // A: 5 pin sockets, the dashed baseline; B: 4 tail sockets, no baseline.
    expect(a!.querySelectorAll('.cutlist-bench-waste')).toHaveLength(5);
    expect(a!.querySelectorAll('.cutlist-bench-baseline')).toHaveLength(1);
    expect(b!.querySelectorAll('.cutlist-bench-waste')).toHaveLength(4);
    expect(b!.querySelectorAll('.cutlist-bench-baseline')).toHaveLength(0);
  });

  it('every label is drawn: the chain, baseline, overall, slope and ends on A; the chain and both faces on B', () => {
    const { container } = render(<DovetailBench bench={benchOf(6, {}, IMPERIAL, true)} />);
    const [a, b] = svgs(container);
    const texts = (s: SVGSVGElement) => [...s.querySelectorAll('text')].map((t) => t.textContent);
    const chain = ['1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"'];
    expect(texts(a!)).toEqual([...chain, 'baseline 3/4"', '6"', '1:8', 'both ends']);
    expect(texts(b!)).toEqual(['outside face', ...chain, 'inside face']);
  });

  it('the 6"/4/1:8 chain sits on ONE row (the mockup), every mark over its own span', () => {
    const { container } = render(<DovetailBench bench={benchOf(6)} />);
    const ys = [...svgs(container)[0]!.querySelectorAll('text')].slice(0, 9).map((t) => t.getAttribute('y'));
    expect(new Set(ys).size).toBe(1);
  });

  const cases: [string, number, Partial<Dovetail>, Units?][] = [
    ['the 6"/4/1:8 drawer side', 6, {}],
    ['a crowded chain (12", 8 tails): two tiers', 12, { count: 8 }],
    ['a wide carcass side (30", 20 tails): a thin figure', 30, { count: 20 }],
    ['a single tail on a narrow part (1-1/2")', 1.5, { count: 1, depth: 0.25 }],
    ['metric (150 mm, 4 tails, 6 mm pins)', 150 / 25.4, { pin: 6 / 25.4, depth: 19 / 25.4 }, { display: 'metric-mm', precision: 1 }],
  ];
  it.each(cases)('no label overlaps another or leaves its viewBox: %s', (_n, width, d, units) => {
    const { container } = render(<DovetailBench bench={benchOf(width, d, units ?? IMPERIAL, true)} />);
    for (const s of svgs(container)) check(s);
  });

  it('a crowded chain does fall back to two tiers (so the case above exercises it)', () => {
    const { container } = render(<DovetailBench bench={benchOf(12, { count: 8 })} />);
    const ys = [...svgs(container)[0]!.querySelectorAll('text')].slice(0, 17).map((t) => t.getAttribute('y'));
    expect(new Set(ys).size).toBe(2);
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
