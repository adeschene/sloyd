import { mapWorld, translateItems, writeBackFlat } from './treeEdit';
import { flatDocument, instanceAt, partAt, resolvedPartAt, worldParts } from './tree';
import { assemblyDoc } from './treeFixtures';
import { boardCenter, reorientedPosition } from './geometry';
import type { Board, Cut, RoundTenon } from './types';
import type { Shape, SloydDocument } from './types';
import { createDocument, migrateDocument } from './document';
import { mirrorCut } from './mirrorCut';
import { ARCH } from './curveFixtures';
import { archCurve, cornerCurve } from './curves';
import { applyWorldEdits, storageKey } from './treeEdit';
import { shapeUsers } from './shapes';

const edit = (doc: ReturnType<typeof assemblyDoc>, id: string, f: (b: Board) => Board) =>
  mapWorld(doc, (w) => w.map((b) => (b.id === id ? f(b) : b)));

describe('mapWorld write-back (assemblies spec §5.2)', () => {
  it('a Length edit inside a turned, translated assembly leaves the stored position bit-identical', () => {
    const doc = assemblyDoc();
    const before = resolvedPartAt(doc, 'i1/b2')!;
    const out = edit(doc, 'i1/b2', (b) => ({ ...b, length: 13 }));
    const after = resolvedPartAt(out, 'i1/b2')!;
    expect(after.length).toBe(13);
    after.position.forEach((v, i) => expect(v).toBe(before.position[i]));
    expect(after.rotation).toBe(before.rotation);
    expect(after.position).toBe(before.position);
  });

  it('a cut edit, a material edit and a rename write only themselves', () => {
    const doc = assemblyDoc();
    const before = resolvedPartAt(doc, 'i1/i2/b3')!;
    const out = edit(doc, 'i1/i2/b3', (b) => ({ ...b, name: 'Dowel', material: 'oak', cuts: [] }));
    const after = resolvedPartAt(out, 'i1/i2/b3')!;
    expect([after.name, after.material, after.cuts]).toEqual(['Dowel', 'oak', []]);
    after.position.forEach((v, i) => expect(v).toBe(before.position[i]));
    expect(after.position).toBe(before.position);
  });

  it('a fresh but equal position array is not a change (same stored array)', () => {
    for (const id of ['r1', 'i1/b2', 'i1/i2/b3']) {
      const doc = assemblyDoc();
      const before = resolvedPartAt(doc, id)!;
      const out = edit(doc, id, (b) => ({ ...b, position: [...b.position] as [number, number, number] }));
      expect(resolvedPartAt(out, id)!.position).toBe(before.position);
    }
  });

  it('a world move lands where it was asked, and an axis that did not move gains exactly zero', () => {
    const doc = assemblyDoc();
    const before = resolvedPartAt(doc, 'i1/b2')!;
    const w = worldParts(doc).find((b) => b.id === 'i1/b2')!;
    const out = edit(doc, 'i1/b2', (b) => ({ ...b, position: [b.position[0] + 1.3, b.position[1], b.position[2]] }));
    const moved = worldParts(out).find((b) => b.id === 'i1/b2')!;
    expect(moved.position[0]).toBeCloseTo(w.position[0] + 1.3, 9);
    expect(moved.position[2]).toBeCloseTo(w.position[2], 9);
    // i1 is turned 90°: world X is the part frame's Z, so its X and Y are untouched, bit for bit.
    const after = resolvedPartAt(out, 'i1/b2')!;
    expect(after.position[0]).toBe(before.position[0]);
    expect(after.position[1]).toBe(before.position[1]);
  });

  it('a reorient pivoted in world space lands centred where the pivot put it', () => {
    const doc = assemblyDoc();
    const w = worldParts(doc).find((b) => b.id === 'i1/i2/b3')!;
    const patch = { posture: 'upright' as const };
    const out = edit(doc, 'i1/i2/b3', (b) => ({ ...b, ...patch, position: reorientedPosition(b, patch) }));
    const got = worldParts(out).find((b) => b.id === 'i1/i2/b3')!;
    const want = { ...w, ...patch, position: reorientedPosition(w, patch) };
    boardCenter(got).forEach((v, i) => expect(v).toBeCloseTo(boardCenter(want)[i]!, 9));
  });

  it('a reorient of a part whose box turns with its assembly keeps the centre (corner shift)', () => {
    const doc = assemblyDoc();
    for (const id of ['i1/b1', 'i1/b2', 'i1/i2/b3']) {
      for (const posture of ['flat', 'upright', 'on-edge'] as const) {
        const w = worldParts(doc).find((b) => b.id === id)!;
        const patch = { posture };
        const out = edit(doc, id, (b) => ({ ...b, ...patch, position: reorientedPosition(b, patch) }));
        const got = worldParts(out).find((b) => b.id === id)!;
        const want = { ...w, ...patch, position: reorientedPosition(w, patch) };
        boardCenter(got).forEach((v, i) => expect(v).toBeCloseTo(boardCenter(want)[i]!, 9));
      }
    }
  });

  it('returns the same document when nothing changes, and throws on a length change', () => {
    const doc = assemblyDoc();
    expect(mapWorld(doc, (w) => w)).toBe(doc);
    expect(() => mapWorld(doc, (w) => w.slice(1))).toThrow(/mapWorld/);
  });

  it('a root part edit is plain assignment, as before assemblies', () => {
    const doc = assemblyDoc();
    const out = edit(doc, 'r1', (b) => ({ ...b, position: [b.position[0] + 0.1, b.position[1], b.position[2]] }));
    expect(worldParts(out)[0]!.position[0]).toBe(worldParts(doc)[0]!.position[0] + 0.1);
  });
});

describe('translateItems (assemblies spec §4.2)', () => {
  it('a root item gains the delta exactly, as translateBoards did', () => {
    const doc = assemblyDoc();
    const out = translateItems(doc, ['r1', 'i1'], [0.1, 0, 0.3]);
    expect(worldParts(out)[0]!.position).toEqual([-5.3 + 0.1, 0 + 0, 0.1 + 0.3]);
    expect(instanceAt(out, 'i1')!.position).toEqual([10.1 + 0.1, 0.3 + 0, 3.3 + 0.3]);
  });
  it('an item in a turned container gains the delta rotated into that frame', () => {
    const doc = assemblyDoc();
    const out = translateItems(doc, ['i1/i2', 'i1/b2'], [1, 0, 0]);
    // i1 is turned 90°: world +X is the frame's +Z; the frame's X gains exactly -0.
    expect(instanceAt(out, 'i1/i2')!.position).toEqual([0.7, 1.1, 2.3 + 1]);
    const w0 = worldParts(doc).find((b) => b.id === 'i1/b2')!;
    const w1 = worldParts(out).find((b) => b.id === 'i1/b2')!;
    expect(w1.position[0]).toBeCloseTo(w0.position[0] + 1, 9);
  });
});

describe('translateItems with an ancestor and its descendant (fu 228)', () => {
  it('moves the descendant once, with its ancestor, not twice', () => {
    const doc = assemblyDoc();
    const alone = translateItems(doc, ['i1'], [0.1, 0, 0.3]);
    const both = translateItems(doc, ['i1', 'i1/b2', 'i1/i2'], [0.1, 0, 0.3]);
    expect(both).toEqual(alone);
    const w0 = worldParts(doc).find((b) => b.id === 'i1/b2')!;
    const w1 = worldParts(both).find((b) => b.id === 'i1/b2')!;
    expect(w1.position[0]).toBeCloseTo(w0.position[0] + 0.1, 9);
    expect(w1.position[2]).toBeCloseTo(w0.position[2] + 0.3, 9);
  });
});

