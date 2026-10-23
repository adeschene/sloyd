import { describe, expect, it } from 'vitest';
import { carriedKinds, carryFromOriginal, featureTurned, featuredKinds, hasFrameFeatures } from './featureCarry';
import { flatDocument } from './tree';
import { designToDocument, parseDesign } from './generated';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { SHAKER_TABLE_JSON } from './shakerTableFixture';
import { createBoard } from './document';
import { linksToShapes } from './linksToShapes';
import { ARCH } from './curveFixtures';
import type { Board, HoleRow, ProfileCut, SloydDocument, StoredBoard } from './types';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number], role = ''): GeneratedPart =>
  ({ name, role, material: 'oak', at: v(...at), size: v(...size) });

const HOLE: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.5 };
const PROFILE: ProfileCut = { id: 'p1', face: 'max', kind: 'roundover', size: 0.25, facing: 'face', run: { start: { side: { across: 'width', from: 'min' }, through: 'min' }, end: { side: { across: 'width', from: 'min' }, through: 'max' } } };
const FEATURES: Partial<Board> = {
  holes: [HOLE], curves: [ARCH], profiles: [PROFILE], bands: [{ side: { across: 'width', from: 'min' }, type: 'band-1' }],
  cornerRule: 'ends', hardware: [{ type: 'hw-1', count: 4 }],
};
const withFeatures = (doc: SloydDocument, id: string, extra: Partial<Board>): SloydDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.id === id ? ({ ...b, ...extra } as StoredBoard) : b)) });

