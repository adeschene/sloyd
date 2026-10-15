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
});
