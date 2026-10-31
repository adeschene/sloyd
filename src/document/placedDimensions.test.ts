import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, createDocument, migrateDocument, validateDimensions, DocumentError } from './document';
import type { PlacedDimension } from './types';

/** Schema 33 (placed-dimensions spec §2, §2.3): `dimensions` on the document. */
const frac = { part: 'p1', frac: { length: 0, width: 0.5, thickness: 1 } };
const local = { part: 'p1', local: { length: 1.25, width: 2, thickness: 0.75 } };
const world = { at: [1, 2, 3] };
const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'd1', a: frac, b: world, axis: 'x', ...over });
const neighbour = { id: 'ok', a: local, b: frac, axis: 'z' };
const load = (dimensions: unknown) => migrateDocument({ ...createDocument('T'), dimensions }).dimensions;

describe('schema 33: PlacedDimension (placed-dimensions spec §2)', () => {
  it('createDocument has no dimensions', () => {
    expect(createDocument().dimensions).toEqual([]);
    expect(CURRENT_VERSION).toBe(33);
  });

  it('a 32 file loads with dimensions [] at version 33', () => {
    const { dimensions: _d, ...rest } = createDocument('T');
    const back = migrateDocument({ ...rest, version: 32 });
    expect(back.dimensions).toEqual([]);
    expect(back.version).toBe(33);
  });

  it('a 34 file is refused', () => {
    expect(() => migrateDocument({ ...createDocument('T'), version: 34 })).toThrow(DocumentError);
  });

  it('each anchor kind round-trips unchanged', () => {
    const dims = [
      { id: 'a', a: frac, b: local, axis: 'x' },
      { id: 'b', a: world, b: frac, axis: 'y' },
      { id: 'c', a: local, b: world, axis: 'z' },
    ] as unknown as PlacedDimension[];
    const doc = { ...createDocument('T'), dimensions: dims };
    expect(migrateDocument(JSON.parse(JSON.stringify(doc))).dimensions).toEqual(dims);
  });

  describe('drops a malformed entry and keeps its neighbour', () => {
    const cases: [string, unknown][] = [
      ['non-string id', good({ id: 4 })],
      ['axis w', good({ axis: 'w' })],
      ['anchor {}', good({ a: {} })],
      ['frac.length 0.25', good({ a: { part: 'p1', frac: { length: 0.25, width: 0, thickness: 0 } } })],
      ['local.width NaN', good({ b: { part: 'p1', local: { length: 1, width: NaN, thickness: 1 } } })],
      ['at of length 2', good({ a: { at: [1, 2] } })],
      ['part not a string', good({ a: { part: 7, frac: frac.frac } })],
      ['frac and local both', good({ a: { part: 'p1', frac: frac.frac, local: local.local } })],
      ['non-object entry', 'x'],
    ];
    for (const [label, bad] of cases) {
      it(label, () => expect(validateDimensions([bad, neighbour])).toEqual([neighbour]));
    }
  });

  it('keeps an entry whose part names no part', () => {
    const e = good({ a: { part: 'gone/none', frac: frac.frac } });
    expect(validateDimensions([e])).toEqual([e]);
  });

  it('repairs duplicate ids: first keeps, later is re-minted', () => {
    const d = validateDimensions([good({ id: 'd1' }), good({ id: 'd1' })]);
    expect(d[0]!.id).toBe('d1');
    expect(d[1]!.id).not.toBe('d1');
    expect(d[1]!.id).not.toContain('/');
  });

  it('non-array dimensions is []', () => {
    expect(load('nope')).toEqual([]);
    expect(load(undefined)).toEqual([]);
  });
});
