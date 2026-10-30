import { useStore } from './store';
import { boardSnapPoints, createBoard, createDocument, worldParts } from '../document/document';
import type { SloydDocument, SnapPoint } from '../document/document';

// Selectable guides spec §3.2–§3.3, §7 (fu 591): guide selection is view state beside the part selection, written
// through the same ONE writer (inv 42) and never mixed with a part selection.

const s = () => useStore.getState();

const fixture = (): SloydDocument => ({
  ...createDocument('Test'),
  boards: [createBoard({ id: 'a', name: 'A' }), createBoard({ id: 'b', name: 'B', position: [0, 0, 10] })],
  guides: [{ id: 'g1', at: [1, 2, 3] }, { id: 'g2', at: [0, 1, 1], axis: 'x' }],
});

const guidePoint = (id: string): SnapPoint => ({ kind: 'guide', at: [1, 2, 3], owner: { type: 'guide', id } });

beforeEach(() => s().replaceDocument(fixture()));

describe('selectGuide / selectGuides', () => {
  it('replaces without toggle, adds and removes with it', () => {
    s().selectGuide('g1', false);
    expect(s().selectedGuideIds).toEqual(['g1']);
    s().selectGuide('g2', true);
    expect(s().selectedGuideIds).toEqual(['g1', 'g2']);
    s().selectGuide('g1', true);
    expect(s().selectedGuideIds).toEqual(['g2']);
  });

  it('a guide selection clears the parts: the kinds never mix (spec §3.3)', () => {
    s().selectBoard('a');
    s().toggleSelected('b');
    expect(s().selectedIds).toEqual(['a', 'b']);
    s().selectGuide('g1', true);
    expect(s().selectedIds).toEqual([]);
    expect(s().selectedGuideIds).toEqual(['g1']);
  });

  it('a part selection clears the guides (selectBoard, selectAll)', () => {
    s().selectGuide('g1', false);
    s().selectBoard('a');
    expect(s().selectedGuideIds).toEqual([]);
    expect(s().selectedIds).toEqual(['a']);
    s().selectGuide('g1', false);
    s().selectAll();
    expect(s().selectedGuideIds).toEqual([]);
    expect(s().selectedIds).toEqual(['a', 'b']);
  });

  it('an empty part re-assertion (applyHidden) keeps the guide selection (spec §3.2)', () => {
    s().selectGuide('g1', false);
    s().setHidden('a', true);
    expect(s().hiddenIds).toEqual(['a']);
    expect(s().selectedGuideIds).toEqual(['g1']);
  });

  it('selectBoard(null), the user\'s "select nothing", clears both kinds', () => {
    s().selectBoard('a');
    s().selectBoard(null);
    expect(s().selectedIds).toEqual([]);
    s().selectGuide('g1', false);
    s().selectBoard(null);
    expect(s().selectedGuideIds).toEqual([]);
    expect(s().selectedIds).toEqual([]);
  });

  it('selectGuides([]) clears the guide selection only', () => {
    s().selectGuides(['g1', 'g2']);
    expect(s().selectedGuideIds).toEqual(['g1', 'g2']);
    s().selectGuides([]);
    expect(s().selectedGuideIds).toEqual([]);
  });

  it('drops an unknown id and duplicates', () => {
    s().selectGuide('nope', false);
    expect(s().selectedGuideIds).toEqual([]);
    s().selectGuides(['g2', 'nope', 'g2', 'g1']);
    expect(s().selectedGuideIds).toEqual(['g2', 'g1']);
  });

  it('drops a hidden guide id (hiddenGuideIds, written from Task 2)', () => {
    useStore.setState({ hiddenGuideIds: ['g2'] });
    s().selectGuides(['g1', 'g2']);
    expect(s().selectedGuideIds).toEqual(['g1']);
    useStore.setState({ hiddenGuideIds: [] });
  });

  it('drops a grabbed part point: the retargeting rule of selectionPatch (inv 24)', () => {
    s().selectBoard('a');
    s().setTool('move');
    const a = worldParts(s().doc).find((p) => p.id === 'a')!;
    s().grabSnapPoint(boardSnapPoints(a).find((p) => p.kind === 'corner')!);
    expect(s().grabbed).not.toBeNull();
    s().selectGuide('g1', false);
    expect(s().grabbed).toBeNull();
  });

  it('does not touch the tape anchor (inv 24 prohibition)', () => {
    s().setTapeAnchor(guidePoint('g2'));
    const anchor = s().tapeAnchor;
    s().selectGuide('g1', false);
    s().selectBoard(null);
    expect(s().tapeAnchor).toBe(anchor);
  });
});

