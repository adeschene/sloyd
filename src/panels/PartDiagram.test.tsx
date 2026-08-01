import { render, screen } from '@testing-library/react';
import { buildDiagrams, createBoard } from '../document/document';
import type { Cut } from '../document/document';
import { PartDiagram } from './PartDiagram';

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

  it('keeps the first leader label clear of the outline AND the far label, when there is a far cut', () => {
    // Follow-up 64's guard test only ever rendered a near-only cut (FAR = 0),
    // so it never actually exercised the far-label clearance it claimed. A
    // far cut pushes the leader stack down by FAR + GAP past the outline; this
    // pins that the leader row clears the far depth label too, not just the
    // outline edge.
    const { container } = render(<PartDiagram view={view(dado({ from: 'max' }))} />);
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const bottom = Number(outline.getAttribute('y')) + Number(outline.getAttribute('height'));
    const farLabel = container.querySelector('.cutlist-diagram-depth')!;
    const farLabelBottom = Number(farLabel.getAttribute('y')) + 5; // glyph descent
    const leaderLabel = container.querySelector('.cutlist-diagram-leader text')!;
    const leaderTop = Number(leaderLabel.getAttribute('y')) - 15;
    expect(leaderTop).toBeGreaterThan(bottom);
    expect(leaderTop).toBeGreaterThan(farLabelBottom);
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
    const depthLabels = [...container.querySelectorAll('.cutlist-diagram-depth')];
    // The overall-width label is the one NOT positioned by a cut's band centre.
    const vLabel = depthLabels.find((el) => el.getAttribute('text-anchor') !== 'middle')!;
    expect(Number(vLabel.getAttribute('x'))).toBeCloseTo(right + 12, 10);
    expect(vLabel.getAttribute('dominant-baseline')).toBe('middle');
  });
});
