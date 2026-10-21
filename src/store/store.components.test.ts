import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { visibleBoards } from './visibility';
import { boardExtents, createDocument, worldParts, snapPointsFor } from '../document/document';
import type { SloydDocument } from '../document/document';

const drawerDoc = (): SloydDocument => ({
  ...createDocument(),
  instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }],
  definitions: [{ id: 'd1', boards: [
    { id: 'b1', name: 'Side', length: 16, width: 6, thickness: 0.5, position: [0, 0, 0], rotation: 0, posture: 'on-edge', grain: 'length', material: 'maple', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] },
  ], instances: [], hardware: [] }],
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
      definitions: [...drawerDoc().definitions, { id: 'dc', boards: [], instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }], hardware: [] }],
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
      definitions: [...drawerDoc().definitions, { id: 'dc', boards: [], instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }], hardware: [] }],
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

  const anchorOn = (path: string) => {
    const part = worldParts(s().doc).find((b) => b.id === path)!;
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
      definitions: [...drawerDoc().definitions, { id: 'dc', boards: [], instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }], hardware: [] }],
    });
    anchorOn('c2/i1/b1');
    s().openAssembly('c1');
    s().turnAssembly('c1/i1', 90);
    expect(s().tapeAnchor).toBeNull();
  });
});

