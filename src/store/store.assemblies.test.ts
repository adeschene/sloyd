import { useStore } from './store';
import { assemblyDoc } from '../document/treeFixtures';
import { childrenOf, instanceAt, isCovered, resolvedPartAt, worldParts } from '../document/tree';
import { visibleBoards } from './visibility';
import type { BoardSnapPoint, SloydDocument } from '../document/document';
import { removeItems, snapPointsFor } from '../document/document';

const load = (doc: SloydDocument = assemblyDoc()) => useStore.getState().replaceDocument(doc);
const s = () => useStore.getState();
const point = (owner: string, at: [number, number, number] = [0, 0, 0]): BoardSnapPoint =>
  ({ at, kind: 'corner', owner: { type: 'board', id: owner } } as BoardSnapPoint);
/** A REAL snap point of a world part, so dropHeldIfGone's survival test can keep it. */
const heldOn = (id: string): BoardSnapPoint =>
  snapPointsFor(worldParts(s().doc).find((b) => b.id === id)!)[0] as BoardSnapPoint;

beforeEach(() => load());

describe('the open assembly (assemblies spec §3)', () => {
  it('a click selects the outermost assembly, then one level down once opened', () => {
    s().clickPart('i1/i2/b3', false);
    expect(s().selectedIds).toEqual(['i1']);
    s().openAssembly('i1');
    expect(s().selectedIds).toEqual([]);
    s().clickPart('i1/i2/b3', false);
    expect(s().selectedIds).toEqual(['i1/i2']);
  });

  it('a click outside closes to its level and selects there', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().clickPart('r1', false);
    expect([s().openPath, s().selectedIds]).toEqual([null, ['r1']]);
  });

  it('closeAssembly closes one level and selects what it closed', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().closeAssembly();
    expect([s().openPath, s().selectedIds]).toEqual(['i1', ['i1/i2']]);
  });

  it('openPart opens the assembly a double-click lands on', () => {
    s().openPart('i1/b1');
    expect(s().openPath).toBe('i1');
  });

  it('opening and closing push no history and keep the tape', () => {
    s().setTapeAnchor(point('i1/b2'));
    const past = s().past.length;
    s().openAssembly('i1');
    s().closeAssembly();
    expect(s().past.length).toBe(past);
    expect(s().tapeAnchor?.owner.id).toBe('i1/b2');
  });

  it('selectionPatch drops anything that is not a child of the open level', () => {
    s().selectBoard('i1/b1');
    expect(s().selectedIds).toEqual([]);
    s().openAssembly('i1');
    s().selectBoard('r1');
    expect(s().selectedIds).toEqual([]);
  });

  it('selectAll selects the open level', () => {
    s().selectAll();
    expect(s().selectedIds).toEqual(['r1', 'i1']);
    s().openAssembly('i1');
    s().selectAll();
    expect(s().selectedIds).toEqual(['i1/b1', 'i1/b2', 'i1/i2']);
  });

  it('selectItem from the parts list opens the row’s parent', () => {
    s().selectItem('i1/i2/b3', false);
    expect([s().openPath, s().selectedIds]).toEqual(['i1/i2', ['i1/i2/b3']]);
  });

  it('a grab owned by a part under a selected assembly survives', () => {
    s().selectBoard('i1');
    s().grabSnapPoint(point('i1/b1'));
    s().selectAll();
    expect(s().grabbed?.owner.id).toBe('i1/b1');
    s().selectBoard('r1');
    expect(s().grabbed).toBeNull();
  });
});

describe('hiding assemblies (assemblies spec §3.4)', () => {
  it('hiding an assembly hides every part under it, and none of them can be selected', () => {
    s().setHidden('i1', true);
    expect(s().hiddenIds).toEqual(['i1']);
    expect(visibleBoards(worldParts(s().doc), s().hiddenIds).map((b) => b.id)).toEqual(['r1']);
    s().openAssembly('i1');
    s().selectAll();
    expect(s().selectedIds).toEqual([]);
  });
  it('accepts a nested part id and drops an unknown one', () => {
    s().setHidden('i1/i2/b3', true);
    s().setHidden('nope', true);
    expect(s().hiddenIds).toEqual(['i1/i2/b3']);
  });
  it('Hide others hides the open level’s other items', () => {
    s().openAssembly('i1');
    s().selectItem('i1/b1', false);
    s().hideUnselected();
    expect(s().hiddenIds).toEqual(['i1/b2', 'i1/i2']);
  });
});

