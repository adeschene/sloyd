import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useStore } from '../store/store';
import { createBoard, createDocument, migrateDocument, worldParts } from '../document/document';
import type { Board, Definition } from '../document/document';
import type { SloydDocument } from '../document/document';
import { squareStoolDocument, stoolDocument } from '../document/stoolFixture';
import { defaultHeight, stretcherOf, stretcherPlan } from '../document/stretchers';
import { partsBounds } from '../document/document';

// The Height default's planner, counted (ruling T5c): a pass-through, so every other test sees the real one.
vi.mock('../document/stretchers', async (importOriginal) => {
  const m = await importOriginal<typeof import('../document/stretchers')>();
  return { ...m, defaultHeight: vi.fn(m.defaultHeight) };
});
import { stretcherLinkNote } from '../document/stretcherText';
import type { Units } from '../units/length';
import { Properties } from './Properties';

/**
 * Stretchers Task 5 (spec §4): the Stretcher section in the multi-selection panel (exactly two upright parts) and the
 * rung's readout under Round tenons. Every decision is the store's and the planner's; these tests drive the panel.
 */
const MM: Units = { display: 'metric-mm', precision: 16 };
const s = () => useStore.getState();
const world = () => worldParts(s().doc);
const id = (name: string) => world().find((b) => b.name === name)!.id;
const rungs = () => world().filter((b) => b.name.startsWith('Stretcher'));
const select = (...names: string[]) => act(() => {
  s().selectBoard(id(names[0]!));
  for (const n of names.slice(1)) s().toggleSelected(id(n));
});
const open = (doc: SloydDocument, ...names: string[]) => {
  s().replaceDocument(doc);
  if (names.length > 0) {
    s().selectBoard(id(names[0]!));
    for (const n of names.slice(1)) s().toggleSelected(id(n));
  }
  render(<Properties />);
};
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const heading = () => screen.queryByRole('heading', { name: 'Stretcher' });
const addButton = () => screen.getByRole('button', { name: 'Add stretcher' });
const IMPERIAL_READOUT = 'Between Front left and Front right, 5-5/16" up · shoulder gap up to 1/4"';

/** The four legs' rake set to 10° and the front legs' ends levelled again (the store's own actions): both rungs stale. */
const releanAll = () => act(() => {
  const all = ['Front left', 'Front right', 'Back left', 'Back right'].map(id);
  expect(s().setLean(all, { rake: 10 }, { keepSign: true })).toBeNull();
  expect(s().levelEnds(id('Front right'))).toBeNull();
  expect(s().levelEnds(id('Front left'))).toBeNull();
});

const { fitStretcher: realFit } = useStore.getState();
afterEach(() => { useStore.setState({ fitStretcher: realFit }); vi.restoreAllMocks(); act(() => s().setExplode(0)); });

