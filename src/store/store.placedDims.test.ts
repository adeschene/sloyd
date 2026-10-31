import { useStore, shownTapeNotice, keepTapeDimension, TAPE_TYPED_PENDING } from './store';
import { createBoard, createDocument, snapPointsFor } from '../document/document';
import { worldParts } from '../document/tree';
import { dimensionValue } from '../document/placedDims';
import type { SnapPoint } from '../document/document';

const st = () => useStore.getState();
const parts = () => worldParts(st().doc);

/** Two corner points of the first part that differ along X only. */
function pair(): [SnapPoint, SnapPoint] {
  const b = parts()[0]!;
  const pts = snapPointsFor(b);
  const a = pts[0]!;
  const c = pts.find((p) => Math.abs(p.at[0] - a.at[0]) > 1e-6 && Math.abs(p.at[1] - a.at[1]) < 1e-9 && Math.abs(p.at[2] - a.at[2]) < 1e-9)!;
  return [a, c];
}

beforeEach(() => {
  st().replaceDocument(createDocument('Test'));
  st().addBoard();
});

describe('addDimension', () => {
  it('pushes one entry and appends one dimension with box-lattice anchors', () => {
    const [a, b] = pair();
    const past = st().past.length;
    expect(st().addDimension(a, b, 'x')).toBe(true);
    expect(st().past.length).toBe(past + 1);
    expect(st().doc.dimensions).toHaveLength(1);
    const d = st().doc.dimensions[0]!;
    expect('frac' in d.a && 'frac' in d.b).toBe(true);
    expect(dimensionValue(parts(), d)).toBeCloseTo(Math.abs(b.at[0] - a.at[0]));
  });

  it('never touches the held points, the axis or the selection', () => {
    const [a, b] = pair();
    st().setTapeAnchor(a);
    st().setTapeHover(b);
    st().setTapeAxis('x');
    const sel = st().selectedIds;
    const anchor = st().tapeAnchor, hover = st().tapeHover;
    st().addDimension(a, b, 'x');
    expect(st().tapeAnchor).toBe(anchor);
    expect(st().tapeHover).toBe(hover);
    expect(st().tapeAxis).toBe('x');
    expect(st().selectedIds).toBe(sel);
  });

  it('refuses a level pair with no undo entry', () => {
    const [a] = pair();
    const past = st().past.length;
    expect(st().addDimension(a, a, 'x')).toBe(false);
    expect(st().past.length).toBe(past);
    expect(st().doc.dimensions).toHaveLength(0);
  });

  it('refuses mid-gesture', () => {
    const [a, b] = pair();
    st().beginGesture();
    const past = st().past.length;
    expect(st().addDimension(a, b, 'x')).toBe(false);
    expect(st().past.length).toBe(past);
    expect(st().doc.dimensions).toHaveLength(0);
  });

  it('refuses while exploded', () => {
    const [a, b] = pair();
    st().setExplode(0.5);
    const past = st().past.length;
    expect(st().addDimension(a, b, 'x')).toBe(false);
    expect(st().past.length).toBe(past);
  });

  it('refuses a board-owned end whose part is not in the tree', () => {
    const [a, b] = pair();
    const ghost = { ...b, owner: { type: 'board' as const, id: 'no-such-part' } } as SnapPoint;
    const past = st().past.length;
    expect(st().addDimension(a, ghost, 'x')).toBe(false);
    expect(st().past.length).toBe(past);
    expect(st().doc.dimensions).toHaveLength(0);
  });
});

