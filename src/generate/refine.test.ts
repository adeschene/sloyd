import { describe, expect, it } from 'vitest';
import { KEEP_LINE, REFINE_MAX, detailFor, plainForRefine, refineDialogInfo, refineMessage, refineRefusal } from './refine';
import type { RefineSettings } from './refine';
import { limitLines } from './prompt';
import { designToDocument, parseDesign } from '../document/generated';
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
import type { AngleCut } from '../document/types';
import { builtInCatalog, catalogOf } from '../document/materials';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const p = (name: string, i: number) => ({ name, role: '', material: 'pine', at: v(i * 2, 0, 0), size: v(1, 1, 1) });
const S: RefineSettings = { instruction: '  make it taller  ', width: 36, depth: null, height: null, detail: 'moderate' };
const D: GeneratedDesign = { name: 'T', parts: [p('A', 0)], assemblies: [] };

describe('refine', () => {
  it('builds the user turn: design JSON, instruction, keep line, limits', () => {
    expect(refineMessage(D, S)).toBe([
      'Here is the current design, in the same format you return:', JSON.stringify(D), '',
      'Change it as follows: make it taller', '', KEEP_LINE, '', 'Hard limits:', ...limitLines(S),
    ].join('\n'));
    expect(KEEP_LINE).toBe('Keep every part you are not asked to change exactly as it is: the same name, role, material, size, position, tapers, miters, bevels and chamfers. Keep assembly and placement names. Return the whole design.');
    expect(refineMessage(D, S)).toContain('tapers, miters, bevels and chamfers');
  });

  it('names the custom materials in the user turn, and only when there are some (custom materials spec §6)', () => {
    const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    const elm = { id: 'm-p-elm2', label: 'Elm ply', color: '#c8b898', kind: 'sheet-plain' as const, sheet: { length: 96, width: 48 } };
    const withAsh = refineMessage(D, S, catalogOf({ materials: [ash] }));
    expect(withAsh).toBe([
      'Here is the current design, in the same format you return:', JSON.stringify(D), '',
      'Custom materials in this design: "m-s-ash1" is Ash.', '',
      'Change it as follows: make it taller', '', KEEP_LINE, '', 'Hard limits:', ...limitLines(S),
    ].join('\n'));
    expect(refineMessage(D, S, catalogOf({ materials: [ash, elm] }))).toContain('Custom materials in this design: "m-s-ash1" is Ash; "m-p-elm2" is Elm ply.\n');
    expect(refineMessage(D, S, catalogOf({ materials: [] }))).toBe(refineMessage(D, S));
    expect(refineMessage(D, S, builtInCatalog())).toBe(refineMessage(D, S));
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
