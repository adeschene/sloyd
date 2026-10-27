import { ARCH } from '../document/curveFixtures';
import { apronArch } from '../document/sweepFixtures';
import { worldParts } from '../document/tree';
import { describe, expect, it, vi } from 'vitest';
import { MAX_REPAIRS, RunFailed, problemKey, refineEstimateUsd, runGeneration, runJoinery, runRefine, runRepairLoop } from './run';
import type { RefineProgress } from './run';
import { SYSTEM_PROMPT } from './prompt';
import type { GenerateSettings } from './prompt';
import { REFINE_MAX, plainForRefine, refineMessage } from './refine';
import { documentToDesign } from '../document/refineDesign';
import { LlmError } from '../llm/types';
import { createBoard, createDocument, flatDocument, migrateDocument } from '../document/document';
import { socketPlan } from '../document/legSockets';
import type { Board, SloydDocument } from '../document/document';
import { applyJoints } from './joints/recipes';
import { findSites, jointKey, rangesOf } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { GATE_REFUSAL, sameJoined } from './joints/unjoin';
import { DESIGN_SCHEMA, designSchema, designToDocument, parseDesign, toWireDesign } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import { catalogOf } from '../document/materials';
import { checkDesign } from '../document/designCheck';
import type { LlmClient, LlmRequest, LlmResult, LlmUsage } from '../llm/types';
import { CHARS_PER_TOKEN } from './estimate';
import { miterCut, taperCut } from '../document/angleCuts';
import { axisFrame, endFacing } from '../document/geometry';
import type { AngleCut, CurveCut } from '../document/types';
import type { WorldTaper } from '../document/taperWorld';
import * as zones from './joints/featureZones';
import { boardHoles } from '../document/holes';
import { toWorld } from '../document/snapPoints';
import { worldBodies } from '../document/drawing';
import { sameSet } from '../document/turnFixtures';
import { axisDimensions } from '../document/geometry';
import { clearedSquareStoolDocument, stoolDocument, stoolSeat } from '../document/stoolFixture';
import { leanMap } from '../document/lean';
import { tenonFaults } from '../document/roundTenons';
import { applyBoxJoints, boxJointPlan, fingerSets } from '../document/boxJoints';
import * as fingerClaim from './joints/fingerClaim';

vi.mock('./joints/fingerClaim', async (orig) => {
  const a = await orig<typeof import('./joints/fingerClaim')>();
  return { ...a, changedBoxJointed: vi.fn(a.changedBoxJointed) };
});
vi.mock('./joints/featureZones', async (orig) => {
  const a = await orig<typeof import('./joints/featureZones')>();
  return { ...a, featureAllowed: vi.fn(a.featureAllowed) };
});

const settings: GenerateSettings = {
  description: 'a box', width: null, depth: null, height: null, material: 'any', style: 'any', detail: 'simple',
};
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const p = (name: string, y: number) => ({
  name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: { x: 0, y, z: 0 }, size: { x: 10, y: 1, z: 10 },
});
const GOOD = { name: 'Stack', parts: [p('A', 0), p('B', 1)], assemblies: [] };
const ONE_ISSUE = { name: 'One', parts: [p('A', 0), p('B', 5)], assemblies: [] };                 // B floats
const TWO_ISSUES = { name: 'Two', parts: [p('A', 0), p('B', 5), p('C', 9)], assemblies: [] };     // B, C float
/** Parses, but every part is rejected (size rounds to zero) — zero boards. */
const ALL_REJECTED = { name: 'Gone', parts: [{ ...p('Sliver', 0), size: { x: 10, y: 0.01, z: 10 } }], assemblies: [] };

type Step = unknown | 'truncated' | 'unparseable' | LlmError;

/** A design step is scripted in the INTERNAL form (the four angle arrays) and answered as the model writes it: the wire
 *  form (`toWireDesign`, merged `angles`; AI-profiles spec R2, R6.4). Anything else (a joinery answer) goes as it is. */
const asAnswer = (step: unknown): unknown => {
  const d = step as Partial<GeneratedDesign> | null;
  return d && typeof d === 'object' && typeof d.name === 'string' && Array.isArray(d.parts) && Array.isArray(d.assemblies) ? toWireDesign(d as GeneratedDesign) : step;
};

/**
 * A scripted client that records a COPY of every request's history, and
 * keeps the (frozen) turn objects it returns so tests can check identity.
 */
function fakeClient(steps: Step[]) {
  const seen: unknown[][] = [];
  const turns: object[] = [];
  let i = 0;
  const client: LlmClient = {
    userTurn: (text) => ({ role: 'user', text }),
    estimateCostUsd: () => 0,
    complete: vi.fn(async (req: LlmRequest): Promise<LlmResult> => {
      seen.push([...req.messages]);
      const step = steps[Math.min(i, steps.length - 1)];
      const turn = Object.freeze({ role: 'assistant', n: i++ });
      turns.push(turn);
      if (step instanceof LlmError) throw step;
      if (step === 'truncated' || step === 'unparseable') return { json: null, unusable: step, assistantTurn: turn, usage };
      return { json: asAnswer(step), assistantTurn: turn, usage };
    }),
  };
  return { client, seen, turns };
}

const ASH = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
/** Every part and shape of `doc` in `material`, with `materials` stored: through the load gate, as a saved file would be. */
const paint = (doc: SloydDocument, material: string, materials: SloydDocument['materials']): SloydDocument => {
  const re = <T extends object>(b: T): T => ('material' in b ? { ...b, material } : b);
  return migrateDocument({ ...doc, materials, boards: doc.boards.map(re), shapes: doc.shapes.map(re),
    definitions: doc.definitions.map((d) => ({ ...d, boards: d.boards.map(re) })) });
};
const run = (client: LlmClient, signal = new AbortController().signal) =>
  runGeneration(client, settings, signal, () => {});

describe('runGeneration', () => {
  it('stops after one call when the first design is clean', async () => {
    const { client } = fakeClient([GOOD]);
    const out = await run(client);
    expect(out.violations).toEqual([]);
    expect(out.doc.boards).toHaveLength(2);
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it('accepts a design whose only parts are in an assembly', async () => {
    const { client } = fakeClient([{ name: 'Only', parts: [], assemblies: [{
      name: 'Shelf', parts: [{ ...p('Board', 0), role: '' }], placements: [{ name: 'S1', at: { x: 0, y: 0, z: 0 } }],
    }] }]);
    const out = await run(client);
    expect(out.doc.name).toBe('Only');
    expect(out.doc.instances).toHaveLength(1);
  });

  it(`stops at ${MAX_REPAIRS + 1} calls and still returns the best attempt`, async () => {
    const { client } = fakeClient([ONE_ISSUE]);
    const out = await run(client);
    expect(client.complete).toHaveBeenCalledTimes(MAX_REPAIRS + 1);
    expect(out.violations).toHaveLength(1);
  });

  it('keeps the FEWEST-violation attempt when a later one is worse', async () => {
    const { client } = fakeClient([ONE_ISSUE, TWO_ISSUES, TWO_ISSUES, TWO_ISSUES]);
    const out = await run(client);
    expect(out.doc.name).toBe('One');
  });

  it('keeps the later attempt on a tie', async () => {
    const tieLater = { ...ONE_ISSUE, name: 'Later' };
    const { client } = fakeClient([ONE_ISSUE, tieLater, TWO_ISSUES, TWO_ISSUES]);
    expect((await run(client)).doc.name).toBe('Later');
  });

  it('keeps the history APPEND-ONLY — every request extends the previous one unedited', async () => {
    const { client, seen, turns } = fakeClient([ONE_ISSUE, 'truncated', ONE_ISSUE, GOOD]);
    await run(client);
    expect(seen).toHaveLength(4);
    for (let k = 1; k < seen.length; k++) {
      const prev = seen[k - 1];
      for (let j = 0; j < prev.length; j++) expect(seen[k][j]).toBe(prev[j]);
      // The turn the client returned goes in AS THAT OBJECT — a copy would
      // compare equal by value and still be an edit (thinking signatures).
      expect(seen[k][prev.length]).toBe(turns[k - 1]);
      expect(seen[k].length).toBe(prev.length + 2);
    }
  });

  it('counts truncated and unparseable replies as attempts and recovers', async () => {
    const { client } = fakeClient(['truncated', 'unparseable', GOOD]);
    const out = await run(client);
    expect(client.complete).toHaveBeenCalledTimes(3);
    expect(out.violations).toEqual([]);
  });

  it('fails when no attempt yields a usable design, carrying the usage spent', async () => {
    const { client } = fakeClient(['unparseable']);
    const err = await run(client).catch((e) => e);
    expect(err).toBeInstanceOf(RunFailed);
    expect(err.usage.inputTokens).toBe(10 * (MAX_REPAIRS + 1));
  });

  it('propagates an auth error at once', async () => {
    const { client } = fakeClient([new LlmError('auth', 'bad key')]);
    await expect(run(client)).rejects.toMatchObject({ kind: 'auth' });
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it('puts the concept in the first message, and repairs keep it', async () => {
    const { client, seen } = fakeClient([ONE_ISSUE, GOOD]);
    await runGeneration(client, settings, new AbortController().signal, () => {}, { title: 'T', brief: 'B' });
    const first = (seen[0][0] as { text: string }).text;
    expect(first.endsWith('Design this version: T — B')).toBe(true);
    expect(seen[1][0]).toEqual(seen[0][0]);
  });

  it('without a concept, the first message has no concept line', async () => {
    const { client, seen } = fakeClient([GOOD]);
    await run(client);
    expect((seen[0][0] as { text: string }).text).not.toContain('Design this version');
  });

  it('tells the model about DEDUPED names — the ones it can find in its next answer', async () => {
    const dup = { name: 'Dup', parts: [p('Shelf', 0), p('Shelf', 5)], assemblies: [] };
    const { client, seen } = fakeClient([dup, GOOD]);
    await run(client);
    // dedupeNames keeps the first "Shelf" and renames the second "Shelf (1)"
    // (names.ts: `${stem} (${n})`, n from 1). The floating one is the second.
    const feedback = (seen[1][2] as { text: string }).text;
    expect(feedback).toContain('Shelf (1) is not connected');
  });

  it('reports progress: designing, then each repair round with its issue count', async () => {
    const { client } = fakeClient([TWO_ISSUES, ONE_ISSUE, GOOD]);
    const progress = vi.fn();
    await runGeneration(client, settings, new AbortController().signal, progress);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { phase: 'designing' },
      { phase: 'repairing', round: 1, issues: 2 },
      { phase: 'repairing', round: 2, issues: 1 },
    ]);
  });

  it('reports a round after an UNUSABLE attempt as retrying, not as fixing one issue', async () => {
    const { client } = fakeClient(['unparseable', ONE_ISSUE, GOOD]);
    const progress = vi.fn();
    await runGeneration(client, settings, new AbortController().signal, progress);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { phase: 'designing' },
      { phase: 'retrying', round: 1 },
      { phase: 'repairing', round: 2, issues: 1 },
    ]);
  });

  it('goes back to repairing after a usable attempt, and to retrying after a truncated one', async () => {
    const { client } = fakeClient([ONE_ISSUE, 'truncated', GOOD]);
    const progress = vi.fn();
    await runGeneration(client, settings, new AbortController().signal, progress);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { phase: 'designing' },
      { phase: 'repairing', round: 1, issues: 1 },
      { phase: 'retrying', round: 2 },
    ]);
  });

  it('never keeps a design whose parts were ALL rejected — zero boards is not a prototype', async () => {
    const { client } = fakeClient([ALL_REJECTED, TWO_ISSUES, TWO_ISSUES, TWO_ISSUES]);
    const out = await run(client);
    expect(out.doc.name).toBe('Two');
    expect(out.doc.boards.length).toBeGreaterThan(0);
  });

  it('fails a run whose only designs had every part rejected, telling the model why each was', async () => {
    const { client, seen } = fakeClient([ALL_REJECTED]);
    const progress = vi.fn();
    const err = await runGeneration(client, settings, new AbortController().signal, progress).catch((e) => e);
    expect(err).toBeInstanceOf(RunFailed);
    const feedback = (seen[1][2] as { text: string }).text;
    expect(feedback).toContain('Sliver has a size of zero or less after rounding to 1/16in.');
    expect(progress.mock.calls[1][0]).toEqual({ phase: 'retrying', round: 1 });
  });
});

describe('runRepairLoop keepBestOnError', () => {
  const adapter = {
    system: 's', schema: {}, first: 'go',
    evaluate: (res: { json: unknown }) => {
      const doc = designToDocument(res.json as never)!.doc;
      const violations = checkDesign(flatDocument(doc), { width: null, depth: null, height: null, maxParts: 50 });
      return { value: { doc, violations }, feedback: 'fix' };
    },
  };
  const go = (opts?: { keepBestOnError?: boolean }) => {
    const { client } = fakeClient([ONE_ISSUE, new LlmError('overloaded', 'busy')]);
    return runRepairLoop(client, adapter, new AbortController().signal, () => {}, opts);
  };

  it('returns the best attempt when a later call fails with a non-key error', async () => {
    const out = await go({ keepBestOnError: true });
    expect(out.violations.map((v) => v.parts)).toEqual([['B']]);
    expect(worldParts(out.doc).map((b) => b.name)).toEqual(['A', 'B']);
    expect(out.usage.inputTokens).toBe(10);
  });

  it.each(['cancelled', 'auth'] as const)('still rejects on %s', async (kind) => {
    const { client } = fakeClient([ONE_ISSUE, new LlmError(kind, 'x')]);
    await expect(runRepairLoop(client, adapter, new AbortController().signal, () => {}, { keepBestOnError: true }))
      .rejects.toMatchObject({ kind });
  });

  it('throws without the option', async () => {
    await expect(go()).rejects.toMatchObject({ kind: 'overloaded' });
  });
});

