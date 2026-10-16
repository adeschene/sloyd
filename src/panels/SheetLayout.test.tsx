import { render, screen } from '@testing-library/react';
import type { Nesting, PlacedPart, SheetStock } from '../document/document';
import { SheetLayout, PAD } from './SheetLayout';
import { DRAW_WIDTH } from './diagramScale';
import { labelWidth, labelHeight } from './diagramLabels';

/**
 * The first tests this component has had.
 *
 * `fitLabel`'s ladder is pinned in `diagramLabels.fitLabel.test.ts`, which is
 * pure arithmetic and knows nothing about parts. What was untested until
 * follow-up 161 is the WIRING — which fact this component feeds the ladder,
 * and what each tier actually renders. A unit test of the ladder passes just
 * as happily when the component hands it the wrong flag.
 */
// `rotate: 'free'` rather than 'grain', and not incidentally: the packer only
// ever turns a part under free rotation, so a turned part cannot exist on a
// grain-locked sheet. Kerf lives on the DOCUMENT's `stock`, not here.
const STOCK: SheetStock = { length: 96, width: 48, rotate: 'free' };
const SCALE = DRAW_WIDTH / STOCK.length;

// Three parts, ONE rectangle size, chosen so the size alone decides nothing:
// what tier each lands on is a function of its own strings and its `turned`
// flag. The inner width fits SHORT_DIMS by one unit and nothing longer.
const SHORT_DIMS = '24" × 18"';
const TURNED_DIMS = '24" × 18" turned'; // what nesting.ts writes for a turned part
const LONG_DIMS = '24-1/2" × 18-3/4"';

const INNER_W = labelWidth(SHORT_DIMS) + 1;
const PART_W = (INNER_W + 2 * PAD) / SCALE;
// Room for two lines, so height never forces the demotion under test.
const PART_H = (labelHeight() * 2 + 1 + 2 * PAD) / SCALE;

const part = (over: Partial<PlacedPart>): PlacedPart => ({
  boardId: 'b', name: 'Part', x: 0, y: 0, w: PART_W, h: PART_H,
  turned: false, dims: SHORT_DIMS, ...over,
});

const nesting = (parts: PlacedPart[]): Nesting => ({
  sheets: [{ parts }],
  unplaceable: [],
  label: '1 sheet (96" × 48")',
  sheet: '96" × 48"',
});

const draw = (parts: PlacedPart[]) =>
  render(<SheetLayout nesting={nesting(parts)} stock={STOCK} />);

