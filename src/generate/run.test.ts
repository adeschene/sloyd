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
import type { Board, SloydDocument } from '../document/document';
import { applyJoints } from './joints/recipes';
import { findSites, jointKey, rangesOf } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { GATE_REFUSAL, sameJoined } from './joints/unjoin';
import { DESIGN_SCHEMA, designToDocument, parseDesign } from '../document/generated';
import { checkDesign } from '../document/designCheck';
import type { LlmClient, LlmRequest, LlmResult, LlmUsage } from '../llm/types';
import { CHARS_PER_TOKEN } from './estimate';
import { taperCut } from '../document/angleCuts';
import { axisFrame, endFacing } from '../document/geometry';
import type { AngleCut } from '../document/types';
import type { WorldTaper } from '../document/taperWorld';

const settings: GenerateSettings = {
  description: 'a box', width: null, depth: null, height: null, material: 'any', style: 'any', detail: 'simple',
};
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const p = (name: string, y: number) => ({
  name, role: '', tapers: [], material: 'pine', at: { x: 0, y, z: 0 }, size: { x: 10, y: 1, z: 10 },
});
const GOOD = { name: 'Stack', parts: [p('A', 0), p('B', 1)], assemblies: [] };
const ONE_ISSUE = { name: 'One', parts: [p('A', 0), p('B', 5)], assemblies: [] };                 // B floats
const TWO_ISSUES = { name: 'Two', parts: [p('A', 0), p('B', 5), p('C', 9)], assemblies: [] };     // B, C float
/** Parses, but every part is rejected (size rounds to zero) — zero boards. */
const ALL_REJECTED = { name: 'Gone', parts: [{ ...p('Sliver', 0), size: { x: 10, y: 0.01, z: 10 } }], assemblies: [] };

type Step = unknown | 'truncated' | 'unparseable' | LlmError;

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
      return { json: step, assistantTurn: turn, usage };
    }),
  };
  return { client, seen, turns };
}
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
  ({ name, role: '', tapers: [], material: 'pine', at: v3(...at), size: v3(...size) });
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
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', tapers: [], material: 'pine', at: v3(...at), size: v3(...size) });
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
    expect(seen[0]).toEqual([client.userTurn(refineMessage(echo(doc), RS))]);
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

