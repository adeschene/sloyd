import { worldParts } from '../document/tree';
import { describe, expect, it, vi } from 'vitest';
import { MAX_REPAIRS, RunFailed, problemKey, runGeneration, runRepairLoop } from './run';
import type { GenerateSettings } from './prompt';
import { LlmError } from '../llm/types';
import { flatDocument } from '../document/document';
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