describe('problemKey (fu 186)', () => {
  it('a part named "A,B" is not the pair A and B', () => {
    const v = (parts: string[]) => ({ kind: 'overlap' as const, message: '', parts });
    expect(problemKey(v(['A,B']))).not.toBe(problemKey(v(['A', 'B'])));
    expect(problemKey(v(['B', 'A']))).toBe(problemKey(v(['A', 'B'])));
  });
});

const v3 = (x: number, y: number, z: number) => ({ x, y, z });
const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
  ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: v3(...at), size: v3(...size) });
/** A drawer whose Front and Side overlap, placed three times on the floor: one fault, three raw reports. */
const BAD_DRAWERS = {
  name: 'Drawers', parts: [],
  assemblies: [{
    name: 'Drawer',
    parts: [bp('Front', [0, 0, 0], [10, 4, 0.75]), bp('Side', [0, 0, 0], [0.75, 4, 10])],
    placements: [{ name: 'D1', at: v3(0, 0, 0) }, { name: 'D2', at: v3(20, 0, 0) }, { name: 'D3', at: v3(40, 0, 0) }],
  }],
};

describe('runGeneration — assemblies', () => {
  it('returns the tree, with the assembly shared', async () => {
    const { client } = fakeClient([{ ...GOOD, assemblies: BAD_DRAWERS.assemblies }]);
    const out = await run(client);
    expect(out.doc.definitions).toHaveLength(1);
    expect(out.doc.instances).toHaveLength(3);
  });

  it('reports a definition fault once, telling the model to fix the assembly', async () => {
    const { client } = fakeClient([BAD_DRAWERS]);
    const out = await run(client);
    const overlaps = out.violations.filter((x) => x.kind === 'overlap');
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].message).toBe('D1 › Side passes 0.75in into D1 › Front along X. (in every placement of Drawer — fix the assembly)');
    expect(overlaps[0].parts).toEqual(['Drawer › Side', 'Drawer › Front']);
  });

  it('puts "fix the assembly" in the repair message the model receives (F7)', async () => {
    const { client, seen } = fakeClient([BAD_DRAWERS, GOOD]);
    await run(client);
    const last = seen[1][seen[1].length - 1] as { role: string; text: string };
    expect(last.role).toBe('user');
    expect(last.text).toBe('Your design has 1 problem:\n- D1 › Side passes 0.75in into D1 › Front along X. (in every placement of Drawer — fix the assembly)\n\nReturn the whole corrected design.');
  });

  it('reports a drawer fault inside every placement and the spacing faults between neighbours separately (F1)', async () => {
    const SPACED = { ...BAD_DRAWERS, assemblies: [{ ...BAD_DRAWERS.assemblies[0], placements: [
      { name: 'D1', at: v3(0, 0, 0) }, { name: 'D2', at: v3(9.5, 0, 0) }, { name: 'D3', at: v3(19, 0, 0) },
    ] }] };
    const out = await run(fakeClient([SPACED]).client);
    const msgs = out.violations.filter((x) => x.kind === 'overlap').map((x) => x.message);
    expect(msgs.filter((m) => m.includes('fix the assembly'))).toHaveLength(1);
    expect(msgs.filter((m) => !m.includes('fix the assembly') && /\(in D\d/.test(m)).length).toBeGreaterThan(0);
  });

  it('does not throw on a loose part at 1.1e307 (F3)', async () => {
    const FAR = { name: 'Far', parts: [{ ...p('Far', 0), at: { x: 1.1e307, y: 0, z: 0 } }, p('Near', 0)], assemblies: [] };
    const out = await run(fakeClient([FAR]).client);
    expect(out.doc.boards.map((b) => b.name)).toEqual(['Near']);
    expect(out.violations.some((x) => x.message.includes('beyond 10,000in'))).toBe(true);
  });

  it('scores "fewest" on merged violations', async () => {
    // BAD_DRAWERS: 1 merged (3 raw). TWO_ISSUES: 2. Merged counting keeps BAD_DRAWERS.
    const { client } = fakeClient([BAD_DRAWERS, TWO_ISSUES]);
    const out = await run(client);
    expect(out.doc.name).toBe('Drawers');
  });

  it('counts an assembly once against the detail cap, and placed parts against the ceiling', async () => {
    const parts = Array.from({ length: 12 }, (_, i) => bp(`P${i}`, [0, i, 0], [10, 1, 10]));
    const placements = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, at: v3(i * 20, 0, 0) }));
    const kinds = async (design: unknown) => (await run(fakeClient([design]).client)).violations.filter((x) => x.kind === 'too-many-parts').map((x) => x.message);
    // 12 distinct x 4 placements = 48 placed: inside both limits (simple: 12 / 48).
    expect(await kinds({ name: 'A', parts: [], assemblies: [{ name: 'Stack', parts, placements: placements(4) }] })).toEqual([]);
    // 12 distinct x 5 = 60 placed: over the ceiling only.
    expect(await kinds({ name: 'B', parts: [], assemblies: [{ name: 'Stack', parts, placements: placements(5) }] })).toEqual(['60 parts; the limit is 48.']);
    // 13 distinct x 1: over the distinct cap only.
    expect(await kinds({ name: 'C', parts: [bp('Extra', [0, 20, 0], [10, 1, 10])], assemblies: [{ name: 'Stack', parts, placements: placements(1) }] }))
      .toEqual(["13 distinct parts; the limit is 12 (an assembly's parts count once)."]);
  });

  it('a flat design over both caps gets ONE report: the distinct cap (fu 233)', async () => {
    const kinds = async (design: unknown) => (await run(fakeClient([design]).client)).violations.filter((x) => x.kind === 'too-many-parts').map((x) => x.message);
    const flat = Array.from({ length: 49 }, (_, i) => bp(`F${i}`, [0, i, 0], [10, 1, 10]));
    expect(await kinds({ name: 'D', parts: flat, assemblies: [] }))
      .toEqual(["49 distinct parts; the limit is 12 (an assembly's parts count once)."]);
    // With an assembly placed twice the counts differ (13 distinct, 50 placed): two faults, both reported.
    const parts = Array.from({ length: 12 }, (_, i) => bp(`P${i}`, [0, i, 0], [10, 1, 10]));
    const twice = [{ name: 'C0', at: v3(0, 0, 0) }, { name: 'C1', at: v3(20, 0, 0) }];
    const loose = Array.from({ length: 26 }, (_, i) => bp(`L${i}`, [60, i, 0], [10, 1, 10]));
    expect(await kinds({ name: 'E', parts: loose, assemblies: [{ name: 'Stack', parts, placements: twice }] }))
      .toEqual(["38 distinct parts; the limit is 12 (an assembly's parts count once).", '50 parts; the limit is 48.']);
  });
});

const createDocumentForTest = () => createDocument('Empty');

