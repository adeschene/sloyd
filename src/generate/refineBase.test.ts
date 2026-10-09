import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refineDialogInfo, refineRefusal, plainForRefine } from './refine';
import type { RefineSettings } from './refine';
import { refineEstimateUsd } from './run';
import { designToDocument } from '../document/generated';
import { flatDocument, migrateDocument, worldParts, writeBackFlat } from '../document/document';
import type { Board, SloydDocument } from '../document/document';
import { applyJoints } from './joints/recipes';
import { findSites } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { gateUnjoin } from './joints/unjoin';
import f2 from './joints/fixtures/2-frames-phantom.json?raw';
import { findSites as findSites2, jointKey } from './joints/sites';
import type { LlmClient } from '../llm/types';

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
      expect(estimate).toBe(refineEstimateUsd(client, doc, S));
      expect(gate).toHaveBeenCalledTimes(2);   // the two uncached calls each ran it
    }
    expect(refineEstimateUsd(client, joined, S)).not.toBeNull();
    expect(refineEstimateUsd(client, handCut, S)).toBeNull();
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
