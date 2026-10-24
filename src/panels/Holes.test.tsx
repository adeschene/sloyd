import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument, defaultProfile, isSocketOf, migrateDocument, worldParts } from '../document/document';
import { stoolDocument, stoolLegs, stoolSeat } from '../document/stoolFixture';
import type { Board } from '../document/document';
import { ARCH } from '../document/curveFixtures';
import { Properties } from './Properties';
import { holeLengthText } from '../document/holeText';
import { slopeOf } from '../document/lean';

const side = (over: Partial<Board> = {}) => createBoard({ id: 'side', name: 'Side', length: 30, width: 11.25, thickness: 0.75, ...over });
const open = (b: Board) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards: [b] });
  useStore.getState().selectBoard('side');
  render(<Properties />);
};
const add = async (user: ReturnType<typeof userEvent.setup>, item: string) => {
  await user.click(screen.getByRole('button', { name: '+ Add hole' }));
  await user.click(screen.getByRole('button', { name: item }));
};
const rows = () => (useStore.getState().doc.boards[0] as Board).holes;

describe('the Holes section', () => {
  it('adds a shelf-pin row and shows its bench line', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    expect(rows()[0]).toMatchObject({ count: 21, station: 2 });
    expect(screen.getByText(/^Row of 21 holes 1\/4" dia × 3\/8" deep/)).toBeInTheDocument();
    // Every shows the pitch at 1/64 at least, as the bench line does (spec §4.1, amended): 32 mm = 81/64 at 1/64,
    // where the document's 1/16 would read 1-1/4".
    expect(screen.getByLabelText('Every')).toHaveValue('1-17/64"');
  });
  it('the Angles menu is still "+ Add" (two popovers do not collide)', () => {
    open(side());
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add hole' })).toBeInTheDocument();
  });
  it('refuses a count that runs off the part, keeping the stored count and focus', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '24{Enter}');
    expect(rows()[0]!.count).toBe(21);
    expect(screen.getByRole('alert')).toHaveTextContent('Puts hole 24 past the length max end');
    // Ruling R6: the refused field keeps what was typed, and focus, rather than reading 24 beside "Row of 21".
    expect(count).toHaveFocus();
    expect(count).toHaveValue('24');
  });
  it('a refused Count keeps its own error through a sibling\'s successful edit, and an untouched blur commits nothing (ruling R7)', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '24{Enter}');
    expect(count).toHaveFocus();
    // A valid First at edit (1-1/2": the last of 21 at 1.5 + 20 x 32mm = 26.7" still fits) succeeds beside it.
    const first = screen.getByLabelText('First at');
    await user.clear(first); await user.type(first, '1-1/2{Enter}');
    expect(rows()[0]!.station).toBe(1.5);
    expect(count).toHaveValue('24');
    expect(count).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Puts hole 24 past the length max end');
    expect(rows()[0]!.count).toBe(21);
    // Focus and blur Count with nothing typed: no silent commit.
    await user.click(count);
    await user.tab();
    expect(rows()[0]!.count).toBe(21);
  });
  it('accepts 23, the most that fit', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '23{Enter}');
    expect(rows()[0]!.count).toBe(23);
  });
  it('a row a resize faulted shows a note, and an edit that removes the fault is accepted (Review Focus 2)', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    act(() => useStore.getState().updateBoard('side', { length: 26 }));
    expect(rows()[0]!.count).toBe(21);                                     // kept, never trimmed
    // At length 26 hole k (1-based) breaks out when 2 + (k-1)·32mm + 1/8 > 26: k = 20 and 21. The note names the first.
    expect(screen.getByText(/^Hole 20 runs past the length max end at this size\. \(and 1 more\)$/)).toBeInTheDocument();
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '20{Enter}');      // still faulted (hole 20) but ADDS nothing
    expect(rows()[0]!.count).toBe(20);
  });
  it('Through hides Depth and stores through; unchecking restores a depth', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Hole');
    await user.click(screen.getByLabelText('Through'));
    expect(rows()[0]!.depth).toBe('through');
    expect(screen.queryByLabelText('Depth')).toBeNull();
    await user.click(screen.getByLabelText('Through'));
    expect(rows()[0]!.depth).toBe(0.375);
  });
  it('unchecking Through on an end-grain row seeds a bench depth, not half the part (final review 3)', async () => {
    // A dowel bore in the length max end of a 30" rail: half the face dimension would be 15"; the seed is capped at 1/2".
    const user = userEvent.setup();
    const dowel = { id: 'h1', face: 'length', from: 'max', diameter: 0.375, depth: 'through', along: 'width', alongFrom: 'min',
      station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.375 } as const;
    open(side({ holes: [dowel] }));
    await user.click(screen.getByLabelText('Through'));
    expect(rows()[0]!.depth).toBe(0.5);
  });
  it('accepts a metric pitch exactly', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const every = screen.getByLabelText('Every');
    await user.clear(every); await user.type(every, '30mm{Enter}');     // 21 holes at 30 mm: last centre 25.6" on 30"
    expect(rows()[0]!.pitch).toBe(30 / 25.4);
  });
  it('adds a hinge cup; its line prints the millimetres', async () => {
    const user = userEvent.setup();
    open(side({ length: 20, width: 15 }));
    await add(user, 'Hinge cup');
    expect(rows()[0]).toMatchObject({ diameter: 35 / 25.4, depth: 0.5, station: 3, count: 1 });
    expect(screen.getByText(/^Hole 1-3\/8" \(35 mm\) dia × 1\/2" deep/)).toBeInTheDocument();
  });
  it('withholds the hinge cup on stock too thin for a 1/2" cup', async () => {
    const user = userEvent.setup();
    open(side({ length: 20, width: 15, thickness: 0.5 }));
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.queryByRole('button', { name: 'Hinge cup' })).toBeNull();
  });
  it('withholds a preset that would fault on this part', async () => {
    const user = userEvent.setup();
    open(side({ length: 3, width: 3 }));
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.queryByRole('button', { name: 'Shelf-pin row' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hole' })).toBeInTheDocument();
  });
  it('withholds a preset that exists but would fault: 3/8" pins in 3/8" stock are too deep', async () => {
    // The 3x3 case above has no preset at all (null); this one has 21 pins whose depth equals the stock (too-deep's
    // >= rule), so only fits() withholds it. The Hole preset is through on stock 1/2" or thinner, so it is offered.
    const user = userEvent.setup();
    open(side({ thickness: 0.375 }));
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.queryByRole('button', { name: 'Shelf-pin row' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hole' })).toBeInTheDocument();
  });
  it('withholds both presets on a part narrower than the bit, and says so instead of an empty menu', () => {
    // 10 x 0.2 x 0.2: the broad face is thickness (a tie goes to the later), across is width 0.2, so a centred 1/4" bore
    // (radius 1/8 > 0.1) breaks out of the width sides for the Hole and every pin.
    open(side({ length: 10, width: 0.2, thickness: 0.2 }));
    expect(screen.queryByRole('button', { name: '+ Add hole' })).toBeNull();
    expect(screen.getByText('No hole preset fits this part.')).toBeInTheDocument();
  });
  it('a single hole becomes a row: raising Count seeds a 32 mm pitch in the same edit (ruling R5)', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Hole');
    expect(rows()[0]!.pitch).toBe(0);
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '3{Enter}');
    expect(rows()[0]).toMatchObject({ count: 3, pitch: 32 / 25.4 });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('a bore 32 mm or wider seeds twice its diameter (ruling R5)', async () => {
    const user = userEvent.setup();
    const big = { id: 'h1', face: 'thickness', from: 'max', diameter: 1.5, depth: 0.5, along: 'length', alongFrom: 'min',
      station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 5 } as const;
    open(side({ holes: [big] }));
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '2{Enter}');
    expect(rows()[0]).toMatchObject({ count: 2, pitch: 3 });
  });
  it('Every is hidden at count 1 and shown at 2', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Hole');
    expect(screen.queryByLabelText('Every')).toBeNull();
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '2{Enter}');
    expect(screen.getByLabelText('Every')).toHaveValue('1-17/64"');
  });
  it.each([
    ['1.5', 'Enter a whole number of holes, e.g. 12'],
    ['0', 'Must be at least 1'],
    ['501', 'Must be at most 500'],
  ])('Count refuses %s and keeps the stored count', async (typed, message) => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, `${typed}{Enter}`);
    expect(rows()[0]!.count).toBe(21);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });
  it('a face change onto the row\'s direction swaps the two', async () => {
    // A hole 1/2" along the length and 1/2" in from the width min side, 1/4" deep. Moved onto the length min end, the row
    // now runs along the thickness (the old face): 1/2" along 3/4" stock and 1/4" into a 30" length both fit.
    const user = userEvent.setup();
    const h = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.25, along: 'length', alongFrom: 'min',
      station: 0.5, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.5 } as const;
    open(side({ holes: [h] }));
    await user.selectOptions(screen.getByLabelText('Face'), 'length|min');
    expect(rows()[0]).toMatchObject({ face: 'length', from: 'min', along: 'thickness', acrossFrom: 'min', inset: 0.5 });
  });
  it('too-deep is a row-level fault: noted once, and the count can still change', async () => {
    const user = userEvent.setup();
    const deep = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 1, along: 'length', alongFrom: 'min',
      station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 } as const;
    open(side({ holes: [deep] }));
    expect(screen.getByText('The holes are deeper than the thickness at this size.')).toBeInTheDocument();
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '22{Enter}');
    expect(rows()[0]!.count).toBe(22);
  });
  it('a row thinned under its depth: the bench line and the note both count too-deep once (final review 1)', () => {
    const pins = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
      station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 } as const;
    open(side({ thickness: 0.375, holes: [pins] }));
    expect(screen.getByText(/ — check: the holes are deeper than the thickness$/)).toBeInTheDocument();
    expect(screen.getByText('The holes are deeper than the thickness at this size.')).toBeInTheDocument();
    expect(screen.queryByText(/more\)$/)).toBeNull();
  });
  it('the Shelf-pin row names its real direction', async () => {
    const user = userEvent.setup();
    open(side({ length: 10, width: 30 }));
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.getByText('¼" pins every 32 mm along the width')).toBeInTheDocument();
  });
  it('a row label reads "Row of 6", not capitalised word by word like a cut kind (final review 7)', () => {
    // jsdom applies no stylesheet, so the label is pinned two ways: the span carries hole-label beside cut-label, and
    // styles.css gives that pair text-transform: none (cut-label's capitalize would print "Row Of 6"). Not `?raw`:
    // Vitest hands CSS back as '' (palette.test.ts reads it the same way).
    const six = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
      station: 2, count: 6, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 } as const;
    open(side({ holes: [six] }));
    const label = screen.getByText('Row of 6');
    expect(label).toHaveClass('cut-label', 'hole-label');
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/\.cut-label\.hole-label\s*\{[^}]*text-transform:\s*none;/);
  });
  it('removes a row', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Hole');
    await user.click(screen.getByRole('button', { name: /Remove hole row/ }));
    expect(rows()).toEqual([]);
  });
  it('a metric project shows a shelf-pin row\'s Every and Diameter in mm (spec R7)', async () => {
    const user = userEvent.setup();
    open(side());
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await add(user, 'Shelf-pin row');
    expect(screen.getByLabelText('Every')).toHaveValue('32 mm');
    expect(screen.getByLabelText('Diameter')).toHaveValue('6.4 mm');
  });
  it('Every and Diameter are the bench line\'s own strings, in either units (one formatter, inv 19)', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const r = rows()[0]!;
    for (const display of ['imperial-fractional', 'metric-mm'] as const) {
      act(() => useStore.getState().setUnitsDisplay(display));
      const units = useStore.getState().doc.units;
      expect(screen.getByLabelText('Every')).toHaveValue(holeLengthText(r.pitch, units, 'pitch'));
      expect(screen.getByLabelText('Diameter')).toHaveValue(holeLengthText(r.diameter, units, 'diameter'));
    }
    expect(screen.getByLabelText('Every')).toHaveValue('32 mm');
    act(() => useStore.getState().setUnitsDisplay('imperial-fractional'));
    expect(screen.getByLabelText('Every')).toHaveValue('1-17/64"');
  });
  it('an edit that puts a hole into a curve\'s waste is refused in words, keeping the stored inset (curves Task 10)', async () => {
    const user = userEvent.setup();
    const bore = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.5, depth: 'through', along: 'length', alongFrom: 'min',
      station: 15, count: 1, pitch: 0, acrossFrom: 'min', inset: 3 } as const;
    open(side({ width: 5, curves: [ARCH], holes: [bore] }));
    const inset = screen.getByLabelText('In from');
    await user.clear(inset); await user.type(inset, '1{Enter}');            // the arch's waste runs to v = 1.5 at 15"
    expect(rows()[0]!.inset).toBe(3);
    expect(screen.getByRole('alert')).toHaveTextContent('Puts hole 1 into the arch — move it first.');
  });
  // Task 7 fix round 2 (R3): a hole edited into an edge profile's waste names the profile, never "the rounded corner".
  it.each([['roundover', '0.1', 'the roundover'], ['cove', '0.3', 'the cove']] as const)(
    'an edit that puts a hole into a %s profile\'s waste names it', async (kind, to, word) => {
      const user = userEvent.setup();
      const bore = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.0625, depth: 0.0625, along: 'length', alongFrom: 'min',
        station: 15, count: 1, pitch: 0, acrossFrom: 'max', inset: 0.5 } as const;
      const b = side();
      open({ ...b, holes: [bore], curves: [{ id: 'p1', ...defaultProfile(b, kind) }] });
      const inset = screen.getByLabelText('In from');
      await user.clear(inset); await user.type(inset, `${to}{Enter}`);
      expect(rows()[0]!.inset).toBe(0.5);
      expect(screen.getByRole('alert')).toHaveTextContent(`Puts hole 1 into ${word} — move it first.`);
    });
  // Whole-branch review, finding 2: an edge breaks-out and a curve breaks-out are different faults (faultKey names the
  // curve), so a hole ALREADY past an edge is still refused into the arch's waste — and one already in both may be edited.
  const pastEdge = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.5, depth: 'through', along: 'length', alongFrom: 'min',
    station: 15, count: 1, pitch: 0, acrossFrom: 'max', inset: 0.1 } as const;   // runs past the width max side
  it('a hole already past an edge is still refused into the arch\'s waste (finding 2)', async () => {
    const user = userEvent.setup();
    open(side({ width: 5, curves: [ARCH], holes: [pastEdge] }));
    await user.selectOptions(document.getElementById('hole-side-h1')!, 'min');   // 0.1" in from the arched side, at 15"
    expect(rows()[0]!.acrossFrom).toBe('max');
    expect(screen.getByRole('alert')).toHaveTextContent('Puts hole 1 into the arch — move it first.');
  });
  it('a hole already past an edge AND in the arch\'s waste can still be edited (it adds no fault)', async () => {
    const user = userEvent.setup();
    open(side({ width: 5, curves: [ARCH], holes: [{ ...pastEdge, acrossFrom: 'min' }] }));
    const dia = screen.getByLabelText('Diameter');
    await user.clear(dia); await user.type(dia, '3/8{Enter}');
    expect(rows()[0]!.diameter).toBe(0.375);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('preset details read the project units (presets minors 3)', () => {
  it('imperial keeps its text; metric reads mm', async () => {
    const user = userEvent.setup();
    open(side());
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.getByText('¼" pins every 32 mm along the length')).toBeInTheDocument();
    expect(screen.getByText('35 mm cup, ½" deep, 22.5 mm in from the edge')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    act(() => useStore.getState().setUnitsDisplay('metric-mm'));
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.getByText('6.4 mm pins every 32 mm along the length')).toBeInTheDocument();
    expect(screen.getByText('35 mm cup, 12.7 mm deep, 22.5 mm in from the edge')).toBeInTheDocument();
  });
});

// Angled holes §4 (Task 9): a row's tilt is two magnitude fields, each with the end or side it leans toward.
describe('tilting a row', () => {
  const H = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
    station: 6, count: 1, pitch: 0, acrossFrom: 'min', inset: 4 } as const;
  const T = (deg: number) => Math.tan((deg * Math.PI) / 180);

  it('a square row reads 0 in both, with no readout', () => {
    open(side({ holes: [H] }));
    expect(screen.getByLabelText('Tilt toward end')).toHaveValue('0.0°');
    expect(screen.getByLabelText('Tilt toward side')).toHaveValue('0.0°');
    expect(screen.queryByText(/off square ·/)).toBeNull();
  });

  it('Tilt toward end 10 with the far-end select writes tiltAlong = tan 10° and leaves tiltAcross untouched', async () => {
    const user = userEvent.setup();
    const c = -T(5) / 3;
    open(side({ holes: [{ ...H, tiltAcross: c }] }));
    await user.selectOptions(screen.getByLabelText('Tilt end'), 'max');
    const f = screen.getByLabelText('Tilt toward end');
    await user.clear(f); await user.type(f, '10{Enter}');
    expect(rows()[0]!.tiltAlong).toBe(slopeOf(10));
    expect(rows()[0]!.tiltAcross).toBe(c);
    expect(useStore.getState().past.length).toBe(1);
  });

  it('the near-end select leans it the other way; switching the select on a tilted row negates the slope exactly', async () => {
    const user = userEvent.setup();
    open(side({ holes: [H] }));
    await user.selectOptions(screen.getByLabelText('Tilt end'), 'min');
    const f = screen.getByLabelText('Tilt toward end');
    await user.clear(f); await user.type(f, '10{Enter}');
    expect(rows()[0]!.tiltAlong).toBe(-slopeOf(10));
    expect(screen.getByLabelText('Tilt end')).toHaveValue('min');
    await user.selectOptions(screen.getByLabelText('Tilt end'), 'max');
    expect(rows()[0]!.tiltAlong).toBe(slopeOf(10));
    // A typed magnitude keeps the stored direction.
    await user.clear(f); await user.type(f, '12{Enter}');
    expect(rows()[0]!.tiltAlong).toBe(slopeOf(12));
  });

  it('Tilt toward side writes tiltAcross toward the side named', async () => {
    const user = userEvent.setup();
    open(side({ holes: [{ ...H, acrossFrom: 'max' }] }));
    await user.selectOptions(screen.getByLabelText('Tilt side'), 'min');
    const f = screen.getByLabelText('Tilt toward side');
    await user.clear(f); await user.type(f, '20{Enter}');
    expect(rows()[0]!.tiltAcross).toBe(slopeOf(20));   // min is the far side from acrossFrom 'max'
    expect('tiltAlong' in rows()[0]!).toBe(false);
  });

  it('typing both angles back to 0 leaves no tilt key', async () => {
    const user = userEvent.setup();
    open(side({ holes: [{ ...H, tiltAlong: T(10), tiltAcross: T(5) }] }));
    for (const label of ['Tilt toward end', 'Tilt toward side']) {
      const f = screen.getByLabelText(label);
      await user.clear(f); await user.type(f, '0{Enter}');
    }
    expect(Object.keys(rows()[0]!).some((k) => k.startsWith('tilt'))).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('changing From keeps the bore\'s direction (retilt): the stored slope flips with the flag', async () => {
    const user = userEvent.setup();
    open(side({ holes: [{ ...H, tiltAlong: T(10), tiltAcross: T(5) }] }));
    await user.selectOptions(screen.getByLabelText('From'), 'max');
    expect(rows()[0]).toMatchObject({ alongFrom: 'max', tiltAlong: -T(10), tiltAcross: T(5) });
    // The select still names the same end of the part (the bit still leans toward the length max end).
    expect(screen.getByLabelText('Tilt end')).toHaveValue('max');
  });

  it('a diameter edit keeps the tilt exactly; a face change is a new bore (square)', async () => {
    const user = userEvent.setup();
    open(side({ holes: [{ ...H, tiltAlong: T(10) }] }));
    const d = screen.getByLabelText('Diameter');
    await user.clear(d); await user.type(d, '3/8{Enter}');
    expect(rows()[0]).toMatchObject({ diameter: 0.375, tiltAlong: T(10) });
    await user.selectOptions(screen.getByLabelText('Face'), 'thickness|min');
    expect('tiltAlong' in rows()[0]!).toBe(false);
  });

  it('the readout on a tilted row: the angle off square and the sightline from the along dimension', () => {
    open(side({ holes: [{ ...H, tiltAlong: 0.2, tiltAcross: 0.15 }] }));
    // atan(hypot(0.2, 0.15)) = atan(0.25) = 14.04°; atan2(0.15, 0.2) = 36.87°.
    expect(screen.getByText('Bore 14.0° off square · sightline 36.9° from the length')).toBeInTheDocument();
  });

  it('a tilt past 45° in all is refused as the field\'s own error, nothing stored', async () => {
    const user = userEvent.setup();
    open(side({ holes: [{ ...H, tiltAlong: T(40) }] }));
    const f = screen.getByLabelText('Tilt toward side');
    await user.clear(f); await user.type(f, '40{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent("The bore can't tilt past 45° in all — reduce an angle.");
    expect(f).toHaveValue('40');
    expect('tiltAcross' in rows()[0]!).toBe(false);
  });

  it('a holed leaning part shows the Holes section working: a row can be tilted there too', async () => {
    const user = userEvent.setup();
    open(side({ length: 16, width: 1.5, thickness: 1.25, posture: 'upright', lean: { x: T(12), z: T(8), face: 'width' },
      holes: [{ ...H, face: 'width', from: 'min', station: 4, inset: 0.625 }] }));
    const f = screen.getByLabelText('Tilt toward end');
    await user.clear(f); await user.type(f, '10{Enter}');
    expect(rows()[0]!.tiltAlong).toBe(slopeOf(10));
  });
});

describe('Bore leg sockets (angled holes §5)', () => {
  const openPart = (doc: ReturnType<typeof stoolDocument>, name: string) => {
    useStore.getState().replaceDocument(doc);
    const id = worldParts(useStore.getState().doc).find((b) => b.name === name)!.id;
    useStore.getState().selectBoard(id);
    render(<Properties />);
    return id;
  };
  const seat = () => worldParts(useStore.getState().doc).find((b) => b.name === 'Seat')!;

  it('the button shows on a part with leaning legs under it, and bores a socket per leg', async () => {
    const user = userEvent.setup();
    openPart(stoolDocument(), 'Seat');
    expect(screen.getByLabelText('Socket diameter')).toHaveValue('1"');
    await user.click(screen.getByRole('button', { name: 'Bore leg sockets' }));
    expect(seat().holes).toHaveLength(4);
    expect(seat().holes.every((r) => r.diameter === 1 && r.depth === 'through')).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the typed diameter is used, and a refusal shows', async () => {
    const user = userEvent.setup();
    openPart(stoolDocument(), 'Seat');
    const d = screen.getByLabelText('Socket diameter');
    await user.clear(d); await user.type(d, '1-1/2{Enter}');
    await user.click(screen.getByRole('button', { name: 'Bore leg sockets' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The socket must be narrower than Front right.');
    expect(seat().holes).toHaveLength(0);
    await user.clear(d); await user.type(d, '3/4{Enter}');
    await user.click(screen.getByRole('button', { name: 'Bore leg sockets' }));
    expect(seat().holes.map((r) => r.diameter)).toEqual([0.75, 0.75, 0.75, 0.75]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('not shown on a leg, nor on a part with nothing leaning under it', () => {
    openPart(stoolDocument(), 'Front right');
    expect(screen.queryByRole('button', { name: 'Bore leg sockets' })).toBeNull();
    cleanup();
    useStore.getState().replaceDocument({ ...createDocument('T'), boards: [side()] });
    useStore.getState().selectBoard('side');
    render(<Properties />);
    expect(screen.queryByRole('button', { name: 'Bore leg sockets' })).toBeNull();
    expect(screen.queryByLabelText('Socket diameter')).toBeNull();
  });

  it("a stale socket is noted per leg: \"Front right's socket no longer follows its leg — Bore leg sockets again.\"", async () => {
    const user = userEvent.setup();
    // Bored, then Front right moved a quarter inch along X (still standing under the seat).
    const doc0 = stoolDocument();
    useStore.getState().replaceDocument(doc0);
    useStore.getState().boreLegSockets(seat().id, 1);
    const fr = worldParts(useStore.getState().doc).find((b) => b.name === 'Front right')!;
    const bored = useStore.getState().doc;
    const moved = migrateDocument({ ...bored, shapes: [], boards: worldParts(bored).map((b) => (b.id === fr.id
      ? { ...b, position: [b.position[0] - 0.25, b.position[1], b.position[2]] as [number, number, number], shape: undefined }
      : { ...b, shape: undefined })) });
    openPart(moved, 'Seat');
    expect(screen.getAllByText(/socket no longer follows its leg/)).toHaveLength(1);
    expect(screen.getByText("Front right's socket no longer follows its leg — Bore leg sockets again.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bore leg sockets' }));
    expect(screen.queryByText(/socket no longer follows its leg/)).toBeNull();
    expect(seat().holes).toHaveLength(4);
  });
});

describe('Bore leg sockets after a lean edit, through the store (spec §5)', () => {
  it('bore, a new rake, Level the ends: the stale note shows; boring again replaces the socket and the note goes', async () => {
    const user = userEvent.setup();
    const st = () => useStore.getState();
    // Plain (unlinked) legs: a linked stool would carry the rake to Back left too.
    st().replaceDocument(migrateDocument({ ...createDocument('Stool'), boards: [...stoolLegs(), stoolSeat()] }));
    const part = (name: string) => worldParts(st().doc).find((b) => b.name === name)!;
    expect(st().boreLegSockets(part('Seat').id, 1)).toBeNull();
    const fr = part('Front right').id;
    const old = part('Seat').holes.find((r) => isSocketOf(part('Seat'), r, part('Front right')))!;
    expect(st().setLean([fr], { rake: 10 })).toBeNull();
    expect(st().levelEnds(fr)).toBeNull();
    st().selectBoard(part('Seat').id);
    render(<Properties />);
    expect(screen.getByText("Front right's socket no longer follows its leg — Bore leg sockets again.")).toBeInTheDocument();
    expect(screen.getAllByText(/socket no longer follows its leg/)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Bore leg sockets' }));
    expect(screen.queryByText(/socket no longer follows its leg/)).toBeNull();
    const seat = part('Seat');
    expect(seat.holes).toHaveLength(4);
    expect(isSocketOf(seat, seat.holes.find((r) => r.id === old.id)!, part('Front right'))).toBe(true);
  });
});

describe('the tilt end / side picks (Task 9 review)', () => {
  const H = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
    station: 6, count: 1, pitch: 0, acrossFrom: 'min', inset: 4 } as const;
  const T = (deg: number) => Math.tan((deg * Math.PI) / 180);

  it('a past-bound tilt that would also break out reads as the bound, not the fault', async () => {
    const user = userEvent.setup();
    // 0.2" in from the width min side; 40° toward that side at 3/8" deep runs 0.31" sideways: past the edge too.
    open(side({ holes: [{ ...H, inset: 0.2, tiltAlong: T(40) }] }));
    await user.selectOptions(screen.getByLabelText('Tilt side'), 'min');
    const f = screen.getByLabelText('Tilt toward side');
    await user.clear(f); await user.type(f, '40{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent("The bore can't tilt past 45° in all — reduce an angle.");
    expect('tiltAcross' in rows()[0]!).toBe(false);
  });

  it('a refused flip is not remembered: the select stays on the stored direction, and a later square row reads the default', async () => {
    const user = userEvent.setup();
    // Leaning 40° toward the far (max) side is fine; toward the near side, 0.2" in, it would run past the edge.
    open(side({ holes: [{ ...H, inset: 0.2, tiltAcross: T(40) }] }));
    const sel = screen.getByLabelText('Tilt side');
    await user.selectOptions(sel, 'min');
    expect(screen.getByRole('alert')).toHaveTextContent('Puts hole 1 past the width min side');
    expect(rows()[0]!.tiltAcross).toBe(T(40));
    expect(sel).toHaveValue('max');
    // The other entry side is a new bore: square, and the select reads its default (the far side), not the refused pick.
    await user.selectOptions(screen.getByLabelText('Face'), 'thickness|min');
    expect('tiltAcross' in rows()[0]!).toBe(false);
    expect(screen.getByLabelText('Tilt side')).toHaveValue('max');
  });

  it('a slope typed back to 0 keeps showing its direction; the next typed angle leans that way', async () => {
    const user = userEvent.setup();
    open(side({ holes: [{ ...H, tiltAlong: -T(10) }] }));   // toward the length min end (the near one)
    expect(screen.getByLabelText('Tilt end')).toHaveValue('min');
    const f = screen.getByLabelText('Tilt toward end');
    await user.clear(f); await user.type(f, '0{Enter}');
    expect('tiltAlong' in rows()[0]!).toBe(false);
    expect(screen.getByLabelText('Tilt end')).toHaveValue('min');
    await user.clear(f); await user.type(f, '12{Enter}');
    expect(rows()[0]!.tiltAlong).toBe(-slopeOf(12));
  });

  it('a pick is reset when Along changes', async () => {
    const user = userEvent.setup();
    open(side({ holes: [H] }));
    await user.selectOptions(screen.getByLabelText('Tilt end'), 'min');
    await user.selectOptions(screen.getByLabelText('Along'), 'width');
    expect(rows()[0]!.along).toBe('width');
    expect(screen.getByLabelText('Tilt end')).toHaveValue('max');   // the far end from alongFrom min: the default
    const f = screen.getByLabelText('Tilt toward end');
    await user.clear(f); await user.type(f, '10{Enter}');
    expect(rows()[0]!.tiltAlong).toBe(slopeOf(10));
  });
});
