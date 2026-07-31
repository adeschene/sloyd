import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { formatLength } from '../units/length';
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

describe('cuts', () => {
  const renderWithBoard = () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().selectBoard(id);
    render(<Properties />);
    return id;
  };

  it('adds a cut and shows its controls', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    expect(screen.getByLabelText(/from the end/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cut width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/depth/i)).toBeInTheDocument();
  });

  it('never offers the face dimension as the across dimension', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    const across = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    const face = screen.getByLabelText(/cut into/i) as HTMLSelectElement;
    const offered = [...across.options].map((o) => o.value);
    expect(offered).not.toContain(face.value);
    expect(offered).toHaveLength(2);
  });

  it('moves across to a legal value when face takes its dimension', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    const across = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    await userEvent.selectOptions(screen.getByLabelText(/cut into/i), across.value);
    const after = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    expect(after.value).not.toBe((screen.getByLabelText(/cut into/i) as HTMLSelectElement).value);
    expect([...after.options].map((o) => o.value)).toContain(after.value);
  });

  it('refuses a depth past the board and does not commit it', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    const before = useStore.getState().doc.boards.find((b) => b.id === id)!.cuts[0].depth;
    const depth = screen.getByLabelText(/depth/i);
    await userEvent.clear(depth);
    await userEvent.type(depth, '4');
    await userEvent.tab();
    expect(screen.getByText(/must be at most/i)).toBeInTheDocument();
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.cuts[0].depth).toBe(before);
  });

  it('refuses a cut that would remove all the stock', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    // Full width of the position axis at full depth.
    await userEvent.clear(screen.getByLabelText(/from the end/i));
    await userEvent.type(screen.getByLabelText(/from the end/i), '0');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/cut width/i));
    await userEvent.type(screen.getByLabelText(/cut width/i), '24');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/depth/i));
    await userEvent.type(screen.getByLabelText(/depth/i), '3/4');
    await userEvent.tab();
    expect(screen.getByText(/would remove the whole board/i)).toBeInTheDocument();
  });

  it('labels a cut flush with the end a rabbet', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await userEvent.clear(screen.getByLabelText(/from the end/i));
    await userEvent.type(screen.getByLabelText(/from the end/i), '0');
    await userEvent.tab();
    expect(screen.getByText(/rabbet/i)).toBeInTheDocument();
  });

  it('removes a cut', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await userEvent.click(screen.getByRole('button', { name: /remove cut/i }));
    expect(screen.queryByLabelText(/depth/i)).not.toBeInTheDocument();
  });

  it('does not leak a whole-board-removal error across a selection change and back', async () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().addBoard();
    const otherId = useStore.getState().doc.boards[1].id;
    useStore.getState().selectBoard(id);
    render(<Properties />);

    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await userEvent.clear(screen.getByLabelText(/from the end/i));
    await userEvent.type(screen.getByLabelText(/from the end/i), '0');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/cut width/i));
    await userEvent.type(screen.getByLabelText(/cut width/i), '24');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/depth/i));
    await userEvent.type(screen.getByLabelText(/depth/i), '3/4');
    await userEvent.tab();
    expect(screen.getByText(/would remove the whole board/i)).toBeInTheDocument();

    act(() => { useStore.getState().selectBoard(otherId); });
    act(() => { useStore.getState().selectBoard(id); });

    expect(screen.queryByText(/would remove the whole board/i)).not.toBeInTheDocument();
  });

  it('keeps the width field satisfiable after "Cut into" moves the position axis to a much smaller dimension', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    // The default cut's position axis is `length` (24"); switching the face
    // to "End" (`length`) moves the position axis to `thickness` (0.75") —
    // a naive clamp of the old offset/width into the new axis's range can
    // leave `width`'s max at zero or negative, an unsatisfiable field.
    await userEvent.selectOptions(screen.getByLabelText(/cut into/i), 'length');

    const width = screen.getByLabelText(/cut width/i);
    await userEvent.clear(width);
    await userEvent.type(width, '1/2');
    await userEvent.tab();

    expect(screen.queryByText(/must be at most/i)).not.toBeInTheDocument();
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.cuts[0].width).toBe(0.5);
  });

  it('clears the whole-board error once a sibling edit resolves it, with no stale display', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await userEvent.clear(screen.getByLabelText(/from the end/i));
    await userEvent.type(screen.getByLabelText(/from the end/i), '0');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/cut width/i));
    await userEvent.type(screen.getByLabelText(/cut width/i), '24');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/depth/i));
    await userEvent.type(screen.getByLabelText(/depth/i), '3/4');
    await userEvent.tab();
    expect(screen.getByText(/would remove the whole board/i)).toBeInTheDocument();

    // A sibling edit that narrows the cut back below full width.
    await userEvent.clear(screen.getByLabelText(/cut width/i));
    await userEvent.type(screen.getByLabelText(/cut width/i), '1');
    await userEvent.tab();

    expect(screen.queryByText(/would remove the whole board/i)).not.toBeInTheDocument();
    // The rejected depth commit must never have landed, and the depth field
    // must display that real stored value, not the rejected "3/4" text.
    const stored = useStore.getState().doc.boards.find((b) => b.id === id)!.cuts[0].depth;
    expect(stored).not.toBe(0.75);
    expect((screen.getByLabelText(/depth/i) as HTMLInputElement).value)
      .toBe(formatLength(stored, 16));
  });

  it('clears the whole-board error after an undo restores a legal cut', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await userEvent.clear(screen.getByLabelText(/from the end/i));
    await userEvent.type(screen.getByLabelText(/from the end/i), '0');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/cut width/i));
    await userEvent.type(screen.getByLabelText(/cut width/i), '24');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/depth/i));
    await userEvent.type(screen.getByLabelText(/depth/i), '3/4');
    await userEvent.tab();
    expect(screen.getByText(/would remove the whole board/i)).toBeInTheDocument();

    // Undoes the width=24 commit (the depth commit was refused, so it never
    // reached the undo stack) — the cut's width no longer spans the board.
    act(() => { useStore.getState().undo(); });

    expect(screen.queryByText(/would remove the whole board/i)).not.toBeInTheDocument();
  });
});
