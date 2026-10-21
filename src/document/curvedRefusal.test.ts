import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument } from './document';
import { curvedParts, curvedRefusal } from './curvedRefusal';
import { joineryRefusal } from '../generate/joints/tapers';
import { ARCH } from './curveFixtures';

const pin = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
const doc = (n: number) => ({ ...createDocument('T'), boards: Array.from({ length: 5 }, (_, i) => createBoard({ id: `b${i}`, name: `Apron ${i + 1}`, curves: i < n ? [ARCH] : [] })) });

describe('curvedRefusal (curves spec §7)', () => {
  it('null without curves', () => {
    expect(curvedRefusal(flatDocument(doc(0)), 'joinery')).toBeNull();
  });
  it('names the curved parts, three and an ellipsis at most', () => {
    expect(curvedParts(flatDocument(doc(2)))).toEqual(['Apron 1', 'Apron 2']);
    expect(curvedRefusal(flatDocument(doc(4)), 'joinery')).toContain('(Apron 1, Apron 2, Apron 3…)');
    expect(curvedRefusal(flatDocument(doc(1)), 'refine')).toMatch(/^Refine /);
  });
  it('a part with both holes and curves: the curves refusal is the joinery refusal (holes no longer refuse)', () => {
    const d = { ...createDocument('T'), boards: [createBoard({ id: 'b0', name: 'Apron 1', curves: [ARCH], holes: [pin] })] };
    expect(curvedRefusal(flatDocument(d), 'joinery')).not.toBeNull();
    expect(joineryRefusal(d)).toContain('with curves');
  });
});
