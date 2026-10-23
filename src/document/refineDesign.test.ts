import { describe, expect, it } from 'vitest';
import { designValues, documentToDesign } from './refineDesign';
import { diffDesigns } from './designDiff';
import { groupItems } from './treeOps';
import { designToDocument, orient, parseDesign, toWireDesign } from './generated';
import { SHAKER_TABLE_JSON } from './shakerTableFixture';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { createBoard, createDocument } from './document';
import { bevelCut, chamferCut, miterCut, miterRatio, taperCut } from './angleCuts';
import { angleRatiosOf, worldAngles } from './angleWorld';
import { worldTapers } from './taperWorld';
import { worldHoles } from './holeWorld';
import { boardExtents } from './geometry';
import { ARCH } from './curveFixtures';
import { flatDocument } from './tree';
import { refineRefusal } from '../generate/refine';
import type { AngleCut, Board, Cut, Posture, ProfileCut, Rotation, SloydDocument } from './types';

const MAX = { distinct: 60, placed: 240 };
const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number], role = ''): GeneratedPart =>
  ({ name, role, material: 'oak', at: v(...at), size: v(...size) });
const LEG: [number, number, number] = [1.75, 28, 1.75];
const TABLE: GeneratedDesign = {
  name: 'Table',
  parts: [part('Top', [0, 28, 0], [30, 1, 20]),
    part('Leg 1', [0, 0, 0], LEG, 'leg'), part('Leg 2', [28.25, 0, 0], LEG, 'leg'),
    part('Leg 3', [0, 0, 18.25], LEG, 'leg'), part('Leg 4', [28.25, 0, 18.25], LEG, 'leg')],
  assemblies: [{ name: 'Drawer', parts: [part('Front', [0, 0, 0], [10, 4, 0.75]), part('Side', [0, 0, 0.75], [0.75, 4, 10])],
    placements: [{ name: 'Left drawer', at: v(2, 20, 0) }, { name: 'Right drawer', at: v(16, 20, 0) }] }],
};
const table = () => designToDocument(TABLE).doc;
const CUT: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 };
const refused = (doc: SloydDocument) => { const r = documentToDesign(doc, MAX); return 'refused' in r ? r.refused : null; };
const snapshot = (doc: SloydDocument) => flatDocument(doc).boards
  .map((b) => [b.name, b.material, b.position, boardExtents(b)] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

describe('documentToDesign', () => {
  const HOLE = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
  const BAND = { side: { across: 'width' as const, from: 'min' as const }, type: 'band-iron-on' };
  const ROUNDOVER: ProfileCut = { id: 'p1', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { loop: true } };

  it('Refine accepts a holed, curved, profiled, banded project with hardware (spec §6)', () => {
    const base = { ...table(), hardwareTypes: [{ id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: null }] };
    const HW = [{ type: 'h1', count: 2 }];
    const featured = { ...base, boards: base.boards.map((b, i) => (i === 0 ? { ...b, holes: [HOLE], curves: [ARCH], profiles: [ROUNDOVER], bands: [BAND], hardware: HW } : b)),
      shapes: base.shapes.map((s, i) => (i === 0 ? { ...s, holes: [HOLE], hardware: HW } : s)),
      definitions: base.definitions.map((d) => ({ ...d, hardware: HW })) };
    expect(base.shapes.length).toBeGreaterThan(0);
    expect(refused(featured)).toBeNull();
    expect(refineRefusal(featured)).toBeNull();
    expect('design' in documentToDesign(featured, MAX)).toBe(true);
  });

  it('the taper pre-check reads a featured part in its own frame', () => {
    // A square-ish slab whose length runs along Z: on the tie orient would put the length on X, and the taper
    // (toward -z) would then not run along it ('along'). A holed part keeps the frame it is stored in, so it is
    // not refused; the same part without a feature is judged as the design re-encodes it.
    const taper = { id: 'a', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 4, amount: 1 }) };
    const mk = (holes: typeof HOLE[]) => ({ ...createBoard({ name: 'Slab', length: 10, width: 10, thickness: 1, posture: 'flat', rotation: 90 }), angleCuts: [taper], holes });
    const own = documentToDesign({ ...createDocument('T'), boards: [mk([HOLE])] }, MAX);
    expect('refused' in own && own.refused).toBe(false);
    const bare = documentToDesign({ ...createDocument('T'), boards: [mk([])] }, MAX);
    expect('refused' in bare && bare.refused).toEqual({ reason: 'taper-form', message: "Slab's taper can't be described to Refine (it no longer runs along the part's longest side) — edit it in Properties first." });
  });

  it('round-trips: converting back (centre: false) reproduces every placed part exactly', () => {
    const doc = table();
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const back = designToDocument(r.design, { centre: false }).doc;
    expect(snapshot(back)).toEqual(snapshot(doc));
    expect(back.definitions).toHaveLength(1);
    expect(back.instances.map((i) => [i.name, i.position])).toEqual(doc.instances.map((i) => [i.name, i.position]));
  });

  it('gives each shape one linked-<k> role and other parts ""', () => {
    const r = documentToDesign(table(), MAX);
    if ('refused' in r) throw new Error('refused');
    expect(r.design.parts.map((p) => p.role)).toEqual(['', 'linked-1', 'linked-1', 'linked-1', 'linked-1']);
    expect(r.design.assemblies![0].parts.map((p) => p.role)).toEqual(['', '']);
  });

  it('names an assembly after its first placement', () => {
    const r = documentToDesign(table(), MAX);
    if ('refused' in r) throw new Error('refused');
    expect(r.design.assemblies![0].name).toBe('Left drawer');
    expect(r.design.assemblies![0].placements.map((p) => p.name)).toEqual(['Left drawer', 'Right drawer']);
  });

  it('refuses an empty design', () => {
    expect(refused(createDocument('E'))).toEqual({ reason: 'empty', message: 'There is nothing to refine yet.' });
  });

  it('refuses a design with a cut', () => {
    const doc = table();
    const withCut = { ...doc, boards: doc.boards.map((b, i) => (i === 0 ? { ...b, cuts: [CUT] } : b)) } as SloydDocument;
    expect(refused(withCut)).toEqual({ reason: 'cuts', message: 'Refine works on prototypes without joints. Refine first, then add joinery.' });
  });

  it('refuses a turned assembly', () => {
    const doc = table();
    const turned = { ...doc, instances: doc.instances.map((i, k) => (k === 0 ? { ...i, rotation: 90 as const } : i)) };
    expect(refused(turned)?.message).toBe('Refine cannot keep a turned assembly. Turn it back to 0°, or ungroup it.');
  });

  it('refuses a nested assembly', () => {
    const doc = table();
    const d0 = doc.definitions[0];
    const inner = { id: 'inner', name: 'Inner', definition: d0.id, position: [0, 0, 0] as [number, number, number], rotation: 0 as const };
    const nested = { ...doc, definitions: [{ ...d0, instances: [inner] }] };
    expect(refused(nested)?.reason).toBe('nested');
    expect(refused(nested)?.message).toBe('Refine cannot keep an assembly inside another assembly. Ungroup the inner one.');
  });

  it('refuses at 61 distinct parts and not at 60', () => {
    const many = (n: number) => designToDocument({ name: 'M', parts: Array.from({ length: n }, (_, i) => part(`P${i}`, [i * 2, 0, 0], [1, 1, 1])), assemblies: [] }).doc;
    expect(refused(many(60))).toBeNull();
    expect(refused(many(61))).toEqual({ reason: 'too-large', message: 'This design has 61 distinct parts; Refine handles up to 60.' });
  });

  it('refuses at 241 placed parts and not at 240', () => {
    const placed = (n: number) => designToDocument({ name: 'M', parts: [], assemblies: [{ name: 'A', parts: [part('X', [0, 0, 0], [1, 1, 1])],
      placements: Array.from({ length: n }, (_, i) => ({ name: `C${i}`, at: v(i * 2, 0, 0) })) }] }).doc;
    expect(refused(placed(240))).toBeNull();
    expect(refused(placed(241))).toEqual({ reason: 'too-large', message: '241 placed parts; Refine handles up to 240.' });
  });

  it('checks refusals in order: a cut AND a turn reports the cut', () => {
    const doc = table();
    const both = { ...doc, boards: doc.boards.map((b, i) => (i === 0 ? { ...b, cuts: [CUT] } : b)),
      instances: doc.instances.map((i) => ({ ...i, rotation: 90 as const })) } as SloydDocument;
    expect(refused(both)?.reason).toBe('cuts');
  });
});

