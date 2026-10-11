import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { Properties } from './Properties';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

/** Opens the action row's More ▾ (ui-polish spec §4.2). */
const openMore = () => userEvent.click(screen.getByRole('button', { name: 'More' }));

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
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await openMore();
  await user.click(screen.getByRole('button', { name: 'Copy in a row…' }));
};

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

  // Follow-up 218 (I1): Apply must not use a value other than the field shows.
  // Apply is clicked DIRECTLY, without Enter: the blur commit (refused here)
  // lands before the click, and a refusal disables Apply.
  it('a refused entry clicked straight to Apply makes nothing, and Apply stays disabled', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    const gap = screen.getByRole('textbox', { name: 'Gap' });
    await user.clear(gap);
    await user.type(gap, '-1/2');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(useStore.getState().doc.boards).toHaveLength(1);
    expect(gap).toHaveValue('-1/2');
    expect(gap).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('a valid entry clicked straight to Apply makes the row with the typed value', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    const gap = screen.getByRole('textbox', { name: 'Gap' });
    await user.clear(gap);
    await user.type(gap, '1/2');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(useStore.getState().doc.boards.map((b) => b.position[2])).toEqual([0, 4]);
  });

  it('a mode switch away from a refused draft re-enables Apply', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    const gap = screen.getByRole('textbox', { name: 'Gap' });
    await user.clear(gap);
    await user.type(gap, 'abc{Enter}');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Pitch' }));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  // I2: a typed value equal to the live default is still the person's value.
  // 24 is the +X default pitch (s = 24); typing it must pin it, so turning the
  // row to +Z (s = 3-1/2) keeps pitch 24 rather than following the default.
  it('a typed pitch equal to the default sticks across a direction change', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    await user.click(screen.getByRole('radio', { name: 'Pitch' }));
    const pitch = screen.getByRole('textbox', { name: 'Pitch' });
    await user.clear(pitch);
    await user.type(pitch, '24{Enter}');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    expect(screen.getByRole('textbox', { name: 'Pitch' })).toHaveValue('24"');
    expect(screen.getByText(/2 in the row: 1 copy, gap 20-1\/2", row 27-1\/2" long/)).toBeInTheDocument();
  });

  // I3: key={mode}. The new mode's value (Fit across's default 2·s = 7) equals
  // the old mode's committed value (Gap 7), so without the remount the value
  // prop never changes and the refused 'abc' draft and its error survive.
  it('a refused draft does not survive a mode switch to an equal value', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    const gap = screen.getByRole('textbox', { name: 'Gap' });
    await user.clear(gap);
    await user.type(gap, '7{Enter}');
    await user.clear(gap);
    await user.type(gap, 'abc');
    await user.tab();
    expect(gap).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('radio', { name: 'Fit across' }));
    const across = screen.getByRole('textbox', { name: 'Across' });
    expect(across).toHaveValue('7"');
    expect(across).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // M4: spec §3, the count's inline error.
  it('marks the count invalid while it is refused', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    const count = screen.getByRole('spinbutton', { name: 'Count' });
    expect(count).toHaveAttribute('aria-invalid', 'false');
    await user.clear(count);
    await user.type(count, '1');
    expect(count).toHaveAttribute('aria-invalid', 'true');
    await user.clear(count);
    await user.type(count, '3');
    expect(count).toHaveAttribute('aria-invalid', 'false');
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

  it('the group panel offers it too', async () => {
    act(() => {
      useStore.getState().addBoard();
      useStore.getState().addBoard();
      useStore.getState().selectAll();
    });
    render(<Properties />);
    await openMore();
    expect(screen.getByRole('button', { name: 'Copy in a row…' })).toBeInTheDocument();
  });
});