describe('the Stretcher section (stretchers spec §4)', () => {
  it('shows for exactly two upright parts: not one, not three, not with a flat part', () => {
    open(squareStoolDocument(), 'Front right', 'Front left');
    expect(heading()).toBeInTheDocument();
    select('Front right');
    expect(heading()).toBeNull();
    select('Front right', 'Front left', 'Back left');
    expect(heading()).toBeNull();
    select('Front right', 'Seat');
    expect(heading()).toBeNull();
    select('Back left', 'Back right');
    expect(heading()).toBeInTheDocument();
  });

  it('the defaults: Height one third of the lower top on the grid, Rung size 1", Tenon diameter 5/8"', () => {
    open(squareStoolDocument(), 'Front right', 'Front left');
    expect(input('Height').value).toBe('5-5/16"');
    expect(input('Rung size').value).toBe('1"');
    expect(input('Tenon diameter').value).toBe('5/8"');
  });

  it('a metric project\'s defaults: 135 mm, 25 mm, 16 mm', () => {
    open({ ...squareStoolDocument(), units: MM }, 'Front right', 'Front left');
    expect(input('Height').value).toBe('135 mm');
    expect(input('Rung size').value).toBe('25 mm');
    expect(input('Tenon diameter').value).toBe('16 mm');
  });

  it('the default steps up past a socket the new one would meet (Review Focus 2), and a second Add at it succeeds', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    await user.click(addButton());
    select('Front right', 'Back right');
    expect(input('Height').value).toBe('6-13/16"');
    await user.click(addButton());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(rungs()).toHaveLength(2);
  });

  it('the default follows the Tenon diameter until a Height is typed', async () => {
    const user = userEvent.setup();
    s().replaceDocument(squareStoolDocument());
    // A front rung at 6": a 5/8" side socket at the base height (5-5/16") clears its bore (0.6875" apart), a 7/8" one does not.
    expect(s().addStretcher([id('Front right'), id('Front left')], 6, 1, 5 / 8)).toBeNull();
    s().selectBoard(id('Front right'));
    s().toggleSelected(id('Back right'));
    render(<Properties />);
    expect(input('Height').value).toBe('5-5/16"');
    await user.clear(input('Tenon diameter'));
    await user.type(input('Tenon diameter'), '7/8{Enter}');
    expect(input('Height').value).toBe('6-13/16"');
    await user.clear(input('Height'));
    await user.type(input('Height'), '8{Enter}');
    await user.clear(input('Tenon diameter'));
    await user.type(input('Tenon diameter'), '5/8{Enter}');
    expect(input('Height').value).toBe('8"');
  });

  it('Add stretcher adds the rung at the fields\' values, one undo entry, and selects it; its readout and link notes show', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    await user.click(addButton());
    expect(rungs()).toHaveLength(1);
    expect(s().past).toHaveLength(1);
    expect(s().selectedIds).toEqual([rungs()[0]!.id]);
    expect(stretcherOf(world(), rungs()[0]!)!.height).toBe(5 + 5 / 16);
    expect(screen.getByText(IMPERIAL_READOUT)).toBeInTheDocument();
    expect(screen.getByText(stretcherLinkNote('Back left'))).toBeInTheDocument();
    expect(screen.getByText(stretcherLinkNote('Back right'))).toBeInTheDocument();
  });

  it('the link notes belong to that Add: another selection retires them', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    await user.click(addButton());
    const rung = rungs()[0]!.id;
    select('Seat');
    act(() => s().selectBoard(rung));
    expect(screen.getByText(IMPERIAL_READOUT)).toBeInTheDocument();
    expect(screen.queryByText(/through its link/)).toBeNull();
  });

  it('the link notes belong to that Add: an edit of the rung retires them', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    await user.click(addButton());
    expect(screen.getAllByText(/through its link/)).toHaveLength(2);
    act(() => { s().updateBoard(rungs()[0]!.id, { name: 'Front rung' }); });
    expect(screen.queryByText(/through its link/)).toBeNull();
  });

  it('a refusal shows the planner\'s sentence verbatim as an alert and changes nothing; a field change clears it', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    const ids = [id('Front right'), id('Front left')] as [string, string];
    const sentence = stretcherPlan(s().doc, ids, { height: 16.5, size: 1, diameter: 5 / 8 });
    expect(typeof sentence).toBe('string');
    await user.clear(input('Height'));
    await user.type(input('Height'), '16-1/2{Enter}');
    const doc = s().doc;
    await user.click(addButton());
    expect(screen.getByRole('alert')).toHaveTextContent(sentence as string);
    expect(s().doc).toBe(doc);
    expect(s().past).toHaveLength(0);
    expect(s().selectedIds).toEqual(ids);
    await user.clear(input('Rung size'));
    await user.type(input('Rung size'), '3/4{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a selection change clears the alert', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    await user.clear(input('Height'));
    await user.type(input('Height'), '16-1/2{Enter}');
    await user.click(addButton());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    select('Back left', 'Back right');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a field showing a refusal disables Add (the value on screen is not the one it would use)', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    await user.clear(input('Rung size'));
    await user.type(input('Rung size'), '0{Enter}');
    expect(addButton()).toBeDisabled();
  });

  it('inside the edit lock: exploded, Add is disabled (inv 47)', () => {
    open(squareStoolDocument(), 'Front right', 'Front left');
    act(() => s().setExplode(0.4));
    expect(addButton()).toBeDisabled();
  });
});

