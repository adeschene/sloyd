import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import { designToDocument, frameFor, orient } from './generated';
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
import { sortHoleRows, worldHoles as designHoles } from './holeWorld';
import { holeDesignFaults } from './holeDesignFaults';
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
      // Untouched rows come back exactly, ids included (the exact-row map), in the ORIGINAL stored order (final review M3).
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

  // --- resized parts (spec §4; AI-holes spec §3.3, the user's ruling: the model's hole positions win) ---
  it.each(TURNS)('resized: length +6 on the same world axis; the model keeps its holes, rows not measured from the grown end restored exactly (turn %i)', (rotation) => {
    const holed = { ...chiralHoled('flat'), name: 'Side', cuts: [], rotation };
    const original = project([holed]);
    const o = byName(original).get('Side')!;
    const k = axisDimensions(o).indexOf('length');
    const face = `+${'xyz'[k]}`;
    let model: GeneratedPart[] = [];
    const out = refineThrough(original, (d) => ({ ...d, parts: model = d.parts.map((p): GeneratedPart => {
      const size = [p.size.x, p.size.y, p.size.z];
      size[k] = size[k]! + 6;
      // A hole in the end that moved moves with it; every other hole stays where it was in the box.
      const holes = (p.holes ?? []).map((h) => (h.face === face ? { ...h, offset: { ...h.offset, [`${'xyz'[k]}`]: h.offset[('xyz'[k]) as 'x'] + 6 } } : h));
      return { ...p, size: { x: size[0]!, y: size[1]!, z: size[2]! }, holes };
    }) }));
    expect(out.rejected).toEqual([]);
    const r = byName(out.doc).get('Side')!;
    const asSet = (hs: readonly unknown[]) => hs.map((h) => JSON.stringify(h)).sort();
    expect(asSet(designHoles(r))).toEqual(asSet(model[0]!.holes!));
    expect(r.holes).toHaveLength(2);
    // The grown end is the length MAX end iff it faces world max: then no row is measured from it (h1 from min, h2 in
    // that end face, measured across it) and both come back as stored; else h1's stations moved and it is re-derived.
    if (endFacing(o, k, 1) === 'max') expect(r.holes).toEqual(o.holes);   // every row restored: the original order (M3)
    else {
      expect(r.holes.map((h) => h.id)).toContain('h2');
      expect(r.holes.map((h) => h.id)).not.toContain('h1');
    }
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
    // Neither row is measured from the width side that grew: both restored exactly, in the original order (M3).
    expect(r.holes).toEqual(o.holes);
  });
});

