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
});
