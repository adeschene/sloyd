import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { archFields, bowFields, createBoard, createDocument } from '../document/document';
import type { Board, CurveCut } from '../document/document';
import { Properties } from './Properties';

const apron = (over: Partial<Board> = {}) => createBoard({ id: 'apron', name: 'Apron', length: 30, width: 5, thickness: 0.75, ...over });
const open = (b: Board) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards: [b] });
  useStore.getState().selectBoard(b.id);
  render(<Properties />);
};
const add = async (user: ReturnType<typeof userEvent.setup>, item: string) => {
  await user.click(screen.getByRole('button', { name: '+ Add curve' }));
  await user.click(screen.getByRole('button', { name: item }));
};
const curves = () => (useStore.getState().doc.boards[0] as Board).curves;
const typeInto = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => {
  const el = screen.getByLabelText(label);
  await user.clear(el); await user.type(el, `${text}{Enter}`);
  return el;
};

describe('the Curves section', () => {
  it('adds an Arch and shows its bench line', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Arch');
    expect(curves()).toHaveLength(1);
    expect(archFields(curves()[0]!)).toEqual({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 });
    expect(screen.getByText(/^Arch on the width min side, 3" in from each length end/)).toBeInTheDocument();
  });

  it('"Rounded corners" adds four curves in one undo entry and shows four rows', async () => {
    const user = userEvent.setup();
    open(apron());
    const before = useStore.getState().past.length;
    await add(user, 'Rounded corners');
    expect(curves()).toHaveLength(4);
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(screen.getAllByRole('button', { name: /^Remove curve/ })).toHaveLength(4);
    act(() => useStore.getState().undo());
    expect(curves()).toEqual([]);
  });

  it('a Rise over half the span is refused by the field, the stored rise unchanged, focus kept', async () => {
    const user = userEvent.setup();
    open(apron({ width: 30 }));                                   // room for the arc: only the half-circle rule refuses
    await add(user, 'Arch');
    const rise = await typeInto(user, 'Rise', '13');                // span 24: at most 12
    expect(archFields(curves()[0]!)!.rise).toBe(1.5);
    expect(screen.getByRole('alert')).toHaveTextContent('An arc is at most a half circle — reduce the Rise first.');
    expect(rise).toHaveFocus();
    expect(rise).toHaveAttribute('aria-invalid', 'true');
  });

  it('a Rise that cuts through the part is refused in words', async () => {
    const user = userEvent.setup();
    open(apron({ width: 1.5 }));                                   // default rise 3/8, span 24: room along the length
    await add(user, 'Arch');
    await typeInto(user, 'Rise', '1-1/2');
    expect(archFields(curves()[0]!)!.rise).toBe(0.375);
    expect(screen.getByRole('alert')).toHaveTextContent('Removes more than the width — reduce the Rise first.');
  });

  it('an arch a resize faulted is kept with a note; an edit that adds nothing is accepted and Span 20 clears it (Review Focus 1)', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Arch');
    act(() => useStore.getState().updateBoard('apron', { length: 26 }));
    expect(archFields(curves()[0]!)).toMatchObject({ start: 3, span: 24 });            // kept, never trimmed
    expect(screen.getByRole('status')).toHaveTextContent('Runs past the length max end at this size.');
    // Still running off (3 to 27 on 26), but the edit ADDS no fault: accepted.
    await typeInto(user, 'Rise', '1');
    expect(archFields(curves()[0]!)!.rise).toBe(1);
    expect(screen.queryByRole('alert')).toBeNull();
    // 3 to 23 fits a 26" apron: the fault clears.
    await typeInto(user, 'Span', '20');
    expect(archFields(curves()[0]!)).toMatchObject({ start: 3, span: 20, rise: 1 });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/at this size\.$/)).toBeNull();
  });

  it('an edit that would put a hole into the curve\'s waste is refused with the hole\'s words', async () => {
    const user = userEvent.setup();
    const bore = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 'through', along: 'length', alongFrom: 'min',
      station: 15, count: 1, pitch: 0, acrossFrom: 'min', inset: 2 } as const;
    open(apron({ holes: [bore] }));
    await add(user, 'Arch');                                        // rise 1-1/4: the bore's near rim is at 1-7/8
    await typeInto(user, 'Rise', '1.9');
    expect(archFields(curves()[0]!)!.rise).toBe(1.25);
    expect(screen.getByRole('alert')).toHaveTextContent('Puts hole 1 into the arch — move it first.');
  });

  it('Through: switching an Arch to Width re-seats it on the thickness sides', async () => {
    const user = userEvent.setup();
    open(apron({ thickness: 3 }));                                  // 1-1/4" rise fits a 3" thickness
    await add(user, 'Arch');
    await user.selectOptions(screen.getByLabelText('Through'), 'width');
    expect(curves()[0]).toMatchObject({ through: 'width' });
    expect(archFields(curves()[0]!)).toMatchObject({ through: 'width', along: 'length', side: 'min', start: 3, span: 24, rise: 1.25 });
    const sides = [...(screen.getByLabelText('Side') as HTMLSelectElement).options].map((o) => o.textContent);
    expect(sides).toEqual(['Thickness min side', 'Thickness max side']);
  });

  it('Through onto the arch\'s own direction re-seats it along the old through', async () => {
    const user = userEvent.setup();
    open(apron({ width: 30, thickness: 30 }));                     // a cube: every face holds the 24" arch
    await add(user, 'Arch');
    await user.selectOptions(screen.getByLabelText('Through'), 'length');
    expect(archFields(curves()[0]!)).toEqual({ through: 'length', along: 'thickness', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 });
  });

  it('a preset whose default is null or faults is withheld', async () => {
    const user = userEvent.setup();
    open(apron({ length: 5 }));                                    // no span left for an Arch
    await user.click(screen.getByRole('button', { name: '+ Add curve' }));
    expect(screen.queryByRole('button', { name: 'Arch' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rounded corner' })).toBeInTheDocument();
  });

  it('a preset that exists but would fault is withheld: a 1" notch rise cuts through 3/4" of width', async () => {
    const user = userEvent.setup();
    open(apron({ width: 0.75, thickness: 0.5 }));
    await user.click(screen.getByRole('button', { name: '+ Add curve' }));
    expect(screen.queryByRole('button', { name: 'Half-round notch' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Arch' })).toBeInTheDocument();
  });

  it('removes a curve', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Bow');
    await user.click(screen.getByRole('button', { name: /^Remove curve \(Bow the width min side/ }));
    expect(curves()).toEqual([]);
  });

  it('a curve with no canonical form shows only its bench line and Remove', () => {
    const triangle: CurveCut = { id: 'c9', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0],
      segments: [{ type: 'line', to: [2, 0] }, { type: 'line', to: [0, 2] }, { type: 'line', to: [0, 0] }] };
    open(apron({ curves: [triangle] }));
    expect(screen.getByText('Curve cut through the thickness: 0 arcs and 3 lines')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Remove curve/ })).toBeInTheDocument();
    for (const label of ['Through', 'Side', 'From', 'Start', 'Span', 'Rise', 'Radius', 'Corner']) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('a Bow edit refits it to the current edge (P2), and a stale span shows the note', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Bow');
    act(() => useStore.getState().updateBoard('apron', { length: 36 }));
    expect(bowFields(curves()[0]!)!.span).toBe(30);                 // a resize does not stretch it
    expect(screen.getByText('Spans 30" of this 36" length — change the Rise to refit it.')).toBeInTheDocument();
    await typeInto(user, 'Rise', '3/4');
    expect(bowFields(curves()[0]!)).toMatchObject({ span: 36, rise: 0.75 });
    expect(screen.queryByText(/change the Rise to refit it\.$/)).toBeNull();
  });
});
