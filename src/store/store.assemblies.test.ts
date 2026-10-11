import { useStore } from './store';
import { assemblyDoc, cabinetsDoc } from '../document/treeFixtures';
import { childrenOf, instanceAt, isCovered, parentPath, resolvedPartAt, worldParts } from '../document/tree';
import { visibleBoards } from './visibility';
import type { BoardSnapPoint, SloydDocument } from '../document/document';
import { boardsBounds, removeItems, snapPointsFor } from '../document/document';

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
    // One shape across the root and the assembly: both stored parts name it.
    expect(s().doc.shapes).toHaveLength(1);
    expect(resolvedPartAt(s().doc, 'i1/b2')!.shape).toBe(s().doc.shapes[0]!.id);
    expect(resolvedPartAt(s().doc, 'r1')!.shape).toBe(s().doc.shapes[0]!.id);
    const past = s().past.length;
    s().updateBoard('r1', { thickness: 1.25 });
    expect(resolvedPartAt(s().doc, 'i1/b2')!.thickness).toBe(1.25);
    expect(s().past.length).toBe(past + 1);
    s().unlinkBoards(['r1']);
    expect('shape' in resolvedPartAt(s().doc, 'i1/b2')!).toBe(false);
    expect(s().doc.shapes).toEqual([]);
    expect(resolvedPartAt(s().doc, 'i1/b2')!.thickness).toBe(1.25);
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

  it('Delete of the open assembly\'s last part removes it and closes to the parent; one undo restores it (fu 226)', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().selectItem('i1/i2/b3', false);
    const before = s().doc;
    const entries = s().past.length;
    s().deleteBoards(['i1/i2/b3']);
    expect(instanceAt(s().doc, 'i1/i2')).toBeNull();
    expect(s().doc.definitions.map((d) => d.id)).toEqual(['d1']);
    expect(s().openPath).toBe('i1');
    expect(s().selectedIds).toEqual([]);
    expect(s().past.length).toBe(entries + 1);
    s().undo();
    expect(s().doc).toBe(before);
    expect(s().openPath).toBe('i1');
  });

  it('a cascade closes the open level to the deepest one left, the root here', () => {
    const b3 = { ...assemblyDoc().definitions[1]!.boards[0]! };
    load({
      ...assemblyDoc(),
      instances: [{ id: 'i1', name: 'Case', definition: 'd1', position: [0, 0, 0], rotation: 0 }],
      definitions: [
        { id: 'd1', boards: [], instances: [{ id: 'i2', name: 'Peg', definition: 'd2', position: [0, 0, 0], rotation: 0 }] },
        { id: 'd2', boards: [b3], instances: [] },
      ],
    });
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().deleteBoards(['i1/i2/b3']);
    expect(s().doc.instances).toEqual([]);
    expect(s().openPath).toBeNull();
    expect(s().selectedIds).toEqual([]);
  });

  it('an emptied assembly that was hidden leaves the hidden set', () => {
    s().setHidden('i1/i2', true);
    s().deleteBoards(['i1/i2/b3']);
    expect(instanceAt(s().doc, 'i1/i2')).toBeNull();
    expect(s().hiddenIds).toEqual([]);
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
    // A REAL point: Group judges every held point after the re-key (components spec §4.2).
    s().setTapeAnchor(heldOn('i1/b2'));
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
  it('renameItem stores and returns the name with › replaced by > (fu 227)', () => {
    expect(s().renameItem('i1', 'Case › left')).toBe('Case > left');
    expect(instanceAt(s().doc, 'i1')!.name).toBe('Case > left');
    expect(s().renameItem('i1/b1', '› Side')).toBe('> Side');
    expect(resolvedPartAt(s().doc, 'i1/b1')!.name).toBe('> Side');
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

// ---------------------------------------------------------------------------
// Follow-ups 228 and 231: store paths the rounds left untested, and weak
// assertions made exact. Literals are derived by hand in the comments.
// ---------------------------------------------------------------------------

describe('clicks across levels (fu 228)', () => {
  it('a toggle-click at one level toggles; across levels it re-targets and never toggles', () => {
    s().clickPart('r1', false);
    s().clickPart('i1/b1', true);                 // from the root the target is the outermost assembly, i1
    expect(s().selectedIds).toEqual(['r1', 'i1']);
    s().clickPart('r1', true);
    expect(s().selectedIds).toEqual(['i1']);
    s().openAssembly('i1');
    s().clickPart('i1/b1', false);
    s().clickPart('i1/b2', true);
    expect(s().selectedIds).toEqual(['i1/b1', 'i1/b2']);
    // Across levels: a toggle-click on a root part closes i1 and selects ONLY it. It
    // neither adds to the level it left nor toggles anything off.
    s().clickPart('r1', true);
    expect([s().openPath, s().selectedIds]).toEqual([null, ['r1']]);
  });

  it('a toggle-click up one level of two leaves that level with only the target selected', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().clickPart('i1/i2/b3', false);
    expect(s().selectedIds).toEqual(['i1/i2/b3']);
    s().clickPart('i1/b1', true);
    expect([s().openPath, s().selectedIds]).toEqual(['i1', ['i1/b1']]);
  });

  it('the parts list (selectItem) behaves the same: a toggle that changes level replaces the selection', () => {
    s().selectItem('r1', false);
    s().selectItem('i1/b1', true);                // opens i1, selects just i1/b1
    expect([s().openPath, s().selectedIds]).toEqual(['i1', ['i1/b1']]);
    s().selectItem('i1/b2', true);
    expect(s().selectedIds).toEqual(['i1/b1', 'i1/b2']);
    s().selectItem('i1/b1', true);
    expect(s().selectedIds).toEqual(['i1/b2']);
  });
});

describe('the tape survives a level change (fu 228, inv 24)', () => {
  it('opening, closing, clicking across levels and picking from the parts list leave anchor and hover alone', () => {
    const anchor = heldOn('i1/b2');
    const hover = heldOn('i1/b1');
    s().setTapeAnchor(anchor);
    s().setTapeHover(hover);
    const past = s().past.length;
    const same = () => {
      expect(s().tapeAnchor).toBe(anchor);
      expect(s().tapeHover).toBe(hover);
      expect(s().past.length).toBe(past);
    };
    s().clickPart('i1/i2/b3', false); same();     // selects i1 at the root
    s().openAssembly('i1'); same();
    s().clickPart('i1/i2/b3', false); same();     // selects i1/i2 inside
    s().openPart('i1/i2/b3'); same();             // opens i1/i2
    s().clickPart('r1', false); same();           // closes to the root
    expect(s().openPath).toBeNull();
    s().selectItem('i1/i2/b3', false); same();    // opens i1/i2 again, from the list
    expect(s().openPath).toBe('i1/i2');
    s().closeAssembly(); same();
    s().selectAll(); same();
  });
});

describe('openPart on a part that is not in an assembly (fu 228)', () => {
  it('a root part opens nothing and changes neither selection nor history', () => {
    s().selectBoard('r1');
    const past = s().past.length;
    s().openPart('r1');
    expect([s().openPath, s().selectedIds, s().past.length]).toEqual([null, ['r1'], past]);
  });

  it('inside an open assembly, a root part does not close it, and a part of this level opens nothing', () => {
    s().openAssembly('i1');
    s().selectBoard('i1/b1');
    s().openPart('r1');
    expect([s().openPath, s().selectedIds]).toEqual(['i1', ['i1/b1']]);
    s().openPart('i1/b2');
    expect([s().openPath, s().selectedIds]).toEqual(['i1', ['i1/b1']]);
  });

  it('a path that names no item at all opens nothing', () => {
    const past = s().past.length;
    s().openPart('nope');
    expect([s().openPath, s().past.length]).toEqual([null, past]);
  });
});

describe('undo and redo drop what a closed level held (fu 228)', () => {
  it('undo to a document without the open level closes to the survivor, deselects, and drops held points', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().selectBoard('i1/i2/b3');
    s().setTapeAnchor(heldOn('i1/i2/b3'));
    const without = removeItems(s().doc, ['i1/i2']);
    useStore.setState({ past: [{ doc: without, hiddenIds: [] }] });
    s().undo();
    expect(s().openPath).toBe('i1');
    expect(s().selectedIds).toEqual([]);
    expect(s().tapeAnchor).toBeNull();
    // redo brings i1/i2 back but is view state: the open level is not reopened
    s().redo();
    expect(worldParts(s().doc).map((b) => b.id)).toContain('i1/i2/b3');
    expect([s().openPath, s().selectedIds]).toEqual(['i1', []]);
  });

  it('undo that removes the outer assembly closes all the way to the root', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().selectBoard('i1/i2/b3');
    useStore.setState({ past: [{ doc: removeItems(s().doc, ['i1']), hiddenIds: [] }] });
    s().undo();
    expect([s().openPath, s().selectedIds]).toEqual([null, []]);
  });

  it('a selected item that survives the undo stays selected', () => {
    s().openAssembly('i1');
    s().selectBoard('i1/b1');
    useStore.setState({ past: [{ doc: removeItems(s().doc, ['i1/i2']), hiddenIds: [] }] });
    s().undo();
    expect([s().openPath, s().selectedIds]).toEqual(['i1', ['i1/b1']]);
  });
});

describe('Select linked across containers (fu 228)', () => {
  it('selects only the mates at the open level: a mate in another container is linked but not selectable', () => {
    s().linkBoards(['r1', 'i1/b1', 'i1/b2']);
    const shape = (id: string) => worldParts(s().doc).find((b) => b.id === id)!.shape;
    expect(new Set([shape('r1'), shape('i1/b1'), shape('i1/b2')]).size).toBe(1);
    expect(shape('r1')).toBeDefined();
    s().selectBoard(null);
    s().selectLinked('r1');
    expect(s().selectedIds).toEqual(['r1']);
    s().openAssembly('i1');
    s().selectLinked('i1/b2');
    expect(s().selectedIds).toEqual(['i1/b1', 'i1/b2']);
  });

  it('is a no-op for a part that is not linked, and for a path that names nothing', () => {
    s().selectBoard('r1');
    s().selectLinked('r1');
    s().selectLinked('nope');
    expect(s().selectedIds).toEqual(['r1']);
  });
});

describe('renameItem on a path that names nothing (fu 228)', () => {
  it('returns the sibling-unique name, writes nothing, pushes no entry', () => {
    const doc = s().doc;
    const past = s().past.length;
    expect(s().renameItem('nope', 'Top')).toBe('Top (1)');          // 'Top' is taken at the root
    expect(s().renameItem('nope', 'Spare')).toBe('Spare');
    expect(s().renameItem('i1/nope', 'Front')).toBe('Front (1)');   // 'Front' is taken inside i1
    expect(s().renameItem('nope/x', 'Whatever')).toBe('Whatever');  // no such container: no siblings
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
  });
});

describe('moveGroupTo, exact (fu 228, inv 42)', () => {
  // i1 (origin (10.1, 0.3, 3.3), turned 90) holds parts whose world box is
  // min (10.4, 0.3, -16.8). Target (20.01, 0.04, 5.03) rounds ONCE to the
  // sixteenth: (20, 0.0625, 5). So i1's origin gains (9.6, -0.2375, 21.8)
  // and lands at (19.7, 0.0625, 25.1).
  it('an assembly: the group min corner is rounded once, and the origin gains that one delta', () => {
    s().selectBoard('i1');
    const min0 = boardsBounds(worldParts(s().doc).filter((b) => isCovered(b.id, new Set(['i1']))))!.min;
    expect(min0[0]).toBeCloseTo(10.4, 12);
    expect(min0[1]).toBeCloseTo(0.3, 12);
    expect(min0[2]).toBeCloseTo(-16.8, 12);
    s().moveGroupTo(['i1'], [20.01, 0.04, 5.03]);
    const p = instanceAt(s().doc, 'i1')!.position;
    expect(p[0]).toBeCloseTo(19.7, 12);
    expect(p[1]).toBeCloseTo(0.0625, 12);
    expect(p[2]).toBeCloseTo(25.1, 12);
    const min1 = boardsBounds(worldParts(s().doc).filter((b) => isCovered(b.id, new Set(['i1']))))!.min;
    expect(min1[0]).toBeCloseTo(20, 12);
    expect(min1[1]).toBeCloseTo(0.0625, 12);
    expect(min1[2]).toBeCloseTo(5, 12);
    expect(s().past.length).toBe(1);
  });

  // r1 (-5.3, 0, 0.1) and i1 together: group min (-5.3, 0, -16.8). Target
  // (-6.01, 0.04, 0.03) rounds to (-6, 0.0625, 0): delta (-0.7, 0.0625, 16.8).
  // i1 -> (9.4, 0.3625, 20.1); r1 -> (-6, 0.0625, 16.9). Both gain the SAME delta,
  // so their offset is kept although neither sits on the grid.
  it('a mixed selection: one delta for every item, the layout between them untouched', () => {
    s().moveGroupTo(['r1', 'i1'], [-6.01, 0.04, 0.03]);
    const i1 = instanceAt(s().doc, 'i1')!.position;
    const r1 = s().doc.boards[0]!.position;
    [9.4, 0.3625, 20.1].forEach((v, k) => expect(i1[k]).toBeCloseTo(v, 12));
    [-6, 0.0625, 16.9].forEach((v, k) => expect(r1[k]).toBeCloseTo(v, 12));
    // the offset between the two origins is exactly what it was, to rounding
    expect(i1[0] - r1[0]).toBeCloseTo(10.1 - -5.3, 12);
    expect(i1[2] - r1[2]).toBeCloseTo(3.3 - 0.1, 12);
  });

  // Even a target equal to the current min is rounded: min (10.4, 0.3, -16.8)
  // goes to (166/16, 5/16, -269/16) = (10.375, 0.3125, -16.8125). A second call at
  // that on-grid min has a zero delta and writes nothing (inv 4).
  it('rounds a target that equals the current off-grid min; a zero delta then pushes no entry', () => {
    const minOf = () => boardsBounds(worldParts(s().doc).filter((b) => isCovered(b.id, new Set(['i1']))))!.min;
    const m = minOf();
    s().moveGroupTo(['i1'], [m[0], m[1], m[2]]);
    const after = minOf();
    [10.375, 0.3125, -16.8125].forEach((v, k) => expect(after[k]).toBeCloseTo(v, 12));
    const doc = s().doc;
    const past = s().past.length;
    s().moveGroupTo(['i1'], [after[0], after[1], after[2]]);
    expect([s().doc, s().past.length]).toEqual([doc, past]);
  });
});

describe('Copy in a row inside a turned assembly, exact (fu 228)', () => {
  // i1 is turned 90: world +X is the frame's +Z (rotateVec 90 maps (x,y,z) to
  // (z,y,-x), so the frame step is the inverse, (0,0,+5) for a +5 world step).
  // i1/b2 is stored at (1.1, 0, 2.7), so the copy is stored at (1.1, 0, 2.7 + 5).
  it('the copy is the original shifted 5in along world X, written on the frame\'s Z only', () => {
    s().openAssembly('i1');
    const before = resolvedPartAt(s().doc, 'i1/b2')!;
    const wBefore = worldParts(s().doc).find((b) => b.id === 'i1/b2')!;
    const past = s().past.length;
    s().copyInRow(['i1/b2'], 2, 0, 1, 5);
    const kids = childrenOf(s().doc, 'i1');
    expect(kids.slice(0, 2)).toEqual(['i1/b1', 'i1/b2']);
    expect(kids[3]).toBe('i1/i2');                                // parts first, then assemblies
    const copyId = kids[2]!;
    const copy = resolvedPartAt(s().doc, copyId)!;
    expect(copy.position).toEqual([1.1, 0, 2.7 + 5]);
    expect([copy.name, copy.rotation, copy.posture, copy.length, copy.width, copy.thickness])
      .toEqual(['Front (1)', before.rotation, before.posture, before.length, before.width, before.thickness]);
    expect(resolvedPartAt(s().doc, 'i1/b2')).toEqual(before);     // the original is untouched
    const w = worldParts(s().doc).find((b) => b.id === copyId)!;
    expect(w.position[0]).toBeCloseTo(wBefore.position[0] + 5, 12);
    expect(w.position[1]).toBe(wBefore.position[1]);
    expect(w.position[2]).toBeCloseTo(wBefore.position[2], 12);
    expect(s().past.length).toBe(past + 1);
    expect(s().selectedIds).toEqual(['i1/b2', copyId]);
  });
});

describe('Group inside an open assembly, exact (fu 228)', () => {
  it('groups one level down: the new assembly sits in the open one, selected, and nothing moves by a bit', () => {
    const before = worldParts(s().doc);
    const doc0 = s().doc;
    s().openAssembly('i1');
    s().selectItem('i1/b1', false);
    const past = s().past.length;
    s().groupSelected();
    const [path] = s().selectedIds;
    expect(s().selectedIds).toHaveLength(1);
    expect(path!.startsWith('i1/')).toBe(true);
    expect(parentPath(path!)).toBe('i1');
    expect(s().openPath).toBe('i1');
    // the open level now lists the remaining part, the old assembly, then the new one
    expect(childrenOf(s().doc, 'i1')).toEqual(['i1/b2', 'i1/i2', path]);
    expect(childrenOf(s().doc, path!)).toEqual([`${path}/b1`]);
    const inst = instanceAt(s().doc, path!)!;
    expect([inst.name, inst.position, inst.rotation]).toEqual(['Assembly 1', [0, 0, 0], 0]);
    // the document: d1 lost b1 and gained the instance; the root and d2 are untouched
    const d1 = s().doc.definitions.find((d) => d.id === 'd1')!;
    expect(d1.boards.map((b) => b.id)).toEqual(['b2']);
    expect(d1.instances.map((i) => i.id)).toEqual(['i2', inst.id]);
    expect(s().doc.boards).toBe(doc0.boards);
    expect(s().doc.definitions.find((d) => d.id === 'd2')).toBe(doc0.definitions.find((d) => d.id === 'd2'));
    // every world part is bit-identical under its new path
    const after = new Map(worldParts(s().doc).map((b) => [b.id, b]));
    for (const b of before) {
      const id = b.id === 'i1/b1' ? `${path}/b1` : b.id;
      expect({ ...after.get(id)!, id: '' }).toEqual({ ...b, id: '' });
    }
    expect(after.size).toBe(before.length);
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(s().doc).toBe(doc0);
  });

  it('with nothing selected it writes nothing', () => {
    s().openAssembly('i1');
    const doc = s().doc;
    s().groupSelected();
    expect(s().doc).toBe(doc);
  });
});

describe('Make Unique inside a shared container (fu 231)', () => {
  // cabinetsDoc: the cabinet definition dc is placed three times and holds ONE
  // stored drawer instance, whose definition dd is also placed loose at the root.
  const heldOnCab = (id: string) => snapPointsFor(worldParts(s().doc).find((b) => b.id === id)!)[0] as BoardSnapPoint;
  beforeEach(() => load(cabinetsDoc()));

  it('re-points the one stored drawer for every cabinet, in one undo entry; hidden ids, held points and world positions are unchanged', () => {
    s().setHidden('c2/dr/front', true);
    s().setTapeAnchor(heldOnCab('c3/dr/front'));
    const anchor = s().tapeAnchor;
    const doc0 = s().doc;
    const world0 = worldParts(doc0).map((b) => [b.id, b.position]);
    const past = s().past.length;
    s().makeUnique('c1/dr');
    expect(s().past.length).toBe(past + 1);
    const copyId = s().doc.definitions.find((d) => d.id === 'dc')!.instances[0]!.definition;
    expect(copyId).not.toBe('dd');
    for (const p of ['c1/dr', 'c2/dr', 'c3/dr']) expect(instanceAt(s().doc, p)!.definition).toBe(copyId);
    expect(instanceAt(s().doc, 'x')!.definition).toBe('dd');
    expect(worldParts(s().doc).map((b) => [b.id, b.position])).toEqual(world0);
    expect(s().hiddenIds).toEqual(['c2/dr/front']);
    expect(s().tapeAnchor).toBe(anchor);
    s().undo();
    expect(s().doc).toBe(doc0);
  });

  it('pushes no entry when the shared container holds the only stored instance of the drawer', () => {
    load({ ...cabinetsDoc(), instances: cabinetsDoc().instances.filter((i) => i.id !== 'x') });
    const doc = s().doc;
    const past = s().past.length;
    s().makeUnique('c1/dr');
    expect([s().doc, s().past.length]).toEqual([doc, past]);
  });
});

describe('selectCopies drops hidden copies and a held grab that no longer belongs (fu 231)', () => {
  beforeEach(() => load(cabinetsDoc()));
  const heldOnCab = (id: string) => snapPointsFor(worldParts(s().doc).find((b) => b.id === id)!)[0] as BoardSnapPoint;

  it('selects every placement at this level, in document order', () => {
    s().selectCopies('c2');
    expect(s().selectedIds).toEqual(['c1', 'c2', 'c3']);
    s().selectCopies('x');                               // the nested drawers are at another level
    expect(s().selectedIds).toEqual(['x']);
  });

  it('a hidden copy is not selected; shown again, it is', () => {
    s().setHidden('c2', true);
    s().selectCopies('c1');
    expect(s().selectedIds).toEqual(['c1', 'c3']);
    s().setHidden('c2', false);
    s().selectCopies('c1');
    expect(s().selectedIds).toEqual(['c1', 'c2', 'c3']);
  });

  // inv 24: a grab survives exactly when its owner is under the new selection.
  it('a held grab survives while its owner is under any selected copy', () => {
    s().selectBoard('c1');
    s().grabSnapPoint(heldOnCab('c1/side'));
    s().selectCopies('c1');
    expect(s().grabbed?.owner.id).toBe('c1/side');
    s().selectBoard('c3');                               // retargeted away from c1
    expect(s().grabbed).toBeNull();
    s().selectBoard('c1');
    s().grabSnapPoint(heldOnCab('c3/side'));             // owned by another copy; grabSnapPoint itself checks nothing
    expect(s().grabbed).not.toBeNull();
    s().selectCopies('c1');
    expect(s().grabbed?.owner.id).toBe('c3/side');       // c3 is now selected, so the grab is covered
  });

  it('a held grab outside the copies goes', () => {
    s().selectBoard('x');
    s().grabSnapPoint(heldOnCab('x/front'));
    s().selectCopies('c1');
    expect(s().selectedIds).toEqual(['c1', 'c2', 'c3']);
    expect(s().grabbed).toBeNull();
  });

  it('a grab under a copy that is hidden goes with it', () => {
    s().selectBoard('c1');
    s().grabSnapPoint(heldOnCab('c3/side'));
    s().setHidden('c3', true);
    s().selectCopies('c1');
    expect(s().selectedIds).toEqual(['c1', 'c2']);
    expect(s().grabbed).toBeNull();
  });
});

describe('self-snap into the selected assembly, and cut actions on mates (fu 228; strengthened)', () => {
  const grabOn = (id: string) => {
    const w = worldParts(s().doc).find((b) => b.id === id)!;
    s().grabSnapPoint(point(id, [w.position[0], w.position[1], w.position[2]]));
    return w;
  };

  it.each(['i1/b2', 'i1/i2/b3'])('a target on %s, inside the selected assembly, is refused: nothing moves, no entry, the grab stays', (target) => {
    s().selectBoard('i1');
    s().setTool('move');
    const w = grabOn('i1/b1');
    const doc = s().doc;
    const past = s().past.length;
    const grab = s().grabbed;
    s().commitSnapMove({ at: [w.position[0] + 0.3, w.position[1] + 0.2, w.position[2] + 0.1], kind: 'corner', owner: { type: 'board', id: target } } as never);
    expect([s().doc, s().past.length, s().grabbed]).toEqual([doc, past, grab]);
  });

  it('the same move onto a part OUTSIDE the assembly is carried out, by the exact delta', () => {
    s().selectBoard('i1');
    s().setTool('move');
    const w = grabOn('i1/b1');
    s().commitSnapMove({ at: [w.position[0] + 0.3, w.position[1], w.position[2]], kind: 'corner', owner: { type: 'board', id: 'r1' } } as never);
    // i1 is turned 90: its origin moves by the world delta (0.3, 0, 0)
    expect(instanceAt(s().doc, 'i1')!.position).toEqual([10.1 + 0.3, 0.3 + 0, 3.3 + 0]);
    expect(s().grabbed).toBeNull();
  });

  it('a cut added, edited and removed from a part INSIDE an assembly reaches its mate at the root, one undo entry each', () => {
    s().linkBoards(['i1/b2', 'r1']);
    const b1Cuts = resolvedPartAt(s().doc, 'i1/b1')!.cuts;       // the chiral fixture part has cuts of its own
    const past = () => s().past.length;
    const n0 = past();
    s().addCut('i1/b2');
    expect(past()).toBe(n0 + 1);
    const id = resolvedPartAt(s().doc, 'i1/b2')!.cuts[0]!.id;
    expect(resolvedPartAt(s().doc, 'r1')!.cuts.map((c) => c.id)).toEqual([id]);
    s().updateCut('i1/b2', id, { depth: 0.1 });
    expect(past()).toBe(n0 + 2);
    expect(resolvedPartAt(s().doc, 'r1')!.cuts[0]!.depth).toBe(0.1);
    s().removeCut('i1/b2', id);
    expect(past()).toBe(n0 + 3);
    expect(resolvedPartAt(s().doc, 'r1')!.cuts).toEqual([]);
    // an unlinked part is untouched by all of it
    expect(resolvedPartAt(s().doc, 'i1/b1')!.cuts).toEqual(b1Cuts);
    s().undo(); s().undo();
    expect(resolvedPartAt(s().doc, 'r1')!.cuts.map((c) => c.id)).toEqual([id]);
    expect(resolvedPartAt(s().doc, 'i1/b2')!.cuts.map((c) => c.id)).toEqual([id]);
  });
});

describe('moves and copies inside a mirrored assembly (mirrored-instances spec §4)', () => {
  const mirroredDoc = () => {
    const d = assemblyDoc();
    return { ...d, instances: d.instances.map((i) => (i.id === 'i1' ? { ...i, mirrored: true } : i)) };
  };
  it('copyInRow inside a mirrored assembly lands at original + k*step along the WORLD Z axis (a 90 turn puts it on local X, where the mirror acts)', () => {
    load(mirroredDoc());
    s().openAssembly('i1');
    const orig = worldParts(s().doc).find((b) => b.id === 'i1/b1')!;
    s().copyInRow(['i1/b1'], 3, 2, 1, 2.5);
    const copies = worldParts(s().doc).filter((b) => b.id.startsWith('i1/') && b.name.startsWith('Side') && b.id !== 'i1/b1');
    expect(copies).toHaveLength(2);
    const xs = copies.map((c) => c.position[2] - orig.position[2]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(2.5, 9);
    expect(xs[1]).toBeCloseTo(5, 9);
    copies.forEach((c) => { expect(c.position[0]).toBeCloseTo(orig.position[0], 9); expect(c.position[1]).toBeCloseTo(orig.position[1], 9); });
  });
});
