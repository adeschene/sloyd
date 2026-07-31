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

  it('does not write the stale text back over an external rename that lands mid-focus, and shows the external name after blur', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.click(name); // focus, type nothing

    act(() => {
      useStore.getState().updateBoard(id, { name: 'Renamed elsewhere' });
    });

    await userEvent.tab(); // blur, untouched

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name)
      .toBe('Renamed elsewhere');
    expect(name.value).toBe('Renamed elsewhere');
  });

  it('does not write the stale text back over an external rename that lands mid-focus, on Enter', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.click(name); // focus, type nothing

    act(() => {
      useStore.getState().updateBoard(id, { name: 'Renamed elsewhere' });
    });

    await userEvent.keyboard('{Enter}'); // untouched Enter

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name)
      .toBe('Renamed elsewhere');
  });

  it('adds no undo entry for an untouched Enter', async () => {
    selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().past.length;

    const name = screen.getByLabelText('Part name');
    await userEvent.click(name);
    await userEvent.keyboard('{Enter}');

    expect(useStore.getState().past.length).toBe(before);
  });
});

describe('the orientation controls', () => {
  const selectFirstBoard = () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().selectBoard(id);
    return id;
  };

  it('offers three postures', () => {
    selectFirstBoard();
    render(<Properties />);
    const posture = screen.getByLabelText('Posture') as HTMLSelectElement;
    expect([...posture.options].map((o) => o.textContent))
      .toEqual(['Flat', 'On edge', 'Upright']);
  });

  it('commits a posture change', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Posture'), 'upright');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.posture).toBe('upright');
  });

  it('commits a turn', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Turn'), '90');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.rotation).toBe(90);
  });

  it('offers three grain directions', () => {
    selectFirstBoard();
    render(<Properties />);
    const grain = screen.getByLabelText('Runs') as HTMLSelectElement;
    expect([...grain.options].map((o) => o.textContent))
      .toEqual(['Along length', 'Across width', 'Through thickness']);
  });

  it('commits a grain change', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Runs'), 'width');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.grain).toBe('width');
  });

  it('does not move the board when only the grain changes', async () => {
    const id = selectFirstBoard();
    const before = useStore.getState().doc.boards[0].position;
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Runs'), 'width');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.position).toEqual(before);
  });

  // Every "commits a change" test above starts from the default orientation
  // and drives the control, so it only proves writes reach the document — it
  // says nothing about whether the control's own displayed value tracks the
  // store. A control that commits correctly but displays wrongly (e.g. after
  // an undo, or after switching the selected board) would pass every test
  // above and still mislead the user. These set the store directly, to a
  // non-default value, and check what the select shows.
  it('shows the board\'s stored posture, not the default', () => {
    const id = selectFirstBoard();
    useStore.getState().updateBoard(id, { posture: 'upright' });
    render(<Properties />);
    expect((screen.getByLabelText('Posture') as HTMLSelectElement).value).toBe('upright');
  });

  it('shows the board\'s stored turn, not the default', () => {
    const id = selectFirstBoard();
    useStore.getState().updateBoard(id, { rotation: 90 });
    render(<Properties />);
    expect((screen.getByLabelText('Turn') as HTMLSelectElement).value).toBe('90');
  });

  it('shows the board\'s stored grain, not the default', () => {
    const id = selectFirstBoard();
    useStore.getState().updateBoard(id, { grain: 'thickness' });
    render(<Properties />);
    expect((screen.getByLabelText('Runs') as HTMLSelectElement).value).toBe('thickness');
  });

  // 'Through thickness' is meaningless for a sheet good — plywood's grain is
  // its face-veneer direction, which always lies in the sheet plane — so the
  // panel must not offer it for plywood or MDF.
  it('offers only two grain directions for plywood', () => {
    const id = selectFirstBoard();
    useStore.getState().updateBoard(id, { material: 'plywood' });
    render(<Properties />);
    const grain = screen.getByLabelText('Runs') as HTMLSelectElement;
    expect([...grain.options].map((o) => o.textContent))
      .toEqual(['Along length', 'Across width']);
  });

  it('offers only two grain directions for MDF', () => {
    const id = selectFirstBoard();
    useStore.getState().updateBoard(id, { material: 'mdf' });
    render(<Properties />);
    const grain = screen.getByLabelText('Runs') as HTMLSelectElement;
    expect([...grain.options].map((o) => o.textContent))
      .toEqual(['Along length', 'Across width']);
  });

  it('updates the grain options when the material changes to a sheet good', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    expect([...(screen.getByLabelText('Runs') as HTMLSelectElement).options])
      .toHaveLength(3);

    const materialSelect = document.querySelector('select[aria-labelledby="material-heading"]')!;
    await userEvent.selectOptions(materialSelect, 'plywood');

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.material).toBe('plywood');
    expect([...(screen.getByLabelText('Runs') as HTMLSelectElement).options].map((o) => o.textContent))
      .toEqual(['Along length', 'Across width']);
  });
});
