import { describe, expect, it, vi } from 'vitest';
import { runRefine } from './run';
import { REFINE_MAX, plainForRefine } from './refine';
import { documentToDesign } from '../document/refineDesign';
import { flatDocument, migrateDocument } from '../document/document';
import type { FlatDocument, HoleRow, SloydDocument } from '../document/document';
import { applyJoints } from './joints/recipes';
import { findSites } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { sameJoined } from './joints/unjoin';
import { designToDocument, toWireDesign } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import type { LlmClient, LlmRequest, LlmResult } from '../llm/types';

const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
/** A scripted model (`dovetailsRefine.test.ts`' pattern): each step answered in turn, a design step in the wire form. */
function fakeClient(steps: unknown[]) {
  const seen: unknown[][] = [];
  let i = 0;
  const client: LlmClient = {
    userTurn: (text) => ({ role: 'user', text }),
    estimateCostUsd: () => 0,
    complete: vi.fn(async (req: LlmRequest): Promise<LlmResult> => {
      seen.push([...req.messages]);
      const step = steps[Math.min(i, steps.length - 1)] as Partial<GeneratedDesign>;
      const turn = Object.freeze({ role: 'assistant', n: i++ });
      const json = step && Array.isArray(step.parts) && Array.isArray(step.assemblies) ? toWireDesign(step as GeneratedDesign) : step;
      return { json, assistantTurn: turn, usage };
    }),
  };
  return { client, seen };
}

const RS = { instruction: 'change it', width: null, depth: null, height: null, detail: 'moderate' as const };
const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
/** The design Refine sends, echoed back unchanged. */
const plainEcho = (d: SloydDocument) => {
  const p = plainForRefine(d); if ('refused' in p) throw new Error(p.refused.message);
  const r = documentToDesign(p.plain, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message);
  return r.design;
};
const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
  ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
const board = (d: FlatDocument, n: string) => d.boards.find((b) => b.name === n)!;

/** A counterbored screw pocket through the rail's face, at its middle. */
const CB: HoleRow = { id: 'h1', face: 'thickness', from: 'min', diameter: 0.1875, depth: 'through', along: 'length', alongFrom: 'min',
  station: 9.5, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.5, head: 'counterbore', headDiameter: 0.375, headDepth: 0.25 };
/** Two legs and a rail between them, the rail counterbored; joined by the default choices (the rail tenoned into both legs). */
const plainFrame = migrateDocument((() => {
  const d = designToDocument({ name: 'Frame', assemblies: [], parts: [
    bp('Left leg', [0, 0, 0], [1.5, 30, 1.5]), bp('Right leg', [20.5, 0, 0], [1.5, 30, 1.5]), bp('Rail', [1.5, 26, 0.375], [19, 3, 0.75]),
  ] }).doc;
  return { ...d, boards: d.boards.map((b) => (b.name === 'Rail' ? { ...b, holes: [{ ...CB }] } : b)) };
})());
const frameFlat = flatDocument(plainFrame);
const frameSites = findSites(frameFlat);
const joinedFrame = migrateDocument(applyJoints(frameFlat, frameSites, frameSites.map((s) => defaultChoice(s, frameFlat, frameSites))).doc);
const byName = (d: SloydDocument) => { const f = flatDocument(d); return { ...f, boards: [...f.boards].sort((a, b) => a.name.localeCompare(b.name)) }; };

describe('the joined headed frame fixture', () => {
  it('the rail is tenoned into both legs (lengthened by 1" each end) and keeps its head, its station re-based', () => {
    const rail = board(flatDocument(joinedFrame), 'Rail');
    expect(rail.length).toBe(21);
    expect(rail.cuts.length).toBeGreaterThan(0);
    expect(rail.holes).toEqual([{ ...CB, station: 10.5 }]);
  });
});

describe('a joined Refine keeps a headed part exactly (counterbores spec §9; inv 61\'s guards)', () => {
  it('a headed rail with a recorded tenon, refined unchanged: not refused, one call, the rail back with its head and its joints', async () => {
    const { client, seen } = fakeClient([plainEcho(joinedFrame)]);
    const out = await go(client, joinedFrame);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    const [p, q] = [board(flatDocument(joinedFrame), 'Rail'), board(flatDocument(out.doc), 'Rail')];
    expect(q.holes).toEqual(p.holes);
    expect([q.length, q.width, q.thickness, ...q.position]).toEqual([p.length, p.width, p.thickness, ...p.position]);
    expect(sameJoined(byName(out.doc), byName(joinedFrame))).toBe(true);
    expect(out.joints!.kept).toBe(2);
    expect(out.joints!.notJoined).toBeUndefined();
    expect(out.leaning).toEqual({ kept: ['Rail'], why: ['counterbores or countersinks'], replaced: [] });
    const sent = JSON.stringify(seen[0]);
    expect(sent).toContain('These parts lean, have angled holes or have counterbores or countersinks, which the design format cannot describe');
    expect(sent).toContain('\\"Rail\\" has counterbores or countersinks and is kept as is:');
  });

  it('(c) a re-join that would change the headed rail returns the design UNJOINED with the reason, the rail plain with its head', async () => {
    // The model drops the right leg under the rail's end: the rail now rests on it (a new meeting with a kept part: a fixed
    // butt) and the recorded right tenon has no meeting, so the re-joined rail would be 20" long, not 21".
    const echo = plainEcho(joinedFrame);
    const moved = { ...echo, parts: echo.parts.map((pt) => (pt.name === 'Right leg' ? { ...pt, at: { ...pt.at, x: 19 }, size: { ...pt.size, y: 26 } } : pt)) };
    const { client } = fakeClient([moved]);
    const out = await go(client, joinedFrame);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.notJoined).toBe('Joinery would have changed Rail, which Refine keeps as it is for its counterbores or countersinks, so the design comes back unjoined.');
    expect(out.joints!.kept).toBe(0);
    const rail = board(flatDocument(out.doc), 'Rail');
    expect(rail.length).toBe(19);
    expect(rail.cuts).toEqual([]);
    expect(rail.holes).toEqual([{ ...CB }]);
    for (const b of flatDocument(out.doc).boards) expect(b.cuts, b.name).toEqual([]);
  });
});