describe('runRefine', () => {
  const RS = { instruction: 'make the top thicker', width: null, depth: null, height: null, detail: 'simple' as const };
  const v3 = (x: number, y: number, z: number) => ({ x, y, z });
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: v3(...at), size: v3(...size) });
  const orig = (parts: ReturnType<typeof bp>[]) => designToDocument({ name: 'Box', parts, assemblies: [] }).doc;
  const echo = (doc: Parameters<typeof documentToDesign>[0]) => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error('refused'); return r.design; };
  const go = (client: LlmClient, doc: Parameters<typeof runRefine>[1]) => runRefine(client, doc, RS, new AbortController().signal, () => {});

  it('refuses with no call', async () => {
    const { client } = fakeClient([GOOD]);
    const out = await go(client, createDocumentForTest());
    expect(out).toEqual({ refused: { reason: 'empty', message: 'There is nothing to refine yet.' } });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it('sends the unchanged SYSTEM_PROMPT and the refine user turn', async () => {
    const doc = orig([bp('Base', [0, 0, 0], [10, 1, 10]), bp('Top', [0, 1, 0], [10, 1, 10])]);
    const { client, seen } = fakeClient([echo(doc)]);
    await go(client, doc);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls[0][0].system).toBe(SYSTEM_PROMPT);
    const sent = documentToDesign(doc, REFINE_MAX); if ('refused' in sent) throw new Error('refused');
    expect(seen[0]).toEqual([client.userTurn(refineMessage(sent.design, RS))]);
  });

  it('keeps untouched parts exactly where they were, and carries settings over', async () => {
    const base = orig([bp('Base', [0, 0, 0], [10, 1, 10]), bp('Top', [0, 1, 0], [10, 1, 10])]);
    const doc = { ...base, stock: { kerf: 0.1 }, guides: [{ id: 'g1', at: [1, 2, 3] as [number, number, number] }] };
    const d = echo(doc);
    const wider = { ...d, parts: [d.parts[0]!, { ...d.parts[1]!, size: { ...d.parts[1]!.size, x: 14 } }] };
    const { client } = fakeClient([wider]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    const pos = (x: typeof doc) => flatDocument(x).boards.map((b) => [b.name, b.position]);
    expect(pos(out.doc)).toEqual(pos(doc));          // Top grew to the right; nothing moved
    expect(out.doc.stock.kerf).toBe(0.1);
    expect(out.doc.guides).toEqual(doc.guides);
    expect(out.changes.map((c) => c.kind)).toEqual(['resized']);
  });

  it('re-stores an untouched non-45° miter with its exact slope (AI-angles spec §6.2: the exact-angle map is wired in)', async () => {
    const made = designToDocument({ name: 'M', parts: [bp('Rail', [0, 0, 0], [18, 3, 0.75])], assemblies: [] }).doc;
    const rail = made.boards[0]! as Board;
    // 0.7 is no 0.1° step: rounding the echoed degrees would store a different slope.
    const doc = { ...made, boards: [{ ...rail, angleCuts: [{ id: 'm', ...miterCut({ end: 'max', across: 'thickness', longSide: 'min', ratio: 0.7 }, rail) }] }] };
    const { client } = fakeClient([echo(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(flatDocument(out.doc).boards[0]!.angleCuts.map((c) => c.points)).toEqual([doc.boards[0]!.angleCuts[0]!.points]);
    expect(out.changes).toEqual([]);
  });

  it('carries grain over by name', async () => {
    const doc = designToDocument({ name: 'G', parts: [{ ...bp('Shelf', [0, 0, 0], [30, 0.75, 11]), grain: 'width' }], assemblies: [] }).doc;
    const { client } = fakeClient([echo(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(flatDocument(out.doc).boards[0].grain).toBe('width');
  });

  it('a problem the original had is already present, even when its numbers change (review focus 3)', async () => {
    // A and B overlap 0.5in in the original; the refine leaves them overlapping 0.25in.
    const doc = orig([bp('A', [0, 0, 0], [10, 1, 10]), bp('B', [9.5, 0, 0], [10, 1, 10])]);
    const d = echo(doc);
    const shifted = { ...d, parts: [d.parts[0]!, { ...d.parts[1]!, at: { ...d.parts[1]!.at, x: d.parts[1]!.at.x + 0.25 } }] };
    const { client } = fakeClient([shifted]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(out.violations).toEqual([]);
    expect(out.present.map((v) => v.kind)).toEqual(['overlap']);
    expect(client.complete).toHaveBeenCalledTimes(1);   // nothing new: no repair round
  });

  it('sends a turned featured part back, and the fix clears the fault (refine-features spec §4)', async () => {
    const base = orig([bp('Side', [0, 0, 0], [20, 4, 1])]);
    const HOLE = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.5 } as const;
    // Holes are no longer carried (AI-holes spec §4); a curve is the carried feature that makes the turn a fault.
    const doc = { ...base, boards: base.boards.map((b) => ({ ...b, holes: [HOLE], curves: [ARCH] })) } as typeof base;
    const kept = echo(doc);
    const turned = { ...kept, parts: [{ ...kept.parts[0]!, size: v3(20, 1, 4) }] };
    const { client, seen } = fakeClient([turned, kept]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(client.complete).toHaveBeenCalledTimes(2);
    const second = JSON.stringify(seen[1]);
    expect(second).toContain('Side carries a curve Sloyd keeps on the part; keep it the same way round, 1in along z.');
    expect(out.violations.filter((x) => x.kind === 'feature-turned')).toEqual([]);
    expect(flatDocument(out.doc).boards[0]!.curves).toHaveLength(1);
  });

  it('keeps a typed off-grid position and size exactly, with no change reported (F2)', async () => {
    const base = orig([bp('A', [0, 0, 0], [10, 1, 8])]);
    const doc = { ...base, boards: base.boards.map((b) => ({ ...b, position: [0.03, 0, 0] as [number, number, number], length: 10.01 })) };
    const { client } = fakeClient([echo(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    const b = flatDocument(out.doc).boards[0]!;
    expect(b.position).toEqual([0.03, 0, 0]);
    expect(b.length).toBe(10.01);
    expect(out.changes).toEqual([]);
  });

  it('keeps a typed off-grid placement origin exactly (F2)', async () => {
    const base = designToDocument({ name: 'D', parts: [], assemblies: [{ name: 'Drawer', parts: [bp('Front', [0, 0, 0], [10, 4, 1])], placements: [{ name: 'D1', at: v3(0, 0, 0) }] }] }, { centre: false }).doc;
    const doc = { ...base, instances: base.instances.map((i) => ({ ...i, position: [0.03, 0, 0] as [number, number, number] })) };
    const { client } = fakeClient([echo(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(out.doc.instances[0]!.position).toEqual([0.03, 0, 0]);
    expect(out.changes).toEqual([]);
  });

  it('re-links equal parts with the original grain (F5)', async () => {
    const leg = (n: string, x: number) => ({ ...bp(n, [x, 0, 0], [2, 28, 2]), role: 'leg', grain: 'width' as const });
    const doc = designToDocument({ name: 'L', parts: [leg('Leg 1', 0), leg('Leg 2', 10)], assemblies: [] }, { centre: false }).doc;
    expect(doc.shapes).toHaveLength(1);
    const { client } = fakeClient([echo(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(out.doc.shapes).toHaveLength(1);
    expect(out.doc.shapes[0]!.grain).toBe('width');
  });

  it('limits are judged on the result: a limit the original already broke is still a violation (F1, probe A)', async () => {
    const doc = orig([bp('Post', [0, 0, 0], [10, 40, 10])]);           // 40in tall already
    const wide = { ...echo(doc), parts: [bp('Post', [0, 0, 0], [40, 40, 10])] };
    const { client } = fakeClient([wide]);
    const out = await runRefine(client, doc, { ...RS, width: 30, height: 30 }, new AbortController().signal, () => {});
    if ('refused' in out) throw new Error('refused');
    const msgs = out.violations.filter((x) => x.kind === 'too-large').map((x) => x.message);
    expect(msgs).toHaveLength(2);
    expect(msgs.some((m) => /width/i.test(m))).toBe(true);
    expect(msgs.some((m) => /height/i.test(m))).toBe(true);
    expect(out.present.filter((x) => x.kind === 'too-large')).toEqual([]);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);   // a repair call
  });

  it('a metric project\'s faults are shown in mm, while the model is told in inches (fu 355)', async () => {
    const doc = { ...orig([bp('A', [0, 0, 0], [10, 1, 10]), bp('B', [20, 0, 0], [10, 1, 10])]), units: { display: 'metric-mm' as const, precision: 16 } };
    const d = echo(doc);
    const into = { ...d, parts: [d.parts[0]!, { ...d.parts[1]!, at: { ...d.parts[1]!.at, x: d.parts[0]!.at.x + 9.5 } }] };   // B now 0.5in into A
    const { client, seen } = fakeClient([into]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    const [v] = out.violations;
    expect(v!.message).toBe('B passes 0.5in into A along X.');
    expect(v!.shown).toBe('B passes 12.7 mm into A along X.');
    // The repair turn the model reads carries the inches text, never the mm.
    const told = JSON.stringify(seen[1]);
    expect(told).toContain('B passes 0.5in into A along X.');
    expect(told).not.toContain(' mm');
  });

  it('a metric project\'s taper-at-joint advice is shown in whole mm, floored (fu 355)', async () => {
    const doc = { ...orig([bp('Leg', [0, 0, 0], [1.75, 28, 1.75]), bp('Rail X', [1.75, 23.5, 0.5], [18, 3, 0.75])]), units: { display: 'metric-mm' as const, precision: 16 } };
    const d = echo(doc);
    const tapered = { ...d, parts: d.parts.map((p) => (p.name === 'Leg' ? { ...p, tapers: [{ faces: ['+x', '+z'], toward: '-y', start: 24, amount: 0.375 }] } : p)) };
    const { client } = fakeClient([tapered]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    const v = out.violations.find((x) => x.kind === 'angle-joint')!;
    expect(v.message).toContain('start it 23.5in or less');
    expect(v.shown).toContain('start it 596 mm or less');
  });

  it('an unchanged design over the limit it was already over is a too-large violation, not present (F1, probe B)', async () => {
    const doc = orig([bp('Slab', [0, 0, 0], [36, 1, 10])]);
    const { client } = fakeClient([echo(doc)]);
    const out = await runRefine(client, doc, { ...RS, width: 30 }, new AbortController().signal, () => {});
    if ('refused' in out) throw new Error('refused');
    expect(out.violations.map((x) => x.kind)).toEqual(['too-large']);
    expect(out.present).toEqual([]);
  });

  it('a new problem drives repair; "fewest" ignores already-present ones', async () => {
    const doc = orig([bp('A', [0, 0, 0], [10, 1, 10]), bp('B', [9.5, 0, 0], [10, 1, 10])]);   // one old overlap
    const d = echo(doc);
    const floating = { ...d, parts: [...d.parts, bp('C', [0, 5, 0], [10, 1, 10])] };          // + one new problem
    const { client } = fakeClient([floating, d]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(out.violations).toEqual([]);                 // the second attempt has no NEW problem
  });

  it('estimates a range (fu 236), or null when refused', () => {
    const estimate = vi.fn((u: LlmUsage) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens);
    const c = { ...fakeClient([GOOD]).client, estimateCostUsd: estimate };
    expect(refineEstimateUsd(c, createDocumentForTest(), RS)).toBeNull();
    const doc = orig([bp('A', [0, 0, 0], [10, 1, 10])]);
    const r = refineEstimateUsd(c, doc, RS)!;
    // One low call, then one per round the loop allows.
    expect(estimate).toHaveBeenCalledTimes(1 + (1 + MAX_REPAIRS));
    const first = (estimate.mock.calls[0] as unknown[])[0] as LlmUsage;
    // The system prompt AND the design schema are the cached prefix, written on the first call.
    expect(first.cacheWriteTokens).toBe(Math.ceil((SYSTEM_PROMPT.length + JSON.stringify(DESIGN_SCHEMA).length) / CHARS_PER_TOKEN));
    expect(first.cacheReadTokens).toBe(0);
    expect(r.high).toBeGreaterThan(r.low);
  });
});

describe('runRefine — custom materials (custom materials spec §6)', () => {
  const RS = { instruction: 'make the top thicker', width: null, depth: null, height: null, detail: 'simple' as const };
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
    ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
  const echo = (doc: SloydDocument) => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error('refused'); return r.design; };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  const doc = paint(designToDocument({ name: 'Box', parts: [bp('Top', [0, 0, 0], [10, 1, 10])], assemblies: [] }).doc, 'm-s-ash1', [ASH]);

  it('the fixture is what it claims: the part is Ash and the project carries it', () => {
    expect((doc.boards[0] as Board).material).toBe('m-s-ash1');
    expect(doc.materials).toEqual([ASH]);
    expect(echo(doc).parts[0]!.material).toBe('m-s-ash1');
  });

  it('sends a schema whose material enum lists the project\'s id, and the line naming it', async () => {
    const { client, seen } = fakeClient([echo(doc)]);
    await go(client, doc);
    const req = (client.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as LlmRequest;
    const part = (req.schema.$defs as { part: { properties: { material: { enum: string[] } } } }).part;
    expect(part.properties.material.enum).toContain('m-s-ash1');
    expect((seen[0]![0] as { text: string }).text).toContain('Custom materials in this design: "m-s-ash1" is Ash.');
  });

  it('an untouched custom-material part keeps its material, and the derived project carries the material', async () => {
    const { client } = fakeClient([echo(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect((flatDocument(out.doc).boards[0]! as Board).material).toBe('m-s-ash1');
    expect(out.doc.materials).toEqual([ASH]);
    expect(out.changes).toEqual([]);
  });

  it('a part moved off the custom material prunes it, and the change list names both labels', async () => {
    const d = echo(doc);
    const { client } = fakeClient([{ ...d, parts: [{ ...d.parts[0]!, material: 'oak' }] }]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(out.doc.materials).toEqual([]);
    expect(out.changes.map((c) => c.text)).toEqual(['Top: Ash → Oak']);
  });

  it('the estimate prices the schema and message Refine actually sends', () => {
    const estimate = vi.fn((u: LlmUsage) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens);
    const c = { ...fakeClient([GOOD]).client, estimateCostUsd: estimate };
    refineEstimateUsd(c, doc, RS);
    const first = (estimate.mock.calls[0] as unknown[])[0] as LlmUsage;
    const prefix = SYSTEM_PROMPT.length + JSON.stringify(designSchema(catalogOf(doc))).length;
    expect(prefix).toBeGreaterThan(SYSTEM_PROMPT.length + JSON.stringify(DESIGN_SCHEMA).length);
    expect(first.cacheWriteTokens).toBe(Math.ceil(prefix / CHARS_PER_TOKEN));
  });

  it('a joined design keeps its custom material through the re-join', async () => {
    const flat = flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
      bp('Leg', [0, 0, 0], [1.75, 28, 1.75]), bp('Rail', [1.75, 23.5, 0.5], [18, 3, 0.75]),
    ] }).doc);
    const sites = findSites(flat);
    const joined = paint(migrateDocument(applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites))).doc), 'm-s-ash1', [ASH]);
    expect(flatDocument(joined).boards.some((b) => b.cuts.length > 0)).toBe(true);
    const p = plainForRefine(joined); if ('refused' in p) throw new Error(p.refused.message);
    const { client } = fakeClient([echo(p.plain)]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(flatDocument(out.doc).boards.map((b) => (b as Board).material)).toEqual(['m-s-ash1', 'm-s-ash1']);
    expect(out.doc.materials).toEqual([ASH]);
  });
});

describe('runRefine — hardware (hardware spec §6)', () => {
  const RS = { instruction: 'make the top thicker', width: null, depth: null, height: null, detail: 'simple' as const };
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
    ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
  const echo = (doc: SloydDocument) => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message); return r.design; };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  const TYPES = [{ id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: 4.5 }, { id: 'h2', name: 'Screw', packSize: 100, pricePerPack: null }];
  const PROJECT = [{ type: 'h1', count: 2 }, { type: 'h2', count: 40 }];
  /** Types and project hardware, through the load gate, as a saved file would be. */
  const kitted = (doc: SloydDocument): SloydDocument => migrateDocument({ ...doc, hardwareTypes: TYPES, hardware: PROJECT });
  const box = kitted(designToDocument({ name: 'Box', parts: [bp('Base', [0, 0, 0], [10, 1, 10]), bp('Top', [0, 1, 0], [10, 1, 10])], assemblies: [] }).doc);

  it('the fixture is what it claims: the types and the project hardware survive the load', () => {
    expect(box.hardwareTypes).toEqual(TYPES);
    expect(box.hardware).toEqual(PROJECT);
  });

  it('a plain result carries the types and the project hardware', async () => {
    const { client } = fakeClient([echo(box)]);
    const out = await go(client, box);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.doc.hardwareTypes).toEqual(TYPES);
    expect(out.doc.hardware).toEqual(PROJECT);
    expect(out.changes).toEqual([]);
  });

  it('a joined result carries them through the re-join', async () => {
    const flat = flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
      bp('Leg', [0, 0, 0], [1.75, 28, 1.75]), bp('Rail', [1.75, 23.5, 0.5], [18, 3, 0.75]),
    ] }).doc);
    const sites = findSites(flat);
    const joined = kitted(migrateDocument(applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites))).doc));
    expect(flatDocument(joined).boards.some((b) => b.cuts.length > 0)).toBe(true);
    const p = plainForRefine(joined); if ('refused' in p) throw new Error(p.refused.message);
    const { client } = fakeClient([echo(p.plain)]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(out.doc.hardwareTypes).toEqual(TYPES);
    expect(out.doc.hardware).toEqual(PROJECT);
  });
});

describe('runRefine — band types (refine-features spec §3.3)', () => {
  const RS = { instruction: 'make the top thicker', width: null, depth: null, height: null, detail: 'simple' as const };
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
    ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
  const echo = (doc: SloydDocument) => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message); return r.design; };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  /** A custom solid band type NO part uses, naming a custom material: only the document-level merge can keep it. */
  const EDGING = { id: 'e1', name: 'Ash edging', kind: 'solid' as const, thickness: 0.25, lengthAllowance: 0.5, material: 'm-s-ash1', widthAllowance: 0.0625 };
  const box = migrateDocument({ ...designToDocument({ name: 'Box', parts: [bp('Base', [0, 0, 0], [10, 1, 10])], assemblies: [] }).doc,
    materials: [ASH], bandTypes: [createDocument('x').bandTypes[0]!, EDGING] });

  it('the fixture is what it claims: the custom band type and its material survive the load, no part uses them', () => {
    expect(box.bandTypes.map((t) => t.id)).toEqual(['band-iron-on', 'e1']);
    expect(box.materials).toEqual([ASH]);
    expect(flatDocument(box).boards.every((b) => b.bands.length === 0)).toBe(true);
  });

  it('runRefine keeps custom band types (and the material a band type names)', async () => {
    const { client } = fakeClient([echo(box)]);
    const out = await go(client, box);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.doc.bandTypes).toEqual(box.bandTypes);
    expect(out.doc.materials).toEqual([ASH]);
    expect(out.changes).toEqual([]);
  });

  it('a joined result keeps them through the re-join', async () => {
    const flat = flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
      bp('Leg', [0, 0, 0], [1.75, 28, 1.75]), bp('Rail', [1.75, 23.5, 0.5], [18, 3, 0.75]),
    ] }).doc);
    const sites = findSites(flat);
    const joined = migrateDocument({ ...migrateDocument(applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites))).doc), materials: [ASH], bandTypes: box.bandTypes });
    const p = plainForRefine(joined); if ('refused' in p) throw new Error(p.refused.message);
    const { client } = fakeClient([echo(p.plain)]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(out.doc.bandTypes).toEqual(box.bandTypes);
    expect(out.doc.materials).toEqual([ASH]);
  });
});

