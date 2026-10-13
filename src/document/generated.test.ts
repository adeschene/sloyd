import { NAME_SEPARATOR, worldParts } from './tree';
import { flatDocument, migrateDocument } from './document';
import { describe, expect, it } from 'vitest';
import { designToDocument, orient, parseDesign, DESIGN_SCHEMA, MAX_MAGNITUDE } from './generated';
import type { GeneratedAssembly, GeneratedDesign, GeneratedPart } from './generated';
import { boardExtents } from './geometry';
import { MATERIALS } from './types';
import { worldTapers } from './taperWorld';
import { rejectedViolations } from './designCheck';
import type { Board } from './types';

const part = (name: string, at: [number, number, number], size: [number, number, number], material = 'pine', role = ''): GeneratedPart => ({
  name, role, material, tapers: [],
  at: { x: at[0], y: at[1], z: at[2] },
  size: { x: size[0], y: size[1], z: size[2] },
});
const design = (...parts: GeneratedPart[]): GeneratedDesign => ({ name: 'Test', parts, assemblies: [] });
const v = (x: number, y: number, z: number) => ({ x, y, z });

// Bound from OUTSIDE the converter: the expected extents come from the
// existing boardExtents, never from orient's own arithmetic (invariant 23).
const asBoard = (o: ReturnType<typeof orient>): Board => ({
  id: 'x', name: 'x', position: [0, 0, 0], grain: 'length', material: 'pine', cuts: [], angleCuts: [], ...o,
});

describe('orient', () => {
  const PERMUTATIONS: [number, number, number][] = [
    [30, 0.75, 11], [30, 11, 0.75], [11, 30, 0.75],
    [0.75, 30, 11], [11, 0.75, 30], [0.75, 11, 30],
  ];
  it.each(PERMUTATIONS)('reproduces world size %s', (x, y, z) => {
    expect(boardExtents(asBoard(orient([x, y, z])))).toEqual([x, y, z]);
  });
  it('makes the longest side length and the shortest thickness', () => {
    const o = orient([11, 30, 0.75]);
    expect([o.length, o.width, o.thickness]).toEqual([30, 11, 0.75]);
  });
  it.each([[[24, 24, 0.75]], [[12, 12, 12]], [[0.75, 24, 24]]] as [[number, number, number]][])(
    'handles ties: %s', (size) => {
      expect(boardExtents(asBoard(orient(size)))).toEqual(size);
    });
});

describe('designToDocument', () => {
  it('rounds every at and size component to 1/16"', () => {
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [10.03, 0.74, 3.97])));
    expect(boardExtents(worldParts(doc)[0])).toEqual([10, 0.75, 4]);
  });

  it('puts the design on the floor and centres its footprint on the origin', () => {
    const { doc } = designToDocument(design(
      part('A', [10, 5, 20], [4, 1, 2]),
      part('B', [14, 5, 20], [4, 1, 2]),
    ));
    const [a, b] = doc.boards;
    expect(a.position).toEqual([-4, 0, -1]);
    expect(b.position).toEqual([0, 0, -1]);
  });

  it('keeps every translated position on the 1/16" grid', () => {
    // footprint 1/16 wide: centring by half of it would land on 1/32
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [1 / 16, 1, 1])));
    const x = worldParts(doc)[0].position[0];
    expect(Math.round(x * 16)).toBe(x * 16);
  });

  it('rejects a part with a non-finite number and keeps the rest', () => {
    const { doc, rejected } = designToDocument(design(
      part('Bad', [0, 0, 0], [Number.NaN, 1, 1]),
      part('Good', [0, 0, 0], [10, 1, 1]),
    ));
    expect(rejected).toEqual([{ name: 'Bad', reason: 'not-finite' }]);
    expect(worldParts(doc).map((b) => b.name)).toEqual(['Good']);
    expect(worldParts(doc).flatMap((b) => b.position).every(Number.isFinite)).toBe(true);
  });

  it.each([
    ['a size', [0, 0, 0], [1e308, 1, 1]],
    ['a position', [1e308, 0, 0], [10, 1, 1]],
  ] as const)('rejects %s that is finite but overflows when snapped (1e308 / (1/16) = Infinity)', (_, at, size) => {
    const { doc, rejected } = designToDocument(design(
      part('Huge', [...at], [...size]),
      part('Good', [0, 0, 0], [10, 1, 1]),
    ));
    expect(rejected).toEqual([{ name: 'Huge', reason: 'not-finite' }]);
    expect(worldParts(doc).map((b) => b.name)).toEqual(['Good']);
  });

  it.each([[0], [-2], [0.01]])('rejects a part whose size rounds to %s or below zero as too-small', (s) => {
    const { rejected } = designToDocument(design(part('Thin', [0, 0, 0], [10, s, 1])));
    expect(rejected).toEqual([{ name: 'Thin', reason: 'too-small' }]);
  });

  it('passes the result through migrateDocument — duplicate names are deduped', () => {
    const { doc } = designToDocument(design(
      part('Shelf', [0, 0, 0], [10, 1, 1]),
      part('Shelf', [0, 1, 0], [10, 1, 1]),
    ));
    const names = worldParts(doc).map((b) => b.name);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toBe('Shelf');
    expect(new Set(worldParts(doc).map((b) => b.id)).size).toBe(2);
  });

  it('falls back to a default name when the design name is blank', () => {
    expect(designToDocument({ name: '   ', parts: [] }).doc.name).toBe('Generated design');
  });

  it('generates no cuts and grain along length', () => {
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [10, 1, 1])));
    expect(worldParts(doc)[0].cuts).toEqual([]);
    expect(worldParts(doc)[0].grain).toBe('length');
  });
});

