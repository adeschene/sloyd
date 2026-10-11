import { render, screen } from '@testing-library/react';
import { createBoard, createDocument } from '../document/document';
import { PlanTrio, ExplodedFigure } from './PlanFigure';

// 2in shelves: the trio's scale is 752 / (30 + 12) ≈ 17.9 per inch (Task 7), so a 2in spacing is
// ≈ 35.8 drawn, room for a 2-char label (24.8 + 8 = 32.8). 1in spacings (17.9) would be dropped.
const slab = (y: number) => createBoard({ length: 30, width: 12, thickness: 2, position: [0, y, 0] });
const mortised = createBoard({
  length: 20, width: 4, thickness: 2,
  cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 8, width: 1, depth: 1, stopMin: 1, stopMax: 1 }],
});

describe('PlanTrio', () => {
  it('draws three views with overall and chain dimensions', () => {
    const { container } = render(<PlanTrio parts={[slab(0), slab(10), slab(20)]} precision={16} label="Shelf unit" />);
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
    const { container } = render(<PlanTrio parts={[mortised]} precision={16} label="Leg" />);
    expect(container.querySelector('path.plan-hidden')!.getAttribute('d')).toMatch(/M/);
  });

  it('lists a note when a chain is omitted', () => {
    // Thirteen 1in boards stacked: 13 chain segments > CHAIN_MAX.
    const parts = Array.from({ length: 13 }, (_, k) => createBoard({ length: 30, width: 12, thickness: 1, position: [0, k, 0] }));
    render(<PlanTrio parts={parts} precision={16} label="Stack" />);
    expect(screen.getAllByText(/Height chain omitted — too dense/).length).toBeGreaterThan(0);
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