describe('writeBackFlat (assemblies spec §6.1)', () => {
  it('maps flat parts back by index, path names never written as renames', () => {
    const doc = assemblyDoc();
    const flat = flatDocument(doc).boards;
    const joined = flat.map((b, i) => (i === 1 ? { ...b, id: 'reminted', cuts: [] } : { ...b, id: `x${i}` }));
    const out = writeBackFlat(doc, flat, joined);
    expect(resolvedPartAt(out, 'i1/b1')!.cuts).toEqual([]);
    expect(resolvedPartAt(out, 'i1/b1')!.name).toBe('Side');
    expect(resolvedPartAt(out, 'i1/b2')).toEqual(resolvedPartAt(doc, 'i1/b2'));
  });
  it('throws when the count changed', () => {
    const doc = assemblyDoc();
    const flat = flatDocument(doc).boards;
    expect(() => writeBackFlat(doc, flat, flat.slice(1))).toThrow(/count/);
  });

  // Fu 228. A moved position is lowered as a DELTA (inv 46, spec §5.2): the
  // stored value gains the inverse-rotated world change, and an axis that did
  // not move gains exactly zero. writeBackFlat is the joinery rule (keepWorld),
  // which only adds that a changed size or posture counts as a move; a
  // Properties edit (mapWorld) keeps the stored local position instead.
  describe('a part moved in the flat result (lowered through its frames)', () => {
    const moveBy = (doc: SloydDocument, id: string, d: [number, number, number]) => {
      const flat = flatDocument(doc).boards;
      return writeBackFlat(doc, flat, flat.map((b) => (b.id === id
        ? { ...b, position: [b.position[0] + d[0], b.position[1] + d[1], b.position[2] + d[2]] as [number, number, number] }
        : b)));
    };

    it('a root part gains the move in its stored position; nothing else changes', () => {
      const doc = assemblyDoc();
      const out = moveBy(doc, 'r1', [1, 0, 0]);
      expect(partAt(out, 'r1')!.position).toEqual([-5.3 + 1, 0, 0.1]);
      expect({ ...out, boards: [] }).toEqual({ ...doc, boards: [] });
      expect({ ...partAt(out, 'r1')!, position: [0, 0, 0] }).toEqual({ ...partAt(doc, 'r1')!, position: [0, 0, 0] });
    });

    it('a part inside a turned assembly: world +X is the frame\'s +Z; the other stored axes stay bit-identical', () => {
      const doc = assemblyDoc();
      const out = moveBy(doc, 'i1/b2', [1, 0, 0]);
      const was = partAt(doc, 'i1/b2')!;
      const now = partAt(out, 'i1/b2')!;
      expect(now.position[0]).toBe(was.position[0]);
      expect(now.position[1]).toBe(was.position[1]);
      expect(now.position[2]).toBeCloseTo(2.7 + 1, 9);
      expect(now.rotation).toBe(was.rotation);
      // the assembly's own frame and every other part are untouched, and the world result is the requested one
      expect(instanceAt(out, 'i1')).toEqual(instanceAt(doc, 'i1'));
      expect(partAt(out, 'i1/b1')).toEqual(partAt(doc, 'i1/b1'));
      expect(partAt(out, 'i1/i2/b3')).toEqual(partAt(doc, 'i1/i2/b3'));
      const w0 = worldParts(doc).find((b) => b.id === 'i1/b2')!;
      const w1 = worldParts(out).find((b) => b.id === 'i1/b2')!;
      expect(w1.position[0]).toBeCloseTo(w0.position[0] + 1, 9);
      expect(w1.position[1]).toBe(w0.position[1]);
      expect(w1.position[2]).toBeCloseTo(w0.position[2], 9);
    });

    it('a part two frames deep (turned 90 inside a turned 90) lands where it was sent', () => {
      const doc = assemblyDoc();
      const out = moveBy(doc, 'i1/i2/b3', [0, 0, 2]);
      const w0 = worldParts(doc).find((b) => b.id === 'i1/i2/b3')!;
      const w1 = worldParts(out).find((b) => b.id === 'i1/i2/b3')!;
      expect(w1.position[0]).toBeCloseTo(w0.position[0], 9);
      expect(w1.position[2]).toBeCloseTo(w0.position[2] + 2, 9);
      expect(w1.rotation).toBe(w0.rotation);
      expect(instanceAt(out, 'i1/i2')).toEqual(instanceAt(doc, 'i1/i2'));
    });
  });

  it('leaves its inputs unchanged (fu 231)', () => {
    const doc = assemblyDoc();
    const before = flatDocument(doc).boards;
    const after = before.map((b, i) => ({ ...b, position: [b.position[0] + 1, b.position[1], b.position[2]] as [number, number, number], cuts: i === 1 ? [] : b.cuts }));
    const frozen = [doc, before, after];
    const snap = JSON.stringify(frozen);
    const deepFreeze = (o: unknown): void => {
      if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
    };
    deepFreeze(frozen);
    const out = writeBackFlat(doc, before, after);   // a frozen input would throw on any write
    expect(JSON.stringify(frozen)).toBe(snap);
    expect(out).not.toBe(doc);
    expect(partAt(out, 'r1')!.position[0]).toBeCloseTo(-5.3 + 1, 9);
  });
});

