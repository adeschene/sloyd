import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refineDialogInfo, refineRefusal, plainForRefine } from './refine';
import type { RefineSettings } from './refine';
import { JOINERY_OUTPUT_PER_SITE, joineryEstimateUsd, refineEstimateUsd } from './run';
import { CHARS_PER_TOKEN } from './estimate';
import { JOINERY_PROMPT, JOINT_SCHEMA } from './joints/choose';
import { designToDocument } from '../document/generated';
import { flatDocument, migrateDocument, worldParts, writeBackFlat } from '../document/document';
import type { Board, SloydDocument } from '../document/document';
import { applyJoints } from './joints/recipes';
import { findSites } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { gateUnjoin } from './joints/unjoin';
import f2 from './joints/fixtures/2-frames-phantom.json?raw';
import { findSites as findSites2, jointKey } from './joints/sites';
import type { LlmClient, LlmUsage } from '../llm/types';

// A passthrough spy: the gate runs for real, and every call is counted (F4: once per document in the dialog).
vi.mock('./joints/unjoin', async (orig) => {
  const a = await orig<typeof import('./joints/unjoin')>();
  return { ...a, gateUnjoin: vi.fn(a.gateUnjoin) };
});
const gate = vi.mocked(gateUnjoin);

const v = (x: number, y: number, z: number) => ({ x, y, z });
const bp = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', material: 'pine', at: v(...at), size: v(...size) });
const bookFlat = flatDocument(designToDocument({ name: 'Bookcase', assemblies: [], parts: [
  bp('Back', [0, 0, -0.25], [31.5, 72, 0.25]), bp('Left side', [0, 0, 0], [0.75, 72, 11.25]), bp('Right side', [30.75, 0, 0], [0.75, 72, 11.25]),
  bp('Bottom', [0.75, 0, 0], [30, 0.75, 11.25]), bp('Top', [0.75, 71.25, 0], [30, 0.75, 11.25]), bp('Shelf 1', [0.75, 24, 0], [30, 0.75, 11.25]),
] }).doc);
const sites = findSites(bookFlat);
const joined: SloydDocument = migrateDocument(applyJoints(bookFlat, sites, sites.map((s) => defaultChoice(s, bookFlat, sites))).doc);
const plain: SloydDocument = migrateDocument(bookFlat);
const handCut: SloydDocument = (() => {
  const d = structuredClone(joined);
  (d.boards.find((b) => b.name === 'Top') as Board).cuts.push({ id: 'h', face: 'thickness', from: 'min', across: 'width', offset: 3, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 });
  return d;
})();
const S: RefineSettings = { instruction: 'taller', width: null, depth: null, height: null, detail: 'moderate' };
const client: LlmClient = { userTurn: (t) => t, complete: vi.fn(), estimateCostUsd: (u) => u.inputTokens * 1e-6 + u.outputTokens * 1e-5 };

beforeEach(() => { gate.mockClear(); });

describe('the Refine dialog reads a document once (F4)', () => {
  it('refineDialogInfo runs the gate ONCE, and agrees with the uncached readers', () => {
    for (const doc of [joined, plain, handCut]) {
      gate.mockClear();
      const info = refineDialogInfo(doc);
      expect(gate.mock.calls.length).toBe(doc === plain ? 0 : 1);
      expect(info.refusal).toBe(refineRefusal(doc));
      expect(info.joined).toBe(worldParts(doc).some((b) => b.cuts.length > 0));
      expect(info.base).toEqual(plainForRefine(doc));
    }
  });

  it('refineRefusal and refineEstimateUsd with a precomputed base never run the gate again, and agree without it', () => {
    for (const doc of [joined, handCut]) {
      const base = plainForRefine(doc);
      gate.mockClear();
      const refusal = refineRefusal(doc, base);
      const estimate = refineEstimateUsd(client, doc, S, base);
      expect(gate).not.toHaveBeenCalled();
      expect(refusal).toBe(refineRefusal(doc));
      expect(estimate).toEqual(refineEstimateUsd(client, doc, S));
      expect(gate).toHaveBeenCalledTimes(2);   // the two uncached calls each ran it
    }
    expect(refineEstimateUsd(client, joined, S)).not.toBeNull();
    expect(refineEstimateUsd(client, handCut, S)).toBeNull();
  });
});

