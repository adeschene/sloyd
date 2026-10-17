import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { chamferCut, createBoard, createDocument, taperCut } from '../document/document';
import type { AngleCut, Board } from '../document/document';
import { Properties } from './Properties';
import { AngleCuts } from './AngleCuts';
import { IMPERIAL, formatLength } from '../units/length';

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
  it('Taper four faces adds four rows in one undo entry; Taper two faces adds two (fu 278)', async () => {
    const user = userEvent.setup();
    open(leg());
    const before = useStore.getState().past.length;
    await addMenu(user, 'Taper four faces');
    expect(cuts().map((c) => `${c.face}|${c.from}`)).toEqual(['width|min', 'width|max', 'thickness|min', 'thickness|max']);
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(screen.getAllByLabelText('Starts')).toHaveLength(4);
    act(() => useStore.getState().undo());
    expect(cuts()).toEqual([]);
    await addMenu(user, 'Taper two faces');
    expect(cuts().map((c) => `${c.face}|${c.from}`)).toEqual(['width|min', 'thickness|min']);
  });
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
  it('a hand-edited OFFSET miter shows its line and Remove, no controls that would rewrite it (fu 297)', () => {
    const c: AngleCut = { id: 'a1', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0.5], [2, 2.5]] };
    open(leg({ angleCuts: [c] }));
    expect(screen.getByRole('button', { name: /Remove angle cut/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Long point')).toBeNull();
    expect(screen.queryByLabelText('Angle')).toBeNull();
  });
  it('a taper past its thinned face may move to a face it overruns by less, never by more (fu 296)', async () => {
    const user = userEvent.setup();
    open(leg());
    act(() => useStore.getState().addAngleCuts('leg', [taperCut({ face: 'width', from: 'min', end: 'min', start: 21, amount: 0.5 })]));
    act(() => useStore.getState().updateBoard('leg', { width: 0.4, thickness: 0.45 }));   // 0.1 over the width
    expect(screen.getByText('This taper removes more than the width at this size.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Face'), 'Thickness face — min side');   // 0.05 over: less
    expect(cuts()[0]).toMatchObject({ face: 'thickness' });
    act(() => useStore.getState().updateBoard('leg', { width: 0.3 }));                     // the width: 0.2 over
    await user.selectOptions(screen.getByLabelText('Face'), 'Width face — min side');
    expect(cuts()[0]).toMatchObject({ face: 'thickness' });
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the width — reduce the removal first.');
  });
  it('refuses a face change that would remove more than the new face', async () => {
    const user = userEvent.setup();
    open(leg({ width: 4, thickness: 1 }));
    act(() => useStore.getState().addAngleCuts('leg', [taperCut({ face: 'width', from: 'min', end: 'min', start: 21, amount: 1.5 })]));
    await user.selectOptions(screen.getByLabelText('Face'), 'Thickness face — min side');
    expect(cuts()[0]).toMatchObject({ face: 'width', from: 'min' });
    expect(cuts()[0]!.points[0]![1]).toBe(1.5);
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the thickness — reduce the removal first.');
  });
  it('keeps one hook order when a row\'s cut changes kind in place (taper → miter → taper)', () => {
    const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.5], [20, 0]] };
    const miter: AngleCut = { id: 'a1', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0], [2, 2]] };
    const { rerender } = render(<AngleCuts board={leg({ angleCuts: [taper] })} />);
    expect(screen.getByLabelText('Starts')).toBeInTheDocument();
    rerender(<AngleCuts board={leg({ angleCuts: [miter] })} />);
    expect(screen.getByText(/^Miter 45\.0°/)).toBeInTheDocument();
    rerender(<AngleCuts board={leg({ angleCuts: [taper] })} />);
    expect(screen.getByLabelText('Starts')).toBeInTheDocument();
  });
});

