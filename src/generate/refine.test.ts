import { describe, expect, it } from 'vitest';
import { KEEP_LINE, REFINE_MAX, detailFor, refineMessage, refineRefusal } from './refine';
import type { RefineSettings } from './refine';
import { limitLines } from './prompt';
import { designToDocument } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import { createDocument } from '../document/document';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const p = (name: string, i: number) => ({ name, role: '', material: 'pine', at: v(i * 2, 0, 0), size: v(1, 1, 1) });
const S: RefineSettings = { instruction: '  make it taller  ', width: 36, depth: null, height: null, detail: 'moderate' };
const D: GeneratedDesign = { name: 'T', parts: [p('A', 0)], assemblies: [] };

describe('refine', () => {
  it('builds the user turn: design JSON, instruction, keep line, limits', () => {
    expect(refineMessage(D, S)).toBe([
      'Here is the current design, in the same format you return:', JSON.stringify(D), '',
      'Change it as follows: make it taller', '', KEEP_LINE, '', 'Hard limits:', ...limitLines(S),
    ].join('\n'));
    expect(KEEP_LINE).toBe('Keep every part you are not asked to change exactly as it is: the same name, role, material, size and position. Keep assembly and placement names. Return the whole design.');
  });

  it('caps at Detailed', () => {
    expect(REFINE_MAX).toEqual({ distinct: 60, placed: 240 });
  });

  it('preselects the smallest detail the design fits, by distinct AND placed parts', () => {
    const loose = (n: number) => designToDocument({ name: 'T', parts: Array.from({ length: n }, (_, i) => p(`P${i}`, i)), assemblies: [] }).doc;
    expect(detailFor(loose(12))).toBe('simple');
    expect(detailFor(loose(13))).toBe('moderate');
    const stacked = designToDocument({ name: 'T', parts: [], assemblies: [{ name: 'A', parts: Array.from({ length: 12 }, (_, i) => p(`X${i}`, i)),
      placements: Array.from({ length: 5 }, (_, i) => ({ name: `C${i}`, at: v(0, i * 2, 0) })) }] }).doc;
    expect(detailFor(stacked)).toBe('moderate'); // 12 distinct fits Simple, 60 placed > 48 does not
  });

  it('says why a design is refused, or null', () => {
    expect(refineRefusal(createDocument('E'))).toBe('There is nothing to refine yet.');
    expect(refineRefusal(designToDocument(D).doc)).toBeNull();
  });
});
