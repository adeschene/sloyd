import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument, worldParts } from '../document/document';
import type { SloydDocument } from '../document/document';
import { AlignSection } from './AlignSection';
import { EditLock } from './EditLock';

/** Align spec §6: the Align section of the multi-selection panel. */
const B = (id: string, name: string, x: number, y: number) => createBoard({ id, name, length: 10, width: 2, thickness: 1, position: [x, y, 0] });
const load = (boards: ReturnType<typeof B>[], selected: string[]) => act(() => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards } as SloydDocument);
  useStore.setState({ selectedIds: selected });
});
const pos = (id: string) => worldParts(useStore.getState().doc).find((b) => b.id === id)!.position;
const view = () => render(<EditLock><AlignSection /></EditLock>);

describe('AlignSection', () => {
  it('two selected: the heading, the anchor note, nine align buttons, no Space evenly', () => {
    load([B('a', 'Left side', 0, 0), B('b', 'Shelf', 3, 4)], ['a', 'b']);
    view();
    expect(screen.getByRole('heading', { name: 'Align' })).toBeInTheDocument();
    expect(screen.getByText('to Left side (selected first)')).toBeInTheDocument();
    for (const n of ['Align left (X)', 'Align centre (X)', 'Align right (X)', 'Align bottom (Y)', 'Align middle (Y)', 'Align top (Y)', 'Align back (Z)', 'Align centre (Z)', 'Align front (Z)']) {
      expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Space evenly along X' })).toBeNull();
  });

  it('the anchor is the first selected, and a click moves the others', () => {
    load([B('a', 'A', 0, 0), B('b', 'B', 3, 4)], ['b', 'a']);
    view();
    expect(screen.getByText('to B (selected first)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Align top (Y)' }));
    expect(pos('a')).toEqual([0, 4, 0]);
    expect(pos('b')).toEqual([3, 4, 0]);
  });

  it('three selected: Space evenly; a refusal shows, and a new selection clears it', () => {
    const tall = createBoard({ id: 'x', name: 'X', length: 10, width: 2, thickness: 20, position: [0, 1, 0] });
    load([B('a', 'A', 0, 0), tall, B('c', 'C', 0, 5)], ['a', 'x', 'c']);
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Space evenly along Y' }));
    expect(screen.getByRole('status')).toHaveTextContent("These parts don't fit between A and C along Y.");
    act(() => useStore.setState({ selectedIds: ['a', 'c', 'x'] }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('disabled while exploded', () => {
    load([B('a', 'A', 0, 0), B('b', 'B', 3, 4)], ['a', 'b']);
    act(() => useStore.getState().setExplode(0.5));
    view();
    expect(screen.getByRole('button', { name: 'Align left (X)' })).toBeDisabled();
    act(() => useStore.getState().setExplode(0));
  });
});
