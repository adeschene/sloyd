import { describe, expect, it } from 'vitest';
import { KEEP_LINE, REFINE_MAX, detailFor, plainForRefine, refineDialogInfo, refineMessage, refineRefusal } from './refine';
import type { RefineSettings } from './refine';
import { limitLines } from './prompt';
import { designToDocument, parseDesign, toWireDesign } from '../document/generated';
import { SHAKER_TABLE_JSON } from '../document/shakerTableFixture';
import { worldParts, writeBackFlat } from '../document/document';
import type { GeneratedDesign } from '../document/generated';
import { createBoard, createDocument, flatDocument, migrateDocument } from '../document/document';
import { documentToDesign } from '../document/refineDesign';
import type { Board, SloydDocument } from '../document/document';
import { applyJoints } from './joints/recipes';
import { findSites } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { GATE_REFUSAL } from './joints/unjoin';
import { chamferCut, taperCut } from '../document/angleCuts';
import { axisFrame, endFacing } from '../document/geometry';
import type { AngleCut, BandType } from '../document/types';
import { BUILT_IN_BAND } from '../document/bandModel';
import { builtInCatalog, catalogOf } from '../document/materials';
import { ARCH } from '../document/curveFixtures';
import type { StoredBoard } from '../document/types';
import { clearedSquareStoolDocument, stoolDocument, stoolLegs, stoolSeat, stoolWithCut } from '../document/stoolFixture';
import { keepsExactly, keptParts, keptNote } from '../document/leanKeep';
import { linkByRole } from '../document/roleLinks';
import { socketPlan } from '../document/legSockets';
import { partBounds } from '../document/worldBounds';
import { applyBoxJoints, boxJointPlan, fingerLayout, fingerSets, notchCuts } from '../document/boxJoints';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const p = (name: string, i: number) => ({ name, role: '', material: 'pine', at: v(i * 2, 0, 0), size: v(1, 1, 1) });
const S: RefineSettings = { instruction: '  make it taller  ', width: 36, depth: null, height: null, detail: 'moderate' };
const D: GeneratedDesign = { name: 'T', parts: [p('A', 0)], assemblies: [] };

