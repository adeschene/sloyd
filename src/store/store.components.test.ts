import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { createDocument, worldParts, snapPointsFor } from '../document/document';
import type { SloydDocument } from '../document/document';

const drawerDoc = (): SloydDocument => ({
  ...createDocument(),
  instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }],
  definitions: [{ id: 'd1', boards: [
    { id: 'b1', name: 'Side', length: 16, width: 6, thickness: 0.5, position: [0, 0, 0], rotation: 0, posture: 'on-edge', grain: 'length', material: 'maple', cuts: [] },
  ], instances: [] }],
});
const s = () => useStore.getState();
beforeEach(() => { s().replaceDocument(drawerDoc()); s().setTool('select'); });

describe('components in the store', () => {
  it('Duplicate of an assembly shares its definition', () => {
    s().duplicateBoards(['i1']);
    const doc = s().doc;
    expect(doc.instances.map((i) => i.definition)).toEqual(['d1', 'd1']);
    expect(doc.definitions).toHaveLength(1);
    expect(doc.instances[1]!.name).toBe('Drawer (1)');
  });

  it('Copy in a row of an assembly shares its definition', () => {
    s().copyInRow(['i1'], 3, 0, 1, 20);
    expect(s().doc.instances.map((i) => i.definition)).toEqual(['d1', 'd1', 'd1']);
    expect(s().doc.instances.map((i) => i.position[0])).toEqual([0, 20, 40]);
  });

  it('an edit inside one copy changes every copy, in one undo entry', () => {
    s().duplicateBoards(['i1']);
    const before = s().past.length;
    s().openAssembly('i1');
    s().updateBoards(['i1/b1'], { length: 18 });
    expect(worldParts(s().doc).filter((b) => b.name === 'Side').map((b) => b.length)).toEqual([18, 18]);
    expect(s().past.length).toBe(before + 1);
  });

  it('a part reached through a shared PARENT is edited once, without throwing', () => {
    s().replaceDocument({
      ...drawerDoc(),
      instances: [
        { id: 'c1', name: 'Cabinet', definition: 'dc', position: [0, 0, 0], rotation: 0 },
        { id: 'c2', name: 'Cabinet (1)', definition: 'dc', position: [40, 0, 0], rotation: 90 },
      ],
      definitions: [...drawerDoc().definitions, { id: 'dc', boards: [], instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }] }],
    });
    s().openAssembly('c1'); s().openAssembly('c1/i1');
    s().selectItem('c1/i1/b1', false);
    expect(() => s().updateBoards(['c1/i1/b1', 'c2/i1/b1'], { posture: 'flat' })).not.toThrow();
    expect(worldParts(s().doc).every((b) => b.posture === 'flat')).toBe(true);
  });

  it('a MOVING edit (position) through a shared parent is edited once, without throwing', () => {
    s().replaceDocument({
      ...drawerDoc(),
      instances: [
        { id: 'c1', name: 'Cabinet', definition: 'dc', position: [0, 0, 0], rotation: 0 },
        { id: 'c2', name: 'Cabinet (1)', definition: 'dc', position: [40, 0, 0], rotation: 90 },
      ],
      definitions: [...drawerDoc().definitions, { id: 'dc', boards: [], instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }] }],
    });
    s().openAssembly('c1'); s().openAssembly('c1/i1');
    expect(() => s().updateBoards(['c1/i1/b1', 'c2/i1/b1'], { position: [3, 1, 2] })).not.toThrow();
    expect(s().past.length).toBeGreaterThan(0);
    const sides = worldParts(s().doc).filter((b) => b.name === 'Side');
    expect(sides).toHaveLength(2);
    expect(sides[0]!.posture).toBe(sides[1]!.posture);
    expect(sides[0]!.length).toBe(sides[1]!.length);
    // the part moved in its stored frame once: each placement shows it moved by the same local delta
    expect(sides[0]!.position).not.toEqual([0, 0, 0]);
    expect(sides[1]!.position).not.toEqual([40, 0, 0]);
  });

  it('Make Unique splits one copy off, and one Ctrl+Z shares it again', () => {
    s().duplicateBoards(['i1']);
    const copy = s().doc.instances[1]!.id;
    s().makeUnique(copy);
    expect(new Set(s().doc.instances.map((i) => i.definition)).size).toBe(2);
    s().openAssembly('i1');
    s().updateBoards(['i1/b1'], { length: 30 });
    expect(worldParts(s().doc).filter((b) => b.name === 'Side').map((b) => b.length)).toEqual([30, 16]);
    s().undo(); s().undo();
    expect(s().doc.instances.map((i) => i.definition)).toEqual(['d1', 'd1']);
  });

  it('Make Unique on an unshared assembly pushes no entry', () => {
    const n = s().past.length;
    s().makeUnique('i1');
    expect(s().past.length).toBe(n);
  });

  it('selectCopies selects the copies at the open level', () => {
    s().duplicateBoards(['i1']);
    s().duplicateBoards(['i1']);
    s().selectCopies('i1');
    expect(s().selectedIds).toHaveLength(3);
  });

  it('a tape anchor on a part in ANOTHER copy drops when an edit inside the definition removes its point', () => {
    s().duplicateBoards(['i1']);
    const other = s().doc.instances[1]!.id;
    const part = worldParts(s().doc).find((b) => b.id === `${other}/b1`)!;
    const pts = snapPointsFor(part);
    const far = pts.reduce((a, p) => (p.at[0] > a.at[0] ? p : a));
    s().setTool('tape');
    useStore.setState({ tapeAnchor: far });
    expect(s().tapeAnchor).not.toBeNull();
    s().openAssembly('i1');
    s().updateBoards(['i1/b1'], { length: 10 });
    expect(s().tapeAnchor).toBeNull();
  });

  const anchorOn = (path: string, pick: 'maxX' = 'maxX') => {
    const part = worldParts(s().doc).find((b) => b.id === path)!;
    void pick;
    const far = snapPointsFor(part).reduce((a, p) => (p.at[0] > a.at[0] ? p : a));
    s().setTool('tape');
    useStore.setState({ tapeAnchor: far });
    expect(s().tapeAnchor).not.toBeNull();
  };

  it('deleting a part in a shared definition drops an anchor on the OTHER copy', () => {
    s().duplicateBoards(['i1']);
    const other = s().doc.instances[1]!.id;
    anchorOn(`${other}/b1`);
    s().openAssembly('i1');
    s().deleteBoards(['i1/b1']);
    expect(worldParts(s().doc).some((b) => b.id === `${other}/b1`)).toBe(false);
    expect(s().tapeAnchor).toBeNull();
  });

  it('moving a part in a shared definition drops an anchor on the OTHER copy', () => {
    s().duplicateBoards(['i1']);
    const other = s().doc.instances[1]!.id;
    anchorOn(`${other}/b1`);
    s().openAssembly('i1');
    s().moveGroupTo(['i1/b1'], [5, 0, 0]);
    expect(s().tapeAnchor).toBeNull();
  });

  it('turning a nested shared assembly drops a held point on the OTHER cabinet', () => {
    s().replaceDocument({
      ...drawerDoc(),
      instances: [
        { id: 'c1', name: 'Cabinet', definition: 'dc', position: [0, 0, 0], rotation: 0 },
        { id: 'c2', name: 'Cabinet (1)', definition: 'dc', position: [40, 0, 0], rotation: 0 },
      ],
      definitions: [...drawerDoc().definitions, { id: 'dc', boards: [], instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }] }],
    });
    anchorOn('c2/i1/b1');
    s().openAssembly('c1');
    s().turnAssembly('c1/i1', 90);
    expect(s().tapeAnchor).toBeNull();
  });
});
