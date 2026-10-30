import { useStore } from './store';
import { createBoard, createDocument } from '../document/document';
import type { SnapPoint } from '../document/document';
import { lineFaceHits } from '../document/lineFaces';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

const crossing = (a: string, b: string): SnapPoint =>
  ({ kind: 'line-cross', at: [0, 0, 0], owner: { type: 'guide', id: a, cross: b } });

const addX = (y: number, z: number) => {
  s().addGuideLine({ at: [0, y, z], axis: 'x' });
  return s().doc.guides.at(-1)!.id;
};

describe('moveGuideLine (construction-lines-2 spec §5.2)', () => {
  it('is one undo entry and stores the typed value exactly', () => {
    const id = addX(12, 3);
    const past = s().past.length;
    expect(s().moveGuideLine(id, [0, 12.3456789, 3])).toBe(true);
    expect(s().past.length).toBe(past + 1);
    expect((s().doc.guides[0] as { at: number[] }).at[1]).toBe(12.3456789);
  });

  it('canonicalises: the along-axis coordinate stays 0', () => {
    const id = addX(12, 3);
    s().moveGuideLine(id, [99, 14, 3]);
    expect((s().doc.guides[0] as { at: number[] }).at).toEqual([0, 14, 3]);
  });

  it('an unchanged value is a no-op: past and future untouched (Review Focus 5)', () => {
    const id = addX(12, 3);
    s().addBoard();
    s().undo();
    const [past, future] = [s().past, s().future];
    expect(s().moveGuideLine(id, [0, 12, 3])).toBe(false);
    expect(s().past).toBe(past);
    expect(s().future).toBe(future);
  });

  it('refuses a move onto another line, before any entry', () => {
    const id = addX(12, 3);
    addX(14, 3);
    const [doc, past] = [s().doc, s().past];
    expect(s().moveGuideLine(id, [0, 14, 3])).toBe(false);
    expect(s().doc).toBe(doc);
    expect(s().past).toBe(past);
  });

  it('refuses while exploded', () => {
    const id = addX(12, 3);
    s().addBoard();
    s().setExplode(0.5);
    const past = s().past.length;
    expect(s().moveGuideLine(id, [0, 14, 3])).toBe(false);
    expect(s().past.length).toBe(past);
    expect((s().doc.guides[0] as { at: number[] }).at[1]).toBe(12);
  });

  it('refuses an oblique line, a point and an unknown id', () => {
    s().addGuideLine({ at: [1, 2, 3], to: [4, 5, 6] });
    s().addGuide([1, 1, 1]);
    const [r, p] = s().doc.guides.map((g) => g.id) as [string, string];
    const past = s().past.length;
    expect(s().moveGuideLine(r, [0, 0, 0])).toBe(false);
    expect(s().moveGuideLine(p, [0, 0, 0])).toBe(false);
    expect(s().moveGuideLine('nope', [0, 0, 0])).toBe(false);
    expect(s().past.length).toBe(past);
  });

  it('drops an anchor on that line’s crossing, keeps one on another line', () => {
    const a = addX(1, 1);
    const b = (s().addGuideLine({ at: [1, 0, 1], axis: 'y' }), s().doc.guides.at(-1)!.id);
    const c = (s().addGuideLine({ at: [1, 1, 0], axis: 'z' }), s().doc.guides.at(-1)!.id);
    s().setTapeAnchor(crossing(a, b));
    s().moveGuideLine(a, [0, 2, 1]);
    expect(s().tapeAnchor).toBeNull();
    s().setTapeAnchor(crossing(b, c));
    const held = s().tapeAnchor;
    s().moveGuideLine(a, [0, 3, 1]);
    expect(s().tapeAnchor).toBe(held);
  });

  it('drops a hover on its face hit', () => {
    const board = createBoard({ length: 24, width: 5.5, thickness: 0.75, posture: 'flat', position: [0, 0, 0] });
    s().replaceDocument({ ...createDocument('T'), boards: [board] });
    const id = addX(0.375, 2.75);
    const hit = lineFaceHits(s().doc.guides[0] as Parameters<typeof lineFaceHits>[0], board)[0];
    expect(hit).toBeDefined();
    s().setTapeHover(hit!);
    s().moveGuideLine(id, [0, 40, 40]);
    expect(s().tapeHover).toBeNull();
  });
});