describe('applyWorldEdits with shared definitions and shapes', () => {
  const shared = (): SloydDocument => ({
    ...createDocument(),
    instances: [
      { id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 },
      { id: 'i2', name: 'Drawer (1)', definition: 'd1', position: [20, 0, 0], rotation: 90 },
    ],
    definitions: [{ id: 'd1', boards: [
      { id: 'b1', name: 'Side', length: 16, width: 6, thickness: 0.5, position: [0, 0, 0], rotation: 0, posture: 'on-edge', grain: 'length', material: 'maple', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] },
      { id: 'b2', name: 'Leg', position: [3, 0, 3], rotation: 0, shape: 's1' },
    ], instances: [], hardware: [] }],
    shapes: [{ id: 's1', length: 6, width: 1, thickness: 1, material: 'oak', grain: 'length', posture: 'upright', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] } satisfies Shape],
  });

  it('storageKey is the same for every placement of one stored part', () => {
    const doc = shared();
    expect(storageKey(doc, 'i1/b1')).toBe('d1:b1');
    expect(storageKey(doc, 'i2/b1')).toBe('d1:b1');
    expect(storageKey(doc, 'nope')).toBeNull();
  });

  it('an edit through one placement changes the definition, so every copy changes', () => {
    const doc = shared();
    const before = worldParts(doc).find((b) => b.id === 'i1/b1')!;
    const out = applyWorldEdits(doc, [{ before, after: { ...before, length: 18 } }]);
    expect(worldParts(out).filter((b) => b.name === 'Side').map((b) => b.length)).toEqual([18, 18]);
  });

  it('a shared field of a shaped part goes to the shape; its own fields stay on the part', () => {
    const doc = shared();
    const before = worldParts(doc).find((b) => b.id === 'i1/b2')!;
    const out = applyWorldEdits(doc, [{ before, after: { ...before, length: 7, name: 'Post' } }]);
    expect(out.shapes[0]!.length).toBe(7);
    const stored = out.definitions[0]!.boards[1]!;
    expect(stored).toEqual({ id: 'b2', name: 'Post', position: [3, 0, 3], rotation: 0, shape: 's1' });
  });

  it('identical edits through two placements merge; disagreeing ones throw', () => {
    const doc = shared();
    const w = worldParts(doc);
    const a = w.find((b) => b.id === 'i1/b1')!;
    const b = w.find((x) => x.id === 'i2/b1')!;
    const merged = applyWorldEdits(doc, [{ before: a, after: { ...a, width: 7 } }, { before: b, after: { ...b, width: 7 } }]);
    expect(merged.definitions[0]!.boards[0]).toMatchObject({ width: 7 });
    expect(() => applyWorldEdits(doc, [{ before: a, after: { ...a, width: 7 } }, { before: b, after: { ...b, width: 8 } }]))
      .toThrow(/disagreeing edits to d1:b1/);
  });

  it('the merge is field by field, so the order of edits to one target does not matter', () => {
    const doc = shared();
    const w = worldParts(doc);
    const a = w.find((b) => b.id === 'i1/b1')!;
    const b = w.find((x) => x.id === 'i2/b1')!;
    const both = { before: a, after: { ...a, length: 18, width: 7 } };
    const one = { before: b, after: { ...b, width: 7 } };
    const ab = applyWorldEdits(doc, [both, one]).definitions[0]!.boards[0];
    const ba = applyWorldEdits(doc, [one, both]).definitions[0]!.boards[0];
    expect(ab).toMatchObject({ length: 18, width: 7 });
    expect(ba).toEqual(ab);
    // Different fields through two placements are both kept.
    const split = applyWorldEdits(doc, [{ before: a, after: { ...a, length: 18 } }, { before: b, after: { ...b, width: 7 } }]);
    expect(split.definitions[0]!.boards[0]).toMatchObject({ length: 18, width: 7 });
  });

  it('an edit that changes no field leaves the stored part as the same object', () => {
    const doc = shared();
    const a = worldParts(doc).find((b) => b.id === 'i1/b1')!;
    const out = applyWorldEdits(doc, [{ before: a, after: { ...a } }]);
    expect(out.definitions[0]!.boards[0]).toBe(doc.definitions[0]!.boards[0]);
  });

  it('a key one edit deletes and another sets is a disagreement; two deletes agree', () => {
    const doc = shared();
    const w = worldParts(doc);
    const a = w.find((b) => b.id === 'i1/b1')!;
    const b = w.find((x) => x.id === 'i2/b1')!;
    const drop = (x: typeof a) => { const { name: _n, ...rest } = x; return rest as unknown as typeof a; };
    const out = applyWorldEdits(doc, [{ before: a, after: drop(a) }, { before: b, after: drop(b) }]);
    expect('name' in out.definitions[0]!.boards[0]!).toBe(false);
    expect(() => applyWorldEdits(doc, [{ before: a, after: drop(a) }, { before: b, after: { ...b, name: 'Other' } }]))
      .toThrow(/disagreeing edits to d1:b1/);
    // A key set to undefined is not a deleted key (JSON alone would call them equal).
    expect(() => applyWorldEdits(doc, [{ before: a, after: drop(a) }, { before: b, after: { ...b, name: undefined as unknown as string } }]))
      .toThrow(/disagreeing edits to d1:b1/);
  });

  it('two different stored parts using one shape must agree on the shape', () => {
    const doc: SloydDocument = { ...shared(), boards: [{ id: 'r1', name: 'Leg R', position: [50, 0, 0], rotation: 0, shape: 's1' }] };
    const w = worldParts(doc);
    const r = w.find((b) => b.id === 'r1')!;
    const l = w.find((b) => b.id === 'i1/b2')!;
    expect(() => applyWorldEdits(doc, [{ before: r, after: { ...r, length: 9 } }, { before: l, after: { ...l, length: 10 } }]))
      .toThrow(/disagreeing edits to shape s1/);
  });
});