describe('documentToDesign — shapes and normalised assemblies', () => {
  it('refuses a cut held on a Shape (F5)', () => {
    const doc = table();
    expect(doc.shapes.length).toBeGreaterThan(0);
    const withCut = { ...doc, shapes: doc.shapes.map((s, i) => (i === 0 ? { ...s, cuts: [CUT] } : s)) } as SloydDocument;
    expect(refused(withCut)?.reason).toBe('cuts');
  });

  // Two loose rails away from the origin, grouped: instance origin [0,0,0], parts in world coordinates.
  const grouped = () => {
    const base = designToDocument({ name: 'G', parts: [part('Rail A', [10, 0, 5], [20, 2, 3]), part('Rail B', [10, 6, 5], [20, 2, 3])], assemblies: [] }, { centre: false }).doc;
    const g = groupItems(base, null, base.boards.map((b) => b.id));
    if (!g) throw new Error('group failed');
    return g.doc;
  };

  it('emits an assembly whose parts start at 0 and whose placement sits at the world corner (F3)', () => {
    const doc = grouped();
    expect(doc.instances[0]!.position).toEqual([0, 0, 0]);
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const a = r.design.assemblies![0]!;
    expect(a.placements[0]!.at).toEqual(v(10, 0, 5));
    expect(a.parts.map((p) => p.at)).toEqual([v(0, 0, 0), v(0, 6, 0)]);
  });

  it('echoed back unchanged, the grouped design has no changes and no part moves (F3)', () => {
    const doc = grouped();
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const back = designToDocument(r.design, { centre: false, exact: designValues(r.design) }).doc;
    expect(snapshot(back)).toEqual(snapshot(doc));
    expect(diffDesigns(doc, back)).toEqual([]);
  });
});