describe('refine', () => {
  it('builds the user turn: design JSON, instruction, keep line, limits', () => {
    expect(refineMessage(D, S)).toBe([
      'Here is the current design, in the same format you return:', JSON.stringify(toWireDesign(D)), '',
      'Change it as follows: make it taller', '', KEEP_LINE, '', 'Hard limits:', ...limitLines(S),
    ].join('\n'));
    expect(KEEP_LINE).toBe('Keep every part you are not asked to change exactly as it is: the same name, role, material, size, position, tapers, miters, bevels, chamfers, holes, edging and edge profiles. Keep assembly and placement names. Return the whole design.');
    expect(refineMessage(D, S)).toContain('tapers, miters, bevels, chamfers, holes, edging and edge profiles');
  });

  it('shows the design in the wire form: merged "angles", no "tapers"/"miters"/"bevels"/"chamfers" keys, no TS-only fields (spec R6.4)', () => {
    const doc = designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false }).doc;
    const r = documentToDesign(doc, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const withChamfer: GeneratedDesign = { ...r.design, parts: r.design.parts.map((q, i) => (i === 0 ? { ...q, chamfers: [{ edge: ['+y', '+z'], legs: [0.125, 0.125] }], grain: 'width' } : q)) };
    const m = refineMessage(withChamfer, S);
    expect(m).toContain('"angles":[{"kind":"taper"');
    expect(m).toContain('{"kind":"chamfer","dirs":["+y","+z"],"toward":"+y","values":[0.125,0.125]}');
    expect(m).toContain('"profiles":[]');
    for (const k of ['"tapers"', '"miters"', '"bevels"', '"chamfers"', '"grain"', '"carry"', '"angleFaults"']) expect(m).not.toContain(k);
  });

  it('names the custom materials in the user turn, and only when there are some (custom materials spec §6)', () => {
    const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    const elm = { id: 'm-p-elm2', label: 'Elm ply', color: '#c8b898', kind: 'sheet-plain' as const, sheet: { length: 96, width: 48 } };
    const withAsh = refineMessage(D, S, catalogOf({ materials: [ash] }));
    expect(withAsh).toBe([
      'Here is the current design, in the same format you return:', JSON.stringify(toWireDesign(D)), '',
      'Custom materials in this design: "m-s-ash1" is Ash.', '',
      'Change it as follows: make it taller', '', KEEP_LINE, '', 'Hard limits:', ...limitLines(S),
    ].join('\n'));
    expect(refineMessage(D, S, catalogOf({ materials: [ash, elm] }))).toContain('Custom materials in this design: "m-s-ash1" is Ash; "m-p-elm2" is Elm ply.\n');
    expect(refineMessage(D, S, catalogOf({ materials: [] }))).toBe(refineMessage(D, S));
    expect(refineMessage(D, S, builtInCatalog())).toBe(refineMessage(D, S));
  });

  it('names the project\'s own edging types after the custom materials, and only when there are some (AI-bands spec §4.1)', () => {
    const oak = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    const solid: BandType = { id: 'e-ash', name: 'Ash edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'm-s-ash1', widthAllowance: 0.0625 };
    const tape: BandType = { ...BUILT_IN_BAND, id: 'e-tape', name: 'Walnut tape' };
    const base = designToDocument(D).doc;
    const withTypes = { ...base, materials: [oak], bandTypes: [BUILT_IN_BAND, solid, tape] };
    const m = refineMessage(D, S, catalogOf(withTypes), withTypes);
    expect(m).toContain('Custom materials in this design: "m-s-ash1" is Ash.\n\nEdging types in this design: "e-ash" is Ash edging (solid Ash, 0.25in); "e-tape" is Walnut tape (tape).\n\nChange it');
    // The catalog is optional: the label comes from the original.
    expect(refineMessage(D, S, undefined, withTypes)).toContain('Edging types in this design: "e-ash" is Ash edging (solid Ash, 0.25in); "e-tape"');
    // Only the built-in type: nothing is said, and the message is the plain one.
    expect(refineMessage(D, S, undefined, base)).toBe(refineMessage(D, S));
    expect(refineMessage(D, S, undefined, base)).not.toContain('Edging types');
  });

  describe('the featured-parts note (refine-features spec §5)', () => {
    const NOTE = "These parts carry curves, edge profiles, edging or hardware that this format does not show; Sloyd keeps them on the part with the same name. Keep each one's name, and keep it the same way round: ";
    const HOLE = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.5 } as const;
    const PROFILE = { id: 'p1', face: 'max', kind: 'roundover', size: 0.25, facing: 'face', run: { start: { side: { across: 'width', from: 'min' }, through: 'min' }, end: { side: { across: 'width', from: 'min' }, through: 'max' } } } as const;
    /** A run on two sides: carried, so named (AI-profiles spec §4.2, R6.3); the one-side PROFILE is authored, so not. */
    const TWO_SIDE = { id: 'p2', face: 'max', kind: 'roundover', size: 0.25, facing: 'face', run: { start: { side: { across: 'width', from: 'min' }, from: 'min', at: 5 }, end: { side: { across: 'length', from: 'max' }, from: 'min', at: 1 } } } as const;
    const CURVE = ARCH;
    const feat = (doc: SloydDocument, name: string, extra: Record<string, unknown>): SloydDocument =>
      ({ ...doc, boards: doc.boards.map((b) => (b.name === name ? ({ ...b, ...extra } as StoredBoard) : b)) });
    const clean = designToDocument({ name: 'T', parts: ['Side', 'Apron', 'Top', 'Door'].map((n, i) => p(n, i)), assemblies: [] }, { centre: false }).doc;
    const featured = feat(feat(feat(feat(clean, 'Side', { holes: [HOLE] }), 'Apron', { curves: [CURVE] }),
      'Top', { profiles: [TWO_SIDE], bands: [{ side: { across: 'width', from: 'min' }, type: 'band-1' }] }), 'Door', { hardware: [{ type: 'hw-1', count: 2 }] });
    const design = (doc: SloydDocument) => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error('refused'); return r.design; };

    it('is byte-identical without features', () => {
      const d = design(clean);
      const today = ['Here is the current design, in the same format you return:', JSON.stringify(toWireDesign(d)), '',
        'Change it as follows: make it taller', '', KEEP_LINE, '', 'Hard limits:', ...limitLines(S)].join('\n');
      expect(refineMessage(d, S)).toBe(today);
      expect(refineMessage(d, S, undefined, clean)).toBe(today);
      expect(refineMessage(d, S, builtInCatalog(), clean)).toBe(refineMessage(d, S, builtInCatalog()));
      expect(refineMessage(D, S, undefined, clean)).toBe(refineMessage(D, S));
    });

    it('names featured parts, right after the design JSON', () => {
      const d = design(featured);
      // Side carries only holes, which the design now shows (AI-holes spec §4): not named.
      const note = `${NOTE}Apron (a curve), Top (an edge profile), Door (hardware).`;
      expect(refineMessage(d, S, undefined, featured)).toBe([
        'Here is the current design, in the same format you return:', JSON.stringify(toWireDesign(d)), '', note, '',
        'Change it as follows: make it taller', '', KEEP_LINE, '', 'Hard limits:', ...limitLines(S),
      ].join('\n'));
      expect(refineMessage(d, S)).not.toContain('Sloyd keeps them');
    });

    it('does not name a part whose profiles are authored (one side, no curves): the design shows them (AI-profiles spec R6.3)', () => {
      const oneSide = feat(feat(clean, 'Top', { profiles: [PROFILE] }), 'Door', { hardware: [{ type: 'hw-1', count: 2 }] });
      const d = design(oneSide);
      expect(d.parts.find((q) => q.name === 'Top')!.profiles).toHaveLength(1);
      expect(refineMessage(d, S, undefined, oneSide)).toContain(`${NOTE}Door (hardware).`);
    });
  });

  it('caps at Detailed', () => {
    expect(REFINE_MAX).toEqual({ distinct: 60, placed: 240 });
  });

  it('preselects the smallest detail the design fits, by distinct AND placed parts', () => {
    const loose = (n: number) => designToDocument({ name: 'T', parts: Array.from({ length: n }, (_, i) => p(`P${i}`, i)), assemblies: [] }).doc;
    expect(detailFor(loose(9))).toBe('simple');       // 9 + headroom 3 = 12, Simple's cap
    expect(detailFor(loose(10))).toBe('moderate');
    const stacked = designToDocument({ name: 'T', parts: [], assemblies: [{ name: 'A', parts: Array.from({ length: 5 }, (_, i) => p(`X${i}`, i)),
      placements: Array.from({ length: 10 }, (_, i) => ({ name: `C${i}`, at: v(0, i * 2, 0) })) }] }).doc;
    expect(detailFor(stacked)).toBe('moderate'); // 5 distinct (+3) fits Simple, 50 placed > 48 does not
  });

  it('says why a design is refused, or null', () => {
    expect(refineRefusal(createDocument('E'))).toBe('There is nothing to refine yet.');
    expect(refineRefusal(designToDocument(D).doc)).toBeNull();
  });
});

