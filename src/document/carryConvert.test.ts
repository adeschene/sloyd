import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import { designToDocument, frameFor } from './generated';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { carryFromOriginal } from './featureCarry';
import { designValues, documentToDesign } from './refineDesign';
import { angleRatiosOf } from './angleWorld';
import { axisDimensions, boardExtents, endFacing } from './geometry';
import { boardHoles } from './holes';
import { toWorld } from './snapPoints';
import { worldBodies } from './drawing';
import { chamferCut, taperCut } from './angleCuts';
import { BUILT_IN_BAND } from './bandModel';
import { chiralCurved, chiralHoled, sameSet } from './turnFixtures';
import { chiralTwoSide } from './sweepFixtures';
import type { Band, BandType, Board, Definition, HoleRow, Posture, Rotation, SloydDocument } from './types';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const MAX = { distinct: 100, placed: 100 };

/** A loose-part project through the load gate, as a saved file would be. */
const project = (boards: Board[], over: Partial<SloydDocument> = {}): SloydDocument =>
  migrateDocument(JSON.parse(JSON.stringify({ ...createDocument('T'), boards, ...over })));

/** Refine's conversion path without the model: documentToDesign → (the model's edit) → carryFromOriginal → designToDocument. */
function refineThrough(original: SloydDocument, edit: (d: GeneratedDesign) => GeneratedDesign = (d) => d, typed = true) {
  const r = documentToDesign(original, MAX);
  if ('refused' in r) throw new Error(r.refused.message);
  const design = carryFromOriginal(edit(r.design), original);
  return designToDocument(design, {
    centre: false, exact: designValues(r.design), exactAngles: angleRatiosOf(flatDocument(original).boards), materials: original.materials,
    ...(typed ? { bandTypes: original.bandTypes, hardwareTypes: original.hardwareTypes } : {}),
  });
}

// --- World readings of board-local features, every crossing through the helpers (toWorld, axisDimensions, endFacing).
const local = (c: readonly number[]) => ({ length: c[0]!, width: c[1]!, thickness: c[2]! });
/** World hole centre and drill direction (+1/-1 along the world axis carrying the hole's axis). Bodies cannot see holes (inv 50). */
const worldHoles = (b: Board): number[][] => boardHoles(b).map((h) => {
  const k = axisDimensions(b).indexOf(h.axis);
  const entersFromWorldMin = endFacing(b, k, -1) === (h.dir === 1 ? 'min' : 'max');
  const dir = [0, 0, 0];
  dir[k] = entersFromWorldMin ? 1 : -1;
  return [...toWorld(b, local(h.centre)), ...dir];
});
/** World band sides: the world axis and side (-1/+1) the banded edge faces. Bodies cannot see bands (inv 54). */
const worldBands = (b: Board): string[] => b.bands.map((band) => {
  const k = axisDimensions(b).indexOf(band.side.across);
  return `${k}${endFacing(b, k, -1) === band.side.from ? '-' : '+'}:${band.type}`;
}).sort();
/** Every world point of the part's bodies (curves and profiles show here). */
const worldBodyPoints = (b: Board): number[][] => worldBodies(b).flatMap((w) => (w.box ? [w.box.min as number[], w.box.max as number[]] : w.verts as number[][]));

const byName = (doc: SloydDocument) => new Map(flatDocument(doc).boards.map((b) => [b.name, b] as const));

/** The world geometry is unchanged: holes (centre + direction), band sides and (curves, profiles) bodies. */
function expectSameWorld(original: SloydDocument, refined: SloydDocument) {
  const before = byName(original);
  const after = byName(refined);
  expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
  for (const [name, o] of before) {
    const r = after.get(name)!;
    expect.soft(sameSet(worldHoles(r), worldHoles(o)), `${name}: world holes`).toBe(true);
    expect.soft(worldBands(r), `${name}: world band sides`).toEqual(worldBands(o));
    if (o.curves.length > 0 || o.profiles.length > 0) expect.soft(sameSet(worldBodyPoints(r), worldBodyPoints(o)), `${name}: world bodies`).toBe(true);
  }
}

