import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import { assemblyDoc } from '../document/treeFixtures';
import type { PlacedDimension, SloydDocument } from '../document/types';
import { DimensionsList } from './DimensionsList';

const st = () => useStore.getState();
const F0 = { length: 0, width: 0, thickness: 0 } as const;

/** Origin to the min corner of a flat part at y = 29: a Y dimension of exactly 29 in, computed by hand. */
function docWith(dims: PlacedDimension[], extra: Partial<SloydDocument> = {}): SloydDocument {
  const top = createBoard({ id: 'r1', name: 'Top', position: [0, 29, 0] });
  return { ...createDocument('Test'), boards: [top], dimensions: dims, ...extra };
}
const toTop: PlacedDimension = { id: 'd1', a: { at: [0, 0, 0] }, b: { part: 'r1', frac: F0 }, axis: 'y' };

beforeEach(() => st().replaceDocument(docWith([toTop])));

describe('DimensionsList (placed-dimensions spec §5)', () => {
  it('prints axis, value and what it spans', () => {
    render(<DimensionsList />);
    expect(screen.getByRole('listitem')).toHaveTextContent('Y 29" a point to Top');
  });

  it('names a nested part by its display path', () => {
    const doc = assemblyDoc();
    st().replaceDocument({ ...doc, dimensions: [{ id: 'd1', a: { at: [0, 0, 0] }, b: { part: 'i1/b1', frac: F0 }, axis: 'x' }] });
    render(<DimensionsList />);
    expect(screen.getByRole('listitem')).toHaveTextContent('a point to Drawer › Side');
  });

  it('says (part deleted) for a detached row, which still deletes', async () => {
    st().replaceDocument(docWith([{ ...toTop, b: { part: 'gone', frac: F0 } }]));
    render(<DimensionsList />);
    expect(screen.getByRole('listitem')).toHaveTextContent('Y a point to a deleted part (part deleted)');
    await userEvent.click(screen.getByRole('button', { name: 'Delete dimension' }));
    expect(st().doc.dimensions).toHaveLength(0);
  });

  it('says (hidden) when an anchor part is hidden', () => {
    render(<DimensionsList />);
    expect(screen.getByRole('listitem')).not.toHaveTextContent('(hidden)');
    act(() => st().setHidden('r1', true));
    expect(screen.getByRole('listitem')).toHaveTextContent('(hidden)');
  });

  it('hover sets hoveredDimension and leaving clears it', async () => {
    render(<DimensionsList />);
    const row = screen.getByRole('listitem');
    await userEvent.hover(row);
    expect(st().hoveredDimension).toBe('d1');
    await userEvent.unhover(row);
    expect(st().hoveredDimension).toBeNull();
  });

  it('delete removes the dimension in one undo entry', async () => {
    render(<DimensionsList />);
    await userEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Delete dimension' }));
    expect(st().doc.dimensions).toHaveLength(0);
    act(() => st().undo());
    expect(st().doc.dimensions).toHaveLength(1);
  });
});
