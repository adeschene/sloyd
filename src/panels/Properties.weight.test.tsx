import { render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { CustomMaterial, Definition, Instance, SloydDocument } from '../document/document';
import { Properties } from './Properties';

/** Weight spec §5.2: a read-only Weight line for the selection. */
const ash: CustomMaterial = { id: 'm-s-ash00001', label: 'Ash', color: '#d8c8a0', kind: 'solid' };
const oak = createBoard({ id: 'o', name: 'Shelf', material: 'oak', length: 24, width: 6, thickness: 0.75 }); // 108 in³ · 44/1728 = 2.75 lb
const pine = createBoard({ id: 'p', name: 'Cleat', material: 'pine', length: 24, width: 6, thickness: 0.75 }); // 108 in³ · 28/1728 = 1.75 lb
const rail = createBoard({ id: 'a', name: 'Rail', material: ash.id, length: 24, width: 6, thickness: 0.75 });
const load = (doc: Partial<SloydDocument>) => useStore.getState().replaceDocument({ ...createDocument('W'), ...doc });
const weight = () => screen.getByLabelText('Weight').textContent;

describe('Properties: the selection weight (weight spec §5.2)', () => {
  it('one part', () => {
    load({ boards: [oak, pine] });
    useStore.getState().selectBoard('o');
    render(<Properties />);
    expect(weight()).toBe('about 2.8 lb');
  });
  it('two parts: their sum', () => {
    load({ boards: [oak, pine] });
    useStore.getState().selectBoard('o');
    useStore.getState().toggleSelected('p');
    render(<Properties />);
    expect(weight()).toBe('about 4.5 lb');
  });
  it('an assembly: its parts', () => {
    const d1: Definition = { id: 'd1', boards: [oak, pine], instances: [], hardware: [] };
    const i1: Instance = { id: 'i1', name: 'Frame', definition: 'd1', position: [0, 0, 0], rotation: 0 };
    load({ boards: [], instances: [i1], definitions: [d1] });
    useStore.getState().selectBoard('i1');
    render(<Properties />);
    expect(weight()).toBe('about 4.5 lb');
  });
  it('a part with no density: not known; beside oak: partial', () => {
    load({ boards: [oak, rail], materials: [ash] });
    useStore.getState().selectBoard('a');
    const { unmount } = render(<Properties />);
    expect(weight()).toBe('not known');
    unmount();
    useStore.getState().toggleSelected('o');
    render(<Properties />);
    expect(weight()).toBe('about 2.8 lb, not counting Ash');
  });
});
