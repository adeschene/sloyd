import { worldParts } from '../document/tree';
import { describe, expect, it, vi } from 'vitest';
import { MAX_REPAIRS, RunFailed, problemKey, refineEstimateUsd, runGeneration, runJoinery, runRefine, runRepairLoop } from './run';
import { SYSTEM_PROMPT } from './prompt';
import type { GenerateSettings } from './prompt';
import { REFINE_MAX, plainForRefine, refineMessage } from './refine';
import { documentToDesign } from '../document/refineDesign';
import { LlmError } from '../llm/types';
import { createDocument, flatDocument, migrateDocument } from '../document/document';
import type { Board, SloydDocument } from '../document/document';
import { applyJoints } from './joints/recipes';
import { findSites } from './joints/sites';
import { defaultChoice } from './joints/choose';
import { GATE_REFUSAL, sameJoined } from './joints/unjoin';
import { designToDocument } from '../document/generated';
import { checkDesign } from '../document/designCheck';
import type { LlmClient, LlmRequest, LlmResult } from '../llm/types';

const settings: GenerateSettings = {
  description: 'a box', width: null, depth: null, height: null, material: 'any', style: 'any', detail: 'simple',
};
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const p = (name: string, y: number) => ({
  name, role: '', material: 'pine', at: { x: 0, y, z: 0 }, size: { x: 10, y: 1, z: 10 },
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
  ({ name, role: '', material: 'pine', at: v3(...at), size: v3(...size) });
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
    expect(overlaps[0].message).toContain('fix the assembly');
  });

  it('puts "fix the assembly" in the repair message the model receives (F7)', async () => {
    const { client, seen } = fakeClient([BAD_DRAWERS, GOOD]);
    await run(client);
    const last = seen[1][seen[1].length - 1] as { role: string; text: string };
    expect(last.role).toBe('user');
    expect(last.text).toContain('fix the assembly');
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
});

const createDocumentForTest = () => createDocument('Empty');

describe('runRefine', () => {
  const RS = { instruction: 'make the top thicker', width: null, depth: null, height: null, detail: 'simple' as const };
  const v3 = (x: number, y: number, z: number) => ({ x, y, z });
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', material: 'pine', at: v3(...at), size: v3(...size) });
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

  it('estimates cost, or null when refused', () => {
    const estimate = vi.fn(() => 0.05);
    const c = { ...fakeClient([GOOD]).client, estimateCostUsd: estimate };
    expect(refineEstimateUsd(c, createDocumentForTest(), RS)).toBeNull();
    const doc = orig([bp('A', [0, 0, 0], [10, 1, 10])]);
    expect(refineEstimateUsd(c, doc, RS)).toBe(0.05);
    expect((estimate.mock.calls[0] as unknown[])[0]).toMatchObject({ cacheReadTokens: 0, cacheWriteTokens: 0 });
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
    ({ name, role: '', material: 'pine', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } });
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

  it('a new meeting answered butt is not counted as chosen', async () => {
    const echo = plainEcho(joined);
    const s1 = echo.parts.find((p) => p.name === 'Shelf 1')!;
    const withShelf = { ...echo, parts: [...echo.parts, { ...s1, name: 'Shelf 3', at: { ...s1.at, y: 60 } }] };
    // butt for every site id the message could list; parseChoices ignores ids that are not open
    const allButt = { joints: Array.from({ length: 40 }, (_, i) => ({ site: i, joint: 'butt' })) };
    const { client } = fakeClient([withShelf, allButt]);
    const out = await go(client, joined);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(out.joints).toEqual({ kept: 12, chosen: 0, dropped: 0, skipped: [] });
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
  });

  it('keeps a shared assembly shared after refining (review focus 4)', async () => {
    const v3 = (x: number, y: number, z: number) => ({ x, y, z });
    const tree = designToDocument({ name: 'Frames', parts: [], assemblies: [{ name: 'Frame',
      parts: [{ name: 'Leg', role: '', material: 'oak', at: v3(0, 0, 0), size: v3(1.75, 28, 1.75) },
        { name: 'Rail', role: '', material: 'oak', at: v3(1.75, 23.5, 0.5), size: v3(18, 3, 0.75) }],
      placements: [{ name: 'Front', at: v3(0, 0, 0) }, { name: 'Back', at: v3(0, 0, 30) }] }] }).doc;
    const jo = await runJoinery(fakeClient([new LlmError('overloaded', 'Overloaded.')]).client, tree, new AbortController().signal, () => {});
    if ('noSites' in jo) throw new Error('sites');
    const joinedTree = jo.result.doc;
    expect(joinedTree.definitions).toHaveLength(1);
    const { client } = fakeClient([plainEcho(joinedTree)]);
    const out = await go(client, joinedTree);
    if ('refused' in out) throw new Error(out.refused.message);
    expect(out.doc.definitions).toHaveLength(1);
    expect(out.doc.instances.map((i) => i.definition)).toEqual([out.doc.definitions[0].id, out.doc.definitions[0].id]);
  });
});
