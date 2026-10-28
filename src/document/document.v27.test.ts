import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, createDocument, migrateDocument } from './document';
import type { Board } from './types';
import { dovetailFaults } from './dovetails';

/** Schema 27 (half-blind dovetails spec §8): `lap` on a dovetail. No step; a malformed `lap` DROPS the entry, the part kept. */
describe('schema 27: Dovetail.lap (half-blind dovetails spec §8)', () => {
  const side = { id: 'b1', name: 'Side', length: 20, width: 6, thickness: 0.75, position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [] };
  const tails = { id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75 };
  const pins = { id: 'd2', dim: 'length', end: 'min', role: 'pins', count: 4, slope: 8, pin: 0.25, depth: 0.75, outside: 'min' };
  const at = (version: number, dovetails?: unknown) =>
    migrateDocument({ ...createDocument('T'), version, boards: [{ ...side, ...(dovetails === undefined ? {} : { dovetails }) }] });
  const dovetailsOf = (doc: { boards: unknown[] }) => (doc.boards[0] as Board).dovetails;

  it('this build writes 28', () => expect(CURRENT_VERSION).toBe(28));

  it('a v26 document with through dovetails loads as its v26 self: no lap key anywhere', () => {
    const doc = at(26, [tails, pins]);
    expect(doc).toEqual(at(27, [tails, pins]));
    expect(dovetailsOf(doc)).toEqual([pins, tails]);
    expect(JSON.stringify(doc)).not.toContain('lap');
  });

  it('a v27 part keeps a half-blind pair with lap 0.25, on both roles', () => {
    const pl = { ...pins, lap: 0.25 };
    const tl = { ...tails, lap: 0.25 };
    expect(dovetailsOf(at(27, [tl, pl]))).toEqual([pl, tl]);
    expect(dovetailsOf(at(27, [pl]))).toEqual([pl]);
  });

  it('drops the entry and keeps the part for lap 0, -1, NaN, a string', () => {
    for (const lap of [0, -1, NaN, '0.25', Infinity, null]) {
      const doc = at(27, [{ ...pins, lap }]);
      expect(doc.boards, String(lap)).toHaveLength(1);
      expect('dovetails' in doc.boards[0]!, String(lap)).toBe(false);
    }
    expect(dovetailsOf(at(27, [{ ...pins, lap: 0 }, tails]))).toEqual([tails]);
  });

  it('keeps a well-formed faulted lap (2 on a 0.75 pins part); dovetailFaults lists lap', () => {
    const kept = dovetailsOf(at(27, [{ ...pins, lap: 2 }]))!;
    expect(kept).toEqual([{ ...pins, lap: 2 }]);
    const part = migrateDocument({ ...createDocument('T'), version: 27, boards: [{ ...side, dovetails: [{ ...pins, lap: 2 }] }] }).boards[0] as Board;
    expect(dovetailFaults(part, kept[0]!)).toContain('lap');
  });

  it('a version 29 document is refused', () => {
    expect(() => at(29, [pins])).toThrow(/newer version/);
  });
});