describe('a dimension and its part', () => {
  it('survives deleting the part (value null) and undo brings the value back', () => {
    const [a, b] = pair();
    st().addDimension(a, b, 'x');
    const before = dimensionValue(parts(), st().doc.dimensions[0]!);
    st().deleteBoard(parts()[0]!.id);
    expect(st().doc.dimensions).toHaveLength(1);
    expect(dimensionValue(parts(), st().doc.dimensions[0]!)).toBeNull();
    st().undo();
    expect(dimensionValue(parts(), st().doc.dimensions[0]!)).toBe(before);
  });

  it('Group re-keys the anchor part, keeps the value; undo restores part and tree; Ungroup keeps the value', () => {
    st().addBoard();
    const [a, b] = pair();
    st().addDimension(a, b, 'x');
    const d0 = st().doc.dimensions[0]!;
    const before = dimensionValue(parts(), d0)!;
    const docBefore = st().doc;
    st().selectBoard(parts()[0]!.id);
    st().groupSelected();
    const d1 = st().doc.dimensions[0]!;
    expect((d1.a as { part: string }).part).not.toBe((d0.a as { part: string }).part);
    expect(dimensionValue(parts(), d1)).toBeCloseTo(before, 9);
    st().undo();
    expect(st().doc).toBe(docBefore);
    expect((st().doc.dimensions[0]!.a as { part: string }).part).toBe((d0.a as { part: string }).part);
    st().redo();
    const groupId = st().doc.instances?.[0]?.id ?? st().selectedIds[0]!;
    st().selectBoard(groupId);
    st().ungroupSelected();
    expect(dimensionValue(parts(), st().doc.dimensions[0]!)).toBeCloseTo(before, 9);
  });
});

describe('removeDimension', () => {
  it('is a no-op for an unknown id and one entry for a known one', () => {
    const [a, b] = pair();
    st().addDimension(a, b, 'x');
    const past = st().past.length;
    st().removeDimension('nope');
    expect(st().past.length).toBe(past);
    st().removeDimension(st().doc.dimensions[0]!.id);
    expect(st().past.length).toBe(past + 1);
    expect(st().doc.dimensions).toHaveLength(0);
  });

  it('is refused while exploded', () => {
    const [a, b] = pair();
    st().addDimension(a, b, 'x');
    st().setExplode(0.5);
    const past = st().past.length;
    st().removeDimension(st().doc.dimensions[0]!.id);
    expect(st().past.length).toBe(past);
    expect(st().doc.dimensions).toHaveLength(1);
  });
});

describe('tapeNotice (self-invalidating)', () => {
  const shown = () => shownTapeNotice(st());

  it('shows after setTapeNotice, hides when the axis changes', () => {
    const [a] = pair();
    st().setTapeAnchor(a);
    st().setTapeNotice('x');
    expect(shown()).toBe('x');
    st().setTapeAxis('y');
    expect(shown()).toBeNull();
  });

  it('hides when the hovered part is deleted with the anchor held', () => {
    st().addBoard();
    const [first, second] = parts();
    const a = snapPointsFor(first!)[0]!;
    const h = snapPointsFor(second!)[0]!;
    st().setTapeAnchor(a);
    st().setTapeHover(h);
    st().setTapeNotice('x');
    expect(shown()).toBe('x');
    st().deleteBoard(second!.id);
    expect(shown()).toBeNull();
  });

  it('hides when the hover moves', () => {
    const [a, b] = pair();
    st().setTapeAnchor(a);
    st().setTapeHover(a);
    st().setTapeNotice('x');
    st().setTapeHover(b);
    expect(shown()).toBeNull();
  });

  it('setTapeNotice(null) clears it', () => {
    st().setTapeNotice('x');
    st().setTapeNotice(null);
    expect(st().tapeNotice).toBeNull();
  });
});

describe('hoveredDimension', () => {
  it('is view state, cleared when its dimension is removed', () => {
    const [a, b] = pair();
    st().addDimension(a, b, 'x');
    const id = st().doc.dimensions[0]!.id;
    const past = st().past.length;
    st().setHoveredDimension(id);
    expect(st().past.length).toBe(past);
    st().removeDimension(id);
    expect(st().hoveredDimension).toBeNull();
  });

  it('replaceDocument resets it', () => {
    st().setHoveredDimension('d');
    st().replaceDocument(createDocument('B'));
    expect(st().hoveredDimension).toBeNull();
  });
});

/**
 * Ungroup never lands a path a dimension anchor names (final review, Critical; spec Amended (build) ruling 13). A
 * shared definition's part ids are the same in every copy, so without the rule a detached anchor re-attaches,
 * silently, to a DIFFERENT part that lands at its old path.
 */