describe('carryFromOriginal', () => {
  const original = designToDocument({ name: 'G', parts: [{ ...part('Shelf', [0, 0, 0], [30, 0.75, 11]), grain: 'width' }],
    assemblies: [{ name: 'D', parts: [{ ...part('Front', [0, 0, 0], [10, 4, 0.75]), grain: 'width' }], placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }).doc;

  it('carries grain as carryGrain did', () => {
    const out = carryFromOriginal({ name: 'G', parts: [part('Shelf', [0, 0, 0], [30, 0.75, 11]), part('New', [0, 1, 0], [5, 1, 1])], assemblies: [] }, original);
    expect(out.parts.map((p) => p.grain)).toEqual(['width', undefined]);
    expect('grain' in out.parts[1]).toBe(false);
  });

  it('matches an assembly part through its placements (grain)', () => {
    const out = carryFromOriginal({ name: 'G', parts: [], assemblies: [{ name: 'Whatever', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])],
      placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }, original);
    expect(out.assemblies![0].parts[0].grain).toBe('width');
  });

  it("carries a loose part's features by flat name", () => {
    const base = designToDocument({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 4, 1])] }).doc;
    const doc = withFeatures(base, base.boards[0]!.id, { ...FEATURES, posture: 'on-edge', rotation: 180 });
    const out = carryFromOriginal({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 4, 1])], assemblies: [] }, doc);
    const c = out.parts[0]!.carry!;
    expect(c.frame).toEqual({ posture: 'on-edge', rotation: 180, extents: [20, 4, 1] });
    const o = doc.boards[0] as Board;
    expect(c.originalHoles).toEqual(o.holes); expect(c.originalHoles).not.toBe(o.holes); expect(c.originalHoles[0]).not.toBe(o.holes[0]);
    expect(c.curves).toEqual(o.curves); expect(c.curves[0]).not.toBe(o.curves[0]);
    expect(c.profiles).toEqual(o.profiles); expect(c.profiles[0]).not.toBe(o.profiles[0]);
    expect(c.bands).toEqual(o.bands); expect(c.bands[0]).not.toBe(o.bands[0]);
    expect(c.cornerRule).toBe('ends');
    expect(c.hardware).toEqual(o.hardware); expect(c.hardware[0]).not.toBe(o.hardware[0]);
  });

  it("a shaped part carries its Shape's features", () => {
    const base = designToDocument({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 4, 1])] }).doc;
    const plain = withFeatures(base, base.boards[0]!.id, FEATURES);
    const shaped = linksToShapes(plain, new Map([[plain.boards[0]!, 'L']]));
    expect(shaped.shapes).toHaveLength(1);
    const out = carryFromOriginal({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 4, 1])], assemblies: [] }, shaped);
    const c = out.parts[0]!.carry!;
    expect(c.originalHoles).toEqual(shaped.shapes[0]!.holes);
    expect(c.curves).toEqual(shaped.shapes[0]!.curves);
    expect(c.profiles).toEqual(shaped.shapes[0]!.profiles);
    expect(c.bands).toEqual(shaped.shapes[0]!.bands);
    expect(c.hardware).toEqual(shaped.shapes[0]!.hardware);
    expect(c.originalHoles).not.toBe(shaped.shapes[0]!.holes);
  });

  // Two definitions (A placed as Left, B as Right) with different features and hardware, so first-match is observable.
  const twoDefs = (): SloydDocument => {
    const base = designToDocument({ name: 'G', parts: [], assemblies: [
      { name: 'A', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])], placements: [{ name: 'Left', at: v(0, 0, 0) }] },
      { name: 'B', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])], placements: [{ name: 'Right', at: v(20, 0, 0) }] },
    ] }).doc;
    const defOf = (name: string) => base.instances.find((i) => i.name === name)!.definition;
    const mark = (id: string, hole: HoleRow, hw: number) => ({ ...base.definitions.find((d) => d.id === id)!,
      boards: base.definitions.find((d) => d.id === id)!.boards.map((b) => ({ ...b, ...FEATURES, holes: [hole] } as StoredBoard)),
      hardware: [{ type: 'hw-1', count: hw }] });
    return { ...base, definitions: [mark(defOf('Left'), { ...HOLE, id: 'hA' }, 2), mark(defOf('Right'), { ...HOLE, id: 'hB' }, 7)] };
  };
  const model = (names: string[]): GeneratedDesign => ({ name: 'G', parts: [], assemblies: [{ name: 'X', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])],
    placements: names.map((n) => ({ name: n, at: v(0, 0, 0) })) }] });

  it('an assembly part tries each placement in order', () => {
    const doc = twoDefs();
    expect(carryFromOriginal(model(['Right', 'Left']), doc).assemblies![0]!.parts[0]!.carry!.originalHoles[0]!.id).toBe('hB');
    expect(carryFromOriginal(model(['Left', 'Right']), doc).assemblies![0]!.parts[0]!.carry!.originalHoles[0]!.id).toBe('hA');
    expect(carryFromOriginal(model(['Nope', 'Right']), doc).assemblies![0]!.parts[0]!.carry!.originalHoles[0]!.id).toBe('hB');
    expect(carryFromOriginal(model(['Right']), doc).assemblies![0]!.parts[0]!.carry!.frame).toBeDefined();
  });

  it('assembly hardware is carried by placement name (first match)', () => {
    const doc = twoDefs();
    const out = carryFromOriginal(model(['Right', 'Left']), doc);
    expect(out.assemblies![0]!.carry).toEqual({ hardware: [{ type: 'hw-1', count: 7 }] });
    expect(out.assemblies![0]!.carry!.hardware[0]).not.toBe(doc.definitions.flatMap((d) => d.hardware).find((h) => h.count === 7));
    expect(carryFromOriginal(model(['Left', 'Right']), doc).assemblies![0]!.carry).toEqual({ hardware: [{ type: 'hw-1', count: 2 }] });
    expect('carry' in carryFromOriginal(model(['Zed']), doc).assemblies![0]!).toBe(false);
  });

  it('hardware only: carry without frame', () => {
    const base = designToDocument({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 4, 1])] }).doc;
    const doc = withFeatures(base, base.boards[0]!.id, { hardware: [{ type: 'hw-1', count: 4 }] });
    const out = carryFromOriginal({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 4, 1])], assemblies: [] }, doc);
    expect(out.parts[0]!.carry!.frame).toBeUndefined();
    expect(out.parts[0]!.carry!.hardware).toEqual([{ type: 'hw-1', count: 4 }]);
  });

  it('no match, or nothing to carry: no carry key', () => {
    const base = designToDocument({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 4, 1]), part('Plain', [0, 5, 0], [20, 4, 1])] }).doc;
    const doc = withFeatures(base, base.boards[0]!.id, FEATURES);
    const out = carryFromOriginal({ name: 'G', parts: [part('Plain', [0, 5, 0], [20, 4, 1]), part('Unknown', [0, 9, 0], [1, 1, 1])], assemblies: [] }, doc);
    expect('carry' in out.parts[0]!).toBe(false);
    expect('carry' in out.parts[1]!).toBe(false);
  });

  it('featuredKinds and hasFrameFeatures read a resolved board', () => {
    const b = createBoard({ name: 'B', length: 10, width: 2, thickness: 1, position: [0, 0, 0] });
    expect(featuredKinds(b)).toEqual([]);
    expect(hasFrameFeatures(b)).toBe(false);
    const f = { ...b, ...FEATURES } as Board;
    expect(featuredKinds(f)).toEqual(['holes', 'curves', 'profiles', 'bands', 'hardware']);
    expect(hasFrameFeatures(f)).toBe(true);
    expect(carriedKinds(f)).toEqual(['curves', 'profiles', 'bands', 'hardware']);
    expect(carriedKinds({ ...b, holes: [HOLE] })).toEqual([]);
    expect(hasFrameFeatures({ ...b, holes: [HOLE] })).toBe(true);
    expect(featuredKinds({ ...b, hardware: [{ type: 'h', count: 1 }] })).toEqual(['hardware']);
    expect(hasFrameFeatures({ ...b, hardware: [{ type: 'h', count: 1 }] })).toBe(false);
  });

  it('parseDesign drops carry, on parts, assemblies and assembly parts', () => {
    const json = JSON.parse(JSON.stringify(SHAKER_TABLE_JSON)) as GeneratedDesign;
    const carry = { holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: [] };
    const withCarry = { ...json, parts: json.parts.map((p, i) => (i === 0 ? { ...p, carry } : p)),
      assemblies: [{ name: 'Asm', carry: { hardware: [] }, parts: [{ ...json.parts[0]!, carry }], placements: [{ name: 'P', at: { x: 0, y: 0, z: 0 } }] }] };
    expect((withCarry.assemblies as unknown[]).length).toBeGreaterThan(0);
    const out = parseDesign(withCarry)!;
    expect(out.parts.every((p) => !('carry' in p))).toBe(true);
    expect(out.assemblies!.every((a) => !('carry' in a) && a.parts.every((p) => !('carry' in p)))).toBe(true);
  });
});

