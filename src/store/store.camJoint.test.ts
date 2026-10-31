import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from './store';
import { createBoard, migrateDocument, sameSnapPoint, snapPointsFor, worldParts } from '../document/document';
import type { Dovetail, SloydDocument } from '../document/document';
import { camJointPlan } from '../document/camJoint';
import { linkByRole } from '../document/roleLinks';
import { CAM_JOINT_BARE_FACE, CAM_JOINT_NONE, camJointLinkNote } from '../document/camJointText';
import { carcass } from '../document/camJointFixtures';
import { dovetailMoveClear } from '../document/dovetailText';
import { displayNames } from '../document/tree';

// The real planner, wrapped so one test can make it throw (R14).
vi.mock('../document/camJoint', async (orig) => {
  const m = await orig<typeof import('../document/camJoint')>();
  return { ...m, camJointPlan: vi.fn(m.camJointPlan) };
});

/**
 * Cam-and-bolt joint Task 4: the store action. The planner decides every refusal (re-run at click time); the store adds
 * the dovetail-zone refusal per write, writes both parts in ONE `edit` and re-judges held points.
 */
const s = () => useStore.getState();
const setup = (doc: SloydDocument) => {
  useStore.setState({ doc, selectedIds: [], openPath: null, hiddenIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, tapeAxis: null, explode: 0, gesturing: false, gestureSnapshotTaken: false });
};
const part = (id: string) => worldParts(s().doc).find((b) => b.id === id)!;

let c: ReturnType<typeof carcass>;
const ids = (): [string, string] => [c.shelf, c.left];
beforeEach(() => {
  vi.mocked(camJointPlan).mockClear();
  c = carcass();
  setup(c.doc);
});

describe('addCamJoint', () => {
  it('one undo entry; undo restores the exact prior doc', () => {
    const before = s().doc;
    const r = s().addCamJoint(ids(), null, null);
    expect(r).toEqual({ notes: [] });
    expect(s().past.length).toBe(1);
    expect(s().doc).not.toBe(before);
    s().undo();
    expect(s().doc).toBe(before);
  });

  it('writes the plan: the stored holes of both parts are the plan\'s', () => {
    expect(s().addCamJoint(ids(), null, null)).not.toBeNull();
    // The plan the action itself made (rows carry fresh ids per call, so a second plan would differ).
    const plan = vi.mocked(camJointPlan).mock.results[0]!.value as Exclude<ReturnType<typeof camJointPlan>, string>;
    expect(plan.writes).toHaveLength(2);
    for (const w of plan.writes) {
      expect(part(w.id).holes).toEqual(w.holes);
      expect(w.holes.length).toBeGreaterThan(0);
    }
    // The shelf gained the lock; the left side its coaxial bores.
    expect(part(c.shelf).holes.length).toBeGreaterThan(0);
    expect(part(c.left).holes.length).toBeGreaterThan(0);
  });

  it('a stale id does nothing', () => {
    const before = s().doc;
    expect(s().addCamJoint([c.shelf, 'nope'], null, null)).toBeNull();
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });

  it('exploded does nothing', () => {
    const before = s().doc;
    s().setExplode(0.5);
    expect(s().addCamJoint(ids(), null, null)).toBeNull();
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });

  it('gesturing does nothing', () => {
    const before = s().doc;
    useStore.setState({ gesturing: true });
    expect(s().addCamJoint(ids(), null, null)).toBeNull();
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });

  it('re-plans at click time: a shelf moved off the side refuses with the no-joint sentence, nothing written', () => {
    s().updateBoard(c.shelf, { position: [5, 10, 0] });
    const before = s().doc;
    const n = displayNames(before);
    expect(s().addCamJoint(ids(), null, null)).toBe(CAM_JOINT_NONE(n.get(c.shelf)!, n.get(c.left)!));
    expect(s().doc).toBe(before);
  });

  it('a bore in a dovetailed side\'s zone refuses with the zone sentence, nothing written', () => {
    const tails: Dovetail = { id: 'dt', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 0.75 };
    const doc0 = carcass().doc;
    // The shelf sits on the side's bottom end, so B's bore lands in the dovetailed zone.
    setup(migrateDocument({
      ...doc0,
      boards: doc0.boards.map((b) => (b.id === 'left' ? { ...b, dovetails: [tails] } : b.id === 'shelf' ? { ...b, position: [b.position[0]!, 0.2, b.position[2]!] } : b)),
    }));
    const before = s().doc;
    const plan = camJointPlan(before, ids(), null, null);
    expect(typeof plan).not.toBe('string'); // the planner itself accepts; the zone is the store's refusal
    expect(s().addCamJoint(ids(), null, null)).toBe(dovetailMoveClear(displayNames(before).get(c.left)!));
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });

  it('a planner throw is caught, logged, and writes nothing (R14)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(camJointPlan).mockImplementationOnce(() => { throw new Error('caller bug'); });
    const before = s().doc;
    expect(s().addCamJoint(ids(), null, null)).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
    err.mockRestore();
  });

  it('reusing A\'s whole pair adds only B\'s bores, in one entry', () => {
    expect(s().addCamJoint(ids(), null, null)).not.toBeNull();
    // Sides the shelf meets on its other end: a fresh joint to the right side reuses nothing, so reuse is seen by
    // re-adding against the same side after dropping B's bores.
    const aHoles = part(c.shelf).holes;
    s().updateBoard(c.left, { holes: [] });
    const past = s().past.length;
    const r = s().addCamJoint(ids(), null, null);
    expect(r).toEqual({ notes: [] });
    expect(s().past.length).toBe(past + 1);
    expect(part(c.shelf).holes).toEqual(aHoles);
    expect(part(c.left).holes.length).toBeGreaterThan(0);
  });

  it('notes for a linked shelf: the sentence comes back, and the linked part gained the rows', () => {
    const { doc: d0, left, right, shelf } = carcass();
    const second = createBoard({ ...worldParts(d0).find((b) => b.id === shelf)!, id: 'shelf2', name: 'Shelf 2', position: [0.75, 20, 0] });
    const d1 = migrateDocument({ ...d0, boards: [...d0.boards, second] });
    setup(linkByRole(d1, new Map([[left, 'left'], [right, 'right'], [shelf, 'shelf'], ['shelf2', 'shelf']])));
    const r = s().addCamJoint([shelf, left], null, null);
    expect(r).toEqual({ notes: [camJointLinkNote(displayNames(s().doc).get('shelf2')!)] });
    expect(part('shelf2').holes).toEqual(part(shelf).holes.map((h) => ({ ...h, id: expect.any(String) })));
    expect(s().past.length).toBe(1);
  });

  it('plain-linked sides (ruling R18): refused with the bare-face sentence; nothing written, no undo entry', () => {
    const { doc: d0, left, right, shelf } = carcass();
    setup(linkByRole(d0, new Map([[left, 'side'], [right, 'side']])));
    const before = s().doc;
    expect(s().addCamJoint([shelf, left], null, null)).toBe(CAM_JOINT_BARE_FACE(displayNames(before).get(right)!));
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });
});

