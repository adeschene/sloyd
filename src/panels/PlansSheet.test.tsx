import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import { cabinetsDoc } from '../document/treeFixtures';
import { PlansSheet } from './PlansSheet';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('PlansSheet', () => {
  it('says so when there is nothing to draw', () => {
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByText('Nothing to draw yet.')).toBeInTheDocument();
  });

  it('draws the exploded view, the piece, then each assembly with its count', () => {
    act(() => useStore.getState().replaceDocument(cabinetsDoc()));
    render(<PlansSheet onClose={() => {}} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Exploded view', 'Cabinets', 'Cabinet × 3', 'Cabinet › Drawer × 4', 'Solo']);
  });

  it('notes mirrored copies', () => {
    const doc = cabinetsDoc();
    doc.instances = doc.instances.map((i) => (i.id === 'c2' ? { ...i, mirrored: true } : i));
    act(() => useStore.getState().replaceDocument(doc));
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Cabinet × 3 (one copy mirrored)' })).toBeInTheDocument();
  });

  it('re-draws the exploded figure at the sheet amount, apart from the viewport', () => {
    act(() => useStore.getState().replaceDocument({ ...createDocument('One'), boards: [createBoard()] }));
    render(<PlansSheet onClose={() => {}} />);
    const fig = screen.getByRole('img', { name: 'Exploded view' });
    expect(fig).toHaveAttribute('data-amount', '0.6');
    fireEvent.change(screen.getByRole('slider', { name: 'Explode' }), { target: { value: '0.2' } });
    expect(screen.getByRole('img', { name: 'Exploded view' })).toHaveAttribute('data-amount', '0.2');
    expect(useStore.getState().explode).toBe(0);
  });

  it('closes on Escape and takes focus on mount', () => {
    const onClose = vi.fn();
    render(<PlansSheet onClose={onClose} />);
    expect(document.activeElement).toHaveClass('plans-sheet');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('PlansSheet in metric (chunk 2)', () => {
  it('a metric document draws bare mm dimensions', () => {
    const doc = { ...createDocument('Metric'), units: { display: 'metric-mm' as const, precision: 16 }, boards: [createBoard({ length: 30, width: 12, thickness: 2 })] };
    act(() => useStore.getState().replaceDocument(doc));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    const labels = [...container.querySelectorAll('.plans-figure text')].map((t) => t.textContent!);
    expect(labels).toContain('762');
    expect(labels.some((t) => /^\d+$/.test(t))).toBe(true);
    expect(labels.join(' ')).not.toContain('"');
  });
});
