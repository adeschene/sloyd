import { useStore } from './store';
import { assemblyDoc } from '../document/treeFixtures';
import { worldParts } from '../document/tree';
import { visibleBoards } from './visibility';
import type { BoardSnapPoint, SloydDocument } from '../document/document';
import { removeItems, snapPointsFor } from '../document/document';

const load = (doc: SloydDocument = assemblyDoc()) => useStore.getState().replaceDocument(doc);
const s = () => useStore.getState();
const point = (owner: string, at: [number, number, number] = [0, 0, 0]): BoardSnapPoint =>
  ({ at, kind: 'corner', owner: { type: 'board', id: owner } } as BoardSnapPoint);
/** A REAL snap point of a world part, so dropHeldIfGone's survival test can keep it. */
export const heldOn = (id: string): BoardSnapPoint =>
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
