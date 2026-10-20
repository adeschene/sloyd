import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_MATERIAL_IDS, builtInCatalog, catalogOf, materialUses, mintMaterialId, pruneMaterials,
  sameMaterial, upsertMaterials, validateCustomMaterial, validateCustomMaterials,
} from './materials';
import { MATERIALS, isSheetGood, materialKind, isCustomMaterialId, type CustomMaterial } from './types';
import { createBoard, createDocument } from './document';

const ash: CustomMaterial = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' };
const birch: CustomMaterial = { id: 'm-v-bb55', label: 'Baltic birch 5×5', color: '#e8d8b8', kind: 'sheet-veneered', sheet: { length: 60, width: 60 } };
const hardboard: CustomMaterial = { id: 'm-p-hb48', label: 'Hardboard', color: '#7a5a3a', kind: 'sheet-plain', sheet: { length: 96, width: 48 } };

describe('material kinds come from the id', () => {
  it('reads built-ins off MATERIALS and customs off the id letter', () => {
    expect(materialKind('pine')).toBe('solid');
    expect(materialKind('plywood')).toBe('sheet-veneered');
    expect(materialKind('mdf')).toBe('sheet-plain');
    expect(materialKind('m-s-ash1')).toBe('solid');
    expect(materialKind('m-v-bb55')).toBe('sheet-veneered');
    expect(materialKind('m-p-hb48')).toBe('sheet-plain');
    expect(materialKind('nonsense')).toBe('solid');
    expect(isSheetGood('m-v-bb55')).toBe(true);
    expect(isSheetGood('m-s-ash1')).toBe(false);
  });
  it('rejects ids that are not the custom shape', () => {
    for (const id of ['pine', 'm-x-abcd', 'm-s-ab', 'm-s-ABCD', 'm-s-ab/cd', `m-s-${'a'.repeat(33)}`]) {
      expect(isCustomMaterialId(id)).toBe(false);
    }
  });
  it('mints the kind letter and never a taken id', () => {
    const seq = [0.123456789, 0.123456789, 0.987654321];
    const id = mintMaterialId('sheet-plain', new Set([mintMaterialId('sheet-plain', new Set(), () => 0.123456789)]), () => seq.shift()!);
    expect(id).toMatch(/^m-p-[a-z0-9]{4,32}$/);
    expect(id).not.toBe(mintMaterialId('sheet-plain', new Set(), () => 0.123456789));
  });
});

describe('validateCustomMaterial', () => {
  it('keeps a good entry, trimming the label and lower-casing the colour', () => {
    expect(validateCustomMaterial({ ...ash, label: '  Ash ', color: '#D8C8A8' })).toEqual(ash);
    expect(validateCustomMaterial(birch)).toEqual(birch);
  });
  it.each([
    ['not an object', 'ash'],
    ['no id', { ...ash, id: undefined }],
    ['a built-in key as id', { ...ash, id: 'pine' }],
    ['a slash in the id', { ...ash, id: 'm-s-a/b1' }],
    ['kind disagrees with the id', { ...ash, kind: 'sheet-plain' }],
    ['empty label', { ...ash, label: '   ' }],
    ['bad colour', { ...ash, color: 'red' }],
    ['sheet kind without a size', { ...birch, sheet: undefined }],
    ['sheet size not positive', { ...birch, sheet: { length: 0, width: 60 } }],
  ])('drops %s', (_, raw) => {
    expect(validateCustomMaterial(raw)).toBeNull();
  });
  it('normalises fields that do not belong to the kind, keeping the entry', () => {
    expect(validateCustomMaterial({ ...birch, nominal: true })).toEqual(birch);
    expect(validateCustomMaterial({ ...ash, sheet: { length: 96, width: 48 } })).toEqual(ash);
    expect(validateCustomMaterial({ ...ash, nominal: true })).toEqual({ ...ash, nominal: true });
    expect(validateCustomMaterial({ ...ash, nominal: 'yes' })).toEqual(ash);
  });
  it('keeps the FIRST of a duplicate id and drops a non-array', () => {
    expect(validateCustomMaterials([ash, { ...ash, label: 'Other' }, birch])).toEqual([ash, birch]);
    expect(validateCustomMaterials('nope')).toEqual([]);
  });
});