describe('the Stretcher section, review fix round 1', () => {
  const calls = () => vi.mocked(defaultHeight).mock.calls.length;
  /** The square stool with its front rung at 6", Front right and Back right selected (default 5-5/16" at 5/8"). */
  const sidePair = () => {
    s().replaceDocument(squareStoolDocument());
    expect(s().addStretcher([id('Front right'), id('Front left')], 6, 1, 5 / 8)).toBeNull();
    s().selectBoard(id('Front right'));
    s().toggleSelected(id('Back right'));
    render(<Properties />);
  };
  const type = async (user: ReturnType<typeof userEvent.setup>, label: string, text: string) => {
    await user.clear(input(label));
    await user.type(input(label), `${text}{Enter}`);
  };
  const refuse = async (user: ReturnType<typeof userEvent.setup>) => {
    await type(user, 'Height', '16-1/2');
    await user.click(addButton());
    expect(screen.getByRole('alert')).toBeInTheDocument();
  };

  it('T5c: a common horizontal move of the pair (a group drag) does not recompute the default; moving one leg does', () => {
    open(squareStoolDocument(), 'Front right', 'Front left');
    const ids = [id('Front right'), id('Front left')];
    const before = calls();
    const b = partsBounds(world().filter((p) => ids.includes(p.id)))!;
    act(() => { s().beginGesture(); s().moveGroupTo(ids, [b.min[0] + 2, b.min[1], b.min[2] + 1]); s().endGesture(); });
    expect(world().find((p) => p.id === ids[0])!.position[0]).not.toBe(squareStoolDocument().boards[0]!.position[0]);
    expect(calls()).toBe(before);
    expect(input('Height').value).toBe('5-5/16"');
    // One leg alone moves the pair's offset: the default is read again.
    act(() => { s().moveGroupTo([ids[0]!], [partsBounds([world().find((p) => p.id === ids[0])!])!.min[0] + 1, 0, partsBounds([world().find((p) => p.id === ids[0])!])!.min[2]]); });
    expect(calls()).toBeGreaterThan(before);
  });

  it('T5c: an edit of another part (the Seat) does not recompute the default', () => {
    open(squareStoolDocument(), 'Front right', 'Front left');
    const before = calls();
    act(() => s().updateBoard(id('Seat'), { name: 'Top' }));
    expect(calls()).toBe(before);
  });

  it('M2: typing exactly the shown default pins it (commitUnchanged): a later diameter change leaves it', async () => {
    const user = userEvent.setup();
    sidePair();
    expect(input('Height').value).toBe('5-5/16"');
    await type(user, 'Height', '5-5/16');
    await type(user, 'Tenon diameter', '7/8');
    expect(input('Height').value).toBe('5-5/16"');
  });

  it('M3: a Height commit clears the alert', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    await refuse(user);
    await type(user, 'Height', '6');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('M3: a Tenon diameter commit clears the alert', async () => {
    const user = userEvent.setup();
    open(squareStoolDocument(), 'Front right', 'Front left');
    await refuse(user);
    await type(user, 'Tenon diameter', '1/2');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the Stretcher section on pairs that are not the square stool (never a crash)', () => {
  const post = (name: string, x: number, z: number, over: Partial<Board> = {}) =>
    createBoard({ name, length: 30, width: 1.5, thickness: 1.5, posture: 'upright', position: [x, 0, z], ...over });
  const plain = (boards: Board[]) => migrateDocument({ ...createDocument('T'), boards });
  const nested = (): SloydDocument => {
    const d: Definition = { id: 'd', boards: [post('A', 0, 0), post('B', 20, 0)], instances: [], hardware: [] };
    return migrateDocument({ ...createDocument('T'), definitions: [d], instances: [{ id: 'i1', name: 'Box', definition: 'd', position: [5, 0, 5], rotation: 90 }] });
  };
  const cases: [string, () => SloydDocument, string, string][] = [
    ['the turned stool', stoolDocument, 'Front right', 'Front left'],
    ['two posts at one place', () => plain([post('A', 0, 0), post('B', 0, 0)]), 'A', 'B'],
    ['two posts touching', () => plain([post('A', 0, 0), post('B', 1.5, 0)]), 'A', 'B'],
    ['two posts on a diagonal', () => plain([post('A', 0, 0), post('B', 10, 10)]), 'A', 'B'],
    ['two upright panels facing across X', () => plain([post('A', 0, 0, { width: 11.25, thickness: 0.75 }), post('B', 20, 0, { width: 11.25, thickness: 0.75 })]), 'A', 'B'],
    ['two plain posts 20" apart', () => plain([post('A', 0, 0), post('B', 20, 0)]), 'A', 'B'],
    ['two posts inside a turned assembly, opened', nested, 'A', 'B'],
  ];
  it.each(cases)('%s: the section renders its default, and Add yields an alert or a rung', async (_, make, a, b) => {
    const user = userEvent.setup();
    const doc = make();
    const named = (n: string) => worldParts(doc).find((p) => p.name === n)!.id;
    s().replaceDocument(doc);
    useStore.setState({ openPath: doc.instances.length > 0 ? 'i1' : null });
    s().selectBoard(named(a));
    s().toggleSelected(named(b));
    render(<Properties />);
    expect(heading()).toBeInTheDocument();
    expect(input('Height').value).toMatch(/"$/);
    await user.click(addButton());
    const alert = screen.queryByRole('alert');
    expect(alert !== null || rungs().length === 1).toBe(true);
  });
});

describe('the rung\'s readout (stretchers spec §4)', () => {
  const withFront = (doc: SloydDocument = squareStoolDocument()) => {
    s().replaceDocument(doc);
    const o = doc.units.display === 'metric-mm' ? { h: 135 / 25.4, size: 25 / 25.4, d: 16 / 25.4 } : { h: 5 + 5 / 16, size: 1, d: 5 / 8 };
    expect(s().addStretcher([id('Front right'), id('Front left')], o.h, o.size, o.d)).toBeNull();
    expect(s().addStretcher([id('Back left'), id('Back right')], o.h, o.size, o.d)).toBeNull();
    s().selectBoard(rungs()[0]!.id);
    render(<Properties />);
  };

  it('a seated rung reads Between …, with no Fit button', () => {
    withFront();
    expect(screen.getByText(IMPERIAL_READOUT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fit the stretcher again' })).toBeNull();
  });

  it('a metric project\'s readout is in mm', () => {
    withFront({ ...squareStoolDocument(), units: MM });
    expect(screen.getByText('Between Front left and Front right, 135 mm up · shoulder gap up to 6 mm')).toBeInTheDocument();
  });

  it('a stale rung reads the stale sentence and Fit the stretcher again; Fit re-fits it (one entry) and the readout returns', async () => {
    const user = userEvent.setup();
    withFront();
    releanAll();
    expect(screen.getByText('No longer fits Front left and Front right — Fit the stretcher again.')).toBeInTheDocument();
    expect(screen.queryByText(/^Between /)).toBeNull();
    const n = s().past.length;
    await user.click(screen.getByRole('button', { name: 'Fit the stretcher again' }));
    expect(s().past).toHaveLength(n + 1);
    expect(stretcherOf(world(), rungs()[0]!)!.seated).toBe(true);
    expect(screen.queryByText(/No longer fits/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fit the stretcher again' })).toBeNull();
    expect(screen.getByText(/^Between Front left and Front right, /)).toBeInTheDocument();
  });

  it('a refused Fit shows the store\'s sentence as an alert', async () => {
    const user = userEvent.setup();
    withFront();
    releanAll();
    const fitStretcher = vi.fn(() => 'Refused for a reason.');
    act(() => useStore.setState({ fitStretcher }));
    await user.click(screen.getByRole('button', { name: 'Fit the stretcher again' }));
    expect(fitStretcher).toHaveBeenCalledWith(rungs()[0]!.id);
    expect(screen.getByRole('alert')).toHaveTextContent('Refused for a reason.');
  });

  it('M1: a refused Fit\'s alert clears on any document change, the rung object unchanged', async () => {
    const user = userEvent.setup();
    withFront();
    releanAll();
    const fitStretcher = vi.fn(() => 'Refused for a reason.');
    act(() => useStore.setState({ fitStretcher }));
    await user.click(screen.getByRole('button', { name: 'Fit the stretcher again' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    const rung = world().find((b) => b.id === rungs()[0]!.id);
    act(() => s().updateBoard(id('Seat'), { name: 'Top' }));
    expect(world().find((b) => b.id === rung!.id)).toBe(rung);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a part that is not a stretcher has no readout', () => {
    open(squareStoolDocument(), 'Front right');
    expect(heading()).toBeNull();
    expect(screen.queryByText(/^Between /)).toBeNull();
  });

  it('exploded, Fit is disabled (inv 47)', () => {
    withFront();
    releanAll();
    act(() => s().setExplode(0.4));
    expect(screen.getByRole('button', { name: 'Fit the stretcher again' })).toBeDisabled();
  });
});