describe('undo reconciles the open assembly (assemblies spec §3.1)', () => {
  it('an undo to a document without the open assembly closes to what remains', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    const without = removeItems(s().doc, ['i1/i2']);
    useStore.setState({ past: [{ doc: without, hiddenIds: [] }] });
    s().undo();
    expect(s().openPath).toBe('i1');
  });
  it('replaceDocument closes everything', () => {
    s().openAssembly('i1');
    load();
    expect(s().openPath).toBeNull();
  });
});

describe('part edits inside assemblies (assemblies spec §5)', () => {
  it('a Length edit on a part inside a turned assembly keeps its stored position bit for bit', () => {
    const before = resolvedPartAt(s().doc, 'i1/b2')!;
    s().updateBoard('i1/b2', { length: 13 });
    const after = resolvedPartAt(s().doc, 'i1/b2')!;
    expect(after.length).toBe(13);
    after.position.forEach((v, i) => expect(v).toBe(before.position[i]));
    expect(s().past).toHaveLength(1);
  });

  it('a cut added, edited and removed on a nested part lands on the stored part', () => {
    s().addCut('i1/i2/b3');
    const cut = resolvedPartAt(s().doc, 'i1/i2/b3')!.cuts[0]!;
    s().updateCut('i1/i2/b3', cut.id, { depth: 0.1 });
    expect(resolvedPartAt(s().doc, 'i1/i2/b3')!.cuts[0]!.depth).toBe(0.1);
    s().removeCut('i1/i2/b3', cut.id);
    expect(resolvedPartAt(s().doc, 'i1/i2/b3')!.cuts).toEqual([]);
  });

  it('a link across containers propagates in one undo entry', () => {
    s().linkBoards(['r1', 'i1/b2']);
    expect(resolvedPartAt(s().doc, 'i1/b2')!.length).toBe(worldParts(s().doc)[0]!.length);
    const past = s().past.length;
    s().updateBoard('r1', { thickness: 1.25 });
    expect(resolvedPartAt(s().doc, 'i1/b2')!.thickness).toBe(1.25);
    expect(s().past.length).toBe(past + 1);
    s().unlinkBoards(['r1']);
    expect('link' in resolvedPartAt(s().doc, 'i1/b2')!).toBe(false);
  });

  it('a tape anchor on a nested part drops when that part moves and is kept otherwise', () => {
    const w = worldParts(s().doc).find((b) => b.id === 'i1/b2')!;
    s().setTapeAnchor(heldOn('i1/b2'));
    s().updateBoard('i1/b2', { name: 'Renamed' });
    expect(s().tapeAnchor).not.toBeNull();
    s().updateBoard('i1/b2', { position: [w.position[0] + 1, w.position[1], w.position[2]] });
    expect(s().tapeAnchor).toBeNull();
  });
});

