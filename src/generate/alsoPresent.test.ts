import { describe, expect, it, vi } from 'vitest';
import f5 from './joints/fixtures/5-rail-enters-once.json?raw';
import type { LlmClient } from '../llm/types';

// Follow-up 243: runJoinery's `alsoPresent` (Refine's original's problems) excuses only a problem that
// NAMES parts. A part-less one (`tips`) is always judged new (the user's limits ruling). Joinery can
// hardly cause a tip, so checkDesign is faked: nothing before the joining, a tip after.
const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../document/designCheck', async (orig) => {
  const real = await orig<typeof import('../document/designCheck')>();
  return { ...real, checkDesign: () => (calls.n++ === 0 ? [] : [{ kind: 'tips', message: 'It tips.', parts: [] }]) };
});

const { migrateDocument } = await import('../document/document');
const { problemKey, runJoinery } = await import('./run');

const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const client: LlmClient = {
  userTurn: (text) => ({ role: 'user', text }) as never,
  estimateCostUsd: () => 0,
  complete: async () => ({ json: { joints: [] }, assistantTurn: { role: 'assistant' } as never, usage }),
} as LlmClient;

describe('runJoinery alsoPresent (fu 243)', () => {
  it('a part-less problem the original had is still new', async () => {
    const tip = { kind: 'tips' as const, message: 'It tips.', parts: [] };
    const out = await runJoinery(client, migrateDocument(JSON.parse(f5).plain), new AbortController().signal, () => {},
      { alsoPresent: new Set([problemKey(tip)]) });
    if ('noSites' in out) throw new Error('fixture 5 has sites');
    expect(out.violations.map((v) => v.kind)).toContain('tips');
    expect(out.preexisting).toEqual([]);
  });
});