// --- hole rows: authored by the model, restored exactly (AI-holes spec §3.1, §3.3) ---
describe('hole rows through conversion (AI-holes spec §3)', () => {
  const cases = POSTURES.flatMap((posture) => TURNS.map((rotation) => [posture, rotation] as const));
  /** A 30 x 12 x 3/4 side; its rows on the thickness max face, along the length. */
  const side = (posture: Posture, rotation: Rotation, holes: HoleRow[], over: Partial<Board> = {}) => createBoard({
    name: 'Side', length: 30, width: 12, thickness: 0.75, posture, rotation, holes, ...over,
  });
  /** Measured from the length MAX end and the FARTHER width side (centre 2in from max): re-derivation would store neither. */
  const FAR: HoleRow = { id: 'hF', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'max', station: 3, count: 5, pitch: 1.25, acrossFrom: 'min', inset: 10 };
  /** The 32 mm system, 5 mm pins, from the max end: every number a non-dyadic float. */
  const MM: HoleRow = { id: 'hM', face: 'thickness', from: 'max', diameter: 5 / 25.4, depth: 10 / 25.4, along: 'length', alongFrom: 'max', station: 37 / 25.4, count: 8, pitch: 32 / 25.4, acrossFrom: 'max', inset: 37 / 25.4 };
  const moved = (dx: number, dz: number) => (d: GeneratedDesign): GeneratedDesign => ({ ...d, parts: d.parts.map((p) => ({ ...p, at: { ...p.at, x: p.at.x + dx, z: p.at.z + dz } })) });

  it('Generate: a design row converts to a stored row (canonical: from the min end, the nearer side)', () => {
    const out = designToDocument({ name: 'G', parts: [{ name: 'Side', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 30, y: 0.75, z: 12 },
      holes: [{ face: '+y', diameter: 0.25, depth: 0.375, through: false, offset: { x: 7, y: 0.75, z: 10 }, toward: '-x', count: 3, pitch: 1.25 }] }], assemblies: [] });
    expect(out.rejected).toEqual([]);
    const b = out.doc.boards[0]! as Board;
    expect(b.holes).toEqual([{ id: expect.any(String), face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 4.5, count: 3, pitch: 1.25, acrossFrom: 'max', inset: 2 }]);
  });

  it('a shape fault rejects the part with reason hole, fed back in the converter\'s words', () => {
    const out = designToDocument({ name: 'G', parts: [{ name: 'Side', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 30, y: 0.75, z: 12 },
      holes: [{ face: '+y', diameter: 0.25, depth: 0.375, through: false, offset: { x: 7, y: 0.75, z: 10 }, toward: '-y', count: 3, pitch: 1.25 }] }], assemblies: [] });
    expect(out.doc.boards).toEqual([]);
    expect(out.rejected).toEqual([{ name: 'Side', reason: 'hole', detail: 'Side has a hole row on +y running toward -y, along the drill axis; a row runs across its face.' }]);
  });

  it.each(cases)('Refine: an untouched row from the max end and the far side comes back identical, id included (%s %i)', (posture, rotation) => {
    const original = project([side(posture, rotation, [FAR])]);
    expect(byName(original).get('Side')!.holes).toEqual([FAR]);
    const out = refineThrough(original);
    expect(out.rejected).toEqual([]);
    expect(byName(out.doc).get('Side')!.holes).toEqual([FAR]);
  });

  it.each(cases)('…and so does it on a part that only moved (%s %i)', (posture, rotation) => {
    const original = project([side(posture, rotation, [FAR])]);
    const out = refineThrough(original, moved(2.5, -1.25));
    expect(out.rejected).toEqual([]);
    const r = byName(out.doc).get('Side')!;
    expect(r.position[0]).toBe(byName(original).get('Side')!.position[0] + 2.5);
    expect(r.holes).toEqual([FAR]);
  });

  it.each(cases)('a metric 32 mm row comes back exact (%s %i)', (posture, rotation) => {
    const original = project([side(posture, rotation, [MM])]);
    expect(byName(original).get('Side')!.holes).toEqual([MM]);
    expect(byName(refineThrough(original).doc).get('Side')!.holes).toEqual([MM]);
  });

  it('two rows drilling the SAME holes, stored two ways, each keep their own id (the first UNUSED original is taken)', () => {
    // FAR's holes measured from the min end and the nearer side: loader-legal (they meet; a strict fault, kept).
    const twin: HoleRow = { ...FAR, id: 'hG', alongFrom: 'min', station: 22, acrossFrom: 'max', inset: 2 };
    const original = project([side('flat', 0, [FAR, twin])]);
    const r = byName(refineThrough(original).doc).get('Side')!;
    expect([...r.holes].sort((a, b) => a.id.localeCompare(b.id))).toEqual([FAR, twin]);
  });

  it.each(TURNS)('resized at the row\'s measured end: the model\'s holes win, re-derived from the min end (the user\'s ruling; turn %i)', (rotation) => {
    const original = project([side('flat', rotation, [FAR])]);
    const o = byName(original).get('Side')!;
    const k = axisDimensions(o).indexOf('length');
    // The end the row is measured from (length max) faces world min or max; grow the part THERE, so the stored row moves.
    const maxAtWorldMax = endFacing(o, k, 1) === 'max';
    let model: GeneratedDesign | null = null;
    const out = refineThrough(original, (d) => {
      model = { ...d, parts: d.parts.map((p): GeneratedPart => {
        const at = [p.at.x, p.at.y, p.at.z];
        const size = [p.size.x, p.size.y, p.size.z];
        size[k] = size[k]! + 6;
        if (!maxAtWorldMax) at[k] = at[k]! - 6;
        // The holes stay where they were in the box: their offsets are from `at`, so a grown min side shifts them by 6.
        const holes = (p.holes ?? []).map((h) => {
          const off = [h.offset.x, h.offset.y, h.offset.z];
          if (!maxAtWorldMax) off[k] = off[k]! + 6;
          return { ...h, offset: { x: off[0]!, y: off[1]!, z: off[2]! } };
        });
        return { ...p, at: { x: at[0]!, y: at[1]!, z: at[2]! }, size: { x: size[0]!, y: size[1]!, z: size[2]! }, holes };
      }) };
      return model;
    });
    expect(out.rejected).toEqual([]);
    const r = byName(out.doc).get('Side')!;
    expect(r.length).toBe(36);
    expect(r.holes).toHaveLength(1);
    expect(r.holes[0]!.alongFrom).toBe('min');
    expect(r.holes[0]!.id).not.toBe('hF');
    expect(designHoles(r)).toEqual(model!.parts[0]!.holes);
    // …and in the world, where they were.
    expect(sameSet(worldHoles(r), worldHoles(o))).toBe(true);
  });

  it('an assembly part\'s row round-trips through documentToDesign and conversion (Review Focus 5)', () => {
    const def: Definition = { id: 'D1', boards: [{ ...side('upright', 90, [FAR]), position: [0, 0, 0] }], instances: [], hardware: [] };
    const original = project([], { definitions: [def], instances: [{ id: 'I1', name: 'Unit', definition: 'D1', position: [5, 0, 3], rotation: 0 }] });
    const r = documentToDesign(original, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.assemblies![0]!.parts[0]!.holes).toEqual(designHoles(byName(original).get('Unit › Side')!));
    const out = refineThrough(original);
    expect(out.rejected).toEqual([]);
    expect(byName(out.doc).get('Unit › Side')!.holes).toEqual([FAR]);
  });

  it('a breaking-out row is STORED (not rejected) and raises one hole-fault', () => {
    const out = designToDocument({ name: 'G', parts: [{ name: 'Side', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 30, y: 0.75, z: 12 },
      holes: [{ face: '+y', diameter: 0.25, depth: 0.375, through: false, offset: { x: 27.5, y: 0.75, z: 2 }, toward: '+x', count: 3, pitch: 1.25 }] }], assemblies: [] });
    expect(out.rejected).toEqual([]);
    expect((out.doc.boards[0] as Board).holes).toHaveLength(1);
    const flat = flatDocument(out.doc);
    expect(holeDesignFaults(flat, flat.units)).toEqual([{ kind: 'hole-fault', parts: ['Side'],
      message: "Side's hole row on +y starting at 27.5, 0.75, 2in breaks out of its face.", shown: "Side's hole row on the thickness face (max side) breaks out of its face." }]);
  });

  it('holeDesignFaults: one violation per (row, fault kind), each kind in its own words', () => {
    // count 3 at pitch 0: every hole meets the others (meets-hole); too deep for 3/4in; breaking out past the length max end.
    const rows: HoleRow[] = [
      { id: 'a', face: 'thickness', from: 'max', diameter: 0.25, depth: 1, along: 'length', alongFrom: 'min', station: 5, count: 3, pitch: 0, acrossFrom: 'min', inset: 2 },
      { id: 'b', face: 'thickness', from: 'min', diameter: 0.25, depth: 0.25, along: 'length', alongFrom: 'max', station: 0, count: 2, pitch: 1, acrossFrom: 'min', inset: 2 },
    ];
    const flat = flatDocument(project([side('flat', 0, rows)]));
    expect(holeDesignFaults(flat, flat.units).map((v) => v.message)).toEqual([
      "Side's hole row on +y starting at 5, 0.75, 2in meets another hole.",
      "Side's hole row on +y starting at 5, 0.75, 2in is deeper than the part.",
      "Side's hole row on -y starting at 29, 0, 2in breaks out of its face.",
    ]);
  });
});