describe('addCamJoint: Fit again (fu 602)', () => {
  /** The carcass joined, then the shelf moved up by `dy` in the stored document (no undo entry, no held points). */
  const joinedThenMoved = (dy: number) => {
    expect(s().addCamJoint(ids(), null, null)).not.toBeNull();
    const doc = s().doc;
    const moved: SloydDocument = {
      ...doc,
      boards: doc.boards.map((b) => (b.id === c.shelf ? { ...b, position: [b.position[0]!, b.position[1]! + dy, b.position[2]!] as typeof b.position } : b)),
    };
    useStore.setState({ doc: moved, past: [], future: [] });
    return moved;
  };

  it('a fit is one undo entry; undo restores the exact old rows (ids and order)', () => {
    joinedThenMoved(2);
    const oldLeft = part(c.left).holes;
    const oldShelf = part(c.shelf).holes;
    const r = s().addCamJoint(ids(), null, null);
    expect(r).not.toBeNull();
    expect(typeof r).not.toBe('string');
    expect(s().past.length).toBe(1);
    const nowLeft = part(c.left).holes;
    expect(nowLeft).not.toEqual(oldLeft); // the bores really moved
    expect(nowLeft.map((h) => h.id)).toEqual(oldLeft.map((h) => h.id)); // in place: same ids, same order
    s().undo();
    expect(part(c.left).holes).toEqual(oldLeft);
    expect(part(c.shelf).holes).toEqual(oldShelf);
  });

  it('a tape anchor on a moved bore\'s rim drops', () => {
    joinedThenMoved(2);
    const left = part(c.left);
    const afterPlan = camJointPlan(s().doc, ids(), null, null);
    expect(typeof afterPlan).not.toBe('string');
    const movedRows = new Set((afterPlan as Exclude<typeof afterPlan, string>).moved);
    expect(movedRows.size).toBeGreaterThan(0);
    // A snap point on this side that the fit will swallow: found as one present now and absent after.
    const pointsOf = (b: typeof left) => snapPointsFor(b);
    const before = pointsOf(left);
    useStore.setState({ tapeAnchor: null });
    expect(s().addCamJoint(ids(), null, null)).not.toBeNull();
    const after = pointsOf(part(c.left));
    const gone = before.filter((p) => !after.some((q) => sameSnapPoint(p, q)));
    expect(gone.length).toBeGreaterThan(0);
    s().undo();
    s().setTapeAnchor(gone[0]!);
    expect(s().tapeAnchor).not.toBeNull();
    expect(s().addCamJoint(ids(), null, null)).not.toBeNull();
    expect(s().tapeAnchor).toBeNull();
  });

  it('a fit into a dovetailed side\'s zone refuses with the zone sentence, nothing written', () => {
    const tails: Dovetail = { id: 'dt', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 0.75 };
    // Joined where the zone is clear, then dovetailed, then the shelf moved down so the MOVE carries a bore into the zone.
    expect(s().addCamJoint(ids(), null, null)).not.toBeNull();
    const doc = s().doc;
    setup(migrateDocument({
      ...doc,
      boards: doc.boards.map((b) => (b.id === c.left ? { ...b, dovetails: [tails] } : b.id === c.shelf ? { ...b, position: [b.position[0]!, 0.2, b.position[2]!] } : b)),
    }));
    const before = s().doc;
    const plan = camJointPlan(before, ids(), null, null);
    expect(typeof plan).not.toBe('string');
    expect((plan as Exclude<typeof plan, string>).moved.length).toBeGreaterThan(0);
    expect(s().addCamJoint(ids(), null, null)).toBe(dovetailMoveClear(displayNames(before).get(c.left)!));
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });

  it('exploded and gesturing: a fit does nothing', () => {
    const moved = joinedThenMoved(2);
    s().setExplode(0.5);
    expect(s().addCamJoint(ids(), null, null)).toBeNull();
    expect(s().doc).toBe(moved);
    s().setExplode(0);
    useStore.setState({ gesturing: true });
    expect(s().addCamJoint(ids(), null, null)).toBeNull();
    expect(s().doc).toBe(moved);
    expect(s().past.length).toBe(0);
  });
});