const asm = (name: string, parts: GeneratedPart[], ...placements: [string, [number, number, number]][]): GeneratedAssembly => ({
  name, parts, placements: placements.map(([n, at]) => ({ name: n, at: v(...at) })),
});
const withAsm = (parts: GeneratedPart[], ...assemblies: GeneratedAssembly[]): GeneratedDesign => ({ name: 'Test', parts, assemblies });
const FRONT = part('Front', [0, 0, 0], [10, 4, 0.75]);

describe('designToDocument — assemblies', () => {
  it('places every copy at origin + local, after snap and centre', () => {
    const { doc } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['Drawer 1', [0, 0, 0]], ['Drawer 2', [0, 5.01, 0]])));
    // x 0..10 → shift -5; z 0..0.75 → shift -0.375 (6/16, on the grid); y min 0.
    expect(worldParts(doc).map((b) => b.position)).toEqual([[-5, 0, -0.375], [-5, 5, -0.375]]);
  });

  it('a model-written › becomes > in every name it writes (fu 227)', () => {
    const { doc } = designToDocument(withAsm([part('Top › lid', [0, 9, 0], [10, 1, 4])],
      asm('Case › left', [part('Side › A', [0, 0, 0], [10, 4, 0.75])], ['Copy › 1', [0, 0, 0]])));
    expect(flatDocument(doc).boards.map((b) => b.name)).toEqual(['Top > lid', 'Copy > 1 › Side > A']);
    expect(doc.definitions[0]!.boards[0]!.name).toBe('Side > A');
  });

  it('never shifts definition-local coordinates', () => {
    const { doc } = designToDocument(withAsm([part('Base', [40, 0, 40], [4, 1, 4])], asm('Drawer', [FRONT], ['D', [0, 3, 0]])));
    expect(doc.definitions[0].boards[0].position).toEqual([0, 0, 0]);
  });

  it('works when the local min corner is not at the origin (review focus 1)', () => {
    const local = part('Front', [5, 0, 5], [10, 4, 0.75]);
    const { doc } = designToDocument(withAsm([], asm('Drawer', [local], ['A', [0, 0, 0]], ['B', [20, 0, 0]])));
    const xs = worldParts(doc).map((b) => b.position[0]);
    // world x spans 5..35 → centred → -15..15
    expect(xs).toEqual([-15, 5]);
    expect(Math.min(...worldParts(doc).map((b) => b.position[1]))).toBe(0);
  });

  it('shares one definition across placements, unturned', () => {
    const { doc } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['A', [0, 0, 0]], ['B', [0, 5, 0]], ['C', [0, 10, 0]])));
    expect(doc.definitions).toHaveLength(1);
    expect(doc.instances.map((i) => i.definition)).toEqual(Array(3).fill(doc.definitions[0].id));
    expect(doc.instances.every((i) => i.rotation === 0)).toBe(true);
  });

  it('dedupes a placement name against a loose part (review focus 2)', () => {
    const { doc, authored } = designToDocument(withAsm([part('Drawer', [30, 0, 0], [4, 1, 4])], asm('Drawer', [FRONT], ['Drawer', [0, 0, 0]])));
    const flatNames = flatDocument(doc).boards.map((b) => b.name);
    expect(new Set(flatNames).size).toBe(flatNames.length);
    for (const n of flatNames) expect(authored.parts.has(n)).toBe(true);
  });

  it('dedupes three placements all named "Drawer", and the index follows (review focus 2)', () => {
    const { doc, authored } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['Drawer', [0, 0, 0]], ['Drawer', [0, 5, 0]], ['Drawer', [0, 10, 0]])));
    const stored = doc.instances.map((i) => i.name);
    expect(new Set(stored).size).toBe(3);
    expect(authored.placements.get('Drawer')).toEqual(stored);
    expect([...authored.parts.keys()].sort()).toEqual(flatDocument(doc).boards.map((b) => b.name).sort());
  });

  it('indexes every flat display name back to what the model wrote', () => {
    const { doc, authored } = designToDocument(withAsm(
      [part('Top', [0, 10, 0], [20, 1, 20])],
      asm('Drawer', [FRONT, part('Side', [0, 0, 0.75], [0.75, 4, 10])], ['Upper', [0, 5, 0]], ['Lower', [0, 0, 0]]),
    ));
    const flat = flatDocument(doc).boards.map((b) => b.name).sort();
    expect([...authored.parts.keys()].sort()).toEqual(flat);
    expect(authored.parts.get(`Upper${NAME_SEPARATOR}Side`)).toEqual({ label: `Drawer${NAME_SEPARATOR}Side`, assembly: 'Drawer', placement: 'Upper' });
    expect(authored.parts.get('Top')).toEqual({ label: 'Top', assembly: null, placement: null });
    expect(authored.placements.get('Drawer')).toEqual(['Upper', 'Lower']);
  });

  it('keeps two same-named assemblies apart in the index (review focus 2)', () => {
    const { authored } = designToDocument(withAsm([], asm('Box', [FRONT], ['A', [0, 0, 0]]), asm('Box', [FRONT], ['B', [20, 0, 0]])));
    expect([...authored.placements.keys()]).toHaveLength(2);
  });

  it('drops an unplaced assembly and an all-rejected one, and says so', () => {
    const { doc, rejected } = designToDocument(withAsm(
      [part('Top', [0, 0, 0], [20, 1, 20])],
      asm('Ghost', [FRONT]),
      asm('Thin', [part('Sliver', [0, 0, 0], [10, 0.01, 1])], ['T', [0, 0, 0]]),
    ));
    expect(rejected).toEqual([
      { name: 'Ghost', reason: 'unplaced' },
      { name: `Sliver (in assembly Thin)`, reason: 'too-small' },
      { name: 'Thin', reason: 'empty' },
    ]);
    expect(doc.definitions).toHaveLength(0);
    expect(doc.instances).toHaveLength(0);
  });

  it('rejects a placement with a non-finite origin and keeps the others', () => {
    const { doc, rejected } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['Bad', [Number.NaN, 0, 0]], ['Good', [0, 0, 0]])));
    expect(rejected).toEqual([{ name: 'Bad (placement of Drawer)', reason: 'not-finite' }]);
    expect(doc.instances.map((i) => i.name)).toEqual(['Good']);
  });

  it('reports an assembly whose placements are all non-finite as unplaced (F7)', () => {
    const { doc, rejected } = designToDocument(withAsm([part('Top', [0, 0, 0], [20, 1, 20])], asm('Drawer', [FRONT], ['A', [Number.NaN, 0, 0]], ['B', [0, Infinity, 0]])));
    expect(rejected).toEqual([
      { name: 'A (placement of Drawer)', reason: 'not-finite' },
      { name: 'B (placement of Drawer)', reason: 'not-finite' },
      { name: 'Drawer', reason: 'unplaced' },
    ]);
    expect(doc.instances).toHaveLength(0);
  });

  it('rejects a loose part at 1.1e307 (centring overflow) and keeps the rest (F3)', () => {
    const { doc, rejected } = designToDocument(design(part('Far', [1.1e307, 0, 0], [10, 1, 1]), part('Good', [0, 0, 0], [10, 1, 1])));
    expect(rejected).toEqual([{ name: 'Far', reason: 'not-finite' }]);
    expect(worldParts(doc).map((b) => b.name)).toEqual(['Good']);
  });

  it('rejects the only placement at 1.1e307 and reports the assembly unplaced (F3)', () => {
    const { doc, rejected } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['Far', [1.1e307, 0, 0]])));
    expect(rejected).toEqual([
      { name: 'Far (placement of Drawer)', reason: 'not-finite' },
      { name: 'Drawer', reason: 'unplaced' },
    ]);
    expect(doc.boards).toHaveLength(0);
    expect(doc.instances).toHaveLength(0);
  });

  it('accepts exactly MAX_MAGNITUDE and rejects one grid step beyond it (F3)', () => {
    expect(MAX_MAGNITUDE).toBe(10_000);
    const ok = designToDocument(design(part('Edge', [10000, 0, 0], [10, 1, 1]), part('Big', [0, 0, 0], [10000, 1, 1])));
    expect(ok.rejected).toEqual([]);
    const bad = designToDocument(design(part('Edge', [10000.0625, 0, 0], [10, 1, 1]), part('Big', [0, 0, 0], [10000.0625, 1, 1]), part('Ok', [0, 0, 0], [1, 1, 1])));
    expect(bad.rejected.map((r) => r.name)).toEqual(['Edge', 'Big']);
    const pl = designToDocument(withAsm([], asm('Drawer', [FRONT], ['In', [10000, 0, 0]], ['Out', [0, 10000.0625, 0]])));
    expect(pl.rejected).toEqual([{ name: 'Out (placement of Drawer)', reason: 'not-finite' }]);
  });

  it('replaces the name separator in model names so flat names stay unambiguous (F4)', () => {
    const { doc, authored } = designToDocument(withAsm(
      [part(`D1${NAME_SEPARATOR}Front`, [30, 0, 0], [4, 1, 4])],
      asm('Drawer', [FRONT], ['D1', [0, 0, 0]]),
    ));
    const names = flatDocument(doc).boards.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('D1 > Front');
    expect(authored.parts.get('D1 > Front')).toEqual({ label: 'D1 > Front', assembly: null, placement: null });
    expect(authored.parts.get(`D1${NAME_SEPARATOR}Front`)).toMatchObject({ assembly: 'Drawer' });
  });

  it('survives another migrateDocument unchanged', () => {
    const { doc } = designToDocument(withAsm([part('Top', [0, 10, 0], [20, 1, 20])], asm('Drawer', [FRONT], ['A', [0, 0, 0]], ['B', [0, 5, 0]])));
    expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});

