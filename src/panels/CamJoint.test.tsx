import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useStore } from '../store/store';
import { createBoard, displayNames, worldParts } from '../document/document';
import { camJointPlan } from '../document/camJoint';
import {
  CAM_JOINT_ALREADY, CAM_JOINT_COUNT, CAM_JOINT_NONE, CAM_JOINT_TWO_FITS, camJointLine, camJointLinkNote, camJointReused,
  camJointStale, camJointStaleNote,
} from '../document/camJointText';
import { boreEnds, boreRow } from '../document/legSockets';
import { mm } from '../document/holes';
import type { V3 } from '../document/angleCuts';
import type { Board, SloydDocument } from '../document/types';
import { carcass } from '../document/camJointFixtures';
import { Properties } from './Properties';

vi.mock('../document/camJoint', async (orig) => {
  const m = await orig<typeof import('../document/camJoint')>();
  return { ...m, camJointPlan: vi.fn(m.camJointPlan) };
});

/** Cam-and-bolt joint Task 5 (spec §4): the section in the multi-selection panel; every decision is the planner's. */
const s = () => useStore.getState();
const part = (id: string) => worldParts(s().doc).find((b) => b.id === id)!;
const open = (doc: ReturnType<typeof carcass>['doc'], ...ids: string[]) => {
  act(() => {
    s().replaceDocument(doc);
    s().selectBoard(ids[0]!);
    for (const i of ids.slice(1)) s().toggleSelected(i);
  });
  render(<Properties />);
};
const heading = () => screen.queryByRole('heading', { name: 'Cam-and-bolt joint' });
const addButton = () => screen.getByRole('button', { name: 'Add joint' });
const fittings = () => screen.getByLabelText('Fittings') as HTMLInputElement;
const face = () => screen.getByLabelText('Cam face') as HTMLSelectElement;

afterEach(async () => {
  vi.restoreAllMocks();
  const real = await vi.importActual<typeof import('../document/camJoint')>('../document/camJoint');
  vi.mocked(camJointPlan).mockReset().mockImplementation(real.camJointPlan);
});

