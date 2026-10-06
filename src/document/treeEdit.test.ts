import { mapWorld, translateItems, writeBackFlat } from './treeEdit';
import { flatDocument, instanceAt, partAt, worldParts } from './tree';
import { assemblyDoc } from './treeFixtures';
import { boardCenter, reorientedPosition } from './geometry';
import type { Board } from './types';

const edit = (doc: ReturnType<typeof assemblyDoc>, id: string, f: (b: Board) => Board) =>
  mapWorld(doc, (w) => w.map((b) => (b.id === id ? f(b) : b)));

describe('mapWorld write-back (assemblies spec §5.2)', () => {
  it('a Length edit inside a turned, translated assembly leaves the stored position bit-identical', () => {
    const doc = assemblyDoc();
    const before = partAt(doc, 'i1/b2')!;
    const out = edit(doc, 'i1/b2', (b) => ({ ...b, length: 13 }));
    const after = partAt(out, 'i1/b2')!;
    expect(after.length).toBe(13);
    after.position.forEach((v, i) => expect(v).toBe(before.position[i]));
    expect(after.rotation).toBe(before.rotation);
    expect(after.position).toBe(before.position);
  });

  it('a cut edit, a material edit and a rename write only themselves', () => {
    const doc = assemblyDoc();
    const before = partAt(doc, 'i1/i2/b3')!;
    const out = edit(doc, 'i1/i2/b3', (b) => ({ ...b, name: 'Dowel', material: 'oak', cuts: [] }));
    const after = partAt(out, 'i1/i2/b3')!;
    expect([after.name, after.material, after.cuts]).toEqual(['Dowel', 'oak', []]);
    after.position.forEach((v, i) => expect(v).toBe(before.position[i]));
    expect(after.position).toBe(before.position);
  });

  it('a fresh but equal position array is not a change (same stored array)', () => {
    for (const id of ['r1', 'i1/b2', 'i1/i2/b3']) {
      const doc = assemblyDoc();
      const before = partAt(doc, id)!;
      const out = edit(doc, id, (b) => ({ ...b, position: [...b.position] as [number, number, number] }));
      expect(partAt(out, id)!.position).toBe(before.position);
    }
  });

  it('a removed key is removed from the stored part', () => {
    const doc = assemblyDoc();
    const linked = edit(doc, 'i1/b2', (b) => ({ ...b, link: 'L1' }));
    expect(partAt(linked, 'i1/b2')!.link).toBe('L1');
    const unlinked = edit(linked, 'i1/b2', ({ link: _l, ...rest }) => rest);
    expect('link' in partAt(unlinked, 'i1/b2')!).toBe(false);
  });

  it('a world move lands where it was asked, and an axis that did not move gains exactly zero', () => {
    const doc = assemblyDoc();
    const before = partAt(doc, 'i1/b2')!;
    const w = worldParts(doc).find((b) => b.id === 'i1/b2')!;
    const out = edit(doc, 'i1/b2', (b) => ({ ...b, position: [b.position[0] + 1.3, b.position[1], b.position[2]] }));
    const moved = worldParts(out).find((b) => b.id === 'i1/b2')!;
    expect(moved.position[0]).toBeCloseTo(w.position[0] + 1.3, 9);
    expect(moved.position[2]).toBeCloseTo(w.position[2], 9);
    // i1 is turned 90°: world X is the part frame's Z, so its X and Y are untouched, bit for bit.
    const after = partAt(out, 'i1/b2')!;
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
    expect(out.boards[0]!.position[0]).toBe(doc.boards[0]!.position[0] + 0.1);
  });
});

describe('translateItems (assemblies spec §4.2)', () => {
  it('a root item gains the delta exactly, as translateBoards did', () => {
    const doc = assemblyDoc();
    const out = translateItems(doc, ['r1', 'i1'], [0.1, 0, 0.3]);
    expect(out.boards[0]!.position).toEqual([-5.3 + 0.1, 0 + 0, 0.1 + 0.3]);
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

describe('writeBackFlat (assemblies spec §6.1)', () => {
  it('maps flat parts back by index, path names never written as renames', () => {
    const doc = assemblyDoc();
    const flat = flatDocument(doc).boards;
    const joined = flat.map((b, i) => (i === 1 ? { ...b, id: 'reminted', cuts: [] } : { ...b, id: `x${i}` }));
    const out = writeBackFlat(doc, flat, joined);
    expect(partAt(out, 'i1/b1')!.cuts).toEqual([]);
    expect(partAt(out, 'i1/b1')!.name).toBe('Side');
    expect(partAt(out, 'i1/b2')).toEqual(partAt(doc, 'i1/b2'));
  });
  it('throws when the count changed', () => {
    const doc = assemblyDoc();
    const flat = flatDocument(doc).boards;
    expect(() => writeBackFlat(doc, flat, flat.slice(1))).toThrow(/count/);
  });
});