describe('documentToDesign — mirrored', () => {
  it('refuses a design containing a mirrored assembly (mirrored-instances spec §6)', () => {
    const d = designToDocument({ name: 'P', parts: [], assemblies: [{ name: 'Side', parts: [{ name: 'A', role: '', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 4 } }], placements: [{ name: 'L', at: { x: 0, y: 0, z: 0 } }, { name: 'R', at: { x: 30, y: 0, z: 0 } }] }] } as GeneratedDesign).doc;
    const m = { ...d, instances: d.instances.map((i, k) => (k === 1 ? { ...i, mirrored: true } : i)) };
    expect(documentToDesign(m, { distinct: 12, placed: 48 })).toEqual({ refused: { reason: 'mirrored', message: "Refine can't describe a mirrored assembly yet — Ungroup the mirrored copy first." } });
    expect('design' in documentToDesign(d, { distinct: 12, placed: 48 })).toBe(true);
  });
});

describe('documentToDesign — tapers (AI-tapers spec §5.1, §5.2)', () => {
  const REFINE_MAX = MAX;
  const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
  const TURNS: Rotation[] = [0, 90, 180, 270];
  const tapered = (b: Board): Board => ({ ...b, angleCuts: [
    // A HAND: different amounts on two faces, so a mirrored mapping changes the part.
    { id: 'a', ...taperCut({ face: 'width', from: 'max', end: 'min', start: 12, amount: 0.5 }) },
    { id: 'b', ...taperCut({ face: 'thickness', from: 'min', end: 'min', start: 12, amount: 0.25 }) },
  ] });
  const parts = [
    ...POSTURES.flatMap((posture) => TURNS.map((rotation) => tapered(createBoard({ name: `P ${posture} ${rotation}`, length: 20, width: 3, thickness: 1.5, posture, rotation, position: [0, 0, 0] })))),
    tapered(createBoard({ name: 'Square leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', rotation: 90, position: [0, 0, 0] })),
  ];

  for (const b of parts) {
    it(`${b.name}: the world tapers round-trip exactly`, () => {
      const doc = { ...createDocument('T'), boards: [b] };
      const r = documentToDesign(doc, REFINE_MAX);
      if ('refused' in r) throw new Error(r.refused.message);
      expect(r.design.parts[0]!.tapers).toEqual(worldTapers(b));
      const back = designToDocument(r.design, { centre: false, exact: designValues(r.design) }).doc.boards[0]! as Board;
      expect(boardExtents(back)).toEqual(boardExtents(b));
      expect(worldTapers(back)).toEqual(worldTapers(b));
      // Stored fields are equal only for an encoding orient itself produces (Review Focus 2).
      const o = orient(boardExtents(b));
      if (o.posture === b.posture && o.rotation === b.rotation) {
        expect(back.angleCuts.map(({ id: _i, ...c }: AngleCut) => c)).toEqual(b.angleCuts.map(({ id: _i, ...c }: AngleCut) => c));
      }
    });
  }

  it('keeps a float-hostile start exactly (no zeroStation)', () => {
    const b = { ...createBoard({ name: 'Leg', length: 40, width: 1.75, thickness: 1.75, posture: 'upright' }), angleCuts: [{ id: 'a', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 30.3, amount: 0.02 }) }] };
    const r = documentToDesign({ ...createDocument('T'), boards: [b] }, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.parts[0]!.tapers![0]!.start).toBe(30.3);
    expect(designValues(r.design).has(30.3)).toBe(true);
  });
  it('a refined table keeps its four turned legs as one component, and the change list is empty (fu 301)', () => {
    const doc = designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false }).doc;
    const r = documentToDesign(doc, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const back = designToDocument(r.design, { centre: false, exact: designValues(r.design) }).doc;
    const legShapes = new Set(back.boards.filter((b) => b.name.startsWith('Leg')).map((b) => ('shape' in b ? b.shape : undefined)));
    expect(legShapes.size).toBe(1);
    expect([...legShapes][0]).toBeDefined();
    const worldOf = (x: typeof doc) => flatDocument(x).boards.map((b) => [b.name, boardExtents(b), b.position, worldTapers(b)]);
    expect(worldOf(back)).toEqual(worldOf(doc));
    expect(diffDesigns(doc, back)).toEqual([]);
  });
  it('refuses a taper not in standard form, naming the part, before anything else is built', () => {
    const odd = { id: 'a', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0], [20, 0.5]] as [[number, number], [number, number]] };
    const r = documentToDesign({ ...createDocument('T'), boards: [{ ...createBoard({ name: 'Leg 3' }), angleCuts: [odd] }] }, REFINE_MAX);
    expect('refused' in r && r.refused).toEqual({ reason: 'taper-form', message: "Leg 3's taper can't be described to Refine — edit it in Properties first." });
    // Several parts, more than three: the names are cut at three (fu 313).
    const legs = ['Leg 1', 'Leg 2', 'Leg 3', 'Leg 4'].map((name, i) => ({ ...createBoard({ name, position: [i * 5, 0, 0] }), angleCuts: [{ ...odd, id: `a${i}` }] }));
    const many = documentToDesign({ ...createDocument('T'), boards: legs }, REFINE_MAX);
    expect('refused' in many && many.refused).toEqual({ reason: 'taper-form', message: "The tapers on Leg 1, Leg 2, Leg 3… can't be described to Refine — edit them in Properties first." });
  });
  it('refuses a standard-form taper the converter would reject, in the person\'s words (fu 309)', () => {
    // A knife edge: the taper takes the whole 1.75in at the floor end.
    const leg = { ...createBoard({ name: 'Leg 3', length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }),
      angleCuts: [{ id: 'a', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 12, amount: 1.75 }) }] };
    const r = documentToDesign({ ...createDocument('T'), boards: [leg] }, REFINE_MAX);
    expect('refused' in r && r.refused).toEqual({ reason: 'taper-form', message: "Leg 3's taper can't be described to Refine (it leaves no wood at an end) — edit it in Properties first." });
  });
  it('names several unencodable parts once, with their shared reason', () => {
    const knife = (name: string, x: number) => ({ ...createBoard({ name, length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [x, 0, 0] }),
      angleCuts: [{ id: 'a', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 12, amount: 1.75 }) }] });
    const r = documentToDesign({ ...createDocument('T'), boards: [knife('Leg', 0), knife('Leg 2', 10)] }, REFINE_MAX);
    expect('refused' in r && r.refused).toEqual({ reason: 'taper-form', message: "The tapers on Leg, Leg 2 can't be described to Refine (it leaves no wood at an end) — edit them in Properties first." });
  });
  it('accepts a miter in its standard form (AI-angles chunk 2)', () => {
    const frame = createBoard({ name: 'Frame' });
    const miter = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, frame) };
    const r = documentToDesign({ ...createDocument('T'), boards: [{ ...frame, angleCuts: [miter] }] }, REFINE_MAX);
    expect('refused' in r).toBe(false);
  });
});

