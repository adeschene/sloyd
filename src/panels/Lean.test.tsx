import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useStore, LEAN_NOT_UPRIGHT, LEAN_PAST_BOUND, LEAN_TURNS_HOLES } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board } from '../document/document';
import { slopeOf } from '../document/lean';
import { LEVEL_FOOT_CUT, LEVEL_TOP_CUT, LEVEL_BELOW_FLOOR, levelUsersDisagree } from '../document/levelEnds';
import { POSTURE_WHILE_LEANING } from '../document/treeEdit';
import { Properties } from './Properties';

const T = Math.tan;
const D = Math.PI / 180;
/** World rake 8° toward the BACK, splay 12° toward the right (turn 0: stored = world). */
const LEAN = { x: T(12 * D), z: -T(8 * D), face: 'width' as const };
const leg = (over: Partial<Board> = {}) => createBoard({ id: 'a', name: 'Leg', length: 28, width: 1.75, thickness: 1.25, posture: 'upright', position: [0, 2, 0], lean: LEAN, ...over });
const open = (boards: Board[], select: string[] = [boards[0]!.id]) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards });
  useStore.getState().selectBoard(select[0]!);
  for (const id of select.slice(1)) useStore.getState().toggleSelected(id);
  render(<Properties />);
};
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const part = (id: string) => useStore.getState().doc.boards.find((b) => b.id === id) as Board;
const HOLE = { id: 'h', face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, inset: 0.5, acrossFrom: 'min' as const, diameter: 0.25, depth: 'through' as const };
const STALE = 'Ends were levelled for a different lean — Level the ends again';
const POSITION = 'Position is the part before its lean; it leans about the centre of its top.';

const { setLean: realSetLean, levelEnds: realLevelEnds } = useStore.getState();
afterEach(() => { useStore.setState({ setLean: realSetLean, levelEnds: realLevelEnds }); vi.restoreAllMocks(); act(() => useStore.getState().setExplode(0)); });

