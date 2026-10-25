import { describe, expect, it } from 'vitest';
import { designToDocument } from './generated';
import type { GeneratedAssembly, GeneratedDesign, GeneratedPart } from './generated';
import { isShaped } from './shapes';
import { createBoard, createDocument, migrateDocument } from './document';
import { flatDocument, worldParts } from './tree';
import { worldTapers } from './taperWorld';
import { worldAngles } from './angleWorld';
import { worldBands } from './bandWorld';
import { sortHoleRows, worldHoles } from './holeWorld';
import { boardHoles } from './holes';
import { axisDimensions, boardExtents, toWorldOffset } from './geometry';
import { miterDegrees, taperCut } from './angleCuts';
import { turnCandidates, alignedTo, linkByRole, mirrorCandidates } from './roleLinks';
import { mirrorFeatures, mirrorInPlace } from './frames';
import { chiralCurved } from './turnFixtures';
import type { SloydDocument } from './types';
import { sameShared } from './links';
import type { Board } from './types';
import { ARCH } from './curveFixtures';
import { BUILT_IN_BAND_ID } from './bandModel';
import { worldProfiles } from './profileWorld';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, role: string, at: [number, number, number], size: [number, number, number]): GeneratedPart =>
  ({ name, role, material: 'oak', at: v(...at), size: v(...size) });
