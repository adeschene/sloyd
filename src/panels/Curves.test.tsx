import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { archCurve, archFields, bowCurve, bowFields, cornerCurve, cornerFields, createBoard, createDocument, profileOf } from '../document/document';
import { loop, topCorners } from '../document/sweepFixtures';
import type { Board, CurveCut, HoleRow } from '../document/document';
import { Properties } from './Properties';
import { curveEditRefusal, refusalFor } from './curveRefusal';

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

  it('a Span under twice the Rise is refused (the loader drops an arc past a half circle)', async () => {
    const user = userEvent.setup();
    open(apron({ width: 30 }));
    await add(user, 'Arch');                                        // span 24, rise 1-1/2
    const span = await typeInto(user, 'Span', '2');
    expect(archFields(curves()[0]!)!.span).toBe(24);
    expect(span).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('An arc is at most a half circle — reduce the Rise first.');
    await typeInto(user, 'Span', '3');                              // exactly a half circle: accepted
    expect(archFields(curves()[0]!)).toMatchObject({ span: 3, rise: 1.5 });
  });

  it('a Bow\'s Rise past half its edge is refused in the same words', async () => {
    const user = userEvent.setup();
    open(apron({ length: 10, width: 30 }));
    await add(user, 'Bow');
    await typeInto(user, 'Rise', '6');                              // a 10" edge: at most 5
    expect(bowFields(curves()[0]!)!.rise).toBe(0.5);
    expect(screen.getByRole('alert')).toHaveTextContent('An arc is at most a half circle — reduce the Rise first.');
  });

  it('a select change that would store an arc past a half circle is refused: a faulted Bow re-seated through the length (fix round 1)', async () => {
    // A 30" bow on a 26" part runs off the length max end. Through → Length re-seats it along the thickness and refits it
    // to a 3/4" span at its 1/2" rise — past a half circle (the loader would drop it), and its new runs-off is the SAME
    // kind as the stored one, so only the shared half-circle check catches it.
    const user = userEvent.setup();
    const bow: CurveCut = { id: 'c1', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) };
    open(apron({ length: 26, curves: [bow] }));
    expect(screen.getByRole('status')).toHaveTextContent('Runs past the length max end at this size.');
    await user.selectOptions(screen.getByLabelText('Through'), 'length');
    expect(curves()[0]).toEqual(bow);
    expect(screen.getByRole('alert')).toHaveTextContent('An arc is at most a half circle — reduce the Rise first.');
    expect(screen.getByLabelText('Through')).toHaveValue('thickness');
  });

  it('a select change that runs a Bow off the part names the Rise, not a Span it has none of (finding 3)', async () => {
    // A 1" bow through the thickness, re-seated through the width: its depth is now the 3/4" thickness, so its end lines
    // run past the thickness max side. Not a half-circle (span 30) nor a cut-through: the runs-off words.
    const user = userEvent.setup();
    const bow: CurveCut = { id: 'c1', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 1 }) };
    open(apron({ curves: [bow] }));
    expect(screen.queryByRole('status')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Through'), 'width');
    expect(curves()[0]).toEqual(bow);
    expect(screen.getByRole('alert')).toHaveTextContent(/^Runs past the thickness max side — reduce the Rise first\.$/);
  });

  it('a select change that runs a Rounded corner off the part names its Radius (finding 3\'s twin)', () => {
    // The corner row lost its Through select (edge profiles brief Task 6), so the sizer is asserted on refusalFor itself:
    // a 1" corner through the thickness, re-seated through the width: the 3/4" thickness is now one of its legs' sides.
    const corner: CurveCut = { id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }) };
    const next = cornerCurve({ through: 'width', uFrom: 'min', vFrom: 'min', radius: 1 });
    expect(refusalFor(apron({ curves: [corner] }), corner, next, null)).toBe("A radius can't run past the thickness max side — reduce it first.");
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

  it('a curve edit is refused into a hole already past an edge (finding 2: the edge does not mask the curve)', async () => {
    const user = userEvent.setup();
    const bore = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.5, depth: 'through', along: 'length', alongFrom: 'min',
      station: 15, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.1 } as const;   // runs past the width min side
    const short = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 6, rise: 1 }) };
    open(apron({ holes: [bore], curves: [short] }));
    await typeInto(user, 'Span', '24');                                 // 3 to 27 takes in the bore at 15"
    expect(archFields(curves()[0]!)!.span).toBe(6);
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
    // From width (along the length) onto the length: the arch now runs along the width, the old through.
    await user.selectOptions(screen.getByLabelText('Through'), 'width');
    expect(archFields(curves()[0]!)).toMatchObject({ through: 'width', along: 'thickness' });
    act(() => useStore.getState().undo());
    act(() => useStore.getState().undo());
    expect(archFields(curves()[0]!)).toMatchObject({ through: 'thickness', along: 'length' });
    await user.selectOptions(screen.getByLabelText('Through'), 'width');
    expect(archFields(curves()[0]!)).toMatchObject({ through: 'width', along: 'length' });
    await user.selectOptions(screen.getByLabelText('Through'), 'length');
    expect(archFields(curves()[0]!)).toEqual({ through: 'length', along: 'width', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 });
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