describe('writeBackFlat shares where identical', () => {
  const drawers = (n: number): SloydDocument => ({
    ...createDocument(),
    instances: Array.from({ length: n }, (_, k) => ({ id: `i${k}`, name: `D${k}`, definition: 'd1', position: [k * 30, 0, 0] as [number, number, number], rotation: 0 as const })),
    definitions: [{ id: 'd1', boards: [
      { id: 'b1', name: 'Side', length: 16, width: 6, thickness: 0.5, position: [0, 0, 0], rotation: 0, posture: 'on-edge', grain: 'length', material: 'maple', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] },
    ], instances: [], hardware: [] }],
  });
  const cut = { face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 1, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 };
  const flat = (doc: SloydDocument) => flatDocument(doc).boards;

  it('identical results keep one definition (cut ids from the first)', () => {
    const doc = drawers(3);
    const before = flat(doc);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `x${k}`, ...cut }] }));
    const out = writeBackFlat(doc, before, after);
    expect(new Set(out.instances.map((i) => i.definition)).size).toBe(1);
    expect(worldParts(out).map((b) => b.cuts[0]!.id)).toEqual(['x0', 'x0', 'x0']);
  });

  it('identical hole rows under different ids keep one definition (sharedSignature reads rows without ids)', () => {
    const doc = drawers(3);
    const before = flat(doc);
    const row = { face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1 };
    const after = before.map((b, k) => ({ ...b, holes: [{ id: `h${k}`, ...row }] }));
    const out = writeBackFlat(doc, before, after);
    expect(new Set(out.instances.map((i) => i.definition)).size).toBe(1);
    expect(worldParts(out).map((b) => b.holes[0]!.id)).toEqual(['h0', 'h0', 'h0']);
  });

  it('placements whose cuts differ only in ORDER keep one definition (fu 316)', () => {
    const doc = drawers(3);
    const before = flat(doc);
    const other = { ...cut, offset: 5 };
    const after = before.map((b, k) => ({ ...b, cuts: k === 1 ? [{ id: `y${k}`, ...other }, { id: `x${k}`, ...cut }] : [{ id: `x${k}`, ...cut }, { id: `y${k}`, ...other }] }));
    const out = writeBackFlat(doc, before, after);
    expect(new Set(out.instances.map((i) => i.definition)).size).toBe(1);
    // The first placement's record is written: every copy reads its order and ids.
    expect(worldParts(out).map((b) => b.cuts.map((c) => c.id))).toEqual([['x0', 'y0'], ['x0', 'y0'], ['x0', 'y0']]);
  });

  it('a copy whose result differs splits off; the others stay shared', () => {
    const doc = drawers(3);
    const before = flat(doc);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `x${k}`, ...cut, offset: k === 2 ? 3 : 1 }] }));
    const out = writeBackFlat(doc, before, after);
    expect(out.instances.map((i) => i.definition).slice(0, 2)).toEqual(['d1', 'd1']);
    expect(out.instances[2]!.definition).not.toBe('d1');
    expect(worldParts(out).map((b) => b.cuts[0]!.offset)).toEqual([1, 1, 3]);
  });

  it('an edited angle cut splits the definition; the copy is independent and the other placement unchanged (angle-cuts spec §5.2)', () => {
    const doc = drawers(2);
    const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.5], [16, 0]] as [[number, number], [number, number]] };
    doc.definitions[0]!.boards[0] = { ...(doc.definitions[0]!.boards[0] as Board), angleCuts: [taper] };
    const before = flat(doc);
    const after = before.map((b, k) => (k === 1 ? { ...b, angleCuts: [{ ...taper, points: [[0, 1], [16, 0]] as [[number, number], [number, number]] }] } : b));
    const out = writeBackFlat(doc, before, after);
    expect(out.instances[0]!.definition).toBe('d1');
    expect(out.instances[1]!.definition).not.toBe('d1');
    const w = worldParts(out);
    expect(w[0]!.angleCuts[0]!.points).toEqual([[0, 0.5], [16, 0]]);
    expect(w[1]!.angleCuts[0]!.points).toEqual([[0, 1], [16, 0]]);
    expect(out.definitions.find((d) => d.id === 'd1')!.boards[0]).toMatchObject({ angleCuts: [taper] });
    // the new definition's part owns its points: no array shared with d1's part
    const split = out.definitions.find((d) => d.id === out.instances[1]!.definition)!.boards[0] as Board;
    const orig = out.definitions.find((d) => d.id === 'd1')!.boards[0] as Board;
    expect(split.angleCuts[0]!.points).not.toBe(orig.angleCuts[0]!.points);
  });

  it('a split definition\'s part owns its hole rows: no row object shared with d1\'s part (holes spec §5.2)', () => {
    const doc = drawers(2);
    const row = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
    doc.definitions[0]!.boards[0] = { ...(doc.definitions[0]!.boards[0] as Board), holes: [row] };
    const before = flat(doc);
    const after = before.map((b, k) => (k === 1 ? { ...b, cuts: [{ id: 'x1', ...cut }] } : b));
    const out = writeBackFlat(doc, before, after);
    expect(out.instances[1]!.definition).not.toBe('d1');
    const split = out.definitions.find((d) => d.id === out.instances[1]!.definition)!.boards[0] as Board;
    const orig = out.definitions.find((d) => d.id === 'd1')!.boards[0] as Board;
    expect(split.holes).toEqual([row]);
    expect(split.holes[0]).not.toBe(orig.holes[0]);
  });

  it('a split definition\'s part owns its curves: no curve object shared with d1\'s part (curves spec §6.2)', () => {
    const doc = drawers(2);
    doc.definitions[0]!.boards[0] = { ...(doc.definitions[0]!.boards[0] as Board), curves: [ARCH] };
    const before = flat(doc);
    const after = before.map((b, k) => (k === 1 ? { ...b, cuts: [{ id: 'x1', ...cut }] } : b));
    const out = writeBackFlat(doc, before, after);
    expect(out.instances[1]!.definition).not.toBe('d1');
    const split = out.definitions.find((d) => d.id === out.instances[1]!.definition)!.boards[0] as Board;
    const orig = out.definitions.find((d) => d.id === 'd1')!.boards[0] as Board;
    expect(split.curves).toEqual([ARCH]);
    expect(split.curves[0]).not.toBe(orig.curves[0]);
  });

  describe('a tapered part placed twice (angle-cuts spec §5.2)', () => {
    const T = (id: string, depth = 0.5) => ({ id, kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, depth], [16, 0]] as [[number, number], [number, number]] });
    const tapered = () => {
      const doc = drawers(2);
      doc.definitions[0]!.boards[0] = { ...(doc.definitions[0]!.boards[0] as Board), angleCuts: [T('a1')] };
      return doc;
    };

    it('identical angle cuts that differ only by id keep one definition', () => {
      const doc = tapered();
      const before = flat(doc);
      const after = before.map((b, k) => ({ ...b, angleCuts: [T(`n${k}`)] }));
      const out = writeBackFlat(doc, before, after);
      expect(new Set(out.instances.map((i) => i.definition)).size).toBe(1);
    });

    it('a split copies the angle cuts: no array shared with the definition it left', () => {
      const doc = tapered();
      const before = flat(doc);
      const after = before.map((b, k) => (k === 1 ? { ...b, material: 'oak' } : b));
      const out = writeBackFlat(doc, before, after);
      expect(out.instances[1]!.definition).not.toBe('d1');
      const split = out.definitions.find((d) => d.id === out.instances[1]!.definition)!.boards[0] as Board;
      const orig = out.definitions.find((d) => d.id === 'd1')!.boards[0] as Board;
      expect(split.angleCuts).toEqual(orig.angleCuts);
      expect(split.angleCuts[0]).not.toBe(orig.angleCuts[0]);
      expect(split.angleCuts[0]!.points).not.toBe(orig.angleCuts[0]!.points);
    });
  });

  it('four shaped legs with identical mortises stay one shape (follow-up 223)', () => {
    const shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length' as const, posture: 'upright' as const, cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2, 3].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const before = flat(doc);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `m${k}`, ...cut }], angleCuts: [] }));
    const out = writeBackFlat(doc, before, after);
    expect(out.shapes).toHaveLength(1);
    expect(out.shapes[0]!.cuts.map((c) => c.id)).toEqual(['m0']);
    expect(out.boards.every((b) => 'shape' in b)).toBe(true);
  });

  it('a leg whose mortise differs gets its own shape', () => {
    const shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length' as const, posture: 'upright' as const, cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const before = flat(doc);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `m${k}`, ...cut, offset: k === 1 ? 5 : 1 }], angleCuts: [] }));
    const out = writeBackFlat(doc, before, after);
    expect(out.shapes).toHaveLength(2);
    expect(worldParts(out).map((b) => b.cuts[0]!.offset)).toEqual([1, 5, 1]);
  });

  // A shape used at the ROOT and by a part inside a definition placed twice:
  // the definition splits (step 1), then the shape regroups across the root
  // part and both stored copies of the definition's part (step 3).
  const rootAndDef = (): SloydDocument => ({
    ...createDocument(),
    shapes: [{ id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length', posture: 'upright', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] }],
    boards: [{ id: 'r1', name: 'Leg', position: [-20, 0, 0], rotation: 0, shape: 's1' }],
    instances: [0, 1].map((k) => ({ id: `i${k}`, name: `F${k}`, definition: 'd1', position: [k * 30, 0, 0] as [number, number, number], rotation: 0 as const })),
    definitions: [{ id: 'd1', boards: [
      { id: 'b1', name: 'Rail', length: 16, width: 3, thickness: 0.75, position: [2, 10, 0], rotation: 0, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] },
      { id: 'b2', name: 'Post', position: [0, 0, 0], rotation: 0, shape: 's1' },
    ], instances: [], hardware: [] }],
  });
  const legCut = (b: Board, offset: number, k: number) => (b.shape ? { ...b, cuts: [{ id: `m${k}`, ...cut, offset }] } : b);
  const shapeOfAt = (doc: SloydDocument, occ: string) => {
    const p = partAt(doc, occ)!;
    return 'shape' in p ? p.shape : null;
  };

  it('a shape at the root and in a split definition regroups by result; every user resolves its own cuts', () => {
    const doc = rootAndDef();
    const before = flat(doc);
    expect(before.map((b) => b.id)).toEqual(['r1', 'i0/b1', 'i0/b2', 'i1/b1', 'i1/b2']);
    const offsets: Record<string, number> = { r1: 1, 'i0/b2': 1, 'i1/b2': 3 };
    const after = before.map((b, k) => legCut(b, offsets[b.id] ?? 0, k));
    const out = writeBackFlat(doc, before, after);
    // The definition split: i1 has its own copy, i0 keeps d1.
    expect(out.instances.map((i) => i.definition)[0]).toBe('d1');
    expect(out.instances[1]!.definition).not.toBe('d1');
    // Root leg and i0's post agree: one shape. i1's post differs: its own.
    expect(out.shapes).toHaveLength(2);
    expect(shapeOfAt(out, 'r1')).toBe(shapeOfAt(out, 'i0/b2'));
    expect(shapeOfAt(out, 'i1/b2')).not.toBe(shapeOfAt(out, 'r1'));
    expect(shapeOfAt(out, 'i1/b2')).not.toBeNull();
    const w = new Map(worldParts(out).map((b) => [b.id, b]));
    expect([...w.keys()].sort()).toEqual(before.map((b) => b.id).sort());
    for (const [id, off] of Object.entries(offsets)) expect(w.get(id)!.cuts.map((c) => c.offset)).toEqual([off]);
    expect(w.get('r1')!.cuts[0]!.id).toBe(w.get('i0/b2')!.cuts[0]!.id);
    expect(w.get('i0/b1')!.cuts).toEqual([]);
    expect(w.get('i1/b1')!.cuts).toEqual([]);
    // Nothing moved.
    for (const b of before) expect(w.get(b.id)!.position).toEqual(b.position);
  });

  it('a shape at the root and in a shared definition: root differs, the definition stays shared', () => {
    const doc = rootAndDef();
    const before = flat(doc);
    const offsets: Record<string, number> = { r1: 5, 'i0/b2': 1, 'i1/b2': 1 };
    const out = writeBackFlat(doc, before, before.map((b, k) => legCut(b, offsets[b.id] ?? 0, k)));
    expect(out.instances.map((i) => i.definition)).toEqual(['d1', 'd1']);
    expect(out.shapes).toHaveLength(2);
    expect(shapeOfAt(out, 'r1')).not.toBe(shapeOfAt(out, 'i0/b2'));
    const w = new Map(worldParts(out).map((b) => [b.id, b]));
    for (const [id, off] of Object.entries(offsets)) expect(w.get(id)!.cuts.map((c) => c.offset)).toEqual([off]);
    expect(w.get('i0/b2')!.cuts[0]!.id).toBe(w.get('i1/b2')!.cuts[0]!.id);
  });

  // Nested: two cabinets share c1, which holds ONE drawer instance of d1. The
  // drawer's two placements sit in the SAME stored instance (c1's iD), so the
  // drawer can only split after the cabinet has (top-down). Bottom-up would
  // repoint c1's iD for both cabinets at once.
  it('nested: cabinets split first, then the drawer inside each', () => {
    const base = drawers(1);
    const doc: SloydDocument = {
      ...base,
      instances: [0, 1].map((k) => ({ id: `C${k}`, name: `Cab ${k}`, definition: 'c1', position: [k * 40, 0, 0] as [number, number, number], rotation: 0 as const })),
      definitions: [
        { id: 'c1', boards: [], instances: [{ id: 'iD', name: 'Drawer', definition: 'd1', position: [1, 2, 3], rotation: 0 }], hardware: [] },
        ...base.definitions,
      ],
    };
    const before = flat(doc);
    expect(before.map((b) => b.id)).toEqual(['C0/iD/b1', 'C1/iD/b1']);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `x${k}`, ...cut, offset: k === 1 ? 3 : 1 }] }));
    const out = writeBackFlat(doc, before, after);
    expect(worldParts(out).map((b) => b.cuts[0]!.offset)).toEqual([1, 3]);
    expect(out.instances[0]!.definition).toBe('c1');
    expect(out.instances[1]!.definition).not.toBe('c1');
    const drawerOf = (cab: string) => out.definitions.find((d) => d.id === cab)!.instances[0]!.definition;
    expect(drawerOf(out.instances[0]!.definition)).toBe('d1');
    expect(drawerOf(out.instances[1]!.definition)).not.toBe('d1');
  });

  // The drawer is ALSO placed at the root, ahead of the cabinets: ordered by
  // first appearance it would be split before c1 and repoint c1's iD for both.
  it('nested + root placement: the cabinet still splits before the drawer', () => {
    const base = drawers(1);
    const doc: SloydDocument = {
      ...base,
      instances: [
        { id: 'i0', name: 'Loose', definition: 'd1', position: [-40, 0, 0], rotation: 0 },
        ...[0, 1].map((k) => ({ id: `C${k}`, name: `Cab ${k}`, definition: 'c1', position: [k * 40, 0, 0] as [number, number, number], rotation: 0 as const })),
      ],
      definitions: [
        { id: 'c1', boards: [], instances: [{ id: 'iD', name: 'Drawer', definition: 'd1', position: [1, 2, 3], rotation: 0 }], hardware: [] },
        ...base.definitions,
      ],
    };
    const before = flat(doc);
    expect(before.map((b) => b.id)).toEqual(['i0/b1', 'C0/iD/b1', 'C1/iD/b1']);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `x${k}`, ...cut, offset: k === 2 ? 3 : 1 }] }));
    const out = writeBackFlat(doc, before, after);
    expect(worldParts(out).map((b) => b.cuts[0]!.offset)).toEqual([1, 1, 3]);
    expect(out.instances.map((i) => i.definition).slice(0, 2)).toEqual(['d1', 'c1']);
    expect(out.instances[2]!.definition).not.toBe('c1');
  });
  it('users whose hole rows differ only in order and ids stay one Shape; a differing row splits (groupSignature)', () => {
    const shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length' as const, posture: 'upright' as const, cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const r1 = { id: 'x', face: 'width' as const, from: 'max' as const, diameter: 0.375, depth: 1, along: 'length' as const, alongFrom: 'max' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.875 };
    const r2 = { ...r1, station: 5 };
    const before = flat(doc);
    const rows = [[{ ...r1, id: 'a' }, { ...r2, id: 'b' }], [{ ...r2, id: 'c' }, { ...r1, id: 'd' }], [{ ...r1, id: 'e', station: 3 }]];
    const out = writeBackFlat(doc, before, before.map((b, k) => ({ ...b, holes: rows[k]! })));
    expect(out.shapes).toHaveLength(2);
    expect(shapeOfAt(out, 'l0')).toBe(shapeOfAt(out, 'l1'));
    expect(shapeOfAt(out, 'l2')).not.toBe(shapeOfAt(out, 'l0'));
  });
  it('users whose leans are equal by value stay one Shape; a differing lean splits (groupSignature)', () => {
    const shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length' as const, posture: 'upright' as const, cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const before = flat(doc);
    const leans = [{ x: 0.1, z: 0.2, face: 'width' as const }, { x: 0.1, z: 0.2, face: 'width' as const }, { x: 0.1, z: 0.25, face: 'width' as const }];
    const out = writeBackFlat(doc, before, before.map((b, k) => ({ ...b, lean: leans[k]! })));
    expect(out.shapes).toHaveLength(2);
    expect(shapeOfAt(out, 'l0')).toBe(shapeOfAt(out, 'l1'));
    expect(shapeOfAt(out, 'l2')).not.toBe(shapeOfAt(out, 'l0'));
    expect(worldParts(out).map((b) => b.lean)).toEqual(leans);
  });
  it('users whose curves differ only in order and ids stay one Shape; a differing curve splits (groupSignature)', () => {
    const shape = { id: 's1', length: 30, width: 5, thickness: 0.75, material: 'oak', grain: 'length' as const, posture: 'flat' as const, cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Apron ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const c1 = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 });
    const c2 = cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 1 });
    const before = flat(doc);
    const sets = [[{ ...c1, id: 'a' }, { ...c2, id: 'b' }], [{ ...c2, id: 'c' }, { ...c1, id: 'd' }], [{ ...c1, id: 'e' }]];
    const out = writeBackFlat(doc, before, before.map((b, k) => ({ ...b, curves: sets[k]! })));
    expect(out.shapes).toHaveLength(2);
    expect(shapeOfAt(out, 'l0')).toBe(shapeOfAt(out, 'l1'));
    expect(shapeOfAt(out, 'l2')).not.toBe(shapeOfAt(out, 'l0'));
  });
});