describe('the catalog', () => {
  it('lists the built-ins in MATERIALS order, then the document materials', () => {
    expect(builtInCatalog().ids).toEqual(Object.keys(MATERIALS));
    expect(catalogOf({ materials: [ash, birch] }).ids).toEqual([...Object.keys(MATERIALS), 'm-s-ash1', 'm-v-bb55']);
  });
  it('gives a custom sheet its rotate rule from its kind', () => {
    const c = catalogOf({ materials: [birch, hardboard] });
    expect(c.get('m-v-bb55')!.sheet).toEqual({ length: 60, width: 60, rotate: 'grain' });
    expect(c.get('m-p-hb48')!.sheet).toEqual({ length: 96, width: 48, rotate: 'free' });
    expect(c.get('plywood')!.builtIn).toBe(true);
    expect(c.get('m-v-bb55')!.builtIn).toBe(false);
  });
  it('labels an unknown id with the raw id and colours it as pine', () => {
    const c = builtInCatalog();
    expect(c.label('m-s-gone')).toBe('m-s-gone');
    expect(c.color('m-s-gone')).toBe(MATERIALS.pine!.color);
  });
  it('is memoised on the materials array identity', () => {
    const materials = [ash];
    expect(catalogOf({ materials })).toBe(catalogOf({ materials }));
    expect(catalogOf({ materials: [ash] })).not.toBe(catalogOf({ materials }));
  });
  it('never lets a custom entry shadow a built-in', () => {
    expect(BUILT_IN_MATERIAL_IDS.has('pine')).toBe(true);
    expect(catalogOf({ materials: [{ ...ash, id: 'pine' } as CustomMaterial] }).label('pine')).toBe('Pine');
  });
});

describe('uses, pruning and upserts', () => {
  const docWith = (boardMaterials: string[], materials: CustomMaterial[]) => ({
    ...createDocument(),
    boards: boardMaterials.map((m, i) => createBoard({ id: `b${i}`, name: `P${i}`, material: m })),
    materials,
  });
  it('reads uses from plain parts, definition parts and shapes', () => {
    const d = docWith(['m-s-ash1'], [ash, birch, hardboard]);
    const withDef = { ...d, definitions: [{ id: 'd1', boards: [createBoard({ id: 'q', material: 'm-v-bb55' })], instances: [], hardware: [] }] };
    const shape = { ...createBoard({ material: 'm-p-hb48' }), id: 's1' };
    const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = shape;
    const withShape = { ...withDef, shapes: [{ ...shared, id: 's1' }] };
    expect(materialUses(withShape)).toEqual(new Set(['m-s-ash1', 'm-v-bb55', 'm-p-hb48']));
  });
  it('prunes unused materials and returns the SAME object when nothing is unused', () => {
    const d = docWith(['m-s-ash1'], [ash, birch]);
    expect(pruneMaterials(d).materials).toEqual([ash]);
    const kept = docWith(['m-s-ash1'], [ash]);
    expect(pruneMaterials(kept)).toBe(kept);
  });
  it('upserts by id, appending new ones and returning the SAME object when nothing changes', () => {
    const d = docWith([], [ash]);
    expect(upsertMaterials(d, [ash])).toBe(d);
    expect(upsertMaterials(d, [{ ...ash, color: '#000000' }]).materials).toEqual([{ ...ash, color: '#000000' }]);
    expect(upsertMaterials(d, [birch]).materials).toEqual([ash, birch]);
  });
  it('compares materials field by field', () => {
    expect(sameMaterial(ash, { ...ash })).toBe(true);
    expect(sameMaterial(birch, { ...birch, sheet: { length: 60, width: 61 } })).toBe(false);
    expect(sameMaterial(ash, { ...ash, nominal: true })).toBe(false);
  });
});

it('pine is the one nominal built-in', () => {
  expect(builtInCatalog().ids.filter((id) => builtInCatalog().get(id)!.nominal)).toEqual(['pine']);
});
