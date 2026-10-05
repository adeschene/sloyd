import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { PartsList } from './PartsList';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

/** 'Board', 'Board (1)', 'Board (2)', nothing selected, list rendered. */
const threeParts = () => {
  act(() => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    useStore.getState().selectBoard(null);
  });
  render(<PartsList />);
  return useStore.getState().doc.boards.map((b) => b.id);
};
const ids = () => useStore.getState().selectedIds;

describe('PartsList selection', () => {
  it('a plain click selects just that part', async () => {
    const [, b] = threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.click(screen.getByRole('button', { name: 'Board (1)' }));
    expect(ids()).toEqual([b]);
  });

  it('Shift-click, Ctrl-click and Cmd-click each toggle a part', async () => {
    const [a, b, c] = threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: 'Board (2)' }));
    await user.keyboard('{/Shift}');
    expect(ids()).toEqual([a, c]);
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.keyboard('{/Control}');
    expect(ids()).toEqual([c]);
    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('button', { name: 'Board (1)' }));
    await user.keyboard('{/Meta}');
    expect(ids()).toEqual([c, b]);
  });

  it('marks every selected row, and only those', () => {
    const [a, , c] = threeParts();
    act(() => {
      useStore.getState().toggleSelected(a);
      useStore.getState().toggleSelected(c);
    });
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Board' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Board (1)' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Board (1)' })).not.toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Board (2)' })).toHaveAttribute('aria-pressed', 'true');
  });
});