describe('a holes-only part the model turned (final review C1) and the stored row order (M3)', () => {
  const cases = POSTURES.flatMap((posture) => TURNS.map((rotation) => [posture, rotation] as const));
  const PIN: HoleRow = { id: 'p1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 6, count: 9, pitch: 1.25, acrossFrom: 'min', inset: 2 };
  /** The probe: an upright Side 0.75 (x) x 30 (y) x 11.25 (z), one pin row. */
  const upright = () => createBoard({ name: 'Side', ...orient([0.75, 30, 11.25]), holes: [PIN] });
  const UNIT: Record<string, [number, number, number]> = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

  it('the probe: returned lying 11.25 x 30 x 0.75 with its pins on +z, it is stored by orient (thickness 0.75), the holes at the model\'s world centres', () => {
    const original = project([upright()]);
    const o = byName(original).get('Side')!;
    expect([o.thickness, boardExtents(o)]).toEqual([0.75, [0.75, 30, 11.25]]);
    let model: GeneratedPart | undefined;
    const pins = { face: '+z' as const, diameter: 0.25, depth: 0.375, through: false, offset: { x: 2, y: 6, z: 0.75 }, toward: '+y' as const, count: 9, pitch: 1.25 };
    const out = refineThrough(original, (d) => ({ ...d, parts: d.parts.map((p) => (model = { ...p, size: { x: 11.25, y: 30, z: 0.75 }, holes: [pins] })) }));
    expect(out.rejected).toEqual([]);
    const r = byName(out.doc).get('Side')!;
    expect(boardExtents(r)).toEqual([11.25, 30, 0.75]);
    expect([r.length, r.width, r.thickness]).toEqual([30, 11.25, 0.75]);
    // The model's world centres (position + offset + k·pitch·toward), against the independent oracle (toWorld).
    const want = Array.from({ length: 9 }, (_, k) => [0, 1, 2].map((i) => r.position[i]! + [2, 6, 0.75][i]! + k * 1.25 * UNIT['+y']![i]!));
    const got = boardHoles(r).map((h) => toWorld(r, local(h.centre)));
    expect(sameSet(got, want)).toBe(true);
    // The exact-row swap is skipped: a fresh row, not the original's.
    expect(r.holes.map((h) => h.id)).not.toContain('p1');
    expect(model!.holes).toEqual([pins]);
  });

  it('…a holes-only part the model left the same way round keeps the frame, and its rows come back exactly', () => {
    for (const [posture, rotation] of cases) {
      const holed = { ...chiralHoled(posture), name: 'Side', cuts: [], rotation };
      const original = project([holed]);
      const o = byName(original).get('Side')!;
      const r = byName(refineThrough(original).doc).get('Side')!;
      const pick = (b: Board) => [b.posture, b.rotation, b.length, b.width, b.thickness];
      expect(pick(r), `${posture} ${rotation}`).toEqual(pick(o));
      expect(r.holes, `${posture} ${rotation}`).toEqual(o.holes);
    }
  });

  it('…while a curved part the model turned still keeps the frame (curves, profiles and bands keep it always)', () => {
    const curved = { ...chiralCurved('upright'), name: 'Side', cuts: [] };
    const original = project([curved]);
    const o = byName(original).get('Side')!;
    const k = axisDimensions(o).indexOf('thickness');
    const out = refineThrough(original, (d) => ({ ...d, parts: d.parts.map((p) => {
      const e = [p.size.x, p.size.y, p.size.z];
      const j = (k + 1) % 3;
      [e[k], e[j]] = [e[j]!, e[k]!];
      return { ...p, size: { x: e[0]!, y: e[1]!, z: e[2]! } };
    }) }));
    const r = byName(out.doc).get('Side')!;
    expect([r.posture, r.rotation]).toEqual([o.posture, o.rotation]);
    expect(r.curves).toEqual(o.curves);
  });

  it('M3: a no-op Refine keeps the ORIGINAL stored row order (Plans letters stay put)', () => {
    const holed = { ...chiralHoled('flat'), name: 'Side', cuts: [] };
    const original = project([holed]);
    const o = byName(original).get('Side')!;
    // The fixture is NOT in canonical order, or this test could not fail.
    expect(o.holes.map((h) => h.id)).toEqual(['h1', 'h2']);
    expect(sortHoleRows(o.holes).map((h) => h.id)).toEqual(['h2', 'h1']);
    const r = byName(refineThrough(original).doc).get('Side')!;
    expect(r.holes).toEqual(o.holes);
  });

  it('M3: a Refine that DROPS a row keeps only the rest (the counts must agree before the original order is kept)', () => {
    const holed = { ...chiralHoled('flat'), name: 'Side', cuts: [] };
    const original = project([holed]);
    const r = byName(refineThrough(original, (d) => ({ ...d, parts: d.parts.map((p) => ({ ...p, holes: p.holes!.filter((h) => h.count > 1) })) })).doc).get('Side')!;
    expect(r.holes.map((h) => h.id)).toEqual(['h1']);
  });

  it('M3: a Refine that changes one row sorts canonically', () => {
    const holed = { ...chiralHoled('flat'), name: 'Side', cuts: [] };
    const original = project([holed]);
    const r = byName(refineThrough(original, (d) => ({ ...d, parts: d.parts.map((p) => ({ ...p, holes: p.holes!.map((h, i) => (i === 0 ? { ...h, diameter: 0.3125 } : h)) })) })).doc).get('Side')!;
    expect(r.holes).toEqual(sortHoleRows(r.holes));
  });
});