describe('the Kind select (fu 367)', () => {
  const kind = () => screen.getByLabelText('Kind') as HTMLSelectElement;
  it('shows the stored kind; a notch reads as Half-round notch', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Half-round notch');
    expect(kind().value).toBe('notch');
  });
  it('Arch → Bow keeps the id and placement, one undo entry; undo restores the arch (Review Focus 4)', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Arch');
    const stored = curves()[0]!;
    const before = useStore.getState().past.length;
    await user.selectOptions(kind(), 'Bow');
    expect(curves()[0]!.id).toBe(stored.id);
    expect(bowFields(curves()[0]!)).toEqual({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 });
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(kind().value).toBe('bow');
    act(() => useStore.getState().undo());
    expect(curves()[0]).toEqual(stored);
  });
  it('an option that would be refused is disabled and says why (the notch from a 24" arch cuts through a 5" apron)', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Arch');
    act(() => kind().focus());
    expect(screen.getByRole('option', { name: 'Half-round notch — runs past the width max side' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Bow' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Arch' })).toBeEnabled();
  });
  it('options are judged on focus, not on every render (presets minors 1)', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Arch');
    expect(screen.getByRole('option', { name: 'Half-round notch' })).toBeEnabled();     // not judged yet
    act(() => kind().focus());
    expect(screen.getByRole('option', { name: 'Half-round notch — runs past the width max side' })).toBeDisabled();
    act(() => kind().blur());
    expect(screen.getByRole('option', { name: 'Half-round notch' })).toBeEnabled();     // dropped on blur
  });
  it('an option that would put a hole into the new waste is disabled (Review Focus 3)', () => {
    // A through hole 1" from the length-min end, 0.3" in from the width-min edge: clear of the Arch (it starts 3" in), inside
    // the Bow's waste there (the bow's edge 1" from the end sits ~0.435" in). Premise checked with holeFaults directly.
    const hole: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 'through', along: 'length', alongFrom: 'min',
      station: 1, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.3 };
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    open(apron({ holes: [hole], curves: [arch] }));
    act(() => kind().focus());
    expect(screen.getByRole('option', { name: 'Bow — puts hole 1 into the bow' })).toBeDisabled();
  });
  it('a kind change while focused re-judges the options for the new curve', async () => {
    const user = userEvent.setup();
    const hole: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 'through', along: 'length', alongFrom: 'min',
      station: 1, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.3 };
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    open(apron({ holes: [hole], curves: [arch] }));
    act(() => kind().focus());
    await user.selectOptions(kind(), 'Rounded corner');
    expect(kind().value).toBe('corner');
    expect(kind()).toHaveFocus();
    expect(screen.getByRole('option', { name: 'Bow — puts hole 1 into the bow' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Arch' })).toBeEnabled();
    // From the 24" arch the notch ran off the face; from the corner it is the 2" preset and fits: judged afresh.
    expect(screen.getByRole('option', { name: 'Half-round notch' })).toBeEnabled();
  });
  it('a curve no row represents has no Kind select', () => {
    const odd: CurveCut = { id: 'c1', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0],
      segments: [{ type: 'line', to: [2, 0] }, { type: 'line', to: [0, 1] }, { type: 'line', to: [0, 0] }] };
    open(apron({ curves: [odd] }));
    expect(screen.queryByLabelText('Kind')).toBeNull();
  });
  it("a corner → Arch keeps its corner's end and side", async () => {
    const user = userEvent.setup();
    open(apron({ curves: [{ id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'min', radius: 1 }) }] }));
    await user.selectOptions(kind(), 'Arch');
    expect(archFields(curves()[0]!)).toEqual({ through: 'thickness', along: 'length', side: 'min', from: 'max', start: 3, span: 24, rise: 1.25 });
  });
});

describe('preset details read the project units (presets minors 3)', () => {
  it('imperial keeps its text; metric reads mm', async () => {
    const user = userEvent.setup();
    open(apron());
    await user.click(screen.getByRole('button', { name: '+ Add curve' }));
    expect(screen.getByText('A half circle 2" wide, centred')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await user.click(screen.getByRole('button', { name: '+ Add curve' }));
    expect(screen.getByText('A half circle 51 mm wide, centred')).toBeInTheDocument();
  });
});

describe('Curves leaves profiles to the Profiles section (edge profiles spec §2.4)', () => {
  it('a stored through-length corner is not listed in Curves (Review Focus 1)', () => {
    open(apron({ profiles: [{ id: 'c1', ...profileOf(cornerCurve({ through: 'length', uFrom: 'max', vFrom: 'max', radius: 0.25 }))! }] }));
    expect(screen.queryByRole('button', { name: /^Remove curve/ })).toBeNull();
    expect(screen.queryByText(/^Curves · /)).toBeNull();
  });
  it('the Rounded corner row has no Through select', () => {
    open(apron({ curves: [{ id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }) }] }));
    expect(screen.queryByLabelText('Through')).toBeNull();
    expect(screen.getByLabelText('Radius')).toBeInTheDocument();
  });
  it('Kind offers Rounded corner only through the thickness', () => {
    open(apron({ length: 30, width: 0.75, thickness: 5,
      curves: [{ id: 'c1', ...archCurve({ through: 'width', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1 }) }] }));
    expect(screen.queryByRole('option', { name: /^Rounded corner/ })).toBeNull();
  });
});

