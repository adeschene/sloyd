import { describe, expect, it } from 'vitest';
import { designToDocument } from './generated';
import type { GeneratedAssembly, GeneratedDesign, GeneratedPart } from './generated';
import { isShaped } from './shapes';
import { createBoard, migrateDocument } from './document';
import { flatDocument, worldParts } from './tree';
import { worldTapers } from './taperWorld';
import { worldAngles } from './angleWorld';
import { boardExtents } from './geometry';
import { miterDegrees, taperCut } from './angleCuts';
import { turnCandidates, alignedTo } from './roleLinks';
import type { Board } from './types';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, role: string, at: [number, number, number], size: [number, number, number]): GeneratedPart =>
  ({ name, role, material: 'oak', at: v(...at), size: v(...size) });
const d = (parts: GeneratedPart[], assemblies: GeneratedAssembly[] = []): GeneratedDesign => ({ name: 'T', parts, assemblies });
const LEG: [number, number, number] = [1.75, 28, 1.75];
const legs = (role = 'leg') => [
  part('Leg 1', role, [0, 0, 0], LEG), part('Leg 2', role, [20, 0, 0], LEG),
  part('Leg 3', role, [0, 0, 20], LEG), part('Leg 4', role, [20, 0, 20], LEG),
];
const shapedNames = (doc: ReturnType<typeof designToDocument>['doc']) =>
  [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)].filter(isShaped).map((b) => b.name).sort();