describe('a detached dimension stays detached through Ungroup', () => {
  const corner = { length: 0, width: 0, thickness: 0 } as const;
  const guideAt = (x: number): SnapPoint => ({ kind: 'corner', at: [x, 0, 0], owner: { type: 'guide', id: 'g' } } as SnapPoint);
  const cornerOf = (path: string): SnapPoint => {
    const b = parts().find((p) => p.id === path)!;
    return snapPointsFor(b).find((p) => p.at.every((v, i) => Math.abs(v - b.position[i]!) < 1e-9))!;
  };
  const drawerDoc = (rootPart: boolean) => {
    const doc = createDocument('Drawers');
    const part = createBoard({ id: 'b1', name: 'Side', position: [20, 0, 0] });
    return {
      ...doc,
      boards: rootPart ? [createBoard({ id: 'b1', name: 'Loose', position: [20, 0, 0] })] : [],
      definitions: [{ id: 'def', boards: [part], instances: [], hardware: [] }],
      instances: [
        ...(rootPart ? [] : [{ id: 'd1', name: 'Drawer 1', definition: 'def', position: [0, 0, 0] as [number, number, number], rotation: 0 as const }]),
        { id: 'd2', name: 'Drawer 2', definition: 'def', position: [50, 0, 0] as [number, number, number], rotation: 0 as const },
      ],
    };
  };
  const value = () => dimensionValue(parts(), st().doc.dimensions[0]!);
  const ungroup = (id: string) => { st().selectBoard(id); st().ungroupSelected(); };

  it('two copies of one definition: delete the first ungrouped part, ungroup the second — still detached', () => {
    st().replaceDocument(drawerDoc(false));
    ungroup('d1');
    expect(parts().map((p) => p.id)).toContain('b1');
    expect(st().addDimension(guideAt(-10), cornerOf('b1'), 'x')).toBe(true);
    expect(value()).toBeCloseTo(30, 9);
    st().deleteBoard('b1');
    expect(value()).toBeNull();
    ungroup('d2');
    expect(value()).toBeNull(); // the list says `(part deleted)`, never 80
    const landed = parts().filter((p) => p.name === 'Side');
    expect(landed).toHaveLength(1);
    expect(landed[0]!.id).not.toBe('b1'); // re-minted
    expect(st().doc.dimensions[0]!.b).toEqual({ part: 'b1', frac: corner });
  });

  it('a deleted root part, then Ungroup of a copy holding the same id — still detached', () => {
    st().replaceDocument(drawerDoc(true));
    expect(st().addDimension(guideAt(-10), cornerOf('b1'), 'x')).toBe(true);
    expect(value()).toBeCloseTo(30, 9);
    st().deleteBoard('b1');
    expect(value()).toBeNull();
    ungroup('d2');
    expect(value()).toBeNull();
    const landed = parts().filter((p) => p.name === 'Side');
    expect(landed).toHaveLength(1);
    expect(landed[0]!.id).not.toBe('b1');
  });

  it('positive control: an anchor on the part being ungrouped follows it, same value', () => {
    st().replaceDocument(drawerDoc(false));
    expect(st().addDimension(guideAt(-10), cornerOf('d1/b1'), 'x')).toBe(true);
    expect(value()).toBeCloseTo(30, 9);
    ungroup('d1');
    expect(st().doc.dimensions[0]!.b).toEqual({ part: 'b1', frac: corner }); // re-keyed onto the child, which kept its id
    expect(value()).toBeCloseTo(30, 9);
  });
});

describe('keepTapeDimension (the ONE D action, spec §3)', () => {
  const arm = () => {
    const [a, b] = pair();
    st().setTool('tape');
    st().setTapeAnchor(a);
    st().setTapeHover(b);
  };

  it('keeps one dimension for an aligned pair', () => {
    arm();
    expect(keepTapeDimension()).toBe(true);
    expect(st().doc.dimensions).toHaveLength(1);
  });

  it('refuses while a typed distance is pending: the notice, no dimension, no undo entry', () => {
    arm();
    st().setTapeTyped('3');
    const past = st().past.length;
    expect(keepTapeDimension()).toBe(true);
    expect(st().doc.dimensions).toHaveLength(0);
    expect(st().past.length).toBe(past);
    expect(shownTapeNotice(st())).toBe(TAPE_TYPED_PENDING);
    expect(TAPE_TYPED_PENDING).toBe('Clear the typed distance to keep a dimension.');
  });

  it('does not apply (false, so the key falls through) with no hover or another tool', () => {
    arm();
    st().setTapeHover(null);
    expect(keepTapeDimension()).toBe(false);
    st().setTool('select');
    expect(keepTapeDimension()).toBe(false);
    expect(st().doc.dimensions).toHaveLength(0);
  });
});
