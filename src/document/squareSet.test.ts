import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, DocumentError, createDocument, migrateDocument } from './document';
import { angleCutValues, copyAngleCut, mirrorAngleCut, sameAngleCut } from './angleCuts';
import { sortAngleCuts } from './angleWorld';
import { leanFlip } from './lean';
import { sameShared } from './links';
import { mapWorld, writeBackFlat } from './treeEdit';
import { flatDocument, partAt, worldParts } from './tree';
import type { AngleCut, Board, Lean, SloydDocument } from './types';

// Square-set legs spec §3.1, §3.4 (schema 25): `Lean.square?: true` and `AngleCut.across?: { rise; from }`.

/** An end miter at the length's min end, along thickness; through is width. */
const MITER: AngleCut = { id: 'a1', kind: 'miter', face: 'length', from: 'min', along: 'thickness', alongFrom: 'min', points: [[0, 0.25], [1.5, 0]] };
const COMPOUND: AngleCut = { ...MITER, across: { rise: 0.125, from: 'min' } };
const SQUARE: Lean = { x: 0.1, z: 0.25, face: 'thickness', square: true };

const leg = { id: 'b1', name: 'Leg', length: 17, width: 1.5, thickness: 1.5, position: [0, 0, 0], rotation: 0, posture: 'upright', grain: 'length', material: 'oak', cuts: [], holes: [] };
const at = (version: number, extra: Record<string, unknown> = {}) =>
  migrateDocument({ ...createDocument('T'), version, boards: [{ ...leg, angleCuts: [], ...extra }] });
const part = (doc: SloydDocument) => doc.boards[0] as Board;

