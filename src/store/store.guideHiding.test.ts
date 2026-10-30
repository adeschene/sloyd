import { useStore } from './store';
import { createBoard, createDocument } from '../document/document';
import type { SavedViewCamera, SloydDocument, SnapPoint } from '../document/document';

// Selectable guides spec §3.4 (fu 591): a guide hide goes through inv 43's ONE gate, `applyHidden`, which now writes
// both hidden sets — one run, one undo entry, the SAME document object, and never the tape's held points.

const s = () => useStore.getState();

const fixture = (): SloydDocument => ({
  ...createDocument('Test'),
  boards: [createBoard({ id: 'a', name: 'A' }), createBoard({ id: 'b', name: 'B', position: [0, 0, 10] })],
  guides: [{ id: 'g1', at: [1, 2, 3] }, { id: 'g2', at: [0, 1, 1], axis: 'x' }],
});

const guidePoint = (id: string): SnapPoint => ({ kind: 'guide', at: [1, 2, 3], owner: { type: 'guide', id } });
const cam: SavedViewCamera = { ortho: false, position: [10, 8, 12], target: [0, 1, 0] };

beforeEach(() => s().replaceDocument(fixture()));

describe('hideSelectedGuides', () => {
  it('hides the selection, drops it from the selection, one entry, the SAME document', () => {
    const doc = s().doc;
    const past = s().past.length;
    s().selectGuide('g1', false);
    s().hideSelectedGuides();
    expect(s().hiddenGuideIds).toEqual(['g1']);
    expect(s().selectedGuideIds).toEqual([]);
    expect(s().past.length).toBe(past + 1);
    expect(s().doc).toBe(doc);
    expect(s().past[s().past.length - 1]!.hiddenGuideIds).toEqual([]);
  });
});

describe('one run across parts and guides', () => {
  it('a part hide then a guide hide share ONE entry; undo shows both (Review Focus 3)', () => {
    const past = s().past.length;
    s().setHidden('a', true);
    s().setGuideHidden('g2', true);
    expect(s().hiddenIds).toEqual(['a']);
    expect(s().hiddenGuideIds).toEqual(['g2']);
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(s().hiddenIds).toEqual([]);
    expect(s().hiddenGuideIds).toEqual([]);
  });

  it('a run back at its start leaves no entry (inv 4)', () => {
    const past = s().past.length;
    s().setGuideHidden('g2', true);
    s().setGuideHidden('g2', false);
    expect(s().hiddenGuideIds).toEqual([]);
    expect(s().past.length).toBe(past);
  });

  it('a run back at its start on ONE set keeps its entry (both sets are judged)', () => {
    const past = s().past.length;
    s().setGuideHidden('g2', true);
    s().setHidden('a', true);
    s().setGuideHidden('g2', false); // guides back at the start, parts not
    expect(s().past.length).toBe(past + 1);
    s().setGuideHidden('g2', true);
    s().setHidden('a', false); // parts back at the start, guides not
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(s().hiddenIds).toEqual([]);
    expect(s().hiddenGuideIds).toEqual([]);
  });

  it('an unknown guide id is filtered out, and so writes nothing', () => {
    const past = s().past.length;
    s().setGuideHidden('nope', true);
    expect(s().hiddenGuideIds).toEqual([]);
    expect(s().past.length).toBe(past);
  });
});

describe('hideOtherGuides', () => {
  it('hides every guide not selected', () => {
    s().selectGuide('g1', false);
    s().hideOtherGuides();
    expect(s().hiddenGuideIds).toEqual(['g2']);
    expect(s().selectedGuideIds).toEqual(['g1']);
  });

  it('does nothing with nothing selected', () => {
    const past = s().past.length;
    s().hideOtherGuides();
    expect(s().hiddenGuideIds).toEqual([]);
    expect(s().past.length).toBe(past);
  });
});

describe('showAll', () => {
  it('shows parts and guides together, as one entry', () => {
    s().setHidden('a', true);
    s().setGuideHidden('g1', true);
    s().selectBoard('b'); // an edit-free selection: the run carries on
    s().addBoard(); // an edit ends the run
    const past = s().past.length;
    s().showAll();
    expect(s().hiddenIds).toEqual([]);
    expect(s().hiddenGuideIds).toEqual([]);
    expect(s().past.length).toBe(past + 1);
  });
});

describe('PROHIBITION: a guide hide or show never clears the tape (inv 43, inv 24)', () => {
  it('keeps tapeAnchor and tapeHover owned by the hidden guide, through its undo too', () => {
    const anchor = guidePoint('g1');
    const hover = { ...guidePoint('g1'), at: [1, 2, 4] as [number, number, number] };
    useStore.setState({ tool: 'tape', tapeAnchor: anchor, tapeHover: hover });
    s().setGuideHidden('g1', true);
    expect(s().hiddenGuideIds).toEqual(['g1']);
    expect(s().tapeAnchor).toBe(anchor);
    expect(s().tapeHover).toBe(hover);
    s().undo();
    expect(s().hiddenGuideIds).toEqual([]);
    expect(s().tapeAnchor).toBe(anchor);
    expect(s().tapeHover).toBe(hover);
  });
});

describe('refusals', () => {
  it('a guide hide is refused while gesturing', () => {
    s().beginGesture();
    s().setGuideHidden('g1', true);
    expect(s().hiddenGuideIds).toEqual([]);
    s().endGesture();
  });
});

describe('reconcile on delete, undo, clear and replace', () => {
  it('removeGuides drops a hidden id; undo brings it back from the entry', () => {
    s().setGuideHidden('g1', true);
    s().removeGuides(['g1']);
    expect(s().hiddenGuideIds).toEqual([]);
    s().undo();
    expect(s().hiddenGuideIds).toEqual(['g1']);
  });

  it('clearGuides and replaceDocument leave none', () => {
    s().setGuideHidden('g1', true);
    s().clearGuides();
    expect(s().hiddenGuideIds).toEqual([]);
    s().undo();
    expect(s().hiddenGuideIds).toEqual(['g1']);
    s().replaceDocument(fixture());
    expect(s().hiddenGuideIds).toEqual([]);
  });

  it('undo filters the entry\'s hidden guides to the guides its document has', () => {
    // Every entry a writer pushes is consistent (edit() reconciles), so the stale id is planted, as store.test.ts does
    // for parts: the filter is restore's own guarantee, not its callers'.
    s().setGuideHidden('g1', true);
    const entry = s().past[s().past.length - 1]!;
    useStore.setState({ past: [...s().past.slice(0, -1), { ...entry, hiddenGuideIds: ['g2', 'ghost'] }] });
    s().undo();
    expect(s().hiddenGuideIds).toEqual(['g2']);
  });

  it('a redo that re-hides a selected guide drops it from the selection', () => {
    s().setGuideHidden('g1', true);
    s().undo();
    s().selectGuide('g1', false);
    s().redo();
    expect(s().hiddenGuideIds).toEqual(['g1']);
    expect(s().selectedGuideIds).toEqual([]);
  });
});

describe('saved views are board-only (spec §3.4)', () => {
  it('goToView leaves the hidden guides alone', () => {
    const id = s().saveView(cam)!;
    s().setGuideHidden('g1', true);
    s().goToView(id);
    expect(s().hiddenGuideIds).toEqual(['g1']);
  });

  it('saveView stores part ids only', () => {
    s().setHidden('a', true);
    s().setGuideHidden('g1', true);
    const id = s().saveView(cam)!;
    expect(s().doc.views.find((v) => v.id === id)!.hidden).toEqual(['a']);
  });
});
