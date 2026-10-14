import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board } from '../document/document';
import { Properties } from './Properties';

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
  it('accepts a metric pitch exactly', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const every = screen.getByLabelText('Every');
    await user.clear(every); await user.type(every, '30mm{Enter}');     // 21 holes at 30 mm: last centre 25.6" on 30"
    expect(rows()[0]!.pitch).toBe(30 / 25.4);
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
  it('the Shelf-pin row names its real direction', async () => {
    const user = userEvent.setup();
    open(side({ length: 10, width: 30 }));
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.getByText('¼" pins every 32 mm along the width')).toBeInTheDocument();
  });
  it('removes a row', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Hole');
    await user.click(screen.getByRole('button', { name: /Remove hole row/ }));
    expect(rows()).toEqual([]);
  });
});