describe('runRefine — joined designs', () => {
  const RS = { instruction: 'change it', width: null, depth: null, height: null, detail: 'moderate' as const };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  const plainEcho = (d: SloydDocument) => {
    const p = plainForRefine(d); if ('refused' in p) throw new Error(p.refused.message);
    const r = documentToDesign(p.plain, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message);
    return r.design;
  };
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
    ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
  const bookFlat = flatDocument(designToDocument({ name: 'Bookcase', assemblies: [], parts: [
    bp('Back', [0, 0, -0.25], [31.5, 72, 0.25]), bp('Left side', [0, 0, 0], [0.75, 72, 11.25]), bp('Right side', [30.75, 0, 0], [0.75, 72, 11.25]),
    bp('Bottom', [0.75, 0, 0], [30, 0.75, 11.25]), bp('Top', [0.75, 71.25, 0], [30, 0.75, 11.25]),
    bp('Shelf 1', [0.75, 24, 0], [30, 0.75, 11.25]), bp('Shelf 2', [0.75, 48, 0], [30, 0.75, 11.25]),
  ] }).doc);
  const bookSites = findSites(bookFlat);
  const joined: SloydDocument = migrateDocument(applyJoints(bookFlat, bookSites, bookSites.map((s) => defaultChoice(s, bookFlat, bookSites))).doc);

  it('refines a joined design unchanged: one call, no joinery call, the same joined design back (review focus 1)', async () => {
    const echo = plainEcho(joined);
    const { client } = fakeClient([echo]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(sameJoined(flatDocument(out.doc), flatDocument(joined))).toBe(true);
    expect(out.joints).toMatchObject({ chosen: 0, dropped: 0 });
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(out.changes).toEqual([]);
  });

  it('a joined holed project whose parts joinery grew or rebased lists nothing to check (refine-features spec §5)', async () => {
    const HOLE = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.25, along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 3 } as const;
    const holed = { ...bookFlat, boards: bookFlat.boards.map((b) => (b.name === 'Back' ? b : { ...b, holes: [HOLE] })) };
    const hSites = findSites(holed);
    const hJoined = migrateDocument(applyJoints(holed, hSites, hSites.map((s) => defaultChoice(s, holed, hSites))).doc);
    expect(flatDocument(hJoined).boards.some((b) => b.holes.length > 0)).toBe(true);
    const { client } = fakeClient([plainEcho(hJoined)]);
    const out = await go(client, hJoined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(out.carried).toEqual({ notKept: [], check: [] });
  });

  it('a feature check that throws after the paid call returns the refined design unjoined, with the words, never a rejection', async () => {
    const echo = plainEcho(joined);
    const { client } = fakeClient([echo]);
    const fa = vi.mocked(zones.featureAllowed);
    fa.mockImplementationOnce(() => { throw new Error('latent recipe throw'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const out = await go(client, joined);
      if ('refused' in out) throw new Error(out.refused.message);
      expect(fa).toHaveBeenCalled();
      expect(out.joints).toEqual({ kept: 0, chosen: 0, dropped: 0, skipped: [], notes: [], notJoined: zones.FEATURE_CHECK_FAILED });
      expect(flatDocument(out.doc).boards.every((b) => b.cuts.length === 0)).toBe(true);
      expect(err).toHaveBeenCalled();
    } finally { err.mockRestore(); }
  });

  it('a cancel or a model failure inside joinery still surfaces (only the feature check is caught)', async () => {
    const echo = plainEcho(joined);
    const withShelf = { ...echo, parts: [...echo.parts, { ...echo.parts.find((p) => p.name === 'Shelf 1')!, name: 'Shelf 3', at: { ...echo.parts.find((p) => p.name === 'Shelf 1')!.at, y: 60 } }] };
    const { client } = fakeClient([withShelf, new LlmError('auth', 'bad key')]);
    await expect(go(client, joined)).rejects.toBeInstanceOf(LlmError);
  });

  /** A shelf added where a hole in the Left side sits: joinery rules the dado out there, and says so in `notes` (the dialog shows them). */
  it('joinery\'s ruled-out lines come back in joints.notes', async () => {
    const HOLE = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.25, along: 'length', alongFrom: 'min', station: 60, count: 1, pitch: 0, acrossFrom: 'min', inset: 3 } as const;
    const holed = { ...bookFlat, boards: bookFlat.boards.map((b) => (b.name === 'Left side' ? { ...b, holes: [HOLE] } : b)) };
    const hSites = findSites(holed);
    const hJoined = migrateDocument(applyJoints(holed, hSites, hSites.map((s) => defaultChoice(s, holed, hSites))).doc);
    const echo = plainEcho(hJoined);
    const withShelf = { ...echo, parts: [...echo.parts, { ...echo.parts.find((p) => p.name === 'Shelf 1')!, name: 'Shelf 3', at: { ...echo.parts.find((p) => p.name === 'Shelf 1')!.at, y: 60 } }] };
    const { client } = fakeClient([withShelf, { joints: [] }]);
    const out = await go(client, hJoined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.notes).toEqual(["Shelf 3 → Left side: dado and stopped dado ruled out — Left side's holes are in the way."]);
  });

  it('a joined project with no ruled-out kinds has notes []', async () => {
    const { client } = fakeClient([plainEcho(joined)]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.notes).toEqual([]);
  });

  /** World readings through the helpers (as carryConvert.test.ts): hole centres and the part's body points. */
  const worldHoles = (b: Board) => boardHoles(b).map((h) => {
    const k = axisDimensions(b).indexOf(h.axis);
    const dir = [0, 0, 0];
    dir[k] = endFacing(b, k, -1) === (h.dir === 1 ? 'min' : 'max') ? 1 : -1;
    return [...toWorld(b, { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] }), ...dir];
  });
  const worldPoints = (b: Board) => worldBodies(b).flatMap((w) => (w.box ? [w.box.min as number[], w.box.max as number[]] : w.verts as number[][]));

  it('an echo Refine of a joined project keeps shelf-pin holes measured from the max end and a curve on a part joinery grew exactly where they were (spec §8)', async () => {
    const PINS = { id: 'h1', face: 'thickness', from: 'min', diameter: 0.25, depth: 0.25, along: 'length', alongFrom: 'max', station: 10, count: 3, pitch: 4, acrossFrom: 'min', inset: 3 } as const;
    const ARCH1 = { id: 'c1', through: 'thickness', uFrom: 'min', vFrom: 'max', start: [8, 0], segments: [{ type: 'arc', to: [20, 0], side: 'left', rise: 1 }, { type: 'line', to: [8, 0] }] } as CurveCut;
    const feat = { ...bookFlat, boards: bookFlat.boards.map((b) => (b.name === 'Left side' ? { ...b, holes: [PINS] } : b.name === 'Shelf 1' ? { ...b, curves: [ARCH1] } : b)) };
    const fSites = findSites(feat);
    const fJoined = migrateDocument(applyJoints(feat, fSites, fSites.map((s) => defaultChoice(s, feat, fSites))).doc);
    const before = new Map(flatDocument(fJoined).boards.map((b) => [b.name, b] as const));
    // The fixture is what it claims: the pins survive the load, the shelf was grown by its joints, the curve survived.
    expect(before.get('Left side')!.holes[0]!.alongFrom).toBe('max');
    expect(before.get('Shelf 1')!.curves).toHaveLength(1);
    expect(before.get('Shelf 1')!.length).toBeGreaterThan(30);
    const { client } = fakeClient([plainEcho(fJoined)]);
    const out = await go(client, fJoined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.kept).toBeGreaterThan(0);
    const after = new Map(flatDocument(out.doc).boards.map((b) => [b.name, b] as const));
    for (const name of ['Left side', 'Shelf 1']) {
      const o = before.get(name)!, r = after.get(name)!;
      expect(sameSet(worldHoles(r), worldHoles(o)), `${name}: world holes`).toBe(true);
      expect(sameSet(worldPoints(r), worldPoints(o)), `${name}: world bodies`).toBe(true);
    }
    expect(worldHoles(after.get('Left side')!)).toHaveLength(3);
  });

  it('adds a shelf: two calls, and the joinery message lists only the new sites', async () => {
    const echo = plainEcho(joined);
    const withShelf = { ...echo, parts: [...echo.parts, { ...echo.parts.find((p) => p.name === 'Shelf 1')!, name: 'Shelf 3', at: { ...echo.parts.find((p) => p.name === 'Shelf 1')!.at, y: 60 } }] };
    const { client, seen } = fakeClient([withShelf, { joints: [] }]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(2);
    const joinMsg = String(seen[1][0] && (seen[1][0] as { text: string }).text);
    const listed = joinMsg.split('Sites:\n')[1]!.split('\n').filter((l) => /^\d+\. /.test(l));
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((l) => l.includes('Shelf 3'))).toBe(true);
    expect(out.joints!.chosen).toBe(listed.length);
  });

  it('joinery\'s own rounds report stage "join"; the design call\'s do not (fu 242)', async () => {
    const echo = plainEcho(joined);
    const withShelf = { ...echo, parts: [...echo.parts, { ...echo.parts.find((p) => p.name === 'Shelf 1')!, name: 'Shelf 3', at: { ...echo.parts.find((p) => p.name === 'Shelf 1')!.at, y: 60 } }] };
    // Design: unusable then the shelf (a design retry). Joinery: unusable then an answer (a joinery retry).
    const { client } = fakeClient(['unparseable', withShelf, 'unparseable', { joints: [] }]);
    const seen: RefineProgress[] = [];
    const out = await runRefine(client, joined, RS, new AbortController().signal, (p) => seen.push(p));
    if ('refused' in out) throw new Error(out.refused.message);
    expect(seen).toEqual([
      { phase: 'designing' }, { phase: 'retrying', round: 1 },
      { phase: 'designing', stage: 'join' }, { phase: 'retrying', round: 1, stage: 'join' },
    ]);
  });

  it('a new meeting answered butt still counts as chosen (spec §4 counts)', async () => {
    const echo = plainEcho(joined);
    const s1 = echo.parts.find((p) => p.name === 'Shelf 1')!;
    const withShelf = { ...echo, parts: [...echo.parts, { ...s1, name: 'Shelf 3', at: { ...s1.at, y: 60 } }] };
    // butt for every site id the message could list; parseChoices ignores ids that are not open
    const allButt = { joints: Array.from({ length: 40 }, (_, i) => ({ site: i, joint: 'butt' })) };
    const { client, seen } = fakeClient([withShelf, allButt]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(2);
    const joinMsg = String((seen[1][0] as { text: string }).text);
    const listed = joinMsg.split('Sites:\n')[1]!.split('\n').filter((l) => /^\d+\. /.test(l));
    expect(listed).toHaveLength(2);   // Shelf 3 into each side
    expect(out.joints).toEqual({ kept: 12, chosen: 2, dropped: 0, skipped: [], notes: [] });
  });

  it('a meeting the original left butt stays butt: refined unchanged, ONE call, the same joined design back', async () => {
    const sh = bookSites.find((s) => bookFlat.boards[s.enter].name === 'Shelf 1' && bookFlat.boards[s.receive].name === 'Left side')!;
    const withButt: SloydDocument = migrateDocument(applyJoints(bookFlat, bookSites,
      bookSites.map((s) => (s.id === sh.id ? { site: s.id, joint: 'butt' as const } : defaultChoice(s, bookFlat, bookSites)))).doc);
    const { client } = fakeClient([plainEcho(withButt), { joints: [] }]);
    const out = await go(client, withButt);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(sameJoined(flatDocument(out.doc), flatDocument(withButt))).toBe(true);
    expect(out.joints).toEqual({ kept: bookSites.length - 1, chosen: 0, dropped: 0, skipped: [], notes: [] });
    expect(out.changes).toEqual([]);
  });

  it('removes a shelf: its joints are dropped, no joinery call', async () => {
    const echo = plainEcho(joined);
    const without = { ...echo, parts: echo.parts.filter((p) => p.name !== 'Shelf 2') };
    const { client } = fakeClient([without]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(out.joints!.dropped).toBeGreaterThan(0);
    expect(out.joints).toEqual({ kept: 10, chosen: 0, dropped: 2, skipped: [], notes: [] });   // Shelf 2's dado into each side
  });

  it('a joined design the gate cannot explain is refused with no call (review focus 2)', async () => {
    const bad = structuredClone(joined);
    (bad.boards.find((b) => b.name === 'Top') as Board).cuts.push({ id: 'h', face: 'thickness', from: 'min', across: 'width', offset: 3, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 });
    const { client } = fakeClient([GOOD]);
    const out = await go(client, bad);
    expect(out).toEqual({ refused: { reason: 'joints', message: GATE_REFUSAL } });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it('a side made thinner re-chooses the joints into it instead of clamping (review focus 3)', async () => {
    // Thin both sides from their OUTER faces to 3/8in, so every shelf still touches them but the recorded
    // dado depths no longer fit their ranges. (The brief expected the back's rabbets into the sides to be
    // re-chosen too; measured, the plain back now overhangs the thinned sides and findSites no longer
    // sees those two meetings, so they are DROPPED, not re-chosen.)
    const echo = plainEcho(joined);
    const thin = { ...echo, parts: echo.parts.map((p) =>
      p.name === 'Left side' ? { ...p, at: { ...p.at, x: p.at.x + 0.375 }, size: { ...p.size, x: 0.375 } }
        : p.name === 'Right side' ? { ...p, size: { ...p.size, x: 0.375 } } : p) };
    const { client } = fakeClient([thin, { joints: [] }]);   // joinery's empty answer -> its defaults, no notes
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(out.joints!.chosen).toBeGreaterThanOrEqual(1);
    // 12 records: 8 dados into the sides (Top, Bottom, Shelf 1, Shelf 2, each side) re-chosen; the back's
    // rabbets into Top and Bottom kept; its rabbets into the two sides dropped. A re-chosen record is
    // never counted as dropped.
    expect(out.joints).toEqual({ kept: 2, chosen: 8, dropped: 2, skipped: [], notes: [] });
    // The 2 dropped, grounded outside runRefine: the thinned plain design has no Back→side meetings.
    const thinFlat = flatDocument(designToDocument(thin).doc);
    const thinKeys = findSites(thinFlat).map((s) => jointKey(thinFlat.boards[s.enter]!.name, thinFlat.boards[s.receive]!.name, s.axis, s.side));
    expect(thinKeys).not.toContain('Back→Left side|2|1');
    expect(thinKeys).not.toContain('Back→Right side|2|1');
    expect(thinKeys).toHaveLength(10);
  });

  it('keeps a shared assembly shared after refining (review focus 4)', async () => {
    const v3 = (x: number, y: number, z: number) => ({ x, y, z });
    const tree = designToDocument({ name: 'Frames', parts: [], assemblies: [{ name: 'Frame',
      // Two legs per frame so the piece does not tip: a tipping fixture makes the REFINE stage repair
      // (part-less problems are always new, refine spec §3.2), which is not what this test is about.
      parts: [{ name: 'Leg', role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'oak', at: v3(0, 0, 0), size: v3(1.75, 28, 1.75) },
        { name: 'Leg 2', role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'oak', at: v3(19.75, 0, 0), size: v3(1.75, 28, 1.75) },
        { name: 'Rail', role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'oak', at: v3(1.75, 23.5, 0.5), size: v3(18, 3, 0.75) }],
      placements: [{ name: 'Front', at: v3(0, 0, 0) }, { name: 'Back', at: v3(0, 0, 30) }] }] }).doc;
    const jo = await runJoinery(fakeClient([new LlmError('overloaded', 'Overloaded.')]).client, tree, new AbortController().signal, () => {});
    if ('noSites' in jo || 'refused' in jo) throw new Error('sites');
    const joinedTree = jo.result.doc;
    expect(joinedTree.definitions).toHaveLength(1);
    const { client } = fakeClient([plainEcho(joinedTree)]);
    const out = await go(client, joinedTree);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.doc.definitions).toHaveLength(1);
    expect(out.doc.instances.map((i) => i.definition)).toEqual([out.doc.definitions[0].id, out.doc.definitions[0].id]);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(sameJoined(flatDocument(out.doc), flatDocument(joinedTree))).toBe(true);
    expect(out.joints).toMatchObject({ chosen: 0, dropped: 0 });
    expect(out.changes).toEqual([]);
  });

  it('keeps joinery’s own default tenons below the model’s range floor: refined unchanged, ONE call (F2)', async () => {
    // A 1in leg: the model's tenon range is [1/2, 3/4], but the defaults cap the two rails' tenons
    // under it (fu 188). A base plate keeps the piece standing.
    const lf = flatDocument(designToDocument({ name: 'Thin corner', assemblies: [], parts: [
      bp('Base', [-2, 0, -2], [24, 0.75, 24]), bp('Leg', [0, 0.75, 0], [1, 28, 1]),
      bp('Rail X', [1, 24.25, 0.125], [18, 3, 0.75]), bp('Rail Z', [0.125, 24.25, 1], [0.75, 3, 18]),
    ] }).doc);
    const ls = findSites(lf);
    const choices = ls.map((s) => defaultChoice(s, lf, ls));
    const tenons = ls.filter((s) => lf.boards[s.receive].name === 'Leg');
    expect(tenons).toHaveLength(2);
    for (const s of tenons) {
      const c = choices.find((x) => x.site === s.id)!;
      expect(c.joint).toBe('mortise-tenon');
      expect(c.tenonLength!).toBeLessThan(rangesOf(s, lf).tenonLength[0]);
    }
    const thinJoined: SloydDocument = migrateDocument(applyJoints(lf, ls, choices).doc);
    const { client } = fakeClient([plainEcho(thinJoined), { joints: [] }]);
    const out = await go(client, thinJoined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(out.joints).toMatchObject({ chosen: 0, dropped: 0 });
    expect(sameJoined(flatDocument(out.doc), flatDocument(thinJoined))).toBe(true);
  });

  it('keeps a metric dado at its range maximum whose read-back is off in the last bit: ONE call (validChoice within GATE_TOLERANCE)', async () => {
    const mm = (v: number) => v / 25.4;
    const parts = [bp('Side', [3.3, 0, 0], [mm(18), mm(720), mm(300)]), bp('Shelf', [3.3 + mm(18), 3.3 + mm(250), 0], [mm(564), mm(18), mm(300)]),
      bp('Right side', [3.3 + mm(582), 0, 0], [mm(18), mm(720), mm(300)])];   // two sides, so the piece does not tip (part-less problems are always new)
    const nums = new Set(parts.flatMap((q) => [q.at.x, q.at.y, q.at.z, q.size.x, q.size.y, q.size.z]));
    const mf = flatDocument(designToDocument({ name: 'Metric', assemblies: [], parts }, { exact: nums }).doc);
    const ms = findSites(mf);
    const dado = ms.find((s) => mf.boards[s.enter].name === 'Shelf' && mf.boards[s.receive].name === 'Side')!;
    const max = rangesOf(dado, mf).dadoDepth[1];
    const mj: SloydDocument = migrateDocument(applyJoints(mf, ms, ms.map((s) => (s.id === dado.id ? { site: s.id, joint: 'dado' as const, depth: max } : { site: s.id, joint: 'butt' as const }))).doc);
    // The fixture: the recorded depth reads back just past the range maximum.
    const base = plainForRefine(mj);
    if ('refused' in base) throw new Error(base.refused.message);
    const rec = base.joints!.find((j) => j.enter === 'Shelf')!;
    expect(rec.choice.depth! > max).toBe(true);
    expect(rec.choice.depth! - max).toBeLessThan(1e-9);
    const { client } = fakeClient([plainEcho(mj), { joints: [] }]);
    const out = await go(client, mj);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(out.joints).toMatchObject({ kept: 1, chosen: 0, dropped: 0 });
    expect(sameJoined(flatDocument(out.doc), flatDocument(mj))).toBe(true);
  });

  describe('a problem the ORIGINAL joined design already had (spec §4 Issues)', () => {
    // Two rails tenoned 1.25in into one leg: the tenons collide (Rail Z passes into Rail X). The base
    // plate keeps the piece from tipping, so the only part-less check (tips) stays quiet. Leg→Base is
    // left butt. The plain design's rails hang (already present in the refine stage).
    const cf = flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
      bp('Base', [-2, 0, -2], [24, 0.75, 24]), bp('Leg', [0, 0.75, 0], [1.75, 28, 1.75]),
      bp('Rail X', [1.75, 24.25, 0.5], [18, 3, 0.75]), bp('Rail Z', [0.5, 24.25, 1.75], [0.75, 3, 18]),
    ] }).doc);
    const cs = findSites(cf);
    const collided: SloydDocument = migrateDocument(applyJoints(cf, cs, cs.map((s) => (cf.boards[s.receive].name === 'Leg'
      ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 1.25 } : { site: s.id, joint: 'butt' as const }))).doc);
    const isOverlap = (v: { kind: string; parts: string[] }) => v.kind === 'overlap' && [...v.parts].sort().join() === 'Rail X,Rail Z';

    it('the fixture: the joined original has exactly that overlap, the plain one does not', () => {
      const lim = (f: { boards: unknown[] }) => ({ width: null, depth: null, height: null, maxParts: f.boards.length });
      const jf = flatDocument(collided);
      expect(checkDesign(jf, lim(jf)).filter((v) => v.parts.length > 0).map((v) => v.kind)).toEqual(['overlap']);
      expect(checkDesign(cf, lim(cf)).some(isOverlap)).toBe(false);
    });

    it('refined unchanged: not new, listed as present, ONE call', async () => {
      const { client } = fakeClient([plainEcho(collided), { joints: [] }]);
      const out = await go(client, collided);
      if ('refused' in out) throw new Error(out.refused.message);
      expect(client.complete).toHaveBeenCalledTimes(1);
      expect(out.violations).toEqual([]);
      expect(out.present.filter(isOverlap)).toHaveLength(1);
      expect(out.present.filter((v) => v.kind === 'hangs').map((v) => v.parts)).toEqual([['Rail X'], ['Rail Z']]);   // the refine stage's
    });

    it('with an open site, it drives no joinery repair: exactly TWO calls', async () => {
      const echo = plainEcho(collided);
      const base = echo.parts.find((p) => p.name === 'Base')!;   // design coordinates, not the fixture's
      const block = { ...bp('Post', [base.at.x + 17, base.at.y + base.size.y, base.at.z + 17], [1.75, 10, 1.75]), material: 'oak' };
      const { client } = fakeClient([{ ...echo, parts: [...echo.parts, block] }, { joints: [] }]);
      const out = await go(client, collided);
      if ('refused' in out) throw new Error(out.refused.message);
      expect(client.complete).toHaveBeenCalledTimes(2);
      expect(out.violations).toEqual([]);
      expect(out.present.filter(isOverlap)).toHaveLength(1);
      expect(out.joints).toEqual({ kept: 2, chosen: 1, dropped: 0, skipped: [], notes: [] });
    });
  });

  it('the join stage\'s NEW problems are still reported, beside the refine stage\'s', async () => {
    // Reuses the collided corner: a NEW rail entering the leg from -X, answered with a 1.25in tenon,
    // collides with Rail X's and Rail Z's tenons (measured: both). Those overlaps are new to both
    // originals, so they must come back in `violations`; the original Rail X / Rail Z one stays present.
    const cf = flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
      bp('Base', [-2, 0, -2], [24, 0.75, 24]), bp('Leg', [0, 0.75, 0], [1.75, 28, 1.75]),
      bp('Rail X', [1.75, 24.25, 0.5], [18, 3, 0.75]), bp('Rail Z', [0.5, 24.25, 1.75], [0.75, 3, 18]),
    ] }).doc);
    const cs = findSites(cf);
    const collided: SloydDocument = migrateDocument(applyJoints(cf, cs, cs.map((s) => (cf.boards[s.receive].name === 'Leg'
      ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 1.25 } : { site: s.id, joint: 'butt' as const }))).doc);
    const echo = plainEcho(collided);
    const railX = echo.parts.find((p) => p.name === 'Rail X')!, leg = echo.parts.find((p) => p.name === 'Leg')!;   // design coordinates
    const railN = { ...railX, name: 'Rail N', at: { ...railX.at, x: leg.at.x - railX.size.x } };
    const long = { joints: Array.from({ length: 40 }, (_, i) => ({ site: i, joint: 'mortise-tenon', tenonLength: 1.25 })) };
    const { client } = fakeClient([{ ...echo, parts: [...echo.parts, railN] }, long]);
    const out = await go(client, collided);
    if ('refused' in out) throw new Error(out.refused.message);
    const pair = (v: { parts: string[] }) => [...v.parts].sort().join();
    expect(out.violations.filter((v) => v.kind === 'overlap').map(pair)).toEqual(['Rail N,Rail X', 'Rail N,Rail Z']);
    expect(out.violations.some((v) => v.kind === 'hangs' && v.parts.includes('Rail N'))).toBe(true);   // the refine stage's
    expect(out.present.filter((v) => v.kind === 'overlap').map(pair)).toEqual(['Rail X,Rail Z']);
  });
});