describe('links are shapes', () => {
  const legs = (): SloydDocument => ({
    ...createDocument(),
    boards: [0, 1, 2, 3].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, length: 28, width: 1.75, thickness: 1.75,
      position: [k * 10, 0, 0] as [number, number, number], rotation: ([0, 90, 180, 270] as const)[k]!, posture: 'upright' as const,
      grain: 'length' as const, material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] })),
  });

  it('Link stores one shape and makes every member a shaped part', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1', 'l2', 'l3']);
    const doc = s().doc;
    expect(doc.shapes).toHaveLength(1);
    expect(doc.boards.every((b) => 'shape' in b && !('length' in b))).toBe(true);
    expect(worldParts(doc).map((b) => [b.position, b.rotation])).toEqual(legs().boards.map((b) => [b.position, b.rotation]));
  });

  it('a cut added on one leg appears, with one id, on every leg', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1', 'l2', 'l3']);
    s().addCut('l2');
    const ids = worldParts(s().doc).map((b) => b.cuts.map((c) => c.id).join());
    expect(new Set(ids).size).toBe(1);
    expect(s().doc.shapes[0]!.cuts).toHaveLength(1);
  });

  it('a posture change re-pivots every user about its own centre, exactly', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1', 'l2', 'l3']);
    const centre = (b: ReturnType<typeof worldParts>[number]) => {
      const e = boardExtents(b);
      return [b.position[0] + e[0] / 2, b.position[2] + e[2] / 2];
    };
    const before = worldParts(s().doc).map(centre);
    s().updateBoards(['l0'], { posture: 'flat' });
    expect(worldParts(s().doc).map(centre)).toEqual(before);
  });

  it('Unlink of one of two dissolves the shape: both are plain parts again', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1']);
    s().unlinkBoards(['l0']);
    expect(s().doc.shapes).toEqual([]);
    expect(s().doc.boards.every((b) => 'length' in b)).toBe(true);
  });

  it('Duplicate of a linked leg shares its shape; of a plain leg stays plain', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1']);
    s().duplicateBoards(['l0', 'l2']);
    const copies = s().doc.boards.slice(4);
    expect('shape' in copies[0]!).toBe(true);
    expect('length' in copies[1]!).toBe(true);
  });

  it('an optional own field on a shaped part survives Duplicate, with a fresh id, name and position array', () => {
    const doc = legs();
    s().replaceDocument(doc);
    s().linkBoards(['l0', 'l1']);
    // A stand-in for an optional own field a later Board gains: stored on the shaped part.
    const shaped = { ...s().doc.boards[0]!, note: 'keep me' } as unknown as (typeof doc.boards)[number];
    s().replaceDocument({ ...s().doc, boards: [shaped, ...s().doc.boards.slice(1)] });
    s().duplicateBoards(['l0']);
    const copy = s().doc.boards[s().doc.boards.length - 1]! as unknown as Record<string, unknown>;
    expect(copy.note).toBe('keep me');
    expect(copy.shape).toBe((shaped as unknown as Record<string, unknown>).shape);
    expect(copy.id).not.toBe(shaped.id);
    expect(copy.name).toBe('Leg 0 (1)');
    expect(copy.position).toEqual(shaped.position);
    expect(copy.position).not.toBe(shaped.position);
  });

  // Added (Task 5): the brief's tests above do not pin these.
  const centreOf = (b: ReturnType<typeof worldParts>[number]) => {
    const e = boardExtents(b);
    // Plan centre: a reorient keeps the min-corner's Y (the part stays on what it sat on).
    return [b.position[0] + e[0] / 2, b.position[2] + e[2] / 2];
  };

  it('Link re-pivots a member whose posture differs about its own centre', () => {
    const doc = legs();
    doc.boards[3] = { ...doc.boards[3]!, posture: 'flat' } as (typeof doc.boards)[number];
    s().replaceDocument(doc);
    const before = centreOf(worldParts(s().doc)[3]!);
    s().linkBoards(['l0', 'l1', 'l2', 'l3']);
    const after = worldParts(s().doc)[3]!;
    expect(after.posture).toBe('upright');
    expect(centreOf(after)).toEqual(before);
  });

  it('a copy of a shaped part names the same shape and holds no shared field; a plain copy has no shape key', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1']);
    const shape = s().doc.shapes[0]!.id;
    s().duplicateBoards(['l0', 'l2']);
    const [shaped, plain] = s().doc.boards.slice(4);
    expect(shaped).toEqual({ id: shaped!.id, name: 'Leg 0 (1)', position: [0, 0, 0], rotation: 0, shape });
    expect('shape' in plain!).toBe(false);
    expect(s().doc.shapes).toHaveLength(1);
  });

  it('Copy in a row of a shaped part shares its shape; of a plain part stays plain', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1']);
    const shape = s().doc.shapes[0]!.id;
    s().copyInRow(['l0'], 3, 2, 1, 5);
    const row = s().doc.boards.slice(4);
    expect(row.map((b) => ('shape' in b ? b.shape : null))).toEqual([shape, shape]);
    expect(row.every((b) => !('length' in b))).toBe(true);
    s().copyInRow(['l2'], 2, 2, 1, 5);
    const plain = s().doc.boards[6]!;
    expect('length' in plain && !('shape' in plain)).toBe(true);
  });

  it('Select linked selects every user of the shape', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l2']);
    s().selectBoard(null);
    s().selectLinked('l2');
    expect(s().selectedIds).toEqual(['l0', 'l2']);
  });

  it('Link, Unlink and a cut on a linked part are one undo entry each; a no-op Link pushes none', () => {
    s().replaceDocument(legs());
    const n = () => s().past.length;
    s().linkBoards(['l0', 'l1']);
    expect(n()).toBe(1);
    s().linkBoards(['l1', 'l0']);
    expect(n()).toBe(1);
    s().addCut('l1');
    expect(n()).toBe(2);
    s().unlinkBoards(['l1']);
    expect(n()).toBe(3);
    s().unlinkBoards(['l1']);
    expect(n()).toBe(3);
    s().undo();
    expect(s().doc.shapes).toHaveLength(1);
    expect(worldParts(s().doc).slice(0, 2).map((b) => b.cuts.length)).toEqual([1, 1]);
  });

  it('Link of a selected member brings its whole shape; the unselected user follows the source', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1']);
    s().updateBoards(['l2'], { length: 30 });
    s().linkBoards(['l2', 'l0']);
    const w = worldParts(s().doc);
    expect(s().doc.shapes).toHaveLength(1);
    expect(w.map((b) => b.length)).toEqual([30, 30, 30, 28]);
    expect(new Set(w.slice(0, 3).map((b) => b.shape)).size).toBe(1);
    expect(w[3]!.shape).toBeUndefined();
  });

  it('a posture change on a linked part inside a turned assembly re-pivots every user about its own centre', () => {
    const doc: SloydDocument = {
      ...legs(),
      boards: legs().boards.slice(0, 1),
      instances: [{ id: 'i1', name: 'Frame', definition: 'd1', position: [40, 0, 3], rotation: 90 }],
      definitions: [{ id: 'd1', boards: [{ ...legs().boards[1]!, id: 'p1', name: 'Post' }], instances: [], hardware: [] }],
    };
    s().replaceDocument(doc);
    const placed = worldParts(s().doc).map((b) => [b.position, b.rotation]);
    s().linkBoards(['l0', 'i1/p1']);
    // Link writes each member's STORED own fields: nothing moves or turns.
    expect(worldParts(s().doc).map((b) => [b.position, b.rotation])).toEqual(placed);
    expect(s().doc.definitions[0]!.boards[0]).toEqual({ id: 'p1', name: 'Post', position: [10, 0, 0], rotation: 90, shape: s().doc.shapes[0]!.id });
    const before = worldParts(s().doc).map(centreOf);
    s().updateBoards(['l0'], { posture: 'on-edge' });
    const after = worldParts(s().doc);
    expect(after.map((b) => b.posture)).toEqual(['on-edge', 'on-edge']);
    expect(after.map(centreOf)).toEqual(before);
  });

  it('Link of users of two shapes leaves ONE shape; the other is pruned', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1']);
    s().linkBoards(['l2', 'l3']);
    expect(s().doc.shapes).toHaveLength(2);
    s().linkBoards(['l0', 'l2']);
    expect(s().doc.shapes).toHaveLength(1);
    expect(new Set(worldParts(s().doc).map((b) => b.shape))).toEqual(new Set([s().doc.shapes[0]!.id]));
  });

  it('Unlink of a part in a turned assembly keeps its stored own fields: nothing moves or turns', () => {
    const doc: SloydDocument = {
      ...legs(),
      boards: legs().boards.slice(0, 2),
      instances: [{ id: 'i1', name: 'Frame', definition: 'd1', position: [40, 0, 3], rotation: 90 }],
      definitions: [{ id: 'd1', boards: [{ ...legs().boards[1]!, id: 'p1', name: 'Post' }], instances: [], hardware: [] }],
    };
    s().replaceDocument(doc);
    s().linkBoards(['l0', 'l1', 'i1/p1']);
    const placed = worldParts(s().doc).map((b) => [b.position, b.rotation]);
    s().unlinkBoards(['i1/p1']);
    expect(s().doc.definitions[0]!.boards[0]).toMatchObject({ id: 'p1', position: [10, 0, 0], rotation: 90 });
    expect('shape' in s().doc.definitions[0]!.boards[0]!).toBe(false);
    expect(worldParts(s().doc).map((b) => [b.position, b.rotation])).toEqual(placed);
    expect(s().doc.shapes).toHaveLength(1);
  });
});