describe('runRefine — joined designs', () => {
  const RS = { instruction: 'change it', width: null, depth: null, height: null, detail: 'moderate' as const };
  const go = (client: LlmClient, doc: SloydDocument) => runRefine(client, doc, RS, new AbortController().signal, () => {});
  const plainEcho = (d: SloydDocument) => {
    const p = plainForRefine(d); if ('refused' in p) throw new Error(p.refused.message);
    const r = documentToDesign(p.plain, REFINE_MAX); if ('refused' in r) throw new Error(r.refused.message);
    return r.design;
  };
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
    ({ name, role: '', tapers: [], material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
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
    expect(out.joints).toEqual({ kept: 12, chosen: 2, dropped: 0, skipped: [] });
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
    expect(out.joints).toEqual({ kept: bookSites.length - 1, chosen: 0, dropped: 0, skipped: [] });
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
    expect(out.joints).toEqual({ kept: 10, chosen: 0, dropped: 2, skipped: [] });   // Shelf 2's dado into each side
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
    expect(out.joints).toEqual({ kept: 2, chosen: 8, dropped: 2, skipped: [] });
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
      parts: [{ name: 'Leg', role: '', tapers: [], material: 'oak', at: v3(0, 0, 0), size: v3(1.75, 28, 1.75) },
        { name: 'Leg 2', role: '', tapers: [], material: 'oak', at: v3(19.75, 0, 0), size: v3(1.75, 28, 1.75) },
        { name: 'Rail', role: '', tapers: [], material: 'oak', at: v3(1.75, 23.5, 0.5), size: v3(18, 3, 0.75) }],
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
      expect(out.joints).toEqual({ kept: 2, chosen: 1, dropped: 0, skipped: [] });
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

const TAPER = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.5], [20, 0]] as [[number, number], [number, number]] };
const angledDoc = (): SloydDocument => ({ ...createDocument('T'), boards: [
  createBoard({ id: 'leg', name: 'Leg', angleCuts: [{ ...TAPER, kind: 'miter' as const }] }), createBoard({ id: 'apron', name: 'Apron', position: [1.75, 20, 0] }),
] });

describe('runJoinery — angled documents (spec §6)', () => {
  it('refuses before any call and leaves the document alone', async () => {
    const { client } = fakeClient([GOOD]);
    const doc = angledDoc();
    const before = JSON.stringify(doc);
    const out = await runJoinery(client, doc, new AbortController().signal, () => {});
    expect('refused' in out).toBe(true);
    expect(client.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('the taper-joint fault (AI-tapers spec 5.3)', () => {
  const leg = (start: number) => ({ name: 'Leg', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 },
    tapers: [{ faces: ['+x', '+z'], toward: '-y', start, amount: 0.375 }] });
  const rail = { name: 'Rail', role: '', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 }, tapers: [] };
  const post = { name: 'Post', role: '', material: 'oak', at: { x: 19.75, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, tapers: [] };
  const design = (start: number) => ({ name: 'T', parts: [leg(start), rail, post], assemblies: [] });
  const text = (turns: unknown[]) => JSON.stringify(turns);

  it('runGeneration reports the fault, sends it back, and keeps the repaired design', async () => {
    // No call count: this two-legged fixture may also trip the tip check, which drives its own repair rounds.
    const { client, seen } = fakeClient([design(24), design(22)]);
    const out = await run(client);
    expect(text(seen[1]!)).toContain("Leg's taper toward -y");
    expect(out.violations.filter((v) => v.kind === 'taper-joint')).toEqual([]);
  });
  it('checkDesign itself never emits the fault (joinery gate unchanged)', () => {
    const flat = flatDocument(designToDocument(parseDesign(design(24))!).doc);
    expect(checkDesign(flat, { width: null, depth: null, height: null, maxParts: 10 }).some((v) => v.kind === ('taper-joint' as never))).toBe(false);
  });
  it('Refine counts the original\'s own taper conflict as preexisting: present, not fed back', async () => {
    const RS = { instruction: 'keep it', width: null, depth: null, height: null, detail: 'simple' as const };
    const doc = designToDocument(parseDesign(design(24))!).doc;
    const from = documentToDesign(doc, REFINE_MAX);
    if ('refused' in from) throw new Error('refused');
    const { client, seen } = fakeClient([from.design]);
    const out = await runRefine(client, doc, RS, new AbortController().signal, () => {});
    if ('refused' in out) throw new Error('refused');
    expect(out.present.some((v) => v.kind === 'taper-joint')).toBe(true);
    expect(out.violations.some((v) => v.kind === 'taper-joint')).toBe(false);
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
    ({ name, role: '', tapers, material: 'oak', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
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
    expect(parseDesign(conflicting)).not.toBeNull();
    // The conflicting design stores the same taper as the fixture's, moved to start 24.
    const noId = ({ id: _id, ...c }: AngleCut) => c;
    const moved = flatDocument(designToDocument(parseDesign(conflicting)!).doc).boards.find((b) => b.name === 'Leg')!;
    expect(moved.angleCuts.map(noId)).toEqual([legTaper(moved, 0, 24), legTaper(moved, 2, 24)].map(noId));
  });

  it('a joined original whose taper already runs into a joint is refused with no call, the document untouched', async () => {
    const bad: SloydDocument = { ...joined, boards: (joined.boards as Board[]).map((b) => (b.name === 'Leg' ? { ...b, angleCuts: [legTaper(b, 0, 24), legTaper(b, 2, 24)] } : b)) };
    const before = JSON.stringify(bad);
    const { client } = fakeClient([conflicting]);
    const out = await runRefine(client, bad, RS, new AbortController().signal, () => {});
    expect('refused' in out && out.refused.reason).toBe('taper-joint');
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
    expect(out.violations.some((v) => v.kind === 'taper-joint')).toBe(true);
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
