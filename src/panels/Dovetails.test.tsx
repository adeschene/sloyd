import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument, worldParts } from '../document/document';
import type { Board, Dovetail, SloydDocument } from '../document/document';
import { applyDovetails, dovetailPlan } from '../document/dovetails';
import {
  DOVETAIL_COUNT_WHOLE, DOVETAIL_NO_CORNER, DOVETAIL_SLOPE_RANGE, dovetailMoveClear, dovetailRemoveFirst,
} from '../document/dovetailText';
import { Properties } from './Properties';

/** Dovetails Task 5 (spec §4): the Dovetails section in the multi-selection panel, the single-part section, and the other
 *  sections' alerts on a dovetailed part (spec §3.6). */
const s = () => useStore.getState();
const id = (name: string) => worldParts(s().doc).find((b) => b.name === name)!.id;

/** Task 4's drawer (copied): Front/Back 3/4" on edge between the sides, 1/2", running the full depth; 6" tall. */
function drawer(): SloydDocument {
  const h = 6, tS = 0.5, tFB = 0.75, iw = 12, d = 16;
  const fb = (i: string, name: string, z: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: tFB, position: [tS, 0, z] });
  const side = (i: string, name: string, x: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 90, length: d + 2 * tFB, width: h, thickness: tS, position: [x, 0, 0] });
  return { ...createDocument('Drawer'), boards: [fb('f', 'Front', 0), fb('b', 'Back', d + tFB), side('l', 'Side left', 0), side('r', 'Side right', iw + tS)] };
}
const ALL = ['Front', 'Back', 'Side left', 'Side right'];
function dovetailed(): SloydDocument {
  const doc = drawer();
  const plan = dovetailPlan(doc, ['f', 'b', 'l', 'r'], { slope: 8, count: null, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan);
}
const open = (doc: SloydDocument, ...names: string[]) => {
  s().replaceDocument(doc);
  s().selectBoard(id(names[0]!));
  for (const n of names.slice(1)) s().toggleSelected(id(n));
  render(<Properties />);
};
const button = () => screen.getByRole('button', { name: 'Dovetail the corners' });
afterEach(() => { act(() => s().setExplode(0)); });

describe('the Dovetails section (spec §4)', () => {
  it('four drawer parts: Dovetails, Slope 1 : 8, Tails empty (Auto), Swap off', () => {
    open(drawer(), ...ALL);
    expect(screen.getByRole('heading', { name: 'Dovetails' })).toBeTruthy();
    const slope = screen.getByLabelText('Slope') as HTMLInputElement;
    expect(slope.value).toBe('8');
    expect(slope.parentElement!.textContent).toBe('1 :');
    const tails = screen.getByLabelText('Tails') as HTMLInputElement;
    expect(tails.value).toBe('');
    expect(tails.placeholder).toBe('Auto');
    expect((screen.getByRole('checkbox', { name: 'Swap tails and pins' }) as HTMLInputElement).checked).toBe(false);
    expect((button() as HTMLButtonElement).disabled).toBe(false);
  });

  it('is not shown for a single part', () => {
    open(drawer(), 'Front');
    expect(screen.queryByRole('button', { name: 'Dovetail the corners' })).toBeNull();
  });

  it('Dovetail the corners: the planner\'s success notes, one undo entry; a field change clears them', async () => {
    open(drawer(), ...ALL);
    await userEvent.click(button());
    for (const n of ['Dovetailed 4 corners: 4 tails, 1:8.', 'Tails on Side left, Side right.', 'Front is now 1" longer.', 'Back is now 1" longer.']) {
      expect(screen.getByText(n).tagName).toBe('P');
    }
    expect(s().past.length).toBe(1);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Swap tails and pins' }));
    expect(screen.queryByText(/Dovetailed 4 corners/)).toBeNull();
  });

  it('two parts that make no corner: the no-corner alert, nothing written', async () => {
    open(drawer(), 'Front', 'Back');
    await userEvent.click(button());
    expect(screen.getByRole('alert').textContent).toBe(DOVETAIL_NO_CORNER);
    expect(s().past.length).toBe(0);
  });

  it('Tails: a typed count is used; a non-whole entry is the field\'s error and disables the button; blank is Auto again', async () => {
    const user = userEvent.setup();
    open(drawer(), ...ALL);
    const tails = screen.getByLabelText('Tails');
    await user.type(tails, '2.5{Enter}');
    expect(screen.getByRole('alert').textContent).toBe(DOVETAIL_COUNT_WHOLE);
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    await user.clear(tails); await user.type(tails, '0{Enter}');
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    await user.clear(tails); await user.type(tails, '3{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect((button() as HTMLButtonElement).disabled).toBe(false);
    await user.click(button());
    expect(screen.getByText('Dovetailed 4 corners: 3 tails, 1:8.')).toBeTruthy();
    expect(worldParts(s().doc).every((b) => b.dovetails!.every((d) => d.count === 3))).toBe(true);
    act(() => s().undo());
    await user.clear(tails); await user.tab();
    expect((tails as HTMLInputElement).value).toBe('');
    await user.click(button());
    expect(screen.getByText('Dovetailed 4 corners: 4 tails, 1:8.')).toBeTruthy();
  });

  it('Slope: outside 4 to 12 is the planner\'s refusal after the click, never a parse error', async () => {
    const user = userEvent.setup();
    open(drawer(), ...ALL);
    const slope = screen.getByLabelText('Slope');
    await user.clear(slope); await user.type(slope, '3{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect((button() as HTMLButtonElement).disabled).toBe(false);
    await user.click(button());
    expect(screen.getByRole('alert').textContent).toBe(DOVETAIL_SLOPE_RANGE);
    expect(s().past.length).toBe(0);
    await user.clear(slope); await user.type(slope, '6{Enter}');
    await user.click(button());
    expect(screen.getByText('Dovetailed 4 corners: 4 tails, 1:6.')).toBeTruthy();
  });

  it('Slope: an untouched blur commits nothing (inv 5); an unparseable entry is the field\'s error and disables the button', async () => {
    const user = userEvent.setup();
    open(drawer(), ...ALL);
    const slope = screen.getByLabelText('Slope') as HTMLInputElement;
    // Observable: the success notes are cleared by any committed field change, so an untouched blur must leave them.
    await user.click(button());
    expect(screen.getByText('Dovetailed 4 corners: 4 tails, 1:8.')).toBeTruthy();
    await user.click(slope); await user.tab();
    expect(slope.value).toBe('8');
    expect(screen.getByText('Dovetailed 4 corners: 4 tails, 1:8.')).toBeTruthy();
    act(() => s().undo());
    await user.clear(slope); await user.type(slope, 'abc{Enter}');
    expect(screen.getByRole('alert').textContent).toBe(DOVETAIL_SLOPE_RANGE);
    expect((button() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the single-part Dovetails section (spec §4)', () => {
  it('a dovetailed side lists each end\'s cut-list line and Remove; Remove takes that end only', async () => {
    open(dovetailed(), 'Side left');
    expect(screen.getByRole('heading', { name: /^Dovetails\s*·\s*2$/ })).toBeTruthy();
    const rows = screen.getAllByRole('group', { name: /^Through dovetails/ });
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(/at the length min end; this part has the tails, 1-3\/16" at the end\.$/)).toBeTruthy();
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Remove' }));
    expect(worldParts(s().doc).find((b) => b.id === 'l')!.dovetails!.map((d) => d.end)).toEqual(['max']);
    expect(s().past.length).toBe(1);
  });

  it('a part resized so its dovetail faults shows the fault note', () => {
    const doc = dovetailed();
    open({ ...doc, boards: doc.boards.map((b) => (b.id === 'l' ? { ...b, width: 1.5 } : b)) }, 'Side left');
    expect(screen.getAllByText('This dovetail no longer fits: a tail is narrower than a pin.')).toHaveLength(2);
  });

  it('a dovetail-free part shows no Dovetails section', () => {
    open(drawer(), 'Side left');
    expect(screen.queryByRole('heading', { name: /^Dovetails/ })).toBeNull();
  });
});

describe('the other sections on a dovetailed part show the store\'s refusal as their alert (spec §3.6)', () => {
  const REMOVE = dovetailRemoveFirst('Side left');
  const alertText = () => screen.getAllByRole('alert').map((a) => a.textContent);

  it('+ Add cut on a short dovetailed part', async () => {
    const tails: Dovetail = { id: 'd1', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 0.75 };
    s().replaceDocument({ ...createDocument('T'), boards: [createBoard({ id: 's', name: 'Short', length: 2, width: 4, thickness: 0.5, dovetails: [tails] })] });
    s().selectBoard('s');
    render(<Properties />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add cut' }));
    expect(alertText()).toContain(dovetailMoveClear('Short'));
    expect(s().past.length).toBe(0);
  });

  it('a cut edited into the zone: the row\'s alert', async () => {
    const user = userEvent.setup();
    const doc = dovetailed();
    open({ ...doc, boards: doc.boards.map((b) => (b.id === 'l' ? { ...b, cuts: [
      { id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 8, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 } as Board['cuts'][number],
    ] } : b)) }, 'Side left');
    const offset = screen.getByLabelText('From the end');
    await user.clear(offset); await user.type(offset, '1/4{Enter}');
    expect(alertText()).toContain(dovetailMoveClear('Side left'));
    expect(s().past.length).toBe(0);
  });

  it('Angles: + Add, Taper', async () => {
    open(dovetailed(), 'Side left');
    await userEvent.click(screen.getByRole('button', { name: '+ Add' }));
    await userEvent.click(screen.getByRole('button', { name: 'Taper' }));
    expect(alertText()).toContain(REMOVE);
    expect(s().past.length).toBe(0);
  });

  it('Curves: + Add curve, Arch', async () => {
    open(dovetailed(), 'Side left');
    await userEvent.click(screen.getByRole('button', { name: '+ Add curve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Arch' }));
    expect(alertText()).toContain(REMOVE);
  });

  it('Profiles: + Add profile, the first kind', async () => {
    open(dovetailed(), 'Side left');
    await userEvent.click(screen.getByRole('button', { name: '+ Add profile' }));
    await userEvent.click(screen.getAllByRole('button').find((b) => /^Round/.test(b.textContent!))!);
    expect(alertText()).toContain(REMOVE);
  });

  it('Banding: + Add banding, Iron-on veneer: all edges', async () => {
    open(dovetailed(), 'Side left');
    await userEvent.click(screen.getByRole('button', { name: '+ Add banding' }));
    await userEvent.click(screen.getByRole('button', { name: 'Iron-on veneer: all edges' }));
    expect(alertText()).toContain(REMOVE);
    expect(s().past.length).toBe(0);
  });
});