describe('featureTurned', () => {
  const flat = (size: [number, number, number], extra?: Partial<Board>) => {
    const base = designToDocument({ name: 'G', parts: [part('Side', [0, 0, 0], size)] }).doc;
    return flatDocument(extra ? withFeatures(base, base.boards[0]!.id, extra) : base);
  };
  const orig = flat([20, 4, 1], { holes: [HOLE], profiles: [PROFILE], bands: FEATURES.bands });
  const holed = flat([20, 4, 1], { holes: [HOLE] });

  it('sends back a featured side returned lying flat, in the exact words', () => {
    const out = featureTurned(flat([20, 1, 4]), orig);
    expect(out).toEqual([{ kind: 'feature-turned', parts: ['Side'],
      message: 'Side carries an edge profile, edging Sloyd keeps on the part; keep it the same way round, 1in along z.',
      shown: 'Side was turned onto another face; its edge profile and edging are now on the wrong faces.' }]);
  });
  it('the person-facing words agree in number: one curve or one profile is singular, a count above one plural', () => {
    expect(featureTurned(flat([20, 1, 4]), flat([20, 4, 1], { curves: [ARCH] }))[0]!.shown).toBe('Side was turned onto another face; its curve is now on the wrong faces.');
    expect(featureTurned(flat([20, 1, 4]), flat([20, 4, 1], { profiles: [PROFILE] }))[0]!.shown).toBe('Side was turned onto another face; its edge profile is now on the wrong faces.');
    expect(featureTurned(flat([20, 1, 4]), flat([20, 4, 1], { curves: [ARCH, { ...ARCH, id: 'c2' }] }))[0]!.shown).toBe('Side was turned onto another face; its curves are now on the wrong faces.');
  });
  it('a tied original: only a turn that leaves every smallest axis is a fault (spec §4)', () => {
    const leg = flat([30, 1.5, 1.5], { holes: [HOLE], curves: [ARCH] });
    // thickened along the thickness axis only (z), then only along the width axis (y): a smallest axis remains
    expect(featureTurned(flat([30, 1.5, 2]), leg)).toEqual([]);
    expect(featureTurned(flat([30, 2, 1.5]), leg)).toEqual([]);
    // both thickened: the feature faces are no longer on a thin axis at all
    expect(featureTurned(flat([30, 2, 2]), leg)).toEqual([]);
    // turned so its smallest extent moved to the length axis
    expect(featureTurned(flat([1, 30, 30]), leg)).toHaveLength(1);
  });
  it('a flat 20 x 1 x 6 board returned on edge still faults', () => {
    expect(featureTurned(flat([20, 1, 6]), flat([20, 6, 1], { holes: [HOLE], curves: [ARCH] }))).toHaveLength(1);
  });
  it('a holes-only part is not judged; holes plus a curve still is, naming only the curve', () => {
    expect(featureTurned(flat([20, 1, 4]), holed)).toEqual([]);
    const out = featureTurned(flat([20, 1, 4]), flat([20, 4, 1], { holes: [HOLE], curves: [ARCH] }));
    expect(out).toHaveLength(1);
    expect(out[0]!.message).toContain('Side carries a curve Sloyd');
    expect(out[0]!.shown).toBe('Side was turned onto another face; its curve is now on the wrong faces.');
  });
  it('counts curves and profiles by how many the part has', () => {
    const two = flat([20, 4, 1], { curves: [ARCH, { ...ARCH, id: 'c2' }], profiles: [PROFILE, { ...PROFILE, id: 'p2' }] });
    expect(featureTurned(flat([20, 1, 4]), two)[0]!.message).toContain('Side carries curves, edge profiles Sloyd');
    const one = flat([20, 4, 1], { curves: [ARCH] });
    expect(featureTurned(flat([20, 1, 4]), one)[0]!.message).toContain('Side carries a curve Sloyd');
  });
  it('is silent for the same box on an unfeatured part, a hardware-only part, and an unturned result', () => {
    expect(featureTurned(flat([20, 1, 4]), flat([20, 4, 1]))).toEqual([]);
    expect(featureTurned(flat([20, 1, 4]), flat([20, 4, 1], { hardware: [{ type: 'hw-1', count: 1 }] }))).toEqual([]);
    expect(featureTurned(flat([22, 5, 1]), orig)).toEqual([]);
    expect(featureTurned(flat([20, 4, 1]), orig)).toEqual([]);
  });
  it('a refined box tied on the thickness axis is not a turn (the tie rule)', () => {
    expect(featureTurned(flat([20, 1, 1]), orig)).toEqual([]);
    expect(featureTurned(flat([4, 4, 4]), orig)).toEqual([]);
  });
  it('an original whose thickness is not its smallest extent is not judged', () => {
    const odd = flat([20, 1, 4], { holes: [HOLE] });
    const k = ['length', 'width', 'thickness'].indexOf('thickness');
    expect(k).toBe(2);
    // thickness axis carries the larger extent here: build it by a turn the converter does not make
    const turned = { ...odd, boards: odd.boards.map((b) => ({ ...b, length: 20, width: 1, thickness: 4 })) } as typeof odd;
    expect(featureTurned(flat([20, 4, 1]), turned)).toEqual([]);
  });
  it('ignores a refined part with no original of that name', () => {
    expect(featureTurned(flat([20, 1, 4]), { ...orig, boards: orig.boards.map((b) => ({ ...b, name: 'Other' })) })).toEqual([]);
  });
});


describe('featureTurned message floats', () => {
  it('rounds a computed extent to three places, as designCheck does', () => {
    const base = designToDocument({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 4, 0.1 + 0.2])] }).doc;
    const orig = flatDocument(withFeatures(base, base.boards[0]!.id, { holes: [HOLE], curves: [ARCH], thickness: 0.1 + 0.2 }));
    const back = flatDocument(designToDocument({ name: 'G', parts: [part('Side', [0, 0, 0], [20, 0.1 + 0.2, 4])] }).doc);
    const out = featureTurned(back, orig);
    expect(out[0]!.message).toContain('keep it the same way round, 0.3in along z.');
  });
});