describe('linkByRole (through designToDocument)', () => {
  it('links equal parts of one role', () => {
    const { doc } = designToDocument(d(legs()));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Leg 1', 'Leg 2', 'Leg 3', 'Leg 4']);
  });

  it('leaves a differing part of the role plain', () => {
    const ps = legs();
    ps[3] = part('Leg 4', 'leg', [20, 0, 20], [1.75, 27, 1.75]);
    const { doc } = designToDocument(d(ps));
    expect(shapedNames(doc)).toEqual(['Leg 1', 'Leg 2', 'Leg 3']);
  });

  it('links each class of equal parts within one role separately', () => {
    const { doc } = designToDocument(d([
      part('Case L', 'side', [0, 0, 0], [0.75, 30, 12]), part('Case R', 'side', [20, 0, 0], [0.75, 30, 12]),
      part('Drawer L', 'side', [2, 0, 0], [0.5, 4, 10]), part('Drawer R', 'side', [10, 0, 0], [0.5, 4, 10]),
    ]));
    expect(doc.shapes).toHaveLength(2);
    expect(shapedNames(doc)).toHaveLength(4);
  });

  it('does not link equal parts with different roles', () => {
    const { doc } = designToDocument(d([
      part('Top', 'top', [0, 30, 0], [30, 0.75, 11]), part('Shelf', 'shelf', [0, 10, 0], [30, 0.75, 11]),
    ]));
    expect(doc.shapes).toHaveLength(0);
  });

  it('does not link parts with no role', () => {
    const { doc } = designToDocument(d(legs('')));
    expect(doc.shapes).toHaveLength(0);
  });

  it("treats role spelling drift as one role (review focus 3)", () => {
    const ps = legs();
    ps[0] = { ...ps[0], role: 'Leg' };
    ps[1] = { ...ps[1], role: ' leg ' };
    const { doc } = designToDocument(d(ps));
    expect(shapedNames(doc)).toHaveLength(4);
  });

  it('counts a part in a definition placed 3× as ONE user, so alone it stays plain', () => {
    const { doc } = designToDocument(d([], [{
      name: 'Drawer', parts: [part('Side', 'side', [0, 0, 0], [0.5, 4, 10])],
      placements: [{ name: 'A', at: v(0, 0, 0) }, { name: 'B', at: v(0, 5, 0) }, { name: 'C', at: v(0, 10, 0) }],
    }]));
    expect(doc.shapes).toHaveLength(0);
  });

  it('links a loose part with an equal assembly part of the same role', () => {
    const { doc } = designToDocument(d([part('Leg', 'leg', [30, 0, 0], LEG)], [{
      name: 'Frame', parts: [part('Leg', 'leg', [0, 0, 0], LEG)], placements: [{ name: 'F', at: v(0, 0, 0) }],
    }]));
    expect(doc.shapes).toHaveLength(1);
    expect(isShaped(doc.boards[0])).toBe(true);
    expect(isShaped(doc.definitions[0].boards[0])).toBe(true);
  });

  it('links equal shelves running along X and along Z (rotation is own)', () => {
    const { doc } = designToDocument(d([
      part('Shelf A', 'shelf', [0, 0, 0], [30, 0.75, 11]), part('Shelf B', 'shelf', [0, 5, 0], [11, 0.75, 30]),
    ]));
    expect(doc.shapes).toHaveLength(1);
    const [a, b] = worldParts(doc);
    expect([a.length, a.width, a.thickness, a.posture]).toEqual([b.length, b.width, b.thickness, b.posture]);
  });

  it('never stores a role', () => {
    const { doc } = designToDocument(d(legs(), [{
      name: 'Drawer', parts: [part('Side', 'side', [0, 0, 0], [0.5, 4, 10]), part('Side 2', 'side', [5, 0, 0], [0.5, 4, 10])],
      placements: [{ name: 'A', at: v(0, 30, 0) }],
    }]));
    const keys = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === 'object' && x !== null) for (const [k, val] of Object.entries(x)) { keys.add(k); walk(val); }
    };
    walk(doc);
    expect(keys.has('role')).toBe(false);
    expect(JSON.stringify(doc)).not.toMatch(/#\d/); // no class label leaked into a name or id
  });

  it('a linked generated document survives migrateDocument unchanged', () => {
    const { doc } = designToDocument(d(legs()));
    expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});

describe('turned links (fu 301)', () => {
  type Dir = '+x' | '-x' | '+z' | '-z';
  const tapered = (name: string, at: [number, number, number], size: [number, number, number], faces: Dir[], role = 'leg'): GeneratedPart =>
    ({ ...part(name, role, at, size), miters: [], bevels: [], chamfers: [], tapers: [{ faces, toward: '-y', start: 20, amount: 0.5 }] });
  // The prompt's corner rule: each leg tapers its two INSIDE faces.
  const inside = (size: [number, number, number] = LEG, role = 'leg') => [
    tapered('Leg FL', [0, 0, 0], size, ['+x', '+z'], role), tapered('Leg FR', [20, 0, 0], size, ['-x', '+z'], role),
    tapered('Leg BL', [0, 0, 20], size, ['+x', '-z'], role), tapered('Leg BR', [20, 0, 20], size, ['-x', '-z'], role),
  ];
  const stored = (doc: ReturnType<typeof designToDocument>['doc']) => [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const shapeIds = (doc: ReturnType<typeof designToDocument>['doc']) => new Set(stored(doc).filter(isShaped).map((b) => b.shape));
  const world = (doc: ReturnType<typeof designToDocument>['doc']) => flatDocument(doc).boards
    .map((b) => ({ name: b.name, box: boardExtents(b), at: b.position, tapers: worldTapers(b) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  it('identical tapered parts link (the angle-cut id fix)', () => {
    const { doc } = designToDocument(d([0, 20, 40].map((x, i) => tapered(`Leg ${i + 1}`, [x, 0, 0], LEG, ['+x']))));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Leg 1', 'Leg 2', 'Leg 3']);
  });

  it('four inside-tapered square legs become ONE component, each world leg unchanged', () => {
    const unlinked = designToDocument(d(inside(LEG, ''))).doc;   // no role: today's encoding, never linked
    const { doc } = designToDocument(d(inside()));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Leg BL', 'Leg BR', 'Leg FL', 'Leg FR']);
    expect(world(doc)).toEqual(world(unlinked));
    expect(stored(doc).map((b) => b.rotation).sort((a, b) => a - b)).toEqual([0, 90, 180, 270]);
  });

  it('an outside-tapered set links the same way', () => {
    const outside: GeneratedPart[] = [
      tapered('Leg FL', [0, 0, 0], LEG, ['-x', '-z']), tapered('Leg FR', [20, 0, 0], LEG, ['+x', '-z']),
      tapered('Leg BL', [0, 0, 20], LEG, ['-x', '+z']), tapered('Leg BR', [20, 0, 20], LEG, ['+x', '+z']),
    ];
    expect(designToDocument(d(outside)).doc.shapes).toHaveLength(1);
  });

  it('legs tapered on different numbers of faces do not link', () => {
    const ps = inside();
    ps[3] = tapered('Leg BR', [20, 0, 20], LEG, ['-x']);
    const { doc } = designToDocument(d(ps));
    expect(shapedNames(doc)).toEqual(['Leg BL', 'Leg FL', 'Leg FR']);
  });

  it('a non-square leg set pairs only by 180°: two components', () => {
    const { doc } = designToDocument(d(inside([1.5, 28, 2.5])));
    expect(shapeIds(doc).size).toBe(2);
    expect(shapedNames(doc)).toEqual(['Leg BL', 'Leg BR', 'Leg FL', 'Leg FR']);
  });

  it('a square flat panel is never turned 90° (its figure would run crosswise)', () => {
    const b = createBoard({ length: 12, width: 12, thickness: 0.75, posture: 'flat', rotation: 0, grain: 'length' });
    expect(turnCandidates(b).map((c) => c.rotation)).toEqual([180]);
  });

  it('a part with rectangular cuts is never turned', () => {
    const b = createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright',
      cuts: [{ id: 'c', face: 'width', from: 'max', across: 'length', offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 }] });
    expect(turnCandidates(b)).toEqual([]);
  });

  it('candidates keep the world box, position and tapered faces', () => {
    const b: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright', rotation: 0, position: [3, 0, 4] }),
      angleCuts: [{ id: 'a1', ...taperCut({ face: 'width', from: 'max', end: 'min', start: 20, amount: 0.5 }) }] };
    const cs = turnCandidates(b);
    expect(cs.map((c) => c.rotation)).toEqual([90, 180, 270]);
    for (const c of cs) {
      expect(boardExtents(c)).toEqual(boardExtents(b));
      expect(c.position).toEqual(b.position);
      expect(worldTapers(c)).toEqual(worldTapers(b));
    }
  });

  it('alignedTo takes the representative\'s ids only when the angle cuts match by geometry', () => {
    const t = (id: string, start: number) => ({ id, ...taperCut({ face: 'width', from: 'max', end: 'min', start, amount: 0.5 }) });
    const rep: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), angleCuts: [t('r1', 20)] };
    const same: Board = { ...rep, id: 'other', angleCuts: [t('x9', 20)] };
    expect(alignedTo(rep, same)?.angleCuts.map((c) => c.id)).toEqual(['r1']);
    expect(alignedTo(rep, { ...same, angleCuts: [t('x9', 19)] })).toBeNull();
    const plain = createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' });
    expect(alignedTo({ ...plain, id: 'p0' }, plain)).toBe(plain);   // no angle cuts: the same object, as today
  });

  it('an untapered design links exactly as before: the same stored objects and turns', () => {
    const { doc } = designToDocument(d(legs()));
    expect(stored(doc).map((b) => b.rotation)).toEqual([0, 0, 0, 0]);
    expect(doc.shapes).toHaveLength(1);
  });
});