const d = (parts: GeneratedPart[], assemblies: GeneratedAssembly[] = []): GeneratedDesign => ({ name: 'T', parts, assemblies });
const LEG: [number, number, number] = [1.75, 28, 1.75];
const legs = (role = 'leg') => [
  part('Leg 1', role, [0, 0, 0], LEG), part('Leg 2', role, [20, 0, 0], LEG),
  part('Leg 3', role, [0, 0, 20], LEG), part('Leg 4', role, [20, 0, 20], LEG),
];
/** Every hole centre in world coordinates, sorted: what the part drills, however it is stored. */
const worldHoleCentres = (b: Board) => boardHoles(b).map((h) => {
  const local = { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] };
  return axisDimensions(b).map((dim, i) => b.position[i]! + toWorldOffset(b, i, local[dim]));
}).sort((p, q) => p[0]! - q[0]! || p[1]! - q[1]! || p[2]! - q[2]!);
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

  it('a non-square leg set pairs by 180° and the other pair by mirror: one component (fu 432)', () => {
    // A non-square leg turns only by 180°, which pairs FL with BR and FR with BL; FR is FL's mirror image, so FR and BL
    // join FL's Shape as mirrored users (before fu 432: two components).
    const unlinked = designToDocument(d(inside([1.5, 28, 2.5], ''))).doc;
    const { doc } = designToDocument(d(inside([1.5, 28, 2.5])));
    expect(shapeIds(doc).size).toBe(1);
    expect(stored(doc).filter(isShaped).map((b) => [b.name, b.mirrored === true]))
      .toEqual([['Leg FL', false], ['Leg FR', true], ['Leg BL', true], ['Leg BR', false]]);
    expect(world(doc)).toEqual(world(unlinked));
  });

  it('four inside-tapered square legs link by turns, never mirrored (unmirrored candidates come first)', () => {
    const { doc } = designToDocument(d(inside()));
    expect(stored(doc).some((b) => 'mirrored' in b)).toBe(false);
  });

  it('a square flat panel is never turned 90° (its figure would run crosswise)', () => {
    const b = createBoard({ length: 12, width: 12, thickness: 0.75, posture: 'flat', rotation: 0, grain: 'length' });
    expect(turnCandidates(b).map((c) => c.rotation)).toEqual([180]);
  });

  it('a leaning part is never turned (final review M1): its stored turn-0 lean would re-aim under a new rotation', () => {
    const square = createBoard({ length: 16, width: 1.5, thickness: 1.5, posture: 'upright', rotation: 0 });
    expect(turnCandidates(square).map((c) => c.rotation)).toEqual([90, 180, 270]);
    expect(turnCandidates({ ...square, lean: { x: 0.2, z: 0.1, face: 'width' } })).toEqual([]);
  });

  it('a part with a tilted hole row is never turned (angled holes spec §9)', () => {
    const square = createBoard({ length: 16, width: 1.5, thickness: 1.5, posture: 'upright', rotation: 0 });
    const row = { id: 'h', face: 'width' as const, from: 'min' as const, diameter: 0.5, depth: 0.5, along: 'length' as const, alongFrom: 'min' as const,
      station: 8, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.75 };
    expect(turnCandidates({ ...square, holes: [row] }).length).toBeGreaterThan(0);
    expect(turnCandidates({ ...square, holes: [{ ...row, tiltAlong: 0.2 }] })).toEqual([]);
    expect(turnCandidates({ ...square, holes: [{ ...row, tiltAcross: 0.2 }] })).toEqual([]);
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
  it('re-stores a holed part per turn, every hole centre where it was (AI-holes spec §5)', () => {
    const leg: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [3, 0, 4] }),
      holes: [{ id: 'h1', face: 'width', from: 'max', diameter: 0.375, depth: 1, along: 'length', alongFrom: 'max', station: 2, count: 3, pitch: 1.25, acrossFrom: 'min', inset: 0.5 },
        { id: 'h0', face: 'thickness', from: 'min', diameter: 0.25, depth: 'through', along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'max', inset: 0.75 },
        // Metric, 9 mm from a MAX side: its world offset (1.75in − 9 mm) is on neither hole grid, so it must not be snapped.
        { id: 'hm', face: 'width', from: 'min', diameter: 5 / 25.4, depth: 12 / 25.4, along: 'length', alongFrom: 'min', station: 37 / 25.4, count: 4, pitch: 32 / 25.4, acrossFrom: 'max', inset: 9 / 25.4 }] };
    const cs = turnCandidates(leg);
    expect(cs.map((c) => c.rotation)).toEqual([90, 180, 270]);
    // Ids by index from the ORIGINAL's rows sorted canonically: positional only (the turned frame's canonical order may pair
    // an id with another row; alignedTo overwrites them), so this pins the id SET and order, not which row holds which.
    const ids = sortHoleRows(leg.holes).map((r) => r.id);
    for (const c of cs) {
      expect(boardExtents(c)).toEqual(boardExtents(leg));
      expect(worldHoleCentres(c)).toEqual(worldHoleCentres(leg));
      expect(worldHoles(c)).toEqual(worldHoles(leg));
      expect(c.holes.map((r) => r.id)).toEqual(ids);
      expect(sortHoleRows(c.holes)).toEqual(c.holes);
    }
  });

  it('offers no turned candidates for a curved part (curves spec §7)', () => {
    const leg: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), curves: [{ ...ARCH, start: [3, 0], segments: [{ type: 'arc', to: [6, 0], side: 'left', rise: 0.5 }, { type: 'line', to: [3, 0] }] }] };
    expect(turnCandidates({ ...leg, curves: [] }).length).toBeGreaterThan(0);   // the guard refuses, not the box
    expect(turnCandidates(leg)).toEqual([]);
  });

  it('still offers none for a part with a rectangular cut beside its bands (AI-bands spec §5)', () => {
    const edged: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }),
      bands: [{ side: { across: 'width', from: 'min' }, type: BUILT_IN_BAND_ID }] };
    expect(turnCandidates(edged).length).toBeGreaterThan(0);
    expect(turnCandidates({ ...edged, cuts: [{ id: 'k', face: 'width', from: 'min', across: 'length', offset: 2, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 }] })).toEqual([]);
  });
});

