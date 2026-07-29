import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { Properties } from './Properties';

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(reset);

describe('Properties', () => {
  it('adds no undo history entry for a field that is focused and blurred untouched', async () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().selectBoard(id);
    render(<Properties />);

    const before = useStore.getState().past.length;
    const length = screen.getByLabelText('Length');
    await userEvent.click(length);
    await userEvent.tab();

    expect(useStore.getState().past.length).toBe(before);
  });

  it('resets an invalid field when the selected board changes, even if the value is identical', async () => {
    useStore.getState().addBoard();
    const boardA = useStore.getState().doc.boards[0].id;
    useStore.getState().addBoard();
    const boardB = useStore.getState().doc.boards[1].id;
    // Both boards get the default length (24") since addBoard reuses the
    // previous board's dimensions — the effect's [value, precision] deps
    // will not change when switching between them.
    expect(useStore.getState().doc.boards[0].length).toBe(
      useStore.getState().doc.boards[1].length,
    );

    useStore.getState().selectBoard(boardA);
    render(<Properties />);

    const length = screen.getByLabelText('Length');
    await userEvent.clear(length);
    await userEvent.type(length, 'banana');
    await userEvent.tab();
    expect(length).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      useStore.getState().selectBoard(boardB);
    });

    const lengthAfter = screen.getByLabelText('Length') as HTMLInputElement;
    expect(lengthAfter.value).toBe('24"');
    expect(lengthAfter).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
