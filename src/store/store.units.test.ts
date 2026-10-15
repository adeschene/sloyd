import { useStore } from './store';
import { createDocument, worldParts } from '../document/document';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

describe('units switch', () => {
  it('a new project is imperial at 1/16', () => {
    expect(s().doc.units).toEqual({ display: 'imperial-fractional', precision: 16 });
  });
  it('switches as one edit, moves no number, and undoes', () => {
    s().addBoard();
    const before = JSON.stringify(worldParts(s().doc));
    const past = s().past.length;
    s().setUnitsDisplay('metric-mm');
    expect(s().doc.units).toEqual({ display: 'metric-mm', precision: 16 });
    expect(s().past.length).toBe(past + 1);
    expect(JSON.stringify(worldParts(s().doc))).toBe(before);
    s().setUnitsDisplay('imperial-fractional');
    expect(JSON.stringify(worldParts(s().doc))).toBe(before);
    s().undo();
    expect(s().doc.units.display).toBe('metric-mm');
  });
  it('setting the current display pushes no undo entry', () => {
    const past = s().past.length;
    s().setUnitsDisplay('imperial-fractional');
    expect(s().past.length).toBe(past);
  });
  it('is refused while exploded (inv 47)', () => {
    s().addBoard();
    s().setExplode(0.5);
    s().setUnitsDisplay('metric-mm');
    expect(s().doc.units.display).toBe('imperial-fractional');
  });
  it('a group move snaps the min corner to whole mm in metric, 1/16 in imperial', () => {
    s().addBoard(); s().addBoard();
    const ids = worldParts(s().doc).map((b) => b.id);
    s().setUnitsDisplay('metric-mm');
    s().moveGroupTo(ids, [10.3, 0, 0]);
    const minX = Math.min(...worldParts(s().doc).map((b) => b.position[0]));
    expect(minX * 25.4).toBeCloseTo(Math.round(10.3 * 25.4), 9);
    s().setUnitsDisplay('imperial-fractional');
    s().moveGroupTo(ids, [10.3, 0, 0]);
    expect(Math.min(...worldParts(s().doc).map((b) => b.position[0]))).toBe(Math.round(10.3 * 16) / 16);
  });
  it('a metric group move lands the min corner on exactly k / 25.4, what typing k stores (M1)', () => {
    for (const k of [3, 5, 6, 9, 10, 12]) { // each k * (1/25.4) !== k / 25.4
      s().replaceDocument(createDocument('Test'));
      s().addBoard(); s().addBoard();
      const ids = worldParts(s().doc).map((b) => b.id);
      expect(Math.min(...worldParts(s().doc).map((b) => b.position[0]))).toBe(0);
      s().setUnitsDisplay('metric-mm');
      s().moveGroupTo(ids, [k / 25.4 + 0.2 / 25.4, 0, 0]);
      expect(Math.min(...worldParts(s().doc).map((b) => b.position[0]))).toBe(k / 25.4);
    }
  });
});