describe('turned links with chamfers (AI-angles spec §7)', () => {
  type Dir = '+x' | '-x' | '+z' | '-z';
  const chamfered = (name: string, at: [number, number, number], edge: [Dir, Dir], role = 'leg'): GeneratedPart =>
    ({ ...part(name, role, at, LEG), chamfers: [{ edge, legs: [0.25, 0.25] }] });
  // Each leg chamfered on its OUTSIDE vertical corner: four different stored parts until turned.
  const outside = (role = 'leg') => [
    chamfered('Leg FL', [0, 0, 0], ['-x', '-z'], role), chamfered('Leg FR', [20, 0, 0], ['+x', '-z'], role),
    chamfered('Leg BL', [0, 0, 20], ['-x', '+z'], role), chamfered('Leg BR', [20, 0, 20], ['+x', '+z'], role),
  ];
  it('four legs chamfered on their outside corners become ONE component, each world leg unchanged', () => {
    const unlinked = designToDocument(d(outside(''))).doc;
    const { doc } = designToDocument(d(outside()));
    expect(doc.shapes).toHaveLength(1);
    const w = (x: typeof doc) => flatDocument(x).boards.map((b) => ({ name: b.name, box: boardExtents(b), at: b.position, a: worldAngles(b) })).sort((p, q) => p.name.localeCompare(q.name));
    expect(w(doc)).toEqual(w(unlinked));
  });
  it("legs beveled at a Refine-kept slope link through turns (the exact-angle map re-stores the slope)", () => {
    // 0.7 is no 0.1° step: only the exact-angle map (as Refine passes it) stores it; turned candidates must keep it too.
    const deg = miterDegrees(0.7);
    type Dir = '+x' | '-x' | '+z' | '-z';
    const beveled = (name: string, at: [number, number, number], face: Dir, longPoint: Dir): GeneratedPart =>
      ({ ...part(name, 'leg', at, LEG), bevels: [{ face, longPoint, angle: deg }] });
    const { doc } = designToDocument(d([
      // Each leg the front-left one turned about Y (no mirror pair): outside face, long point turned with it.
      beveled('Leg FL', [0, 0, 0], '-x', '-z'), beveled('Leg FR', [20, 0, 0], '-z', '+x'),
      beveled('Leg BL', [0, 0, 20], '+z', '-x'), beveled('Leg BR', [20, 0, 20], '+x', '+z'),
    ]), { exactAngles: new Map([[deg, 0.7]]) });
    expect(doc.shapes).toHaveLength(1);
  });
  it('a leg with a rectangular cut is not turned (fu 314)', () => {
    const b = flatDocument(designToDocument(d([chamfered('Leg', [0, 0, 0], ['-x', '-z'])])).doc).boards[0]!;
    expect(turnCandidates({ ...b, cuts: [{ id: 'k', face: 'width', from: 'min', across: 'length', offset: 2, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 }] })).toEqual([]);
  });
});

describe('turned candidates and holes', () => {
  it('offers no turned candidates for a holed part (holes spec §5.2)', () => {
    const leg: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }),
      holes: [{ id: 'h1', face: 'width', from: 'max', diameter: 0.375, depth: 1, along: 'length', alongFrom: 'max', station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.875 }] };
    expect(turnCandidates({ ...leg, holes: [] }).length).toBeGreaterThan(0);   // the guard is what refuses, not the box
    expect(turnCandidates(leg)).toEqual([]);
  });
});
