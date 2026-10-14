import { worldParts } from '../document/tree';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board } from '../document/document';
import { formatLength } from '../units/length';
import { Properties } from './Properties';
import { assemblyDoc } from '../document/treeFixtures';
import { chiralPart } from '../document/turnFixtures';
import { instanceAt, partAt } from '../document/document';

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(reset);

/** Opens the action row's More ▾ (ui-polish spec §4.2). */
const openMore = () => userEvent.click(screen.getByRole('button', { name: 'More' }));

describe('Properties', () => {
  it('adds no undo history entry for a field that is focused and blurred untouched', async () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
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
    const boardA = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().addBoard();
    const boardB = worldParts(useStore.getState().doc)[1].id;
    // Both boards get the default length (24") since addBoard reuses the
    // previous board's dimensions — the effect's [value, precision] deps
    // will not change when switching between them.
    expect(worldParts(useStore.getState().doc)[0].length).toBe(
      worldParts(useStore.getState().doc)[1].length,
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
    const id = worldParts(useStore.getState().doc)[0].id;
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

    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name)
      .toBe('Front apron');
  });

  it('commits on Enter without needing a blur', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Stretcher{Enter}');

    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name)
      .toBe('Stretcher');
  });

  // Follow-up 212: a committed name leaves the field, as a dimension does.
  it('leaves the name field after Enter, showing the stored name', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Stretcher{Enter}');

    expect(name).not.toHaveFocus();
    expect(name.value).toBe('Stretcher');
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name)
      .toBe('Stretcher');
  });

  it('does not write to the document while typing', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Leg');

    // Still the old name: nothing is committed until blur or Enter.
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name)
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
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name).toBe('Board');
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
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name).toBe('Board');
  });

  it('shows the deduplicated name when renaming onto an existing one', async () => {
    useStore.getState().addBoard();               // 'Board'
    useStore.getState().addBoard();               // 'Board (1)'
    const second = worldParts(useStore.getState().doc)[1].id;
    useStore.getState().updateBoard(worldParts(useStore.getState().doc)[0].id, { name: 'Leg' });
    useStore.getState().selectBoard(second);
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Leg');
    await userEvent.tab();

    expect(worldParts(useStore.getState().doc).find((b) => b.id === second)!.name).toBe('Leg (1)');
    // The field must show what was stored, not what was typed.
    expect(name.value).toBe('Leg (1)');
  });

  it('re-shows the same deduplicated name with no document write when the dedup result is already the stored name', async () => {
    useStore.getState().addBoard();               // 'Board'
    useStore.getState().addBoard();               // 'Board (1)'
    const second = worldParts(useStore.getState().doc)[1].id;
    useStore.getState().updateBoard(worldParts(useStore.getState().doc)[0].id, { name: 'Leg' });
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

    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name).toBe('Board');
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

    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name)
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

    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.name)
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
    const id = worldParts(useStore.getState().doc)[0].id;
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
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.posture).toBe('upright');
  });

  it('the Turn select offers the four quarter turns', () => {
    selectFirstBoard();
    render(<Properties />);
    const opts = Array.from((screen.getByLabelText('Turn') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(opts).toEqual(['0°', '90°', '180°', '270°']);
  });

  it('a 180 on a part at 0 keeps position exactly; so does a 270 on a part at 90', async () => {
    const id = selectFirstBoard();
    useStore.getState().updateBoard(id, { position: [3.3, 0, 4.7] });
    render(<Properties />);
    const pos = () => worldParts(useStore.getState().doc).find((b) => b.id === id)!.position;
    await userEvent.selectOptions(screen.getByLabelText('Turn'), '180');
    expect(pos()).toEqual([3.3, 0, 4.7]);
    await userEvent.selectOptions(screen.getByLabelText('Turn'), '90');
    const at90 = [...pos()];
    await userEvent.selectOptions(screen.getByLabelText('Turn'), '270');
    expect(pos()).toEqual(at90);
  });

  it('commits a turn', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Turn'), '90');
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.rotation).toBe(90);
  });

  it('offers three grain directions', () => {
    selectFirstBoard();
    render(<Properties />);
    const grain = screen.getByLabelText('Grain runs') as HTMLSelectElement;
    expect([...grain.options].map((o) => o.textContent))
      .toEqual(['Along length', 'Across width', 'Through thickness']);
  });

  it('commits a grain change', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Grain runs'), 'width');
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.grain).toBe('width');
  });

  it('does not move the board when only the grain changes', async () => {
    const id = selectFirstBoard();
    const before = worldParts(useStore.getState().doc)[0].position;
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Grain runs'), 'width');
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.position).toEqual(before);
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
    expect((screen.getByLabelText('Grain runs') as HTMLSelectElement).value).toBe('thickness');
  });

  // 'Through thickness' is meaningless for a sheet good — plywood's grain is
  // its face-veneer direction, which always lies in the sheet plane — so the
  // panel must not offer it for plywood or MDF.
  it('offers only two grain directions for plywood', () => {
    const id = selectFirstBoard();
    useStore.getState().updateBoard(id, { material: 'plywood' });
    render(<Properties />);
    const grain = screen.getByLabelText('Grain runs') as HTMLSelectElement;
    expect([...grain.options].map((o) => o.textContent))
      .toEqual(['Along length', 'Across width']);
  });

  it('offers only two grain directions for MDF', () => {
    const id = selectFirstBoard();
    useStore.getState().updateBoard(id, { material: 'mdf' });
    render(<Properties />);
    const grain = screen.getByLabelText('Grain runs') as HTMLSelectElement;
    expect([...grain.options].map((o) => o.textContent))
      .toEqual(['Along length', 'Across width']);
  });

  it('updates the grain options when the material changes to a sheet good', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    expect([...(screen.getByLabelText('Grain runs') as HTMLSelectElement).options])
      .toHaveLength(3);

    const materialSelect = screen.getByLabelText('Material');
    await userEvent.selectOptions(materialSelect, 'plywood');

    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.material).toBe('plywood');
    expect([...(screen.getByLabelText('Grain runs') as HTMLSelectElement).options].map((o) => o.textContent))
      .toEqual(['Along length', 'Across width']);
  });
});

