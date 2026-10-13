import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { angledParts, angledRefusal } from './angledRefusal';

const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.5], [20, 0]] as [[number, number], [number, number]] };

describe('angledRefusal (spec §6)', () => {
  const doc = (n: number) => ({ ...createDocument('T'), boards: [
    createBoard({ id: 'apron', name: 'Apron' }),
    ...Array.from({ length: n }, (_, i) => createBoard({ id: `l${i}`, name: `Leg ${i + 1}`, angleCuts: [taper] })),
  ] });
  it('is null without angle cuts', () => {
    expect(angledRefusal(doc(0), 'refine')).toBeNull();
  });
  it('names the angled parts, three at most', () => {
    expect(angledParts(doc(4))).toEqual(['Leg 1', 'Leg 2', 'Leg 3', 'Leg 4']);
    expect(angledRefusal(doc(1), 'refine')).toBeNull();
  });
});

const miter = { ...taper, id: 'm1', kind: 'miter' as const };
const withCut = (cut: typeof taper | typeof miter, n = 1) => ({ ...createDocument('T'), boards: [
  createBoard({ id: 'apron', name: 'Apron' }),
  ...Array.from({ length: n }, (_, i) => createBoard({ id: `f${i}`, name: `Frame ${i + 1}`, angleCuts: [cut] })),
] });

describe('angledRefusal — tapers are joinable (AI-tapers spec §4.3)', () => {
  it('angledParts can allow tapers', () => {
    expect(angledParts(withCut(taper), ['taper'])).toEqual([]);
  });
  it('Refine allows tapers', () => {
    expect(angledRefusal(withCut(taper), 'refine')).toBeNull();
  });
  it('Refine refuses a miter, naming the parts', () => {
    expect(angledRefusal(withCut(miter, 4), 'refine')).toBe(
      "Refine doesn't handle mitered, beveled or chamfered parts yet (Frame 1, Frame 2, Frame 3…). Refine before cutting those angles, or remove them.");
  });
});
