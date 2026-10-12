import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument, taperCut } from '../document/document';
import type { AngleCut, Board } from '../document/document';
import { Properties } from './Properties';
import { AngleCuts } from './AngleCuts';

const leg = (over: Partial<Board> = {}) => createBoard({ id: 'leg', name: 'Leg', length: 28, width: 2, thickness: 2, ...over });
const open = (b: Board) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards: [b] });
  useStore.getState().selectBoard('leg');
  render(<Properties />);
};
const addMenu = async (user: ReturnType<typeof userEvent.setup>, item: string) => {
  await user.click(screen.getByRole('button', { name: '+ Add' }));
  await user.click(screen.getByRole('button', { name: item }));
};
const cuts = () => (useStore.getState().doc.boards[0] as Board).angleCuts;

describe('the Angles section', () => {
  it('adds a taper and edits it in shop numbers', async () => {
    const user = userEvent.setup();
    open(leg());
    await addMenu(user, 'Taper');
    expect(screen.getByText(/^Taper 1\/2" off the width face \(min side\)/)).toBeInTheDocument();
    const start = screen.getByLabelText('Starts');
    await user.clear(start); await user.type(start, '20{Enter}');
    expect(cuts()[0]!.points).toEqual([[0, 0.5], [20, 0]]);
  });
  it('refuses a removal larger than the face, and keeps the stored value', async () => {
    const user = userEvent.setup();
    open(leg());
    await addMenu(user, 'Taper');
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
  it('refuses a face change that would remove more than the new face', async () => {
    const user = userEvent.setup();
    open(leg({ width: 4, thickness: 1 }));
    act(() => useStore.getState().addAngleCuts('leg', [taperCut({ face: 'width', from: 'min', end: 'min', start: 21, amount: 1.5 })]));
    await user.selectOptions(screen.getByLabelText('Face'), 'Thickness face — min side');
    expect(cuts()[0]).toMatchObject({ face: 'width', from: 'min' });
    expect(cuts()[0]!.points[0]![1]).toBe(1.5);
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the thickness — reduce it first.');
  });
  it('keeps one hook order when a row\'s cut changes kind in place (taper → miter → taper)', () => {
    const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.5], [20, 0]] };
    const miter: AngleCut = { id: 'a1', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0], [2, 2]] };
    const { rerender } = render(<AngleCuts board={leg({ angleCuts: [taper] })} precision={16} />);
    expect(screen.getByLabelText('Starts')).toBeInTheDocument();
    rerender(<AngleCuts board={leg({ angleCuts: [miter] })} precision={16} />);
    expect(screen.getByText(/^Miter 45\.0°/)).toBeInTheDocument();
    rerender(<AngleCuts board={leg({ angleCuts: [taper] })} precision={16} />);
    expect(screen.getByLabelText('Starts')).toBeInTheDocument();
  });
});

describe('miters in the Angles section (spec §7, chunk 2)', () => {
  const rail = (over: Partial<Board> = {}) => leg({ length: 24, width: 2.5, thickness: 0.75, ...over });
  it('adds a miter from + Add ▾', async () => {
    const user = userEvent.setup();
    open(rail());
    await addMenu(user, 'Miter');
    expect(screen.getByText('Miter 45.0° across the width at the length max end')).toBeInTheDocument();
  });
  it('adds a miter at both ends as one undo entry (Review Focus 3)', async () => {
    const user = userEvent.setup();
    open(rail());
    const before = useStore.getState().past.length;
    await addMenu(user, 'Miter both ends');
    expect(cuts()).toHaveLength(2);
    expect(useStore.getState().past.length).toBe(before + 1);
    act(() => useStore.getState().undo());
    expect(cuts()).toHaveLength(0);
  });
  it('still adds a taper from the menu', async () => {
    const user = userEvent.setup();
    open(rail());
    await addMenu(user, 'Taper');
    expect(screen.getByText(/^Taper /)).toBeInTheDocument();
  });
  it('edits the angle exactly: 22.5 stores run × tan, 45 stores run', async () => {
    const user = userEvent.setup();
    open(rail());
    await addMenu(user, 'Miter');
    const angle = screen.getByLabelText('Angle');
    await user.clear(angle); await user.type(angle, '22.5{Enter}');
    expect(cuts()[0]!.points[1]).toEqual([2.5, 2.5 * Math.tan(Math.PI / 8)]);
    await user.clear(angle); await user.type(angle, '45{Enter}');
    expect(cuts()[0]!.points[1]).toEqual([2.5, 2.5]);
  });
  it('changing only the long-point side keeps depth === run (Review Focus 1)', async () => {
    const user = userEvent.setup();
    open(rail());
    await addMenu(user, 'Miter');
    await user.selectOptions(screen.getByLabelText('Long point'), 'max');
    expect(cuts()[0]).toMatchObject({ alongFrom: 'max', points: [[0, 0], [2.5, 2.5]] });
  });
  it('refuses switching across to a side whose depth would pass the length (Review Focus 2)', async () => {
    const user = userEvent.setup();
    open(rail({ length: 2 }));
    act(() => useStore.getState().addAngleCuts('leg', [{ kind: 'miter', face: 'length', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0], [0.75, 0.75]] }]));
    const stored = cuts()[0]!;
    await user.selectOptions(screen.getByLabelText('Across'), 'width');
    expect(cuts()[0]).toEqual(stored);
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the length — reduce the angle first.');
  });
  it('states a max the field accepts: 85 on a 24 x 2-1/2 rail reads 84.0 and 84.0 commits (fu 293)', async () => {
    const user = userEvent.setup();
    open(rail());
    await addMenu(user, 'Miter');
    const angle = screen.getByLabelText('Angle');
    await user.clear(angle); await user.type(angle, '85{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at most 84.0°');
    await user.clear(angle); await user.type(angle, '84.0{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(cuts()[0]!.points[1]![1]).toBeCloseTo(2.5 * Math.tan(84 * Math.PI / 180), 9);
  });
  it('withholds the miter presets on a part wider than long; a rail has all three (fu 296)', async () => {
    const user = userEvent.setup();
    open(leg({ length: 2, width: 3, thickness: 0.75 }));
    await user.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getByRole('button', { name: 'Taper' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Miter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Miter both ends' })).toBeNull();
  });
  it('offers Taper, Miter and Miter both ends on a 24 x 2-1/2 rail', async () => {
    const user = userEvent.setup();
    open(rail());
    await user.click(screen.getByRole('button', { name: '+ Add' }));
    for (const n of ['Taper', 'Miter', 'Miter both ends']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument();
  });
});