describe('documentToDesign — miters, bevels and chamfers (AI-angles spec §6)', () => {
  const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
  const TURNS: Rotation[] = [0, 90, 180, 270];
  const angled = (b: Board): Board => ({ ...b, angleCuts: [
    { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: miterRatio(37.5) }, b) },
    { id: 'v', ...bevelCut({ face: 'thickness', from: 'max', longSide: 'max', ratio: miterRatio(15) }, b) },
    { id: 'c', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.125 }, b) },
  ] });
  const parts = POSTURES.flatMap((posture) => TURNS.map((rotation) =>
    angled(createBoard({ name: `P ${posture} ${rotation}`, length: 20, width: 3, thickness: 1.5, posture, rotation, position: [0, 0, 0] }))));
  for (const b of parts) {
    it(`${b.name}: round-trips exactly through the design (untouched angles keep their slope)`, () => {
      const doc = { ...createDocument('T'), boards: [b] };
      const r = documentToDesign(doc, MAX);
      if ('refused' in r) throw new Error(r.refused.message);
      expect({ miters: r.design.parts[0]!.miters, bevels: r.design.parts[0]!.bevels, chamfers: r.design.parts[0]!.chamfers }).toEqual(worldAngles(b));
      const back = designToDocument(r.design, { centre: false, exact: designValues(r.design), exactAngles: angleRatiosOf([b]) }).doc.boards[0]! as Board;
      expect(worldAngles(back)).toEqual(worldAngles(b));
      const o = orient(boardExtents(b));
      if (o.posture === b.posture && o.rotation === b.rotation) {
        expect(back.angleCuts.map(({ id: _i, ...c }) => c)).toEqual(b.angleCuts.map(({ id: _i, ...c }) => c));
      }
    });
  }
  it('Review Focus 5 (AI-profiles R2): a tapered, mitered, beveled, chamfered project through the WIRE form gives identical angleCuts', () => {
    const legs = flatDocument(designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false }).doc).boards.filter((b) => b.angleCuts.length > 0);
    const leg = { ...legs[0]!, name: 'Chamfered leg', angleCuts: [...legs[0]!.angleCuts,
      { id: 'lc', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.125, legAlong: 0.125 }, legs[0]!) }] };
    const boards = [...legs, leg, ...parts];
    expect(legs).toHaveLength(4);
    const doc = { ...createDocument('T'), boards };
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const wire = JSON.parse(JSON.stringify(toWireDesign(r.design)));
    const kinds = new Set(wire.parts.flatMap((p: { angles: { kind: string }[] }) => p.angles.map((a) => a.kind)));
    expect([...kinds].sort()).toEqual(['bevel', 'chamfer', 'miter', 'taper']);
    const parsed = parseDesign(wire)!;
    expect(parsed.parts.map(({ profiles: _p, ...q }) => q)).toEqual(r.design.parts);
    const opts = (d: typeof r.design) => ({ centre: false, exact: designValues(d), exactAngles: angleRatiosOf(boards) });
    const viaWire = designToDocument(parsed, opts(parsed)).doc.boards as Board[];
    const direct = designToDocument(r.design, opts(r.design)).doc.boards as Board[];
    expect(viaWire).toHaveLength(boards.length);
    const cutsOf = (bs: Board[]) => bs.map((b) => [b.name, b.angleCuts.map(({ id: _i, ...c }) => c)]);
    expect(cutsOf(viaWire)).toEqual(cutsOf(direct));
    for (const b of boards) {
      const back = viaWire.find((x) => x.name === b.name)!;
      expect(worldAngles(back)).toEqual(worldAngles(b));
      expect(worldTapers(back)).toEqual(worldTapers(b));
      const o = orient(boardExtents(b));
      if (o.posture === b.posture && o.rotation === b.rotation) expect(back.angleCuts.map(({ id: _i, ...c }) => c)).toEqual(b.angleCuts.map(({ id: _i, ...c }) => c));
    }
  });
  it('without the exact-angle map a non-45° slope can drift (the map is what keeps it)', () => {
    const b = { ...createBoard({ name: 'R', length: 20, width: 3, thickness: 0.75 }), angleCuts: [
      { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 0.7 }, createBoard({ length: 20, width: 3, thickness: 0.75 })) },
    ] };
    const r = documentToDesign({ ...createDocument('T'), boards: [b] }, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const plain = designToDocument(r.design, { centre: false }).doc.boards[0] as Board;
    const kept = designToDocument(r.design, { centre: false, exactAngles: angleRatiosOf([b]) }).doc.boards[0] as Board;
    expect(kept.angleCuts[0]!.points).toEqual(b.angleCuts[0]!.points);
    expect(plain.angleCuts[0]!.points).not.toEqual(b.angleCuts[0]!.points);   // rounded to 0.1°: a different slope
  });
  it('a model that rounds 37.4999… back to 37.5 still stores the Properties slope (Review Focus 5)', () => {
    const b = parts[0]!;
    const r = documentToDesign({ ...createDocument('T'), boards: [b] }, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const rounded = { ...r.design, parts: [{ ...r.design.parts[0]!, miters: r.design.parts[0]!.miters!.map((m) => ({ ...m, angle: 37.5 })) }] };
    const back = designToDocument(rounded, { centre: false, exact: designValues(rounded), exactAngles: angleRatiosOf([b]) }).doc.boards[0] as Board;
    expect(back.angleCuts.find((c) => c.kind === 'miter')!.points).toEqual(b.angleCuts.find((c) => c.kind === 'miter')!.points);
  });
  it('an assembly part keeps its chamfer in the definition frame (Review Focus 2)', () => {
    const part = { ...createBoard({ id: 'p', name: 'Slat', length: 20, width: 3, thickness: 0.75, position: [0, 0, 0] }), angleCuts: [
      { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.125, legAlong: 0.125 }, createBoard({ length: 20, width: 3, thickness: 0.75 })) },
    ] };
    const doc = { ...createDocument('T'), definitions: [{ id: 'd', boards: [part], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'A', definition: 'd', position: [0, 0, 0] as [number, number, number], rotation: 0 as const }, { id: 'i2', name: 'B', definition: 'd', position: [0, 0, 10] as [number, number, number], rotation: 0 as const }] };
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.assemblies![0]!.parts[0]!.chamfers).toEqual(worldAngles(part)!.chamfers);
  });
  it("refuses, before any call, a cut it can't describe ('angle-form'), naming the part and kind", () => {
    const b = parts[0]!;
    const odd = { ...b, angleCuts: [{ ...b.angleCuts[0]!, points: [[0, 0.5], [3, 3.5]] as [[number, number], [number, number]] }] };
    const r = documentToDesign({ ...createDocument('T'), boards: [odd] }, MAX);
    expect('refused' in r && r.refused).toEqual({ reason: 'angle-form', message: `${b.name}'s miter can't be described to Refine — edit it in Properties first.` });
  });
  it('refuses a cut the converter would reject on the re-encoded part (Review Focus 3)', () => {
    // Stored with WIDTH 22 > length 20: orient re-encodes it with the 22 side as its length, so its miter across the
    // old length (now the width) would cut deeper than the new part is long... use a miter at its old LENGTH end, which
    // is a side of the re-encoded part: not an end any more.
    const b = { ...createBoard({ name: 'Wide', length: 20, width: 22, thickness: 0.75, position: [0, 0, 0] }) };
    const withMiter = { ...b, angleCuts: [{ id: 'm', ...miterCut({ end: 'max', across: 'thickness', longSide: 'min', ratio: 1 }, b) }] };
    const r = documentToDesign({ ...createDocument('T'), boards: [withMiter] }, MAX);
    expect('refused' in r && r.refused.reason).toBe('angle-form');
    expect('refused' in r && r.refused.message).toContain("Wide's miter can't be described to Refine (");
  });
  it('designValues carries chamfer legs (exact set)', () => {
    const r = documentToDesign({ ...createDocument('T'), boards: [parts[0]!] }, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(designValues(r.design).has(0.125)).toBe(true);
    expect(designValues(r.design).has(0.25)).toBe(true);
  });
});

