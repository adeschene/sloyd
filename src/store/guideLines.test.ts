import { useStore } from './store';
import { createDocument } from '../document/document';
import type { SnapPoint } from '../document/document';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

const crossing = (a: string, b: string): SnapPoint =>
  ({ position: [0, 0, 0], kind: 'guide', owner: { type: 'guide', id: a, cross: b } }) as unknown as SnapPoint;
const slide = (id: string): SnapPoint =>
  ({ position: [0, 0, 0], kind: 'guide', owner: { type: 'guide', id } }) as unknown as SnapPoint;

describe('addGuideLine', () => {
  it('adds a canonical line as one undo entry, selection untouched', () => {
    s().addBoard();
    const sel = s().selectedIds;
    const past = s().past.length;
    expect(s().addGuideLine([4, 5, 6], 'x')).toBe(true);
    const g = s().doc.guides.at(-1)!;
    expect(g).toEqual({ id: expect.any(String), at: [0, 5, 6], axis: 'x' });
    expect(s().past.length).toBe(past + 1);
    expect(s().selectedIds).toBe(sel);
    s().undo();
    expect(s().doc.guides).toHaveLength(0);
    s().redo();
    expect(s().doc.guides.at(-1)).toEqual(g);
  });

  it('refuses a duplicate without touching doc, undo stack or redo', () => {
    s().addGuideLine([4, 5, 6], 'x');
    s().addBoard();
    s().undo();
    const [doc, past, future] = [s().doc, s().past.length, s().future.length];
    expect(future).toBeGreaterThan(0);
    expect(s().addGuideLine([9, 5, 6], 'x')).toBe(false);
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
    expect(s().future.length).toBe(future);
    s().redo();
    expect(s().doc.boards).toHaveLength(1);
  });

  it('refuses while exploded', () => {
    const doc = s().doc;
    s().setExplode(0.5);
    expect(s().addGuideLine([1, 2, 3], 'y')).toBe(false);
    expect(s().doc).toBe(doc);
  });
});

describe('removeGuide and held crossings', () => {
  const setup = () => {
    for (const [p, a] of [[[0, 1, 1], 'x'], [[1, 0, 1], 'y'], [[1, 1, 0], 'z'], [[0, 7, 7], 'x']] as const) s().addGuideLine([...p], a);
    const [A, B, C, D] = s().doc.guides.map((g) => g.id) as [string, string, string, string];
    s().setTapeAnchor(crossing(A, B));
    s().setTapeHover(slide(C));
    return { A, B, C, D };
  };

  it('removing a line a held crossing is on clears the anchor, keeps the hover', () => {
    const { B, C } = setup();
    s().removeGuide(B);
    expect(s().tapeAnchor).toBeNull();
    expect(s().tapeAxis).toBeNull();
    expect(s().tapeHover?.owner).toEqual({ type: 'guide', id: C });
  });

  it('removing an unrelated line leaves anchor and hover', () => {
    const { D } = setup();
    const [a, h] = [s().tapeAnchor, s().tapeHover];
    s().removeGuide(D);
    expect(s().tapeAnchor).toBe(a);
    expect(s().tapeHover).toBe(h);
  });

  it('removing the hovered line clears the hover only', () => {
    const { C } = setup();
    const a = s().tapeAnchor;
    s().removeGuide(C);
    expect(s().tapeHover).toBeNull();
    expect(s().tapeAnchor).toBe(a);
  });
});