describe('refine — joined designs', () => {
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
    ({ name, role: '', material: 'pine', at: v(...at), size: v(...size) });
  const bookFlat = flatDocument(designToDocument({ name: 'Bookcase', assemblies: [], parts: [
    bp('Back', [0, 0, -0.25], [31.5, 72, 0.25]), bp('Left side', [0, 0, 0], [0.75, 72, 11.25]), bp('Right side', [30.75, 0, 0], [0.75, 72, 11.25]),
    bp('Bottom', [0.75, 0, 0], [30, 0.75, 11.25]), bp('Top', [0.75, 71.25, 0], [30, 0.75, 11.25]),
    bp('Shelf 1', [0.75, 24, 0], [30, 0.75, 11.25]), bp('Shelf 2', [0.75, 48, 0], [30, 0.75, 11.25]),
  ] }).doc);
  const sites = findSites(bookFlat);
  const joined: SloydDocument = migrateDocument(applyJoints(bookFlat, sites, sites.map((s) => defaultChoice(s, bookFlat, sites))).doc);

  it('a joined design is refinable', () => {
    expect((joined.boards as Board[]).some((b) => b.cuts.length > 0)).toBe(true);
    expect(refineRefusal(joined)).toBeNull();
  });

  it('a hand-added cut on a joined design gives the gate message', () => {
    const bad = structuredClone(joined);
    (bad.boards.find((b) => b.name === 'Top') as Board).cuts.push({ id: 'h', face: 'thickness', from: 'min', across: 'width', offset: 3, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 });
    expect(refineRefusal(bad)).toBe(GATE_REFUSAL);
  });

  it('an unjoined design is returned as it is, with no joints', () => {
    const doc = designToDocument(D).doc;
    const p = plainForRefine(doc);
    expect(p).toEqual({ plain: doc, joints: null });
    expect('plain' in p && p.plain).toBe(doc);
  });
});

const TAPER = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.5], [20, 0]] as [[number, number], [number, number]] };

// A joined tapered corner, built with chunk 1's machinery: the CORNER of runJoinery.test.ts, the Leg tapered on its
// +x and +z faces toward the floor, joined with short mortise-tenons.
const legTaper = (b: Board, axis: 0 | 2, start: number): AngleCut => ({
  id: `t${axis}`, ...taperCut({ face: axisFrame(b)[axis]!.dim as 'width' | 'thickness', from: endFacing(b, axis, 1), end: endFacing(b, 1, -1), start, amount: 0.375 }),
});
const withLegTaper = <D extends { boards: unknown[] }>(doc: D, start: number): D =>
  ({ ...doc, boards: (doc.boards as Board[]).map((b) => (b.name === 'Leg' ? { ...b, angleCuts: [legTaper(b, 0, start), legTaper(b, 2, start)] } : b)) });
const cornerPart = (name: string, at: [number, number, number], size: [number, number, number]) =>
  ({ name, role: '', miters: [], bevels: [], chamfers: [], tapers: [], material: 'oak', at: v(...at), size: v(...size) });
const cornerFlat = withLegTaper(flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
  cornerPart('Leg', [0, 0, 0], [1.75, 28, 1.75]), cornerPart('Rail X', [1.75, 23.5, 0.5], [18, 3, 0.75]), cornerPart('Rail Z', [0.5, 23.5, 1.75], [0.75, 3, 18]),
] }).doc), 22);
const cornerSites = findSites(cornerFlat);
const joinedCorner: SloydDocument = migrateDocument(applyJoints(cornerFlat, cornerSites,
  cornerSites.map((s) => ({ site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.5 }))).doc);

