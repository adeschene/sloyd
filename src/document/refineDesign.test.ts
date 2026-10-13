import { describe, expect, it } from 'vitest';
import { carryGrain, designValues, documentToDesign } from './refineDesign';
import { diffDesigns } from './designDiff';
import { groupItems } from './treeOps';
import { designToDocument, orient } from './generated';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { createBoard, createDocument } from './document';
import { taperCut } from './angleCuts';
import { worldTapers } from './taperWorld';
import { boardExtents } from './geometry';
import { flatDocument } from './tree';
import type { AngleCut, Board, Cut, Posture, Rotation, SloydDocument } from './types';

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

describe('carryGrain', () => {
  const original = designToDocument({ name: 'G', parts: [{ ...part('Shelf', [0, 0, 0], [30, 0.75, 11]), grain: 'width' }],
    assemblies: [{ name: 'D', parts: [{ ...part('Front', [0, 0, 0], [10, 4, 0.75]), grain: 'width' }], placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }).doc;

  it('gives a part of the same flat name the original grain, and leaves others without one', () => {
    const out = carryGrain({ name: 'G', parts: [part('Shelf', [0, 0, 0], [30, 0.75, 11]), part('New', [0, 1, 0], [5, 1, 1])], assemblies: [] }, original);
    expect(out.parts.map((p) => p.grain)).toEqual(['width', undefined]);
    expect('grain' in out.parts[1]).toBe(false);
  });

  it('matches an assembly part through its placements', () => {
    const out = carryGrain({ name: 'G', parts: [], assemblies: [{ name: 'Whatever', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])],
      placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }, original);
    expect(out.assemblies![0].parts[0].grain).toBe('width');
  });

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
  it('still refuses a miter', () => {
    const miter = { id: 'm', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0], [3, 3]] as [[number, number], [number, number]] };
    const r = documentToDesign({ ...createDocument('T'), boards: [{ ...createBoard({ name: 'Frame' }), angleCuts: [miter] }] }, REFINE_MAX);
    expect('refused' in r && r.refused.reason).toBe('angled');
  });
});
