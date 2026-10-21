import { describe, expect, it } from 'vitest';
import { canonicalHardware, mergeHardware, sameHardware, withHardwareTypes, withHardwareUse } from './hardwareModel';
import { createBoard, createDocument } from './document';
import { sameShared } from './links';
import type { HardwareType } from './types';

describe('hardwareModel', () => {
  it('canonicalHardware keeps the first entry per type, sorted', () => {
    expect(canonicalHardware([{ type: 'b', count: 2 }, { type: 'a', count: 1 }, { type: 'b', count: 5 }])).toEqual([{ type: 'a', count: 1 }, { type: 'b', count: 2 }]);
  });
  it('withHardwareUse sets and removes', () => {
    expect(withHardwareUse([], 'x', 3)).toEqual([{ type: 'x', count: 3 }]);
    expect(withHardwareUse([{ type: 'x', count: 3 }], 'x', null)).toEqual([]);
  });
  it('mergeHardware adds per type and refuses past the bound', () => {
    expect(mergeHardware([{ type: 'a', count: 2 }], [{ type: 'a', count: 3 }, { type: 'b', count: 1 }])).toEqual([{ type: 'a', count: 5 }, { type: 'b', count: 1 }]);
    expect(mergeHardware([{ type: 'a', count: 500 }], [{ type: 'a', count: 500 }])).toBeNull();
    expect(mergeHardware([{ type: 'a', count: 499 }], [{ type: 'a', count: 500 }])).toEqual([{ type: 'a', count: 999 }]);
  });
  it('sameHardware compares count and order', () => {
    expect(sameHardware([{ type: 'a', count: 1 }], [{ type: 'a', count: 2 }])).toBe(false);
    expect(sameHardware([{ type: 'a', count: 1 }, { type: 'b', count: 1 }], [{ type: 'b', count: 1 }, { type: 'a', count: 1 }])).toBe(false);
    expect(sameHardware([{ type: 'a', count: 1 }, { type: 'b', count: 1 }], [{ type: 'a', count: 1 }, { type: 'b', count: 1 }])).toBe(true);
  });
  it('withHardwareTypes returns the same doc when nothing changed', () => {
    const t: HardwareType = { id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: 2 };
    const doc = { ...createDocument(), hardwareTypes: [t] };
    expect(withHardwareTypes(doc, undefined)).toBe(doc);
    expect(withHardwareTypes(doc, doc.hardwareTypes.map((x) => ({ ...x })))).toBe(doc);
    const changed = withHardwareTypes(doc, [{ ...t, pricePerPack: 3 }]);
    expect(changed).not.toBe(doc);
    expect(changed.hardwareTypes[0]!.pricePerPack).toBe(3);
  });
  it('sameShared sees hardware', () => {
    expect(sameShared(createBoard(), createBoard({ hardware: [{ type: 'a', count: 1 }] }))).toBe(false);
    expect(sameShared(createBoard(), createBoard())).toBe(true);
  });
});
