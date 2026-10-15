import { IMPERIAL } from '../units/length';
import { cleanup, render, screen } from '@testing-library/react';
import { buildDiagrams, createBoard } from '../document/document';
import type { Cut } from '../document/document';
import { PartDiagram, LEFT_PAD, TICK } from './PartDiagram';
import { archCurve, defaultCorners } from '../document/curves';
import { labelWidth, LABEL_ASCENT, LABEL_DESCENT, LABEL_BOX_H } from './diagramLabels';

const dado = (over: Partial<Cut> = {}): Cut => ({
  id: 'c1', face: 'thickness', from: 'min', across: 'width',
  offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0, ...over,
});

const view = (...cuts: Cut[]) => buildDiagrams(createBoard({ cuts }), IMPERIAL)[0];

/** The perpendicular-crossing board from Task 5's `diagram.test.ts` (its
 * "reports one legend line per distinct crossing depth" case): one
 * horizontal-axis cut and one vertical-axis cut on the same face, at
 * different depths, so they cross in exactly one cell. */
const crossingView = () => buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
  { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.125, stopMin: 0, stopMax: 0 },
  { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 },
] }), IMPERIAL)[0];

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

  it('gives a crossing cell a DIFFERENT pattern than an ordinary cell', () => {
    // `cross-hatches only the crossing cells` above only pins the CLASS and
    // that the fill is *some* url(#...) — it would still pass if every cell,
    // crossing or not, used the same pattern. The whole point of the
    // cross-hatch is that it is visually distinct from a plain hatch, and
    // that distinction has to survive print with Background graphics off, so
    // it must be a real second pattern, not just a repeated reference.
    const { container } = render(<PartDiagram view={crossingView()} />);
    const cells = [...container.querySelectorAll('.cutlist-diagram-cell')];
    const crossing = cells.find((c) => c.classList.contains('cutlist-diagram-cross'))!;
    const plain = cells.find((c) => !c.classList.contains('cutlist-diagram-cross'))!;
    const crossingFill = crossing.getAttribute('fill')!;
    const plainFill = plain.getAttribute('fill')!;
    expect(crossingFill).not.toBe(plainFill);
    const idOf = (fill: string) => fill.replace(/^url\(#/, '').replace(/\)$/, '');
    const patternIds = [...container.querySelectorAll('pattern')].map((p) => p.id);
    expect(patternIds).toContain(idOf(crossingFill));
    expect(patternIds).toContain(idOf(plainFill));
  });

  it('gives a vertically-positioned cut a rotated leader column, not a row', () => {
    const { container } = render(<PartDiagram view={crossingView()} />);
    const col = container.querySelector('.cutlist-diagram-leader-v')!;
    expect(col).toBeInTheDocument();
    expect(col.querySelector('text')!.getAttribute('transform')).toMatch(/rotate\(-90/);
  });

  it('prints the crossing legend it was given and formats nothing itself', () => {
    render(<PartDiagram view={crossingView()} />);
    expect(screen.getByText('overlap: 3/8" deep governs')).toBeInTheDocument();
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
      <PartDiagram view={buildDiagrams(createBoard({ width: 24, cuts: [dado()] }), IMPERIAL)[0]} />,
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
        view={buildDiagrams(createBoard({ length: 240, width: 100.9375, cuts: [dado()] }), IMPERIAL)[0]}
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
    // drift above the outline's TOP EDGE, the analogue of a row label
    // drifting left of the board's left edge.
    //
    // Bounding against 0 (the viewBox) instead of the outline's own `y` gave
    // this test almost no bite: `packRow`'s actual bound is `top = 4`, so a
    // regression that clamped at 0 instead of `top` would still pass a
    // `>= 0` check by 4 units. Bounding against the outline is what the name
    // claims and is what a mutation of the column bound (`top` -> `0`)
    // actually fails on.
    const { container } = render(
      <PartDiagram
        view={view(dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25 }))}
      />,
    );
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const outlineTop = Number(outline.getAttribute('y'));
    const col = container.querySelector('.cutlist-diagram-leader-v')!;
    expect(col).toBeInTheDocument();
    for (const t of col.querySelectorAll('text')) {
      const w = labelWidth(t.textContent!);
      const y = Number(t.getAttribute('y'));
      expect(y - w / 2).toBeGreaterThanOrEqual(outlineTop);
    }
  });

  it('never starts a leader-row label left of the outline itself', () => {
    // The row-axis mirror of the column test above, and of a fix from the
    // previous round: `packRow`'s row bound is `left + fit.offsetX` (the
    // outline's own left edge), not `left` alone. On a board that enters the
    // shrink branch, `fit.offsetX` is large (437.5 here) and a `0"` offset
    // label centred on a zero-width run would otherwise land at 425.1 — 12.4
    // units left of the outline — if the bound were `left` without
    // `fit.offsetX` added in. Assert `outline.x > 0` first so this cannot
    // pass vacuously on a board where offsetX is 0.
    const { container } = render(
      <PartDiagram
        view={buildDiagrams(
          createBoard({ length: 24, width: 100.9375, cuts: [dado({ offset: 0, width: 0.125 })] }),
          IMPERIAL,
        )[0]}
      />,
    );
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const outlineX = Number(outline.getAttribute('x'));
    expect(outlineX).toBeGreaterThan(0);
    for (const t of container.querySelectorAll('.cutlist-diagram-leader text')) {
      const w = labelWidth(t.textContent!);
      expect(Number(t.getAttribute('x')) - w / 2).toBeGreaterThanOrEqual(outlineX);
    }
  });

  it('anchors leader columns immediately left of the outline, even under the shrink branch', () => {
    // FINDING 1 (live defect, fixed here): the gutter used to be anchored at
    // x = 0 while the outline sat at `left + fit.offsetX`. Under the shrink
    // branch `offsetX` can be hundreds of units, leaving the leader column
    // pointing at empty space instead of the board. Assert `fit.offsetX > 0`
    // first (via the outline's own x exceeding what `left` alone could
    // explain) so this cannot pass vacuously.
    const { container } = render(
      <PartDiagram
        view={buildDiagrams(
          createBoard({ length: 24, width: 100.9375, cuts: [
            dado({ across: 'length', offset: 0.25, width: 0.25 }),
          ] }),
          IMPERIAL,
        )[0]}
      />,
    );
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const outlineX = Number(outline.getAttribute('x'));
    const cols = [...container.querySelectorAll('.cutlist-diagram-leader-v')];
    expect(cols.length).toBeGreaterThan(0);
    // Sanity check that this geometry really does have a large offsetX: with
    // exactly one column, `outline.x = fit.offsetX + COL + LEFT_PAD`, and COL
    // alone is under 40 — an outline this far right cannot be explained
    // without a large offsetX.
    expect(outlineX).toBeGreaterThan(400);
    const last = cols[cols.length - 1];
    const ticks = [...last.querySelectorAll('line')].map((l) => [
      Number(l.getAttribute('x1')), Number(l.getAttribute('x2')),
    ]).flat();
    const rightmostTick = Math.max(...ticks);
    expect(outlineX - rightmostTick).toBeCloseTo(LEFT_PAD, 10);
  });

  it('keeps a rotated label clear of its own leader line and ticks', () => {
    // Regression guard for the COL derivation: COL = 26 (the brief's literal
    // value) does not fail by producing a negative x — labelX = COL*i +
    // LABEL_ASCENT anchors column 0 at [0, 25] independent of COL. It fails
    // because the label box [0, 25] swallows its own ticks ([18, 26] at
    // COL=26) and leader line (at x=22) — a text-vs-line collision, which no
    // text-vs-text or text-vs-viewBox check can ever see. This asserts the
    // real invariant directly: a column's label never reaches its own line.
    const { container } = render(<PartDiagram view={crossingView()} />);
    const col = container.querySelector('.cutlist-diagram-leader-v')!;
    const verticals = [...col.querySelectorAll('line')].filter(
      (l) => l.getAttribute('x1') === l.getAttribute('x2'),
    );
    expect(verticals.length).toBeGreaterThan(0);
    const lineX = Number(verticals[0].getAttribute('x1'));
    for (const t of col.querySelectorAll('text')) {
      const labelX = Number(t.getAttribute('x'));
      const rightEdge = labelX + LABEL_DESCENT;
      expect(rightEdge).toBeLessThanOrEqual(lineX - TICK);
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

  it('draws a cut whose stops cross without a NaN anywhere', () => {
    // A Board built directly (bypassing the loader), as a shortened board
    // reaches it mid-session: the region is empty, nothing is removed.
    const v = buildDiagrams(createBoard({ cuts: [dado({ stopMin: 4, stopMax: 3 })] }), IMPERIAL)[0];
    const { container } = render(<PartDiagram view={v} />);
    for (const el of container.querySelectorAll('*')) {
      for (const attr of el.getAttributeNames()) {
        expect(el.getAttribute(attr), `${el.tagName} ${attr}`).not.toMatch(/NaN/);
      }
    }
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
      <PartDiagram view={buildDiagrams(createBoard(board), IMPERIAL)[0]} />,
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

  it('9 blind mortise — a stopped horizontal-axis cut adds a stop COLUMN', () => {
    const container = draw({ cuts: [dado({ stopMin: 1, stopMax: 1.5 })] });
    check(container);
    const texts = [...container.querySelectorAll('.cutlist-diagram-leader-v text')].map((t) => t.textContent);
    // thickness|min is a vUp view (fu 215): top to bottom reads max stop, run, min stop.
    expect(texts).toEqual(['1-1/2"', '3"', '1"']);
  });

  it('10 stopped dado — one stop draws one stop label and the length', () => {
    const container = draw({ cuts: [dado({ stopMax: 1 })] });
    check(container);
    const texts = [...container.querySelectorAll('.cutlist-diagram-leader-v text')].map((t) => t.textContent);
    // vUp view: the max stop (1") is the upper label, the run below it.
    expect(texts).toEqual(['1"', '4-1/2"']);
  });

  it('11 a stopped vertical-axis cut adds a stop ROW', () => {
    // across: 'length' makes this cut positioned along width (a column); its
    // stops run along length, the horizontal axis, so they are a row.
    const container = draw({ length: 24, width: 12, cuts: [
      dado({ across: 'length', offset: 4, width: 0.75, stopMin: 2, stopMax: 3 }),
    ] });
    check(container);
    const rows = [...container.querySelectorAll('g.cutlist-diagram-leader:not(.cutlist-diagram-leader-v)')];
    const stopRow = rows.find((g) => [...g.querySelectorAll('text')].some((t) => t.textContent === '19"'));
    expect(stopRow, 'the stop row carries the 19" length').toBeDefined();
    expect([...stopRow!.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['2"', '19"', '3"']);
  });

  it('12b vUp pressure — a cut at the vertical MAX end (the TOP of a vUp view) lays out as the mirror of the unflipped pack', () => {
    // 24 x 5.5 board, s = 1000/24 per inch, V drawn = 5.5s = 229.1667. Cut v [5.25, 5.5]: band 0.25s = 10.4167
    // tall, flush with the top edge. CHAR_W = 12.4, so '5-1/4"' = 74.4, '1/4"' = 49.6, '3/8" deep' = 111.6 wide.
    // Packed in mirrored coordinates m (up from the bottom edge, as the unflipped column packs down from the top):
    //   offset  centre 218.75/2 = 109.375            left 72.175,  cursor 72.175+74.4+8 = 154.575
    //   band    centre 218.75 + 5.2083 = 223.9583    left 199.158 (>= cursor, stays), cursor 199.158+49.6+8 = 256.758
    //   depth   ideal centre 229.1667+8+55.8 = 292.967, left 237.167 < cursor -> left 256.758, centre 312.558
    // The depth label's far end is then 312.558+55.8 = 368.358 up from the bottom edge, i.e. above the outline top
    // by 139.19 past TOP, so the figure lifts by 139.19: top = 143.19, bottom = 372.36 and y = bottom - m:
    //   depth y 59.80 (its upper end sits exactly at TOP = 4), band y 148.40 (the band's own centre, 143.19 + 5.21),
    //   offset y 262.99 (the middle of its run, band foot 153.6 to the bottom edge).
    const c = draw({ cuts: [dado({ across: 'length', offset: 5.25, width: 0.25 })] });
    check(c);
    const y = (t: string) => Number([...c.querySelectorAll('.cutlist-diagram-leader-v text')].find((e) => e.textContent === t)!.getAttribute('y'));
    const o = c.querySelector('.cutlist-diagram-outline')!;
    const top = Number(o.getAttribute('y'));
    const bottom = top + Number(o.getAttribute('height'));
    const s = 1000 / 24;
    expect(top).toBeCloseTo(143.19, 1);
    expect(bottom - top).toBeCloseTo(5.5 * s, 6);
    expect(y('1/4"')).toBeCloseTo(top + 0.125 * s, 6);                 // centred on its band
    expect(y('3/8" deep')).toBeCloseTo(59.80, 1);
    expect(y('3/8" deep') - 55.8).toBeCloseTo(4, 1);                   // lifted, not clamped: its end sits at TOP
    expect(y('5-1/4"')).toBeCloseTo((top + 0.25 * s + bottom) / 2, 6); // centred on its own run
    // reading order top to bottom: depth, band, offset, with the 8-unit gap between depth and band
    expect(y('1/4"') - 24.8 - (y('3/8" deep') + 55.8)).toBeCloseTo(8, 6);
  });

  it('12 crowded stops — a mortise with sixteenth stops still never overlaps', () => {
    check(draw({ cuts: [dado({ stopMin: 0.0625, stopMax: 0.0625 })] }));
  });

  it('13 a stopped cut on a sliver view (edge face) never overlaps or bleeds', () => {
    check(draw({ cuts: [dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25, stopMin: 2, stopMax: 2 })] }));
  });

  it('15 a stop column that runs deepest grows the figure', () => {
    // A 1-1/2" board is short enough that the stop column's last label, not the
    // outline, decides the figure's height.
    check(draw({ width: 1.5, cuts: [dado({ stopMin: 0.0625, stopMax: 0.0625 })] }));
  });

  it('14 a mortise and an unstopped dado together', () => {
    check(draw({ width: 12, cuts: [dado({ id: 'm', stopMin: 2, stopMax: 2 }), dado({ id: 'd', offset: 14 })] }));
  });
});

describe('PartDiagram — a view with no stopped cut draws exactly as before', () => {
  /** Every drawn element's markup, pattern ids stripped (useId varies by render order). */
  const layout = (container: HTMLElement): string => {
    const svg = container.querySelector('svg')!;
    const parts = [svg.getAttribute('viewBox') ?? ''];
    for (const el of svg.querySelectorAll('line, text, rect')) {
      parts.push(el.outerHTML.replace(/url\(#[^)]*\)/g, 'url(#)'));
    }
    return parts.join('\n');
  };
  /** djb2 — a stable fingerprint, so the pinned values below stay one line each. */
  const hash = (s: string): number => {
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
  };
  const fingerprint = (board: Parameters<typeof createBoard>[0]) => {
    const { container } = render(<PartDiagram view={buildDiagrams(createBoard(board), IMPERIAL)[0]} />);
    return hash(layout(container));
  };

  it.each<[string, Parameters<typeof createBoard>[0], number]>([
    ['baseline dado', { cuts: [dado()] }, 2835748402],
    ['two close dados', { width: 24, cuts: [dado({ offset: 6 }), dado({ id: 'c2', offset: 7.5 })] }, 1738991806],
    ['offset zero', { cuts: [dado({ offset: 0, width: 0.125 })] }, 4144905029],
    ['flush max', { cuts: [dado({ offset: 23.25, width: 0.75 })] }, 835304667],
    ['edge groove column', { cuts: [dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25 })] }, 3531979766],
    ['narrow drawn', { length: 24, width: 100.9375, cuts: [dado()] }, 3094106887],
    ['five dados', { cuts: [0, 4, 8, 12, 16].map((offset, i) => dado({ id: `c${i}`, offset })) }, 3472338868],
    ['row and column crossing', { length: 24, width: 12, cuts: [
      // from 'max': thickness|max is a vUp:false view, so this pin still guards the
      // unflipped layout byte for byte (thickness|min flips, fu 215).
      dado({ id: 'a', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.125 }),
      dado({ id: 'b', from: 'max', across: 'length', offset: 4, width: 0.75, depth: 0.375 }),
    ] }, 2253356282],
    // The FLIPPED twin of the board above (thickness|min is vUp; re-pinned 2157391699 -> 2055517075 when its column
    // packing became the mirror of the unflipped one, fu 215 final review): the pin is a
    // regression fingerprint of the flipped layout, not a hand derivation; the
    // hand-derived geometry is in the vUp stop-leader tests below.
    ['row and column crossing, vUp', { length: 24, width: 12, cuts: [
      dado({ id: 'a', across: 'width', offset: 6, width: 0.75, depth: 0.125 }),
      dado({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 }),
    ] }, 2055517075],
    ['no cuts', {}, 527349744],
  ])('%s', (_, board, pinned) => {
    expect(fingerprint(board)).toBe(pinned);
  });
});

describe('PartDiagram — the stop leader measures its own runs', () => {
  const num = (e: Element, a: string) => Number(e.getAttribute(a));
  const render1 = (board: Parameters<typeof createBoard>[0]) =>
    render(<PartDiagram view={buildDiagrams(createBoard(board), IMPERIAL)[0]} />).container;
  const outline = (c: HTMLElement) => c.querySelector('.cutlist-diagram-outline')!;
  const textsOf = (g: Element) => [...g.querySelectorAll('text')].map((t) => t.textContent);

  /** The stop leader: the group whose texts are exactly `texts`. */
  const leaderWith = (c: HTMLElement, texts: string[]) => {
    const g = [...c.querySelectorAll('g.cutlist-diagram-leader')]
      .find((e) => JSON.stringify(textsOf(e)) === JSON.stringify(texts));
    expect(g, `a leader labelled ${texts.join(', ')}`).toBeDefined();
    return g!;
  };

  /** Runs and ticks of one leader along `axis` ('x' = row, 'y' = column), as sorted numbers. */
  const parts = (g: Element, axis: 'x' | 'y') => {
    const other = axis === 'x' ? 'y' : 'x';
    const lines = [...g.querySelectorAll('line')];
    const runs = lines
      .filter((l) => num(l, `${other}1`) === num(l, `${other}2`) && num(l, `${axis}1`) !== num(l, `${axis}2`))
      .map((l) => [num(l, `${axis}1`), num(l, `${axis}2`)].sort((a, b) => a - b));
    const ticks = lines
      .filter((l) => num(l, `${axis}1`) === num(l, `${axis}2`) && num(l, `${other}1`) !== num(l, `${other}2`))
      .map((l) => num(l, `${axis}1`)).sort((a, b) => a - b);
    return { runs: runs.sort((a, b) => a[0] - b[0]), ticks };
  };
  /** The label's coordinate along the leader's axis (the centre of a middle-anchored text). */
  const at = (g: Element, axis: 'x' | 'y') => [...g.querySelectorAll('text')].map((t) => num(t, axis));

  const rowBoard = { length: 24, width: 12, cuts: [
    dado({ across: 'length', offset: 4, width: 0.75, stopMin: 2, stopMax: 3 }),
  ] };
  // from 'max' = a vUp:false view, whose column reads min stop at the top (the flipped view has its own tests).
  const colBoard = { cuts: [dado({ from: 'max', stopMin: 1, stopMax: 1.5 })] };

  it.each([
    ['row', 'x', rowBoard, ['2"', '19"', '3"'], 'x', 'width'],
    ['column', 'y', colBoard, ['1"', '3"', '1-1/2"'], 'y', 'height'],
  ] as const)('a two-stop %s leader: near run, band, far run, four ticks, labels on their runs', (_, axis, board, texts, a, size) => {
    const c = render1(board as unknown as Parameters<typeof createBoard>[0]);
    const o = outline(c);
    const lo = num(o, a);
    const hi = lo + num(o, size);
    const g = leaderWith(c, [...texts]);
    const { runs, ticks } = parts(g, axis);
    expect(runs).toHaveLength(3);
    const [nearRun, bandRun, farRun] = runs;
    expect(nearRun[0]).toBeCloseTo(lo, 6);
    expect(nearRun[1]).toBeCloseTo(bandRun[0], 6);
    expect(farRun[0]).toBeCloseTo(bandRun[1], 6);
    expect(farRun[1]).toBeCloseTo(hi, 6);
    expect(ticks).toHaveLength(4);
    [lo, bandRun[0], bandRun[1], hi].forEach((t, i) => expect(ticks[i]).toBeCloseTo(t, 6));
    // Label order is near stop, band, far stop; each must sit on ITS run.
    const [nearAt, bandAt, farAt] = at(g, axis);
    expect(nearAt).toBeGreaterThan(nearRun[0]);
    expect(nearAt).toBeLessThan(nearRun[1]);
    expect(bandAt).toBeGreaterThan(bandRun[0]);
    expect(bandAt).toBeLessThan(bandRun[1]);
    expect(farAt).toBeGreaterThan(farRun[0]);
    expect(farAt).toBeLessThan(farRun[1]);
  });

  it.each([
    ['row', 'x', { length: 24, width: 12, cuts: [
      dado({ across: 'length', offset: 4, width: 0.75, stopMax: 3 }),
    ] }, ['21"', '3"'], 'x', 'width'],
    ['column', 'y', { cuts: [dado({ from: 'max', stopMax: 1 })] }, ['4-1/2"', '1"'], 'y', 'height'],
  ] as const)('a one-stop %s leader: no near run, far run ends at the outline', (_, axis, board, texts, a, size) => {
    const c = render1(board as unknown as Parameters<typeof createBoard>[0]);
    const o = outline(c);
    const lo = num(o, a);
    const hi = lo + num(o, size);
    const g = leaderWith(c, [...texts]);
    const { runs, ticks } = parts(g, axis);
    expect(runs).toHaveLength(2);
    const [bandRun, farRun] = runs;
    expect(bandRun[0]).toBeCloseTo(lo, 6);
    expect(farRun[0]).toBeCloseTo(bandRun[1], 6);
    expect(farRun[1]).toBeCloseTo(hi, 6);
    expect(ticks).toHaveLength(3);
    [bandRun[0], bandRun[1], hi].forEach((t, i) => expect(ticks[i]).toBeCloseTo(t, 6));
    const [bandAt, farAt] = at(g, axis);
    expect(bandAt).toBeGreaterThan(bandRun[0]);
    expect(bandAt).toBeLessThan(bandRun[1]);
    expect(farAt).toBeGreaterThan(farRun[0]);
    expect(farAt).toBeLessThan(farRun[1]);
  });
});

describe('PartDiagram on a vUp view (fu 215)', () => {
  const B = { length: 24, width: 6, thickness: 0.75 } as const;
  const vcut = (over: Partial<Cut> = {}): Cut => ({
    id: 'v1', face: 'thickness', from: 'min', across: 'length',
    offset: 0, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });
  const build = (cut: Cut) => {
    const v = buildDiagrams(createBoard({ ...B, cuts: [cut] }), IMPERIAL)[0]!;
    const { container } = render(<PartDiagram view={v} />);
    const num = (el: Element, a: string) => Number(el.getAttribute(a));
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const cell = container.querySelector('.cutlist-diagram-cell')!;
    return {
      v, container, num, outline, cell,
      oTop: num(outline, 'y'), oBottom: num(outline, 'y') + num(outline, 'height'),
      cTop: num(cell, 'y'), cBottom: num(cell, 'y') + num(cell, 'height'),
    };
  };

  it('draws a cut at the vertical MIN end at the BOTTOM of the outline', () => {
    const r = build(vcut());
    expect(r.v.vUp).toBe(true);
    // V = 6in drawn at 1000/24 = 41.667/in: the cut [0, 0.5in] is 20.8 units tall,
    // flush with the bottom edge (by hand: drawn span [6-0.5, 6-0] = [5.5, 6]).
    expect(r.cBottom).toBeCloseTo(r.oBottom, 9);
    expect(r.cTop).toBeCloseTo(r.oBottom - 0.5 * (1000 / 24), 9);
  });

  it('the same cut on a vUp:false view (thickness|max) is drawn at the TOP', () => {
    const r = build(vcut({ from: 'max' }));
    expect(r.v.vUp).toBe(false);
    expect(r.cTop).toBeCloseTo(r.oTop, 9);
  });

  it('draws the offset run from the BOTTOM edge up to the band', () => {
    const r = build(vcut({ offset: 1 }));
    // Band v [1, 1.5] -> drawn [4.5, 5] of 6. The offset run joins the band's
    // lower end to the bottom edge, and its label sits below the band.
    const col = r.container.querySelector('.cutlist-diagram-leader-v')!;
    const run = [...col.querySelectorAll('line')].find(
      (l) => Math.abs(r.num(l, 'y1') - r.cBottom) < 1e-9 && Math.abs(r.num(l, 'y2') - r.oBottom) < 1e-9,
    );
    expect(run).toBeDefined();
    const offsetText = [...col.querySelectorAll('text')].find((t) => t.textContent === '1"')!;
    expect(r.num(offsetText, 'y')).toBeGreaterThan(r.cBottom);
    // Reading order on the page is depth (above the band), band, offset (below).
    const order = [...col.querySelectorAll('text')].sort((a, b) => r.num(a, 'y') - r.num(b, 'y')).map((t) => t.textContent);
    expect(order).toEqual(['1/4" deep', '1/2"', '1"']);
    // No run is drawn from the top edge: nothing is labelled from the wrong edge.
    expect([...col.querySelectorAll('line')].some((l) => r.num(l, 'y1') === r.oTop && r.num(l, 'y2') === r.cTop)).toBe(false);
  });

  it('puts a stopped cut\'s min stop at the bottom end and its max stop at the top', () => {
    const r = build(vcut({ across: 'width', offset: 4, width: 0.5, stopMin: 1, stopMax: 2 }));
    const col = r.container.querySelector('.cutlist-diagram-leader-v')!;
    const y = (t: string) => r.num([...col.querySelectorAll('text')].find((e) => e.textContent === t)!, 'y');
    // stopMin 1in, run 3in, stopMax 2in; min is the bottom end of a vUp view.
    expect(y('1"')).toBeGreaterThan(y('3"'));
    expect(y('3"')).toBeGreaterThan(y('2"'));
  });

  it('the same stopped cut on a vUp:false view reads min at the TOP', () => {
    const r = build(vcut({ from: 'max', across: 'width', offset: 4, width: 0.5, stopMin: 1, stopMax: 2 }));
    const col = r.container.querySelector('.cutlist-diagram-leader-v')!;
    const y = (t: string) => r.num([...col.querySelectorAll('text')].find((e) => e.textContent === t)!, 'y');
    expect(y('1"')).toBeLessThan(y('3"'));
    expect(y('3"')).toBeLessThan(y('2"'));
  });

  it('flips the depth-field cells with the cuts (a crossing cell sits where both cuts do)', () => {
    // Two cuts crossing at the bottom-left of a thickness|min view: v min end is
    // the bottom, h min end the left. By hand: crossing cell = h [0,0.5], v [0,0.5].
    const v = buildDiagrams(createBoard({ ...B, cuts: [
      vcut({ id: 'a', across: 'length', offset: 0, width: 0.5, depth: 0.125 }),
      vcut({ id: 'b', across: 'width', offset: 0, width: 0.5, depth: 0.25 }),
    ] }), IMPERIAL)[0]!;
    const { container } = render(<PartDiagram view={v} />);
    const o = container.querySelector('.cutlist-diagram-outline')!;
    const x = container.querySelector('.cutlist-diagram-cross')!;
    const n = (e: Element, a: string) => Number(e.getAttribute(a));
    expect(n(x, 'y') + n(x, 'height')).toBeCloseTo(n(o, 'y') + n(o, 'height'), 9);
    expect(n(x, 'x')).toBeCloseTo(n(o, 'x'), 9);
  });
});

describe('PartDiagram — vUp stop columns mirror the unflipped geometry (fu 215)', () => {
  const num = (e: Element, a: string) => Number(e.getAttribute(a));
  const colOf = (cuts: Cut[]) => {
    const { container } = render(<PartDiagram view={buildDiagrams(createBoard({ cuts }), IMPERIAL)[0]!} />);
    const o = container.querySelector('.cutlist-diagram-outline')!;
    const g = container.querySelector('.cutlist-diagram-leader-v')!;
    const lines = [...g.querySelectorAll('line')];
    const runs = lines.filter((l) => num(l, 'x1') === num(l, 'x2') && num(l, 'y1') !== num(l, 'y2'))
      .map((l) => [num(l, 'y1'), num(l, 'y2')].sort((a, b) => a - b)).sort((a, b) => a[0]! - b[0]!);
    const ticks = lines.filter((l) => num(l, 'y1') === num(l, 'y2')).map((l) => num(l, 'y1')).sort((a, b) => a - b);
    const texts = [...g.querySelectorAll('text')].map((t) => [t.textContent, num(t, 'y')] as const);
    const lo = num(o, 'y');
    return { runs, ticks, texts, lo, hi: lo + num(o, 'height') };
  };
  const base: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 };

  it('a two-stop vUp column: far run on top, band, near run at the bottom; labels strictly on their runs', () => {
    // stopMin 1, run 3, stopMax 1.5 of V = 5.5. Min is the BOTTOM end, so
    // top to bottom: [stopMax 1.5in][band 3in][stopMin 1in]; at s = height/5.5
    // the runs are [lo, lo+1.5s], [lo+1.5s, lo+4.5s], [lo+4.5s, hi]; four ticks.
    const { runs, ticks, texts, lo, hi } = colOf([{ ...base, stopMin: 1, stopMax: 1.5 }]);
    const s = (hi - lo) / 5.5;
    const want = [[lo, lo + 1.5 * s], [lo + 1.5 * s, lo + 4.5 * s], [lo + 4.5 * s, hi]];
    expect(runs).toHaveLength(3);
    want.forEach((w, i) => { expect(runs[i]![0]).toBeCloseTo(w[0]!, 6); expect(runs[i]![1]).toBeCloseTo(w[1]!, 6); });
    expect(ticks).toHaveLength(4);
    [lo, lo + 1.5 * s, lo + 4.5 * s, hi].forEach((t, i) => expect(ticks[i]).toBeCloseTo(t, 6));
    expect(texts.map(([t]) => t)).toEqual(['1-1/2"', '3"', '1"']);
    texts.forEach(([, y], i) => { expect(y).toBeGreaterThan(runs[i]![0]!); expect(y).toBeLessThan(runs[i]![1]!); });
  });

  it('a one-stop (max) vUp column: the stop run is on TOP from the outline edge; the band runs to the bottom edge', () => {
    // stopMax 1, run 4.5 of 5.5, no min stop. Top to bottom: [stopMax 1in][band 4.5in].
    // Runs [lo, lo+1s], [lo+1s, hi]; three ticks lo, lo+1s, hi; no run below the band.
    const { runs, ticks, texts, lo, hi } = colOf([{ ...base, stopMax: 1 }]);
    const s = (hi - lo) / 5.5;
    expect(runs).toHaveLength(2);
    expect(runs[0]![0]).toBeCloseTo(lo, 6);
    expect(runs[0]![1]).toBeCloseTo(lo + s, 6);
    expect(runs[1]![0]).toBeCloseTo(lo + s, 6);
    expect(runs[1]![1]).toBeCloseTo(hi, 6);
    expect(ticks).toHaveLength(3);
    [lo, lo + s, hi].forEach((t, i) => expect(ticks[i]).toBeCloseTo(t, 6));
    expect(texts.map(([t]) => t)).toEqual(['1"', '4-1/2"']);
    texts.forEach(([, y], i) => { expect(y).toBeGreaterThan(runs[i]![0]!); expect(y).toBeLessThan(runs[i]![1]!); });
  });

  it('a one-stop (min) vUp column: the band starts at the outline top and the stop run is at the BOTTOM', () => {
    // stopMin 1, run 4.5: top to bottom [band 4.5in][stopMin 1in]; ticks lo, lo+4.5s, hi.
    const { runs, ticks, texts, lo, hi } = colOf([{ ...base, stopMin: 1 }]);
    const s = (hi - lo) / 5.5;
    expect(runs).toHaveLength(2);
    expect(runs[0]![0]).toBeCloseTo(lo, 6);
    expect(runs[0]![1]).toBeCloseTo(lo + 4.5 * s, 6);
    expect(runs[1]![1]).toBeCloseTo(hi, 6);
    expect(ticks).toHaveLength(3);
    [lo, lo + 4.5 * s, hi].forEach((t, i) => expect(ticks[i]).toBeCloseTo(t, 6));
    expect(texts.map(([t]) => t)).toEqual(['4-1/2"', '1"']);
    texts.forEach(([, y], i) => { expect(y).toBeGreaterThan(runs[i]![0]!); expect(y).toBeLessThan(runs[i]![1]!); });
  });
});

describe('PartDiagram angle cuts', () => {
  it('draws an angle cut as a hatched polygon and prints its line', () => {
    const v = buildDiagrams(createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [
      { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] },
    ] }), IMPERIAL)[0]!;
    const { container, getByText } = render(<PartDiagram view={v} />);
    const poly = container.querySelector('polygon.cutlist-diagram-angle')!;
    expect(poly.getAttribute('fill')).toMatch(/^url\(#hatch[a-zA-Z0-9]+\)$/);
    expect(poly.getAttribute('points')!.split(' ')).toHaveLength(3);
    expect(getByText(/^Taper 5\/8"/)).toBeInTheDocument();
  });

  it('flips the vertical on a vUp view: the sharp tip (v = 0) is drawn at the bottom', () => {
    const v = buildDiagrams(createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [
      { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] },
    ] }), IMPERIAL)[0]!;
    expect(v.vUp).toBe(true);
    const { container } = render(<PartDiagram view={v} />);
    const pts = container.querySelector('polygon.cutlist-diagram-angle')!.getAttribute('points')!
      .split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    const tip = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
    const ys = pts.map((p) => p[1]);
    expect(tip[1]).toBe(Math.max(...ys));
    expect(Math.min(...ys)).toBeLessThan(tip[1]);
  });
});

describe('PartDiagram holes (holes spec §4.3, amended)', () => {
  const pins = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  const holedView = (over: Record<string, unknown> = {}) =>
    buildDiagrams(createBoard({ length: 30, width: 11.25, thickness: 0.75, holes: [pins], ...over }), IMPERIAL)[0]!;

  it('draws one ellipse and one centre mark per hole, scaled like the outline', () => {
    const { container } = render(<PartDiagram view={holedView()} />);
    const holes = container.querySelectorAll('ellipse.cutlist-diagram-hole');
    expect(holes).toHaveLength(3);
    expect(container.querySelectorAll('.cutlist-diagram-hole-centre')).toHaveLength(3);
    const rx = Number(holes[0]!.getAttribute('rx'));
    const ry = Number(holes[0]!.getAttribute('ry'));
    expect(rx).toBeGreaterThan(0);
    expect(ry).toBeGreaterThan(0);
  });
  it('prints each row\'s bench line once, as a note under the figure (HTML, not a measured label)', () => {
    render(<PartDiagram view={holedView()} />);
    const notes = screen.getAllByText(/^Row of 3 holes/);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.tagName).toBe('P');
  });
  it('draws a hole seen across its axis as a dashed outline: two walls and a bottom when blind', () => {
    const rabbet = { id: 'c1', face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
    const views = buildDiagrams(createBoard({ length: 30, width: 11.25, thickness: 0.75, holes: [pins], cuts: [rabbet] }), IMPERIAL);
    const w = views.find((v) => v.key === 'width|min')!;
    const { container } = render(<PartDiagram view={w} />);
    expect(container.querySelectorAll('line.cutlist-diagram-hole-side')).toHaveLength(9);
  });
  it('a part without holes renders exactly as before (no hole elements, no hole notes)', () => {
    const { container } = render(<PartDiagram view={view(dado())} />);
    expect(container.querySelectorAll('.cutlist-diagram-hole, .cutlist-diagram-hole-side, .cutlist-diagram-hole-note')).toHaveLength(0);
  });
  it('a vUp view flips v: a hole on the thickness MIN side draws at top + (v - c.v)*sy', () => {
    const minHole = { ...pins, id: 'h2', from: 'min' as const, count: 1 };
    const v = holedView({ holes: [minHole] });
    expect(v.vUp).toBe(true);
    const flat = { ...v, vUp: false };
    const up = render(<PartDiagram view={v} />).container.querySelector('ellipse.cutlist-diagram-hole')!;
    const down = render(<PartDiagram view={flat} />).container.querySelector('ellipse.cutlist-diagram-hole')!;
    const c = v.holes[0]!;
    const sy = Number(up.getAttribute('ry')) / c.r;
    // Same figure, same scales: the two cy differ by exactly (v - 2*c.v)*sy.
    expect(Number(up.getAttribute('cy')) - Number(down.getAttribute('cy'))).toBeCloseTo((v.v - 2 * c.v) * sy, 6);
  });
  it('a vUp view flips v for the depth outlines too', () => {
    const rabbet = { id: 'c1', face: 'width' as const, from: 'max' as const, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
    const w = buildDiagrams(createBoard({ length: 30, width: 11.25, thickness: 0.75, holes: [pins], cuts: [rabbet] }), IMPERIAL)
      .find((v) => v.key === 'width|max')!;
    expect(w.vUp).toBe(true);
    expect(w.holeSides.length).toBeGreaterThan(0);
    const lines = [...render(<PartDiagram view={w} />).container.querySelectorAll('line.cutlist-diagram-hole-side')];
    // Walls come first as (low v, high v); flipped, the low-v wall sits lower on the page (larger y).
    const s0 = w.holeSides[0]!;
    expect(s0.v[0]).toBeLessThan(s0.v[1]);
    const lowFirst = s0.axis === 'h' ? Number(lines[0]!.getAttribute('y1')) > Number(lines[1]!.getAttribute('y1'))
      : Number(lines[0]!.getAttribute('y1')) > Number(lines[0]!.getAttribute('y2'));
    expect(lowFirst).toBe(true);
  });
  /** The figure's scales, read back off the rendered outline (not from the code under test). */
  const scales = (container: HTMLElement, w: { h: number; v: number; vUp: boolean }) => {
    const o = container.querySelector('.cutlist-diagram-outline')!;
    const [ox, oy, ow, oh] = ['x', 'y', 'width', 'height'].map((a) => Number(o.getAttribute(a)));
    const sx = ow! / w.h;
    const sy = oh! / w.v;
    return { sx, sy, X: (h: number) => ox! + h * sx, Y: (v: number) => oy! + (w.vUp ? w.v - v : v) * sy };
  };

  it('each hole ellipse is r*sx by r*sy, the scales read off the outline (sx differs from sy)', () => {
    const w = holedView({ length: 96, width: 3.5, holes: [{ ...pins, inset: 1.75 }] }); // the sliver clamp: sx != sy
    const { container } = render(<PartDiagram view={w} />);
    const { sx, sy } = scales(container, w);
    expect(Math.abs(sx - sy)).toBeGreaterThan(1e-3);
    const ells = [...container.querySelectorAll('ellipse.cutlist-diagram-hole')];
    expect(ells).toHaveLength(3);
    ells.forEach((e, i) => {
      expect(Number(e.getAttribute('rx'))).toBeCloseTo(w.holes[i]!.r * sx, 6);
      expect(Number(e.getAttribute('ry'))).toBeCloseTo(w.holes[i]!.r * sy, 6);
    });
  });

  it('a blind hole\'s bottom line lies at the far end of its depth span (axis v), not at the mouth', () => {
    const rabbet = (from: 'min' | 'max') => ({ id: 'c1', face: 'width' as const, from, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 });
    for (const [from, key, at] of [['max', 'width|min', 'vmin'], ['min', 'width|min', 'vmax']] as const) {
      const hole = { ...pins, from, count: 1 };
      const w = buildDiagrams(createBoard({ length: 30, width: 11.25, thickness: 0.75, holes: [hole], cuts: [rabbet('min')] }), IMPERIAL).find((v) => v.key === key)!;
      const s = w.holeSides[0]!;
      expect(s.axis).toBe('v');
      expect(s.bottomAt).toBe(at);
      const { container } = render(<PartDiagram view={w} />);
      const { X, Y } = scales(container, w);
      const lines = container.querySelectorAll('line.cutlist-diagram-hole-side');
      expect(lines).toHaveLength(3);
      const b = lines[2]!;
      const yFar = Y(at === 'vmax' ? s.v[1] : s.v[0]);
      expect(Number(b.getAttribute('y1'))).toBeCloseTo(yFar, 6);
      expect(Number(b.getAttribute('y2'))).toBeCloseTo(yFar, 6);
      expect(Number(b.getAttribute('x1'))).toBeCloseTo(X(s.h[0]), 6);
      expect(Number(b.getAttribute('x2'))).toBeCloseTo(X(s.h[1]), 6);
      // The mouth is the OTHER end of the span.
      expect(Math.abs(Y(at === 'vmax' ? s.v[0] : s.v[1]) - yFar)).toBeGreaterThan(1e-3);
      cleanup();
    }
  });

  it('an end-grain hole seen across its axis: the bottom line lies at the far end along h', () => {
    for (const [from, at] of [['min', 'hmax'], ['max', 'hmin']] as const) {
      const hole = { id: 'e1', face: 'length' as const, from, diameter: 0.25, depth: 1, along: 'width' as const, alongFrom: 'min' as const, station: 5, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.375 };
      const rb = { id: 'c1', face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
      const w = buildDiagrams(createBoard({ length: 30, width: 11.25, thickness: 0.75, holes: [hole], cuts: [rb] }), IMPERIAL).find((v) => v.holeSides.length > 0)!;
      const s = w.holeSides[0]!;
      expect(s.axis).toBe('h');
      expect(s.bottomAt).toBe(at);
      const { container } = render(<PartDiagram view={w} />);
      const { X, Y } = scales(container, w);
      const b = container.querySelectorAll('line.cutlist-diagram-hole-side')[2]!;
      const xFar = X(at === 'hmax' ? s.h[1] : s.h[0]);
      expect(Number(b.getAttribute('x1'))).toBeCloseTo(xFar, 6);
      expect(Number(b.getAttribute('x2'))).toBeCloseTo(xFar, 6);
      expect(Number(b.getAttribute('y1'))).toBeCloseTo(Y(s.v[0]), 6);
      expect(Number(b.getAttribute('y2'))).toBeCloseTo(Y(s.v[1]), 6);
      expect(Math.abs(X(at === 'hmax' ? s.h[0] : s.h[1]) - xFar)).toBeGreaterThan(1e-3);
      cleanup();
    }
  });
});

describe('PartDiagram curves (curves spec §5.2)', () => {
  const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
  const rabbet = { id: 'r', face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
  const views = () => buildDiagrams(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [arch], cuts: [rabbet] }), IMPERIAL);

  it('draws the waste as a hatched polygon, one per curve, and its bench line once as an HTML note', () => {
    const v = views().find((x) => x.key === 'thickness|min')!;
    const { container } = render(<PartDiagram view={v} />);
    const polys = container.querySelectorAll('polygon.cutlist-diagram-curve');
    expect(polys).toHaveLength(1);
    expect(polys[0]!.getAttribute('fill')).toMatch(/^url\(#/);
    expect(polys[0]!.getAttribute('points')!.split(' ')).toHaveLength(v.curves[0]!.poly.length);
    const notes = container.querySelectorAll('p.cutlist-diagram-curve-note');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.textContent).toBe(v.curveNotes[0]!.text);
  });

  it('draws a sharp-vertex line across the part, scaled like the outline', () => {
    const v = views().find((x) => x.key === 'width|min')!;
    const { container } = render(<PartDiagram view={v} />);
    const lines = container.querySelectorAll('line.cutlist-diagram-curve-line');
    expect(lines).toHaveLength(2);
    const outline = container.querySelector('rect.cutlist-diagram-outline')!;
    const x0 = Number(outline.getAttribute('x'));
    const w = Number(outline.getAttribute('width'));
    expect(Number(lines[0]!.getAttribute('x1'))).toBeCloseTo(x0 + (3 / 30) * w, 6);
    expect(Number(lines[0]!.getAttribute('x2'))).toBeCloseTo(Number(lines[0]!.getAttribute('x1')), 9);
    expect(Math.abs(Number(lines[0]!.getAttribute('y2')) - Number(lines[0]!.getAttribute('y1')))).toBeCloseTo(Number(outline.getAttribute('height')), 6);
  });

  it('a vUp view flips the waste polygon\'s v like every other mark', () => {
    const v = views().find((x) => x.key === 'thickness|min')!;
    expect(v.vUp).toBe(true);
    const ys = (view: typeof v) => render(<PartDiagram view={view} />).container.querySelector('polygon.cutlist-diagram-curve')!
      .getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1]));
    const up = ys(v);
    const down = ys({ ...v, vUp: false });
    const sums = up.map((y, i) => y + down[i]!);
    for (const s of sums) expect(s).toBeCloseTo(sums[0]!, 6);
  });

  it('a part without curves renders no curve elements', () => {
    const { container } = render(<PartDiagram view={view(dado())} />);
    expect(container.querySelectorAll('.cutlist-diagram-curve, .cutlist-diagram-curve-line, .cutlist-diagram-curve-note')).toHaveLength(0);
  });

  it('four corners print one note', () => {
    const corners = defaultCorners({ length: 36, width: 20, thickness: 0.75 }).map((c, i) => ({ id: `k${i}`, ...c }));
    const [v] = buildDiagrams(createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners }), IMPERIAL);
    render(<PartDiagram view={v!} />);
    expect(screen.getAllByText('Round all four corners to a 1" radius')).toHaveLength(1);
  });
});
