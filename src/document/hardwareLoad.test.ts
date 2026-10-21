import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, DocumentError, createBoard, createDocument, migrateDocument } from './document';
import type { Board, Shape } from './types';

const raw = (over: object) => JSON.parse(JSON.stringify({ ...createDocument('T'), version: 19, ...over }));
const part = (over: object = {}) => ({ ...createBoard({ id: 'b1', name: 'Shelf', length: 30, width: 11, thickness: 0.75 }), ...over });
const type = (over: object = {}) => ({ id: 'h1', name: 'Hinge', packSize: 2, pricePerPack: 3.5, ...over });
const users = (id: string) => ({ id, name: id, shape: 's1', position: [0, 0, 0] });
const TYPES = [type(), type({ id: 'h2', name: 'Pull' })];
const board0 = (d: ReturnType<typeof migrateDocument>) => d.boards[0] as Board;
const types = (list: object[]) => migrateDocument(raw({ hardwareTypes: list })).hardwareTypes;
// JSON turns NaN into null, so a NaN price is fed to the loader without the round trip.
const typesNoJson = (list: object[]) => migrateDocument({ ...raw({}), hardwareTypes: list }).hardwareTypes;

describe('loading schema 20 (hardware spec §2.3)', () => {
  it('this build writes 20', () => expect(CURRENT_VERSION).toBe(20));

  it('a v19 document with no hardware fields loads empty everywhere', () => {
    const r = raw({ boards: [part(), users('u1'), users('u2')], shapes: [{ ...createBoard({ id: 's1' }) }], instances: [{ id: 'i1', name: 'A', definition: 'd1', position: [0, 0, 0], rotation: 0 }], definitions: [{ id: 'd1', boards: [part({ id: 'x' })], instances: [] }] });
    for (const o of [r, ...r.boards, ...r.shapes, ...r.definitions]) delete o.hardware;
    delete r.hardwareTypes;
    const d = migrateDocument(r);
    expect(d.version).toBe(20);
    expect(d.hardwareTypes).toEqual([]);
    expect(d.hardware).toEqual([]);
    expect(board0(d).hardware).toEqual([]);
    expect(d.shapes[0]!.hardware).toEqual([]);
    expect(d.definitions[0]!.hardware).toEqual([]);
  });

  describe('types', () => {
    it.each([
      ['empty name', { name: '' }], ['non-string name', { name: 5 }],
      ['packSize 0', { packSize: 0 }], ['packSize 2.5', { packSize: 2.5 }], ['packSize -1', { packSize: -1 }], ['packSize "3"', { packSize: '3' }],
      ['price -1', { pricePerPack: -1 }], ['price "1"', { pricePerPack: '1' }],
    ])('drops a type with %s', (_n, over) => expect(types([type(over)])).toEqual([]));

    it('drops a type with price NaN', () => expect(typesNoJson([type({ pricePerPack: NaN })])).toEqual([]));
    it('keeps a type with pricePerPack absent as null', () => {
      const { pricePerPack: _p, ...t } = type();
      expect(types([t])).toEqual([{ id: 'h1', name: 'Hinge', packSize: 2, pricePerPack: null }]);
    });
    it('re-mints the second of two equal ids', () => {
      const out = types([type(), type({ name: 'Pull' })]);
      expect(out).toHaveLength(2);
      expect(out[0]!.id).toBe('h1');
      expect(out[1]!.id).not.toBe('h1');
    });
    it('dedupes equal names', () => {
      const out = types([type(), type({ id: 'h2' })]);
      expect(out[0]!.name).toBe('Hinge');
      expect(out[1]!.name).not.toBe('Hinge');
    });
  });

  describe('entries', () => {
    const hw = (list: unknown[]) => list as { type: unknown; count: unknown }[];
    const loadPart = (list: unknown[]) => board0(migrateDocument(raw({ hardwareTypes: TYPES, boards: [part({ hardware: list })] }))).hardware;
    const loadDoc = (list: unknown[]) => migrateDocument(raw({ hardwareTypes: TYPES, hardware: list })).hardware;
    const loadShape = (list: unknown[]) =>
      (migrateDocument(raw({ hardwareTypes: TYPES, shapes: [{ ...createBoard({ id: 's1' }), hardware: list }], boards: [users('u1'), users('u2')] })).shapes[0] as Shape).hardware;
    for (const [where, load] of [['part', loadPart], ['document', loadDoc], ['shape', loadShape]] as const) {
      describe(where, () => {
        it.each([['count 0', 0], ['count 1.5', 1.5], ['count 1000', 1000]])('drops %s', (_n, count) =>
          expect(load(hw([{ type: 'h1', count }]))).toEqual([]));
        it('drops a numeric type and an unknown type', () => expect(load(hw([{ type: 7, count: 1 }, { type: 'zz', count: 1 }]))).toEqual([]));
        it('keeps count 999', () => expect(load(hw([{ type: 'h1', count: 999 }]))).toEqual([{ type: 'h1', count: 999 }]));
        it('first entry per type wins', () => expect(load(hw([{ type: 'h1', count: 2 }, { type: 'h1', count: 7 }]))).toEqual([{ type: 'h1', count: 2 }]));
        it('sorts by type', () =>
          expect(load(hw([{ type: 'h2', count: 1 }, { type: 'h1', count: 1 }]))).toEqual([{ type: 'h1', count: 1 }, { type: 'h2', count: 1 }]));
      });
    }
    it('an entry naming a type this file lacks is dropped (types validate before entries)', () =>
      expect(board0(migrateDocument(raw({ hardwareTypes: [], boards: [part({ hardware: [{ type: 'h1', count: 1 }] })] }))).hardware).toEqual([]));
    it('an entry naming a type dropped as malformed is dropped too', () =>
      expect(board0(migrateDocument(raw({ hardwareTypes: [type({ packSize: 0 })], boards: [part({ hardware: [{ type: 'h1', count: 1 }] })] }))).hardware).toEqual([]));
  });

  it('refuses a v21 document', () => expect(() => migrateDocument(raw({ version: 21 }))).toThrow(DocumentError));
});
