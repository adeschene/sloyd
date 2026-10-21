import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument } from './document';
import { holedParts, holedRefusal } from './holedRefusal';

const pin = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
const doc = (n: number) => ({ ...createDocument('T'), boards: Array.from({ length: 5 }, (_, i) => createBoard({ id: `b${i}`, name: `Side ${i + 1}`, holes: i < n ? [pin] : [] })) });

describe('holedRefusal (spec §6)', () => {
  it('null without holes', () => {
    expect(holedRefusal(flatDocument(doc(0)), 'refine')).toBeNull();
  });
  it('names the holed parts, three and an ellipsis at most', () => {
    expect(holedParts(flatDocument(doc(2)))).toEqual(['Side 1', 'Side 2']);
    expect(holedRefusal(flatDocument(doc(4)), 'refine')).toContain('(Side 1, Side 2, Side 3…)');
    expect(holedRefusal(flatDocument(doc(1)), 'refine')).toMatch(/^Refine /);
  });
});