describe('refine — angled documents (AI-angles spec §6)', () => {
  const odd: SloydDocument = { ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', angleCuts: [{ ...TAPER, kind: 'miter' as const }] })] };
  it('a taper document passes plainForRefine', () => {
    const tapered: SloydDocument = { ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', angleCuts: [TAPER] })] };
    expect('plain' in plainForRefine(tapered)).toBe(true);
  });
  it('plainForRefine no longer refuses angled documents', () => {
    expect('plain' in plainForRefine(odd)).toBe(true);
  });
  it("documentToDesign refuses a miter it can't describe, as angle-form", () => {
    const r = documentToDesign(odd, REFINE_MAX);
    expect('refused' in r && r.refused.reason).toBe('angle-form');
  });
});

// A joined CHAMFERED corner (AI-angles spec §6.3): the corner above, the Leg chamfered on its -x/-z vertical edge (no
// rail reaches it), joined with short mortise-tenons.
const legChamfer = (b: Board): AngleCut => {
  const p = { dim: axisFrame(b)[0]!.dim, from: endFacing(b, 0, -1) };
  const q = { dim: axisFrame(b)[2]!.dim, from: endFacing(b, 2, -1) };
  const order = ['length', 'width', 'thickness'];
  const [f, g] = order.indexOf(p.dim) < order.indexOf(q.dim) ? [p, q] : [q, p];
  return { id: 'k', ...chamferCut({ face: f.dim, from: f.from, along: g.dim, alongFrom: g.from, legFace: 0.125, legAlong: 0.125 }, b) };
};
describe('plainForRefine — a joined chamfered design (AI-angles spec §6.3)', () => {
  it('reads the joints back and returns the plain parts with the chamfer intact', () => {
    const flat0 = flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
      cornerPart('Leg', [0, 0, 0], [1.75, 28, 1.75]), cornerPart('Rail X', [1.75, 23.5, 0.5], [18, 3, 0.75]), cornerPart('Rail Z', [0.5, 23.5, 1.75], [0.75, 3, 18]),
    ] }).doc);
    const flat = { ...flat0, boards: flat0.boards.map((b) => (b.name === 'Leg' ? { ...b, angleCuts: [legChamfer(b)] } : b)) };
    const sites = findSites(flat);
    const joined = migrateDocument(applyJoints(flat, sites, sites.map((s) => ({ site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.5 }))).doc);
    expect(flatDocument(joined).boards.find((b) => b.name === 'Leg')!.cuts.length).toBeGreaterThan(0);
    const r = plainForRefine(joined);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(flatDocument(r.plain).boards.find((b) => b.name === 'Leg')!.angleCuts).toEqual([legChamfer(flat.boards.find((b) => b.name === 'Leg')!)]);
  });
});

describe('plainForRefine — tapers on a joined design (spec §5.4)', () => {
  const joined = joinedCorner;
  it('the fixture is joined and tapered', () => {
    const leg = flatDocument(joined).boards.find((b) => b.name === 'Leg')!;
    expect(leg.cuts.length).toBeGreaterThan(0);
    expect(leg.angleCuts).toHaveLength(2);
  });
  it('a joined tapered design passes the gate with its tapers intact', () => {
    const r = plainForRefine(joined);           // joined at start 22
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.joints!.length).toBeGreaterThan(0);
    expect(flatDocument(r.plain).boards.find((b) => b.name === 'Leg')!.angleCuts).toEqual(flatDocument(joined).boards.find((b) => b.name === 'Leg')!.angleCuts);
  });
  it('refuses, before any call, a joined design whose taper already runs into a joint', () => {
    const bad = withLegTaper(joined, 24);
    const r = plainForRefine(bad);
    expect('refused' in r && r.refused.reason).toBe('angle-joint');
    // It IS joined (the gate read its joints): the dialog must say so, and offers no repair (repair is for 'joints').
    expect(refineDialogInfo(bad).joined).toBe(true);
    expect(refineDialogInfo(bad).repair).toBeNull();
  });
});

describe('plainForRefine — the joined Shaker table with linked turned legs (fu 301)', () => {
  it('passes the gate and its plain legs are still one component', () => {
    const made = designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false });
    const flat = flatDocument(made.doc);
    const sites = findSites(flat);
    const named = (i: number, prefix: string) => flat.boards[i]!.name.startsWith(prefix);
    const apronLeg = new Set(sites.filter((s) => named(s.enter, 'Apron') && named(s.receive, 'Leg')).map((s) => s.id));
    expect(apronLeg.size).toBe(8);
    const joined = applyJoints(flat, sites, sites.map((s) => (apronLeg.has(s.id) ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.75 } : defaultChoice(s, flat, sites))));
    const tree = migrateDocument(writeBackFlat(made.doc, flat.boards, worldParts(joined.doc)));
    const r = plainForRefine(tree);
    if ('refused' in r) throw new Error(r.refused.message);
    const legShapes = new Set(r.plain.boards.filter((b) => b.name.startsWith('Leg')).map((b) => ('shape' in b ? b.shape : undefined)));
    expect(legShapes.size).toBe(1);
    expect([...legShapes][0]).toBeDefined();
  });
});