/** A band on the length-min end: a straight side none of the fixtures' curves or profiles touch (and one-handed). */
const END_BAND: Band = { side: { across: 'length', from: 'min' }, type: BUILT_IN_BAND.id };
/** The chiral fixtures without their rectangular cuts (Refine refuses cuts; the hand survives in the features). */
const featured = (posture: Posture, rotation: Rotation): Board[] => {
  const holed = chiralHoled(posture);
  const curved = chiralCurved(posture);
  const profiled = chiralTwoSide(posture);
  return [
    { ...holed, name: 'Holed', cuts: [], rotation, bands: [END_BAND] },
    { ...curved, name: 'Curved', cuts: [], rotation, bands: [END_BAND], position: [0, 0, 30] },
    { ...profiled, name: 'Profiled', cuts: [], rotation, bands: [END_BAND], position: [0, 0, 60] },
  ];
};

describe('frameFor', () => {
  it.each(POSTURES.flatMap((posture) => TURNS.map((rotation) => [posture, rotation] as const)))('reproduces the box (%s %i)', (posture, rotation) => {
    for (const s of [[20, 6, 1.5], [1.5, 30, 6], [6, 1.5, 20], [1.5, 1.5, 30], [4, 4, 4]] as [number, number, number][]) {
      const f = frameFor(s, { posture, rotation });
      expect(f.posture).toBe(posture);
      expect(f.rotation).toBe(rotation);
      expect(boardExtents(createBoard({ ...f }))).toEqual(s);
    }
  });
});

