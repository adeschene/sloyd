import { useStore, shownTapeNotice } from './store';
import { createDocument, snapPointsFor } from '../document/document';
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