describe('other copies after Delete, Group and Ungroup in a shared definition (components spec §4.2)', () => {
  const part = (id: string, x: number) => ({ id, name: `Part ${id}`, length: 10, width: 4, thickness: 0.75,
    position: [x, 0, 0] as [number, number, number], rotation: 0 as const, posture: 'flat' as const,
    grain: 'length' as const, material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] });
  const shared = (): SloydDocument => ({
    ...createDocument(),
    instances: [
      { id: 'i1', name: 'Box', definition: 'd1', position: [0, 0, 0], rotation: 0 },
      { id: 'i2', name: 'Box (1)', definition: 'd1', position: [50, 0, 20], rotation: 90 },
    ],
    definitions: [
      { id: 'd1', boards: [part('b1', 0), part('b2', 12)], instances: [{ id: 'g', name: 'Inner', definition: 'dg', position: [0, 5, 0], rotation: 0 }], hardware: [] },
      { id: 'dg', boards: [part('b3', 0)], instances: [], hardware: [] },
    ],
  });
  const realPoint = (id: string) => snapPointsFor(worldParts(s().doc).find((b) => b.id === id)!)[0]!;
  beforeEach(() => s().replaceDocument(shared()));

  it('(a) Delete in one copy leaves no stale hidden id for the other copy; undo restores it', () => {
    s().setHidden('i2/b2', true);
    s().openAssembly('i1');
    s().deleteBoards(['i1/b2']);
    expect(s().hiddenIds).toEqual([]);
    s().undo();
    expect(s().hiddenIds).toEqual(['i2/b2']);
  });

  it('(b) Group in one copy keeps the other copy\'s part hidden under its new path; undo restores', () => {
    s().setHidden('i2/b2', true);
    s().openAssembly('i1');
    s().selectItem('i1/b1', false);
    s().selectItem('i1/b2', true);
    s().groupSelected();
    const g = s().selectedIds[0]!.split('/')[1]!;
    expect(s().hiddenIds).toEqual([`i2/${g}/b2`]);
    expect(worldParts(s().doc).some((b) => b.id === `i2/${g}/b2`)).toBe(true);
    s().undo();
    expect(s().hiddenIds).toEqual(['i2/b2']);
  });

  it('(c) Ungroup of a nested group in one copy keeps the other copy\'s hidden part hidden; undo restores', () => {
    s().setHidden('i2/g/b3', true);
    s().openAssembly('i1');
    s().selectItem('i1/g', false);
    s().ungroupSelected();
    expect(s().hiddenIds).toEqual(['i2/b3']);
    expect(worldParts(s().doc).some((b) => b.id === 'i2/b3')).toBe(true);
    s().undo();
    expect(s().hiddenIds).toEqual(['i2/g/b3']);
  });

  it('(c2) Ungroup passes the other copy\'s hidden assembly on to its lifted children; undo restores (fu 229)', () => {
    s().setHidden('i2/g', true);
    s().openAssembly('i1');
    s().selectItem('i1/g', false);
    s().ungroupSelected();
    expect(s().hiddenIds).toEqual(['i2/b3']);
    // The copy the user ungrouped was visible and stays so.
    expect(visibleBoards(worldParts(s().doc), s().hiddenIds).map((b) => b.id).sort()).toEqual(['i1/b1', 'i1/b2', 'i1/b3', 'i2/b1', 'i2/b2']);
    s().undo();
    expect(s().hiddenIds).toEqual(['i2/g']);
  });

  it('(c3) every lifted child, a nested assembly and a clashing id included, takes the hidden-ness once (fu 229)', () => {
    const doc = shared();
    // dg gains a second part, a part whose id clashes with one beside the group (b1), and a nested assembly.
    doc.definitions.push({ id: 'dn', boards: [part('b9', 0)], instances: [], hardware: [] });
    doc.definitions[1] = { id: 'dg', boards: [part('b3', 0), part('b1', 3)], instances: [{ id: 'n', name: 'Nested', definition: 'dn', position: [0, 2, 0], rotation: 0 }], hardware: [] };
    s().replaceDocument(doc);
    s().setHidden('i2/g/b3', true); // covered once i2/g is hidden too: it must not appear twice
    s().setHidden('i2/g', true);
    s().openAssembly('i1');
    s().selectItem('i1/g', false);
    s().ungroupSelected();
    const lifted = s().selectedIds.map((p) => p.split('/')[1]!);
    expect(lifted).toHaveLength(3);
    expect(lifted).toContain('b3');
    expect(lifted).toContain('n');
    expect(lifted).not.toContain('b1'); // the clash was re-minted
    expect([...s().hiddenIds].sort()).toEqual(lifted.map((id) => `i2/${id}`).sort());
    expect(visibleBoards(worldParts(s().doc), s().hiddenIds).every((b) => !lifted.some((id) => b.id === `i2/${id}` || b.id.startsWith(`i2/${id}/`)))).toBe(true);
    s().undo();
    expect([...s().hiddenIds].sort()).toEqual(['i2/g', 'i2/g/b3']);
  });

  it('(c4) two assemblies ungrouped at once each pass their hidden-ness on in the other copy (fu 229)', () => {
    const doc = shared();
    doc.definitions[0]!.instances.push({ id: 'h', name: 'Second', definition: 'dh', position: [0, 9, 0], rotation: 0 });
    doc.definitions.push({ id: 'dh', boards: [part('b5', 0)], instances: [], hardware: [] });
    s().replaceDocument(doc);
    s().setHidden('i2/g', true);
    s().setHidden('i2/h', true);
    s().openAssembly('i1');
    s().selectItem('i1/g', false);
    s().selectItem('i1/h', true);
    s().ungroupSelected();
    expect([...s().hiddenIds].sort()).toEqual(['i2/b3', 'i2/b5']);
    s().undo();
    expect([...s().hiddenIds].sort()).toEqual(['i2/g', 'i2/h']);
  });

  it('(d) a tape anchor on the other copy survives a Group, re-keyed, at the same world point', () => {
    const anchor = realPoint('i2/b2');
    useStore.setState({ tapeAnchor: anchor });
    s().openAssembly('i1');
    s().selectItem('i1/b1', false);
    s().selectItem('i1/b2', true);
    s().groupSelected();
    const g = s().selectedIds[0]!.split('/')[1]!;
    expect(s().tapeAnchor?.owner.id).toBe(`i2/${g}/b2`);
    expect(s().tapeAnchor?.at).toEqual(anchor.at);
  });

  it('(d2) a tape anchor on the other copy survives an Ungroup, re-keyed, at the same world point', () => {
    const anchor = realPoint('i2/g/b3');
    useStore.setState({ tapeAnchor: anchor });
    s().openAssembly('i1');
    s().selectItem('i1/g', false);
    s().ungroupSelected();
    expect(s().tapeAnchor?.owner.id).toBe('i2/b3');
    expect(s().tapeAnchor?.at).toEqual(anchor.at);
  });
});