const angledDoc = (): SloydDocument => {
  const made = designToDocument({ name: 'T', parts: [
    { name: 'Leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
    { name: 'Rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 } },
  ] } as never, { centre: false }).doc;
  return { ...made, boards: made.boards.map((b) => (b.name === 'Rail' && !('shape' in b)
    ? { ...b, angleCuts: [{ id: 'm', ...miterCut({ end: endFacing(b, 0, -1), across: 'thickness', longSide: endFacing(b, 2, -1), ratio: 1 }, b) }] } : b)) };
};

describe('runJoinery — a miter running into a joint (AI-angles spec §3)', () => {
  it('refuses before any call, names the part, and leaves the document alone', async () => {
    const { client } = fakeClient([GOOD]);
    const doc = angledDoc();
    expect(doc.boards.some((b) => 'angleCuts' in b && b.angleCuts.length > 0)).toBe(true);
    const before = JSON.stringify(doc);
    const out = await runJoinery(client, doc, new AbortController().signal, () => {});
    expect('refused' in out && out.refused).toContain("Rail's miter runs into its joint with Leg");
    expect(client.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('the angle-joint fault for tapers (AI-tapers spec 5.3)', () => {
  const leg = (start: number) => ({ name: 'Leg', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 },
    miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [{ faces: ['+x', '+z'], toward: '-y', start, amount: 0.375 }] });
  const rail = { name: 'Rail', role: '', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 }, miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [] };
  const post = { name: 'Post', role: '', material: 'oak', at: { x: 19.75, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [] };
  const design = (start: number) => ({ name: 'T', parts: [leg(start), rail, post], assemblies: [] });
  const text = (turns: unknown[]) => JSON.stringify(turns);

  it('runGeneration reports the fault, sends it back, and keeps the repaired design', async () => {
    // No call count: this two-legged fixture may also trip the tip check, which drives its own repair rounds.
    const { client, seen } = fakeClient([design(24), design(22)]);
    const out = await run(client);
    expect(text(seen[1]!)).toContain("Leg's taper toward -y");
    expect(out.violations.filter((v) => v.kind === 'angle-joint')).toEqual([]);
  });
  it('Refine counts the original\'s own taper conflict as preexisting: present, not fed back', async () => {
    const RS = { instruction: 'keep it', width: null, depth: null, height: null, detail: 'simple' as const };
    const doc = designToDocument(parseDesign(toWireDesign(design(24) as GeneratedDesign))!).doc;
    const from = documentToDesign(doc, REFINE_MAX);
    if ('refused' in from) throw new Error('refused');
    const { client, seen } = fakeClient([from.design]);
    const out = await runRefine(client, doc, RS, new AbortController().signal, () => {});
    if ('refused' in out) throw new Error('refused');
    expect(out.present.some((v) => v.kind === 'angle-joint')).toBe(true);
    expect(out.violations.some((v) => v.kind === 'angle-joint')).toBe(false);
    expect(seen.slice(1).map(text).join('')).not.toContain("Leg's taper");
  });
});

describe('runRefine — joined designs with tapers (AI-tapers spec §5.4)', () => {
  const RS = { instruction: 'change it', width: null, depth: null, height: null, detail: 'moderate' as const };
  // CORNER of runJoinery.test.ts: the Leg tapered on its +x and +z faces toward the floor, joined with short mortise-tenons.
  const legTaper = (b: Board, axis: 0 | 2, start: number): AngleCut => ({
    id: `t${axis}`, ...taperCut({ face: axisFrame(b)[axis]!.dim as 'width' | 'thickness', from: endFacing(b, axis, 1), end: endFacing(b, 1, -1), start, amount: 0.375 }),
  });
  const part = (name: string, at: [number, number, number], size: [number, number, number], tapers: WorldTaper[] = []) =>
    ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers, material: 'oak', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
  const cornerDesign = (legTapers: WorldTaper[]) => ({ name: 'Corner', assemblies: [], parts: [
    part('Leg', [0, 0, 0], [1.75, 28, 1.75], legTapers), part('Rail X', [1.75, 23.5, 0.5], [18, 3, 0.75]), part('Rail Z', [0.5, 23.5, 1.75], [0.75, 3, 18]),
  ] });
  const plainFlat = flatDocument(designToDocument(cornerDesign([])).doc);
  const cornerFlat = { ...plainFlat, boards: plainFlat.boards.map((b) => (b.name === 'Leg' ? { ...b, angleCuts: [legTaper(b, 0, 22), legTaper(b, 2, 22)] } : b)) };
  const sites = findSites(cornerFlat);
  const joined: SloydDocument = migrateDocument(applyJoints(cornerFlat, sites,
    sites.map((s) => ({ site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.5 }))).doc);
  /** The plain design with the Leg's taper moved up into the rails (start 24): joinery refuses it. */
  const conflicting = cornerDesign([{ faces: ['+x', '+z'], toward: '-y', start: 24, amount: 0.375 }]);

  it('the fixture: the Leg faces +x and +z; the conflicting design parses', () => {
    const leg = flatDocument(joined).boards.find((b) => b.name === 'Leg')!;
    expect([endFacing(leg, 0, 1), endFacing(leg, 2, 1)]).toEqual(leg.angleCuts.map((c) => c.from));
    expect(leg.cuts.length).toBeGreaterThan(0);
    expect(parseDesign(toWireDesign(conflicting as GeneratedDesign))).not.toBeNull();
    // The conflicting design stores the same taper as the fixture's, moved to start 24.
    const noId = ({ id: _id, ...c }: AngleCut) => c;
    const moved = flatDocument(designToDocument(parseDesign(toWireDesign(conflicting as GeneratedDesign))!).doc).boards.find((b) => b.name === 'Leg')!;
    expect(moved.angleCuts.map(noId)).toEqual([legTaper(moved, 0, 24), legTaper(moved, 2, 24)].map(noId));
  });

  it('a joined original whose taper already runs into a joint is refused with no call, the document untouched', async () => {
    const bad: SloydDocument = { ...joined, boards: (joined.boards as Board[]).map((b) => (b.name === 'Leg' ? { ...b, angleCuts: [legTaper(b, 0, 24), legTaper(b, 2, 24)] } : b)) };
    const before = JSON.stringify(bad);
    const { client } = fakeClient([conflicting]);
    const out = await runRefine(client, bad, RS, new AbortController().signal, () => {});
    expect('refused' in out && out.refused.reason).toBe('angle-joint');
    expect(client.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(bad)).toBe(before);
  });

  it('a joined Refine whose model never fixes a taper conflict returns the design unjoined, with a note, never a throw', async () => {
    // Four refine answers, all with the Leg's taper at start 24 (into the rails). Joinery refuses before any call.
    const { client } = fakeClient([conflicting, conflicting, conflicting, conflicting]);
    const out = await runRefine(client, joined, RS, new AbortController().signal, () => {});
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(4);                 // no joinery call
    expect(out.joints?.notJoined).toBeTruthy();
    expect(out.violations.some((v) => v.kind === 'angle-joint')).toBe(true);
    expect(flatDocument(out.doc).boards.every((b) => b.cuts.length === 0)).toBe(true);
  });
});

describe('runRefine — a standard-form taper the converter would reject (fu 309)', () => {
  const RS = { instruction: 'keep it', width: null, depth: null, height: null, detail: 'simple' as const };
  const leg = (cuts: Parameters<typeof taperCut>[0][], over: Partial<Board> = {}): Board => ({
    ...createBoard({ id: 'leg', name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', ...over }),
    angleCuts: cuts.map((c, i) => ({ id: `t${i}`, ...taperCut(c) })),
  });
  const cases: [string, Board][] = [
    ['a knife edge (amount = the face dimension)', leg([{ face: 'width', from: 'min', end: 'min', start: 12, amount: 1.75 }])],
    ['opposite faces that meet (1 + 1 on 1.75)', leg([{ face: 'width', from: 'min', end: 'min', start: 12, amount: 1 }, { face: 'width', from: 'max', end: 'min', start: 12, amount: 1 }])],
    ['a part wider than long, tapered along its stored length', leg([{ face: 'thickness', from: 'min', end: 'min', start: 3, amount: 0.25 }], { length: 4, width: 6, thickness: 0.75, posture: 'flat' })],
    ['a start past the length (the part shortened after tapering)', leg([{ face: 'width', from: 'min', end: 'min', start: 24, amount: 0.5 }], { length: 20 })],
  ];
  for (const [what, b] of cases) {
    it(`${what}: refused before any call, the document untouched`, async () => {
      const doc: SloydDocument = { ...createDocument('T'), boards: [b] };
      const before = JSON.stringify(doc);
      const { client } = fakeClient([GOOD]);
      const out = await runRefine(client, doc, RS, new AbortController().signal, () => {});
      expect('refused' in out && out.refused.reason).toBe('taper-form');
      expect(client.complete).not.toHaveBeenCalled();
      expect(JSON.stringify(doc)).toBe(before);
    });
  }
});

describe('hole rows from the model (AI-holes spec §3.1)', () => {
  const RS = { instruction: 'add holes', width: null, depth: null, height: null, detail: 'simple' as const };
  /** A 30 x 3/4 x 12 side on the floor: thickness on y, length on x. */
  const SIDE = { ...bp('Side', [0, 0, 0], [30, 0.75, 12]) };
  const row = (face: '+y' | '-y', x: number) => ({ face, diameter: 0.25, depth: 0.25, through: false, offset: v3(x, face === '+y' ? 0.75 : 0, 2), toward: '+x' as const, count: 3, pitch: 1.25 });

  it('Generate: a breaking-out row is STORED and raises one hole-fault, fed back', async () => {
    const bad = { name: 'S', parts: [{ ...SIDE, holes: [row('+y', 27.5)] }], assemblies: [] };
    const { client, seen } = fakeClient([bad]);
    const out = await run(client);
    expect(flatDocument(out.doc).boards[0]!.holes).toHaveLength(1);
    expect(out.violations.filter((v) => v.kind === 'hole-fault')).toEqual([{ kind: 'hole-fault', parts: ['Side'],
      message: "Side's hole row on +y starting at 27.5, 0.75, 2in breaks out of its face.", shown: "Side's hole row on the thickness face (max side) breaks out of its face." }]);
    expect(JSON.stringify(seen[1])).toContain("Side's hole row on +y starting at 27.5, 0.75, 2in breaks out of its face.");
  });

  it('Refine: a NEW faulted row on the SAME face as an original faulted row is fed back (face + first centre, spec §3.1)', async () => {
    // Two shelf-pin rows on one inside face: the original's front row runs off the end; the model adds a back row that does too.
    const front = { ...row('+y', 27.5), offset: v3(27.5, 0.75, 2) };
    const back = { ...row('+y', 28), offset: v3(28, 0.75, 10) };
    const original = designToDocument({ name: 'S', parts: [{ ...SIDE, holes: [front] }], assemblies: [] }).doc;
    const r = documentToDesign(original, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const withNew = { ...r.design, parts: r.design.parts.map((x) => ({ ...x, holes: [...(x.holes ?? []), back] })) };
    const { client, seen } = fakeClient([withNew, r.design]);
    const out = await runRefine(client, original, RS, new AbortController().signal, () => {});
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(2);
    const second = JSON.stringify(seen[1]!.slice(-1));
    expect(second).toContain("Side's hole row on +y starting at 28, 0.75, 10in breaks out of its face.");
    expect(second).not.toContain("Side's hole row on +y starting at 27.5, 0.75, 2in breaks out of its face.");
    expect(out.present.map((v) => v.message)).toEqual(["Side's hole row on +y starting at 27.5, 0.75, 2in breaks out of its face."]);
  });

  it('Refine: an original faulted row does not hide a NEW faulted row on the same part (problemKey)', async () => {
    const original = designToDocument({ name: 'S', parts: [{ ...SIDE, holes: [row('+y', 27.5)] }], assemblies: [] }).doc;
    expect(flatDocument(original).boards[0]!.holes).toHaveLength(1);
    const r = documentToDesign(original, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const withNew = { ...r.design, parts: r.design.parts.map((x) => ({ ...x, holes: [...(x.holes ?? []), row('-y', 28)] })) };
    const { client, seen } = fakeClient([withNew, r.design]);
    const out = await runRefine(client, original, RS, new AbortController().signal, () => {});
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(2);
    const second = JSON.stringify(seen[1]!.slice(-1));
    expect(second).toContain("Side's hole row on -y starting at 28, 0, 2in breaks out of its face.");
    expect(second).not.toContain("Side's hole row on +y starting at 27.5, 0.75, 2in breaks out of its face.");
    // The echo is the best: no new fault, the original's listed as present.
    expect(out.violations).toEqual([]);
    expect(out.present.map((v) => v.message)).toEqual(["Side's hole row on +y starting at 27.5, 0.75, 2in breaks out of its face."]);
  });
});

describe('edge bands from the model (AI-bands spec §3–4)', () => {
  const RS = { instruction: 'add edging', width: null, depth: null, height: null, detail: 'simple' as const };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  const echo = (doc: SloydDocument) => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message); return r.design; };
  /** A 20 x 1 x 10 slab on the floor: veneer (7/8in wide) on its +x end is tape-narrow (a band-fault, the band kept). */
  const SLAB = { ...bp('Slab', [0, 0, 0], [20, 1, 10]), bands: [{ edge: '+x' as const, edging: 'veneer' }] };

  it('Generate: a faulted band is STORED and raises one band-fault, fed back', async () => {
    const { client, seen } = fakeClient([{ name: 'S', parts: [SLAB], assemblies: [] }]);
    const out = await run(client);
    expect(flatDocument(out.doc).boards[0]!.bands).toHaveLength(1);
    expect(out.violations.filter((v) => v.kind === 'band-fault')).toEqual([{ kind: 'band-fault', parts: ['Slab'],
      message: "Slab's edging on +x is narrower than the part is thick.", shown: "Slab's edging on the length max end is narrower than the part is thick." }]);
    expect(JSON.stringify(seen[1])).toContain("Slab's edging on +x is narrower than the part is thick.");
  });

  it('Generate: two faulted edges of one assembly part placed twice are TWO problems, each merged over its placements', async () => {
    const two = { ...SLAB, bands: [{ edge: '+x' as const, edging: 'veneer' }, { edge: '-x' as const, edging: 'veneer' }] };
    const d = { name: 'S', parts: [], assemblies: [{ name: 'Unit', parts: [two], placements: [{ name: 'U1', at: v3(0, 0, 0) }, { name: 'U2', at: v3(0, 0, 20) }] }] };
    const { client } = fakeClient([d]);
    const out = await run(client);
    expect(out.violations.filter((v) => v.kind === 'band-fault').map((v) => v.message)).toEqual([
      "U1 › Slab's edging on -x is narrower than the part is thick. (in U1, U2)",
      "U1 › Slab's edging on +x is narrower than the part is thick. (in U1, U2)",
    ]);
  });

  it('Generate: a broad-face band rejects the part (reason band) and the feedback names it', async () => {
    const bad = { name: 'S', parts: [bp('Base', [0, 0, 0], [20, 1, 10]), { ...bp('Top', [0, 1, 0], [20, 1, 10]), bands: [{ edge: '+y', edging: 'veneer' }] }], assemblies: [] };
    const { client, seen } = fakeClient([bad]);
    const out = await run(client);
    expect(flatDocument(out.doc).boards.map((b) => b.name)).toEqual(['Base']);
    expect(JSON.stringify(seen[1])).toContain('Top has edging on a broad face (+y).');
  });

  it('Refine: the original\'s faulted band is present, never fed back; a NEW faulted band on the same part is', async () => {
    const original = designToDocument({ name: 'S', parts: [SLAB], assemblies: [] }).doc;
    expect(flatDocument(original).boards[0]!.bands).toHaveLength(1);
    const e = echo(original);
    const withNew = { ...e, parts: e.parts.map((x) => ({ ...x, bands: [...(x.bands ?? []), { edge: '-x', edging: 'veneer' }] })) };
    const { client, seen } = fakeClient([withNew, e]);
    const out = await go(client, original);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(2);
    const second = JSON.stringify(seen[1]!.slice(-1));
    expect(second).toContain("Slab's edging on -x is narrower than the part is thick.");
    expect(second).not.toContain("Slab's edging on +x");
    expect(out.violations).toEqual([]);
    expect(out.present.map((v) => v.message)).toEqual(["Slab's edging on +x is narrower than the part is thick."]);
  });

  it('Refine (plain): a minted type is in the saved document, the band naming it kept', async () => {
    const original = designToDocument({ name: 'S', parts: [bp('Shelf', [0, 0, 0], [30, 0.75, 12])], assemblies: [] }).doc;
    const e = echo(original);
    const { client } = fakeClient([{ ...e, parts: e.parts.map((x) => ({ ...x, bands: [{ edge: '+z', edging: 'solid cherry' }] })) }]);
    const out = await go(client, original);
    if ('refused' in out) throw new Error(out.refused.message);
    const cherry = out.doc.bandTypes.find((t) => t.kind === 'solid' && t.material === 'cherry');
    expect(cherry).toMatchObject({ name: 'Cherry edging', thickness: 0.25 });
    expect(flatDocument(out.doc).boards[0]!.bands.map((b) => b.type)).toEqual([cherry!.id]);
  });

  it('Review Focus 5: the JOINED Refine path keeps a minted type in the saved document', async () => {
    const flat = flatDocument(designToDocument({ name: 'Corner', assemblies: [], parts: [
      bp('Leg', [0, 0, 0], [1.75, 28, 1.75]), bp('Rail', [1.75, 23.5, 0.5], [18, 3, 0.75]),
    ] }).doc);
    const sites = findSites(flat);
    const joined = migrateDocument(applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites))).doc);
    const p = plainForRefine(joined); if ('refused' in p) throw new Error(p.refused.message);
    const e = echo(p.plain);
    // The Leg's -x face looks away from the Rail: the band is in no joint's way.
    const banded = { ...e, parts: e.parts.map((x) => (x.name === 'Leg' ? { ...x, bands: [{ edge: '-x', edging: 'solid cherry' }] } : x)) };
    const { client } = fakeClient([banded]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(out.joints!.notJoined).toBeUndefined();
    const cherry = out.doc.bandTypes.find((t) => t.kind === 'solid' && t.material === 'cherry');
    expect(cherry).toMatchObject({ name: 'Cherry edging', thickness: 0.25 });
    expect(flatDocument(out.doc).boards.find((b) => b.name === 'Leg')!.bands.map((b) => b.type)).toEqual([cherry!.id]);
  });
});

describe('edge profiles from the model (AI-profiles spec §3.2, §4, R6.1, R6.3)', () => {
  const RS = { instruction: 'add profiles', width: null, depth: null, height: null, detail: 'simple' as const };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  const echo = (doc: SloydDocument) => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message); return r.design; };
  /** A 30 x 3/4 x 12 top on the floor: broad faces ±y, its front edge +y/+z runs along x. */
  const prof = (size: number, edge: ['+y' | '-y', '+z' | '-z' | '+x' | '-x'] = ['+y', '+z']) =>
    ({ edge, kind: 'roundover' as const, size, fillet: 0, depth: 0, facing: 'face' as const, allRound: false, start: 0, end: 30 });
  /** A 1in roundover on a 3/4in top: too big for the edge (the straight run's prism fault, R6.1): stored, fed back. */
  const TOP = { ...bp('Top', [0, 0, 0], [30, 0.75, 12]), profiles: [prof(1)] };
  const oversized = "Top's roundover on +y/+z is bigger than the edge.";

  it('Generate: a faulted profile is STORED and raises a profile-fault, fed back', async () => {
    const { client, seen } = fakeClient([{ name: 'S', parts: [TOP], assemblies: [] }]);
    const out = await run(client);
    expect(flatDocument(out.doc).boards[0]!.profiles).toHaveLength(1);
    expect(out.violations.filter((v) => v.kind === 'profile-fault').map((v) => v.message)).toContain(oversized);
    expect(JSON.stringify(seen[1])).toContain(oversized);
  });

  it('Generate: a profile on two broad faces rejects the part (reason profile) and the feedback names it', async () => {
    const bad = { name: 'S', parts: [bp('Base', [0, 0, 0], [20, 1, 10]), { ...bp('Top', [0, 1, 0], [20, 1, 10]), profiles: [{ ...prof(0.25), edge: ['+y', '-y'] }] }], assemblies: [] };
    const { client, seen } = fakeClient([bad]);
    const out = await run(client);
    expect(flatDocument(out.doc).boards.map((b) => b.name)).toEqual(['Base']);
    expect(JSON.stringify(seen[1])).toContain('Top has a profile on +y/-y, two broad faces that meet at no edge');
  });

  it('Refine: the original\'s faulted profile is present, never fed back; a NEW faulted profile on the same part is', async () => {
    const original = designToDocument({ name: 'S', parts: [TOP], assemblies: [] }).doc;
    expect(flatDocument(original).boards[0]!.profiles).toHaveLength(1);
    const e = echo(original);
    const added = "Top's roundover on +y/-z is bigger than the edge.";
    const withNew = { ...e, parts: e.parts.map((x) => ({ ...x, profiles: [...(x.profiles ?? []), prof(1, ['+y', '-z'])] })) };
    const { client, seen } = fakeClient([withNew, e]);
    const out = await go(client, original);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(2);
    const second = JSON.stringify(seen[1]!.slice(-1));
    expect(second).toContain(added);
    expect(second).not.toContain(oversized);
    expect(out.violations).toEqual([]);
    expect(out.present.map((v) => v.message)).toContain(oversized);
  });

  it('Review Focus 4: an arched apron\'s returned profiles are ignored silently — nothing rejected, nothing fed back, its own kept', async () => {
    const original = migrateDocument(JSON.parse(JSON.stringify({ ...createDocument('A'), boards: [{ ...apronArch, name: 'Apron' }] })));
    const o = flatDocument(original).boards[0]!;
    expect([o.curves.length, o.profiles.length]).toEqual([1, 1]);
    const e = echo(original);
    expect(e.parts[0]!.profiles).toEqual([]);
    // Malformed (two broad faces) and oversized: either would be a fault fed back were the apron's profiles authored.
    const junk = { ...e, parts: e.parts.map((x) => ({ ...x, profiles: [{ ...prof(0.25), edge: ['+y', '-y'] }, prof(2)] })) };
    const { client } = fakeClient([junk]);
    const out = await go(client, original);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(out.violations).toEqual([]);
    expect(flatDocument(out.doc).boards[0]!.profiles).toEqual(o.profiles);
  });
});

describe('runRefine keeps leaning parts (splayed legs spec §8)', () => {
  const RS = { instruction: 'make the seat rounder', width: null, depth: null, height: null, detail: 'simple' as const };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  const bx = (name: string, at: [number, number, number], size: [number, number, number], role = '') => ({ name, role, miters: [], bevels: [], chamfers: [],
    holes: [], bands: [], profiles: [], tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
  const seat = (name: string, y = 16) => bx(name, [-7, y, -7], [14, 1.5, 14]);
  const LEGS = ['Front right', 'Front left', 'Back left', 'Back right'];
  const NO_LIMITS = { width: null, depth: null, height: null, maxParts: 99 };
  const ok = async (client: LlmClient, doc: SloydDocument) => {
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    return out;
  };
  /** The eight corners of a part's pre-lean box, mapped through its lean: its world pose. */
  const pose = (b: Board) => {
    const m = leanMap(b)!;
    const e = [0, 1, 2].map((k) => axisDimensions(b).map((d) => b[d])[k]!);
    return Array.from({ length: 8 }, (_, i) => m.apply([0, 1, 2].map((k) => b.position[k]! + (i & (1 << k) ? e[k]! : 0)) as [number, number, number]));
  };

  it('Refine keeps a leaning leg: the model moves and resizes it and renames the seat; the leg comes back as stored', async () => {
    const doc = stoolDocument();
    const { client } = fakeClient([{ name: 'Stool', parts: [bx('Front right', [0, 0, 0], [2, 20, 2]), seat('Stool seat')], assemblies: [] }]);
    const out = await ok(client, doc);
    for (const n of LEGS) {
      // The stored record (id, Shape reference, position, turn) byte for byte, and its Shape with its id.
      expect(out.doc.boards.filter((b) => b.name === n)).toEqual(doc.boards.filter((b) => b.name === n));
      const w0 = worldParts(doc).find((b) => b.name === n)!;
      const w1 = worldParts(out.doc).find((b) => b.name === n)!;
      expect(w1.lean).toEqual(w0.lean);
      expect(w1.angleCuts).toEqual(w0.angleCuts);
      expect(w1.cuts).toEqual(w0.cuts);
      const [p0, p1] = [pose(w0), pose(w1)];
      p0.forEach((c, i) => c.forEach((v, k) => expect(Math.abs(p1[i]![k]! - v)).toBeLessThanOrEqual(1e-12)));
    }
    for (const s of doc.shapes) expect(out.doc.shapes.find((t) => t.id === s.id)).toEqual(s);
    // The seat is still on the leg tops: the levelled legs ground it.
    const v = checkDesign(flatDocument(out.doc), NO_LIMITS);
    expect(v.filter((x) => /^(unsupported|hangs|tips)/.test(x.kind))).toEqual([]);
    expect(flatDocument(out.doc).boards.map((b) => b.name).sort()).toEqual([...LEGS, 'Stool seat'].sort());
    expect(out.leaning).toEqual({ kept: LEGS, replaced: ['Front right'] });
  });

  it('Refine floor rule with a kept leg: no part moves relative to the kept legs', async () => {
    // Today's floor rule over the model's parts alone would drop everything by the shelf's 6in, off the leg tops.
    const doc = stoolDocument();
    const { client } = fakeClient([{ name: 'Stool', parts: [seat('Seat'), bx('Shelf', [-3, 6, -3], [6, 0.75, 6])], assemblies: [] }]);
    const out = await ok(client, doc);
    const at = (n: string) => flatDocument(out.doc).boards.find((b) => b.name === n)!.position;
    // The kept legs never move (constraint (a)), and nothing moves away from them (b).
    for (const n of LEGS) expect(out.doc.boards.find((b) => b.name === n)).toEqual(doc.boards.find((b) => b.name === n));
    expect(at('Seat')).toEqual([-7, 16, -7]);
    expect(at('Shelf')).toEqual([-3, 6, -3]);
  });

  it('a model part reusing the kept name is dropped, and the done view reports it', async () => {
    const doc = stoolDocument();
    const { client } = fakeClient([{ name: 'Stool', parts: [seat('Seat'), bx('Back left', [-6, 0, -6], [1.5, 16, 1.5]), bx('Back right', [4, 0, -6], [1.5, 16, 1.5])], assemblies: [] }]);
    const out = await ok(client, doc);
    expect(flatDocument(out.doc).boards.map((b) => b.name).sort()).toEqual([...LEGS, 'Seat'].sort());
    for (const n of LEGS) expect(out.doc.boards.find((b) => b.name === n)).toEqual(doc.boards.find((b) => b.name === n));
    expect(out.leaning).toEqual({ kept: LEGS, replaced: ['Back left', 'Back right'] });
  });

  it('kept parts skip linkByRole: their Shapes keep their ids while the model\'s own parts still link', async () => {
    const doc = stoolDocument();
    const { client } = fakeClient([{ name: 'Stool', parts: [seat('Seat'), bx('Cleat 1', [-5, 14.5, -1], [10, 1.5, 0.75], 'cleat'), bx('Cleat 2', [-5, 14.5, 1], [10, 1.5, 0.75], 'cleat')], assemblies: [] }]);
    const out = await ok(client, doc);
    expect(out.doc.shapes.filter((s) => doc.shapes.some((o) => o.id === s.id))).toEqual(doc.shapes);
    expect(out.doc.shapes).toHaveLength(doc.shapes.length + 1);
    for (const n of LEGS) expect(out.doc.boards.find((b) => b.name === n)).toEqual(doc.boards.find((b) => b.name === n));
  });

  it('keeps a kept part\'s mirror flag (spec §8 (a)): a mirrored user of its Shape comes back mirrored', async () => {
    const base = stoolDocument();
    const doc = migrateDocument({ ...base, boards: base.boards.map((b) => (b.name === 'Front left' ? { ...b, mirrored: true } : b)) });
    const before = doc.boards.find((b) => b.name === 'Front left')!;
    expect((before as { mirrored?: boolean }).mirrored).toBe(true);
    const { client } = fakeClient([{ name: 'Stool', parts: [seat('Seat')], assemblies: [] }]);
    const out = await ok(client, doc);
    expect(out.doc.boards.find((b) => b.name === 'Front left')).toEqual(before);
    expect(worldParts(out.doc).find((b) => b.name === 'Front left')!.lean).toEqual(worldParts(doc).find((b) => b.name === 'Front left')!.lean);
  });

  it('Refine keeps a bored seat verbatim, drops a model part named Seat, and reports it kept (angled holes spec §9)', async () => {
    const base = stoolDocument();
    const id = base.boards.find((b) => b.name === 'Seat')!.id;
    const plan = socketPlan(base, id, 0.75);
    if (typeof plan === 'string') throw new Error(plan);
    const doc = migrateDocument({ ...base, boards: base.boards.map((b) => (b.id === id ? { ...(b as Board), holes: plan.holes } : b)) });
    const before = doc.boards.find((b) => b.id === id)! as Board;
    const { client } = fakeClient([{ name: 'Stool', parts: [seat('Seat', 20), bx('Shelf', [-3, 6, -3], [6, 0.75, 6])], assemblies: [] }]);
    const out = await ok(client, doc);
    const after = out.doc.boards.find((b) => b.id === id)! as Board;
    expect(after).toEqual(before);
    after.holes.forEach((h, i) => expect(h).toEqual(before.holes[i]));
    expect(flatDocument(out.doc).boards.filter((b) => b.name === 'Seat')).toHaveLength(1);
    expect(out.leaning).toEqual({ kept: expect.arrayContaining(['Seat', ...LEGS]), replaced: ['Seat'] });
    // Nothing moved relative to the kept parts.
    expect(flatDocument(out.doc).boards.find((b) => b.name === 'Shelf')!.position).toEqual([-3, 6, -3]);
  });

  it('tilted-only keep: UNLEANED legs and a tilted seat row — verbatim, first, name dropped, no floor shift', async () => {
    const base = migrateDocument({ ...createDocument('T'), boards: [
      createBoard({ name: 'Leg', length: 16, width: 1.5, thickness: 1.5, posture: 'upright', position: [4, 0, 4] }), stoolSeat(16)] });
    const id = base.boards.find((b) => b.name === 'Seat')!.id;
    const row = { id: 'tilt1', face: 'thickness' as const, from: 'max' as const, diameter: 0.75, depth: 'through' as const, along: 'length' as const, alongFrom: 'min' as const,
      station: 3, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 3, tiltAlong: 0.2 };
    const doc = migrateDocument({ ...base, boards: base.boards.map((b) => (b.id === id ? { ...(b as Board), holes: [row] } : b)) });
    expect(worldParts(doc).some((b) => b.lean)).toBe(false);
    const before = doc.boards.find((b) => b.id === id)! as Board;
    // The model's parts alone would drop 6in to the floor; its own "Seat" must be dropped.
    const { client } = fakeClient([{ name: 'T', parts: [bx('Seat', [0, 30, 0], [2, 2, 2]), bx('Shelf', [-3, 6, -3], [6, 0.75, 6])], assemblies: [] }]);
    const out = await ok(client, doc);
    expect(out.doc.boards[0]).toEqual(before);
    expect(out.doc.boards.filter((b) => b.name === 'Seat')).toHaveLength(1);
    expect(out.leaning).toEqual({ kept: ['Seat'], replaced: ['Seat'] });
    expect(flatDocument(out.doc).boards.find((b) => b.name === 'Shelf')!.position).toEqual([-3, 6, -3]);
  });

  it('Refine keeps a tenoned rung verbatim, drops a model part named Rung, and reports it kept (round tenons spec §9)', async () => {
    const T = { id: 't1', end: 'max' as const, diameter: 0.75, length: 1 };
    const doc = migrateDocument({ ...createDocument('T'), boards: [
      { ...createBoard({ name: 'Rung', length: 18, width: 1.5, thickness: 1.25, posture: 'flat', position: [0, 0, 0] }), tenons: [T] }, stoolSeat(0)] });
    const before = doc.boards.find((b) => b.name === 'Rung')! as Board;
    expect(before.tenons).toEqual([T]);
    const { client } = fakeClient([{ name: 'T', parts: [bx('Rung', [0, 30, 0], [2, 2, 2]), bx('Seat', [-7, 0, -7], [14, 1.5, 14])], assemblies: [] }]);
    const out = await ok(client, doc);
    expect(out.doc.boards[0]).toEqual(before);
    expect((out.doc.boards[0] as Board).tenons).toEqual([T]);
    expect(out.doc.boards.filter((b) => b.name === 'Rung')).toHaveLength(1);
    expect(out.leaning).toEqual({ kept: ['Rung'], replaced: ['Rung'] });
  });

  it('Refine keeps a FAULTED tenon verbatim: too wide and meeting its twin, the stored record comes back as it was', async () => {
    const tenons = [{ id: 't1', end: 'min' as const, diameter: 2, length: 10 }, { id: 't2', end: 'max' as const, diameter: 2, length: 10 }];
    const doc = migrateDocument({ ...createDocument('T'), boards: [
      { ...createBoard({ name: 'Rung', length: 18, width: 1.5, thickness: 1.25, posture: 'flat', position: [0, 0, 0] }), tenons }, stoolSeat(0)] });
    const before = doc.boards.find((b) => b.name === 'Rung')! as Board;
    expect(before.tenons).toEqual(tenons);
    expect(before.tenons!.flatMap((t) => tenonFaults(before, t).map((f) => f.kind))).toEqual(expect.arrayContaining(['too-wide', 'too-long']));
    const { client } = fakeClient([{ name: 'T', parts: [bx('Rung', [0, 30, 0], [2, 2, 2]), bx('Seat', [-7, 0, -7], [14, 1.5, 14])], assemblies: [] }]);
    const out = await ok(client, doc);
    expect(out.doc.boards[0]).toEqual(before);
    expect((out.doc.boards[0] as Board).tenons).toEqual(tenons);
    expect(out.leaning).toEqual({ kept: ['Rung'], replaced: ['Rung'] });
  });

  it('Refine keeps a cleared square-set leg\'s compound end cuts verbatim (square-set legs spec §4; Review Focus 4)', async () => {
    const doc = clearedSquareStoolDocument();
    expect(worldParts(doc).some((b) => b.lean)).toBe(false);
    const across = (d: SloydDocument) => worldParts(d).filter((b) => LEGS.includes(b.name)).map((b) => b.angleCuts.map((c) => c.across));
    expect(across(doc).flat().every((a) => a !== undefined)).toBe(true);
    const { client } = fakeClient([{ name: 'Stool', parts: [seat('Seat'), bx('Front right', [4, 0, 4], [1.5, 16, 1.5]), bx('Shelf', [-3, 6, -3], [6, 0.75, 6])], assemblies: [] }]);
    const out = await ok(client, doc);
    for (const n of LEGS) expect(out.doc.boards.find((b) => b.name === n)).toEqual(doc.boards.find((b) => b.name === n));
    // The cuts live on the Shapes (a shared field): those come back too, `across` and all.
    expect(out.doc.shapes.filter((s) => doc.shapes.some((o) => o.id === s.id))).toEqual(doc.shapes);
    expect(across(out.doc)).toEqual(across(doc));
    expect(flatDocument(out.doc).boards.filter((b) => b.name === 'Front right')).toHaveLength(1);
    expect(out.leaning).toEqual({ kept: LEGS, replaced: ['Front right'] });
    // designDiff reads both sides' kept part, the same stored record: no angle line for any kept leg.
    expect(out.changes.filter((c) => LEGS.includes(c.name))).toEqual([]);
  });

  it('a lean-free Refine reports nothing kept', async () => {
    const doc = migrateDocument({ ...createDocument('T'), boards: [stoolSeat(0)] });
    const { client } = fakeClient([{ name: 'T', parts: [bx('Seat', [-7, 0, -7], [14, 1.5, 14])], assemblies: [] }]);
    const out = await ok(client, doc);
    expect(out.leaning).toBeUndefined();
  });
});

describe('runRefine keeps box-jointed parts (box-joints spec §7)', () => {
  const RS = { instruction: 'change it', width: null, depth: null, height: null, detail: 'moderate' as const };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  const plainEcho = (d: SloydDocument) => {
    const p = plainForRefine(d); if ('refused' in p) throw new Error(p.refused.message);
    const r = documentToDesign(p.plain, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message);
    return r.design;
  };
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
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
    ({ name, role: '', miters: [], bevels: [], chamfers: [], holes: [], bands: [], tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
  const caseFlat = flatDocument(designToDocument({ name: 'Case', assemblies: [], parts: [
    bp('Left side', [0, 0, 0], [0.75, 30, 11.25]), bp('Right side', [20.75, 0, 0], [0.75, 30, 11.25]),
    bp('Bottom', [0.75, 0, 0], [20, 0.75, 11.25]), bp('Top', [0.75, 29.25, 0], [20, 0.75, 11.25]), bp('Shelf', [0.75, 15, 0], [20, 0.75, 11.25]),
  ] }).doc);
  const caseSites = findSites(caseFlat);
  const joinedCase = migrateDocument(applyJoints(caseFlat, caseSites, caseSites.map((s) => defaultChoice(s, caseFlat, caseSites))).doc);

  it('a JOINED cabinet plus a box-jointed drawer, refined unchanged: one call, the joints re-applied, the drawer back byte for byte', async () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...drawerBoards(100)] });
    const { client } = fakeClient([plainEcho(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(1);
    for (const n of DRAWER) {
      expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
      expect(fingerSets(flatDocument(out.doc).boards.find((b) => b.name === n)!).length).toBeGreaterThan(0);
    }
    // The kept drawer goes back first (designToDocument), so the case is compared by name.
    const byName = (d: SloydDocument) => { const f = flatDocument(d); return { ...f, boards: [...f.boards].sort((a, b) => a.name.localeCompare(b.name)) }; };
    expect(sameJoined(byName(out.doc), byName(doc))).toBe(true);
    expect(out.joints!.kept).toBeGreaterThan(0);
    expect(out.leaning).toEqual({ kept: DRAWER, replaced: [], boxJoints: true });
  });

  it('the model adds a part meeting the kept drawer: those meetings stay butt, the drawer comes back byte for byte', async () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...drawerBoards(100)] });
    const echo = plainEcho(doc);
    // A stop across the drawer's back: both sides' back ends and the back's face meet it (new meetings with kept parts).
    const stop = bp('Drawer stop', [100, 0, 17], [13, 4, 0.75]);
    const { client } = fakeClient([{ ...echo, parts: [...echo.parts, stop] }]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    const sites = findSites(flatDocument(out.doc));
    const f = flatDocument(out.doc);
    const pair = (s: (typeof sites)[number]) => [f.boards[s.enter]!.name, f.boards[s.receive]!.name];
    expect(sites.filter((s) => pair(s).includes('Drawer stop') && pair(s).some((n) => DRAWER.includes(n))).length).toBeGreaterThan(0);
    for (const n of DRAWER) expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
    // Fixed butts: no joinery call, nothing skipped (without them the sides' sites go to the chooser, a paid call whose
    // tenons joinery then skips).
    expect(client.complete).toHaveBeenCalledTimes(1);
    expect(out.joints).toMatchObject({ chosen: 0, skipped: [] });
    expect(out.joints!.notJoined).toBeUndefined();
    expect(out.joints!.kept).toBeGreaterThan(0);
  });

  it('a re-join that would change a kept box-jointed part comes back UNJOINED, with the reason (the guard, forced)', async () => {
    const doc = migrateDocument({ ...joinedCase, boards: [...joinedCase.boards, ...drawerBoards(100)] });
    const { client } = fakeClient([plainEcho(doc)]);
    const guard = vi.mocked(fingerClaim.changedBoxJointed);
    guard.mockImplementationOnce(() => 'Drawer left');
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(guard).toHaveBeenCalledWith(doc, expect.anything(), DRAWER);
    expect(out.joints).toEqual({ kept: 0, chosen: 0, dropped: 0, skipped: [], notes: [],
      notJoined: 'Joinery would have changed a box-jointed part (Drawer left), so the design comes back unjoined.' });
    // Unjoined: the case's joints are not re-applied; the drawer keeps its fingers.
    for (const b of flatDocument(out.doc).boards.filter((x) => !DRAWER.includes(x.name))) expect(b.cuts, b.name).toEqual([]);
    for (const n of DRAWER) expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
  });

  it('a box-joint-only project: no joinery, the drawer back byte for byte, a model part reusing a kept name dropped', async () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() });
    const echo = plainEcho(doc);
    const { client } = fakeClient([{ ...echo, parts: [...echo.parts, bp('Drawer front', [0, 0, 0], [12, 4, 0.5]), bp('Shelf', [30, 0, 0], [20, 0.75, 10])] }]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.joints).toBeNull();
    for (const n of DRAWER) expect(out.doc.boards.filter((b) => b.name === n), n).toEqual(doc.boards.filter((b) => b.name === n));
    expect(out.leaning).toEqual({ kept: DRAWER, replaced: ['Drawer front'], boxJoints: true });
  });
});