describe('parseDesign', () => {
  const asm = (over: Record<string, unknown> = {}) => ({
    name: 'Drawer', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])], placements: [{ name: 'Drawer 1', at: v(0, 0, 0) }], ...over,
  });
  it('rejects a design with no parts anywhere, even with an assembly (F7)', () => {
    expect(parseDesign({ name: 'T', parts: [], assemblies: [{ name: 'A', parts: [], placements: [{ name: 'P', at: v(0, 0, 0) }] }] })).toBeNull();
  });
  it('accepts a well-formed design', () => {
    const d = design(part('A', [0, 0, 0], [1, 2, 3]));
    expect(parseDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('accepts a design with assemblies', () => {
    const d = { ...design(part('A', [0, 0, 0], [1, 2, 3])), assemblies: [asm()] };
    expect(parseDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('accepts a design whose only parts are in assemblies', () => {
    const d = { name: 'x', parts: [], assemblies: [asm()] };
    expect(parseDesign(d)).toEqual(d);
  });
  const okPart = { name: 'A', role: '', tapers: [], material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1) };
  it.each([
    null, 42, {}, { name: 'x' },
    { name: 'x', parts: [], assemblies: [] },                                   // no parts at all
    { name: 'x', parts: [okPart] },                                             // assemblies missing
    { name: 'x', parts: [{ ...okPart, role: undefined }], assemblies: [] },     // role missing
    { name: 'x', parts: [{ ...okPart, at: { x: 0, y: 0 } }], assemblies: [] },
    { name: 'x', parts: [{ ...okPart, material: 'constructor' }], assemblies: [] },
    { name: 'x', parts: [{ ...okPart, material: 'unobtanium' }], assemblies: [] },
    { name: 'x', parts: [okPart], assemblies: [{ name: 'D', parts: [{ ...okPart, material: 'unobtanium' }], placements: [] }] },
    { name: 'x', parts: [okPart], assemblies: [{ name: 'D', parts: [okPart], placements: [{ name: 'P', at: { x: 0, y: 0 } }] }] },
    { name: 'x', parts: [okPart], assemblies: [{ name: 'D', parts: [okPart] }] },  // placements missing
    { name: 'x', parts: [okPart], assemblies: [{ parts: [okPart], placements: [] }] }, // name missing
  ])('rejects %j', (bad) => {
    expect(parseDesign(bad)).toBeNull();
  });
});

describe('DESIGN_SCHEMA', () => {
  it("offers exactly MATERIALS' keys", () => {
    const parts = (DESIGN_SCHEMA as any).properties.parts.items;
    expect(parts.properties.material.enum).toEqual(Object.keys(MATERIALS));
  });
  it('sets additionalProperties: false on every object', () => {
    const walk = (s: any): boolean =>
      s.type === 'array' ? walk(s.items)
        : s.type !== 'object' || (s.additionalProperties === false && Object.values(s.properties).every(walk));
    expect(walk(DESIGN_SCHEMA)).toBe(true);
  });
  it('requires role, assemblies and placements', () => {
    const s = DESIGN_SCHEMA as any;
    expect(s.required).toEqual(['name', 'parts', 'assemblies']);
    expect(s.properties.parts.items.required).toEqual(['name', 'role', 'material', 'at', 'size', 'tapers']);
    const a = s.properties.assemblies.items;
    expect(a.required).toEqual(['name', 'parts', 'placements']);
    expect(a.properties.parts.items).toBe(s.properties.parts.items);
    expect(a.properties.placements.items.required).toEqual(['name', 'at']);
  });
});

describe('parseDesign — normalised copy', () => {
  it('drops keys the schema does not have, at every level', () => {
    const raw = {
      name: 'x', extra: 1,
      parts: [{ name: 'A', role: '', tapers: [], material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1), grain: 'width', junk: true }],
      assemblies: [{ name: 'D', note: 'n', parts: [{ name: 'F', role: '', tapers: [], material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1), grain: 'width' }],
        placements: [{ name: 'P', at: { x: 0, y: 0, z: 0, w: 9 }, extra: 2 }] }],
    };
    const d = parseDesign(raw)!;
    expect(d).toEqual({
      name: 'x',
      parts: [{ name: 'A', role: '', tapers: [], material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1) }],
      assemblies: [{ name: 'D', parts: [{ name: 'F', role: '', tapers: [], material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1) }], placements: [{ name: 'P', at: v(0, 0, 0) }] }],
    });
    expect(d).not.toBe(raw);
  });
});

