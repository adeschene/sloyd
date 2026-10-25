import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board, HoleRow, RoundTenon, SloydDocument } from '../document/document';
import { holeLengthText } from '../document/holeText';
import { tenonFaultText } from '../document/tenonText';
import { IMPERIAL } from '../units/length';
import { Properties } from './Properties';

/** Round tenons Task 8: the Round tenons section of Properties (spec §4). */
const METRIC = { display: 'metric-mm' as const, precision: 16 };
const rung = (over: Partial<Board> = {}) => createBoard({ id: 'r', name: 'Rung', length: 20, width: 1.5, thickness: 1.5, ...over });
const open = (boards: Board[], over: Partial<SloydDocument> = {}, select = boards[0]!.id) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards, ...over });
  useStore.getState().selectBoard(select);
  render(<Properties />);
};
const part = (id = 'r') => useStore.getState().doc.boards.find((b) => b.id === id) as Board;
const row = (end: string) => within(screen.getByRole('group', { name: `${end} tenon` }));
const tenon = (id: string, end: 'min' | 'max', diameter = 0.75, length = 1): RoundTenon => ({ id, end, diameter, length });

const { addTenon: realAddTenon } = useStore.getState();
afterEach(() => { useStore.setState({ addTenon: realAddTenon }); act(() => useStore.getState().setExplode(0)); });

