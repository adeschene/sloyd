import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, createDocument, migrateDocument } from './document';
import { DESIGN_SCHEMA } from './generated';
import { MATERIALS, type Board } from './types';

/** Schema 28 (weight spec §3.3–3.4): `density` on a custom material. No step; a malformed density DROPS THE FIELD, the material kept. */
describe('schema 28: CustomMaterial.density (weight spec §3)', () => {
  const ash = { id: 'm-s-ash00001', label: 'Ash', color: '#d8c8a0', kind: 'solid' };
  const ply = { id: 'm-v-bb000001', label: 'Baltic birch', color: '#e0caa0', kind: 'sheet-veneered', sheet: { length: 60, width: 60 } };
  const part = (material: string) => ({ id: 'b1', name: 'Side', length: 20, width: 6, thickness: 0.75, position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length', material, cuts: [], angleCuts: [], holes: [] });
  const at = (version: number, m: object) => migrateDocument({ ...createDocument('T'), version, materials: [m], boards: [part((m as { id: string }).id)] });

  it('this build writes 28', () => expect(CURRENT_VERSION).toBe(28));

  it('a v27 document loads as its v27 self: no density key anywhere', () => {
    const doc = at(27, ash);
    expect(doc).toEqual(at(28, ash));
    expect(JSON.stringify(doc)).not.toContain('density');
  });

  it('keeps a legal density on a solid and on a sheet', () => {
    expect(at(28, { ...ash, density: 40 }).materials[0]!.density).toBe(40);
    expect(at(28, { ...ply, density: 36 }).materials[0]!.density).toBe(36);
  });

  it('drops a malformed density and KEEPS the material (its part is not turned to pine)', () => {
    for (const density of [0, -1, NaN, Infinity, 151, '40', null]) {
      const doc = at(28, { ...ash, density });
      expect(doc.materials, String(density)).toHaveLength(1);
      expect('density' in doc.materials[0]!, String(density)).toBe(false);
      expect((doc.boards[0] as Board).material, String(density)).toBe(ash.id);
    }
  });

  it('refuses a v29 file', () => {
    expect(() => migrateDocument({ ...createDocument('T'), version: 29 })).toThrow(/newer version/);
  });

  it("Generate's design schema and the material keys and labels are byte-identical (inv 49)", () => {
    expect(createHash('sha256').update(JSON.stringify(DESIGN_SCHEMA)).digest('hex'))
      .toBe('31a2761fa006a39a1a1f75bd8927073cac5874bd5531538928549f96456caaba');
    expect(Object.entries(MATERIALS).map(([k, m]) => [k, m.label])).toEqual(
      [['pine', 'Pine'], ['oak', 'Oak'], ['maple', 'Maple'], ['walnut', 'Walnut'], ['cherry', 'Cherry'], ['plywood', 'Plywood'], ['mdf', 'MDF']]);
  });
});