describe('the Cam-and-bolt joint section (spec §4)', () => {
  it('shows the joint line, the Cam face select defaulting to Underside, and Fittings 2', () => {
    const c = carcass();
    open(c.doc, c.shelf, c.left);
    expect(heading()).toBeInTheDocument();
    const names = displayNames(c.doc);
    expect(screen.getByText(camJointLine(names.get(c.shelf)!, 'min', names.get(c.left)!))).toBeInTheDocument();
    expect(face().selectedOptions[0]!.textContent).toBe('Underside');
    expect(Array.from(face().options).map((o) => o.textContent)).toEqual(['Underside', 'Top']);
    expect(fittings().value).toBe('2');
    expect(addButton()).toBeEnabled();
  });

  it('Add joint writes the bores, with no error', async () => {
    const c = carcass();
    open(c.doc, c.shelf, c.left);
    await userEvent.click(addButton());
    expect(part(c.left).holes.length).toBe(2);
    expect(part(c.shelf).holes.length).toBe(2); // the cam row and the bolt row, each with count 2
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a typed Fittings count is used, and Enter commits it', async () => {
    const c = carcass();
    open(c.doc, c.shelf, c.left);
    await userEvent.clear(fittings());
    await userEvent.type(fittings(), '3{Enter}');
    expect(fittings().value).toBe('3');
    await userEvent.click(addButton());
    expect(part(c.left).holes.length).toBe(3);
  });

  it('the Cam face choice reaches the plan', async () => {
    const c = carcass();
    open(c.doc, c.shelf, c.left);
    await userEvent.selectOptions(face(), 'Top');
    expect(vi.mocked(camJointPlan).mock.lastCall![3]).not.toBe(null);
    const chosen = vi.mocked(camJointPlan).mock.lastCall![3];
    await userEvent.selectOptions(face(), 'Underside');
    expect(vi.mocked(camJointPlan).mock.lastCall![3]).not.toBe(chosen);
  });

  it('two parts that do not meet: the button is disabled and the sentence is a field-note', () => {
    const c = carcass();
    const far = createBoard({ id: 'far', name: 'Far', posture: 'flat', length: 5, width: 5, thickness: 0.75, position: [60, 0, 60] });
    open({ ...c.doc, boards: [...c.doc.boards, far] }, c.shelf, 'far');
    const names = displayNames(s().doc);
    const note = screen.getByText(CAM_JOINT_NONE(names.get(c.shelf)!, names.get('far')!));
    expect(note).toHaveClass('field-note');
    expect(addButton()).toBeDisabled();
    expect(screen.queryByLabelText('Fittings')).toBeNull();
  });

  it('a typed 0 shows the count refusal and the button does not act', async () => {
    const c = carcass();
    open(c.doc, c.shelf, c.left);
    await userEvent.clear(fittings());
    await userEvent.type(fittings(), '0{Enter}');
    expect(screen.getByText(CAM_JOINT_COUNT)).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    const before = s().doc;
    await userEvent.click(addButton());
    expect(s().doc).toBe(before);
  });

  it('with the shelf\'s pair already there, the count and select are replaced by the reuse line', async () => {
    const c = carcass();
    s().replaceDocument(c.doc);
    expect(s().addCamJoint([c.shelf, c.left], null, null)).toEqual({ notes: [] });
    // Strip the side's bores: the shelf's whole pair stays, B's bores are missing again.
    const stripped = { ...s().doc, boards: s().doc.boards.map((b) => (b.id === c.left ? { ...b, holes: [] } : b)) };
    open(stripped, c.shelf, c.left);
    expect(screen.queryByLabelText('Fittings')).toBeNull();
    expect(screen.queryByLabelText('Cam face')).toBeNull();
    expect(screen.getByText(camJointReused(2))).toBeInTheDocument();
    expect(addButton()).toBeEnabled();
  });

  it('link notes show as field-notes after an add', async () => {
    const c = carcass();
    // A second shelf linked to the first through a Shape would be heavy; assert the wiring with the store's own return.
    open(c.doc, c.shelf, c.left);
    const real = s().addCamJoint;
    useStore.setState({ addCamJoint: (ids, n, f) => { real(ids, n, f); return { notes: [camJointLinkNote('Shelf 2')] }; } });
    await userEvent.click(addButton());
    expect(screen.getByText(camJointLinkNote('Shelf 2'))).toHaveClass('field-note');
    useStore.setState({ addCamJoint: real });
  });

  it('is absent with three parts selected, and with one', () => {
    const c = carcass();
    open(c.doc, c.shelf, c.left, c.right);
    expect(heading()).toBeNull();
    act(() => s().selectBoard(c.shelf));
    expect(heading()).toBeNull();
  });

  it('a planner throw (R14) hides the section, logs, and never crashes render', () => {
    const c = carcass();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(camJointPlan).mockImplementation(() => { throw new Error('caller bug'); });
    open(c.doc, c.shelf, c.left);
    expect(heading()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add joint' })).toBeNull();
    expect(err).toHaveBeenCalled();
  });
});

// Fit the joint again (fu 602; fit-again spec §4). Local helpers, as `camJoint.fit.test.ts`' (never import a test module).
const patched = (doc: SloydDocument, id: string, f: (b: Board) => Board): SloydDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.id === id ? f(b as Board) : b)) });
const movedY = (doc: SloydDocument, id: string, dy: number) =>
  patched(doc, id, (b) => ({ ...b, position: [b.position[0], b.position[1] + dy, b.position[2]] }));
/** The carcass with the shelf joined to the left side through the store; the side's two joint bores' ids. */
function joined() {
  const c = carcass();
  act(() => s().replaceDocument(c.doc));
  expect(s().addCamJoint([c.shelf, c.left], null, null)).toEqual({ notes: [] });
  return { ...c, doc: s().doc, ids: part(c.left).holes.map((r) => r.id) };
}
const fitButton = () => screen.getByRole('button', { name: 'Fit the joint again' });

