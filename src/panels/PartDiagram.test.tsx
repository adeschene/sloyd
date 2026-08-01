import { render, screen } from '@testing-library/react';
import { buildDiagrams, createBoard } from '../document/document';
import type { Cut } from '../document/document';
import { PartDiagram } from './PartDiagram';
import { labelWidth, LABEL_ASCENT, LABEL_DESCENT, LABEL_BOX_H } from './diagramLabels';

const dado = (over: Partial<Cut> = {}): Cut => ({
  id: 'c1', face: 'thickness', from: 'min', across: 'width',
  offset: 6, width: 0.75, depth: 0.375, ...over,
});

const view = (...cuts: Cut[]) => buildDiagrams(createBoard({ cuts }), 16)[0];

/** The perpendicular-crossing board from Task 5's `diagram.test.ts` (its
 * "reports one legend line per distinct crossing depth" case): one
 * horizontal-axis cut and one vertical-axis cut on the same face, at
 * different depths, so they cross in exactly one cell. */
const crossingView = () => buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
  { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.125 },
  { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.375 },
] }), 16)[0];

describe('PartDiagram', () => {
  it('draws the outline and one cell per non-crossing cut', () => {
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', offset: 12 }))} />);
    expect(container.querySelectorAll('.cutlist-diagram-outline')).toHaveLength(1);
    expect(container.querySelectorAll('.cutlist-diagram-cell')).toHaveLength(2);
  });

  it('draws one cell rect per depth-field cell', () => {
    const { container } = render(<PartDiagram view={crossingView()} />);
    expect(container.querySelectorAll('.cutlist-diagram-cell').length).toBeGreaterThan(1);
  });

  it('cross-hatches only the crossing cells', () => {
    const { container } = render(<PartDiagram view={crossingView()} />);
    const cross = container.querySelectorAll('.cutlist-diagram-cross');
    expect(cross).toHaveLength(1);
    expect(cross[0].getAttribute('fill')).toMatch(/^url\(#/);
  });

  it('gives a vertically-positioned cut a rotated leader column, not a row', () => {
    const { container } = render(<PartDiagram view={crossingView()} />);
    const col = container.querySelector('.cutlist-diagram-leader-v')!;
    expect(col).toBeInTheDocument();
    expect(col.querySelector('text')!.getAttribute('transform')).toMatch(/rotate\(-90/);
  });

  it('prints the crossing legend it was given and formats nothing itself', () => {
    render(<PartDiagram view={crossingView()} />);
    expect(screen.getByText('crossing: 3/8" deep governs')).toBeInTheDocument();
  });

  it('no longer dashes anything for a far side', () => {
    // Retired with hasFar (spec section 6): every view is one side now.
    const { container } = render(<PartDiagram view={crossingView()} />);
    expect(container.querySelector('.cutlist-diagram-leader-far')).toBeNull();
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
    expect(screen.getByRole('img', { name: 'Thickness face — min side' }))
      .toBeInTheDocument();
  });

  it('gives every pattern an id unique to the instance', () => {
    // Two diagrams on one sheet must not share a <pattern> id, or the second
    // silently reuses the first's fill. Assert uniqueness by count rather than
    // a fixed number, so a third pattern added later doesn't need this test
    // recounted.
    const { container } = render(
      <>
        <PartDiagram view={view(dado())} />
        <PartDiagram view={view(dado())} />
      </>,
    );
    const ids = [...container.querySelectorAll('pattern')].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('strips every pattern id of every character unsafe inside url(#...)', () => {
    // useId() returns a value wrapped in reserved characters (`:r0:`, and
    // `«r0»` in React 19) that stop a `url(#...)` reference from parsing past
    // the punctuation. jsdom does not catch this — the attribute still starts
    // with `url(#`, so only a real browser draws an unhatched rect. This pins
    // both the hatch and cross-hatch pattern ids to a safe alphabet so a
    // regression back to a bare useId() fails here instead of silently in
    // Chrome.
    const { container } = render(<PartDiagram view={view(dado())} />);
    for (const p of container.querySelectorAll('pattern')) {
      expect(p.id).toMatch(/^(hatch|cross)[a-zA-Z0-9]+$/);
    }
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

  it('keeps every cut\'s leader-row text below the outline, never above it', () => {
    // The heart of the previous round: every number a cut owns now lives in
    // that cut's own leader row, which is what makes cross-cut collisions
    // impossible by construction rather than by arithmetic. No leader-row
    // label may drift back above the outline's bottom edge (the overall-width
    // label is exempt below — it sits BESIDE the outline, not in a leader row).
    // Both cuts are horizontal-axis (default `across: 'width'`), so this board
    // is row-only by construction — no leader column exists to exempt.
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', offset: 12 }))} />);
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

  it('never starts a leader column above the outline itself', () => {
    // The vertical analogue of the old row case: a thin cut positioned along
    // the board's thickness is ALWAYS a leader column now, never a row —
    // `thickness` sorts last in DIMENSION_ORDER, so a cut positioned along it
    // is never the earlier ("horizontal") of a view's two in-plane dimensions.
    // Found in the same spirit as the row case (a run shorter than its label),
    // but the failure direction rotates with the axis: a column label must not
    // drift above the outline's top edge (y < 0), the analogue of a row label
    // drifting left of the board.
    const { container } = render(
      <PartDiagram
        view={view(dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25 }))}
      />,
    );
    const col = container.querySelector('.cutlist-diagram-leader-v')!;
    expect(col).toBeInTheDocument();
    for (const t of col.querySelectorAll('text')) {
      const w = labelWidth(t.textContent!);
      const y = Number(t.getAttribute('y'));
      expect(y - w / 2).toBeGreaterThanOrEqual(0);
    }
  });

  it('delimits each measured run with end ticks', () => {
    // The offset run and the band run abut and are collinear, so without ticks
    // they read as ONE line from the board's edge to the cut's far side, making
    // the offset label look like it measures to the far side. Found by eye on a
    // real rendered diagram, not by a predicate.
    const { container } = render(<PartDiagram view={view(dado())} />);
    const row = container.querySelector('.cutlist-diagram-leader')!;
    // A tick is a VERTICAL, non-zero-length line: x1 === x2 alone also matches
    // a zero-length horizontal run (e.g. a cut at offset: 0, where the offset
    // run collapses to a point), which would over-count on that geometry.
    const ticks = [...row.querySelectorAll('line')].filter(
      (l) => l.getAttribute('x1') === l.getAttribute('x2')
        && l.getAttribute('y1') !== l.getAttribute('y2'),
    );
    expect(ticks).toHaveLength(3);
    // The middle tick is what separates the two runs: it must sit exactly at the
    // band's near edge, shared by both.
    const cell = container.querySelector('.cutlist-diagram-cell')!;
    const xs = ticks.map((l) => Number(l.getAttribute('x1'))).sort((a, b) => a - b);
    expect(xs[1]).toBeCloseTo(Number(cell.getAttribute('x')), 10);
  });
});

/**
 * The seven geometries from follow-up 59's measured browser sweep, as unit
 * tests. Three of them (2, 3 and 6) FAILED in the browser before the previous
 * round closed them. This round re-keyed several of these boards' views by
 * physical face (Task 5), which turns some of them into leader-COLUMN cases
 * rather than leader-ROW cases — see case 5's updated comment.
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
      const rotated = (t.getAttribute('transform') ?? '').includes('rotate(-90');
      if (rotated) {
        // rotate(-90 x y) turns the text's own horizontal advance into a
        // VERTICAL extent centred on y (labelWidth(s), matching packRow's
        // centre semantics directly) and its ascent/descent into a
        // horizontal extent to either side of x — asymmetric, since ascent
        // (19) and descent (6) differ. See diagramLabels.ts's doc comment on
        // labelHeight for why this pair of constants exists at all.
        return {
          text,
          left: x - LABEL_ASCENT,
          right: x + LABEL_DESCENT,
          top: y - w / 2,
          bottom: y + w / 2,
        };
      }
      // `x` is the CENTRE under text-anchor: middle and the LEFT EDGE otherwise.
      // Reading it as a left edge regardless would make every assertion below
      // wrong in exactly the direction that hides a collision.
      const left = t.getAttribute('text-anchor') === 'middle' ? x - w / 2 : x;
      // At font-size 20 the glyph box rises ~19 above the baseline and drops
      // ~6 below it; a dominant-baseline: middle label straddles `y` instead.
      const mid = t.getAttribute('dominant-baseline') === 'middle';
      return {
        text,
        left,
        right: left + w,
        top: mid ? y - LABEL_BOX_H / 2 : y - LABEL_ASCENT,
        bottom: mid ? y + LABEL_BOX_H / 2 : y + LABEL_DESCENT,
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

  it('5 min-width — an edge groove, drawnV sliver-clamped (was a 0.7-unit near-miss)', () => {
    // face: 'width', across: 'length' gives horizontal: 'length', vertical:
    // 'thickness' — h = 24, v = 0.75, which is fitView's sliver clamp
    // (drawnV floors at DRAW_WIDTH / MAX_ASPECT). A cut positioned along
    // thickness is always a leader COLUMN under the per-face grouping (Task
    // 5) — thickness sorts last in DIMENSION_ORDER, so it is never a view's
    // "horizontal" dimension.
    const container = draw({ cuts: [dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25 })] });
    check(container);
    // The thing that actually drove the Infinity-bound column-packing design:
    // this column's depth label needs far more than the nominal row-only
    // height (leaders + BOTTOM, ~179 units here), so the figure's height must
    // have grown to fit it — this is the on-the-other-axis analogue of the
    // overall-width label growing `viewW`. Asserting only the sweep's general
    // bounds check (which happens to cover this) would let a future revert to
    // a bounded packRow pass silently as long as the numbers still fit.
    const svg = container.querySelector('svg')!;
    const [, , , vbH] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const nominalHeight = Number(outline.getAttribute('y')) + Number(outline.getAttribute('height')) + 16 + 34;
    expect(vbH).toBeGreaterThan(nominalHeight);
  });

  it('6 narrow-drawn — a 24" x 100-15/16" panel, the acceptance case (was FAIL)', () => {
    check(draw({ length: 24, width: 100.9375, cuts: [dado()] }));
  });

  it('7 many-cuts — five spread dados', () => {
    check(draw({
      cuts: [0, 4, 8, 12, 16].map((offset, i) => dado({ id: `c${i}`, offset })),
    }));
  });

  it('8 same-view crossing — two perpendicular cuts crossing in one view', () => {
    // Replaces the old "cut from both sides in the same view" case: `from`
    // now selects a different VIEW entirely (Task 5), so a single view can no
    // longer mix near and far cuts. The equivalent stress case for one view
    // is two cuts naming DIFFERENT across dimensions — one leader row and one
    // leader column together, plus the crossing legend line.
    check(draw({ length: 24, width: 12, cuts: [
      dado({ id: 'a', across: 'width', offset: 6, width: 0.75, depth: 0.125 }),
      dado({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 }),
    ] }));
  });
});