describe('commitSnapMove refuses a twin target (fu 230)', () => {
  const twinDoc = (): SloydDocument => ({
    ...drawerDoc(),
    instances: [
      { id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 },
      { id: 'i2', name: 'Drawer (1)', definition: 'd1', position: [50, 0, 0], rotation: 0 },
    ],
    boards: [{ id: 'r1', name: 'Rail', length: 10, width: 2, thickness: 1, position: [0, 30, 0], rotation: 0, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] }],
  });
  const cornerOf = (path: string) => {
    const w = worldParts(s().doc).find((b) => b.id === path)!;
    return snapPointsFor(w).find((p) => p.kind === 'corner')!;
  };
  const setup = () => {
    s().replaceDocument(twinDoc());
    s().openAssembly('i1');
    s().selectItem('i1/b1', false);
    s().setTool('move');
    s().grabSnapPoint(cornerOf('i1/b1') as never);
  };

  it('does not snap a part to another placement of itself, and keeps the grab', () => {
    setup();
    const before = s().doc;
    const entries = s().past.length;
    const t = cornerOf('i2/b1');
    s().commitSnapMove({ ...t, at: [t.at[0] + 3, t.at[1], t.at[2]] } as never);
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(entries);
    expect(s().grabbed).not.toBeNull();
  });

  it('still snaps to a part that is not a twin', () => {
    setup();
    const g = cornerOf('i1/b1');
    const t = cornerOf('r1');
    s().commitSnapMove(t as never);
    expect(s().grabbed).toBeNull();
    const moved = worldParts(s().doc).find((b) => b.id === 'i1/b1')!;
    // The grabbed corner lands exactly on the target's: the part moved by (target - grab).
    const before = worldParts(twinDoc()).find((b) => b.id === 'i1/b1')!;
    const delta = [t.at[0] - g.at[0], t.at[1] - g.at[1], t.at[2] - g.at[2]];
    expect(delta.some((d) => d !== 0)).toBe(true);
    expect(moved.position).toEqual(before.position.map((v, i) => v + delta[i]!));
    expect(cornerOf('i1/b1').at).toEqual(t.at);
  });
});

describe('Link over placements of one stored part (fu 231)', () => {
  it('writes nothing: no shape, no undo entry', () => {
    s().duplicateBoards(['i1']);
    const other = s().doc.instances[1]!.id;
    const doc = s().doc;
    const past = s().past.length;
    s().linkBoards(['i1/b1', `${other}/b1`]);
    expect(s().doc).toBe(doc);
    expect(s().doc.shapes).toEqual([]);
    expect(s().past).toHaveLength(past);
  });
});