describe('linking banded parts (AI-bands spec §5)', () => {
  const stored = (doc: ReturnType<typeof designToDocument>['doc']) => [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const shelf = (name: string, x: number, role = 'shelf'): GeneratedPart =>
    ({ ...part(name, role, [x, 0, 0], [20, 0.75, 10]), bands: [{ edge: '-z', edging: 'veneer' }] });

  it('two equal edged shelves link as ONE Shape', () => {
    const { doc } = designToDocument(d([shelf('Shelf A', 0), shelf('Shelf B', 30)]));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Shelf A', 'Shelf B']);
    expect(flatDocument(doc).boards.every((b) => b.bands.length === 1)).toBe(true);
  });

  it('a turned banded part is re-stored per turn on the same world edge, and links to its twin', () => {
    // A square flat panel turns only by 180° (its figure would run crosswise at 90°), and the band follows its world edge.
    const leg: Board = { ...createBoard({ length: 12, width: 12, thickness: 0.75, posture: 'flat', rotation: 0, grain: 'length', position: [3, 0, 4] }),
      bands: [{ side: { across: 'width', from: 'max' }, type: BUILT_IN_BAND_ID }] };
    const cs = turnCandidates(leg);
    expect(cs.map((c) => c.rotation)).toEqual([180]);
    expect(cs[0]!.bands).not.toEqual(leg.bands);   // stored on the opposite side: the world edge is what is kept
    for (const c of cs) {
      expect(c.bands).toHaveLength(1);
      expect(worldBands(c)).toEqual(worldBands(leg));
    }
    // A twin stored at another turn (its band re-stored there) is not the same stored part, yet links through a turn.
    const twin = { ...cs[0]!, id: 'twin' };
    expect(sameShared(leg, twin)).toBe(false);
    expect(alignedTo(leg, twin)).toBeNull();
    const back = turnCandidates(twin).map((c) => alignedTo(leg, c)).find((x) => x !== null);
    expect(back).toBeDefined();
    expect(worldBands(back!)).toEqual(worldBands(leg));
  });

  it('a part whose bands differ in type or edge does not link', () => {
    const { doc } = designToDocument(d([shelf('Shelf A', 0), { ...shelf('Shelf B', 30), bands: [{ edge: '+x', edging: 'veneer' }] }]));
    expect(doc.shapes).toHaveLength(0);
  });

  // Follow-up 432 (was a recorded limit): mirrored case sides with shelf-pin rows on their inside faces AND edging on
  // their front edges. No turn links them (the 180° turn that mirrors the pin rows moves the band to the other stored
  // face), so the right side becomes the left's Shape's MIRRORED user, every world feature where it was.
  it('mirrored sides with pins inside AND edging on the front edge link as ONE Shape, one user mirrored (fu 432)', () => {
    const pins = (face: '+x' | '-x', z: number) =>
      ({ face, diameter: 0.25, depth: 0.375, through: false, offset: v(face === '+x' ? 0.75 : 0, 10, z), toward: '+y' as const, count: 9, pitch: 1.25 });
    const side = (name: string, x: number, inside: '+x' | '-x', role = 'side'): GeneratedPart =>
      ({ ...part(name, role, [x, 0, 0], [0.75, 30, 12]), holes: [pins(inside, 2), pins(inside, 10)], bands: [{ edge: '-z', edging: 'veneer' }] });
    const world = (doc: ReturnType<typeof designToDocument>['doc']) => flatDocument(doc).boards
      .map((b) => ({ name: b.name, box: boardExtents(b), at: b.position, holes: worldHoleCentres(b), bands: worldBands(b) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const unlinked = designToDocument(d([side('Side L', 0, '+x', ''), side('Side R', 20, '-x', '')])).doc;
    const { doc } = designToDocument(d([side('Side L', 0, '+x'), side('Side R', 20, '-x')]));
    expect(doc.shapes).toHaveLength(1);
    const users = stored(doc).filter(isShaped);
    expect(users.map((b) => [b.name, b.mirrored === true])).toEqual([['Side L', false], ['Side R', true]]);
    expect('mirrored' in users[0]!).toBe(false);   // stored only when true
    expect(world(doc)).toEqual(world(unlinked));
    expect(world(doc).every((p) => p.holes.length === 18 && p.bands.length === 1)).toBe(true);
    // The link survives the loader (schema 21: the flag is an own field of a shaped part).
    expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});

describe('linking holed parts (AI-holes spec §5)', () => {
  const row = (face: '+x' | '-x', z: number) =>
    ({ face, diameter: 0.25, depth: 0.375, through: false, offset: v(face === '+x' ? 0.75 : 0, 10, z), toward: '+y' as const, count: 9, pitch: 1.25 });
  const side = (name: string, x: number, inside: '+x' | '-x', role = 'side'): GeneratedPart =>
    ({ ...part(name, role, [x, 0, 0], [0.75, 30, 12]), holes: [row(inside, 2), row(inside, 10)] });
  // A case's two sides, shelf-pin rows on their INSIDE faces: mirror images, the same part turned 180°.
  const sides = (role = 'side') => [side('Side L', 0, '+x', role), side('Side R', 20, '-x', role)];
  const stored = (doc: ReturnType<typeof designToDocument>['doc']) => [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const world = (doc: ReturnType<typeof designToDocument>['doc']) => flatDocument(doc).boards
    .map((b) => ({ name: b.name, box: boardExtents(b), at: b.position, holes: worldHoleCentres(b) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  it('alignedTo takes the representative\'s hole ids only when the rows match by geometry', () => {
    const r = (id: string, station: number) => ({ id, face: 'width' as const, from: 'max' as const, diameter: 0.25, depth: 0.375 as number | 'through',
      along: 'length' as const, alongFrom: 'min' as const, station, count: 4, pitch: 1.25, acrossFrom: 'min' as const, inset: 2 });
    const rep: Board = { ...createBoard({ length: 30, width: 12, thickness: 0.75, posture: 'upright' }), holes: [r('r1', 2), r('r2', 8)] };
    const same: Board = { ...rep, id: 'other', holes: [r('x1', 2), r('x2', 8)] };
    expect(alignedTo(rep, same)?.holes.map((h) => h.id)).toEqual(['r1', 'r2']);
    expect(alignedTo(rep, { ...same, holes: [r('x1', 2), r('x2', 9)] })).toBeNull();
    expect(alignedTo(rep, { ...same, holes: [r('x1', 2)] })).toBeNull();
    expect(alignedTo(rep, { ...same, holes: [r('x1', 2), r('x2', 8), r('x3', 14)] })).toBeNull();
  });

  it('two equal holed parts of one role link (the hole-id alignment)', () => {
    const { doc } = designToDocument(d([side('Side A', 0, '+x'), side('Side B', 20, '+x')]));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Side A', 'Side B']);
  });

  it('mirrored case sides (pins on their inside faces) link as ONE Shape, each world side unchanged', () => {
    const unlinked = designToDocument(d(sides(''))).doc;   // no role: never linked
    expect(unlinked.shapes).toHaveLength(0);
    const plain = unlinked.boards.filter((b): b is Board => !isShaped(b));   // no shapes: every part is plain
    expect(plain).toHaveLength(2);
    expect(sameShared(plain[0]!, plain[1]!)).toBe(false);   // they differ as stored: only a turn can link them
    const { doc } = designToDocument(d(sides()));
    expect(doc.shapes).toHaveLength(1);
    const users = stored(doc).filter(isShaped);
    expect(users.map((b) => b.name).sort()).toEqual(['Side L', 'Side R']);
    expect(new Set(users.map((b) => b.shape))).toEqual(new Set([doc.shapes[0]!.id]));
    expect(world(doc)).toEqual(world(unlinked));
    expect(world(doc).every((p) => p.holes.length === 18)).toBe(true);
  });

  for (const D of [10, 11.8125]) {
    it(`metric mirrored case sides (D = ${D}, rows 37 mm from the front and the back) link as ONE Shape (final review I1)`, () => {
      const MM = (n: number) => n / 25.4;
      const metricRow = (face: '+x' | '-x', z: number) =>
        ({ face, diameter: MM(5), depth: MM(12), through: false, offset: v(face === '+x' ? 0.75 : 0, MM(64), z), toward: '+y' as const, count: 9, pitch: MM(32) });
      const metricSide = (name: string, x: number, inside: '+x' | '-x', role: string): GeneratedPart =>
        ({ ...part(name, role, [x, 0, 0], [0.75, 30, D]), holes: [metricRow(inside, MM(37)), metricRow(inside, D - MM(37))] });
      const both = (role: string) => [metricSide('Side L', 0, '+x', role), metricSide('Side R', 20, '-x', role)];
      const unlinked = designToDocument(d(both(''))).doc;
      const { doc } = designToDocument(d(both('side')));
      expect(doc.shapes).toHaveLength(1);
      expect(stored(doc).filter(isShaped).map((b) => b.name).sort()).toEqual(['Side L', 'Side R']);
      // Each world side unchanged; a metric centre read through another stored form may differ by an ulp.
      const near = (x: ReturnType<typeof world>) => x.map((p) => ({ ...p, holes: p.holes.map((h) => h.map((c) => Math.round(c * 1e9) / 1e9)) }));
      expect(near(world(doc))).toEqual(near(world(unlinked)));
      expect(world(doc).every((p) => p.holes.length === 18)).toBe(true);
      // Every row stores 37 mm from its side, exactly.
      for (const b of flatDocument(doc).boards) expect(b.holes.map((h) => h.inset)).toEqual([MM(37), MM(37)]);
    });
  }

  it('sides whose rows differ do not link', () => {
    const ps = sides();
    ps[1] = { ...ps[1]!, holes: [row('-x', 2), row('-x', 9)] };
    expect(designToDocument(d(ps)).doc.shapes).toHaveLength(0);
  });
});

describe('linking profiled parts (AI-profiles spec §5)', () => {
  const top = (name: string, x: number, role = 'top'): GeneratedPart =>
    ({ ...part(name, role, [x, 0, 0], [20, 0.75, 10]),
      profiles: [{ edge: ['+y', '+z'], kind: 'roundover', size: 0.25, fillet: 0, depth: 0, facing: 'face', allRound: false, start: 0, end: 20 }] });

  it('two equal profiled tops link as ONE Shape and keep their profile', () => {
    const { doc } = designToDocument(d([top('Top A', 0), top('Top B', 30)]));
    expect(doc.shapes).toHaveLength(1);
    expect(flatDocument(doc).boards.every((b) => b.profiles.length === 1)).toBe(true);
  });

  it('tops whose profiles differ do not link', () => {
    const b = top('Top B', 30);
    const { doc } = designToDocument(d([top('Top A', 0), { ...b, profiles: [{ ...b.profiles![0]!, size: 0.375 }] }]));
    expect(doc.shapes).toHaveLength(0);
  });

  it('a quarter-turned square profiled part is re-stored per turn on the same world edge, ids by index, and links to its twin', () => {
    const base = createBoard({ length: 12, width: 12, thickness: 0.75, posture: 'flat', rotation: 0, grain: 'length', position: [3, 0, 4] });
    const leg: Board = { ...base, profiles: [{ id: 'pa', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face',
      run: { start: { side: { across: 'width', from: 'max' }, from: 'max', at: 2 }, end: { side: { across: 'width', from: 'max' }, from: 'min', at: 2 } } } as never] };
    const w = worldProfiles(leg);
    expect(w).not.toBeNull();
    const cs = turnCandidates(leg);
    expect(cs.length).toBeGreaterThan(0);   // the guard no longer refuses a profiled part
    for (const c of cs) {
      expect(c.profiles).toHaveLength(1);
      expect(worldProfiles(c)).toEqual(w);
    }
    const twin = { ...cs[0]!, id: 'twin', profiles: cs[0]!.profiles.map((p) => ({ ...p, id: 'zz' })) };
    expect(alignedTo(leg, twin)).toBeNull();   // stored at another turn: not the same stored part
    const back = turnCandidates(twin).map((c) => alignedTo(leg, c)).find((x) => x !== null);
    expect(back).toBeDefined();
    expect(back!.profiles.map((p) => p.id)).toEqual(['pa']);   // the representative's id is adopted
  });

  it.each([2.0123456, 1 / 3, 2 + 1 / 3])('a turn never moves an off-grid stop (the exact set), at %s', (AT) => {
    const base = createBoard({ length: 12, width: 12, thickness: 0.75, posture: 'flat', rotation: 0, grain: 'length', position: [3, 0, 4] });
    const leg: Board = { ...base, profiles: [{ id: 'pa', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face',
      run: { start: { side: { across: 'width', from: 'max' }, from: 'max', at: AT }, end: { side: { across: 'width', from: 'max' }, from: 'min', at: 2 } } } as never] };
    const w = worldProfiles(leg)!;
    const cs = turnCandidates(leg);
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) expect(worldProfiles(c)).toEqual(w);
    // The turn and back returns the original station exactly, and the turned twin links.
    const back = turnCandidates({ ...cs[0]!, id: 'twin' }).map((c) => alignedTo(leg, c)).find((x) => x !== null);
    expect(back).toBeDefined();
    expect((back!.profiles[0]!.run as never as { start: { at: number } }).start.at).toBe(AT);
  });

  it('a part with a two-side run never turns', () => {
    const base = createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' });
    const mkEnd = (from: 'min' | 'max', across: 'width' | 'length', at: number) =>
      ({ side: { across, from }, from: 'min', at }) as never;
    const two: Board = { ...base, profiles: [{ id: 'q', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face',
      run: { start: mkEnd('min', 'width', 1), end: mkEnd('min', 'length', 1) } } as never] };
    expect(turnCandidates({ ...two, profiles: [] }).length).toBeGreaterThan(0);
    expect(turnCandidates(two)).toEqual([]);
  });
});

describe('mirror twins (fu 432, mirrored-links spec §5.1)', () => {
  const stored = (doc: SloydDocument) => [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const features = (b: Board) => ({ name: b.name, box: boardExtents(b), at: b.position, holes: worldHoleCentres(b), bands: worldBands(b),
    angles: worldAngles(b), tapers: worldTapers(b), profiles: worldProfiles(b) });
  const pins = (face: '+x' | '-x', z: number) =>
    ({ face, diameter: 0.25, depth: 0.375, through: false, offset: v(face === '+x' ? 0.75 : 0, 10, z), toward: '+y' as const, count: 9, pitch: 1.25 });
  // Case sides, pins on their inside faces, edging on the front: only a TURNED mirror candidate links them.
  const edged = (name: string, x: number, inside: '+x' | '-x', role = 'side'): GeneratedPart =>
    ({ ...part(name, role, [x, 0, 0], [0.75, 30, 12]), holes: [pins(inside, 2), pins(inside, 10)], bands: [{ edge: '-z', edging: 'veneer' }] });
  const caseSides = () => {
    const doc = designToDocument(d([edged('Side L', 0, '+x', ''), edged('Side R', 20, '-x', '')])).doc;
    return doc.boards as Board[];
  };
  const docOf = (boards: Board[], definitions: SloydDocument['definitions'] = []): SloydDocument =>
    ({ ...createDocument('T'), boards, definitions });

  it('mirrorCandidates: the part and each turn, features mirrored, flagged; each resolves to the part\'s own world', () => {
    const [, right] = caseSides();
    const cs = mirrorCandidates(right!);
    expect(cs.map((c) => [c.rotation, c.mirrored])).toEqual([[90, true], [270, true]]);
    // A flagged candidate as a stored user draws mirrorFeatures of its stored features: the part itself, exactly.
    for (const c of cs) expect(features(mirrorFeatures(c))).toEqual(features(right!));
  });

  it('pins-only case sides still link by the 180° turn, unmirrored (unmirrored candidates come first)', () => {
    // Mutation check: trying mirror candidates before turns stores Side R mirrored at 270 — this fails then.
    const row = (face: '+x' | '-x', z: number) => pins(face, z);
    const side = (name: string, x: number, inside: '+x' | '-x'): GeneratedPart =>
      ({ ...part(name, 'side', [x, 0, 0], [0.75, 30, 12]), holes: [row(inside, 2), row(inside, 10)] });
    const { doc } = designToDocument(d([side('Side L', 0, '+x'), side('Side R', 20, '-x')]));
    expect(doc.shapes).toHaveLength(1);
    expect(stored(doc).filter(isShaped).map((b) => [b.name, 'mirrored' in b])).toEqual([['Side L', false], ['Side R', false]]);
  });

  for (const [posture, rotation] of [['upright', 0], ['flat', 90], ['on-edge', 270]] as const) {
    it(`a curved mirror pair (chiralCurved, ${posture} at ${rotation}°) links by the UNTURNED mirror candidate`, () => {
      const left: Board = { ...chiralCurved(posture), id: 'L', name: 'Left', rotation, position: [0, 0, 0] };
      const right: Board = { ...mirrorInPlace(left), id: 'R', name: 'Right', position: [30, 0, 0] };
      expect(turnCandidates(right)).toEqual([]);
      expect(mirrorCandidates(right)).toHaveLength(1);
      const before = docOf([left, right]);
      const doc = linkByRole(before, new Map([['L', 'side'], ['R', 'side']]));
      expect(doc.shapes).toHaveLength(1);
      expect(doc.boards.map((b) => [b.id, isShaped(b), b.mirrored === true])).toEqual([['L', true, false], ['R', true, true]]);
      // The world parts are the input's, field for field (curves and rectangular cuts included).
      const strip = (b: Board) => { const { shape: _s, mirrored: _m, ...rest } = b; return rest; };
      expect(worldParts(doc).map(strip)).toEqual(worldParts(before).map(strip));
    });
  }

  it('a part with no twin (a near-miss of a mirror image) is stored exactly as input, no flag', () => {
    // Side R with its rows a little off (9 not 10 from the front): no candidate, mirrored or not, matches Side L.
    const [left] = caseSides();
    const near = designToDocument(d([{ ...edged('Side R', 20, '-x', ''), holes: [pins('-x', 2), pins('-x', 9)] }])).doc.boards[0] as Board;
    expect(mirrorCandidates(near).length).toBeGreaterThan(0);
    const doc = linkByRole(docOf([left!, near]), new Map([[left!.id, 'side'], [near.id, 'side']]));
    expect(doc.shapes).toHaveLength(0);
    expect(doc.boards).toEqual([left, near]);   // a one-user Shape dissolves to an equal copy, as for any part
    expect(stored(doc).some((b) => 'mirrored' in b)).toBe(false);
  });

  // In `stored` order (loose parts, then each definition's) the first is the representative and the second the mirror
  // candidate. A definition nothing places is never seen by linksToShapes, which judges worldParts.
  it('a mirror candidate linksToShapes leaves plain is replaced by the ORIGINAL part (never stored)', () => {
    // Loose Side R is the representative (it builds a Shape alone and dissolves); Side L, its mirror twin, sits in a
    // definition nothing places, so its candidate is never converted. Mutation check: without the restore, Side L is
    // stored as the plain candidate with reflected features and the flag.
    const [left, right] = caseSides();
    const def = { id: 'D', boards: [left!], instances: [], hardware: [] };
    const doc = linkByRole(docOf([right!], [def]), new Map([[left!.id, 'side'], [right!.id, 'side']]));
    expect(doc.shapes).toHaveLength(0);
    expect(doc.definitions[0]!.boards[0]).toBe(left);
    expect(doc.boards[0]).toEqual(right);   // a one-user Shape dissolves to an equal copy, as for any part
    expect(stored(doc).some((b) => 'mirrored' in b)).toBe(false);
  });

  it('a mirror candidate left the ONLY user of its Shape is replaced by the ORIGINAL part (never stored)', () => {
    // Side R, the representative, sits in an UNPLACED definition; Side L, in a placed one, is its mirror candidate and
    // alone builds the Shape. Mutation check: without the restore, dissolveShapes stores it at the candidate's turn.
    const [left, right] = caseSides();
    const unplaced = { id: 'D1', boards: [right!], instances: [], hardware: [] };
    const placed = { id: 'D2', boards: [left!], instances: [], hardware: [] };
    const doc0: SloydDocument = { ...docOf([], [unplaced, placed]),
      instances: [{ id: 'I', name: 'Case', definition: 'D2', position: [0, 0, 0], rotation: 0 }] };
    const doc = linkByRole(doc0, new Map([[left!.id, 'side'], [right!.id, 'side']]));
    expect(doc.shapes).toHaveLength(0);
    expect(doc.definitions[1]!.boards[0]).toBe(left);
    expect(doc.definitions[0]!.boards[0]).toBe(right);
  });
});

describe('round tenons in linkByRole (round tenons spec §3.1)', () => {
  // A plain flat rung, chiral by its tenon alone: one on the max end only.
  const T = { id: 't1', end: 'max' as const, diameter: 0.75, length: 1 };
  const rung = (): Board => ({ ...createBoard({ id: 'L', name: 'Left', length: 18, width: 1.5, thickness: 1.25, posture: 'flat' }), tenons: [T] });
  const strip = (b: Board) => { const { shape: _s, mirrored: _m, ...rest } = b; return rest; };
  const world = (doc: SloydDocument) => worldParts(doc).map(strip).map(({ tenons, ...rest }) => ({ ...rest, tenons: tenons?.map(({ id: _id, ...t }) => t) }));

  it('linkByRole\'s mirror candidate mirrors the tenon', () => {
    const left = rung();
    const right: Board = { ...mirrorInPlace(left), id: 'R', name: 'Right', position: [30, 0, 0], tenons: [{ ...T, id: 't9', end: 'min' }] };
    expect(mirrorCandidates(right).map((c) => c.tenons)).toEqual([[{ ...T, id: 't9', end: 'max' }]]);
    const before: SloydDocument = { ...createDocument('T'), boards: [left, right] };
    const doc = linkByRole(before, new Map([['L', 'rung'], ['R', 'rung']]));
    expect(doc.shapes).toHaveLength(1);
    expect(doc.boards.map((b) => [b.id, isShaped(b), b.mirrored === true])).toEqual([['L', true, false], ['R', true, true]]);
    expect(doc.shapes[0]!.tenons).toEqual([T]);
    // Each world part keeps its tenon on its own end.
    expect(world(doc)).toEqual(world(before));
  });

  it('turnCandidates(tenoned) = [] (a turn would carry the stored end to the other world end)', () => {
    const left = rung();
    expect(turnCandidates(left)).toEqual([]);
    // The same rung turned 180°: its tenon on the other world end. Linked by a turn, it would move.
    const turned: Board = { ...left, id: 'R', name: 'Right', rotation: 180, position: [30, 0, 0], tenons: [{ ...T, id: 't9' }] };
    const before: SloydDocument = { ...createDocument('T'), boards: [left, turned] };
    const doc = linkByRole(before, new Map([['L', 'rung'], ['R', 'rung']]));
    expect(world(doc)).toEqual(world(before));
  });
});