describe('guide selection reconciles (spec §3.4, §7)', () => {
  it('exploding clears it', () => {
    s().selectGuide('g1', false);
    s().setExplode(0.5);
    expect(s().selectedGuideIds).toEqual([]);
  });

  it('undo drops a guide the undo removed; redo does not bring the selection back', () => {
    s().addGuide([5, 5, 5]);
    const id = s().doc.guides.at(-1)!.id;
    s().selectGuide(id, false);
    expect(s().selectedGuideIds).toEqual([id]);
    s().undo();
    expect(s().selectedGuideIds).toEqual([]);
    s().redo();
    expect(s().doc.guides.some((g) => g.id === id)).toBe(true);
    expect(s().selectedGuideIds).toEqual([]);
  });

  it('an undo that keeps the guide keeps it selected', () => {
    s().addBoard();
    s().selectGuide('g1', false);
    s().undo();
    expect(s().selectedGuideIds).toEqual(['g1']);
  });

  it('clearGuides (an edit) drops it', () => {
    s().selectGuides(['g1', 'g2']);
    s().clearGuides();
    expect(s().selectedGuideIds).toEqual([]);
  });

  it('replaceDocument clears it', () => {
    s().selectGuide('g1', false);
    s().replaceDocument(fixture());
    expect(s().selectedGuideIds).toEqual([]);
  });
});

describe('removeGuides', () => {
  it('removes every named guide as ONE undo entry, and undo restores both', () => {
    s().selectGuides(['g1', 'g2']);
    const past = s().past.length;
    s().removeGuides(['g1', 'g2']);
    expect(s().doc.guides).toEqual([]);
    expect(s().past.length).toBe(past + 1);
    expect(s().selectedGuideIds).toEqual([]);
    s().undo();
    expect(s().doc.guides.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('ignores unknown ids, and pushes nothing when none is known (inv 4)', () => {
    const [doc, past] = [s().doc, s().past.length];
    s().removeGuides(['nope']);
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
    s().removeGuides(['nope', 'g1']);
    expect(s().doc.guides.map((g) => g.id)).toEqual(['g2']);
  });

  it('is refused while exploded (inv 47)', () => {
    s().setTapeAnchor(guidePoint('g1'));
    const [doc, past, anchor] = [s().doc, s().past.length, s().tapeAnchor];
    s().setExplode(0.5);
    s().setTapeAnchor(anchor!);
    s().removeGuides(['g1', 'g2']);
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
    expect(s().tapeAnchor).toBe(anchor);
  });

  it('drops a held point owned by a removed guide, and keeps one owned by another (inv 24)', () => {
    s().setTapeAnchor(guidePoint('g1'));
    s().removeGuides(['g1']);
    expect(s().tapeAnchor).toBeNull();
    s().replaceDocument(fixture());
    s().setTapeAnchor(guidePoint('g2'));
    const anchor = s().tapeAnchor;
    s().removeGuides(['g1']);
    expect(s().tapeAnchor).toBe(anchor);
  });

  it('removeGuide(id) is removeGuides([id])', () => {
    s().selectGuide('g1', false);
    s().removeGuide('g1');
    expect(s().doc.guides.map((g) => g.id)).toEqual(['g2']);
    expect(s().selectedGuideIds).toEqual([]);
  });
});
