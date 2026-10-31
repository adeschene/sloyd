import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, createDocument, migrateDocument } from './document';
import type { Board } from './types';
import { DOVETAIL_COUNT_MAX } from './dovetailModel';

const BEFORE = '{"version":25,"name":"T","units":{"display":"imperial-fractional","precision":16},"stock":{"kerf":0.125},"guides":[],"boards":[{"id":"b1","name":"Side","position":[0,0,0],"rotation":0,"length":20,"width":6,"thickness":0.75,"posture":"flat","grain":"length","material":"oak","cuts":[],"angleCuts":[],"holes":[],"curves":[],"profiles":[],"bands":[],"cornerRule":"long","hardware":[]}],"instances":[],"definitions":[],"shapes":[],"materials":[],"bandTypes":[{"name":"Iron-on veneer","thickness":0,"lengthAllowance":0.5,"id":"band-iron-on","kind":"tape","tapeWidth":0.875,"pricePerFoot":null}],"hardwareTypes":[],"hardware":[]}';

/** Schema 26 (dovetails spec §3.4, §8): the stored dovetail. No upgrade step; a malformed entry is DROPPED, the part kept. */
describe('schema 26: the stored dovetail (dovetails spec §8)', () => {
  const side = { id: 'b1', name: 'Side', length: 20, width: 6, thickness: 0.75, position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [] };
  const tails = { id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75 };
  const pins = { id: 'd2', dim: 'length', end: 'min', role: 'pins', count: 4, slope: 8, pin: 0.25, depth: 0.75, outside: 'min' };
  const at = (version: number, dovetails?: unknown) =>
    migrateDocument({ ...createDocument('T'), version, boards: [{ ...side, ...(dovetails === undefined ? {} : { dovetails }) }] });
  const dovetailsOf = (doc: { boards: unknown[] }) => (doc.boards[0] as Board).dovetails;

  it('this build writes 33', () => expect(CURRENT_VERSION).toBe(33));

  it('a v25 document with no dovetails loads exactly as before, with no dovetails key', () => {
    const raw = { ...createDocument('T'), version: 25, boards: [side] };
    const doc = migrateDocument(raw);
    expect(doc).toEqual(migrateDocument({ ...raw, version: 26 }));
    // Byte for byte what the schema-25 build wrote (captured at e8ca93f), but the version.
    expect(JSON.stringify(doc)).toBe(BEFORE.replace('"version":25', '"version":33').replace('"guides":[],', '"guides":[],"views":[],"dimensions":[],'));
    expect('dovetails' in doc.boards[0]!).toBe(false);
    expect(JSON.stringify(doc)).not.toContain('dovetail');
  });

  it('a v26 part keeps a well-formed tails and pins entry, in canonical order', () => {
    expect(dovetailsOf(at(26, [tails, pins]))).toEqual([pins, tails]);
  });

  it('an empty or non-array dovetails field stores no key', () => {
    for (const v of [[], null, 'x', {}]) expect('dovetails' in at(26, v).boards[0]!, JSON.stringify(v)).toBe(false);
  });

  it('drops each malformed entry, keeps the part', () => {
    const { outside: _o, ...noOutside } = pins;
    const bad: unknown[] = [
      'x', null, 7,
      { ...tails, dim: 'thickness' }, { ...tails, end: 'mid' }, { ...tails, role: 'x' },
      { ...tails, count: 0 }, { ...tails, count: 2.5 }, { ...tails, count: '4' },
      { ...tails, slope: NaN }, { ...tails, slope: 0 }, { ...tails, pin: 0 }, { ...tails, pin: Infinity }, { ...tails, depth: -1 },
      noOutside, { ...pins, outside: 'top' },
    ];
    for (const d of bad) {
      const doc = at(26, [d]);
      expect(doc.boards, JSON.stringify(d)).toHaveLength(1);
      expect('dovetails' in doc.boards[0]!, JSON.stringify(d)).toBe(false);
    }
    // A bad entry beside a good one drops only itself.
    expect(dovetailsOf(at(26, [{ ...pins, pin: 0 }, tails]))).toEqual([tails]);
  });

  it('a count over DOVETAIL_COUNT_MAX (100) is dropped, the part kept; 100 itself is kept (final review)', () => {
    expect(DOVETAIL_COUNT_MAX).toBe(100);
    const over = at(26, [{ ...tails, count: 101 }]);
    expect(over.boards).toHaveLength(1);
    expect('dovetails' in over.boards[0]!).toBe(false);
    expect(dovetailsOf(at(26, [{ ...tails, count: 100 }]))).toEqual([{ ...tails, count: 100 }]);
    expect(dovetailsOf(at(26, [{ ...tails, count: 1e9 }, pins]))).toEqual([pins]);
  });

  it('a second entry for one (dim, end): the first wins', () => {
    expect(dovetailsOf(at(26, [tails, { ...tails, id: 'd9', count: 3 }]))).toEqual([tails]);
    // The same end of the other dim is a different (dim, end).
    const w = { ...tails, id: 'd9', dim: 'width' };
    expect(dovetailsOf(at(26, [tails, w]))).toEqual([tails, w]);
  });

  it('a tails entry\'s stray outside is dropped, the entry kept; stray keys go', () => {
    expect(dovetailsOf(at(26, [{ ...tails, outside: 'min', stray: 1 }]))).toEqual([tails]);
  });

  it('keeps a well-formed faulted entry (slope 1:20)', () => {
    expect(dovetailsOf(at(26, [{ ...tails, slope: 20 }]))).toEqual([{ ...tails, slope: 20 }]);
  });

  it('re-mints an id holding / and a duplicate id; ids are scoped per board', () => {
    const [a, b] = dovetailsOf(at(26, [{ ...pins, id: 'x/y' }, { ...tails, id: 'd2' }]))!;
    expect(a!.id).not.toBe('x/y');
    expect(a!.id).not.toContain('/');
    expect(b!.id).toBe('d2');
    const [c, d] = dovetailsOf(at(26, [pins, { ...tails, id: 'd2' }]))!;
    expect(c!.id).toBe('d2');
    expect(d!.id).not.toBe('d2');
  });

  it('a version 34 document is refused', () => {
    expect(() => at(34, [tails])).toThrow(/newer version/);
  });

  it('a Shape keeps its dovetails; its users resolve with copies', () => {
    const { id: _id, name: _n, position: _p, rotation: _r, ...shared } = side;
    const doc = migrateDocument({
      ...createDocument('T'), version: 26,
      shapes: [{ id: 's1', ...shared, dovetails: [tails] }],
      boards: [{ id: 'u1', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'u2', name: 'B', position: [0, 0, 10], rotation: 0, shape: 's1' }],
    });
    expect(doc.shapes[0]!.dovetails).toEqual([tails]);
    expect(doc.boards.map((b) => 'dovetails' in b)).toEqual([false, false]);
  });
});
