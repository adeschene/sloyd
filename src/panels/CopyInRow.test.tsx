import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { Properties } from './Properties';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

/** One flat 24 x 3-1/2 x 3/4 part at the origin, selected. Its Z extent is 3-1/2. */
const onePart = () => {
  act(() => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0]!.id;
    useStore.getState().updateBoard(id, { length: 24, width: 3.5, thickness: 0.75, position: [0, 0, 0] });
    useStore.getState().selectBoard(id);
  });
  render(<Properties />);
};
const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Copy in a row…' }));

describe('Copy in a row', () => {
  it('summarises the row as values change, and Apply makes it', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    const count = screen.getByRole('spinbutton', { name: 'Count' });
    await user.clear(count);
    await user.type(count, '4');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    const gap = screen.getByRole('textbox', { name: 'Gap' });
    await user.clear(gap);
    await user.type(gap, '1/2{Enter}');
    expect(screen.getByText(/4 in the row: 3 copies, gap 1\/2", row 15-1\/2" long/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(useStore.getState().doc.boards.map((b) => b.position[2])).toEqual([0, 4, 8, 12]);
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('refuses a fit with no room, with the reason, and enables Apply when the count drops', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    await user.click(screen.getByRole('radio', { name: 'Fit across' }));
    const count = screen.getByRole('spinbutton', { name: 'Count' });
    await user.clear(count);
    await user.type(count, '4');
    const across = screen.getByRole('textbox', { name: 'Across' });
    await user.clear(across);
    await user.type(across, '10{Enter}');
    expect(screen.getByText(/Not enough room/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await user.clear(count);
    await user.type(count, '2');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('switching modes shows the new modes own value, not the old draft', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    const gap = screen.getByRole('textbox', { name: 'Gap' });
    await user.clear(gap);
    await user.type(gap, '1/2');
    await user.click(screen.getByRole('radio', { name: 'Fit across' }));
    expect(screen.getByRole('textbox', { name: 'Across' })).toHaveValue('7"');
    await user.click(screen.getByRole('radio', { name: 'Gap' }));
    expect(screen.getByRole('textbox', { name: 'Gap' })).toHaveValue('1/2"');
  });

  it('Cancel adds no undo entry and makes nothing', async () => {
    onePart();
    const user = userEvent.setup();
    const past = useStore.getState().past.length;
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useStore.getState().past.length).toBe(past);
    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('a selection change closes and resets the form', async () => {
    onePart();
    act(() => useStore.getState().addBoard());
    const [a] = useStore.getState().doc.boards.map((b) => b.id);
    act(() => useStore.getState().selectBoard(a!));
    const user = userEvent.setup();
    await open(user);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    act(() => useStore.getState().selectBoard(useStore.getState().doc.boards[1]!.id));
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('the group panel offers it too', () => {
    act(() => {
      useStore.getState().addBoard();
      useStore.getState().addBoard();
      useStore.getState().selectAll();
    });
    render(<Properties />);
    expect(screen.getByRole('button', { name: 'Copy in a row…' })).toBeInTheDocument();
  });
});
