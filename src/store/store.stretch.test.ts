import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { createDocument, snapPointsFor, worldParts } from '../document/document';
import type { SloydDocument } from '../document/document';
import { apronTable } from '../document/stretchFixtures';

/** Parametric-resize spec §7, §8: one edit per stretch, exact, refused while exploded or gesturing; the guide is view state. */
const s = () => useStore.getState();
const setup = (doc: SloydDocument, selected: string[] = []) =>
  useStore.setState({ doc, selectedIds: selected, openPath: null, hiddenIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, tapeAxis: null, explode: 0, gesturing: false, gestureSnapshotTaken: false, stretchGuide: null });
const rootIds = (doc: SloydDocument) => [...doc.boards.map((b) => b.id), ...doc.instances.map((i) => i.id)];
const part = (name: string) => worldParts(s().doc).find((p) => p.name === name)!;
const table = () => { const d = apronTable(); setup(d, rootIds(d)); return d; };

describe('stretchItems (parametric-resize spec §7)', () => {
  beforeEach(() => { table(); });

  it('widen on X by 6 at x 24: ONE undo entry, hand values; undo restores exactly', () => {
    const before = worldParts(s().doc);
    expect(s().stretchItems(0, 54, 24)).toBeNull();
    expect(s().past).toHaveLength(1);
    expect(part('Top').length).toBe(54);
    expect(part('Front apron').length).toBe(50.5);
    expect(part('Right back leg').position[0]).toBe(52.25);
    expect(part('Right apron').position[0]).toBe(52.75);
    expect(part('Left back leg').position[0]).toBe(0);
    s().undo();
    expect(worldParts(s().doc)).toEqual(before);
  });

  it('a refusal returns its sentence, adds no entry, keeps the same document', () => {
    const doc = s().doc;
    expect(s().stretchItems(0, 54, 0)).toBe('The stretch line must be inside the selection.');
    expect(s().past).toHaveLength(0);
    expect(s().doc).toBe(doc);
  });

  it('a no-op size: no entry, the same document', () => {
    const doc = s().doc;
    expect(s().stretchItems(0, 48, 24)).toBeNull();
    expect(s().past).toHaveLength(0);
    expect(s().doc).toBe(doc);
  });

  it('nothing selected: refused at entry', () => {
    useStore.setState({ selectedIds: [] });
    const doc = s().doc;
    expect(s().stretchItems(0, 54, 24)).toBeNull();
    expect(s().doc).toBe(doc);
  });

  it('exploded, and gesturing: null and nothing written', () => {
    s().setExplode(0.5);
    const doc = s().doc;
    expect(s().stretchItems(0, 54, 24)).toBeNull();
    expect(s().doc).toBe(doc);
    expect(s().past).toHaveLength(0);
    table();
    useStore.setState({ gesturing: true });
    expect(s().stretchItems(0, 54, 24)).toBeNull();
    expect(s().past).toHaveLength(0);
  });

  it('metric: an off-grid result is stored exactly, never rounded to a mm', () => {
    const d = { ...apronTable(), units: { display: 'metric-mm' as const, precision: 16 } };
    setup(d, rootIds(d));
    expect(s().stretchItems(0, 48.3, 24)).toBeNull();
    expect(part('Top').length).toBe(48 + (48.3 - 48));
    expect(part('Right apron').position[0]).toBe(46.75 + (48.3 - 48));
  });

  it('a held tape point on a moved leg is dropped; one on a left leg is kept (inv 24)', () => {
    const onMoved = snapPointsFor(part('Right back leg'))[0]!;
    useStore.setState({ tapeAnchor: onMoved });
    s().stretchItems(0, 54, 24);
    expect(s().tapeAnchor).toBeNull();
    table();
    const onLeft = snapPointsFor(part('Left back leg'))[0]!;
    useStore.setState({ tapeAnchor: onLeft });
    s().stretchItems(0, 54, 24);
    expect(s().tapeAnchor).toEqual(onLeft);
  });
});

describe('the stretch guide is view state (spec §8)', () => {
  beforeEach(() => { table(); });

  it('selecting clears it; setExplode above 0 clears it', () => {
    s().setStretchGuide({ axis: 0, at: 24 });
    expect(s().stretchGuide).toEqual({ axis: 0, at: 24 });
    s().selectBoard(null);
    expect(s().stretchGuide).toBeNull();
    table();
    s().setStretchGuide({ axis: 0, at: 24 });
    s().setExplode(0.5);
    expect(s().stretchGuide).toBeNull();
  });

  it('a successful stretch clears it; undo and redo leave a guide alone, and it is not in the document', () => {
    s().setStretchGuide({ axis: 0, at: 24 });
    s().stretchItems(0, 54, 24);
    expect(s().stretchGuide).toBeNull();
    s().setStretchGuide({ axis: 0, at: 30 });
    s().undo();
    expect(s().stretchGuide).toEqual({ axis: 0, at: 30 });
    s().redo();
    expect(s().stretchGuide).toEqual({ axis: 0, at: 30 });
    expect(JSON.stringify(s().doc)).not.toContain('stretchGuide');
  });

  it('replaceDocument clears it', () => {
    s().setStretchGuide({ axis: 0, at: 24 });
    s().replaceDocument(createDocument('N'));
    expect(s().stretchGuide).toBeNull();
  });
});