describe('Refine and leaning parts (splayed legs spec §8)', () => {
  it('a joined Refine is refused up front, before the joint gate reads a leaning part, in its own words', () => {
    const base = plainForRefine(stoolWithCut());
    expect(base).toEqual({ refused: { reason: 'lean-joint', message: "Refine can't keep joints with a leaning part yet: Front right." } });
    const info = refineDialogInfo(stoolWithCut());
    expect(info.joined).toBe(true);
    expect(info.refusal).toBe("Refine can't keep joints with a leaning part yet: Front right.");
    expect(info.repair).toBeNull();
  });

  it('a plain Refine is not refused: the leaning legs are left out of the design (kept, never described as boxes)', () => {
    const doc = stoolDocument();
    expect(refineRefusal(doc)).toBeNull();
    const r = documentToDesign(doc, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.parts.map((q) => q.name)).toEqual(['Seat']);
    expect(keptParts(doc).names).toEqual(['Front right', 'Front left', 'Back left', 'Back right']);
  });

  it('tells the model, in the USER turn, that each kept part leans and is kept as is, with its REAL world bounds', () => {
    const doc = stoolDocument();
    const r = documentToDesign(doc, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const m = refineMessage(r.design, S, undefined, doc);
    const n = (x: number) => +x.toFixed(3);
    for (const w of flatDocument(doc).boards.filter((b) => b.name !== 'Seat')) {
      const { min, max } = partBounds(w);
      expect(m).toContain(`"${w.name}" leans and is kept as is: x ${n(min[0])} to ${n(max[0])}, y ${n(min[1])} to ${n(max[1])}, z ${n(min[2])} to ${n(max[2])}.`);
    }
    // The real bounds, not the pre-lean box: a levelled foot stands on the floor and its top meets the seat.
    expect(m).toMatch(/"Front right" leans and is kept as is: x [\d.]+ to [\d.]+, y 0 to 16, z [\d.]+ to [\d.]+\./);
    expect(m.indexOf('leans and is kept as is')).toBeLessThan(m.indexOf('Change it as follows'));
    // A lean-free original adds nothing.
    expect(refineMessage(r.design, S, undefined, { ...doc, boards: doc.boards.filter((b) => b.name === 'Seat'), shapes: [] })).not.toContain('kept as is');
  });

    const [leg] = stoolLegs();
  it('refuses a leaning part inside an assembly (its definition would be rebuilt from the model\'s)', () => {
    const doc = migrateDocument({ ...createDocument('Base'), boards: [stoolSeat()],
      definitions: [{ id: 'd1', boards: [leg!], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'Frame', definition: 'd1', position: [0, 0, 0], rotation: 0 }] });
    expect(refineRefusal(doc)).toBe("Refine can't keep a leaning part, a part with angled holes or a part with a round tenon inside an assembly yet — Ungroup it first: Frame › Front right.");
  });
});

describe('Refine and angled holes (angled holes spec §9)', () => {
  /** The stool with Bore leg sockets done: the seat carries tilted rows. */
  const socketed = () => {
    const doc = stoolDocument();
    const seat = doc.boards.find((b) => b.name === 'Seat')!;
    const plan = socketPlan(doc, seat.id, 0.75);
    if (typeof plan === 'string') throw new Error(plan);
    return migrateDocument({ ...doc, boards: doc.boards.map((b) => (b.id === seat.id ? { ...(b as Board), holes: plan.holes } : b)) });
  };

  it('keeps the bored seat with the legs: the base design omits both, and the note says why', () => {
    const doc = socketed();
    expect((doc.boards.find((b) => b.name === 'Seat') as Board).holes.some((h) => h.tiltAlong !== undefined || h.tiltAcross !== undefined)).toBe(true);
    expect(keptParts(doc).names.sort()).toEqual(['Back left', 'Back right', 'Front left', 'Front right', 'Seat']);
    const note = keptNote(doc)!;
    expect(note).toContain('"Seat" has angled holes and is kept as is:');
    expect(note).toContain('"Front right" leans and is kept as is:');
    expect(note).toContain('These parts lean or have angled holes');
  });

  it('a square-holed seat is not kept', () => {
    const doc = stoolDocument();
    expect(keptParts(doc).names).not.toContain('Seat');
    expect(keptNote(doc)).not.toContain('"Seat"');
  });

  it('refuses a part with a tilted row inside an assembly, in its own words', () => {
    const doc = socketed();
    const seat = doc.boards.find((b) => b.name === 'Seat') as Board;
    const legs = doc.boards.filter((b) => b.name !== 'Seat');
    const wrapped = migrateDocument({ ...doc, boards: legs, definitions: [{ id: 'd1', boards: [seat], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'Top', definition: 'd1', position: [0, 0, 0], rotation: 0 }] });
    expect(refineRefusal(wrapped)).toBe("Refine can't keep a leaning part, a part with angled holes or a part with a round tenon inside an assembly yet — Ungroup it first: Top › Seat.");
  });

  it('a JOINED Refine is refused up front when a part has angled holes (ruling T11a); an unjoined one still keeps the seat', () => {
    const doc = socketed();
    const joined = migrateDocument({ ...doc, boards: doc.boards.map((b) => (b.name === 'Seat' ? { ...(b as Board), cuts: [
      { id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 },
    ] } : b)) });
    const msg = "Refine can't keep a part with angled holes in a joined project yet: Seat.";
    // With leaning legs the lean gate speaks first.
    expect(refineRefusal(joined)).toBe("Refine can't keep joints with a leaning part yet: Front right.");
    // Unleaned legs and a tilted seat only: the lean gate cannot fire, this one does.
    const seat = doc.boards.find((b) => b.name === 'Seat') as Board;
    const upright = migrateDocument({ ...createDocument('T'), boards: [{ ...createBoard({ name: 'Leg', length: 16, width: 1.5, thickness: 1.5, posture: 'upright' }), cuts: [] },
      { ...seat, cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }] }] });
    expect(plainForRefine(upright)).toEqual({ refused: { reason: 'lean-joint', message: msg } });
    expect(refineRefusal(upright)).toBe(msg);
    expect(plainForRefine(doc)).toEqual({ plain: doc, joints: null });
    expect(refineRefusal(doc)).toBeNull();
  });
});

