import { describe, expect, it } from 'vitest';
import { migrateDocument, worldParts } from './document';

const leg = (id: string, x: number, extra: Record<string, unknown> = {}) => ({
  id, name: `Leg ${id}`, length: 28, width: 1.75, thickness: 1.75, position: [x, 0.1, 0.3], rotation: 90, posture: 'upright',
  grain: 'length', material: 'oak', cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 0.1, width: 0.7, depth: 0.5, stopMin: 0, stopMax: 0 }],
  link: 'L', ...extra,
});

describe('v10 -> v11: links become shapes', () => {
  it('equal members become users of one shape; nothing moves', () => {
    const v10 = { version: 10, name: 'x', boards: [leg('a', 0), leg('b', 10.1)], instances: [], definitions: [] };
    const doc = migrateDocument(v10);
    expect(doc.version).toBe(18);
    expect(doc.shapes).toHaveLength(1);
    expect(doc.boards.map((b) => 'shape' in b)).toEqual([true, true]);
    expect(worldParts(doc).map((b) => [b.position, b.rotation, b.cuts[0]!.id]))
      .toEqual([[[0, 0.1, 0.3], 90, 'c1'], [[10.1, 0.1, 0.3], 90, 'c1']]);
  });

  it('a differing member stays a plain part, unlinked', () => {
    const v10 = { version: 10, name: 'x', boards: [leg('a', 0), leg('b', 10, { length: 27 }), leg('c', 20)], instances: [], definitions: [] };
    const doc = migrateDocument(v10);
    expect(doc.boards.map((b) => 'shape' in b)).toEqual([true, false, true]);
    expect((doc.boards[1] as { length: number }).length).toBe(27);
  });

  it('a member differing ONLY by a cut id stays plain (cuts compared by id)', () => {
    const cut = leg('b', 0).cuts[0]!;
    const v10 = { version: 10, name: 'x', boards: [leg('a', 0), leg('b', 10, { cuts: [{ ...cut, id: 'c9' }] }), leg('c', 20)], instances: [], definitions: [] };
    const doc = migrateDocument(v10);
    expect(doc.boards.map((b) => 'shape' in b)).toEqual([true, false, true]);
    expect(doc.shapes).toHaveLength(1);
  });

  it('a link spanning the root and an assembly becomes ONE shape', () => {
    const v10 = {
      version: 10, name: 'x', boards: [leg('a', 0)],
      instances: [{ id: 'i1', name: 'A', definition: 'd1', position: [5, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd1', boards: [leg('b', 0)], instances: [] }],
    };
    const doc = migrateDocument(v10);
    expect(doc.shapes).toHaveLength(1);
    expect(doc.definitions[0]!.boards[0]).toMatchObject({ shape: doc.shapes[0]!.id });
  });

  it('a v10 file with a definition referenced twice is still copied; a v11 file keeps the sharing', () => {
    const tree = (version: number) => ({
      version, name: 'x', boards: [],
      instances: [
        { id: 'i1', name: 'A', definition: 'd1', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'B', definition: 'd1', position: [9, 0, 0], rotation: 0 },
      ],
      definitions: [{ id: 'd1', boards: [{ ...leg('p', 0), link: undefined }], instances: [] }],
      shapes: [],
    });
    expect(new Set(migrateDocument(tree(10)).instances.map((i) => i.definition)).size).toBe(2);
    expect(new Set(migrateDocument(tree(11)).instances.map((i) => i.definition)).size).toBe(1);
  });

  it('v11: a shaped part naming a missing shape is dropped; a one-user shape dissolves; a `link` key is ignored', () => {
    const v11 = {
      version: 11, name: 'x', shapes: [{ id: 's1', length: 5, width: 1, thickness: 1, material: 'oak', grain: 'length', posture: 'flat', cuts: [] }],
      boards: [
        { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' },
        { id: 'b', name: 'B', position: [0, 0, 0], rotation: 0, shape: 'gone' },
        { ...leg('c', 0), link: 'L' },
      ],
      instances: [], definitions: [],
    };
    const doc = migrateDocument(v11);
    expect(doc.boards.map((b) => b.id)).toEqual(['a', 'c']);
    expect('length' in doc.boards[0]!).toBe(true); // dissolved: one user
    expect(doc.shapes).toEqual([]);
    expect('link' in doc.boards[1]!).toBe(false);
  });

  // The test above cannot see a v11 file's `link` being migrated: its one
  // carrier would become a one-user shape and dissolve. Two equal carriers can.
  it('v11: two equal parts both carrying `link` stay plain; no shape is made', () => {
    const doc = migrateDocument({ version: 11, name: 'x', boards: [leg('a', 0), leg('b', 10)], instances: [], definitions: [], shapes: [] });
    expect(doc.boards.map((b) => 'shape' in b || !('length' in b))).toEqual([false, false]);
    expect(doc.shapes).toEqual([]);
    expect(doc.boards.some((b) => 'link' in b)).toBe(false);
  });

  it('v11: two users of one shape stay shaped; the shape is validated', () => {
    const doc = migrateDocument({
      version: 11, name: 'x',
      shapes: [
        { id: 's1', length: 5, width: 1, thickness: 1, material: 'nope', grain: 'thickness', posture: 'bogus', cuts: [{ id: 'k', face: 'thickness', from: 'max', across: 'length', offset: 0.2, width: 9, depth: 0.25 }] },
        { id: 's1', length: 9, width: 1, thickness: 1, cuts: [] },
        { id: 's2', length: -1, width: 1, thickness: 1, cuts: [] },
        'junk',
      ],
      boards: [
        { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' },
        { id: 'b', name: 'B', position: [3, 0, 0], rotation: 270, shape: 's1' },
      ],
      instances: [], definitions: [],
    });
    expect(doc.shapes).toHaveLength(1);
    const s = doc.shapes[0]!;
    expect([s.id, s.length, s.material, s.posture, s.grain]).toEqual(['s1', 5, 'pine', 'flat', 'thickness']);
    expect(s.cuts).toEqual([{ id: 'k', face: 'thickness', from: 'max', across: 'length', offset: 0.2, width: 0.8, depth: 0.25, stopMin: 0, stopMax: 0 }]);
    expect(doc.boards).toEqual([
      { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' },
      { id: 'b', name: 'B', position: [3, 0, 0], rotation: 270, shape: 's1' },
    ]);
  });

  it('a shaped plywood shape has its through-thickness grain normalised', () => {
    const doc = migrateDocument({
      version: 11, name: 'x',
      shapes: [{ id: 's1', length: 5, width: 4, thickness: 0.75, material: 'plywood', grain: 'thickness', posture: 'flat', cuts: [] }],
      boards: [
        { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' },
        { id: 'b', name: 'B', position: [9, 0, 0], rotation: 0, shape: 's1' },
      ],
      instances: [], definitions: [],
    });
    expect(doc.shapes[0]!.grain).toBe('length');
  });
});

describe('carried-over link load tests (v10 input)', () => {
  it('a non-string or empty `link` is dropped: the part stays plain and the file opens', () => {
    const doc = migrateDocument({ version: 10, name: 'x', boards: [leg('a', 0, { link: 7 }), leg('b', 10, { link: 7 }), leg('c', 20, { link: '' }), leg('d', 30, { link: '' }), leg('e', 40, { link: '   ' }), leg('f', 50, { link: '   ' })], instances: [], definitions: [] });
    expect(doc.boards).toHaveLength(6);
    expect(doc.boards.every((b) => 'length' in b && !('shape' in b) && !('link' in b))).toBe(true);
    expect(doc.shapes).toEqual([]);
  });

  it('a link spanning the root and an assembly: equal members share a shape, a differing one stays plain', () => {
    const doc = migrateDocument({
      version: 10, name: 'x', boards: [leg('a', 0), leg('z', 30, { width: 2 })],
      instances: [{ id: 'i1', name: 'A', definition: 'd1', position: [5, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd1', boards: [leg('b', 0)], instances: [] }],
    });
    expect(doc.shapes).toHaveLength(1);
    const id = doc.shapes[0]!.id;
    expect(doc.boards[0]).toEqual({ id: 'a', name: 'Leg a', position: [0, 0.1, 0.3], rotation: 90, shape: id });
    expect(doc.definitions[0]!.boards[0]).toEqual({ id: 'b', name: 'Leg b', position: [0, 0.1, 0.3], rotation: 90, shape: id });
    expect(doc.boards[1]).toMatchObject({ id: 'z', width: 2, length: 28 });
    expect('shape' in doc.boards[1]! || 'link' in doc.boards[1]!).toBe(false);
  });
});

// Fu 228, "repair step 7 cannot tell per-container from world-wide". The repair
// that matters here is the load's last step (dissolveShapes, components spec
// §2.3 step 7): a shape with ONE stored user becomes plain. The count is
// world-wide over STORED parts, which a per-container count and a
// per-placement count each get wrong in a different direction.
describe('load: a one-user shape dissolves, counted world-wide over stored parts (fu 228)', () => {
  const shape = { id: 's1', length: 5, width: 1, thickness: 1, material: 'oak', grain: 'length', posture: 'flat', cuts: [] };
  const part = (id: string, x: number) => ({ id, name: `P ${id}`, position: [x, 0, 0], rotation: 0, shape: 's1' });
  const inst = (id: string, x: number) => ({ id, name: `A ${id}`, definition: 'd1', position: [x, 0, 0], rotation: 0 });

  it('users in two different containers are TWO users: the shape stays (a per-container count would dissolve it)', () => {
    const doc = migrateDocument({
      version: 11, name: 'x', shapes: [shape],
      boards: [part('a', 0)], instances: [inst('i1', 20)],
      definitions: [{ id: 'd1', boards: [part('b', 0)], instances: [] }],
    });
    expect(doc.shapes.map((x) => x.id)).toEqual(['s1']);
    expect(doc.boards[0]).toEqual({ id: 'a', name: 'P a', position: [0, 0, 0], rotation: 0, shape: 's1' });
    expect(doc.definitions[0]!.boards[0]).toEqual({ id: 'b', name: 'P b', position: [0, 0, 0], rotation: 0, shape: 's1' });
  });

  it('ONE stored part placed twice is ONE user: the shape dissolves (a per-placement count would keep it)', () => {
    const doc = migrateDocument({
      version: 11, name: 'x', shapes: [shape],
      boards: [], instances: [inst('i1', 0), inst('i2', 20)],
      definitions: [{ id: 'd1', boards: [part('b', 0)], instances: [] }],
    });
    expect(doc.shapes).toEqual([]);
    expect(worldParts(doc)).toHaveLength(2);
    expect('shape' in doc.definitions[0]!.boards[0]!).toBe(false);
    expect(doc.definitions[0]!.boards[0]).toMatchObject({ id: 'b', length: 5, material: 'oak' });
  });

  // Below v11 the load COPIES a definition referenced twice (repairTree), after
  // the link step converted the one stored part: the copies are two stored
  // users of the one shape, so it stays. Contrast the v11 case above.
  it('a v10 link on one part of a definition placed twice: the copy makes a second stored user, so the shape stays', () => {
    const l = { id: 'b', name: 'L', length: 5, width: 1, thickness: 1, position: [0, 0, 0], rotation: 0, material: 'oak', grain: 'length', posture: 'flat', cuts: [], link: 'K' };
    const doc = migrateDocument({
      version: 10, name: 'x', boards: [], instances: [inst('i1', 0), inst('i2', 20)],
      definitions: [{ id: 'd1', boards: [l], instances: [] }],
    });
    expect(doc.shapes).toHaveLength(1);
    expect(doc.definitions).toHaveLength(2);
    expect(doc.definitions.map((d) => (d.boards[0] as { shape: string }).shape)).toEqual([doc.shapes[0]!.id, doc.shapes[0]!.id]);
  });
});