describe('the Round tenons section (round tenons spec §4)', () => {
  it('sits after Holes, one row per end, each with Add round tenon; a flat part names the length\'s ends', () => {
    open([rung()]);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings.indexOf('Round tenons')).toBe(headings.indexOf('Holes') + 1);
    expect(row('Length min end').getByRole('button', { name: 'Add round tenon' })).toBeInTheDocument();
    expect(row('Length max end').getByRole('button', { name: 'Add round tenon' })).toBeInTheDocument();
  });
  it('an upright part names its ends bottom and top', () => {
    open([rung({ posture: 'upright' })]);
    expect(row('Bottom').getByRole('button', { name: 'Add round tenon' })).toBeInTheDocument();
    expect(row('Top').getByRole('button', { name: 'Add round tenon' })).toBeInTheDocument();
  });
  it('Add round tenon puts the default on that end: 1" across, 1" long; the part keeps its length', async () => {
    const user = userEvent.setup();
    open([rung()]);
    await user.click(row('Length max end').getByRole('button', { name: 'Add round tenon' }));
    expect(part().tenons).toEqual([{ id: expect.any(String), end: 'max', diameter: 1, length: 1 }]);
    expect(part().length).toBe(20);
    expect(row('Length max end').getByLabelText('Diameter')).toHaveValue(holeLengthText(1, IMPERIAL, 'diameter'));
    expect(row('Length max end').getByLabelText('Length')).toHaveValue('1"');
    expect(row('Length min end').getByRole('button', { name: 'Add round tenon' })).toBeInTheDocument();
    expect(useStore.getState().past.length).toBe(1);
  });
  it('the default steps down to the largest whole 1/8" that is not too wide (a 1" section: 7/8")', async () => {
    const user = userEvent.setup();
    open([rung({ width: 1 })]);
    await user.click(row('Length min end').getByRole('button', { name: 'Add round tenon' }));
    expect(part().tenons![0]).toMatchObject({ end: 'min', diameter: 0.875, length: 1 });
  });
  it('a metric project defaults to 25 mm across and 25 mm long, the diameter read at the hole\'s 0.1 mm', async () => {
    const user = userEvent.setup();
    open([rung()], { units: METRIC });
    await user.click(row('Length max end').getByRole('button', { name: 'Add round tenon' }));
    expect(part().tenons![0]).toMatchObject({ diameter: 25 / 25.4, length: 25 / 25.4 });
    expect(row('Length max end').getByLabelText('Diameter')).toHaveValue(holeLengthText(25 / 25.4, METRIC, 'diameter'));
  });
  it('a metric Diameter reads to 0.1 mm, as its socket does (1/2" is 12.7 mm, not 13 mm)', () => {
    open([rung({ tenons: [tenon('t', 'max', 0.5)] })], { units: METRIC });
    expect(row('Length max end').getByLabelText('Diameter')).toHaveValue('12.7 mm');
    expect(holeLengthText(0.5, METRIC, 'diameter')).toBe('12.7 mm');
  });
  it('a default that would be refused is withheld, with the reason (a part too thin for any step; tenons that would meet)', () => {
    open([rung({ id: 'thin', width: 0.125 }), rung({ id: 'short', length: 1.5, tenons: [tenon('t', 'min', 0.75, 1)] })], {}, 'thin');
    expect(row('Length max end').queryByRole('button', { name: 'Add round tenon' })).toBeNull();
    expect(row('Length max end').getByText(tenonFaultText({ kind: 'too-wide' }))).toBeInTheDocument();
    act(() => useStore.getState().selectBoard('short'));
    expect(row('Length max end').queryByRole('button', { name: 'Add round tenon' })).toBeNull();
    expect(row('Length max end').getByText('The tenons would meet — shorten one.')).toBeInTheDocument();
  });
  it('the default follows the part: a resize that leaves no step withholds Add, and units are read afresh', async () => {
    const user = userEvent.setup();
    open([rung()]);
    expect(row('Length max end').getByRole('button', { name: 'Add round tenon' })).toBeInTheDocument();
    act(() => useStore.getState().updateBoard('r', { width: 0.125 }));
    expect(row('Length max end').queryByRole('button', { name: 'Add round tenon' })).toBeNull();
    expect(row('Length max end').getByText(tenonFaultText({ kind: 'too-wide' }))).toBeInTheDocument();
    act(() => useStore.getState().updateBoard('r', { width: 1.5 }));
    act(() => useStore.setState({ doc: { ...useStore.getState().doc, units: METRIC } }));
    await user.click(row('Length max end').getByRole('button', { name: 'Add round tenon' }));
    expect(part().tenons![0]!.diameter).toBe(25 / 25.4);
  });
  it('a refused Diameter is the field\'s own error: the typed text and focus kept, nothing stored', async () => {
    const user = userEvent.setup();
    open([rung({ tenons: [tenon('t', 'max')] })]);
    const d = row('Length max end').getByLabelText('Diameter');
    await user.clear(d); await user.type(d, '1-1/2{Enter}');
    expect(part().tenons![0]!.diameter).toBe(0.75);
    expect(row('Length max end').getByRole('alert')).toHaveTextContent("A round tenon must be narrower than the part's section.");
    expect(d).toHaveFocus();
    expect(d).toHaveValue('1-1/2');
    expect(d).toHaveAttribute('aria-invalid', 'true');
    expect(useStore.getState().past.length).toBe(0);
  });
  it('a refused Length (the tenons would meet) is the field\'s own error; an accepted one is stored', async () => {
    const user = userEvent.setup();
    open([rung({ tenons: [tenon('a', 'min'), tenon('b', 'max')] })]);
    const len = row('Length max end').getByLabelText('Length');
    await user.clear(len); await user.type(len, '19{Enter}');
    expect(part().tenons![1]!.length).toBe(1);
    expect(row('Length max end').getByRole('alert')).toHaveTextContent('The tenons would meet — shorten one.');
    expect(len).toHaveFocus();
    expect(len).toHaveValue('19');
    await user.clear(len); await user.type(len, '2{Enter}');
    expect(part().tenons![1]!.length).toBe(2);
    expect(row('Length max end').queryByRole('alert')).toBeNull();
  });
  it('the readout: the shoulder from the OTHER end (the part keeps its length, so the shoulder moves in)', async () => {
    const user = userEvent.setup();
    open([rung({ tenons: [tenon('t', 'max')] })]);
    expect(row('Length max end').getByText('Shoulder 19" from the length min end')).toBeInTheDocument();
    const len = row('Length max end').getByLabelText('Length');
    await user.clear(len); await user.type(len, '1-1/2{Enter}');
    expect(row('Length max end').getByText('Shoulder 18-1/2" from the length min end')).toBeInTheDocument();
  });
  it('the readout on an upright part reads from the bottom (a top tenon)', () => {
    open([rung({ posture: 'upright', length: 17, tenons: [tenon('t', 'max')] })]);
    expect(row('Top').getByText('Shoulder 16" from the bottom')).toBeInTheDocument();
    expect(row('Top').queryByText(/^Seated in/)).toBeNull();
  });
  it('the readout\'s second line when the tenon is seated: Seated in <part name>\'s socket.', () => {
    // A flat rung (X = length) from x −0.5 to 10.5 at y 8, centre y 8.375; posts A (x −1.5..0) and B (x 10..11.5), each with
    // a 1/2" blind bore 3/4" deep at the rung's height; the rung's tenons stand 1/16" off the posts and enter 1/2".
    const GAP = 1 / 16;
    const post = (id: string, name: string, x0: number, from: 'min' | 'max'): Board => ({
      ...createBoard({ id, name, posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [x0, 0, 0] }),
      holes: [{ id: `h-${id}`, face: 'width', from, diameter: 0.5, depth: 0.75, along: 'length', alongFrom: 'min', station: 8.375, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.75 } satisfies HoleRow],
    });
    const r = { ...createBoard({ id: 'r', name: 'Rung', length: 11, width: 1.5, thickness: 0.75, position: [-0.5, 8, 0] }),
      tenons: [tenon('t0', 'min', 0.5, 0.5 + GAP), tenon('t1', 'max', 0.5, 0.5 + GAP)] };
    open([post('pa', 'Post A', -1.5, 'max'), post('pb', 'Post B', 10, 'min'), r], {}, 'r');
    expect(row('Length min end').getByText("Seated in Post A's socket.")).toBeInTheDocument();
    expect(row('Length max end').getByText("Seated in Post B's socket.")).toBeInTheDocument();
    expect(row('Length max end').getByText(/^Shoulder .* from the length min end$/)).toBeInTheDocument();
  });
  it('a kept fault is noted under the row: a hole added LATER inside the tenon\'s zone (the tenon builds nothing)', () => {
    open([rung({ tenons: [tenon('t', 'max')] })]);
    expect(row('Length max end').queryByRole('status')).toBeNull();
    act(() => {
      useStore.getState().addHoleRows('r', [{ face: 'thickness', from: 'max', diameter: 0.25, depth: 0.5, along: 'length', alongFrom: 'max', station: 0.5, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.75 }]);
    });
    expect(part().tenons).toHaveLength(1); // kept
    expect(row('Length max end').getByRole('status')).toHaveTextContent('The tenon would run into a hole — move it or remove it first.');
  });
  it('a resize that faults two ways notes the first and how many more', () => {
    open([rung({ length: 1.5, width: 0.5, tenons: [tenon('a', 'min', 0.75, 1), tenon('b', 'max', 0.75, 1)] })]);
    expect(row('Length max end').getByRole('status')).toHaveTextContent("A round tenon must be narrower than the part's section. (and 1 more)");
  });
  it('Remove takes the tenon off (no key left) and brings Add back', async () => {
    const user = userEvent.setup();
    open([rung({ tenons: [tenon('t', 'max')] })]);
    await user.click(row('Length max end').getByRole('button', { name: 'Remove' }));
    expect('tenons' in part()).toBe(false);
    expect(row('Length max end').getByRole('button', { name: 'Add round tenon' })).toBeInTheDocument();
  });
  it('a refused Add\'s alert stays while the part is unchanged, and goes when the part object changes (an edit, an undo)', async () => {
    const user = userEvent.setup();
    open([rung()]);
    // The store's add refusal is unreachable through a withheld default; stand one in to see where the alert lives.
    useStore.setState({ addTenon: () => 'Refused for the test.' });
    const add = () => user.click(row('Length max end').getByRole('button', { name: 'Add round tenon' }));
    await add();
    expect(row('Length max end').getByRole('alert')).toHaveTextContent('Refused for the test.');
    // A store change that leaves the part object alone does not retire it.
    act(() => useStore.getState().setTool('select'));
    expect(row('Length max end').getByRole('alert')).toHaveTextContent('Refused for the test.');
    act(() => useStore.getState().updateBoard('r', { name: 'Stretcher' }));
    expect(row('Length max end').queryByRole('alert')).toBeNull();
    await add();
    expect(row('Length max end').getByRole('alert')).toBeInTheDocument();
    act(() => useStore.getState().undo());
    expect(part().name).toBe('Rung');
    expect(row('Length max end').queryByRole('alert')).toBeNull();
  });
  it('is locked while exploded (inv 47)', () => {
    open([rung({ tenons: [tenon('t', 'max')] })]);
    act(() => useStore.getState().setExplode(0.5));
    expect(row('Length max end').getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(row('Length min end').getByRole('button', { name: 'Add round tenon' })).toBeDisabled();
  });
});