describe('moving and copying assemblies (assemblies spec §4.2)', () => {
  it('a snap move with an assembly selected moves its origin by the exact delta', () => {
    s().selectBoard('i1');
    const w = worldParts(s().doc).find((b) => b.id === 'i1/b1')!;
    s().setTool('move');
    s().grabSnapPoint(point('i1/b1', [w.position[0], w.position[1], w.position[2]]));
    s().commitSnapMove({ at: [w.position[0] + 0.3, w.position[1], w.position[2]], kind: 'corner', owner: { type: 'board', id: 'r1' } } as never);
    expect(instanceAt(s().doc, 'i1')!.position).toEqual([10.1 + 0.3, 0.3 + 0, 3.3 + 0]);
  });

  it('moveGroupTo rounds the selection box min once, for an assembly', () => {
    s().selectBoard('i1');
    s().moveGroupTo(['i1'], [20.01, 0, 5]);
    const parts = worldParts(s().doc).filter((b) => isCovered(b.id, new Set(['i1'])));
    const minX = Math.min(...parts.map((b) => b.position[0]));
    expect(minX).toBeCloseTo(20, 9);
  });

  it('a snap move inside a turned assembly goes into the frame; the axes it does not reach stay bit-identical', () => {
    s().openAssembly('i1');
    const before = resolvedPartAt(s().doc, 'i1/b2')!;
    const w = worldParts(s().doc).find((b) => b.id === 'i1/b2')!;
    s().setTool('move');
    s().selectItem('i1/b2', false);
    s().grabSnapPoint(point('i1/b2', [w.position[0], w.position[1], w.position[2]]));
    s().commitSnapMove({ at: [w.position[0] + 1, w.position[1], w.position[2]], kind: 'corner', owner: { type: 'board', id: 'r1' } } as never);
    const after = resolvedPartAt(s().doc, 'i1/b2')!;
    // world +X is the frame's +Z under i1's 90° turn
    expect(after.position[0]).toBe(before.position[0]);
    expect(after.position[1]).toBe(before.position[1]);
    expect(after.position[2]).toBe(before.position[2] + 1);
  });

  it('Duplicate of an assembly shares its definition (components spec §3.1)', () => {
    s().duplicateBoards(['i1']);
    const roots = childrenOf(s().doc, null);
    expect(roots).toHaveLength(3);
    const copy = instanceAt(s().doc, roots[2]!)!;
    expect(copy.name).toBe('Drawer (1)');
    expect(copy.definition).toBe('d1');
    expect(worldParts(s().doc)).toHaveLength(7);
    expect(s().selectedIds).toEqual([roots[2]]);
  });

  it('Copy in a row of an assembly shifts each copy from the ORIGINAL', () => {
    s().copyInRow(['i1'], 3, 0, 1, 10);
    const roots = childrenOf(s().doc, null);
    expect(roots).toHaveLength(4);
    expect(instanceAt(s().doc, roots[3]!)!.position).toEqual([10.1 + 2 * 10, 0.3, 3.3]);
  });

  it('Copy in a row inside a turned assembly steps along the WORLD axis', () => {
    s().openAssembly('i1');
    s().copyInRow(['i1/b2'], 2, 0, 1, 5);
    const parts = worldParts(s().doc).filter((b) => b.id.startsWith('i1/') && b.name.startsWith('Front'));
    expect(parts).toHaveLength(2);
    expect(parts[1]!.position[0] - parts[0]!.position[0]).toBeCloseTo(5, 9);
    expect(parts[1]!.position[2]).toBeCloseTo(parts[0]!.position[2], 9);
  });

  it('Delete of an assembly prunes its definitions and drops what it held', () => {
    s().setHidden('i1/b1', true);
    s().setTapeAnchor(point('i1/b2'));
    s().deleteBoards(['i1']);
    expect(s().doc.definitions).toEqual([]);
    expect(s().hiddenIds).toEqual([]);
    expect(s().tapeAnchor).toBeNull();
  });

  it('Add board while an assembly is open adds inside it', () => {
    s().openAssembly('i1');
    s().addBoard();
    const kids = childrenOf(s().doc, 'i1');
    expect(kids).toHaveLength(4);
    expect(s().selectedIds).toEqual([kids[2]]);
  });
});

describe('Group and Ungroup (assemblies spec §4.1)', () => {
  it('Group moves nothing, selects the new assembly, and re-keys hidden ids and the tape', () => {
    const before = worldParts(s().doc);
    s().setHidden('i1/b1', true);
    s().setTapeAnchor(point('i1/b2'));
    s().selectAll();
    s().groupSelected();
    const [path] = s().selectedIds;
    expect(childrenOf(s().doc, null)).toEqual([path]);
    const after = new Map(worldParts(s().doc).map((b) => [b.id, b]));
    for (const b of before) expect({ ...after.get(`${path}/${b.id}`)!, id: '' }).toEqual({ ...b, id: '' });
    expect(s().hiddenIds).toEqual([`${path}/i1/b1`]);
    expect(s().tapeAnchor?.owner.id).toBe(`${path}/i1/b2`);
  });

  it('one undo entry, and undo restores the parts', () => {
    s().selectAll();
    const past = s().past.length;
    s().groupSelected();
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(childrenOf(s().doc, null)).toEqual(['r1', 'i1']);
  });

  it('undo of a Group restores the old hidden ids', () => {
    s().setHidden('i1/b1', true);
    s().selectAll();
    s().groupSelected();
    s().undo();
    expect(s().hiddenIds).toEqual(['i1/b1']);
  });

  it('Ungroup selects the children and re-keys hidden ids', () => {
    s().setHidden('i1/b2', true);
    s().selectBoard('i1');
    s().ungroupSelected();
    expect(s().doc.instances.map((i) => i.id)).toEqual(['i2']);
    expect(s().selectedIds).toEqual(['b1', 'i2']);
    expect(s().hiddenIds).toEqual(['b2']);
  });

  it('undo of an Ungroup restores the old hidden ids', () => {
    s().setHidden('i1/b2', true);
    s().selectBoard('i1');
    s().ungroupSelected();
    s().undo();
    expect(s().hiddenIds).toEqual(['i1/b2']);
  });

  it('Group inside an open assembly groups at that level', () => {
    s().openAssembly('i1');
    s().selectItem('i1/b1', false);
    s().groupSelected();
    expect(s().selectedIds[0]!.startsWith('i1/')).toBe(true);
  });
});