describe('Fit the joint again: the section (fit-again spec §4.1)', () => {
  it('after the shelf moves, the line reads camJointStale and the button reads Fit the joint again; clicking it fits', async () => {
    const { doc, shelf, left, ids } = joined();
    open(movedY(doc, shelf, 2), shelf, left);
    expect(screen.getByText(camJointStale('Shelf', 'Left side'))).toHaveClass('field-note');
    expect(screen.queryByRole('button', { name: 'Add joint' })).toBeNull();
    await userEvent.click(fitButton());
    expect(part(left).holes.map((r) => r.id)).toEqual(ids); // moved in place, ids kept, nothing added
    expect(camJointPlan(s().doc, [shelf, left], null, null)).toBe(CAM_JOINT_ALREADY('Shelf', 'Left side'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a tie shows Fit the joint again disabled, with CAM_JOINT_TWO_FITS as a field-note', async () => {
    const { doc: d, shelf, left, ids } = joined();
    const l = worldParts(d).find((b) => b.id === left)!;
    const copies = ids.map((id, i) => {
      const r = l.holes.find((x) => x.id === id)!;
      const [m, f] = boreEnds(l, r);
      const mouth: V3 = [m[0], m[1] + 2, m[2]];
      const u: V3 = [f[0] - m[0], f[1] - m[1], f[2] - m[2]];
      return { ...boreRow(l, r.face, r.from, mouth, u, mm(5), mm(12)), id: `copy${i}` };
    });
    open(movedY(patched(d, left, (b) => ({ ...b, holes: [...b.holes, ...copies] })), shelf, 1), shelf, left);
    expect(screen.getByText(CAM_JOINT_TWO_FITS('Left side'))).toHaveClass('field-note');
    expect(screen.getByText(camJointStale('Shelf', 'Left side'))).toBeInTheDocument();
    expect(fitButton()).toBeDisabled();
    // A's pair is reused on a tie, as on a fit: no Cam face or Fittings to edit.
    expect(screen.queryByLabelText('Cam face')).toBeNull();
    expect(screen.queryByLabelText('Fittings')).toBeNull();
    const before = s().doc;
    await userEvent.click(fitButton());
    expect(s().doc).toBe(before);
  });

  it('a plain add keeps Add joint and shows no stale line', () => {
    const c = carcass();
    open(c.doc, c.shelf, c.left);
    expect(addButton()).toBeEnabled();
    expect(screen.queryByText(camJointStale('Shelf', 'Left side'))).toBeNull();
  });
});

describe('Fit the joint again: A\'s readout (fit-again spec §4.2)', () => {
  const note = () => screen.queryByText(camJointStaleNote('Left side'));

  it('with the moved shelf alone selected, camJointStaleNote(Left side) shows', () => {
    const { doc, shelf } = joined();
    open(movedY(doc, shelf, 2), shelf);
    expect(note()).toHaveClass('field-note');
    expect(heading()).toBeInTheDocument();
  });

  it('with a fitted shelf it does not', () => {
    const { doc, shelf } = joined();
    open(doc, shelf);
    expect(note()).toBeNull();
    expect(heading()).toBeNull();
  });

  it('with a shelf whose Cam lock was never bored it does not', () => {
    const { doc, shelf, left } = joined();
    open(patched(doc, left, (b) => ({ ...b, holes: [] })), shelf);
    expect(note()).toBeNull();
    expect(heading()).toBeNull();
  });

  it('follows ANOTHER part: moving the side up to meet the shelf clears the note, the selection unchanged', () => {
    const { doc, shelf, left } = joined();
    open(movedY(doc, shelf, 2), shelf);
    expect(note()).not.toBeNull();
    const p = part(left).position;
    act(() => { s().updateBoard(left, { position: [p[0], p[1] + 2, p[2]] }); });
    expect(s().selectedIds).toEqual([shelf]);
    expect(note()).toBeNull();
  });
});