describe('writeBackFlat — shape grouping ignores cut order (fu 301)', () => {
  const part = { length: 20, width: 2, thickness: 2, posture: 'upright' as const, grain: 'length' as const, material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
  const doc = (): SloydDocument => ({
    ...createDocument(),
    shapes: [{ id: 's1', ...part }],
    boards: [
      { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' },
      { id: 'b', name: 'B', position: [10, 0, 0], rotation: 0, shape: 's1' },
    ],
  });
  const m1: Omit<Cut, 'id'> = { face: 'width', from: 'max' as const, across: 'length' as const, offset: 0.5, width: 0.25, depth: 0.75, stopMin: 3, stopMax: 0.5 };
  const m2: Omit<Cut, 'id'> = { ...m1, face: 'thickness' };
  const cuts = (...c: Omit<Cut, 'id'>[]) => c.map((x, i) => ({ id: `c${i}${x.face}`, ...x }));
  const usersOf = (d: SloydDocument) => new Set(d.boards.map((b) => ('shape' in b ? b.shape : undefined)));

  it('two users whose cuts are the same set in different orders stay one shape', () => {
    const d = doc();
    const before = flatDocument(d).boards;
    const out = writeBackFlat(d, before, [{ ...before[0]!, cuts: cuts(m1, m2) }, { ...before[1]!, cuts: cuts(m2, m1) }]);
    expect(usersOf(out).size).toBe(1);
  });
  it('a user with a genuinely different cut splits off', () => {
    const d = doc();
    const before = flatDocument(d).boards;
    const out = writeBackFlat(d, before, [{ ...before[0]!, cuts: cuts(m1, m2) }, { ...before[1]!, cuts: cuts(m2, { ...m1, depth: 0.5 }) }]);
    expect(usersOf(out).size).toBe(2);
  });
});

describe('writeBackFlat — mirrored links (fu 432, spec §6.2)', () => {
  // Metric on purpose: mirrorCut twice is NOT bit-exact on these sizes (MM(300) and a cut MM(10) from an end come back an
  // ulp off), so a regroup that lowered a mirrored user's untouched cuts and compared would split a pair joinery never
  // touched. The Shape's dado sits 10 mm from ONE end along the mirror dimension (length, flat): chiral (inv 44).
  const MM = (n: number) => Math.round(n * 10) / 10 / 25.4;
  const part = { length: MM(300), width: MM(100), thickness: MM(19), posture: 'flat' as const, grain: 'length' as const, material: 'oak', angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
  const dado: Cut = { id: 'k1', face: 'thickness', from: 'max', across: 'width', offset: MM(10), width: MM(19), depth: MM(6), stopMin: 0, stopMax: MM(20) };
  const doc = (order: 'plain-first' | 'mirrored-first' | 'both-mirrored' = 'plain-first'): SloydDocument => {
    const a = { id: 'a', name: 'A', position: [0, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1', ...(order === 'both-mirrored' ? { mirrored: true as const } : {}) };
    const b = { id: 'b', name: 'B', position: [40, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1', mirrored: true as const };
    return { ...createDocument(), shapes: [{ id: 's1', ...part, cuts: [dado] }], boards: order === 'mirrored-first' ? [b, a] : [a, b] };
  };
  /** A world part's features as joinery's output is compared: cuts as a set of geometry (ids and order are the founder's). */
  const world = (bs: readonly Board[]) => bs.map((b) => [b.id, b.position, b.rotation, boardExtentsOf(b), b.cuts.map(({ id: _id, ...c }) => JSON.stringify(c)).sort()]);
  const boardExtentsOf = (b: Board) => [b.length, b.width, b.thickness, b.posture];
  /** A new dado at 2" (or 20 mm, 12 mm wide) from the min end in `b`'s OWN hand: on a mirrored user, the reflection joinery would cut. */
  const housed = (b: Board, mirrored: boolean, metric = false): Board => {
    const c: Cut = { id: `n-${b.id}`, face: 'thickness', from: 'max', across: 'width', offset: metric ? MM(20) : 2, width: metric ? MM(12) : 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    return { ...b, cuts: [...b.cuts, mirrored ? mirrorCut(c, 'length', b.length) : c] };
  };
  const records = (d: SloydDocument) => d.boards.map((b) => [b.id, 'shape' in b ? b.shape : null, b.mirrored === true]);
  /** The flag rule on writeBackFlat's RAW output (before migrateDocument, whose loader drops a plain part's flag and so
   *  would hide a leak): no stored plain part (a record with `length`) carries `mirrored`, and no flagged user's Shape has
   *  a single user (a group of one keeps NO flag; migrateDocument would make it that plain part). */
  const rawFlagLeaks = (d: SloydDocument) => {
    const users = shapeUsers(d);
    return [...d.boards, ...d.definitions.flatMap((x) => x.boards)]
      .filter((b) => b.mirrored === true && ('length' in b || !('shape' in b) || (users.get(b.shape) ?? 0) < 2))
      .map((b) => b.id);
  };

  it('joinery touching nothing keeps the link and the flag; the Shape keeps its own dado (no drift)', () => {
    const d = doc();
    const before = flatDocument(d).boards;
    const out = writeBackFlat(d, before, before);
    expect(records(out)).toEqual([['a', 's1', false], ['b', 's1', true]]);
    expect(out.shapes).toHaveLength(1);
    expect(out.shapes[0]!.cuts).toEqual([dado]);
    expect(world(worldParts(out))).toEqual(world(before));
  });

  it('a dado in BOTH sides (mirror images) keeps ONE Shape, the flag kept; worlds are joinery\'s output', () => {
    const d = doc();
    const before = flatDocument(d).boards;
    const after = before.map((b) => housed(b, b.id === 'b'));
    const out = migrateDocument(writeBackFlat(d, before, after));
    expect(records(out)).toEqual([['a', 's1', false], ['b', 's1', true]]);
    expect(out.shapes).toHaveLength(1);
    expect(world(worldParts(out))).toEqual(world(after));
  });

  // A metric new dado: lowered through b's flag and reflected back it would land an ulp off, so the Shape is a's (the
  // first UNflagged user b resolves against), and b's world is exactly joinery's.
  it('the mirrored user FIRST in document order: still one Shape, each user its own flag; worlds are joinery\'s output', () => {
    const d = doc('mirrored-first');
    const before = flatDocument(d).boards;
    const after = before.map((b) => housed(b, b.id === 'b', true));
    const out = migrateDocument(writeBackFlat(d, before, after));
    expect(records(out)).toEqual([['b', 's1', true], ['a', 's1', false]]);
    expect(out.shapes).toHaveLength(1);
    expect(world(worldParts(out))).toEqual(world(after));
  });

  it('two mirrored users housed alike stay one Shape, both flagged; the untouched metric dado is the Shape\'s own', () => {
    const d = doc('both-mirrored');
    const before = flatDocument(d).boards;
    const after = before.map((b) => housed(b, true));
    const out = migrateDocument(writeBackFlat(d, before, after));
    expect(records(out)).toEqual([['a', 's1', true], ['b', 's1', true]]);
    expect(out.shapes[0]!.cuts.find((c) => c.id === 'k1')).toEqual(dado);
    expect(world(worldParts(out))).toEqual(world(after));
  });

  // The recorded residue: with no unflagged user, a new metric dado lowered through the flag and reflected back lands an
  // ulp off (mirrorCut is not bit-exact twice), so the users do not resolve from one Shape and split. A lost link, never
  // wrong geometry: every world is joinery's output and no plain part keeps the flag.
  it('two mirrored users with a new METRIC dado split (residue), worlds exact, no plain part flagged', () => {
    const d = doc('both-mirrored');
    const before = flatDocument(d).boards;
    const after = before.map((b) => housed(b, true, true));
    const raw = writeBackFlat(d, before, after);
    expect(rawFlagLeaks(raw)).toEqual([]);
    const out = migrateDocument(raw);
    expect(out.boards.some((b) => 'mirrored' in b && !('shape' in b))).toBe(false);
    expect(world(worldParts(out))).toEqual(world(after));
    expect(out.shapes).toHaveLength(0);
  });

  // Step 1 copies a definition whose placements' results differ (copyDefinition, ids kept, new definition id). The flags
  // are read off the markers AFTER that split, so the copy's mirrored user keeps its flag and its (new) link.
  it('a mirrored link in an assembly placed twice, housed in ONE placement: the copy keeps the flag and its own link', () => {
    const base = doc();
    const d: SloydDocument = {
      ...base, boards: [],
      definitions: [{ id: 'd1', boards: base.boards, instances: [], hardware: [] }],
      instances: [0, 1].map((k) => ({ id: `i${k}`, name: `Case ${k}`, definition: 'd1', position: [k * 100, 0, 0] as [number, number, number], rotation: 0 as const })),
    };
    const before = flatDocument(d).boards;
    const after = before.map((b) => (b.id.startsWith('i1/') ? housed(b, b.id === 'i1/b') : b));
    const out = migrateDocument(writeBackFlat(d, before, after));
    expect(out.definitions).toHaveLength(2);
    expect(out.shapes).toHaveLength(2);
    const copy = out.definitions.find((x) => x.id === out.instances[1]!.definition)!;
    expect(copy.id).not.toBe('d1');
    expect(copy.boards.map((b) => [b.id, 'shape' in b ? b.shape !== 's1' : null, b.mirrored === true])).toEqual([['a', true, false], ['b', true, true]]);
    expect(world(worldParts(out))).toEqual(world(after));
  });

  it('a dado in ONE side splits the link: worlds are joinery\'s output, no plain part keeps the flag', () => {
    const d = doc();
    const before = flatDocument(d).boards;
    const after = before.map((b) => (b.id === 'a' ? housed(b, false) : b));
    const raw = writeBackFlat(d, before, after);
    expect(rawFlagLeaks(raw)).toEqual([]);
    const out = migrateDocument(raw);
    expect(out.shapes).toHaveLength(0);
    expect(out.boards.some((b) => 'mirrored' in b || 'shape' in b)).toBe(false);
    expect(world(worldParts(out))).toEqual(world(after));
  });
});

describe('a lean through write-back (splayed legs spec §3.4)', () => {
  const LEAN = { x: 0.1, z: 0.25, face: 'thickness' as const };
  /** A leaning leg in definition `d`, placed by `outer` at the root; `inner` nests `d` in `e` when given. */
  const leanDoc = (outer: { rotation: 0 | 90 | 180 | 270; mirrored?: true }, inner?: { rotation: 0 | 90 | 180 | 270; mirrored?: true }): SloydDocument => {
    const leg = { id: 'leg', name: 'Leg', position: [0.4, 0, -1.1] as [number, number, number], rotation: 90 as const,
      length: 28, width: 1.75, thickness: 1.25, material: 'oak', grain: 'length' as const, posture: 'upright' as const,
      cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [], lean: LEAN };
    const d = { id: 'd', boards: [leg], instances: [], hardware: [] };
    if (!inner) return { ...createDocument(), definitions: [d], instances: [{ id: 'i1', name: 'A', definition: 'd', position: [5.1, 0, 2.3], ...outer }] };
    const e = { id: 'e', boards: [], instances: [{ id: 'j', name: 'B', definition: 'd', position: [1.5, 0, 0.5] as [number, number, number], ...inner }], hardware: [] };
    return { ...createDocument(), definitions: [d, e], instances: [{ id: 'i1', name: 'A', definition: 'e', position: [5.1, 0, 2.3], ...outer }] };
  };
  const CASES: [string, SloydDocument, string, number][] = [
    ['a turned, mirrored assembly', leanDoc({ rotation: 90, mirrored: true }), 'i1/leg', 1],
    ['a turned, unmirrored assembly', leanDoc({ rotation: 270 }), 'i1/leg', 0],
    ['two nested mirrors', leanDoc({ rotation: 90, mirrored: true }, { rotation: 180, mirrored: true }), 'i1/j/leg', 2],
    ['one mirror of two', leanDoc({ rotation: 90 }, { rotation: 180, mirrored: true }), 'i1/j/leg', 1],
  ];

  for (const [what, doc, id, mirrors] of CASES) {
    it(`${what}: the world part carries the lean flipped once per mirror, and an edit lowers exactly`, () => {
      const w = worldParts(doc).find((b) => b.id === id)!;
      expect(w.lean).toEqual({ ...LEAN, x: mirrors % 2 ? -LEAN.x : LEAN.x });
      const out = edit(doc, id, (b) => ({ ...b, lean: { ...b.lean!, z: b.lean!.z + 0.05 } }));
      const stored = (partAt(out, id) as Board).lean!;
      expect(Object.is(stored.x, LEAN.x), 'x bit for bit').toBe(true);
      expect(stored.z).toBe(LEAN.z + 0.05);
      expect(stored.face).toBe(LEAN.face);
      // Still seam-free after the lowering: the flip keeps a zero slope zero, so neither slope became 0 here.
      expect(stored.x !== 0 && stored.z !== 0).toBe(true);
      // Only the lean was written: the position and turn are the stored ones.
      expect(partAt(out, id)!.position).toBe(partAt(doc, id)!.position);
    });

    it(`${what}: an untouched lean is the same object after a rename`, () => {
      const out = edit(doc, id, (b) => ({ ...b, name: 'Leg 2' }));
      expect(partAt(out, id)!.name).toBe('Leg 2');
      expect((partAt(out, id) as Board).lean).toBe((partAt(doc, id) as Board).lean);
    });

    it(`${what}: a lean set to undefined is REMOVED, the key deleted (controller ruling 1)`, () => {
      const out = edit(doc, id, (b) => ({ ...b, lean: undefined }));
      expect('lean' in partAt(out, id)!).toBe(false);
      expect(worldParts(out).some((b) => 'lean' in b)).toBe(false);
    });
  }
});

describe('round tenons through write-back (round tenons spec §3.1, inv 44, 46)', () => {
  // Chiral: a tenon on the max end only; a flat rung, so a mirror runs along the length (mirrorDim) and swaps the end.
  const T: RoundTenon = { id: 't1', end: 'max', diameter: 0.75, length: 1 };
  const fields = { length: 18, width: 1.5, thickness: 1.25, material: 'oak', grain: 'length' as const, posture: 'flat' as const,
    cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const, hardware: [] };
  const at = (x: number): [number, number, number] => [x, 0, 0];
  const linked = (mirrored = false): SloydDocument => ({ ...createDocument(), shapes: [{ id: 's1', ...fields, tenons: [T] }],
    boards: [{ id: 'a', name: 'A', position: at(0), rotation: 0, shape: 's1' },
      { id: 'b', name: 'B', position: at(30), rotation: 0, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) }] });

  it('a shaped part\'s tenon edit writes the Shape, changed fields only', () => {
    const doc = linked();
    const out = edit(doc, 'a', (b) => ({ ...b, tenons: [{ ...b.tenons![0]!, length: 1.5 }] }));
    expect(out.shapes[0]!.tenons).toEqual([{ ...T, length: 1.5 }]);
    // Only the tenons were written: the users' records and every other Shape field are the stored objects.
    expect(out.boards[0]).toBe(doc.boards[0]);
    expect(out.boards[1]).toBe(doc.boards[1]);
    // (cuts are re-copied by every resolve and always rewritten, as today; not asserted.)
    for (const k of ['angleCuts', 'holes', 'curves', 'profiles', 'bands', 'hardware'] as const) expect(out.shapes[0]![k]).toBe(doc.shapes[0]![k]);
    expect(worldParts(out).map((b) => b.tenons![0]!.length)).toEqual([1.5, 1.5]);
  });

  it('a removal (undefined or []) deletes the Shape\'s key; a rename leaves the Shape\'s tenons the same object', () => {
    for (const removal of [undefined, []]) {
      const out = edit(linked(), 'a', (b) => ({ ...b, tenons: removal }));
      expect('tenons' in out.shapes[0]!).toBe(false);
      expect(worldParts(out).some((b) => 'tenons' in b)).toBe(false);
    }
    // The Shape record itself is rewritten on any edit through an unflagged user (its cuts come back as resolveBoard's
    // copy, as before tenons); its tenons are the stored array.
    const doc = linked();
    expect(edit(doc, 'a', (b) => ({ ...b, name: 'A2' })).shapes[0]!.tenons).toBe(doc.shapes[0]!.tenons);
  });

  it('a flagged (mirrored) user: the world tenon is on the other end; an edit lowers through the flag; a rename writes nothing', () => {
    const doc = linked(true);
    expect(worldParts(doc).map((b) => b.tenons![0]!.end)).toEqual(['max', 'min']);
    const out = edit(doc, 'b', (b) => ({ ...b, tenons: [{ ...b.tenons![0]!, diameter: 0.625 }] }));
    expect(out.shapes[0]!.tenons).toEqual([{ ...T, diameter: 0.625 }]);
    const renamed = edit(doc, 'b', (b) => ({ ...b, name: 'B2' }));
    expect(renamed.shapes[0]).toBe(doc.shapes[0]);
    expect(renamed.shapes[0]!.tenons).toBe(doc.shapes[0]!.tenons);
  });

  /** The rung in definition `d`, placed by a mirrored instance (twice nested when `twice`). */
  const mirroredDoc = (tenons: boolean, twice = false): SloydDocument => {
    const rung = { id: 'r', name: 'Rung', position: [0.5, 2, 0.25] as [number, number, number], rotation: 90 as const, ...fields, ...(tenons ? { tenons: [T] } : {}) };
    const d = { id: 'd', boards: [rung], instances: [], hardware: [] };
    if (!twice) return { ...createDocument(), definitions: [d], instances: [{ id: 'i1', name: 'A', definition: 'd', position: [5, 0, 2], rotation: 90, mirrored: true }] };
    const e = { id: 'e', boards: [], instances: [{ id: 'j', name: 'B', definition: 'd', position: [1.5, 0, 0.5] as [number, number, number], rotation: 180 as const, mirrored: true as const }], hardware: [] };
    return { ...createDocument(), definitions: [d, e], instances: [{ id: 'i1', name: 'A', definition: 'e', position: [5, 0, 2], rotation: 90, mirrored: true }] };
  };

  for (const [what, twice, id, end] of [['one mirror', false, 'i1/r', 'min'], ['two nested mirrors', true, 'i1/j/r', 'max']] as const) {
    it(`${what}: the world tenon flips once per mirror; an edit lowers exactly; a rename keeps the stored array`, () => {
      const doc = mirroredDoc(true, twice);
      expect(worldParts(doc).find((b) => b.id === id)!.tenons).toEqual([{ ...T, end }]);
      const out = edit(doc, id, (b) => ({ ...b, tenons: [{ ...b.tenons![0]!, length: 1.25 }] }));
      expect((partAt(out, id) as Board).tenons).toEqual([{ ...T, length: 1.25 }]);
      expect(partAt(out, id)!.position).toBe(partAt(doc, id)!.position);
      const renamed = edit(doc, id, (b) => ({ ...b, name: 'Rung 2' }));
      expect((partAt(renamed, id) as Board).tenons).toBe((partAt(doc, id) as Board).tenons);
      const removed = edit(doc, id, (b) => ({ ...b, tenons: undefined }));
      expect('tenons' in partAt(removed, id)!).toBe(false);
    });
  }

  it('a posture change that moves the mirror dimension keeps the world tenon as seen (written though the array is untouched)', () => {
    const doc = mirroredDoc(true);
    expect(worldParts(doc)[0]!.tenons).toEqual([{ ...T, end: 'min' }]);
    // Flat -> upright: the mirror now runs across the width, so the stored end must become the seen one.
    const out = edit(doc, 'i1/r', (b) => ({ ...b, posture: 'upright' }));
    expect((partAt(out, 'i1/r') as Board).tenons).toEqual([{ ...T, end: 'min' }]);
    expect(worldParts(out)[0]!.tenons).toEqual([{ ...T, end: 'min' }]);
  });

  it('a tenon-free part through a mirror gains no key on an edit', () => {
    const doc = mirroredDoc(false);
    const out = edit(doc, 'i1/r', (b) => ({ ...b, length: 20 }));
    expect('tenons' in partAt(out, 'i1/r')!).toBe(false);
    expect('tenons' in worldParts(out)[0]!).toBe(false);
  });

  it('users whose tenons differ only in ids stay one Shape (the founder\'s ids); a differing tenon splits (groupSignature)', () => {
    const doc: SloydDocument = { ...createDocument(), shapes: [{ id: 's1', ...fields }],
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Rung ${k}`, position: at(k * 30), rotation: 0 as const, shape: 's1' })) };
    const before = flatDocument(doc).boards;
    const sets: RoundTenon[][] = [[{ ...T, id: 'a' }], [{ ...T, id: 'b' }], [{ ...T, id: 'c', length: 2 }]];
    const out = writeBackFlat(doc, before, before.map((b, k) => ({ ...b, tenons: sets[k]! })));
    expect(out.shapes).toHaveLength(2);
    const shapeOf = (id: string) => (out.boards.find((b) => b.id === id) as { shape: string }).shape;
    expect(shapeOf('l0')).toBe(shapeOf('l1'));
    expect(shapeOf('l2')).not.toBe(shapeOf('l0'));
    expect(out.shapes.find((s) => s.id === shapeOf('l0'))!.tenons).toEqual([{ ...T, id: 'a' }]);
  });

  it('a split definition\'s plain part owns its tenons: no tenon object shared with the original (copyDefinition)', () => {
    const doc = mirroredDoc(true);
    const placed: SloydDocument = { ...doc, instances: [...doc.instances, { id: 'i2', name: 'B', definition: 'd', position: [40, 0, 0], rotation: 0 }] };
    const before = flatDocument(placed).boards;
    // Only the second placement's rung is lengthened: the definition splits.
    const out = writeBackFlat(placed, before, before.map((b) => (b.id === 'i2/r' ? { ...b, length: 20 } : b)));
    expect(out.definitions).toHaveLength(2);
    const [r1, r2] = out.definitions.map((x) => x.boards[0] as Board);
    expect(r1!.tenons![0]).not.toBe(r2!.tenons![0]);
  });
});