describe('designToDocument — options', () => {
  it('uses a valid grain on the part, and ignores an invalid one', () => {
    const { doc } = designToDocument(design(
      { ...part('A', [0, 0, 0], [10, 1, 4]), grain: 'width' },
      { ...part('B', [0, 1, 0], [10, 1, 4]), grain: 'diagonal' as never },
    ));
    expect(worldParts(doc).map((b) => b.grain)).toEqual(['width', 'length']);
  });

  it('with centre: false keeps X and Z, and still puts the lowest part on the floor', () => {
    const { doc } = designToDocument(design(
      part('A', [10, 5, 20], [4, 1, 2]),
      part('B', [14, 5, 20], [4, 1, 2]),
    ), { centre: false });
    expect(doc.boards.map((b) => b.position)).toEqual([[10, 0, 20], [14, 0, 20]]);
  });

  it('with centre: false a design the model lowered stays lowered (review focus 1)', () => {
    // The model removed a 4in toe kick and lowered the case onto the floor.
    const { doc } = designToDocument(design(part('Case', [0, 0, 0], [20, 30, 12])), { centre: false });
    expect(doc.boards[0].position).toEqual([0, 0, 0]);
  });

  it('shifts instance origins, never definition-local coordinates, with centre: false', () => {
    const { doc } = designToDocument({ name: 'T', parts: [], assemblies: [{ name: 'D', parts: [part('F', [0, 0, 0], [10, 4, 0.75])],
      placements: [{ name: 'P', at: v(7, 3, 9) }] }] }, { centre: false });
    expect(doc.instances[0].position).toEqual([7, 0, 9]);
    expect(doc.definitions[0].boards[0].position).toEqual([0, 0, 0]);
  });
});