describe('documentToDesign writes hole rows (AI-holes spec §3.2, §3.3)', () => {
  const ROW = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 5 / 25.4, depth: 10 / 25.4, along: 'length' as const, alongFrom: 'max' as const, station: 3, count: 4, pitch: 32 / 25.4, acrossFrom: 'min' as const, inset: 37 / 25.4 };
  const holed = (): SloydDocument => {
    const base = table();
    return { ...base, boards: base.boards.map((b) => ('shape' in b ? b : { ...b, holes: [ROW] })),
      definitions: base.definitions.map((d) => ({ ...d, boards: d.boards.map((b) => ('shape' in b ? b : { ...b, holes: [ROW] })) })) };
  };

  it('every part, loose and in an assembly, carries holes: worldHoles of its resolved board', () => {
    const doc = holed();
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const all = [...r.design.parts, ...r.design.assemblies!.flatMap((a) => a.parts)];
    expect(all.every((p) => Array.isArray(p.holes))).toBe(true);
    const top = r.design.parts.find((p) => p.name === 'Top')!;
    expect(top.holes).toEqual(worldHoles(flatDocument(doc).boards.find((b) => b.name === 'Top')!));
    expect(top.holes).toHaveLength(1);
    const front = r.design.assemblies![0]!.parts.find((p) => p.name === 'Front')!;
    expect(front.holes).toHaveLength(1);
    expect(r.design.parts.find((p) => p.name === 'Leg 1')!.holes).toEqual([]);
  });

  it('designValues carries every hole number: offset components, depth, pitch and diameter', () => {
    const r = documentToDesign(holed(), MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const values = designValues(r.design);
    const h = r.design.parts.find((p) => p.name === 'Top')!.holes![0]!;
    for (const n of [h.offset.x, h.offset.y, h.offset.z, h.depth, h.pitch, h.diameter]) expect(values.has(n), String(n)).toBe(true);
    expect(values.has(32 / 25.4)).toBe(true);
    expect(values.has(5 / 25.4)).toBe(true);
  });
});