describe('a carried part converts in the original frame (refine-features spec §3.2)', () => {
  const cases = POSTURES.flatMap((posture) => TURNS.map((rotation) => [posture, rotation] as const));

  it('the fixtures are what they claim: a hole row, a curve, a profile and a band each survive the load', () => {
    const b = byName(project(featured('flat', 0)));
    expect(b.get('Holed')!.holes.length).toBeGreaterThan(0);
    expect(b.get('Curved')!.curves.length).toBeGreaterThan(0);
    expect(b.get('Profiled')!.profiles.length).toBeGreaterThan(0);
    for (const p of b.values()) expect(p.bands).toEqual([END_BAND]);
  });

  it.each(cases)('an untouched featured part keeps its features on the same wood (world: %s %i)', (posture, rotation) => {
    const original = project(featured(posture, rotation));
    const out = refineThrough(original);
    expect(out.rejected).toEqual([]);
    expectSameWorld(original, out.doc);
  });

  it.each(cases)('…and keeps its encoding (%s %i)', (posture, rotation) => {
    const original = project(featured(posture, rotation));
    const after = byName(refineThrough(original).doc);
    for (const [name, o] of byName(original)) {
      const r = after.get(name)!;
      const pick = (b: Board) => ({ posture: b.posture, rotation: b.rotation, length: b.length, width: b.width, thickness: b.thickness });
      expect(pick(r), name).toEqual(pick(o));
      expect(r.holes, name).toEqual(o.holes);
      expect(r.curves, name).toEqual(o.curves);
      expect(r.profiles, name).toEqual(o.profiles);
      expect(r.bands, name).toEqual(o.bands);
    }
  });

  const LEG_HOLES: HoleRow = { id: 'h1', face: 'width', from: 'min', diameter: 0.25, depth: 0.5, along: 'length', alongFrom: 'min', station: 5, count: 3, pitch: 2, acrossFrom: 'min', inset: 0.5 };
  const leg = (rotation: Rotation) => createBoard({
    name: 'Leg', length: 30, width: 1.5, thickness: 1.5, posture: 'upright', rotation, holes: [LEG_HOLES],
    angleCuts: [{ id: 'a1', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, { length: 30, width: 1.5, thickness: 1.5 }) }],
  });
  it.each(TURNS)('a square-section leg does not swap sides (world: turn %i)', (rotation) => {
    const original = project([leg(rotation)]);
    expect(byName(original).get('Leg')!.angleCuts).toHaveLength(1);
    const out = refineThrough(original);
    expect(out.rejected).toEqual([]);
    expectSameWorld(original, out.doc);
    // The chamfer is world-described; its body must be where it was.
    expect(sameSet(worldBodyPoints(byName(out.doc).get('Leg')!), worldBodyPoints(byName(original).get('Leg')!))).toBe(true);
    const r = byName(out.doc).get('Leg')!;
    expect([r.posture, r.rotation, r.length, r.width, r.thickness]).toEqual(['upright', rotation, 30, 1.5, 1.5]);
  });

  it('two linked holed copies at rotations 0 and 180 still link', () => {
    const a = { ...chiralHoled('flat'), id: 'sa', name: 'Side A', cuts: [], rotation: 0 as Rotation };
    const b = { ...chiralHoled('flat'), id: 'sb', name: 'Side B', cuts: [], rotation: 180 as Rotation, position: [0, 0, 30] as [number, number, number] };
    const { holes, ...shared } = a;
    const original = project([], {
      shapes: [{ id: 'S1', length: shared.length, width: shared.width, thickness: shared.thickness, posture: 'flat', grain: 'length', material: shared.material, cuts: [], angleCuts: [], holes, curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: [] }],
      boards: [a, b].map((x) => ({ id: x.id, name: x.name, position: x.position, rotation: x.rotation, shape: 'S1' })) as unknown as Board[],
    });
    expect(original.shapes).toHaveLength(1);
    expect(flatDocument(original).boards.map((x) => x.holes.length)).toEqual([2, 2]);
    const out = refineThrough(original);
    const stored = out.doc.boards as unknown as { shape?: string }[];
    expect(stored.map((x) => x.shape)).toEqual([expect.any(String), expect.any(String)]);
    expect(stored[0]!.shape).toBe(stored[1]!.shape);
    expectSameWorld(original, out.doc);
  });

  it('two same-role copies with DIFFERENT holes do not link (the carry is on before linking)', () => {
    const a = { ...chiralHoled('flat'), name: 'Side A', cuts: [] };
    const b = { ...chiralHoled('flat'), name: 'Side B', cuts: [], holes: [chiralHoled('flat').holes[0]!], position: [0, 0, 30] as [number, number, number] };
    const original = project([a, b]);
    const out = refineThrough(original, (d) => ({ ...d, parts: d.parts.map((p) => ({ ...p, role: 'side' })) }));
    expect(out.doc.shapes).toEqual([]);
    expectSameWorld(original, out.doc);
  });

  // --- types through the load gate (spec §3.3) ---
  const WENGE = { id: 'm-s-wenge', kind: 'solid' as const, label: 'Wenge', color: '#3a2a20' };
  const EDGING: BandType = { id: 'e1', name: 'Wenge edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'm-s-wenge', widthAllowance: 0.0625 };
  const HINGE = { id: 'hw1', name: 'Hinge', packSize: 2, pricePerPack: 5 };
  const banded = createBoard({ name: 'Shelf', length: 30, width: 11, thickness: 0.75, material: 'plywood',
    bands: [{ side: { across: 'width', from: 'min' }, type: 'e1' }], hardware: [{ type: 'hw1', count: 2 }] });
  const typed = { materials: [WENGE], bandTypes: [BUILT_IN_BAND, EDGING], hardwareTypes: [HINGE] };

  it('bands and hardware survive the load gate', () => {
    const original = project([banded], typed);
    expect(byName(original).get('Shelf')!.bands).toHaveLength(1);
    const out = refineThrough(original).doc;
    const r = byName(out).get('Shelf')!;
    expect(r.bands).toEqual(banded.bands);
    expect(r.hardware).toEqual(banded.hardware);
    expect(out.bandTypes).toEqual([BUILT_IN_BAND, EDGING]);
    expect(out.hardwareTypes).toEqual([HINGE]);
    expect(out.materials).toEqual([WENGE]);
  });

  it('…and vanish without the types (the opts are what keeps them)', () => {
    const original = project([banded], typed);
    const r = byName(refineThrough(original, undefined, false).doc).get('Shelf')!;
    expect(r.bands).toEqual([]);
    expect(r.hardware).toEqual([]);
  });

  it('a hardware-only part is encoded by orient as today, and keeps its hardware', () => {
    const plain = createBoard({ name: 'Door', length: 20, width: 12, thickness: 0.75, rotation: 180, hardware: [{ type: 'hw1', count: 2 }] });
    const r = byName(refineThrough(project([plain], typed)).doc).get('Door')!;
    expect([r.posture, r.rotation]).toEqual(['flat', 0]);
    expect(r.hardware).toEqual([{ type: 'hw1', count: 2 }]);
  });

  it('the band survives on an assembly part, and the definition keeps its hardware', () => {
    const def: Definition = { id: 'D1', boards: [{ ...banded, position: [0, 0, 0] }], instances: [], hardware: [{ type: 'hw1', count: 4 }] };
    const original = project([], { ...typed, definitions: [def], instances: [{ id: 'I1', name: 'Unit', definition: 'D1', position: [0, 0, 0], rotation: 0 }] });
    const out = refineThrough(original).doc;
    const r = byName(out).get('Unit › Shelf')!;
    expect(r.bands).toEqual(banded.bands);
    expect(r.hardware).toEqual(banded.hardware);
    expect(out.definitions[0]!.hardware).toEqual([{ type: 'hw1', count: 4 }]);
    expect(out.bandTypes).toEqual([BUILT_IN_BAND, EDGING]);
    expect(out.materials).toEqual([WENGE]);
  });

  // --- resized parts (spec §4) ---
  it.each(TURNS)('resized: features stay at stored stations, length +6 on the same world axis (turn %i)', (rotation) => {
    const holed = { ...chiralHoled('flat'), name: 'Side', cuts: [], rotation };
    const original = project([holed]);
    const o = byName(original).get('Side')!;
    const k = axisDimensions(o).indexOf('length');
    const out = refineThrough(original, (d) => ({ ...d, parts: d.parts.map((p): GeneratedPart => {
      const size = [p.size.x, p.size.y, p.size.z];
      size[k] = size[k]! + 6;
      return { ...p, size: { x: size[0]!, y: size[1]!, z: size[2]! } };
    }) }));
    expect(out.rejected).toEqual([]);
    const r = byName(out.doc).get('Side')!;
    expect(r.holes).toEqual(o.holes);
    expect(r.length).toBe(o.length + 6);
    expect(axisDimensions(r).indexOf('length')).toBe(k);
    expect([r.posture, r.rotation, r.width, r.thickness]).toEqual([o.posture, o.rotation, o.width, o.thickness]);
  });

  it('taper on a featured part resized past its width converts with no rejection, the taper on the stored length', () => {
    const taper = { id: 'a1', ...taperCut({ face: 'width', from: 'min', end: 'min', amount: 1.25, start: 14 }) };
    const holed = { ...chiralHoled('flat'), name: 'Side', cuts: [], angleCuts: [taper] };
    const original = project([holed]);
    const o = byName(original).get('Side')!;
    const kw = axisDimensions(o).indexOf('width');
    const out = refineThrough(original, (d) => ({ ...d, parts: d.parts.map((p): GeneratedPart => {
      const size = [p.size.x, p.size.y, p.size.z];
      size[kw] = 25; // wider than the 20" length
      return { ...p, size: { x: size[0]!, y: size[1]!, z: size[2]! } };
    }) }));
    expect(out.rejected).toEqual([]);
    const r = byName(out.doc).get('Side')!;
    expect([r.length, r.width]).toEqual([20, 25]);
    expect(r.angleCuts).toHaveLength(1);
    const { id: _a, ...was } = o.angleCuts[0]!;
    const { id: _b, ...now } = r.angleCuts[0]!;
    expect(now).toEqual(was);
    expect(r.holes).toEqual(o.holes);
  });
});