describe('miters in the Angles section (spec §7, chunk 2)', () => {
  const rail = (over: Partial<Board> = {}) => leg({ length: 24, width: 2.5, thickness: 0.75, ...over });
  it('adds a miter from + Add ▾', async () => {
    const user = userEvent.setup();
    open(rail());
    await addMenu(user, 'Miter');
    expect(screen.getByText('Miter 45.0° across the width at the length max end, long point on the width min side')).toBeInTheDocument();
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
  it('a rail shortened past its miter: noted, and edits that go no deeper are taken (fu 296)', async () => {
    const user = userEvent.setup();
    open(rail());
    await addMenu(user, 'Miter');
    act(() => useStore.getState().updateBoard('leg', { length: 2 }));   // 45° across 2-1/2" now passes the 2" length
    expect(screen.getByText('This miter removes more than the length at this size.')).toBeInTheDocument();
    // Long point changes no depth: taken (was refused, the angle unreduced).
    await user.selectOptions(screen.getByLabelText('Long point'), 'max');
    expect(cuts()[0]).toMatchObject({ alongFrom: 'max' });
    expect(screen.queryByRole('alert')).toBeNull();
    // Across the thickness, 3/4" deep: it fits again, and the note goes.
    await user.selectOptions(screen.getByLabelText('Across'), 'thickness');
    expect(cuts()[0]).toMatchObject({ along: 'thickness' });
    expect(screen.queryByText(/at this size/)).toBeNull();
    // Back across the width would pass the length again from a cut that fits: refused, as before.
    await user.selectOptions(screen.getByLabelText('Across'), 'width');
    expect(cuts()[0]).toMatchObject({ along: 'thickness' });
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the length — reduce the angle first.');
  });
  it('a bevel whose part was made too thin for it: noted, and a long-point edit is taken (fu 296)', async () => {
    const user = userEvent.setup();
    open(rail());
    await addMenu(user, 'Bevel');
    const stored = cuts()[0]!;
    act(() => useStore.getState().updateBoard('leg', { width: 0.1 }));
    expect(screen.getByText(/^This bevel removes more than the width at this size\.$/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Long point'), 'max');
    expect(cuts()[0]).not.toEqual(stored);
    expect(screen.queryByRole('alert')).toBeNull();
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

describe('bevels and chamfers in the Angles section (chunk 3)', () => {
  const plank = (over: Partial<Board> = {}) => leg({ length: 20, width: 3, thickness: 0.75, ...over });
  it('adds a bevel and a chamfer from + Add ▾', async () => {
    const user = userEvent.setup();
    open(plank());
    await addMenu(user, 'Bevel');
    expect(screen.getByText(/^Bevel 15\.0° off the width face \(max side\)/)).toBeInTheDocument();
    await addMenu(user, 'Chamfer');
    expect(screen.getByText(/^Chamfer 1\/8" on the edge between/)).toBeInTheDocument();
  });
  it('edits a bevel angle exactly (45 → depth === run)', async () => {
    const user = userEvent.setup();
    open(plank());
    await addMenu(user, 'Bevel');
    const angle = screen.getByLabelText('Angle');
    await user.clear(angle); await user.type(angle, '45{Enter}');
    expect(cuts()[0]!.points[1]).toEqual([0.75, 0.75]);
  });
  it('refuses moving a steep bevel to a face too thin for it (Review Focus 4)', async () => {
    const user = userEvent.setup();
    open(plank({ width: 0.5, thickness: 3 }));
    act(() => useStore.getState().addAngleCuts('leg', [{ kind: 'bevel', face: 'thickness', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0], [0.5, 0.5 * Math.tan(Math.PI / 6)]] }]));
    const stored = cuts()[0]!;
    await user.selectOptions(screen.getByLabelText('Face'), 'Width face — max side');
    expect(cuts()[0]).toEqual(stored);
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the width — reduce the angle first.');
  });
  const chamferOn = (b: Board, e: { face: 'length' | 'width' | 'thickness'; from: 'min' | 'max'; along: 'length' | 'width' | 'thickness'; alongFrom: 'min' | 'max' }, leg: number) => {
    open(b);
    act(() => useStore.getState().addAngleCuts('leg', [chamferCut({ ...e, legFace: leg, legAlong: leg }, b)]));
  };
  it('edits a chamfer edge and each leg; refuses a leg past its face (Review Focus 3)', async () => {
    const user = userEvent.setup();
    open(plank());
    await addMenu(user, 'Chamfer');
    await user.selectOptions(screen.getByLabelText('Edge'), 'Width min side · thickness max side');
    expect(cuts()[0]).toMatchObject({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'max' });
    const wide = screen.getByLabelText('Into the width');
    await user.clear(wide); await user.type(wide, '1-1/2{Enter}');
    expect(cuts()[0]!.points).toEqual([[0, 1.5], [0.125, 0]]);              // only its own leg
    const deep = screen.getByLabelText('Into the thickness');
    await user.clear(deep); await user.type(deep, '1/2{Enter}');
    expect(cuts()[0]!.points).toEqual([[0, 1.5], [0.5, 0]]);
    await user.clear(deep); await user.type(deep, '1{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at most 3/4"');
    expect(cuts()[0]!.points).toEqual([[0, 1.5], [0.5, 0]]);
  });
  it('an unequal chamfer shows both legs — no mixed field (fu 298)', () => {
    const b = plank();
    open({ ...b, angleCuts: [{ id: 'c1', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 1.5, legAlong: 0.5 }, b) }] });
    expect(screen.getByLabelText('Into the width')).toHaveValue(formatLength(1.5, IMPERIAL));
    expect(screen.getByLabelText('Into the thickness')).toHaveValue(formatLength(0.5, IMPERIAL));
  });
  it('a leg a resize pushed past its part may be reduced, never deepened, and the other leg is untouched (fu 296)', async () => {
    const user = userEvent.setup();
    chamferOn(plank({ width: 3, thickness: 0.75 }), { face: 'width', from: 'max', along: 'thickness', alongFrom: 'max' }, 0.5);
    act(() => useStore.getState().updateBoard('leg', { thickness: 0.4 }));     // the thickness leg: 0.1 over
    const deep = screen.getByLabelText('Into the thickness');
    await user.clear(deep); await user.type(deep, '0.45{Enter}');           // still over, but less: allowed
    expect(cuts()[0]!.points).toEqual([[0, 0.5], [0.45, 0]]);
    await user.clear(deep); await user.type(deep, '0.6{Enter}');            // deeper than stored: refused
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at most');
    expect(cuts()[0]!.points).toEqual([[0, 0.5], [0.45, 0]]);
  });
  it('a chamfer bigger than its thinned edge: noted, and may move to an edge it overruns no further (fu 296)', async () => {
    const user = userEvent.setup();
    chamferOn(plank({ width: 3, thickness: 0.75 }), { face: 'width', from: 'max', along: 'thickness', alongFrom: 'max' }, 0.5);
    act(() => useStore.getState().updateBoard('leg', { thickness: 0.4 }));   // the thickness leg: 0.1 over
    expect(screen.getByText('This chamfer is bigger than its edge at this size.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Edge'), 'Width min side · thickness max side');   // the same 0.1 over
    expect(cuts()[0]).toMatchObject({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'max' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('refuses an edge change whose legs exceed the new edge (along-leg half), and a legal move clears the alert', async () => {
    const user = userEvent.setup();
    chamferOn(plank({ width: 3, thickness: 0.75 }), { face: 'length', from: 'max', along: 'width', alongFrom: 'max' }, 1);
    const stored = cuts()[0]!;
    const past = useStore.getState().past.length;
    const edge = screen.getByLabelText('Edge') as HTMLSelectElement;
    const before = edge.value;
    await user.selectOptions(edge, 'Width max side · thickness max side');
    expect(cuts()[0]).toEqual(stored);
    expect(useStore.getState().past.length).toBe(past);
    expect((screen.getByLabelText('Edge') as HTMLSelectElement).value).toBe(before);
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the thickness — reduce the size first.');
    await user.selectOptions(screen.getByLabelText('Edge'), 'Length min end · width max side');
    expect(cuts()[0]).toMatchObject({ face: 'length', from: 'min', along: 'width', alongFrom: 'max' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('refuses an edge change whose legs exceed the new edge (face-leg half)', async () => {
    const user = userEvent.setup();
    chamferOn(plank({ width: 1, thickness: 3 }), { face: 'length', from: 'max', along: 'thickness', alongFrom: 'max' }, 2);
    const stored = cuts()[0]!;
    await user.selectOptions(screen.getByLabelText('Edge'), 'Width max side · thickness max side');
    expect(cuts()[0]).toEqual(stored);
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the width — reduce the size first.');
  });
  it('withholds Bevel when the default 15 degrees would be deeper than the width (fu 296 sibling)', async () => {
    const user = userEvent.setup();
    open(plank({ width: 0.1, thickness: 0.75 }));
    await user.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getByRole('button', { name: 'Taper' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chamfer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bevel' })).toBeNull();
  });
  it('keeps a chamfer editable after the part is resized below its legs', () => {
    const b = plank();
    const c = { id: 'c1', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.125, legAlong: 0.125 }, b) };
    open({ ...b, thickness: 0.1, angleCuts: [c] });
    expect(screen.getByText(/^Chamfer 1\/8" on the edge between/)).toBeInTheDocument();
    expect(screen.getByLabelText('Edge')).toBeInTheDocument();
    expect(screen.getByLabelText('Into the width')).toBeInTheDocument();
    expect(screen.getByLabelText('Into the thickness')).toBeInTheDocument();
  });
  it('a hand-edited bevel the row cannot show gets its line and a remove button only', () => {
    const c: AngleCut = { id: 'a1', kind: 'bevel', face: 'width', from: 'max', along: 'length', alongFrom: 'min', points: [[0, 0], [10, 1]] };
    open(plank({ angleCuts: [c] }));
    expect(screen.getByText(/^Bevel /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove angle cut/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Angle')).toBeNull();
    expect(screen.queryByLabelText('Face')).toBeNull();
  });
});

describe('chamfer edge options (fu 299, fu 300)', () => {
  it('lists twelve short options in the bench vocabulary, a length side named as an end', async () => {
    const user = userEvent.setup();
    open(leg());
    await addMenu(user, 'Chamfer');
    const options = [...(screen.getByLabelText('Edge') as HTMLSelectElement).options].map((o) => o.textContent!);
    expect(options).toHaveLength(12);
    expect(new Set(options).size).toBe(12);
    expect(options).toContain('Width max side · thickness max side');
    expect(options).toContain('Length min end · width max side');
    expect(options.every((t) => !/length (min|max) side/.test(t))).toBe(true);
    expect(Math.max(...options.map((t) => t.length))).toBeLessThanOrEqual(36);
  });
});