describe('cuts', () => {
  const renderWithBoard = () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().selectBoard(id);
    render(<Properties />);
    return id;
  };

  it('labels a tenon\'s cuts "tenon shoulder" and a lone rabbet "rabbet" (fu 180)', async () => {
    const id = renderWithBoard();
    const cheek = (cid: string, from: 'min' | 'max') => ({ id: cid, face: 'thickness' as const, from, across: 'width' as const, offset: 0, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 });
    // updateBoard cannot set cuts (invariant 2), so seed through the cut actions.
    act(() => {
      const st = useStore.getState();
      st.addCut(id);
      st.addCut(id);
      const [c1, c2] = worldParts(useStore.getState().doc)[0].cuts;
      st.updateCut(id, c1.id, cheek(c1.id, 'min'));
      st.updateCut(id, c2.id, cheek(c2.id, 'max'));
    });
    expect(screen.getAllByText('tenon shoulder')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Remove cut \(tenon shoulder/ })).toHaveLength(2);
    act(() => { useStore.getState().removeCut(id, worldParts(useStore.getState().doc)[0].cuts[1].id); });
    expect(screen.queryByText('tenon shoulder')).not.toBeInTheDocument();
    expect(screen.getByText('rabbet')).toBeInTheDocument();
  });

  it('flags a cut a board shrink has left removing nothing, and clears it when the board grows back (fu 178)', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    // The default cut sits 6" along a 24" board; at 5" it lies past the end.
    act(() => { useStore.getState().updateBoard(id, { length: 5 }); });
    expect(screen.getByText(/no longer fits the board and removes nothing/i)).toBeInTheDocument();
    // Kept, not dropped: its fields are still there to edit.
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.cuts).toHaveLength(1);
    expect(screen.getByLabelText(/from the end/i)).toBeInTheDocument();
    act(() => { useStore.getState().updateBoard(id, { length: 24 }); });
    expect(screen.queryByText(/no longer fits the board/i)).not.toBeInTheDocument();
  });

  it('shows no note on an ordinary cut', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    expect(screen.queryByText(/no longer fits the board/i)).not.toBeInTheDocument();
  });

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
    const before = worldParts(useStore.getState().doc).find((b) => b.id === id)!.cuts[0].depth;
    const depth = screen.getByLabelText(/depth/i);
    await userEvent.clear(depth);
    await userEvent.type(depth, '4');
    await userEvent.tab();
    expect(screen.getByText(/must be at most/i)).toBeInTheDocument();
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.cuts[0].depth).toBe(before);
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
    const id = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().addBoard();
    const otherId = worldParts(useStore.getState().doc)[1].id;
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
    expect(worldParts(useStore.getState().doc).find((b) => b.id === id)!.cuts[0].width).toBe(0.5);
  });

  it('preserves a legal offset and width when Runs across only moves the position axis', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await userEvent.clear(screen.getByLabelText(/from the end/i));
    await userEvent.type(screen.getByLabelText(/from the end/i), '1/8');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/cut width/i));
    await userEvent.type(screen.getByLabelText(/cut width/i), '1/4');
    await userEvent.tab();

    // Both values are trivially legal on any axis of a 24 x 5.5 x 0.75
    // board — this changes `across` only, which must not discard them.
    const across = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    const other = [...across.options].map((o) => o.value).find((v) => v !== across.value)!;
    await userEvent.selectOptions(across, other);

    const cut = worldParts(useStore.getState().doc).find((b) => b.id === id)!.cuts[0];
    expect(cut.offset).toBe(0.125);
    expect(cut.width).toBe(0.25);
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
    const stored = worldParts(useStore.getState().doc).find((b) => b.id === id)!.cuts[0].depth;
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

  const stored = (id: string) => worldParts(useStore.getState().doc).find((b) => b.id === id)!.cuts[0];
  const typeInto = async (label: RegExp, text: string) => {
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    await userEvent.type(field, text);
    await userEvent.tab();
  };

  it('commits both stops and names the cut a blind dado', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — near end/i, '1');
    await typeInto(/stop short — far end/i, '1.5');
    expect(stored(id)).toMatchObject({ stopMin: 1, stopMax: 1.5 });
    // Cut-words spec §2.2: closed pocket 3 x 3/4, depth 3/8 not deeper than 3/4 -> 'blind dado', formerly 'mortise'.
    expect(screen.getByText('blind dado')).toBeInTheDocument();
  });

  it('names a cut stopped at one end a stopped dado', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — far end/i, '1');
    expect(screen.getByText('stopped dado')).toBeInTheDocument();
  });

  it('refuses stops that exactly use up the across dimension', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — near end/i, '3');
    // 3 + 2.5 = 5.5, the board's width: no cut left. The field's max allows
    // equality, so this is the row's refusal, not DimensionField's.
    await typeInto(/stop short — far end/i, '2.5');
    expect(screen.getByText(/would leave no cut/i)).toBeInTheDocument();
    expect(stored(id).stopMax).toBe(0);
  });

  it('clears the leave-no-cut error after an undo resolves it', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — near end/i, '3');
    await typeInto(/stop short — far end/i, '2.5');
    expect(screen.getByText(/would leave no cut/i)).toBeInTheDocument();
    // Undoes stopMin = 3 (the refused stopMax never reached the stack). With
    // stopMin back at 0 nothing is wrong, so the error must not outlive it.
    act(() => { useStore.getState().undo(); });
    expect(screen.queryByText(/would leave no cut/i)).not.toBeInTheDocument();
  });

  it('resets both stops when Runs across changes', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — near end/i, '1');
    await typeInto(/stop short — far end/i, '1');
    const across = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    const other = [...across.options].map((o) => o.value).find((v) => v !== across.value)!;
    await userEvent.selectOptions(across, other);
    expect(stored(id)).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('keeps the stops when Cut into changes and across does not', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — near end/i, '1');
    // Face -> End (length). across stays width, so the stops still mean what they said.
    await userEvent.selectOptions(screen.getByLabelText(/cut into/i), 'length');
    expect(stored(id).across).toBe('width');
    expect(stored(id).stopMin).toBe(1);
  });

  it('resets the stops when Cut into takes the across dimension', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — near end/i, '1');
    // Face -> Edge (width) moves across off width.
    await userEvent.selectOptions(screen.getByLabelText(/cut into/i), 'width');
    expect(stored(id).across).not.toBe('width');
    expect(stored(id)).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('allows a full-depth, full-width cut that stops short', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — far end/i, '1');
    await typeInto(/from the end/i, '0');
    await typeInto(/cut width/i, '24');
    await typeInto(/^depth$/i, '3/4');
    expect(screen.queryByText(/would remove the whole board/i)).not.toBeInTheDocument();
    expect(stored(id)).toMatchObject({ offset: 0, width: 24, depth: 0.75, stopMax: 1 });
  });

  it('allows a full-depth, full-width cut that stops short at the near end', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — near end/i, '1');
    await typeInto(/from the end/i, '0');
    await typeInto(/cut width/i, '24');
    await typeInto(/^depth$/i, '3/4');
    expect(screen.queryByText(/would remove the whole board/i)).not.toBeInTheDocument();
    expect(stored(id)).toMatchObject({ offset: 0, width: 24, depth: 0.75, stopMin: 1 });
  });

  it('keeps a cut editable after a board shrink leaves its stops crossing', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short — near end/i, '3');
    await typeInto(/stop short — far end/i, '2');
    expect(stored(id)).toMatchObject({ stopMin: 3, stopMax: 2 });
    // Width 5.5 -> 2: 3 + 2 >= 2, so the cut now has no length across.
    act(() => { useStore.getState().updateBoard(id, { width: 2 }); });

    await typeInto(/from the end/i, '1');
    expect(screen.queryByText(/would leave no cut/i)).not.toBeInTheDocument();
    expect(stored(id).offset).toBe(1);

    await typeInto(/stop short — far end/i, '0');
    expect(stored(id).stopMax).toBe(0);

    await typeInto(/stop short — near end/i, '1');
    expect(stored(id).stopMin).toBe(1);
    expect(stored(id).stopMin + stored(id).stopMax).toBeLessThan(2);
  });

  describe('a cut stored the other way from the sheet (cut-storage §3.3)', () => {
    const backRabbet = { face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const housing = { face: 'thickness' as const, from: 'max' as const, across: 'length' as const, offset: 0.25, width: 10.25, depth: 0.25, stopMin: 24, stopMax: 47.25 };
    const seedSide = () => {
      const id = renderWithBoard();
      act(() => {
        const st = useStore.getState();
        st.updateBoard(id, { length: 72, width: 11.25 });
        st.addCut(id);
        st.addCut(id);
        const [r, h] = worldParts(useStore.getState().doc)[0].cuts;
        st.updateCut(id, r.id, backRabbet);
        st.updateCut(id, h.id, housing);
      });
      const [r, h] = worldParts(useStore.getState().doc)[0].cuts;
      return { id, rabbetId: r.id, housingId: h.id };
    };
    const note = /The cut list reads this cut as running across the width\./;
    const runsAcross = (cutId: string) => document.getElementById(`across-${cutId}`) as HTMLSelectElement;

    it('shows nothing for a square cut whose direction only the default decides (fu 198)', () => {
      const id = renderWithBoard();
      // A 3/4" square mortise on the default board, typed running across the WIDTH; the sheet reads it along the length.
      act(() => {
        const st = useStore.getState();
        st.addCut(id);
        const [c] = worldParts(useStore.getState().doc)[0].cuts;
        st.updateCut(id, c.id, { face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 1 / 2, stopMin: 2, stopMax: 2.75 });
      });
      expect(screen.queryByText(/The cut list reads this cut/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Match the cut list' })).not.toBeInTheDocument();
    });

    it('shows the note and the button on the sideways housing only', () => {
      const { rabbetId, housingId } = seedSide();
      expect(screen.getAllByText(note)).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Match the cut list' })).toHaveLength(1);
      expect(runsAcross(housingId).value).toBe('length');
      expect(runsAcross(rabbetId).value).toBe('length');
    });

    it('one click re-stores it the sheet\'s way, and one undo puts it back', async () => {
      const { id, housingId } = seedSide();
      const before = useStore.getState().past.length;
      await userEvent.click(screen.getByRole('button', { name: 'Match the cut list' }));
      expect(runsAcross(housingId).value).toBe('width');
      expect(screen.queryByText(note)).not.toBeInTheDocument();
      const stored = worldParts(useStore.getState().doc).find((b) => b.id === id)!.cuts.find((c) => c.id === housingId)!;
      expect(stored).toMatchObject({ across: 'width', offset: 24, width: 0.75, stopMin: 0.25, stopMax: 0.75 });
      expect(useStore.getState().past.length).toBe(before + 1);
      act(() => { useStore.getState().undo(); });
      expect(runsAcross(housingId).value).toBe('length');
      expect(screen.getAllByText(note)).toHaveLength(1);
    });

    it('moves focus to the row\'s Runs across after the click, not to the body', async () => {
      const { housingId } = seedSide();
      await userEvent.click(screen.getByRole('button', { name: 'Match the cut list' }));
      expect(screen.queryByRole('button', { name: 'Match the cut list' })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(runsAcross(housingId));
    });

    it('announces the note as a status, like the removes-nothing note', () => {
      seedSide();
      expect(screen.getByText(note).closest('[role="status"]')).not.toBeNull();
    });

    it('offers the re-store for the millimetre corner opening that fu 200 un-refused', () => {
      // Once refused by storedAsShape (its extents differed by an ulp); within FLUSH_EPSILON it re-stores
      // to the same word, so it is offered like any sideways cut. The guard still refuses cuts at the tolerance boundary (next test).
      const id = renderWithBoard();
      act(() => {
        const st = useStore.getState();
        st.addCut(id);
        const [c] = worldParts(useStore.getState().doc)[0].cuts;
        st.updateCut(id, c.id, { face: 'length', from: 'min', across: 'thickness', offset: 0, width: 0.6712598425196851, depth: 9.370078740157481, stopMin: 0.03937007874015748, stopMax: 0.03937007874015741 });
      });
      expect(screen.getAllByText('notch')).toHaveLength(1);
      expect(screen.getByText(/The cut list reads this cut as running across the width\./)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Match the cut list' })).toHaveLength(1);
    });

    it('shows nothing for a sideways cut whose word is decided at the FLUSH_EPSILON boundary', () => {
      // storedAsShape refuses it: a 1-ulp re-store would cross the tolerance and change the word.
      const id = renderWithBoard();
      act(() => {
        const st = useStore.getState();
        st.addCut(id);
        const [c] = worldParts(useStore.getState().doc)[0].cuts;
        st.updateCut(id, c.id, { face: 'thickness', from: 'max', across: 'length', offset: 0, width: 0.8661417332834628, depth: 0.25, stopMin: 3.062992125984252, stopMax: 20.070866141732285 });
      });
      expect(screen.getAllByText('notch')).toHaveLength(1);
      expect(screen.queryByText(/The cut list reads this cut/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Match the cut list' })).not.toBeInTheDocument();
    });

    it('shows nothing for a tenon shoulder stored sideways', () => {
      const id = renderWithBoard();
      // Two cheeks at the length's min end, each stored across the LENGTH (stops 0 / 23)
      // instead of across the width: the same boxes as the cheeks in the fu 180 test above.
      const cheek = (cid: string, from: 'min' | 'max') => ({ id: cid, face: 'thickness' as const, from, across: 'length' as const, offset: 0, width: 5.5, depth: 0.25, stopMin: 0, stopMax: 23 });
      act(() => {
        const st = useStore.getState();
        st.addCut(id);
        st.addCut(id);
        const [c1, c2] = worldParts(useStore.getState().doc)[0].cuts;
        st.updateCut(id, c1.id, cheek(c1.id, 'min'));
        st.updateCut(id, c2.id, cheek(c2.id, 'max'));
      });
      expect(screen.getAllByText('tenon shoulder')).toHaveLength(2);
      expect(screen.queryByText(/The cut list reads this cut/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Match the cut list' })).not.toBeInTheDocument();
    });

    it('shows nothing for a cut that removes nothing', () => {
      const { id, housingId } = seedSide();
      // The housing's own geometry at depth 0: it removes nothing, yet its shape still reads as running
      // across the width (0.75" along the length against 10.25" across the width), so `across !== run`
      // is true and only the removes-nothing guard hides the note (mutation 2 of the task; a cut
      // moved out of the board runs the same way as it is stored, and does NOT exercise the guard).
      act(() => { useStore.getState().updateCut(id, housingId, { depth: 0 }); });
      expect(screen.getByText(/no longer fits the board/)).toBeInTheDocument();
      expect(screen.queryByText(/The cut list reads this cut/)).not.toBeInTheDocument();
    });
  });
});

describe('Properties with two or more parts selected', () => {
  const board = (id: string) => worldParts(useStore.getState().doc).find((x) => x.id === id)!;
  const past = () => useStore.getState().past.length;

  /** a at the origin, b 3-1/2 wide at [30, 0, 8]; both selected. */
  const group = () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = useStore.getState().doc.boards;
    useStore.getState().updateBoard(b!.id, { width: 3.5, position: [30, 0, 8] });
    useStore.getState().selectBoard(a!.id);
    useStore.getState().toggleSelected(b!.id);
    return { a: a!.id, b: b!.id };
  };

  it('reads "N parts selected" and offers only the group fields', () => {
    group();
    render(<Properties />);
    expect(screen.getByRole('heading', { name: '2 parts selected' })).toBeInTheDocument();
    for (const label of ['Length', 'Width', 'Thickness', 'Grain runs']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('combobox', { name: 'Material' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    for (const label of ['Part name', 'X', 'Y', 'Z', 'Posture', 'Turn']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /add cut/i })).not.toBeInTheDocument();
  });

  it('shows a shared value, and an empty "mixed" box where the parts differ', () => {
    group();
    render(<Properties />);
    expect((screen.getByLabelText('Length') as HTMLInputElement).value).toBe('24"');
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    expect(width.value).toBe('');
    expect(width).toHaveAttribute('placeholder', 'mixed');
  });

  it('shows a disabled "mixed" option on a select whose parts differ', () => {
    const { b } = group();
    useStore.getState().updateBoard(b, { grain: 'width' });
    render(<Properties />);
    expect((screen.getByLabelText('Grain runs') as HTMLSelectElement).value).toBe('');
    expect(within(screen.getByLabelText('Grain runs')).getByRole('option', { name: 'mixed' })).toBeDisabled();
  });

  it('treats values that DISPLAY alike but are stored differently as mixed; a typed value lands exactly on both', async () => {
    const { a, b } = group();
    useStore.getState().updateBoards([a, b], { thickness: 0.7 });
    useStore.getState().updateBoard(b, { thickness: 0.6875 }); // both read 11/16"
    render(<Properties />);
    const t = screen.getByLabelText('Thickness') as HTMLInputElement;
    expect(t.value).toBe('');
    await userEvent.type(t, '3/4');
    await userEvent.tab();
    expect(board(a).thickness).toBe(0.75);
    expect(board(b).thickness).toBe(0.75);
  });

  it('an edit applies to every selected part as ONE undo entry, each on its own corner', async () => {
    const { a, b } = group();
    render(<Properties />);
    const before = past();
    const len = screen.getByLabelText('Length');
    await userEvent.clear(len);
    await userEvent.type(len, '30');
    await userEvent.tab();
    expect([board(a).length, board(b).length]).toEqual([30, 30]);
    expect(board(a).position).toEqual([0, 0, 0]);
    expect(board(b).position).toEqual([30, 0, 8]);
    expect(past()).toBe(before + 1);
  });

  it('refuses a value out of range and writes to no part', async () => {
    const { a, b } = group();
    render(<Properties />);
    const before = past();
    const len = screen.getByLabelText('Length');
    await userEvent.clear(len);
    await userEvent.type(len, '0');
    await userEvent.tab();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect([board(a).length, board(b).length]).toEqual([24, 24]);
    expect(past()).toBe(before);
  });

  // Review Focus 3. THE TRAP, at the panel: spec §4.4 asks for this test by name.
  it('THE TRAP: a mixed field focused and blurred untouched writes NOTHING (invariant 5)', async () => {
    group();
    render(<Properties />);
    const before = past();
    const doc = useStore.getState().doc;
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    await userEvent.click(width);
    await userEvent.tab();
    expect(useStore.getState().doc).toBe(doc);
    expect(past()).toBe(before);
    expect(width.value).toBe('');
    expect(width).toHaveAttribute('placeholder', 'mixed');
    expect(width).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // The panel half of Task 6's write case: the trap test above starts mixed,
  // so a deleted guard commits '' and is refused. Here the field holds real
  // text when the parts start to differ under it, so a deleted guard WRITES.
  it('a shared field that turns mixed while focused writes nothing on an untouched blur', async () => {
    const { a, b } = group();
    render(<Properties />);
    const len = screen.getByLabelText('Length') as HTMLInputElement; // shared: 24"
    await userEvent.click(len);
    act(() => { useStore.getState().updateBoard(b, { length: 30 }); }); // now 24 / 30
    const before = past();
    const doc = useStore.getState().doc;
    await userEvent.tab();
    expect(useStore.getState().doc).toBe(doc);
    expect(past()).toBe(before);
    expect([board(a).length, board(b).length]).toEqual([24, 30]);
    expect(len.value).toBe('');
  });

  it('a mixed select focused and blurred without a change writes nothing', async () => {
    const { b } = group();
    useStore.getState().updateBoard(b, { grain: 'width' });
    render(<Properties />);
    const before = past();
    const doc = useStore.getState().doc;
    await userEvent.click(screen.getByLabelText('Grain runs'));
    await userEvent.tab();
    expect(useStore.getState().doc).toBe(doc);
    expect(past()).toBe(before);
  });

  it('a grain change applies to every part', async () => {
    const { a, b } = group();
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Grain runs'), 'width');
    expect([board(a).grain, board(b).grain]).toEqual(['width', 'width']);
  });

  it('a material change resets grain per part, the way a single edit does', async () => {
    const { a, b } = group();
    useStore.getState().updateBoard(a, { grain: 'thickness' });
    useStore.getState().updateBoard(b, { grain: 'width' });
    render(<Properties />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Material' }), 'plywood');
    expect([board(a).material, board(b).material]).toEqual(['plywood', 'plywood']);
    expect([board(a).grain, board(b).grain]).toEqual(['length', 'width']);
  });

  it('offers "Through thickness" only when no selected part is a sheet good', () => {
    const { b } = group();
    useStore.getState().updateBoard(b, { material: 'plywood' });
    render(<Properties />);
    expect(screen.queryByRole('option', { name: 'Through thickness' })).not.toBeInTheDocument();
  });

  it('Duplicate copies every selected part as one undo entry and selects the copies', async () => {
    const { a, b } = group();
    render(<Properties />);
    const before = past();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    const boards = useStore.getState().doc.boards;
    expect(boards).toHaveLength(4);
    expect(past()).toBe(before + 1);
    expect(useStore.getState().selectedIds).toEqual([boards[2]!.id, boards[3]!.id]);
    expect(useStore.getState().selectedIds).not.toContain(a);
    expect(useStore.getState().selectedIds).not.toContain(b);
  });

  it('Delete removes every selected part as one undo entry', async () => {
    group();
    render(<Properties />);
    const before = past();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useStore.getState().doc.boards).toHaveLength(0);
    expect(past()).toBe(before + 1);
  });

  it('resyncs from the new selection when it changes under a draft, writing nothing', async () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    const [a, b, c] = worldParts(useStore.getState().doc).map((x) => x.id);
    useStore.getState().updateBoard(c!, { length: 30 });
    useStore.getState().selectBoard(a!);
    useStore.getState().toggleSelected(b!);
    render(<Properties />);
    const before = past();
    const len = screen.getByLabelText('Length') as HTMLInputElement;
    await userEvent.clear(len);
    await userEvent.type(len, '12'); // a draft: typed, not committed
    act(() => { useStore.getState().toggleSelected(c!); });
    const after = screen.getByLabelText('Length') as HTMLInputElement;
    expect(after.value).toBe(''); // 24, 24, 30: mixed
    expect(after).toHaveAttribute('placeholder', 'mixed');
    expect(past()).toBe(before);
    expect([board(a!).length, board(b!).length, board(c!).length]).toEqual([24, 24, 30]);
  });

  // Review Focus 1, panel half.
  it('drops to the single-part panel when an undo removes a member of the group', () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = worldParts(useStore.getState().doc).map((x) => x.id);
    useStore.getState().selectBoard(a!);
    useStore.getState().toggleSelected(b!);
    render(<Properties />);
    expect(screen.getByRole('heading', { name: '2 parts selected' })).toBeInTheDocument();
    act(() => { useStore.getState().undo(); }); // un-adds b
    expect(screen.queryByRole('heading', { name: /parts selected/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Part name')).toHaveValue('Board');
  });
});

describe('Hide others', () => {
  it('in the single-part panel, hides every other part', async () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = worldParts(useStore.getState().doc).map((x) => x.id);
    useStore.getState().selectBoard(a!);
    render(<Properties />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide others' }));
    expect(useStore.getState().hiddenIds).toEqual([b]);
  });

  it('in the group panel, hides every unselected part', async () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    const [a, b, c] = worldParts(useStore.getState().doc).map((x) => x.id);
    useStore.getState().selectBoard(a!);
    useStore.getState().toggleSelected(b!);
    render(<Properties />);
    await openMore();
    await userEvent.click(screen.getByRole('button', { name: 'Hide others' }));
    expect(useStore.getState().hiddenIds).toEqual([c]);
  });
});

describe('linking controls', () => {
  const st = () => useStore.getState();
  const two = (lenB = 28) => {
    act(() => {
      st().addBoard(); st().addBoard();
      const [a, b] = worldParts(st().doc).map((x) => x.id);
      st().updateBoard(a!, { length: 28 });
      st().updateBoard(b!, { length: lenB });
      st().selectBoard(a!); st().toggleSelected(b!);
    });
    return worldParts(st().doc).map((x) => x.id);
  };

  it('offers Link with a "will match" line only when the parts differ', async () => {
    two(30);
    render(<Properties />);
    expect(screen.getByText(/Linking makes 1 part match Board:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(new Set(worldParts(st().doc).map((b) => b.shape)).size).toBe(1);
    expect(worldParts(st().doc)[0]!.shape).toBeDefined();
    expect(worldParts(st().doc)[1]!.length).toBe(28);
  });

  it('no "will match" line for identical parts; Link hidden once they are one link; Unlink shown', async () => {
    two();
    render(<Properties />);
    expect(screen.queryByText(/Linking makes/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
    await openMore();
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
  });

  it('single panel for a linked part: the block, Select linked, Unlink', async () => {
    const [a, b] = two();
    act(() => { st().linkBoards([a!, b!]); st().selectBoard(a!); });
    render(<Properties />);
    expect(screen.getByText(/Linked with 1 other part/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select linked' }));
    expect(st().selectedIds).toEqual([a, b]);
  });

  it('Select linked is not offered when the only other member is hidden (fu 228)', async () => {
    const [a, b] = two();
    act(() => { st().linkBoards([a!, b!]); st().selectBoard(a!); });
    render(<Properties />);
    expect(screen.getByRole('button', { name: 'Select linked' })).toBeInTheDocument();
    act(() => { st().setHidden(b!, true); });
    expect(screen.queryByRole('button', { name: 'Select linked' })).toBeNull();
    expect(screen.getByText(/Linked with 1 other part/)).toBeInTheDocument();
    act(() => { st().setHidden(b!, false); });
    expect(screen.getByRole('button', { name: 'Select linked' })).toBeInTheDocument();
  });

  it('plural wording: three parts link, "Linking makes 2 parts match" and "Linked with 2 other parts" (fu 222)', async () => {
    act(() => {
      st().addBoard(); st().addBoard(); st().addBoard();
      const [a, b, c] = worldParts(st().doc).map((x) => x.id);
      st().updateBoard(a!, { length: 28 });
      st().updateBoard(b!, { length: 30 });
      st().updateBoard(c!, { length: 32 });
      st().selectBoard(a!); st().toggleSelected(b!); st().toggleSelected(c!);
    });
    const { unmount } = render(<Properties />);
    expect(screen.getByText(/Linking makes 2 parts match Board:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    unmount();
    act(() => { st().selectBoard(worldParts(st().doc)[0]!.id); });
    render(<Properties />);
    expect(screen.getByText(/Linked with 2 other parts: edits .* change all 3\./)).toBeInTheDocument();
  });

  it('single panel Unlink makes the part independent', async () => {
    const [a, b] = two();
    act(() => { st().linkBoards([a!, b!]); st().selectBoard(a!); });
    render(<Properties />);
    await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    expect(worldParts(st().doc).every((x) => !('shape' in x))).toBe(true);
    expect(st().doc.shapes).toEqual([]);
  });
});

describe('Properties assemblies', () => {
  it('an assembly gets its own panel: name, turn, Ungroup', async () => {
    useStore.getState().replaceDocument(assemblyDoc());
    useStore.getState().selectBoard('i1');
    render(<Properties />);
    expect(screen.getByDisplayValue('Drawer')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Turn'), '180');
    expect(instanceAt(useStore.getState().doc, 'i1')!.rotation).toBe(180);
    await userEvent.click(screen.getByRole('button', { name: 'Ungroup' }));
    expect(useStore.getState().doc.instances.map((i) => i.id)).toEqual(['i2']);
  });

  it('a mixed selection hides the size fields and Link, and offers Group', async () => {
    useStore.getState().replaceDocument(assemblyDoc());
    useStore.getState().selectAll();
    render(<Properties />);
    expect(screen.queryByLabelText('Length')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Group' }));
    expect(useStore.getState().doc.instances).toHaveLength(1);
    expect(useStore.getState().doc.boards).toHaveLength(0);
  });

  it('a part inside an assembly is renamed among its siblings', async () => {
    useStore.getState().replaceDocument(assemblyDoc());
    useStore.getState().selectItem('i1/b1', false);
    render(<Properties />);
    const field = screen.getByDisplayValue('Side');
    await userEvent.clear(field);
    await userEvent.type(field, 'Front{Enter}');
    expect(partAt(useStore.getState().doc, 'i1/b1')!.name).toBe('Front (1)');
  });

  it('Select linked shows only when another member sits at the open level', async () => {
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => { useStore.getState().linkBoards(['r1', 'i1/b1']); useStore.getState().selectBoard('r1'); });
    const { unmount } = render(<Properties />);
    expect(screen.getByText(/Linked with 1 other part/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select linked' })).toBeNull();
    unmount();
    act(() => {
      useStore.getState().replaceDocument(assemblyDoc());
      useStore.getState().linkBoards(['i1/b1', 'i1/b2']);
      useStore.getState().openAssembly('i1');
      useStore.getState().selectItem('i1/b1', false);
    });
    render(<Properties />);
    await userEvent.click(screen.getByRole('button', { name: 'Select linked' }));
    expect(useStore.getState().selectedIds).toEqual(['i1/b1', 'i1/b2']);
  });
});

describe('Properties shared copies', () => {
  const twoCopies = () => {
    const d = assemblyDoc();
    const i3 = { ...d.instances[0]!, id: 'i3', name: 'Drawer 2', position: [20, 0, 0] as [number, number, number] };
    return { ...d, instances: [...d.instances, i3] };
  };

  it('names the copy count and Make Unique gives the instance its own definition', async () => {
    useStore.getState().replaceDocument(twoCopies());
    useStore.getState().selectBoard('i1');
    render(<Properties />);
    expect(screen.getByText(/Shared by 2 copies/)).toBeInTheDocument();
    expect(useStore.getState().doc.definitions).toHaveLength(2);
    await openMore();
    await userEvent.click(screen.getByRole('button', { name: 'Make Unique' }));
    expect(screen.queryByText(/Shared by/)).toBeNull();
    expect(useStore.getState().doc.definitions).toHaveLength(3);
  });

  it('Select copies selects the other copy at the open level', async () => {
    useStore.getState().replaceDocument(twoCopies());
    useStore.getState().selectBoard('i1');
    render(<Properties />);
    await openMore();
    await userEvent.click(screen.getByRole('button', { name: 'Select copies' }));
    expect([...useStore.getState().selectedIds].sort()).toEqual(['i1', 'i3']);
  });

  it('offers no Make Unique for a drawer inside a cabinet placed twice (2 placements, 1 reference)', async () => {
    const d = assemblyDoc();
    const cab = { id: 'dc', boards: [], instances: [{ ...d.instances[0]!, id: 'k1', name: 'Drawer' }] };
    const doc = {
      ...d, boards: [], definitions: [...d.definitions, cab],
      instances: [
        { id: 'c1', name: 'Cab', definition: 'dc', position: [0, 0, 0] as [number, number, number], rotation: 0 as const },
        { id: 'c2', name: 'Cab 2', definition: 'dc', position: [30, 0, 0] as [number, number, number], rotation: 0 as const },
      ],
    };
    useStore.getState().replaceDocument(doc);
    act(() => { useStore.getState().openAssembly('c1'); });
    useStore.getState().selectBoard('c1/k1');
    render(<Properties />);
    expect(screen.getByText(/Shared by 2 copies/)).toBeInTheDocument();
    await openMore();
    expect(screen.queryByRole('button', { name: 'Make Unique' })).toBeNull();
  });
});


describe('Properties mirrored assemblies', () => {
  it('an assembly\'s Mirrored checkbox flips it, and Copy mirrored of a mirrored original adds an unmirrored copy', async () => {
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => useStore.getState().selectItem('i1', false));
    render(<Properties />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mirrored' }));
    expect(instanceAt(useStore.getState().doc, 'i1')!.mirrored).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Mirrored' })).toBeChecked();
    await openMore();
    await userEvent.click(screen.getByRole('button', { name: 'Copy mirrored' }));
    const copy = useStore.getState().selectedIds[0]!;
    expect('mirrored' in instanceAt(useStore.getState().doc, copy)!).toBe(false);
  });
});

describe('Properties across a mirror (mirrored-instances spec §4, amended)', () => {
  const st = () => useStore.getState();
  /** Two linked shelves grouped, Copy mirrored, the original Ungrouped: the Shape has users on both sides. */
  const bothSides = () => act(() => {
    const shelf = (id: string, y: number) => ({ ...chiralPart('flat'), id, name: `Shelf ${id}`, position: [0, y, 0] as [number, number, number] });
    st().replaceDocument({ ...createDocument('P'), boards: [shelf('a', 0), shelf('b', 5)] });
    st().linkBoards(['a', 'b']);
    st().selectBoard('a'); st().toggleSelected('b');
    st().groupSelected();
    const g = st().doc.instances[0]!.id;
    st().copyMirrored(g);
    st().selectItem(g, false);
    st().ungroupSelected();
  });

  it('Posture flat -> upright on that Shape shows the refusal, changes nothing, and the select snaps back', async () => {
    bothSides();
    act(() => st().selectBoard('a'));
    render(<Properties />);
    const before = st().doc;
    await userEvent.selectOptions(screen.getByLabelText('Posture'), 'upright');
    expect(screen.getByRole('alert')).toHaveTextContent("Linked parts on both sides of a mirror can't change between flat and upright. Unlink first.");
    expect(st().doc).toBe(before);
    expect(screen.getByLabelText('Posture')).toHaveValue('flat');
    await userEvent.selectOptions(screen.getByLabelText('Posture'), 'on-edge');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(worldParts(st().doc).find((b) => b.id === 'a')!.posture).toBe('on-edge');
  });

  it('Link is refused, with the message and no Link button, when a member sits on the other side of a mirror', () => {
    bothSides();
    act(() => {
      st().addBoard();
      const fresh = st().selectedIds[0]!;
      st().selectBoard('a'); st().toggleSelected(fresh);
    });
    render(<Properties />);
    expect(screen.getByText("Can't link parts on opposite sides of a mirror.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
  });
});


describe('the action row (ui-polish spec §4.2)', () => {
  const st = () => useStore.getState();
  const shown = () => [...document.querySelectorAll('.action-bar > button:not(.action-delete)')].map((b) => b.textContent);
  const moreItems = async () => {
    await openMore();
    return [...document.querySelectorAll('.popover-item')].map((b) => b.getAttribute('aria-label'));
  };

  it('one part: Duplicate, Group, Hide others; More holds Copy in a row…', async () => {
    st().addBoard();
    st().selectBoard(worldParts(st().doc)[0]!.id);
    render(<Properties />);
    expect(shown()).toEqual(['Duplicate', 'Group', 'Hide others']);
    expect(await moreItems()).toEqual(['Copy in a row…']);
  });

  it('one assembly: Duplicate, Ungroup, Hide others; More holds the rest in order', async () => {
    st().replaceDocument(assemblyDoc());
    act(() => st().selectItem('i1', false));
    render(<Properties />);
    expect(shown()).toEqual(['Duplicate', 'Ungroup', 'Hide others']);
    expect(await moreItems()).toEqual(['Copy mirrored', 'Copy in a row…', 'Group']);
  });

  it('several parts that can link: Link, Duplicate, Group visible', async () => {
    act(() => { st().addBoard(); st().addBoard(); });
    const [a, b] = worldParts(st().doc).map((x) => x.id);
    act(() => { st().selectBoard(a!); st().toggleSelected(b!); });
    render(<Properties />);
    expect(shown()).toEqual(['Link', 'Duplicate', 'Group']);
    expect(await moreItems()).toEqual(['Hide others', 'Copy in a row…']);
  });

  it('several parts that cannot link: Duplicate, Group, Hide others visible', async () => {
    act(() => { st().addBoard(); st().addBoard(); });
    const [a, b] = worldParts(st().doc).map((x) => x.id);
    act(() => { st().linkBoards([a!, b!]); st().selectBoard(a!); st().toggleSelected(b!); });
    render(<Properties />);
    expect(shown()).toEqual(['Duplicate', 'Group', 'Hide others']);
    expect(await moreItems()).toEqual(['Unlink', 'Copy in a row…']);
  });

  it('a selection change closes an open Copy in a row form', async () => {
    act(() => { st().addBoard(); st().addBoard(); });
    const [a, b] = worldParts(st().doc).map((x) => x.id);
    act(() => st().selectBoard(a!));
    render(<Properties />);
    await openMore();
    await userEvent.click(screen.getByRole('button', { name: 'Copy in a row…' }));
    expect(screen.getByRole('group', { name: 'Copy in a row' })).toBeInTheDocument();
    act(() => st().selectBoard(b!));
    expect(screen.queryByRole('group', { name: 'Copy in a row' })).toBeNull();
  });
});

describe('Properties layout labels (ui-polish spec §4)', () => {
  it('names the kind beside the name: Part for a part, Assembly for an assembly', () => {
    useStore.getState().addBoard();
    useStore.getState().selectBoard(worldParts(useStore.getState().doc)[0]!.id);
    const { unmount } = render(<Properties />);
    expect(screen.getByText('Part', { selector: '.kind-chip' })).toBeInTheDocument();
    unmount();
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => useStore.getState().selectItem('i1', false));
    render(<Properties />);
    expect(screen.getByText('Assembly', { selector: '.kind-chip' })).toBeInTheDocument();
  });

  it('labels Material with a real <label>, keeping its accessible name', () => {
    useStore.getState().addBoard();
    useStore.getState().selectBoard(worldParts(useStore.getState().doc)[0]!.id);
    render(<Properties />);
    expect(screen.getByLabelText('Material').tagName).toBe('SELECT');
  });
});

describe('the material picker (custom materials spec §4.2)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
  const libAsh = { id: 'm-s-ash2', label: 'Ash', color: '#ccbb99', kind: 'solid' as const };
  const birch = { id: 'm-v-bb55', label: 'Baltic birch', color: '#e8d8b8', kind: 'sheet-veneered' as const, sheet: { length: 60, width: 60 } };
  const load = (materials: Array<typeof ash | typeof birch>, mats: string[]) => {
    const boards = mats.map((material, i) => createBoard({ id: String.fromCharCode(97 + i), name: `P${i}`, material }));
    useStore.getState().replaceDocument({ ...createDocument('T'), materials, boards });
    useStore.getState().selectAll();
  };

  it('groups built-ins, this project and the library, showing one "Ash"', () => {
    load([ash], ['m-s-ash1']);
    useStore.getState().selectBoard('a');
    render(<Properties library={[libAsh, birch]} onNewMaterial={() => {}} />);
    const select = screen.getByRole('combobox', { name: 'Material' });
    expect(within(select).getAllByRole('option', { name: 'Ash' })).toHaveLength(1);
    expect(within(select).getByRole('group', { name: 'This project' })).toBeInTheDocument();
    expect(within(select).getByRole('group', { name: 'Your library' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'New material…' })).toBeInTheDocument();
  });
  it('picking a library material adopts it in one undo entry', () => {
    load([], ['pine']);
    useStore.getState().selectBoard('a');
    render(<Properties library={[birch]} onNewMaterial={() => {}} />);
    const n = useStore.getState().past.length;
    fireEvent.change(screen.getByRole('combobox', { name: 'Material' }), { target: { value: 'm-v-bb55' } });
    expect(useStore.getState().doc.materials).toEqual([birch]);
    expect(useStore.getState().past.length).toBe(n + 1);
  });
  it('New material… on plywood parts starts a veneered sheet', () => {
    const onNewMaterial = vi.fn();
    load([], ['plywood', 'plywood']);
    render(<Properties library={[]} onNewMaterial={onNewMaterial} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Material' }), { target: { value: '__new__' } });
    expect(onNewMaterial).toHaveBeenCalledWith(['a', 'b'], 'sheet-veneered');
  });
  it('New material… calls onNewMaterial with the selection and changes nothing', () => {
    const onNewMaterial = vi.fn();
    load([], ['pine', 'pine']);
    render(<Properties library={[]} onNewMaterial={onNewMaterial} />);
    const doc = useStore.getState().doc;
    fireEvent.change(screen.getByRole('combobox', { name: 'Material' }), { target: { value: '__new__' } });
    expect(onNewMaterial).toHaveBeenCalledWith(['a', 'b'], 'solid');
    expect(useStore.getState().doc).toBe(doc);
  });
});

describe('Nominal size (custom materials spec §5.3)', () => {
  const load = (specs: Array<{ id: string; material?: string; thickness: number; width: number }>) => {
    const boards = specs.map((s) => createBoard({ name: `P${s.id}`, length: 24, ...s }));
    useStore.getState().replaceDocument({ ...createDocument('T'), boards });
  };
  it('shows only when every selected part is a nominal material, reading the current name', () => {
    load([{ id: 'a', material: 'pine', thickness: 0.75, width: 3.5 }]);
    useStore.getState().selectBoard('a');
    render(<Properties />);
    expect(screen.getByRole('combobox', { name: 'Nominal size' })).toHaveValue('1×4');
    act(() => useStore.getState().updateBoard('a', { material: 'oak' }));
    expect(screen.queryByRole('combobox', { name: 'Nominal size' })).toBeNull();
  });
  it('reads Custom for a non-section size, and choosing Custom changes nothing', () => {
    load([{ id: 'a', material: 'pine', thickness: 0.75, width: 3 }]);
    useStore.getState().selectBoard('a');
    render(<Properties />);
    const sel = screen.getByRole('combobox', { name: 'Nominal size' });
    expect(sel).toHaveValue('custom');
    const doc = useStore.getState().doc;
    fireEvent.change(sel, { target: { value: 'custom' } });
    expect(useStore.getState().doc).toBe(doc);
  });
  it('keeps a part stored thicker-than-wide the same way round (spec §5.3, amended)', () => {
    load([{ id: 'a', material: 'pine', thickness: 3.5, width: 0.75 }]);
    useStore.getState().selectBoard('a');
    render(<Properties />);
    const sel = screen.getByRole('combobox', { name: 'Nominal size' });
    expect(sel).toHaveValue('1×4');
    fireEvent.change(sel, { target: { value: '2×6' } });
    const b = useStore.getState().doc.boards[0] as Board;
    expect([b.thickness, b.width]).toEqual([5.5, 1.5]);
  });
  it('a mixed selection reads mixed; choosing 2×4 sets every part in ONE undo entry', () => {
    load([{ id: 'a', material: 'pine', thickness: 0.75, width: 3.5 }, { id: 'b', material: 'pine', thickness: 0.75, width: 5.5 }]);
    useStore.getState().selectAll();
    render(<Properties />);
    const sel = screen.getByRole('combobox', { name: 'Nominal size' });
    expect(sel).toHaveValue('');
    const n = useStore.getState().past.length;
    fireEvent.change(sel, { target: { value: '2×4' } });
    const parts = useStore.getState().doc.boards as Board[];
    expect(parts.map((b) => [b.thickness, b.width])).toEqual([[1.5, 3.5], [1.5, 3.5]]);
    expect(useStore.getState().past.length).toBe(n + 1);
  });
});