describe('the Lean section (splayed legs spec §4)', () => {
  it('shows world rake and splay', () => {
    open([leg()]);
    expect(screen.getByRole('heading', { name: 'Lean' })).toBeInTheDocument();
    expect(input('Rake').value).toBe('8.0°');
    expect((screen.getByLabelText('Rake direction') as HTMLSelectElement).value).toBe('back');
    expect(input('Splay').value).toBe('12.0°');
    expect((screen.getByLabelText('Splay direction') as HTMLSelectElement).value).toBe('right');
    expect(screen.getByText('Resultant 14.3° · sightline 33.5° from the front edge')).toBeInTheDocument();
  });

  it('typing rake commits once, as a magnitude that keeps the part\'s own sign', async () => {
    const setLean = vi.fn(() => null);
    open([leg()]);
    act(() => useStore.setState({ setLean }));
    const user = userEvent.setup();
    await user.clear(input('Rake'));
    await user.type(input('Rake'), '10{Enter}');
    expect(setLean).toHaveBeenCalledTimes(1);
    expect(setLean).toHaveBeenCalledWith(['a'], { rake: 10 }, { keepSign: true });
  });

  it('the direction select re-commits the current magnitude with the new sign', async () => {
    const setLean = vi.fn(() => null);
    open([leg()]);
    act(() => useStore.setState({ setLean }));
    await userEvent.setup().selectOptions(screen.getByLabelText('Splay direction'), 'left');
    expect(setLean).toHaveBeenCalledTimes(1);
    expect(setLean).toHaveBeenCalledWith(['a'], { splaySign: -1 });
  });

  // Angled holes §7: the holed-part refusal is lifted; the seam re-choice on a holed part is the refusal left.
  it('a holed part leans', async () => {
    open([leg({ lean: undefined, holes: [HOLE] })]);
    const user = userEvent.setup();
    await user.clear(input('Rake'));
    await user.type(input('Rake'), '5{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(part('a').lean).toBeDefined();
    expect(part('a').holes).toEqual([HOLE]);
  });

  it('a refusal is the field\'s own error: the re-choice on a holed leaning part, the typed text kept', async () => {
    open([leg({ holes: [HOLE] })]);
    const user = userEvent.setup();
    await user.clear(input('Splay'));
    await user.type(input('Splay'), '0{Enter}');   // x → 0 on face width: the seam-free face would flip to thickness
    expect(screen.getByRole('alert')).toHaveTextContent(LEAN_TURNS_HOLES);
    expect(input('Splay').value).toBe('0');
    expect(part('a').lean).toEqual(LEAN);
  });

  it('a zero is a legal rake (min0): typing 0 clears that slope', async () => {
    open([leg()]);
    const user = userEvent.setup();
    await user.clear(input('Rake'));
    await user.type(input('Rake'), '0{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(part('a').lean!.z).toBe(0);
  });

  it('Level the ends and Clear lean call their actions', async () => {
    const levelEnds = vi.fn(() => null);
    const setLean = vi.fn(() => null);
    open([leg()]);
    act(() => useStore.setState({ levelEnds, setLean }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Level the ends' }));
    expect(levelEnds).toHaveBeenCalledWith('a');
    await user.click(screen.getByRole('button', { name: 'Clear lean' }));
    expect(setLean).toHaveBeenCalledWith(['a'], null);
  });

  it('Level\'s refusal shows in the section', async () => {
    open([leg({ position: [0, -40, 0] })]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Level the ends' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The top of this part is at or below the floor.');
  });

  it('the stale note shows when a level cut is on the part and it is not level', () => {
    const cut = { id: 'c', kind: 'miter' as const, face: 'length' as const, from: 'min' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0], [1.75, 0.3]] as [[number, number], [number, number]] };
    open([leg({ angleCuts: [cut] })]);
    expect(screen.getByText(STALE)).toBeInTheDocument();
  });

  it('no stale note without a level cut, nor once levelled', async () => {
    open([leg()]);
    expect(screen.queryByText(STALE)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Level the ends' }));
    expect(part('a').angleCuts.length).toBe(2);
    expect(screen.queryByText(STALE)).toBeNull();
    act(() => { useStore.getState().setLean(['a'], { rake: -5 }); });
    expect(screen.getByText(STALE)).toBeInTheDocument();
  });

  it('the position note and the buttons show on a leaning part only', () => {
    open([leg({ lean: undefined })]);
    expect(screen.getByRole('heading', { name: 'Lean' })).toBeInTheDocument();
    expect(input('Rake').value).toBe('0.0°');
    expect(screen.queryByText(POSITION)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Level the ends' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear lean' })).toBeNull();
    expect(screen.queryByText(/Resultant/)).toBeNull();
    act(() => { useStore.getState().setLean(['a'], { rake: 5 }); });
    expect(screen.getByText(POSITION)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear lean' })).toBeInTheDocument();
  });

  it('not shown on a flat part', () => {
    open([leg({ posture: 'flat', lean: undefined })]);
    expect(screen.queryByRole('heading', { name: 'Lean' })).toBeNull();
  });

  it('mixed values: two parts with different rakes show an empty field, and an untouched blur writes nothing (inv 5)', () => {
    open([leg(), leg({ id: 'b', name: 'Leg 2', lean: { x: T(12 * D), z: -T(3 * D), face: 'width' } })], ['a', 'b']);
    expect(input('Rake').value).toBe('');
    expect(input('Splay').value).toBe('12.0°');
    const before = useStore.getState().past.length;
    const doc = useStore.getState().doc;
    fireEvent.focus(input('Rake'));
    fireEvent.blur(input('Rake'));
    expect(useStore.getState().past.length).toBe(before);
    expect(useStore.getState().doc).toBe(doc);
    expect(screen.queryByText(/Resultant/)).toBeNull();
  });

  it('different magnitudes stay empty-mixed, and typing writes each part\'s own sign', async () => {
    open([leg(), leg({ id: 'b', name: 'Leg 2', position: [5, 2, 0], lean: { x: T(12 * D), z: T(3 * D), face: 'width' } })], ['a', 'b']);
    expect(input('Rake').value).toBe('');
    expect((screen.getByLabelText('Rake direction') as HTMLSelectElement).value).toBe('');
    await userEvent.setup().type(input('Rake'), '6{Enter}');
    expect(part('a').lean!.z).toBeCloseTo(-slopeOf(6), 12);
    expect(part('b').lean!.z).toBeCloseTo(slopeOf(6), 12);
  });

  describe('a symmetric pair (splay -12 and +12): magnitude and direction are separate controls', () => {
    const pair = () => open([
      leg({ lean: { x: -T(12 * D), z: 0, face: 'width' } }),
      leg({ id: 'b', name: 'Leg 2', position: [5, 2, 0], lean: { x: T(12 * D), z: 0, face: 'width' } }),
    ], ['a', 'b']);
    const splayOf = (id: string) => Math.atan(part(id).lean!.x) / D;

    it('the field shows 12.0° and the select says mixed', () => {
      pair();
      expect(input('Splay').value).toBe('12.0°');
      expect((screen.getByLabelText('Splay direction') as HTMLSelectElement).value).toBe('');
      expect(screen.getByRole('option', { name: 'mixed' })).toBeInTheDocument();
    });

    it('typing 10 gives -10 and +10, one undo entry', async () => {
      pair();
      const before = useStore.getState().past.length;
      await userEvent.setup().clear(input('Splay'));
      await userEvent.setup().type(input('Splay'), '10{Enter}');
      expect(splayOf('a')).toBeCloseTo(-10, 9);
      expect(splayOf('b')).toBeCloseTo(10, 9);
      expect(useStore.getState().past.length).toBe(before + 1);
    });

    it('the select set to "toward the right" gives +12 and +12', async () => {
      pair();
      await userEvent.setup().selectOptions(screen.getByLabelText('Splay direction'), 'right');
      expect(splayOf('a')).toBeCloseTo(12, 9);
      expect(splayOf('b')).toBeCloseTo(12, 9);
    });
  });

  it('sits inside EditLock: disabled while exploded (inv 47)', () => {
    open([leg()]);
    act(() => useStore.getState().setExplode(1));
    expect(input('Rake').closest('fieldset')).toBeDisabled();
  });
});

describe('the Holes panel on a leaning part (angled holes §7)', () => {
  it('a leaning part takes a hole', async () => {
    open([leg()]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    await user.click(screen.getByRole('button', { name: /^Hole/ }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(part('a').holes).toHaveLength(1);
    expect(part('a').lean).toEqual(LEAN);
  });
});

describe('the refusal copy is pinned verbatim (Global Constraints)', () => {
  it('lean and hole refusals', () => {
    expect(LEAN_NOT_UPRIGHT).toBe('Only an upright part can lean.');
    expect(LEAN_PAST_BOUND).toBe("The lean can't pass 45° in all — reduce the rake or splay.");
    expect(LEAN_TURNS_HOLES).toBe('This lean would turn the part a quarter turn about its length, and its holes with it — keep both angles above 0, or remove the holes first.');
  });
  it('posture while leaning', () => {
    expect(POSTURE_WHILE_LEANING).toBe('Clear the lean first — only an upright part can lean.');
  });
  it('level refusals', () => {
    expect(LEVEL_FOOT_CUT).toBe('Remove the angle cut on the foot first.');
    expect(LEVEL_TOP_CUT).toBe('Remove the angle cut on the top first.');
    expect(LEVEL_BELOW_FLOOR).toBe('The top of this part is at or below the floor.');
    expect(levelUsersDisagree(['A', 'B'])).toBe("These linked parts' tops are at different heights, so one length can't level them all: A, B.");
  });
});
