import { describe, expect, it, vi } from 'vitest';
import {
  BRIEF_MAX, CONCEPTS_SCHEMA, CONCEPTS_SYSTEM, FALLBACK_CONCEPTS, TITLE_MAX,
  conceptsMessage, parseConcepts, planConcepts,
} from './concepts';
import { userMessage } from './prompt';
import type { GenerateSettings } from './prompt';
import { LlmError } from '../llm/types';
import type { LlmClient, LlmRequest, LlmResult } from '../llm/types';

const settings: GenerateSettings = {
  description: 'a side table', width: null, depth: null, height: 26, material: 'oak', style: 'mid-century', detail: 'detailed',
};
const usage = { inputTokens: 7, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 };
const c = (title: string, brief = `${title} brief.`) => ({ title, brief });

function fake(result: LlmResult | LlmError) {
  const complete = vi.fn(async (_req: LlmRequest): Promise<LlmResult> => {
    if (result instanceof LlmError) throw result;
    return result;
  });
  const client: LlmClient = { complete, userTurn: (t) => ({ role: 'user', text: t }), estimateCostUsd: () => 0 };
  return { client, complete };
}

describe('concepts', () => {
  it('asks with the fixed system prompt, the concepts schema and the run message plus a count line', async () => {
    const { client, complete } = fake({ json: { concepts: [c('A'), c('B')] }, assistantTurn: {}, usage });
    await planConcepts(client, settings, 2, new AbortController().signal);
    const req = complete.mock.calls[0][0];
    expect(req.system).toBe(CONCEPTS_SYSTEM);
    expect(req.schema).toBe(CONCEPTS_SCHEMA);
    expect(req.messages).toEqual([{ role: 'user', text: conceptsMessage(settings, 2) }]);
    expect(conceptsMessage(settings, 2)).toBe(`${userMessage(settings)}\n\nPropose 2 contrasting concepts for this.`);
  });

  it('keeps the planning system prompt free of anything per-run', () => {
    expect(CONCEPTS_SYSTEM).not.toContain('side table');
    expect(CONCEPTS_SYSTEM).toMatch(/structure/i);
    expect(CONCEPTS_SYSTEM).toMatch(/no joinery/i);
  });

  it('takes the first N of a longer list', () => {
    expect(parseConcepts({ concepts: [c('A'), c('B'), c('C')] }, 2)).toEqual([c('A'), c('B')]);
  });

  it.each([
    ['too few', { concepts: [c('A')] }],
    ['not an array', { concepts: 'A, B' }],
    ['not an object', 'A, B'],
    ['null', null],
    ['missing brief', { concepts: [c('A'), { title: 'B' }] }],
    ['blank title', { concepts: [c('A'), c('   ')] }],
    ['non-string brief', { concepts: [c('A'), { title: 'B', brief: 3 }] }],
    ['entry not an object', { concepts: [c('A'), 'B'] }],
  ])('refuses the whole list: %s', (_name, json) => {
    expect(parseConcepts(json, 2)).toBeNull();
  });

  it('ignores a bad entry BEYOND the first N', () => {
    expect(parseConcepts({ concepts: [c('A'), c('B'), { title: '' }] }, 2)).toEqual([c('A'), c('B')]);
  });

  it('trims, then truncates title and brief', () => {
    const [x] = parseConcepts({ concepts: [{ title: `  ${'t'.repeat(60)}  `, brief: ` ${'b'.repeat(400)} ` }] }, 1)!;
    expect(x.title).toBe('t'.repeat(TITLE_MAX));
    expect(x.brief).toBe('b'.repeat(BRIEF_MAX));
  });

  it('leaves no trailing space when the cut lands after a space', () => {
    const [x] = parseConcepts({ concepts: [{ title: `  ${'t'.repeat(TITLE_MAX - 1)} ${'u'.repeat(20)}  `, brief: 'b' }] }, 1)!;
    expect(x.title).toBe('t'.repeat(TITLE_MAX - 1));
  });

  it('returns null concepts, with usage, for an unusable reply', async () => {
    const { client } = fake({ json: null, unusable: 'truncated', assistantTurn: {}, usage });
    expect(await planConcepts(client, settings, 2, new AbortController().signal)).toEqual({ concepts: null, usage });
  });

  it('returns null concepts, with usage, for a reply with too few', async () => {
    const { client } = fake({ json: { concepts: [c('A')] }, assistantTurn: {}, usage });
    expect(await planConcepts(client, settings, 3, new AbortController().signal)).toEqual({ concepts: null, usage });
  });

  it('passes an LlmError through unchanged', async () => {
    const err = new LlmError('auth', 'API key was rejected — check Settings.');
    const { client } = fake(err);
    await expect(planConcepts(client, settings, 2, new AbortController().signal)).rejects.toBe(err);
  });

  it('has three built-in fallback roles', () => {
    expect(FALLBACK_CONCEPTS.map((x) => x.title)).toEqual(['Conventional', 'Minimal', 'Different support']);
    for (const x of FALLBACK_CONCEPTS) expect(x.brief.length).toBeGreaterThan(0);
  });
});