describe('tapers in the design (AI-tapers spec §2)', () => {
  const legPart = (tapers: unknown) => ({ name: 'Leg', role: 'leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, tapers });
  const json = (tapers: unknown) => ({ name: 'T', parts: [legPart(tapers)], assemblies: [] });

  it('the schema requires tapers on every part, with Dir enums', () => {
    const part = (DESIGN_SCHEMA.properties as any).parts.items;
    expect(part.required).toContain('tapers');
    expect(part.properties.tapers.items.properties.toward.enum).toEqual(['+x', '-x', '+y', '-y', '+z', '-z']);
    expect(part.properties.tapers.items.required).toEqual(['faces', 'toward', 'start', 'amount']);
  });
  it('parseDesign refuses a part without tapers or with a malformed one, and copies only schema fields', () => {
    expect(parseDesign({ name: 'T', parts: [{ ...legPart([]), tapers: undefined }], assemblies: [] })).toBeNull();
    expect(parseDesign(json([{ faces: ['up'], toward: '-y', start: 1, amount: 1 }]))).toBeNull();
    expect(parseDesign(json([{ faces: ['+x'], toward: '-y', start: '1', amount: 1 }]))).toBeNull();
    const ok = parseDesign(json([{ faces: ['+x'], toward: '-y', start: 22, amount: 0.5, extra: 1 }]))!;
    expect(ok.parts[0]!.tapers).toEqual([{ faces: ['+x'], toward: '-y', start: 22, amount: 0.5 }]);
  });
  it('converts a tapered leg to stored tapers that read back in world words', () => {
    const { doc, rejected } = designToDocument(parseDesign(json([{ faces: ['+z', '+x'], toward: '-y', start: 22, amount: 0.5 }]))!);
    expect(rejected).toEqual([]);
    const leg = doc.boards[0]! as Board;
    expect(leg.angleCuts.every((c) => c.kind === 'taper')).toBe(true);
    expect(worldTapers(leg)).toEqual([{ faces: ['+x', '+z'], toward: '-y', start: 22, amount: 0.5 }]);
  });
  it('snaps start and amount like size, unless exact', () => {
    const d = parseDesign(json([{ faces: ['+x'], toward: '-y', start: 22.03, amount: 0.51 }]))!;
    expect(worldTapers(designToDocument(d).doc.boards[0]! as Board)).toEqual([{ faces: ['+x'], toward: '-y', start: 22, amount: 0.5 }]);
    const kept = designToDocument(d, { exact: new Set([22.03, 0.51]) }).doc.boards[0]! as Board;
    expect(worldTapers(kept)).toEqual([{ faces: ['+x'], toward: '-y', start: 22.03, amount: 0.51 }]);
  });
  it('rejects the part on a broken taper rule, naming the part and the rule', () => {
    const { doc, rejected } = designToDocument(parseDesign(json([{ faces: ['+z'], toward: '-x', start: 1, amount: 0.25 }]))!);
    expect(doc.boards).toEqual([]);
    expect(rejected).toEqual([{ name: 'Leg', reason: 'taper', detail: expect.stringContaining('Leg has a taper toward -x') }]);
    expect(rejectedViolations(rejected)[0]!.message).toBe(rejected[0]!.detail);
  });
  it('rejects a non-finite taper number as not-finite', () => {
    const { rejected } = designToDocument({ name: 'T', parts: [legPart([{ faces: ['+x'], toward: '-y', start: Infinity, amount: 0.5 }]) as never] });
    expect(rejected.map((r) => r.reason)).toEqual(['not-finite']);
  });
  it('an untapered part converts exactly as before (angleCuts: [])', () => {
    expect((designToDocument(parseDesign(json([]))!).doc.boards[0]! as Board).angleCuts).toEqual([]);
  });
});
