import { describe, expect, it } from 'vitest';
import { hardwareFieldValid, hardwareRowRefusal, initialHardwareRows, newHardwareRow, planHardwareTypes, rebaseHardwareRows } from './hardwareTypesDraft';
import { HARDWARE_PRESETS } from '../document/hardwareModel';
import type { HardwareType } from '../document/types';

const hinge: HardwareType = { id: 'h', name: 'Hinge', packSize: 2, pricePerPack: 3.5 };
const screws: HardwareType = { id: 's', name: 'Screw', packSize: 100, pricePerPack: null };
const original = [hinge, screws];
const preset = (name: string) => HARDWARE_PRESETS.find((p) => p.name === name)!;
const none = { usedBy: () => 0 };

describe('the Hardware section (hardware spec §5.2)', () => {
  it('unchanged rows plan nothing', () => expect(planHardwareTypes(initialHardwareRows(original), original, none)).toBeNull());
  it('presets prefill name and pack size, price empty', () => {
    const rows = initialHardwareRows([]);
    for (const [name, size] of [['Screw', '100'], ['Shelf pin', '20'], ['Dowel', '50']] as const) {
      const r = newHardwareRow(preset(name), rows);
      expect(r.draft).toEqual({ name, packSize: size, pricePerPack: '' });
      expect(r.original).toBeNull();
    }
    const plan = planHardwareTypes([newHardwareRow(preset('Dowel'), rows)], [], none) as HardwareType[];
    expect(plan).toEqual([{ id: expect.any(String), name: 'Dowel', packSize: 50, pricePerPack: null }]);
  });
  it('two Hinge presets take the local free-name rule', () => {
    const a = newHardwareRow(preset('Hinge'), []);
    const b = newHardwareRow(preset('Hinge'), [a]);
    const c = newHardwareRow(preset('Hinge'), [a, b]);
    expect([a.draft.name, b.draft.name, c.draft.name]).toEqual(['Hinge', 'Hinge 2', 'Hinge 3']);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });
  it('a deleted row frees its name', () => {
    const rows = initialHardwareRows(original).map((r) => (r.id === 'h' ? { ...r, deleted: true } : r));
    expect(newHardwareRow(preset('Hinge'), rows).draft.name).toBe('Hinge');
  });
  it('pack size must be a whole number 1..10000', () => {
    const rows = initialHardwareRows(original);
    for (const v of ['0', '1.5', '10001', '', 'abc', '-3']) {
      const r = { ...rows[0]!, draft: { ...rows[0]!.draft, packSize: v } };
      expect(hardwareRowRefusal(r, rows, none)).toBe('Pack size must be a whole number from 1 to 10000.');
      expect(hardwareFieldValid(r, 'packSize')).toBe(false);
    }
    for (const v of ['1', '10000', ' 12 ']) {
      const r = { ...rows[0]!, draft: { ...rows[0]!.draft, packSize: v } };
      expect(hardwareRowRefusal(r, rows, none)).toBeNull();
    }
  });
  it('price: negative refused, empty is null', () => {
    const rows = initialHardwareRows(original);
    const edit = (price: string) => rows.map((r) => (r.id === 'h' ? { ...r, draft: { ...r.draft, pricePerPack: price } } : r));
    expect(hardwareRowRefusal(edit('-1')[0]!, edit('-1'), none)).toBe('Price must be dollars or empty.');
    expect(hardwareFieldValid(edit('-1')[0]!, 'pricePerPack')).toBe(false);
    expect(planHardwareTypes(edit(''), original, none)).toEqual([{ ...hinge, pricePerPack: null }, screws]);
    expect(planHardwareTypes(edit('4.25'), original, none)).toEqual([{ ...hinge, pricePerPack: 4.25 }, screws]);
  });
  it('a name is required and unique, refused only when one side was typed', () => {
    const rows = initialHardwareRows(original);
    const typed = rows.map((r) => (r.id === 's' ? { ...r, draft: { ...r.draft, name: 'hinge' } } : r));
    expect(hardwareRowRefusal(typed[1]!, typed, none)).toBe('Another hardware type is called "Hinge".');
    expect(hardwareRowRefusal(typed[0]!, typed, none)).toBe('Another hardware type is called "hinge".');
    const blank = rows.map((r) => (r.id === 's' ? { ...r, draft: { ...r.draft, name: ' ' } } : r));
    expect(hardwareRowRefusal(blank[1]!, blank, none)).toBe('Give the hardware type a name.');
    // An imported clash left untouched does not block a Save.
    const imported = [hinge, { ...screws, name: 'hinge' }];
    expect(planHardwareTypes(initialHardwareRows(imported), imported, none)).toBeNull();
  });
  it('names are keyed after cleanName: A\u203aB and A>B clash when one side was typed', () => {
    const orig = [{ ...hinge, name: 'A>B' }, screws];
    const rows = initialHardwareRows(orig).map((r) => (r.id === 's' ? { ...r, draft: { ...r.draft, name: 'a\u203ab' } } : r));
    expect(hardwareRowRefusal(rows[1]!, rows, none)).toBe('Another hardware type is called "A>B".');
    expect(hardwareRowRefusal(rows[0]!, rows, none)).toBe('Another hardware type is called "a\u203ab".');
    expect(planHardwareTypes(rows, orig, none)).toEqual({ refused: expect.stringContaining('Another hardware type') });
  });
  it('delete refused for assembly and project use; an unused type deletes', () => {
    const rows = initialHardwareRows(original).map((r) => ({ ...r, deleted: true }));
    const ctx = { usedBy: (id: string) => (id === 'h' ? 3 : 0) };
    expect(hardwareRowRefusal(rows[0]!, rows, ctx)).toBe('Used by 3 — remove it from them first.');
    expect(hardwareRowRefusal(rows[1]!, rows, ctx)).toBeNull();
    const only = initialHardwareRows(original).map((r) => (r.id === 's' ? { ...r, deleted: true } : r));
    expect(planHardwareTypes(only, original, ctx)).toEqual([hinge]);
    expect(planHardwareTypes(rows, original, ctx)).toEqual({ refused: 'Used by 3 — remove it from them first.' });
  });
  it('a new row with the same name as a typed edit is refused', () => {
    const rows = initialHardwareRows(original);
    const added = { ...newHardwareRow(preset('Other'), rows), draft: { name: 'Screw', packSize: '1', pricePerPack: '' } };
    expect(planHardwareTypes([...rows, added], original, none)).toEqual({ refused: 'Another hardware type is called "Screw".' });
  });
  it('rebase: stored rows take the stored type, an unsaved new row the project now holds becomes stored', () => {
    const added = newHardwareRow(preset('Knob'), initialHardwareRows(original));
    const rows = [...initialHardwareRows(original), added];
    const stored: HardwareType = { id: added.id, name: 'Knob', packSize: 1, pricePerPack: null };
    const next = rebaseHardwareRows(rows, [hinge, stored]);
    expect(next.map((r) => r.id)).toEqual(['h', added.id]);
    expect(next[1]!.original).toEqual(stored);
  });
});