describe('Turn and Rename an assembly', () => {
  it('turnAssembly drops a tape anchor under the assembly', () => {
    s().setTapeAnchor(heldOn('i1/b2'));
    s().turnAssembly('i1', 180);
    expect(instanceAt(s().doc, 'i1')!.rotation).toBe(180);
    expect(s().tapeAnchor).toBeNull();
  });
  it('turnAssembly keeps a tape anchor elsewhere', () => {
    s().setTapeAnchor(heldOn('r1'));
    s().turnAssembly('i1', 180);
    expect(s().tapeAnchor?.owner.id).toBe('r1');
  });
  it('renameItem dedupes across parts and assemblies of one level', () => {
    expect(s().renameItem('i1', 'Top')).toBe('Top (1)');
    expect(instanceAt(s().doc, 'i1')!.name).toBe('Top (1)');
    expect(s().renameItem('i1/b1', 'Front')).toBe('Front (1)');
    expect(resolvedPartAt(s().doc, 'i1/b1')!.name).toBe('Front (1)');
    expect(s().renameItem('i1/b1', 'Front (1)')).toBe('Front (1)');
  });
});

describe('renameItem and gestures', () => {
  it('a renamed part leaves its linked mate alone', () => {
    s().linkBoards(['i1/b1', 'r1']);
    s().renameItem('i1/b1', 'Front');
    expect(resolvedPartAt(s().doc, 'i1/b1')!.name).toBe('Front (1)');
    expect(resolvedPartAt(s().doc, 'r1')!.name).toBe('Top');
  });

  it('Group and Ungroup are refused inside a gesture', () => {
    s().beginGesture();
    s().updateBoard('r1', { thickness: 1.25 });
    s().selectAll();
    const { doc, hiddenIds } = s();
    const past = s().past.length;
    s().groupSelected();
    expect([s().doc, s().hiddenIds, s().past.length]).toEqual([doc, hiddenIds, past]);
    s().selectBoard('i1');
    s().ungroupSelected();
    expect([s().doc, s().hiddenIds, s().past.length]).toEqual([doc, hiddenIds, past]);
    s().endGesture();
  });

  it('Ungroup keeps a selected plain part selected, children after it', () => {
    s().selectAll();
    expect(s().selectedIds).toEqual(['r1', 'i1']);
    s().ungroupSelected();
    expect(s().selectedIds).toEqual(['r1', 'b1', 'b2', 'i2']);
  });

  it('a snap move cannot land on a part of the assembly being moved', () => {
    s().selectBoard('i1');
    const w = worldParts(s().doc).find((b) => b.id === 'i1/b1')!;
    s().setTool('move');
    s().grabSnapPoint(point('i1/b1', [w.position[0], w.position[1], w.position[2]]));
    const doc = s().doc;
    s().commitSnapMove({ at: [w.position[0] + 0.3, w.position[1], w.position[2]], kind: 'corner', owner: { type: 'board', id: 'i1/b2' } } as never);
    expect(instanceAt(s().doc, 'i1')!.position).toEqual(instanceAt(doc, 'i1')!.position);
  });

  it('a cut action reaches a linked mate in another container', () => {
    s().linkBoards(['r1', 'i1/b2']);
    s().addCut('r1');
    const id = worldParts(s().doc)[0]!.cuts[0]!.id;
    expect(resolvedPartAt(s().doc, 'i1/b2')!.cuts.map((c) => c.id)).toEqual([id]);
    s().updateCut('r1', id, { depth: 0.1 });
    expect(resolvedPartAt(s().doc, 'i1/b2')!.cuts[0]!.depth).toBe(0.1);
    s().removeCut('r1', id);
    expect(resolvedPartAt(s().doc, 'i1/b2')!.cuts).toEqual([]);
  });
});
