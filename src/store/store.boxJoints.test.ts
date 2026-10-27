import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { createBoard, createDocument } from '../document/document';
import type { Board, SloydDocument } from '../document/document';
import { BOX_NO_CORNER, BOX_WIDTH_POSITIVE } from '../document/boxJointText';

/**
 * Box joints Task 4: the store action. The planner decides every refusal before `edit()`; the write is ONE `edit` (one
 * undo entry), then held points are re-judged (inv 24); refused while exploded (inv 47) or gesturing.
 */
const s = () => useStore.getState();
const setup = (doc: SloydDocument) => {
  useStore.setState({ doc, selectedIds: [], openPath: null, hiddenIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, tapeAxis: null, explode: 0, gesturing: false, gestureSnapshotTaken: false });
};

/** The Task 3 drawer, `butt` corners (the sides run the full depth): 1/2" stock, 4" tall, inside 12 x 16. */
function drawerParts(): Board[] {
  const t = 0.5, h = 4, iw = 12, id = 16;
  const fb = (i: string, name: string, z: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: t, position: [t, 0, z] });
  const side = (i: string, name: string, x: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 90, length: id + 2 * t, width: h, thickness: t, position: [x, 0, 0] });
  return [fb('f', 'Front', 0), fb('b', 'Back', id + t), side('l', 'Side left', 0), side('r', 'Side right', iw + t)];
}
const drawer = (): SloydDocument => ({ ...createDocument('Drawer'), boards: drawerParts() });
const IDS = ['f', 'b', 'l', 'r'];

beforeEach(() => setup(drawer()));

describe('boxJointCorners (box joints spec §6)', () => {
  it('the drawer: ONE undo entry; undo restores the before exactly', () => {
    const before = s().doc;
    expect(s().boxJointCorners(IDS, 0.5, false)).toBeNull();
    expect(s().past.length).toBe(1);
    expect(s().doc).not.toEqual(before);
    expect((s().doc.boards as Board[]).every((b) => b.cuts.length > 0)).toBe(true);
    s().undo();
    expect(s().doc).toEqual(before);
    expect(s().past.length).toBe(0);
  });

  it('a refusal returns the planner sentence and pushes nothing', () => {
    const before = s().doc;
    expect(s().boxJointCorners(['f', 'b'], 0.5, false)).toBe(BOX_NO_CORNER);
    expect(s().boxJointCorners(IDS, 0, false)).toBe(BOX_WIDTH_POSITIVE);
    expect(s().past.length).toBe(0);
    expect(s().doc).toBe(before);
  });

  it('while exploded: null and nothing changes', () => {
    const before = s().doc;
    s().setExplode(0.5);
    expect(s().boxJointCorners(IDS, 0.5, false)).toBeNull();
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
    // A refusing input is not answered either: the guard comes before the planner (edit() alone would not do this).
    expect(s().boxJointCorners(['f', 'b'], 0.5, false)).toBeNull();
  });

  it('while gesturing: null and nothing changes', () => {
    const before = s().doc;
    useStore.setState({ gesturing: true });
    expect(s().boxJointCorners(IDS, 0.5, false)).toBeNull();
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });

  it('a stale id: null and nothing changes', () => {
    const before = s().doc;
    expect(s().boxJointCorners([...IDS, 'gone'], 0.5, false)).toBeNull();
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });
});