describe('Refine and round tenons (round tenons spec §9)', () => {
  const T = { id: 't1', end: 'max' as const, diameter: 0.75, length: 1 };
  const CUT = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
  const top = (): Board => createBoard({ id: 'P', name: 'Top', length: 20, width: 10, thickness: 0.75, posture: 'flat', position: [0, 0, 20] });
  const rung = (id = 'L', name = 'Rung', x = 0): Board => ({ ...createBoard({ id, name, length: 18, width: 1.5, thickness: 1.25, posture: 'flat', position: [x, 0, 0] }), tenons: [{ ...T }] });
  const docOf = (...boards: Board[]) => migrateDocument({ ...createDocument('T'), boards });

  it('keeps a tenoned part: left out of the design, and the note says why', () => {
    const doc = docOf(top(), rung());
    expect(keptParts(doc).names).toEqual(['Rung']);
    const r = documentToDesign(doc, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.parts.map((q) => q.name)).toEqual(['Top']);
    const note = keptNote(doc)!;
    expect(note).toContain('"Rung" has round tenons and is kept as is:');
    expect(note).toContain('These parts lean, have angled holes or have round tenons');
    // A tenon-free document keeps nothing. Raw, never through the loader: an EMPTY list is no tenon (not key presence).
    expect(keepsExactly(rung())).toBe(true);
    expect(keepsExactly({ ...rung(), tenons: [] })).toBe(false);
    expect(keptParts(docOf(top(), { ...rung(), tenons: undefined } as Board)).names).toEqual([]);
  });

  it('reads the RESOLVED part: a Shape\'s tenon keeps every user of it, with the Shape', () => {
    const linked = linkByRole(docOf(top(), rung('L', 'Left'), rung('R', 'Right', 30)), new Map([['L', 'rung'], ['R', 'rung']]));
    expect(linked.shapes).toHaveLength(1);
    expect(linked.boards.some((b) => 'tenons' in b)).toBe(false);
    const kept = keptParts(linked);
    expect(kept.names).toEqual(['Left', 'Right']);
    expect(kept.shapes).toEqual(linked.shapes);
  });

  it('refuses a tenoned part inside an assembly (its definition would be rebuilt from the model\'s)', () => {
    const doc = migrateDocument({ ...createDocument('T'), boards: [top()], definitions: [{ id: 'd1', boards: [rung()], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'Frame', definition: 'd1', position: [0, 0, 0], rotation: 0 }] });
    const r = documentToDesign(doc, REFINE_MAX);
    expect('refused' in r && r.refused.reason).toBe('lean-assembly');
    expect(refineRefusal(doc)).toBe("Refine can't keep a leaning part, a part with angled holes or a part with a round tenon inside an assembly yet — Ungroup it first: Frame › Rung.");
  });

  it('a JOINED Refine is refused up front when a part has a round tenon, in its own words; the lean speaks first', () => {
    const msg = "Refine can't keep joints with a part with a round tenon yet: Rung.";
    const joined = docOf({ ...top(), cuts: [CUT] }, rung());
    expect(plainForRefine(joined)).toEqual({ refused: { reason: 'lean-joint', message: msg } });
    const info = refineDialogInfo(joined);
    expect(info.joined).toBe(true);
    expect(info.refusal).toBe(msg);
    // An unjoined one is not refused.
    expect(refineRefusal(docOf(top(), rung()))).toBeNull();
    // With leaning legs, the lean's sentence wins.
    const stool = stoolWithCut();
    const withRung = migrateDocument({ ...stool, boards: [...stool.boards, rung('X', 'Rung', 40)] });
    expect(refineRefusal(withRung)).toBe("Refine can't keep joints with a leaning part yet: Front right.");
  });
});

