import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useStore } from '../store/store';
import { createBoard, displayNames, worldParts } from '../document/document';
import { camJointPlan } from '../document/camJoint';
import { CAM_JOINT_COUNT, CAM_JOINT_NONE, camJointLine, camJointLinkNote, camJointReused } from '../document/camJointText';
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