describe('holes (holes spec §6)', () => {
  const row = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
  const withHole = (d: SloydDocument, name: string): SloydDocument => ({ ...d, boards: d.boards.map((b) => (b.name === name ? { ...b, holes: [row] } : b)) });
  it('a holed plain document is refused as holes', () => {
    const base = plainForRefine(withHole(plain, 'Top'));
    expect('refused' in base && base.refused.reason).toBe('holes');
  });
  it('a holed joined document is refused as holes before the gate', () => {
    gate.mockClear();
    const base = plainForRefine(withHole(joined, 'Top'));
    expect('refused' in base && base.refused.reason).toBe('holes');
    expect(gate).not.toHaveBeenCalled();
  });
  it('the dialog reads it as neither joined nor repairable', () => {
    const info = refineDialogInfo(withHole(joined, 'Top'));
    expect(info.joined).toBe(false);
    expect(info.repair).toBeNull();
  });
});

describe('estimate ranges (fu 236)', () => {
  it('a joined design: the low end is the refine call alone; the high end adds joinery over every meeting', () => {
    const base = plainForRefine(joined);
    if ('refused' in base) throw new Error('refused');
    const r = refineEstimateUsd(client, joined, S)!;
    const alone = refineEstimateUsd(client, base.plain, S)!;   // the plain design: no joints, so refine only
    const join = joineryEstimateUsd(client, base.plain)!;
    expect(r.low).toBe(alone.low);
    expect(r.high).toBeCloseTo(alone.high + join.high, 12);
    expect(join.high).toBeGreaterThan(0);
  });

  it('joinery: the joint prompt and schema are the cached prefix; output is per site', () => {
    const spy = vi.fn((u: LlmUsage) => u.inputTokens);
    joineryEstimateUsd({ ...client, estimateCostUsd: spy }, plain);
    const first = spy.mock.calls[0]![0];
    expect(first.cacheWriteTokens).toBe(Math.ceil((JOINERY_PROMPT.length + JSON.stringify(JOINT_SCHEMA).length) / CHARS_PER_TOKEN));
    expect(first.outputTokens).toBe(findSites(flatDocument(plain)).length * JOINERY_OUTPUT_PER_SITE);
  });

  it('joinery: null with no sites', () => {
    const lone = designToDocument({ name: 'L', parts: [{ name: 'A', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 } }], assemblies: [] }).doc;
    expect(joineryEstimateUsd(client, lone)).toBeNull();
  });
});

describe('refineDialogInfo.repair (repair-joints)', () => {
  const fx = JSON.parse(f2);
  const damaged2 = migrateDocument(fx.damaged);
  const plain2 = migrateDocument(fx.plain);
  // Today's joinery as the app stores it (writeBackFlat + migrateDocument): applyJoints' own migrate re-mints `/` ids,
  // so its raw output has no twins and would pass for the wrong reason.
  const joinedToday = (): SloydDocument => {
    const flat = flatDocument(plain2);
    const ss = findSites2(flat);
    const rec = new Map((fx.choices as { enter: string; receive: string; axis: never; side: never; choice: object }[]).map((c) => [jointKey(c.enter, c.receive, c.axis, c.side), c.choice]));
    const key = (s: (typeof ss)[number]) => jointKey(flat.boards[s.enter]!.name, flat.boards[s.receive]!.name, s.axis, s.side);
    const out = applyJoints(flat, ss, ss.map((s) => ({ site: s.id, ...((rec.get(key(s)) ?? { joint: 'butt' }) as object) }) as never)).doc;
    return migrateDocument(writeBackFlat(plain2, flat.boards, out.boards));
  };
  it('a damaged joined design carries the repair', () => {
    expect(refineDialogInfo(damaged2).repair).toMatchObject({ dropped: 3 });
  });
  it('an undamaged joined design (as the app stores it) and a plain design carry none', () => {
    expect(worldParts(joinedToday()).some((b) => b.cuts.length > 0)).toBe(true);
    expect(refineDialogInfo(joinedToday()).repair).toBeNull();
    expect(refineDialogInfo(plain).repair).toBeNull();
    expect(refineDialogInfo(joined).repair).toBeNull();
  });
});
