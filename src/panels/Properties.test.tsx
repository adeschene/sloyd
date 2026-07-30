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

describe('the part name field', () => {
  const selectFirstBoard = () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().selectBoard(id);
    return id;
  };

  it('commits a new name on blur', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Front apron');
    await userEvent.tab();

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name)
      .toBe('Front apron');
  });

  it('commits on Enter without needing a blur', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Stretcher{Enter}');

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name)
      .toBe('Stretcher');
  });

  it('does not write to the document while typing', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Leg');

    // Still the old name: nothing is committed until blur or Enter.
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name)
      .toBe('Board');
  });

  it('reverts an emptied name and leaves the document untouched', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().doc;

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.tab();

    expect(name.value).toBe('Board');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name).toBe('Board');
    // Untouched means the same object, not merely an equal one.
    expect(useStore.getState().doc).toBe(before);
  });

  it('reverts a whitespace-only name', async () => {
    selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, '   ');
    await userEvent.tab();

    expect(name.value).toBe('Board');
  });

  it('adds no undo entry when a name is cleared and blurred', async () => {
    selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().past.length;

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.tab();

    expect(useStore.getState().past.length).toBe(before);
  });

  it('adds no undo entry when the field is focused and blurred untouched', async () => {
    selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().past.length;

    await userEvent.click(screen.getByLabelText('Part name'));
    await userEvent.tab();

    expect(useStore.getState().past.length).toBe(before);
  });

  it('adds exactly one undo entry for a rename', async () => {
    selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().past.length;

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Rail');
    await userEvent.tab();

    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('reverts on Escape', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Discarded{Escape}');

    expect(name.value).toBe('Board');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name).toBe('Board');
  });

  it('shows the deduplicated name when renaming onto an existing one', async () => {
    useStore.getState().addBoard();               // 'Board'
    useStore.getState().addBoard();               // 'Board (1)'
    const second = useStore.getState().doc.boards[1].id;
    useStore.getState().updateBoard(useStore.getState().doc.boards[0].id, { name: 'Leg' });
    useStore.getState().selectBoard(second);
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Leg');
    await userEvent.tab();

    expect(useStore.getState().doc.boards.find((b) => b.id === second)!.name).toBe('Leg (1)');
    // The field must show what was stored, not what was typed.
    expect(name.value).toBe('Leg (1)');
  });

  it('re-shows the same deduplicated name with no document write when the dedup result is already the stored name', async () => {
    useStore.getState().addBoard();               // 'Board'
    useStore.getState().addBoard();               // 'Board (1)'
    const second = useStore.getState().doc.boards[1].id;
    useStore.getState().updateBoard(useStore.getState().doc.boards[0].id, { name: 'Leg' });
    useStore.getState().selectBoard(second);
    render(<Properties />);

    // First commit: 'Leg' collides with the other board, so it dedups to
    // 'Leg (1)' and is stored.
    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Leg');
    await userEvent.tab();
    expect(name.value).toBe('Leg (1)');

    const before = useStore.getState().doc;
    const beforePast = useStore.getState().past.length;

    // Second commit: typing 'Leg' again dedups to 'Leg (1)' again — this
    // time the board's own current name, so `value` never changes and no
    // re-render fires the adopt-external-changes effect. Only onCommit's
    // return value can correct the display.
    await userEvent.clear(name);
    await userEvent.type(name, 'Leg');
    await userEvent.tab();

    expect(name.value).toBe('Leg (1)');
    // No-op: the document must not have been touched at all.
    expect(useStore.getState().doc).toBe(before);
    expect(useStore.getState().past.length).toBe(beforePast);
  });

  it('adopts an external change (undo) when the field is not focused', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Rail');
    await userEvent.tab();
    expect(name.value).toBe('Rail');

    act(() => { useStore.getState().undo(); });

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name).toBe('Board');
    expect((screen.getByLabelText('Part name') as HTMLInputElement).value).toBe('Board');
  });
});

describe('the grain control', () => {
  const selectFirstBoard = () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().selectBoard(id);
    return id;
  };

  it('offers exactly two grain directions', () => {
    selectFirstBoard();
    render(<Properties />);
    const grain = screen.getByLabelText('Grain') as HTMLSelectElement;
    expect([...grain.options].map((o) => o.textContent)).toEqual(['Along X', 'Along Z']);
  });

  it('commits a change of grain direction', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Grain'), '90');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.rotation).toBe(90);
  });

  it('shows the stored direction', () => {
    const id = selectFirstBoard();
    act(() => { useStore.getState().updateBoard(id, { rotation: 90 }); });
    render(<Properties />);
    expect((screen.getByLabelText('Grain') as HTMLSelectElement).value).toBe('90');
  });

  it('still commits the standing checkbox', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    await userEvent.click(screen.getByLabelText(/Standing/));
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.standing).toBe(true);
  });
});
