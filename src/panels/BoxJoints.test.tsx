import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument, worldParts } from '../document/document';
import type { Board, SloydDocument } from '../document/document';
import { fingerLayout } from '../document/boxJoints';
import { BOX_NO_CORNER } from '../document/boxJointText';
import { Properties } from './Properties';

/** Box joints Task 4 (spec §4): the Box joints section in the multi-selection panel. */
const s = () => useStore.getState();
const id = (name: string) => worldParts(s().doc).find((b) => b.name === name)!.id;

function drawerParts(): Board[] {
  const t = 0.5, h = 4, iw = 12, d = 16;
  const fb = (i: string, name: string, z: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: t, position: [t, 0, z] });
  const side = (i: string, name: string, x: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 90, length: d + 2 * t, width: h, thickness: t, position: [x, 0, 0] });
  return [fb('f', 'Front', 0), fb('b', 'Back', d + t), side('l', 'Side left', 0), side('r', 'Side right', iw + t)];
}
const open = (doc: SloydDocument, ...names: string[]) => {
  s().replaceDocument(doc);
  s().selectBoard(id(names[0]!));
  for (const n of names.slice(1)) s().toggleSelected(id(n));
  render(<Properties />);
};
const drawer = (): SloydDocument => ({ ...createDocument('Drawer'), boards: drawerParts() });
const ALL = ['Front', 'Back', 'Side left', 'Side right'];
const button = () => screen.getByRole('button', { name: 'Box joint the corners' });
afterEach(() => { act(() => s().setExplode(0)); });

describe('the Box joints section (box joints spec §4)', () => {
  it('the layout the sentence names is the layout of a 4" part at 1/2"', () => {
    expect(fingerLayout(4, 0.5)).toEqual({ count: 7, width: 0.5, outer: 0.75, length: 4 });
  });

  it('shows for two or more parts, with the default width of the thinnest part', () => {
    open(drawer(), ...ALL);
    expect(screen.getByRole('heading', { name: 'Box joints' })).toBeTruthy();
    expect((screen.getByLabelText('Finger width') as HTMLInputElement).value).toBe('1/2"');
    expect(screen.getByRole('checkbox', { name: 'Swap fingers' })).toBeTruthy();
  });

  it('is not shown for a single part', () => {
    s().replaceDocument(drawer());
    s().selectBoard(id('Front'));
    render(<Properties />);
    expect(screen.queryByRole('heading', { name: 'Box joints' })).toBeNull();
  });

  it('the drawer: the success note, one <p>; a field change clears it', async () => {
    open(drawer(), ...ALL);
    await userEvent.click(button());
    expect(screen.getByText('Jointed 4 corners: 7 fingers, 1/2" wide (the outer two 3/4").').tagName).toBe('P');
    expect(s().past.length).toBe(1);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Swap fingers' }));
    expect(screen.queryByText(/Jointed 4 corners/)).toBeNull();
  });

  it('committing a new width clears the notes', async () => {
    open(drawer(), ...ALL);
    await userEvent.click(button());
    expect(screen.queryByText(/Jointed 4 corners/)).not.toBeNull();
    const field = screen.getByLabelText('Finger width') as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, '3/8{Enter}');
    expect(screen.queryByText(/Jointed 4 corners/)).toBeNull();
  });

  it('two parts that make no corner: the planner refusal as an alert, nothing done', async () => {
    open(drawer(), 'Front', 'Back');
    await userEvent.click(button());
    expect(screen.getByRole('alert').textContent).toBe(BOX_NO_CORNER);
    expect(s().past.length).toBe(0);
  });

  it('a parse error in the width field disables the button', async () => {
    open(drawer(), ...ALL);
    const field = screen.getByLabelText('Finger width') as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, 'abc');
    await userEvent.tab();
    expect((button() as HTMLButtonElement).disabled).toBe(true);
  });
});
