import { userMessage } from './prompt';
import type { Concept, GenerateSettings } from './prompt';
import type { LlmClient, LlmUsage } from '../llm/types';

/** Display and prompt caps — the model must not be able to flood the dialog. */
export const TITLE_MAX = 40;
export const BRIEF_MAX = 300;

/**
 * FIXED TEXT, like SYSTEM_PROMPT: nothing per-run. The planner sees every
 * concept at once, which is the whole point — a run designing alone cannot
 * know what its siblings chose (follow-up 164).
 */
export const CONCEPTS_SYSTEM = `You plan contrasting concepts for a woodworking piece. Each concept will then be designed separately, by someone who sees only that one concept.

Make the concepts differ in STRUCTURE:
- how the piece is supported: legs, a trestle, slab ends, a plinth, a cantilever;
- how it is built: frame and panel, slab, box or case;
- how its parts are arranged.
Concepts that differ only in dimensions or proportions do not count as different.

Every concept must fit the description, the hard limits, and the style and material preferences it is given.

The piece will be built only from rectangular boards touching face to face: no joinery, no curves, no turned or tapered parts. Propose only what can be built that way.

For each concept give a title of a few words naming the idea (for example "Trestle base") and a brief: one sentence on its support, its construction and what distinguishes it.`;

/** Structured outputs cannot enforce an array length — parseConcepts checks the count. */
export const CONCEPTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'brief'],
        properties: { title: { type: 'string' }, brief: { type: 'string' } },
      },
    },
  },
};

/** The runs' own message plus a count, so planner and runs read one set of constraints. */
export function conceptsMessage(s: GenerateSettings, count: number): string {
  return `${userMessage(s)}\n\nPropose ${count} contrasting concepts for this.`;
}

function clean(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;
}

/**
 * The first `count` concepts, or null. ALL OR NOTHING: one bad entry among the
 * first `count` refuses the list, so a batch never mixes planned concepts with
 * built-in roles. Entries beyond `count` are not looked at.
 */
export function parseConcepts(json: unknown, count: number): Concept[] | null {
  if (typeof json !== 'object' || json === null) return null;
  const list = (json as { concepts?: unknown }).concepts;
  if (!Array.isArray(list) || list.length < count) return null;
  const out: Concept[] = [];
  for (const item of list.slice(0, count)) {
    if (typeof item !== 'object' || item === null) return null;
    const title = clean((item as { title?: unknown }).title, TITLE_MAX);
    const brief = clean((item as { brief?: unknown }).brief, BRIEF_MAX);
    if (title === null || brief === null) return null;
    out.push({ title, brief });
  }
  return out;
}

/** Used when planning fails for any reason but a rejected key or a cancel (spec §4). Index = run. */
export const FALLBACK_CONCEPTS: readonly Concept[] = [
  { title: 'Conventional', brief: 'The classic, most expected construction for this piece.' },
  { title: 'Minimal', brief: 'The fewest, lightest parts that still make a sound piece.' },
  {
    title: 'Different support',
    brief: 'Held up some way other than a leg at each corner, e.g. a trestle, slab ends, a plinth or a cantilever.',
  },
];

/**
 * One call, no retry — the fallback is the retry. An unusable or invalid
 * reply resolves with `concepts: null` and what it cost; an LlmError
 * propagates unchanged, because what it means is the caller's decision.
 */
export async function planConcepts(
  client: LlmClient,
  settings: GenerateSettings,
  count: number,
  signal: AbortSignal,
): Promise<{ concepts: Concept[] | null; usage: LlmUsage }> {
  const res = await client.complete(
    { system: CONCEPTS_SYSTEM, messages: [client.userTurn(conceptsMessage(settings, count))], schema: CONCEPTS_SCHEMA },
    signal,
  );
  return { concepts: res.json === null ? null : parseConcepts(res.json, count), usage: res.usage };
}