// Profile runs b1, Review Focus 2: editing the curve under a swept profile. Every curve add, edit and remove judges each
// profile's faults before and after, and refuses one that ADDS a kind (decided before the store write).
describe('Curves refuses an edit that adds a profile fault (profile runs b1)', () => {
  const named = (b: Board) => ({ ...b, id: 'top', name: 'Top' });
  const radiusOf = (i: number) => cornerFields(curves()[i]!)!.radius;
  const LOOP_LINE = 'Roundover 1/4" all round the thickness face (max side)';

  it('a corner shrunk under the 1/4" loop\'s reach is refused in the profile fault\'s words, nothing stored', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2)));
    const radius = screen.getAllByLabelText('Radius')[0]!;          // the first corner row
    await user.clear(radius); await user.type(radius, '0.2{Enter}');
    expect(radiusOf(0)).toBe(2);
    expect(radius).toHaveAttribute('aria-invalid', 'true');
    // Fix round 1 (the user's ruling): the Curves row names the profile; "the size" would read as the corner's.
    expect(screen.getByRole('alert').textContent).toBe('Too tight for the roundover — reduce the roundover first.');
  });

  it('under a 3/8" cove loop, a corner shrunk to 0.3 is refused naming the cove', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2, loop('p1', 0.375, 'cove'))));
    const radius = screen.getAllByLabelText('Radius')[0]!;
    await user.clear(radius); await user.type(radius, '0.3{Enter}');
    expect(radiusOf(0)).toBe(2);
    expect(screen.getByRole('alert').textContent).toBe('Too tight for the cove — reduce the cove first.');
  });

  it('the other kinds a curve edit could add read the same shape, from the fault words (words only)', () => {
    const ogee = loop('p1', 0.5, 'ogee');
    expect(curveEditRefusal({ kind: 'runs-off' }, ogee)).toBe('The Roman ogee runs off the part — reduce the Roman ogee first.');
    expect(curveEditRefusal({ kind: 'overlap', other: 'p2' }, loop('p1'))).toBe('The roundover overlaps another profile on this edge — move the roundover first.');
    expect(curveEditRefusal({ kind: 'too-tight' }, { ...loop('p1'), kind: 'thumbnail', depth: 0.25 })).toBe('Too tight for the thumbnail — reduce the thumbnail first.');
  });

  it('growing a corner to 3" is accepted; the loop re-routes, its bench line unchanged', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2)));
    expect(screen.getByText(LOOP_LINE)).toBeInTheDocument();
    const radius = screen.getAllByLabelText('Radius')[0]!;
    await user.clear(radius); await user.type(radius, '3{Enter}');
    expect(radiusOf(0)).toBe(3);
    expect(screen.getByText(LOOP_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('removing a corner under the loop is accepted', async () => {
    const user = userEvent.setup();
    open(named(topCorners(2)));
    await user.click(screen.getAllByRole('button', { name: /^Remove curve/ })[0]!);
    expect(curves()).toHaveLength(3);
    expect(screen.getByText(LOOP_LINE)).toBeInTheDocument();
  });

  it('a profile already too tight (stored) does not refuse an edit that adds nothing new', async () => {
    const user = userEvent.setup();
    open(named(topCorners(0.2)));                                    // every corner under the 1/4" reach: too-tight stored
    const radius = screen.getAllByLabelText('Radius')[0]!;
    await user.clear(radius); await user.type(radius, '0.3{Enter}'); // three corners still too tight: nothing ADDED
    expect(radiusOf(0)).toBe(0.3);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a Rounded corner preset under a loop whose reach is over its radius is withheld; offered under a smaller loop', async () => {
    const user = userEvent.setup();
    const part = (size: number) => createBoard({ id: 'top', name: 'Top', length: 30, width: 10, thickness: 0.75,
      profiles: [{ ...loop('w1', size, 'thumbnail'), depth: 0.25 }] });
    open(part(1.25));                                                // the default corner is 1": a 1-1/4" reach is too tight
    await user.click(screen.getByRole('button', { name: '+ Add curve' }));
    expect(screen.queryByRole('button', { name: 'Rounded corner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rounded corners' })).toBeNull();
    document.body.innerHTML = '';
    open(part(0.75));
    await user.click(screen.getByRole('button', { name: '+ Add curve' }));
    expect(screen.getByRole('button', { name: 'Rounded corner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rounded corners' })).toBeInTheDocument();
  });
});