describe('schema 25: square-set leans and the across slope (square-set legs spec §3.4)', () => {
  it('CURRENT_VERSION is 28; a v24 file loads unchanged at 28 with no new keys', () => {
    expect(CURRENT_VERSION).toBe(28);
    const lean = { x: 0.1, z: 0.25, face: 'thickness' };
    const doc = at(24, { angleCuts: [MITER], lean });
    expect(doc.version).toBe(28);
    expect(part(doc).angleCuts).toStrictEqual([MITER]);
    expect(part(doc).lean).toStrictEqual(lean);
    expect('across' in part(doc).angleCuts[0]!).toBe(false);
    expect('square' in part(doc).lean!).toBe(false);
    const text = JSON.stringify(doc);
    expect(text).not.toContain('square');
    expect(text).not.toContain('across');
  });

  it('a v25 file round-trips square and across exactly', () => {
    const doc = at(25, { angleCuts: [COMPOUND], lean: SQUARE });
    expect(part(doc).angleCuts).toStrictEqual([COMPOUND]);
    expect(part(doc).lean).toStrictEqual(SQUARE);
    const again = migrateDocument(JSON.parse(JSON.stringify(doc)));
    expect(part(again).angleCuts).toStrictEqual([COMPOUND]);
    expect(part(again).lean).toStrictEqual(SQUARE);
  });

  it('a malformed across drops the CUT, keeps the part and its other cuts', () => {
    const bad: [string, Record<string, unknown>][] = [
      ['rise 0', { ...MITER, across: { rise: 0, from: 'min' } }],
      ['rise negative', { ...MITER, across: { rise: -0.1, from: 'min' } }],
      ['rise NaN', { ...MITER, across: { rise: NaN, from: 'min' } }],
      ['rise Infinity', { ...MITER, across: { rise: Infinity, from: 'min' } }],
      ['rise a string', { ...MITER, across: { rise: '0.1', from: 'min' } }],
      ['a bad from', { ...MITER, across: { rise: 0.1, from: 'top' } }],
      ['no from', { ...MITER, across: { rise: 0.1 } }],
      ['not an object', { ...MITER, across: 0.1 }],
      ['null', { ...MITER, across: null }],
      ['on a bevel', { id: 'a1', kind: 'bevel', face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', points: [[0, 0.25], [1.5, 0]], across: { rise: 0.1, from: 'min' } }],
      ['on a miter whose face is not length', { ...MITER, face: 'width', along: 'length', across: { rise: 0.1, from: 'min' } }],
      ['on an end cut stored as a bevel', { ...MITER, kind: 'bevel', across: { rise: 0.1, from: 'min' } }],
    ];
    const other = { ...MITER, id: 'a2', from: 'max' as const };
    for (const [what, c] of bad) {
      const doc = at(25, { angleCuts: [c, other] });
      expect(doc.boards, what).toHaveLength(1);
      expect(part(doc).angleCuts, what).toStrictEqual([other]);
    }
    // A missing kind on an end cut derives 'miter', so its across is judged on the resolved kind and kept.
    const { kind: _k, ...noKind } = COMPOUND;
    expect(part(at(25, { angleCuts: [noKind] })).angleCuts).toStrictEqual([COMPOUND]);
  });

  it('a rise above 1 + 1e-9 drops the cut (past the 45° lean bound); a rise of 1 + 1e-9 or less is kept', () => {
    const other = { ...MITER, id: 'a2', from: 'max' as const };
    for (const rise of [1.0000001, 2, 1e9]) {
      const doc = at(25, { angleCuts: [{ ...MITER, across: { rise, from: 'min' } }, other] });
      expect(part(doc).angleCuts, `${rise}`).toStrictEqual([other]);
    }
    for (const rise of [1, 1 + 1e-9]) {
      const c: AngleCut = { ...MITER, across: { rise, from: 'max' } };
      expect(part(at(25, { angleCuts: [c] })).angleCuts, `${rise}`).toStrictEqual([c]);
    }
  });

  it('rebuilds across field by field (a stray key is not kept)', () => {
    const doc = at(25, { angleCuts: [{ ...COMPOUND, across: { ...COMPOUND.across, stray: 1 } }] });
    expect(part(doc).angleCuts).toStrictEqual([COMPOUND]);
  });

  it('square other than true is dropped from the lean; the lean stays', () => {
    for (const v of [false, 'true', 1, null]) {
      const lean = part(at(25, { lean: { ...SQUARE, square: v } })).lean;
      expect(lean, String(v)).toStrictEqual({ x: 0.1, z: 0.25, face: 'thickness' });
    }
  });

  it('a seam-free re-face keeps square', () => {
    // Rake-only on width faces thickness instead (seamFree).
    expect(part(at(25, { lean: { x: 0, z: 0.2, face: 'width', square: true } })).lean).toStrictEqual({ x: 0, z: 0.2, face: 'thickness', square: true });
  });

  it('a v29 file is refused', () => {
    expect(() => at(29)).toThrow(DocumentError);
  });
});

describe('the across slope in the field table, copies and mirrors (inv 40, 44)', () => {
  it('sameAngleCut tells apart cuts differing only in across.rise, in across.from, or in its presence', () => {
    expect(sameAngleCut(COMPOUND, { ...COMPOUND, id: 'x', across: { rise: 0.125, from: 'min' } })).toBe(true);
    expect(sameAngleCut(COMPOUND, { ...COMPOUND, across: { rise: 0.25, from: 'min' } })).toBe(false);
    expect(sameAngleCut(COMPOUND, { ...COMPOUND, across: { rise: 0.125, from: 'max' } })).toBe(false);
    expect(sameAngleCut(COMPOUND, MITER)).toBe(false);
    expect(sameAngleCut(MITER, COMPOUND)).toBe(false);
  });

  it('flattens across after points; an absent across adds nothing (captured literal)', () => {
    expect(angleCutValues(MITER)).toStrictEqual(['miter', 'length', 'min', 'thickness', 'min', 0, 0.25, 1.5, 0]);
    expect(angleCutValues(COMPOUND)).toStrictEqual(['miter', 'length', 'min', 'thickness', 'min', 0, 0.25, 1.5, 0, 0.125, 'min']);
  });

  it('sortAngleCuts is antisymmetric when only one cut has across', () => {
    expect(sortAngleCuts([COMPOUND, MITER])).toStrictEqual([MITER, COMPOUND]);
    expect(sortAngleCuts([MITER, COMPOUND])).toStrictEqual([MITER, COMPOUND]);
  });

  it('copyAngleCut copies across as a fresh object; a cut without one gets no key', () => {
    const c = copyAngleCut(COMPOUND);
    expect(c).toStrictEqual(COMPOUND);
    expect(c.across).not.toBe(COMPOUND.across);
    expect('across' in copyAngleCut(MITER)).toBe(false);
  });

  it('a mirror along the through dimension flips across.from only; twice is the original', () => {
    const m = mirrorAngleCut(COMPOUND, 'width');
    expect(m).toStrictEqual({ ...COMPOUND, across: { rise: 0.125, from: 'max' } });
    expect(COMPOUND.across!.from).toBe('min');
    expect(mirrorAngleCut(m, 'width')).toStrictEqual(COMPOUND);
    // Along `along` and across `face`, as before; across untouched.
    expect(mirrorAngleCut(COMPOUND, 'thickness')).toStrictEqual({ ...COMPOUND, alongFrom: 'max' });
    expect(mirrorAngleCut(COMPOUND, 'length')).toStrictEqual({ ...COMPOUND, from: 'max' });
    // A cut with no across mirrored along through is unchanged, and gains no key.
    expect(mirrorAngleCut(MITER, 'width')).toStrictEqual(MITER);
  });
});

describe('a square-set lean through flips, links and write-back (inv 44, 45, 46)', () => {
  it('leanFlip keeps square, and a turned lean gains no key', () => {
    expect(leanFlip(SQUARE)).toStrictEqual({ ...SQUARE, x: -0.1 });
    expect('square' in leanFlip({ x: 0.1, z: 0.25, face: 'thickness' })).toBe(false);
  });

  it('two links differing only in square are not sameShared', () => {
    const b = part(at(25, { lean: SQUARE }));
    const { square: _s, ...turned } = SQUARE;
    expect(sameShared(b, { ...b, lean: { ...SQUARE } })).toBe(true);
    expect(sameShared(b, { ...b, lean: turned })).toBe(false);
    expect(sameShared({ ...b, lean: turned }, b)).toBe(false);
  });

  // An upright leg in a mirrored assembly: mirrorDim is width, the compound miter's through dimension.
  const mirroredDoc = (): SloydDocument => {
    const b = { id: 'leg', name: 'Leg', position: [0.4, 0, -1.1] as [number, number, number], rotation: 90 as const,
      length: 28, width: 1.75, thickness: 1.25, material: 'oak', grain: 'length' as const, posture: 'upright' as const,
      cuts: [], angleCuts: [COMPOUND], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [], lean: SQUARE };
    return { ...createDocument(), definitions: [{ id: 'd', boards: [b], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'A', definition: 'd', position: [5.1, 0, 2.3], rotation: 90, mirrored: true }] };
  };
  const edit = (doc: SloydDocument, f: (b: Board) => Board) => mapWorld(doc, (w) => w.map((b) => (b.id === 'i1/leg' ? f(b) : b)));
  const stored = (doc: SloydDocument) => partAt(doc, 'i1/leg') as Board;

  it('the world part carries square and the flipped across.from; a rename lowers to the stored objects', () => {
    const doc = mirroredDoc();
    const w = worldParts(doc).find((b) => b.id === 'i1/leg')!;
    expect(w.lean).toStrictEqual({ ...SQUARE, x: -0.1 });
    expect(w.angleCuts[0]!.across).toStrictEqual({ rise: 0.125, from: 'max' });
    const out = edit(doc, (b) => ({ ...b, name: 'Leg 2' }));
    expect(stored(out).lean).toBe(stored(doc).lean);
    expect(stored(out).angleCuts).toBe(stored(doc).angleCuts);
  });

  it('an edit of the rise lowers with across.from flipped back; removing square lowers without it', () => {
    const doc = mirroredDoc();
    const out = edit(doc, (b) => ({ ...b, angleCuts: [{ ...b.angleCuts[0]!, across: { ...b.angleCuts[0]!.across!, rise: 0.25 } }] }));
    expect(stored(out).angleCuts).toStrictEqual([{ ...COMPOUND, across: { rise: 0.25, from: 'min' } }]);
    const { square: _s, ...turnedWorld } = worldParts(doc).find((b) => b.id === 'i1/leg')!.lean!;
    const off = edit(doc, (b) => ({ ...b, lean: turnedWorld }));
    expect(stored(off).lean).toStrictEqual({ x: 0.1, z: 0.25, face: 'thickness' });
  });

  it('write-back splits a Shape whose users differ only in square (groupSignature)', () => {
    const fields = { length: 28, width: 1.75, thickness: 1.25, material: 'oak', grain: 'length' as const, posture: 'upright' as const,
      cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
    const { square: _s, ...turned } = SQUARE;
    const doc: SloydDocument = { ...createDocument(), shapes: [{ id: 's1', ...fields, lean: turned }],
      boards: [{ id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b', name: 'B', position: [10, 0, 0], rotation: 0, shape: 's1' }] };
    const before = flatDocument(doc).boards;
    const after = before.map((b) => (b.id === 'a' ? { ...b, lean: SQUARE } : b));
    const out = migrateDocument(writeBackFlat(doc, before, after));
    const world = worldParts(out);
    expect(world.find((b) => b.id === 'a')!.lean).toStrictEqual(SQUARE);
    expect(world.find((b) => b.id === 'b')!.lean).toStrictEqual(turned);
  });
});
