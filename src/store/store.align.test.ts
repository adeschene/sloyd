import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { createBoard, createDocument, snapPointsFor, worldParts } from '../document/document';
import type { Definition, Instance, SloydDocument } from '../document/document';

/** Align spec §5: one edit per click, exact, refused while exploded or gesturing, held points re-judged. */
const s = () => useStore.getState();
const setup = (doc: SloydDocument, selected: string[] = []) =>
  useStore.setState({ doc, selectedIds: selected, openPath: null, hiddenIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, tapeAxis: null, explode: 0, gesturing: false, gestureSnapshotTaken: false });
const B = (id: string, x: number, y: number, z = 0) => createBoard({ id, name: id.toUpperCase(), length: 10, width: 2, thickness: 1, position: [x, y, z] });
const three = () => ({ ...createDocument('T'), boards: [B('a', 0, 0), B('b', 3.25, 5), B('c', -1.5, 9)] });
const pos = (id: string) => worldParts(s().doc).find((p) => p.id === id)!.position;

describe('alignItems / distributeItems (align spec §5)', () => {
  beforeEach(() => setup(three(), ['a', 'b', 'c']));

  it('align left: ONE undo entry, exact positions; undo restores them exactly', () => {
    expect(s().alignItems(0, 'min')).toBeNull();
    expect(s().past).toHaveLength(1);
    expect([pos('a'), pos('b'), pos('c')]).toEqual([[0, 0, 0], [0, 5, 0], [0, 9, 0]]);
    s().undo();
    expect([pos('a'), pos('b'), pos('c')]).toEqual([[0, 0, 0], [3.25, 5, 0], [-1.5, 9, 0]]);
  });

  it('already aligned: no entry, the same document', () => {
    s().alignItems(0, 'min');
    const before = s().doc;
    expect(s().alignItems(0, 'min')).toBeNull();
    expect(s().past).toHaveLength(1);
    expect(s().doc).toBe(before);
  });

  it('a refusal returns its sentence and writes nothing', () => {
    setup({ ...createDocument('T'), boards: [B('a', 0, 0), createBoard({ id: 'x', name: 'X', length: 10, width: 2, thickness: 20, position: [0, 1, 0] }), B('c', 0, 5)] }, ['a', 'x', 'c']);
    const before = s().doc;
    expect(s().distributeItems(1)).toBe("These parts don't fit between A and C along Y.");
    expect(s().past).toHaveLength(0);
    expect(s().doc).toBe(before);
  });

  it('space evenly along Y: the middle part to the middle', () => {
    expect(s().distributeItems(1)).toBeNull();
    expect(pos('b')[1]).toBe(1 + (9 - 1 - 1) / 2); // a flat part's Y extent is its thickness, 1
  });

  it('refused while exploded, and while gesturing', () => {
    s().setExplode(0.5);
    const before = s().doc;
    expect(s().alignItems(0, 'min')).toBeNull();
    expect(s().doc).toBe(before);
    setup(three(), ['a', 'b', 'c']);
    useStore.setState({ gesturing: true });
    s().alignItems(0, 'min');
    expect(s().past).toHaveLength(0);
  });

  it('a held tape point on a moved part is dropped; one on the unmoved anchor is kept (inv 24)', () => {
    const onB = snapPointsFor(worldParts(s().doc).find((p) => p.id === 'b')!)[0]!;
    useStore.setState({ tapeAnchor: onB });
    s().alignItems(0, 'min');
    expect(s().tapeAnchor).toBeNull();
    setup(three(), ['a', 'b', 'c']);
    const onA = snapPointsFor(worldParts(s().doc).find((p) => p.id === 'a')!)[0]!;
    useStore.setState({ tapeAnchor: onA });
    s().alignItems(0, 'min');
    expect(s().tapeAnchor).toEqual(onA);
  });

  it('the anchor is the FIRST selected: select b, then a — b stays', () => {
    setup(three(), []);
    s().selectBoard('b');
    s().toggleSelected('a');
    s().alignItems(0, 'min');
    expect(pos('b')).toEqual([3.25, 5, 0]);
    expect(pos('a')).toEqual([3.25, 0, 0]);
  });

  it('an off-grid result in a metric project is stored exactly, never rounded to a mm', () => {
    setup({ ...three(), units: { display: 'metric-mm', precision: 16 } }, ['b', 'a']);
    s().alignItems(0, 'min');
    expect(pos('a')).toEqual([3.25, 0, 0]);
  });

  it('a part in a definition placed twice moves in both copies (inv 46)', () => {
    const d1: Definition = { id: 'd1', boards: [B('p', 0, 0), B('q', 2, 3)], instances: [], hardware: [] };
    const inst = (i: number): Instance => ({ id: `i${i}`, name: `F${i}`, definition: 'd1', position: [i * 40, 0, 0], rotation: 0 });
    setup({ ...createDocument('T'), definitions: [d1], instances: [inst(0), inst(1)] } as unknown as SloydDocument);
    useStore.setState({ openPath: 'i0', selectedIds: ['i0/p', 'i0/q'] });
    s().alignItems(1, 'min');
    const qs = worldParts(s().doc).filter((b) => b.id.endsWith('/q'));
    expect(qs).toHaveLength(2);
    expect(qs.map((b) => b.position[1])).toEqual([0, 0]);
    expect(qs.map((b) => b.position[0])).toEqual([2, 42]);
  });
});