describe('Refine and compound end cuts (square-set legs spec §4)', () => {
  const T = { id: 't1', end: 'max' as const, diameter: 0.75, length: 1 };
  const CUT = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
  const LEGS = ['Front right', 'Front left', 'Back left', 'Back right'];
  const withCut = (doc: SloydDocument) => migrateDocument({ ...doc, boards: doc.boards.map((b) => (b.name === 'Seat' ? { ...(b as Board), cuts: [CUT] } : b)) });

  it('keeps a cleared levelled square-set leg (Review Focus 4): left out of the design, and the note says why', () => {
    const doc = clearedSquareStoolDocument();
    const legs = flatDocument(doc).boards.filter((b) => b.name !== 'Seat');
    expect(legs.every((b) => b.lean === undefined && keepsExactly(b))).toBe(true);
    expect(keptParts(doc).names).toEqual(LEGS);
    expect(keptParts(doc).shapes).toEqual(doc.shapes);
    expect(refineRefusal(doc)).toBeNull();
    const r = documentToDesign(doc, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.parts.map((q) => q.name)).toEqual(['Seat']);
    const note = keptNote(doc)!;
    for (const n of LEGS) expect(note).toContain(`"${n}" has a compound end cut and is kept as is:`);
    expect(note).not.toContain('undefined');
    // The same leg without its compound cuts' `across` keeps nothing: the cut is the reason.
    const [leg] = legs;
    expect(keepsExactly({ ...leg!, angleCuts: leg!.angleCuts.map(({ across: _a, ...c }) => c) })).toBe(false);
  });

  it('refuses a cleared compound part inside an assembly, in the existing sentence (a compound cut only exists on a leg that leans, or did)', () => {
    const leg = flatDocument(clearedSquareStoolDocument()).boards.find((b) => b.name === 'Front right')!;
    const doc = migrateDocument({ ...createDocument('Base'), boards: [stoolSeat()],
      definitions: [{ id: 'd1', boards: [{ ...leg, id: 'L', shape: undefined } as Board], instances: [], hardware: [] }],
      instances: [{ id: 'i1', name: 'Frame', definition: 'd1', position: [0, 0, 0], rotation: 0 }] });
    expect(refineRefusal(doc)).toBe("Refine can't keep a leaning part, a part with angled holes or a part with a round tenon inside an assembly yet — Ungroup it first: Frame › Front right.");
  });

  it('a JOINED Refine is refused up front for a compound cut, in its own words; the tenon speaks first', () => {
    const msg = "Refine can't keep joints with a part with a compound end cut yet: Front right.";
    const joined = withCut(clearedSquareStoolDocument());
    expect(plainForRefine(joined)).toEqual({ refused: { reason: 'lean-joint', message: msg } });
    const info = refineDialogInfo(joined);
    expect(info.joined).toBe(true);
    expect(info.refusal).toBe(msg);
    const cleared = clearedSquareStoolDocument();
    const rung = { ...createBoard({ name: 'Rung', length: 18, width: 1.5, thickness: 1.25, posture: 'flat', position: [40, 0, 0] }), tenons: [{ ...T }] };
    expect(refineRefusal(withCut(migrateDocument({ ...cleared, boards: [...cleared.boards, rung] })))).toBe("Refine can't keep joints with a part with a round tenon yet: Rung.");
  });
});

