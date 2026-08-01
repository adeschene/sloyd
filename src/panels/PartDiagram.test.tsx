import { render, screen } from '@testing-library/react';
import { buildDiagrams, createBoard } from '../document/document';
import type { Cut } from '../document/document';
import { PartDiagram } from './PartDiagram';
import { labelWidth } from './diagramLabels';

const dado = (over: Partial<Cut> = {}): Cut => ({
  id: 'c1', face: 'thickness', from: 'min', across: 'width',
  offset: 6, width: 0.75, depth: 0.375, ...over,
});

const view = (...cuts: Cut[]) => buildDiagrams(createBoard({ cuts }), 16)[0];

describe('PartDiagram', () => {
  it('draws the outline and one band per cut', () => {
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', offset: 12 }))} />);
    expect(container.querySelectorAll('.cutlist-diagram-outline')).toHaveLength(1);
    expect(container.querySelectorAll('.cutlist-diagram-near')).toHaveLength(2);
  });

  it('marks a far-side cut differently from a near one', () => {
    const { container } = render(<PartDiagram view={view(dado({ from: 'max' }))} />);
    expect(container.querySelectorAll('.cutlist-diagram-far')).toHaveLength(1);
    expect(container.querySelectorAll('.cutlist-diagram-near')).toHaveLength(0);
  });

  it('hatches a near cut and leaves a far one unfilled', () => {
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', from: 'max' }))} />);
    expect(container.querySelector('.cutlist-diagram-near')!.getAttribute('fill'))
      .toMatch(/^url\(#/);
    expect(container.querySelector('.cutlist-diagram-far')!.getAttribute('fill'))
      .toBe('none');
  });

  it('shows the legend only when a far cut is present', () => {
    render(<PartDiagram view={view(dado())} />);
    expect(screen.queryByText(/far side/)).not.toBeInTheDocument();
  });

  it('explains the two line styles when both sides are cut', () => {
    render(<PartDiagram view={view(dado(), dado({ id: 'c2', from: 'max' }))} />);
    expect(screen.getByText(/far side/)).toBeInTheDocument();
  });

  it('captions every diagram as schematic', () => {
    render(<PartDiagram view={view(dado())} />);
    expect(screen.getByText(/Schematic — not to scale/)).toBeInTheDocument();
  });

  it('prints the labels it was given and formats nothing itself', () => {
    render(<PartDiagram view={view(dado())} />);
    expect(screen.getByText('3/8" deep')).toBeInTheDocument();
    expect(screen.getByText('6"')).toBeInTheDocument();
    expect(screen.getByText('3/4"')).toBeInTheDocument();
    expect(screen.getByText('24"')).toBeInTheDocument();
    expect(screen.getByText('5-1/2"')).toBeInTheDocument();
  });

  it('names the view for a screen reader', () => {
    render(<PartDiagram view={view(dado())} />);
    expect(screen.getByRole('img', { name: 'Thickness face — across the width' }))
      .toBeInTheDocument();
  });

  it('gives its hatch pattern an id unique to the instance', () => {
    // Two diagrams on one sheet must not share a <pattern> id, or the second
    // silently reuses the first's fill.
    const { container } = render(
      <>
        <PartDiagram view={view(dado())} />
        <PartDiagram view={view(dado())} />
      </>,
    );
    const ids = [...container.querySelectorAll('pattern')].map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('strips the pattern id of every character unsafe inside url(#...)', () => {
    // useId() returns a value wrapped in reserved characters (`:r0:`, and
    // `«r0»` in React 19) that stop a `url(#...)` reference from parsing past
    // the punctuation. jsdom does not catch this — the attribute still starts
    // with `url(#`, so only a real browser draws an unhatched rect. This
    // pins the id to a safe alphabet so a regression back to a bare useId()
    // fails here instead of silently in Chrome.
    const { container } = render(<PartDiagram view={view(dado())} />);
    const id = container.querySelector('pattern')!.id;
    expect(id).toMatch(/^hatch[a-zA-Z0-9]+$/);
  });

  it('keeps the first leader label clear of the outline', () => {
    const { container } = render(<PartDiagram view={view(dado())} />);
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const bottom = Number(outline.getAttribute('y')) + Number(outline.getAttribute('height'));
    const label = container.querySelector('.cutlist-diagram-leader text')!;
    // A baseline is not a bounding box: the glyphs rise ~15 units above it at
    // font-size 20, and the label must still clear the board's bottom edge.
    expect(Number(label.getAttribute('y')) - 15).toBeGreaterThan(bottom);
  });

  it('draws no text at all above or below the outline', () => {
    // The heart of this round: every number a cut owns now lives in that cut's
    // own leader row, which is what makes cross-cut collisions impossible by
    // construction rather than by arithmetic. Nothing may drift back into the
    // band above or below the board.
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', from: 'max' }))} />);
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const top = Number(outline.getAttribute('y'));
    const bottom = top + Number(outline.getAttribute('height'));
    for (const t of container.querySelectorAll('text')) {
      const y = Number(t.getAttribute('y'));
      // The overall-width label sits BESIDE the outline, vertically within it.
      if (t.classList.contains('cutlist-diagram-overall')) continue;
      expect(y - 15).toBeGreaterThan(bottom);
    }
    expect(top).toBeGreaterThan(0);
  });

  it('dashes a far cut\'s leader row, so near/far stays encoded twice', () => {
    // Depth labels used to sit above the outline for a near cut and below for a
    // far one — the same distinction the band's line style makes, encoded
    // redundantly on purpose. Folding depth into the row costs that second
    // encoding, so the row's own leader line takes it over.
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', from: 'max' }))} />);
    const rows = [...container.querySelectorAll('.cutlist-diagram-leader')];
    const far = rows.filter((g) => g.classList.contains('cutlist-diagram-leader-far'));
    expect(far).toHaveLength(1);
  });

  it('tracks the outline\'s actual right edge for the overall-width label, not the nominal width', () => {
    // Important 2: the label used to be pinned to DRAW_WIDTH + 12 regardless
    // of where the outline was actually drawn. Use a board that enters the
    // shrink branch (h = 24, v = 24, via width: 24) so offsetX/drawnH differ
    // from the nominal DRAW_WIDTH.
    const { container } = render(
      <PartDiagram view={buildDiagrams(createBoard({ width: 24, cuts: [dado()] }), 16)[0]} />,
    );
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const right = Number(outline.getAttribute('x')) + Number(outline.getAttribute('width'));
    const vLabel = container.querySelector('.cutlist-diagram-overall')!;
    expect(Number(vLabel.getAttribute('x'))).toBeCloseTo(right + 12, 10);
    expect(vLabel.getAttribute('dominant-baseline')).toBe('middle');
  });

  it('never pulls the overall-width label back across the outline', () => {
    // The clamp used to satisfy the viewBox bound by violating the thing the
    // bound protects: on this board it put the label 33 units left of the
    // outline's right edge, drawing it across the figure. The viewBox grows
    // instead. Both bounds are asserted because fixing either one alone is
    // what produced the defect.
    const { container } = render(
      <PartDiagram
        view={buildDiagrams(createBoard({ length: 240, width: 100.9375, cuts: [dado()] }), 16)[0]}
      />,
    );
    const svg = container.querySelector('svg')!;
    const vbWidth = Number(svg.getAttribute('viewBox')!.split(/\s+/)[2]);
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const right = Number(outline.getAttribute('x')) + Number(outline.getAttribute('width'));
    const vLabel = container.querySelector('.cutlist-diagram-overall')!;
    const x = Number(vLabel.getAttribute('x'));
    expect(x).toBeGreaterThanOrEqual(right);
    expect(x + labelWidth(vLabel.textContent!)).toBeLessThanOrEqual(vbWidth);
  });

  it('never starts a leader row left of the board itself', () => {
    // A 1/4" cut on a 3/4" edge: the offset run is shorter than the label
    // centred on it, which used to put the label 3.2 units left of the board.
    // Found in a real browser by docs/diagram-overlap-sweep.js's P3 predicate.
    const { container } = render(
      <PartDiagram
        view={view(dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25 }))}
      />,
    );
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const left = Number(outline.getAttribute('x'));
    expect(left).toBeGreaterThan(0);   // this geometry really is inset
    for (const t of container.querySelectorAll('.cutlist-diagram-leader text')) {
      const w = labelWidth(t.textContent!);
      expect(Number(t.getAttribute('x')) - w / 2).toBeGreaterThanOrEqual(left);
    }
  });

  it('delimits each measured run with end ticks', () => {
    // The offset run and the band run abut and are collinear, so without ticks
    // they read as ONE line from the board's edge to the cut's far side, making
    // the offset label look like it measures to the far side. Found by eye on a
    // real rendered diagram, not by a predicate.
    const { container } = render(<PartDiagram view={view(dado())} />);
    const row = container.querySelector('.cutlist-diagram-leader')!;
    const ticks = [...row.querySelectorAll('line')].filter(
      (l) => l.getAttribute('x1') === l.getAttribute('x2'),
    );
    expect(ticks).toHaveLength(3);
    // The middle tick is what separates the two runs: it must sit exactly at the
    // band's near edge, shared by both.
    const band = container.querySelector('.cutlist-diagram-near')!;
    const xs = ticks.map((l) => Number(l.getAttribute('x1'))).sort((a, b) => a - b);
    expect(xs[1]).toBeCloseTo(Number(band.getAttribute('x')), 10);
  });
});

/**
 * The seven geometries from follow-up 59's measured browser sweep, as unit
 * tests. Three of them (2, 3 and 6) FAILED in the browser before this round.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. Label width is now arithmetic
 * (`labelWidth`), so the overlap predicate `docs/diagram-overlap-sweep.js`
 * computes from real `getBBox()` values is computable here from the `x`/`y`
 * ATTRIBUTES, which jsdom does report. That closes the hole for LAYOUT LOGIC.
 * It does NOT close it for FONT METRICS: if LABEL_EM is too small, or a machine
 * resolves --font-num to a wider face, every test below passes and the browser
 * still overlaps. The browser sweep remains the arbiter.
 */
describe('PartDiagram label collisions — the seven sweep geometries', () => {
  interface Box { text: string; left: number; right: number; top: number; bottom: number }

  const boxes = (container: HTMLElement): Box[] =>
    [...container.querySelectorAll('text')].map((t) => {
      const text = t.textContent ?? '';
      const w = labelWidth(text);
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      // `x` is the CENTRE under text-anchor: middle and the LEFT EDGE otherwise.
      // Reading it as a left edge regardless would make every assertion below
      // wrong in exactly the direction that hides a collision.
      const left = t.getAttribute('text-anchor') === 'middle' ? x - w / 2 : x;
      // At font-size 20 the glyph box rises ~15 above the baseline and drops ~5
      // below it; a dominant-baseline: middle label straddles `y` instead.
      const mid = t.getAttribute('dominant-baseline') === 'middle';
      return {
        text,
        left,
        right: left + w,
        top: mid ? y - 10 : y - 15,
        bottom: mid ? y + 10 : y + 5,
      };
    });

  const overlaps = (a: Box, b: Box) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  const check = (container: HTMLElement) => {
    const svg = container.querySelector('svg')!;
    const [, , vbW, vbH] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    const bs = boxes(container);
    expect(bs.length).toBeGreaterThan(0);
    for (let i = 0; i < bs.length; i += 1) {
      for (let j = i + 1; j < bs.length; j += 1) {
        expect(
          overlaps(bs[i], bs[j]),
          `"${bs[i].text}" overlaps "${bs[j].text}"`,
        ).toBe(false);
      }
      expect(bs[i].left, `"${bs[i].text}" reaches left of the viewBox`).toBeGreaterThanOrEqual(0);
      expect(bs[i].right, `"${bs[i].text}" reaches right of the viewBox`).toBeLessThanOrEqual(vbW);
      expect(bs[i].top, `"${bs[i].text}" reaches above the viewBox`).toBeGreaterThanOrEqual(0);
      expect(bs[i].bottom, `"${bs[i].text}" reaches below the viewBox`).toBeLessThanOrEqual(vbH);
    }
  };

  const draw = (board: Parameters<typeof createBoard>[0]) => {
    const { container } = render(
      <PartDiagram view={buildDiagrams(createBoard(board), 16)[0]} />,
    );
    return container;
  };

  it('1 baseline — one dado on a 24" x 5-1/2" board (the calibration control)', () => {
    check(draw({ cuts: [dado()] }));
  });

  it('2 two-close — two dados 3/4" apart on a 24" square panel (was FAIL)', () => {
    check(draw({ width: 24, cuts: [dado({ offset: 6 }), dado({ id: 'c2', offset: 7.5 })] }));
  });

  it('3 offset-zero — a cut at offset 0 (was FAIL)', () => {
    check(draw({ cuts: [dado({ offset: 0, width: 0.125 })] }));
  });

  it('4 flush-max — a rabbet flush at the max end', () => {
    check(draw({ cuts: [dado({ offset: 23.25, width: 0.75 })] }));
  });

  it('5 min-width — an edge groove, drawnH floored (was a 0.7-unit near-miss)', () => {
    // face: 'width', across: 'length' gives along: 'thickness' — h = 0.75,
    // v = 24, which is fitView's MIN_WIDTH branch.
    check(draw({ cuts: [dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25 })] }));
  });

  it('6 narrow-drawn — a 24" x 100-15/16" panel, the acceptance case (was FAIL)', () => {
    check(draw({ length: 24, width: 100.9375, cuts: [dado()] }));
  });

  it('7 many-cuts — five spread dados', () => {
    check(draw({
      cuts: [0, 4, 8, 12, 16].map((offset, i) => dado({ id: `c${i}`, offset })),
    }));
  });

  it('survives a board cut from both sides in the same view', () => {
    check(draw({ cuts: [dado(), dado({ id: 'c2', offset: 12, from: 'max' })] }));
  });
});
