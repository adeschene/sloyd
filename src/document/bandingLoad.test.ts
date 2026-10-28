import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, DocumentError, createBoard, createDocument, migrateDocument } from './document';
import { BUILT_IN_BAND } from './bandModel';
import type { Board } from './types';

const raw = (over: object) => JSON.parse(JSON.stringify({ ...createDocument('T'), version: 19, ...over }));
const part = (over: object = {}) => ({ ...createBoard({ id: 'b1', name: 'Shelf', length: 30, width: 11, thickness: 0.75, material: 'plywood' }), ...over });
const maple = { id: 'e1', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const board0 = (d: ReturnType<typeof migrateDocument>) => d.boards[0] as Board;
const W0 = { across: 'width', from: 'min' } as const;
const L1 = { across: 'length', from: 'max' } as const;

describe('loading schema 19 (edge banding spec §2.3)', () => {
  it('this build writes 28', () => expect(CURRENT_VERSION).toBe(29));
  it('a v18 file loads with the built-in band type and no bands', () => {
    const d = migrateDocument({ ...raw({ boards: [part()] }), version: 18, bandTypes: undefined });
    expect(d.bandTypes).toEqual([BUILT_IN_BAND]);
    expect(board0(d).bands).toEqual([]);
    expect(board0(d).cornerRule).toBe('long');
  });
  it('band types round-trip; the built-in is re-added FIRST when absent', () => {
    const d = migrateDocument(raw({ bandTypes: [maple], boards: [part()] }));
    expect(d.bandTypes).toEqual([BUILT_IN_BAND, maple]);
  });
  it('an edited built-in keeps its edits', () => {
    const edited = { ...BUILT_IN_BAND, pricePerFoot: 0.3, tapeWidth: 15 / 16 };
    expect(migrateDocument(raw({ bandTypes: [edited] })).bandTypes).toEqual([edited]);
  });
  it('malformed band types are dropped', () => {
    const bad = [
      { ...maple, id: 'a', thickness: -1 }, { ...maple, id: 'b', thickness: Number.NaN }, { ...maple, id: 'c', thickness: 0 },
      { ...maple, id: 'd', lengthAllowance: -0.1 }, { ...BUILT_IN_BAND, id: 'e', tapeWidth: 0 },
      { ...BUILT_IN_BAND, id: 'f', pricePerFoot: -2 }, { ...maple, id: 'g', name: '' }, { ...maple, id: 'h', widthAllowance: 'x' },
    ];
    expect(migrateDocument(raw({ bandTypes: [...bad, maple] })).bandTypes.map((t) => t.id)).toEqual(['band-iron-on', 'e1']);
  });
  it('a tape type with NO pricePerFoot key loads unpriced (null); a present invalid price still drops it (final review 4)', () => {
    const { pricePerFoot: _omit, ...noPrice } = { ...BUILT_IN_BAND, id: 'tp', name: 'PVC' };
    const d = migrateDocument(raw({ bandTypes: [noPrice, { ...BUILT_IN_BAND, id: 'tq', name: 'Bad', pricePerFoot: 'x' }] }));
    expect(d.bandTypes.map((t) => t.id)).toEqual(['band-iron-on', 'tp']);
    const tp = d.bandTypes[1]!;
    expect('pricePerFoot' in tp).toBe(true);
    expect(tp.kind === 'tape' ? tp.pricePerFoot : 'not tape').toBeNull();
  });
  it('an unknown kind string refuses the document', () => {
    const r = raw({ bandTypes: [{ ...maple, kind: 'pvc' }] });
    expect(() => migrateDocument(r)).toThrow(DocumentError);
    expect(() => migrateDocument(r)).toThrow('This project has an edge band this version of Sloyd can\'t use (kind "pvc") — it was saved by a newer version of Sloyd.');
  });
  it('a solid band type naming no solid material falls back to pine; a sheet material is not solid', () => {
    const d = migrateDocument(raw({ bandTypes: [{ ...maple, id: 'x', material: 'unobtainium' }, { ...maple, id: 'y', material: 'plywood' }] }));
    expect(d.bandTypes.map((t) => (t.kind === 'solid' ? t.material : null))).toEqual([null, 'pine', 'pine']);
  });
  it('duplicate ids: the first keeps its id, the later is re-minted; duplicate names are deduped', () => {
    const d = migrateDocument(raw({ bandTypes: [maple, { ...maple }] }));
    expect(d.bandTypes[1]!.id).toBe('e1');
    expect(d.bandTypes[2]!.id).not.toBe('e1');
    expect(d.bandTypes[2]!.name).not.toBe('Maple edging');
  });
  it('bands load in canonical order; malformed, dangling and repeated-side bands are dropped', () => {
    const bands = [
      { side: L1, type: 'e1' }, { side: W0, type: 'band-iron-on' },
      { side: { across: 'thickness', from: 'min' }, type: 'e1' }, { side: W0, type: 'e1' },
      { side: { across: 'width', from: 'max' }, type: 'missing' }, { side: L1 }, 'junk',
    ];
    const d = migrateDocument(raw({ bandTypes: [maple], boards: [part({ bands, cornerRule: 'mitre' })] }));
    expect(board0(d).bands).toEqual([{ side: W0, type: 'band-iron-on' }, { side: L1, type: 'e1' }]);
    expect(board0(d).cornerRule).toBe('mitre');
  });
  it('an unknown corner rule reads as long', () => {
    expect(board0(migrateDocument(raw({ boards: [part({ cornerRule: 'sideways' })] }))).cornerRule).toBe('long');
  });
  it('a shape carries bands too', () => {
    const shape = { id: 's1', length: 30, width: 11, thickness: 0.75, material: 'plywood', grain: 'length', posture: 'flat', cuts: [], angleCuts: [],
      holes: [], curves: [], profiles: [], bands: [{ side: W0, type: 'band-iron-on' }], cornerRule: 'long', hardware: [] };
    const d = migrateDocument(raw({ shapes: [shape], boards: [
      { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b', name: 'B', position: [0, 0, 20], rotation: 0, shape: 's1' }] }));
    expect(d.shapes[0]!.bands).toEqual([{ side: W0, type: 'band-iron-on' }]);
  });
  it('a custom material used only by a band type is kept (inv 49, amended)', () => {
    const wenge = { id: 'm-s-wenge', kind: 'solid', label: 'Wenge', color: '#3a2a20' };
    const d = migrateDocument(raw({ materials: [wenge], bandTypes: [{ ...maple, material: 'm-s-wenge' }], boards: [part()] }));
    expect(d.materials.map((m) => m.id)).toEqual(['m-s-wenge']);
    expect(d.bandTypes[1]).toMatchObject({ material: 'm-s-wenge' });
  });
  it('a v30 file is refused by the version gate', () => {
    expect(() => migrateDocument({ ...raw({}), version: 30 })).toThrow(/newer version/);
  });
});