describe('Refine keeps box-jointed parts (box-joints spec §7)', () => {
  /** A drawer, butt corners jointed at 1/2" (as `boxJoints.test.ts` builds it), `dx` along X. */
  const drawerBoards = (dx = 0): Board[] => {
    const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 4, thickness: 0.5, position: [dx + 0.5, 0, z] });
    const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17, width: 4, thickness: 0.5, position: [dx + x, 0, 0] });
    const doc = { ...createDocument('Drawer'), boards: [fb('df', 'Drawer front', 0), fb('db', 'Drawer back', 16.5), side('dl', 'Drawer left', 0), side('dr', 'Drawer right', 12.5)] };
    const plan = boxJointPlan(doc, ['df', 'db', 'dl', 'dr'], { width: 0.5, swap: false });
    if (typeof plan === 'string') throw new Error(plan);
    return applyBoxJoints(doc, plan).boards as Board[];
  };
  const DRAWER = ['Drawer front', 'Drawer back', 'Drawer left', 'Drawer right'];
  const setsOf = (doc: SloydDocument) => new Map(flatDocument(doc).boards.map((b) => [b.name, fingerSets(b)]));

  it('a box-joint-only project: no joints read, the four drawer parts kept, not refused', () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() });
    for (const n of DRAWER) expect(setsOf(doc).get(n)!.length).toBeGreaterThan(0);
    const base = plainForRefine(doc);
    expect(base).toEqual({ plain: doc, joints: null });
    expect('plain' in base && base.plain).toBe(doc);
    expect(keptParts(doc).names).toEqual(DRAWER);
    expect(refineRefusal(doc)).toBeNull();
    expect(refineDialogInfo(doc).joined).toBe(false);
  });

  it('documentToDesign leaves the kept box-jointed parts out; the note says why', () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: [...drawerBoards(), createBoard({ id: 'sh', name: 'Shelf', length: 20, width: 10, thickness: 0.75, posture: 'flat', position: [30, 0, 0] })] });
    const r = documentToDesign(doc, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.parts.map((q) => q.name)).toEqual(['Shelf']);
    const note = keptNote(doc)!;
    expect(note.split('\n')[0]).toBe('These parts lean, have angled holes or have box joints, which the design format cannot describe, so they are not in the design above. Sloyd keeps each exactly where it is; the bounds are world inches:');
    expect(note).toContain('"Drawer front" has box joints and is kept as is: x 0 to 13, y 0 to 4, z 0 to 0.5.');
    for (const n of DRAWER) expect(note).toContain(`"${n}" has box joints and is kept as is:`);
  });

  it('a JOINED cabinet plus a root box-jointed drawer: not refused, every finger set kept exactly, the shelf\'s dado read back', () => {
    const bp = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', material: 'pine', at: v(...at), size: v(...size) });
    const caseFlat = flatDocument(designToDocument({ name: 'Case', assemblies: [], parts: [
      bp('Left side', [0, 0, 0], [0.75, 30, 11.25]), bp('Right side', [20.75, 0, 0], [0.75, 30, 11.25]),
      bp('Bottom', [0.75, 0, 0], [20, 0.75, 11.25]), bp('Top', [0.75, 29.25, 0], [20, 0.75, 11.25]), bp('Shelf', [0.75, 15, 0], [20, 0.75, 11.25]),
    ] }).doc);
    const sites = findSites(caseFlat);
    const choice = (s: (typeof sites)[number]) => (caseFlat.boards[s.enter]!.name === 'Shelf' && s.allowed.includes('dado')
      ? { site: s.id, joint: 'dado' as const, depth: 0.25 } : defaultChoice(s, caseFlat, sites));
    const joinedCase = migrateDocument(applyJoints(caseFlat, sites, sites.map(choice)).doc);
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...drawerBoards(100)] });
    const before = setsOf(doc);
    for (const n of DRAWER) expect(before.get(n)!.length).toBeGreaterThan(0);
    const base = plainForRefine(doc);
    if ('refused' in base) throw new Error(base.refused.message);
    expect(base.joints!.filter((j) => j.enter === 'Shelf').map((j) => j.choice.joint)).toEqual(['dado', 'dado']);
    // The plain case has no cuts left; the drawer keeps every finger set exactly.
    const after = setsOf(base.plain);
    for (const b of flatDocument(base.plain).boards.filter((x) => !DRAWER.includes(x.name))) expect(b.cuts, b.name).toEqual([]);
    for (const n of DRAWER) expect(after.get(n), n).toEqual(before.get(n));
    expect(refineRefusal(doc, base)).toBeNull();
    expect(refineDialogInfo(doc).joined).toBe(true);
    expect(keptParts(base.plain).names).toEqual(DRAWER);
  });

  it('a part whose read-back would resize it along its fingers (a dadoed shelf, its set at a width end) refuses, naming it', () => {
    const bp = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', material: 'pine', at: v(...at), size: v(...size) });
    const flat = flatDocument(designToDocument({ name: 'C', assemblies: [], parts: [
      bp('Side', [0, 0, 0], [0.75, 30, 11.25]), bp('Shelf', [0.75, 15, 0], [20, 0.75, 11.25]),
    ] }).doc);
    const sites = findSites(flat);
    const site = sites.find((s) => flat.boards[s.enter]!.name === 'Shelf')!;
    const joinedFlat = applyJoints(flat, sites, sites.map((s) => (s === site ? { site: s.id, joint: 'dado' as const, depth: 0.25 } : { site: s.id, joint: 'butt' as const }))).doc;
    const shelf = joinedFlat.boards.find((b) => b.name === 'Shelf')!;
    expect(shelf.length).toBe(20.25);
    // Fingers at the shelf's back (width) end, read along its length: the read-back shortens that length.
    const l = fingerLayout(shelf.length, 0.75)!;
    shelf.cuts.push(...notchCuts(l, true, 'width', endFacing(shelf, 2, 1), 'length', 0.75, Array.from({ length: l.count }, (_, i) => `n${i}`)));
    expect(fingerSets(shelf).map((f) => f.dim)).toEqual(['width']);
    const doc = migrateDocument(joinedFlat);
    expect(plainForRefine(doc)).toEqual({ refused: { reason: 'joints', message: "Refine can't keep Shelf's box joints through its other joints yet." } });
  });

  it('a hand-added cut beside the fingers still gives the gate message (only recognised sets are claimed)', () => {
    const boards = drawerBoards();
    const front = boards.find((b) => b.name === 'Drawer front')!;
    front.cuts.push({ id: 'h', face: 'thickness', from: 'min', across: 'width', offset: 5, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 });
    const doc = migrateDocument({ ...createDocument('Drawer'), boards });
    expect(plainForRefine(doc)).toEqual({ refused: { reason: 'joints', message: GATE_REFUSAL } });
  });
});
