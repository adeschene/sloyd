import { describe, expect, it, vi } from 'vitest';
import { MAX_REPAIRS, RunFailed, runGeneration } from './run';
import type { GenerateSettings } from './prompt';
import { LlmError } from '../llm/types';
import type { LlmClient, LlmRequest, LlmResult } from '../llm/types';

const settings: GenerateSettings = {
  description: 'a box', width: null, depth: null, height: null, material: 'any', style: 'any', detail: 'simple',
};
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const p = (name: string, y: number) => ({
  name, material: 'pine', at: { x: 0, y, z: 0 }, size: { x: 10, y: 1, z: 10 },
});
const GOOD = { name: 'Stack', parts: [p('A', 0), p('B', 1)] };
const ONE_ISSUE = { name: 'One', parts: [p('A', 0), p('B', 5)] };                 // B floats
const TWO_ISSUES = { name: 'Two', parts: [p('A', 0), p('B', 5), p('C', 9)] };     // B, C float
/** Parses, but every part is rejected (size rounds to zero) — zero boards. */
const ALL_REJECTED = { name: 'Gone', parts: [{ ...p('Sliver', 0), size: { x: 10, y: 0.01, z: 10 } }] };

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

  it('tells the model about DEDUPED names — the ones it can find in its next answer', async () => {
    const dup = { name: 'Dup', parts: [p('Shelf', 0), p('Shelf', 5)] };
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