describe('SheetLayout label tiers', () => {
  it('draws both lines when the rectangle holds them', () => {
    draw([part({ boardId: 'b1', name: 'Shelf' })]);

    expect(screen.getByText('Shelf')).toBeInTheDocument();
    expect(screen.getByText(SHORT_DIMS)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('draws the name alone for an UNTURNED part whose dimension line will not fit', () => {
    // The `name` tier, still reachable and still correct: no dimensions are
    // printed, but nothing about the rectangle is ambiguous either.
    //
    // THIS IS THE TEST THAT BOUNDS THE CHANGE. A demotion applied to every
    // part rather than only to turned ones turns it red; without it, a
    // mutation that ignores the flag and always skips the `name` rung passes
    // every other assertion in this file.
    draw([part({ boardId: 'b2', name: 'Back', dims: LONG_DIMS })]);

    expect(screen.getByText('Back')).toBeInTheDocument();
    expect(screen.queryByText(LONG_DIMS)).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  // ---- Follow-up 161 -------------------------------------------------------
  it('demotes a TURNED part to an index rather than printing a bare name', () => {
    // Same rectangle as the test above. The only difference is `turned`, and
    // the seven characters the word costs `dims` (follow-up 92) — which is
    // exactly what pushes it out of `full` and onto the rung 161 is about.
    draw([part({ boardId: 'b3', name: 'Side', turned: true, dims: TURNED_DIMS })]);

    // The name is NOT drawn in the rectangle; a number is.
    expect(screen.queryByText('Side')).not.toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    // And the key entry carries all three things the bare name dropped:
    // the name, the dimensions, and the word.
    expect(screen.getByRole('listitem')).toHaveTextContent(`1. Side — ${TURNED_DIMS}`);
  });

  it('leaves a turned part alone when its rectangle holds the whole label', () => {
    // The flag must not demote a part that can print everything — otherwise
    // every turned part on a sheet becomes a number.
    const wide = (labelWidth(TURNED_DIMS) + 1 + 2 * PAD) / SCALE;
    draw([part({ boardId: 'b4', name: 'Side', turned: true, dims: TURNED_DIMS, w: wide })]);

    expect(screen.getByText('Side')).toBeInTheDocument();
    expect(screen.getByText(TURNED_DIMS)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('numbers only the parts that reached the index tier, in order', () => {
    // Two demoted parts either side of one that keeps its name: the key list
    // must read 1, 2 — not the parts' positions on the sheet. Pins that 161's
    // new route into `index` feeds the same counter the width-driven route
    // does, rather than opening a second one.
    draw([
      part({ boardId: 'b5', name: 'Left', turned: true, dims: TURNED_DIMS }),
      part({ boardId: 'b6', name: 'Back', dims: LONG_DIMS, x: 20 }),
      part({ boardId: 'b7', name: 'Right', turned: true, dims: TURNED_DIMS, x: 40 }),
    ]);

    expect(screen.getByText('Back')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      `1. Left — ${TURNED_DIMS}`,
      `2. Right — ${TURNED_DIMS}`,
    ]);
  });
});

/**
 * Fu 96: a part too small to hold even its index number (a 1-1/2" rip on a sheet, any part on a 1×2 board) used to draw
 * the number anyway, overflowing its rectangle. It becomes a CALLOUT: the number in a row just outside the drawing's
 * nearer long edge, with a leader to the part, and its key entry as before. The sheet's own rectangle never moves.
 */
describe('callouts for parts too small for their number (fu 96)', () => {
  const H = STOCK.width * SCALE;
  // A rip whose rectangle cannot hold a label's height: 1-1/2" is ~15.6 units against labelHeight() + 2 * PAD.
  const strip = (over: Partial<PlacedPart>) => part({ name: 'Cleat', dims: '24" × 1-1/2"', w: 24, h: 1.5, ...over });
  const svg = () => document.querySelector('svg')!;
  const leaders = () => [...document.querySelectorAll('line.cutlist-layout-leader')];
  const textAt = (n: string) => [...document.querySelectorAll('svg text')].filter((t) => t.textContent === n);

  it('puts a number below the sheet for a part in its lower half, with a leader to the part', () => {
    draw([strip({ y: 40 })]);
    const [, y0, , vh] = svg().getAttribute('viewBox')!.split(' ').map(Number);
    expect(y0).toBe(0);
    expect(vh).toBeGreaterThan(H);
    const [label] = textAt('1');
    expect(Number(label.getAttribute('y'))).toBeGreaterThan(H);
    expect(leaders()).toHaveLength(1);
    const l = leaders()[0];
    // From the part's near (bottom) edge, at its centre, to the number.
    expect(Number(l.getAttribute('x1'))).toBeCloseTo((0 + 24 / 2) * SCALE);
    expect(Number(l.getAttribute('y1'))).toBeCloseTo((40 + 1.5) * SCALE);
    expect(Number(l.getAttribute('x2'))).toBeCloseTo(Number(label.getAttribute('x')));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1. Cleat — 24" × 1-1/2"']);
  });

  it('puts it above the sheet for a part in its upper half', () => {
    draw([strip({ y: 2 })]);
    const [, y0, , vh] = svg().getAttribute('viewBox')!.split(' ').map(Number);
    expect(y0).toBeLessThan(0);
    expect(y0 + vh).toBe(H);
    expect(Number(textAt('1')[0].getAttribute('y'))).toBeLessThan(0);
    expect(Number(leaders()[0].getAttribute('y1'))).toBeCloseTo(2 * SCALE);
  });

  it('leaves a sheet with no callouts exactly as it was: no row, no leader', () => {
    draw([part({})]);
    expect(svg().getAttribute('viewBox')).toBe(`0 0 ${DRAW_WIDTH} ${H}`);
    expect(leaders()).toHaveLength(0);
  });

  it('keeps each leader on its own number when a crowded row shifts them (fu 71)', () => {
    // Three strips side by side, each narrower than three numbers' width: packRow must cascade them.
    const w = 0.5;
    draw([0, 1, 2].map((i) => strip({ boardId: `s${i}`, name: `Rip ${i}`, x: 10 + i * w, y: 20, w, h: 24 })));
    expect(leaders()).toHaveLength(3);
    const xs = ['1', '2', '3'].map((n) => Number(textAt(n)[0].getAttribute('x')));
    leaders().forEach((l, i) => {
      expect(Number(l.getAttribute('x1'))).toBeCloseTo((10 + i * w + w / 2) * SCALE);
      expect(Number(l.getAttribute('x2'))).toBeCloseTo(xs[i]);
    });
    // Measured, not merely ordered: no two numbers' boxes overlap.
    for (let i = 1; i < 3; i += 1) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(labelWidth(String(i + 1)));
  });
});
