import { describe, expect, it } from 'vitest';
import { KEEP_LINE, REFINE_MAX, detailFor, plainForRefine, refineMessage, refineRefusal } from './refine';
import type { RefineSettings } from './refine';
import { limitLines } from './prompt';
import { designToDocument } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import { createBoard, createDocument, flatDocument, migrateDocument } from '../document/document';
import { documentToDesign } from '../document/refineDesign';
import type { Board, SloydDocument } from '../document/document';
import { applyJoints } from './joints/recipes';
import { findSites } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { GATE_REFUSAL } from './joints/unjoin';

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
    expect(KEEP_LINE).toBe('Keep every part you are not asked to change exactly as it is: the same name, role, material, size, position and tapers. Keep assembly and placement names. Return the whole design.');
    expect(refineMessage(D, S)).toContain('position and tapers');
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
describe('refine — angled documents (spec §6)', () => {
  const angled: SloydDocument = { ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', angleCuts: [{ ...TAPER, kind: 'miter' as const }] })] };
  it('a taper document passes plainForRefine', () => {
    const tapered: SloydDocument = { ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', angleCuts: [TAPER] })] };
    expect('plain' in plainForRefine(tapered)).toBe(true);
  });
  it('plainForRefine refuses with reason angled', () => {
    const r = plainForRefine(angled);
    expect('refused' in r && r.refused.reason).toBe('angled');
  });
  it('documentToDesign refuses with reason angled', () => {
    const r = documentToDesign(angled, REFINE_MAX);
    expect('refused' in r && r.refused.reason).toBe('angled');
  });
});
