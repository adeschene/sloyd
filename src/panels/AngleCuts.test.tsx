import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { AngleCut, Board } from '../document/document';
import { Properties } from './Properties';

const leg = (over: Partial<Board> = {}) => createBoard({ id: 'leg', name: 'Leg', length: 28, width: 2, thickness: 2, ...over });
const open = (b: Board) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards: [b] });
  useStore.getState().selectBoard('leg');
  render(<Properties />);
};
const cuts = () => (useStore.getState().doc.boards[0] as Board).angleCuts;

describe('the Angles section', () => {
  it('adds a taper and edits it in shop numbers', async () => {
    const user = userEvent.setup();
    open(leg());
    await user.click(screen.getByRole('button', { name: '+ Add taper' }));
    expect(screen.getByText(/^Taper 1\/2" off the width face \(min side\)/)).toBeInTheDocument();
    const start = screen.getByLabelText('Starts');
    await user.clear(start); await user.type(start, '20{Enter}');
    expect(cuts()[0]!.points).toEqual([[0, 0.5], [20, 0]]);
  });
  it('refuses a removal larger than the face, and keeps the stored value', async () => {
    const user = userEvent.setup();
    open(leg());
    await user.click(screen.getByRole('button', { name: '+ Add taper' }));
    const amount = screen.getByLabelText('Removes at that end');
    await user.clear(amount); await user.type(amount, '3{Enter}');
    expect(cuts()[0]!.points[0]![1]).toBe(0.5);
  });
  it('notes a taper that removes nothing at this size', () => {
    const c: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0], [5, -1]] };
    open(leg({ angleCuts: [c] }));
    expect(screen.getByText('This taper removes nothing at this size.')).toBeInTheDocument();
  });
  it('shows a hand-edited miter as its line with a remove button and no controls', () => {
    const c: AngleCut = { id: 'a1', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0], [2, 2]] };
    open(leg({ angleCuts: [c] }));
    expect(screen.getByText(/^Miter 45\.0°/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove angle cut/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Starts')).toBeNull();
  });
});
