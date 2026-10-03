# Batch Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Generate batch of 2–3 makes one planning call for N structurally contrasting concepts and gives each run its own concept. A batch of 1 is unchanged.

**Architecture:**
- A new pure module, `src/generate/concepts.ts`, holds the planning call's fixed prompt and
  schema, parsing, built-in fallback roles and `planConcepts`.
- `userMessage` and `runGeneration` gain an optional `concept`.
- `useGenerations` runs the planning step before the runs and exposes a `plan` line.
- `GenerateDialog` renders that line and each row's concept.
- `llm/` is not modified.

**Tech Stack:** React 19, TypeScript 7, Vitest 4 + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-03-sloyd-batch-variety-design.md`. Read it before
starting any task; where this plan and the spec disagree, the spec wins and the
disagreement is a plan error to escalate.

## Global Constraints

- `src/llm/` is NOT modified. The planning call goes through the existing `LlmClient.complete`.
- `concepts.ts` imports only from `./prompt` and `../llm/types`. The `Concept` type lives in `prompt.ts` (so `prompt.ts` never imports `concepts.ts` — no cycle).
- `SYSTEM_PROMPT` is unchanged. The concept rides ONLY in the run's first user message.
- A batch of 1: no planning call, `plan === null`, no `waiting` status, first user message byte-identical to today.
- Truncation: concept title 40 characters, brief 300 (after trimming).
- `FALLBACK_CONCEPTS` titles and briefs, verbatim: `Conventional` / `The classic, most expected construction for this piece.`; `Minimal` / `The fewest, lightest parts that still make a sound piece.`; `Different support` / `Held up some way other than a leg at each corner, e.g. a trestle, slab ends, a plinth or a cantilever.`
- The concept line, verbatim: `Design this version: <title> — <brief>` (an em dash with a space each side).
- The planning call never touches storage. Generation still writes ONLY through `createProject(doc, { activate: false })` (invariant 36).
- `npm test` does not typecheck: run `npm run build` before claiming a task compiles.
- No pull requests. Work on branch `variety`, merge locally with `--no-ff` at the end (Task 5, after the user agrees).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never commit, echo or log an API key.

## Review Focus

1. **Cancel landing exactly as planning resolves.** Expected: no run starts and nothing is
   written. Pinned in Task 3. The test asserts that NO run call is made, because the existing
   post-run guard would hide a started run from a "nothing written" assertion.
2. **A batch of 1 after a batch of 3.** Expected: the old plan line disappears. Pinned in
   Task 3.
3. **Closing and reopening the dialog during planning.** Expected: the plan line and waiting
   rows are still there, because the state lives in `useGenerations`, owned by App. This is
   structural, and the existing App tests cover reopen. Task 4 only passes `plan` through.
4. **The model returns concepts with blank strings or too few entries.** Expected: the
   built-in roles for every run, never a mix. Pinned in Task 2 (parse) and Task 3 (hook).
5. **A rejected key during planning.** Expected: every row fails with the key message and no
   run starts. Pinned in Task 3.

---

## File map

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/generate/prompt.ts` (+ test) | Modify | `Concept` type; `userMessage(s, concept?)` |
| `src/generate/run.ts` (+ test) | Modify | `runGeneration(..., concept?)` |
| `src/generate/concepts.ts` (+ test) | Create | planning prompt, schema, parse, fallback, `planConcepts` |
| `src/useGenerations.ts` (+ test) | Modify | planning step, `plan` line, `waiting`, `concept` on rows |
| `src/panels/GenerateDialog.tsx` (+ test) | Modify | plan line, waiting text, concept title |
| `src/App.tsx` | Modify | pass `plan` through |
| `src/styles.css` | Modify | `.generate-plan`, `.generate-run-concept` |

### Task 0: Branch

- [ ] `git checkout -b variety` from `master` (clean tree). Confirm `npx vitest run` shows 1094 passing before any change.

---

### Task 1: The concept reaches a run's first message

**Files:**
- Modify: `src/generate/prompt.ts`, `src/generate/run.ts`
- Test: `src/generate/prompt.test.ts`, `src/generate/run.test.ts`

**Interfaces:**
- Produces: `export interface Concept { title: string; brief: string }` in `prompt.ts`; `userMessage(s: GenerateSettings, concept?: Concept): string`; `runGeneration(client, settings, signal, onProgress, concept?: Concept)`.

- [ ] **Step 1: Pin today's output first.** Add to `prompt.test.ts` (inside the existing `describe`):

```ts
  it('without a concept, the message is byte-identical to the pre-variety output', () => {
    expect(userMessage(base)).toBe(
      'Design this: A bookcase with five shelves\n\nHard limits:\n- Overall width (X) at most 36in.\n' +
      '- Overall height (Y) at most 72in.\n- At most 30 parts (moderate detail).\n\nPreferences:\n' +
      '- Prefer Plywood (material key "plywood") for most parts.\n' +
      '- Style: Shaker: plain, light, well-proportioned; tapered or square legs; no ornament.',
    );
  });
```

- [ ] **Step 2: Run it. It must PASS on the unchanged code.** `npx vitest run src/generate/prompt.test.ts`. It is a pin, not a red test. If it fails, the literal is wrong: fix the LITERAL to match today's output, and note that in the report.

- [ ] **Step 3: Write the failing tests.** Add to `prompt.test.ts`:

```ts
  it('ends with the concept line when given a concept', () => {
    const m = userMessage(base, { title: 'Trestle base', brief: 'Two slab ends and a stretcher.' });
    expect(m.startsWith(userMessage(base))).toBe(true);
    expect(m.endsWith('\n\nDesign this version: Trestle base — Two slab ends and a stretcher.')).toBe(true);
  });
```

Add to `run.test.ts` (inside `describe('runGeneration')`):

```ts
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
```

- [ ] **Step 4: Run, expect FAIL** (the concept test fails: the line is missing; TS may also flag the extra argument). `npx vitest run src/generate`

- [ ] **Step 5: Implement.** In `prompt.ts`, after `GenerateSettings`:

```ts
/**
 * One of a batch's contrasting directions (follow-up 164). Defined here, not
 * in concepts.ts, so prompt.ts never imports concepts.ts.
 */
export interface Concept {
  title: string;
  brief: string;
}
```

Change `userMessage`:

```ts
export function userMessage(s: GenerateSettings, concept?: Concept): string {
  // ...existing body unchanged up to the style line...
  if (s.style !== 'any') lines.push(`- Style: ${STYLE_NOTES[s.style]}`);
  // The concept rides in the USER turn, never in SYSTEM_PROMPT, which must
  // stay a fixed prefix. Without one, this output is byte-identical to the
  // pre-variety message (pinned by a literal in the test).
  if (concept) lines.push('', `Design this version: ${concept.title} — ${concept.brief}`);
  return lines.join('\n');
}
```

In `run.ts`, add the parameter and pass it through. Change the import of `Concept` to come from `./prompt`:

```ts
export async function runGeneration(
  client: LlmClient,
  settings: GenerateSettings,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
  concept?: Concept,
): Promise<RunOutcome> {
  const limits = limitsOf(settings);
  const messages: LlmMessage[] = [client.userTurn(userMessage(settings, concept))];
```

- [ ] **Step 6: Run, expect PASS.** `npx vitest run src/generate`, then `npm run build`.

- [ ] **Step 7: Mutate.** Temporarily make `userMessage` always append a concept line (e.g. `if (true)` with a dummy concept): the byte-identical pin must FAIL. Then pass `undefined` instead of `concept` in `runGeneration`: the run test must FAIL. Revert both and record them in the report.

- [ ] **Step 8: Commit.** `git commit -am "feat(generate): a run's first message can carry a batch concept (fu 164)"` plus the trailer.

---

### Task 2: `concepts.ts`, the planning call

**Files:**
- Create: `src/generate/concepts.ts`, `src/generate/concepts.test.ts`

**Interfaces:**
- Consumes: `Concept`, `GenerateSettings`, `userMessage` from `./prompt`; `LlmClient`, `LlmUsage` from `../llm/types`.
- Produces: `CONCEPTS_SYSTEM: string`, `CONCEPTS_SCHEMA`, `TITLE_MAX = 40`, `BRIEF_MAX = 300`, `conceptsMessage(s, count): string`, `parseConcepts(json: unknown, count: number): Concept[] | null`, `FALLBACK_CONCEPTS: readonly Concept[]` (length 3), `planConcepts(client, settings, count, signal): Promise<{ concepts: Concept[] | null; usage: LlmUsage }>`.

- [ ] **Step 1: Write the failing tests.** Create `src/generate/concepts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run, expect FAIL** (the module does not exist). `npx vitest run src/generate/concepts.test.ts`

- [ ] **Step 3: Implement** `src/generate/concepts.ts`:

```ts
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
```

- [ ] **Step 4: Run, expect PASS**, then `npm run build`.

- [ ] **Step 5: Mutate.**
  - Change `list.length < count` to `list.length < 1`: the "too few" case must FAIL.
  - Change `list.slice(0, count)` to `list`: the "ignores a bad entry BEYOND" test must FAIL.
  - Remove `.trim() !== ''`: the "blank title" case must FAIL.

  Revert each and record it.

- [ ] **Step 6: Commit.** `git add src/generate/concepts.ts src/generate/concepts.test.ts && git commit -m "feat(generate): concepts.ts — the batch planning call, parse and fallback roles (fu 164)"` plus the trailer.

---

### Task 3: `useGenerations` plans before it runs

**Files:**
- Modify: `src/useGenerations.ts`, `src/useGenerations.test.tsx`

**Interfaces:**
- Consumes: `planConcepts`, `FALLBACK_CONCEPTS`, `CONCEPTS_SCHEMA` (tests only) from `./generate/concepts`; `Concept` from `./generate/prompt`; `runGeneration(..., concept?)`.
- Produces: `RunStatus` gains `'waiting'`; `RunRow.concept?: string`; `export type PlanStatus = 'planning' | 'ready' | 'fallback' | 'failed' | 'cancelled'`; `export interface PlanLine { status: PlanStatus; costUsd: number | null; error?: string }`; the hook returns `{ rows, live, plan, start, cancel }` with `plan: PlanLine | null`. `start`'s signature is unchanged.

- [ ] **Step 1: Write the failing tests.** In `useGenerations.test.tsx`, add to the imports:

```ts
import { CONCEPTS_SCHEMA } from './generate/concepts';
import type { LlmRequest } from './llm/types';
```

Add after `setup`:

```ts
const CONCEPTS = { concepts: [
  { title: 'Four legs', brief: 'Legs and aprons.' },
  { title: 'Trestle base', brief: 'Two slab ends and a stretcher.' },
  { title: 'Slab sides', brief: 'Two slabs carry the top.' },
] };
const isPlan = (req: LlmRequest) => req.schema === CONCEPTS_SCHEMA;
/** Planning calls go to `plan`, run calls to `run`. */
function planned(plan: LlmClient['complete'], run: LlmClient['complete'] = ok) {
  return client((req, signal) => (isPlan(req) ? plan(req, signal) : run(req, signal)));
}
const calls = (c: LlmClient) => (c.complete as ReturnType<typeof vi.fn>).mock.calls.map(([req]) => req as LlmRequest);
const runFirstMessages = (c: LlmClient) => calls(c).filter((r) => !isPlan(r)).map((r) => r.messages[0] as string);
const planOk = (json: unknown = CONCEPTS) => async (): Promise<LlmResult> => ({ json, assistantTurn: {}, usage });
const abortable = (_req: LlmRequest, signal: AbortSignal) => new Promise<LlmResult>((_, reject) => {
  signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
});
```

Add a new `describe` block:

```ts
describe('useGenerations — batch planning (fu 164)', () => {
  it('a batch of 1 makes no planning call and shows no plan line', async () => {
    const c = planned(planOk());
    const { result } = setup();
    act(() => result.current.start(c, settings, 1));
    expect(result.current.rows[0].status).toBe('designing');
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c).some(isPlan)).toBe(false);
    expect(result.current.plan).toBeNull();
  });

  it('plans ONCE, first, then gives each run a DIFFERENT concept', async () => {
    const c = planned(planOk());
    const { result } = setup();
    act(() => result.current.start(c, settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    const all = calls(c);
    expect(all.filter(isPlan)).toHaveLength(1);
    expect(isPlan(all[0])).toBe(true);
    const firsts = runFirstMessages(c);
    expect(firsts).toHaveLength(3);
    CONCEPTS.concepts.forEach((k, i) => {
      expect(firsts[i].endsWith(`Design this version: ${k.title} — ${k.brief}`)).toBe(true);
    });
    expect(result.current.rows.map((r) => r.concept)).toEqual(['Four legs', 'Trestle base', 'Slab sides']);
    expect(result.current.plan).toEqual({ status: 'ready', costUsd: 0.01 });
    expect(createProject).toHaveBeenCalledTimes(3);
  });

  it('rows wait, and NO run starts, while planning is out', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const c = planned(async () => { await gate; return planOk()(); });
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(calls(c)).toHaveLength(1));
    expect(result.current.rows.map((r) => r.status)).toEqual(['waiting', 'waiting']);
    expect(result.current.plan).toEqual({ status: 'planning', costUsd: null });
    expect(result.current.live).toBe(2);
    release();
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c)).toHaveLength(3);
  });

  it.each([
    ['an unusable reply', async (): Promise<LlmResult> => ({ json: null, unusable: 'unparseable', assistantTurn: {}, usage }), 0.01],
    ['too few concepts', planOk({ concepts: [CONCEPTS.concepts[0]] }), 0.01],
    ['an overload', () => Promise.reject(new LlmError('overloaded', 'Overloaded.')), null],
  ] as const)('falls back to the built-in roles on %s, and the runs still go', async (_n, plan, cost) => {
    const c = planned(plan);
    const { result } = setup();
    act(() => result.current.start(c, settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.plan).toEqual({ status: 'fallback', costUsd: cost });
    expect(result.current.rows.map((r) => r.concept)).toEqual(['Conventional', 'Minimal', 'Different support']);
    expect(runFirstMessages(c)[1]).toContain('Design this version: Minimal — ');
    expect(createProject).toHaveBeenCalledTimes(3);
  });

  it('a rejected key during planning fails every row and starts no run', async () => {
    const c = planned(() => Promise.reject(new LlmError('auth', 'API key was rejected — check Settings.')));
    const { result } = setup();
    act(() => result.current.start(c, settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c)).toHaveLength(1);
    expect(result.current.plan).toMatchObject({ status: 'failed', error: 'API key was rejected — check Settings.' });
    expect(result.current.rows.every((r) => r.status === 'failed' && r.error?.includes('API key'))).toBe(true);
    expect(createProject).not.toHaveBeenCalled();
  });

  it('cancel during planning starts no run and writes nothing', async () => {
    const c = planned(abortable);
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c)).toHaveLength(1);
    expect(result.current.plan?.status).toBe('cancelled');
    expect(result.current.rows.map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    expect(createProject).not.toHaveBeenCalled();
  });

  it('a cancel landing as planning RESOLVES still starts no run', async () => {
    const { result } = setup();
    // Planning answers despite the abort. Without the post-planning check the
    // runs would start, and the post-RUN guard would still write nothing — so
    // this asserts on run CALLS, not only on writes.
    const c = planned(async () => {
      act(() => result.current.cancel());
      return planOk()();
    });
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(calls(c)).toHaveLength(1);
    expect(result.current.rows.map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    expect(result.current.plan?.status).toBe('cancelled');
    expect(createProject).not.toHaveBeenCalled();
  });

  it('a batch of 1 after a planned batch clears the plan line', async () => {
    const c = planned(planOk());
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.plan).not.toBeNull();
    act(() => result.current.start(c, settings, 1));
    expect(result.current.plan).toBeNull();
    await waitFor(() => expect(result.current.live).toBe(0));
  });
});
```

Existing tests that call `start(..., 2 | 3)` with `client(ok)` now get a planning call. `ok` returns the design `GOOD`, which `parseConcepts` refuses, so those batches fall back and still pass. **Three existing tests need adjusting so they keep testing the RUN path they were written for, and only these three:**
- *'an auth failure stops every run and says why on each row'*: its first call is now the planning call. It would still pass, but it would be testing the planning path. Make it `planned(planOk(), <its existing function>)`, so the auth rejection lands on the first RUN call as before.
- *'a rate limit fails only its own run'*: make the same change, `planned(planOk(), <its existing function>)`. Without it, the rate limit hits planning, both runs succeed, and the test fails.
- *'cancel writes nothing for runs still in flight'*: it would pass by cancelling during PLANNING. Make it `planned(planOk(), <its existing abortable function>)`, and before `cancel()`, add `await waitFor(() => expect(result.current.rows.every((r) => r.status === 'designing')).toBe(true));` so the runs really are in flight.

Do not weaken any other existing assertion. If another existing test fails, stop and report rather than editing it.

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/useGenerations.test.tsx`

- [ ] **Step 3: Implement.** In `useGenerations.ts`:

Imports:

```ts
import { FALLBACK_CONCEPTS, planConcepts } from './generate/concepts';
import type { Concept, GenerateSettings } from './generate/prompt';
```

(Replace the existing `GenerateSettings` type import with this one.)

Types:

```ts
export type RunStatus = 'waiting' | 'designing' | 'repairing' | 'retrying' | 'ready' | 'failed' | 'cancelled';
```

Add `concept?: string;` to `RunRow`, documented as `/** The batch concept's title (fu 164); absent for a batch of 1. */`. Add:

```ts
export type PlanStatus = 'planning' | 'ready' | 'fallback' | 'failed' | 'cancelled';

/** The batch planning call's line in the dialog; null for a batch of 1. */
export interface PlanLine {
  status: PlanStatus;
  costUsd: number | null;
  error?: string;
}
```

In the hook, add `const [plan, setPlan] = useState<PlanLine | null>(null);`, return `{ rows, live, plan, start, cancel }`, and restructure `start`. The per-run body moves unchanged into `runOne`, except that it passes `concept` to `runGeneration`:

```ts
  const start = useCallback((client: LlmClient, settings: GenerateSettings, count: 1 | 2 | 3) => {
    if (liveRef.current > 0) return;
    const ctl = new AbortController();
    controller.current = ctl;
    let authError: string | null = null;
    const planning = count > 1;
    const keys = Array.from({ length: count }, (_, i) => Date.now() * 10 + i);
    setRows(keys.map((key, i) => ({
      key, letter: planning ? LETTERS[i] : null, status: planning ? 'waiting' : 'designing', costUsd: null,
    })));
    setPlan(planning ? { status: 'planning', costUsd: null } : null);
    // Live from the click, through planning, to the last run — one batch at a time.
    liveRef.current = count;
    setLive(count);

    /** Ends every row at once — planning stopped the batch before any run began. */
    const endAll = (p: Partial<RunRow>) => {
      setRows((rs) => rs.map((r) => ({ ...r, ...p })));
      liveRef.current = 0;
      setLive(0);
    };

    const runOne = (key: number, letter: string | null, concept: Concept | undefined) => {
      void (async () => {
        try {
          const out = await runGeneration(client, settings, ctl.signal, (p) => patch(key, progressPatch(p)), concept);
          // ... the existing body, unchanged from `const costUsd = ...` to the end of `finally` ...
        }
      })();
    };

    void (async () => {
      let concepts: readonly (Concept | undefined)[] = keys.map(() => undefined);
      if (planning) {
        try {
          const out = await planConcepts(client, settings, count, ctl.signal);
          concepts = out.concepts ?? FALLBACK_CONCEPTS.slice(0, count);
          setPlan({ status: out.concepts ? 'ready' : 'fallback', costUsd: client.estimateCostUsd(out.usage) });
        } catch (e) {
          if (e instanceof LlmError && e.kind === 'auth') {
            setPlan({ status: 'failed', costUsd: null, error: e.message });
            endAll({ status: 'failed', error: e.message });
            return;
          }
          if (e instanceof LlmError && e.kind === 'cancelled') {
            setPlan({ status: 'cancelled', costUsd: null });
            endAll({ status: 'cancelled' });
            return;
          }
          // Anything else: the fallback IS the retry (spec §4).
          concepts = FALLBACK_CONCEPTS.slice(0, count);
          setPlan({ status: 'fallback', costUsd: null });
        }
        // A cancel that lands as planning resolves still means "start nothing".
        // Checked HERE, before any run — the post-run guard would hide started
        // runs from a nothing-was-written check, not stop them spending.
        if (ctl.signal.aborted) {
          setPlan((p) => (p ? { ...p, status: 'cancelled' } : p));
          endAll({ status: 'cancelled' });
          return;
        }
        setRows((rs) => rs.map((r, i) => ({ ...r, concept: concepts[i]?.title, status: 'designing' })));
      }
      keys.forEach((key, i) => runOne(key, planning ? LETTERS[i] : null, concepts[i]));
    })();
  }, []);
```

Update the doc comment above `useGenerations` with one paragraph: "A batch of 2–3 first makes ONE planning call (generate/concepts.ts) so each run designs a different concept (fu 164); a rejected key or a cancel during planning ends the batch before any run starts, anything else falls back to built-in roles."

- [ ] **Step 4: Run, expect PASS** for the whole suite (`npx vitest run`), then `npm run build`.

- [ ] **Step 5: Mutate.** Each mutation must turn at least one named test red. Revert each one and record the results.
  - Give every run `concepts[0]` → *plans ONCE, first, then … DIFFERENT concept* fails.
  - Fire `keys.forEach(runOne…)` BEFORE `await planConcepts` (kick the runs off, then plan) → *rows wait, and NO run starts* fails.
  - Delete the post-planning `if (ctl.signal.aborted)` block → *a cancel landing as planning RESOLVES* fails.
  - Make `planning` always true → *a batch of 1 makes no planning call* fails.
  - Drop `setPlan(planning ? … : null)`'s null branch (leave the old plan) → *a batch of 1 after a planned batch* fails.

- [ ] **Step 6: Commit.** `git commit -am "feat(generate): a batch plans contrasting concepts before its runs (fu 164)"` plus the trailer.

---

### Task 4: The dialog shows the plan line and each row's concept

**Files:**
- Modify: `src/panels/GenerateDialog.tsx`, `src/panels/GenerateDialog.test.tsx`, `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `PlanLine`, `RunRow` (with `concept`, `'waiting'`) from `../useGenerations`; `generations.plan` in App.
- Produces: `GenerateDialog` prop `plan: PlanLine | null`.

- [ ] **Step 1: Write the failing tests.** In `GenerateDialog.test.tsx`, add `plan: null` to the `props()` defaults (with `import type { PlanLine, RunRow } from '../useGenerations';`), and add:

```ts
  it.each([
    [{ status: 'planning', costUsd: null }, 'Planning 3 contrasting designs…'],
    [{ status: 'ready', costUsd: 0.012 }, 'Concepts'],
    [{ status: 'fallback', costUsd: null }, 'Concepts unavailable — using built-in variations'],
    [{ status: 'failed', costUsd: null, error: 'API key was rejected — check Settings.' }, 'Failed: API key was rejected — check Settings.'],
    [{ status: 'cancelled', costUsd: null }, 'Cancelled'],
  ] as [PlanLine, string][])('renders the plan line: %o', (plan, text) => {
    const rows: RunRow[] = ['A', 'B', 'C'].map((letter, i) => ({ key: i, letter, status: 'waiting', costUsd: null }));
    render(<GenerateDialog {...props({ plan, rows })} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('shows the planning cost when known', () => {
    const rows: RunRow[] = [{ key: 1, letter: 'A', status: 'waiting', costUsd: null }];
    render(<GenerateDialog {...props({ plan: { status: 'ready', costUsd: 0.012 }, rows })} />);
    expect(screen.getByText('≈ $0.01')).toBeInTheDocument();
  });

  it('a waiting row says so, and a row shows its concept', () => {
    const rows: RunRow[] = [
      { key: 1, letter: 'A', status: 'waiting', costUsd: null },
      { key: 2, letter: 'B', status: 'designing', concept: 'Trestle base', costUsd: null },
    ];
    render(<GenerateDialog {...props({ plan: { status: 'ready', costUsd: null }, rows })} />);
    expect(screen.getByText('Waiting for its concept…')).toBeInTheDocument();
    expect(screen.getByText('Trestle base')).toBeInTheDocument();
  });

  it('shows no plan line for a batch of 1', () => {
    const rows: RunRow[] = [{ key: 1, letter: null, status: 'designing', costUsd: null }];
    render(<GenerateDialog {...props({ rows })} />);
    expect(screen.queryByText(/Planning|Concepts/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run, expect FAIL.** `npx vitest run src/panels/GenerateDialog.test.tsx`

- [ ] **Step 3: Implement.** In `GenerateDialog.tsx`:
  - Import `PlanLine` beside `RunRow`.
  - Add `plan: PlanLine | null;` to `Props`.
  - Add `case 'waiting': return 'Waiting for its concept…';` to `statusText`.
  - Add:

```ts
function planText(plan: PlanLine, n: number): string {
  switch (plan.status) {
    case 'planning': return `Planning ${n} contrasting designs…`;
    case 'ready': return 'Concepts';
    case 'fallback': return 'Concepts unavailable — using built-in variations';
    case 'failed': return `Failed: ${plan.error}`;
    case 'cancelled': return 'Cancelled';
  }
}
```

Inside the `p.rows.length > 0` branch, render the plan line BEFORE the `<ul>`. Wrap the two in a fragment:

```tsx
        {p.rows.length > 0 && (
          <>
            {p.plan && (
              <p className={`generate-plan generate-plan-${p.plan.status}`}>
                <span className="generate-run-status">{planText(p.plan, p.rows.length)}</span>
                {p.plan.costUsd !== null && <span className="generate-run-cost">{`≈ $${p.plan.costUsd.toFixed(2)}`}</span>}
              </p>
            )}
            <ul className="generate-runs">
              {/* existing rows; add after the letter span: */}
              {/* {r.concept && <span className="generate-run-concept">{r.concept}</span>} */}
            </ul>
          </>
        )}
```

In `App.tsx`, pass `plan={generations.plan}` to `<GenerateDialog>`. In `styles.css`, after `.generate-run-failed …`:

```css
.generate-plan { display: flex; gap: 8px; align-items: center; margin: 16px 0 0; }
.generate-plan + .generate-runs { margin-top: 6px; }
.generate-plan-failed .generate-run-status { color: var(--alert); }
.generate-run-concept { font-weight: 600; }
```

- [ ] **Step 4: Run, expect PASS.** `npx vitest run` (the whole suite), then `npm run build`.

- [ ] **Step 5: Commit.** `git commit -am "feat(generate): the dialog shows the batch's planning line and each run's concept (fu 164)"` plus the trailer.

---

### Task 5: Live check, record, merge. STOP POINTS: paid runs and the merge need the user

**Files:**
- Create: `docs/browser-verification-batch-variety.md`, screenshots in `docs/img/variety-*.png`
- Modify: `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`

- [ ] **Step 1: No-key UI check, free.** Start the dev server with `npm run dev -- --host 127.0.0.1 --port 5180 --strictPort`. Use Playwright MCP: Generate opens and the form is unchanged. Close the browser afterward.

- [ ] **Step 2: Paid runs. ASK THE USER FIRST.** Claude drives the dev server in the Playwright browser while the user watches. The user decides how the key is supplied, and it is never put in chat or a committed file. Run:
  1. The side table: oak, Mid-century, Detailed, 3 generations, Sonnet 5.5.
  2. One prompt of the user's choice.

  For each, record:
  - the plan line, with its cost
  - each concept title and brief, readable from each row's concept and from the project
  - each run's outcome
  - a screenshot of each opened design

  The user judges whether the designs differ in **structure**.
  - **Pass:** they do.
  - **Fail:** record it and decide with the user. Do not retune the prompt unasked.

  Clear `localStorage` afterward and confirm `sloyd.llm.v1` is gone.

- [ ] **Step 3: Write `docs/browser-verification-batch-variety.md`**, in the shape of `docs/browser-verification-generate.md`.

- [ ] **Step 4: Update CLAUDE.md** (the rules only):
  - **Status:** the test count, plus a line on this round.
  - **Rounds table row:** `batch variety | 10-03 | — | one planning call gives each run in a batch of 2–3 a contrasting concept (fu 164); a batch of 1 is unchanged`.
  - **Where things live:** a `concepts.ts` entry. Its points: the planning call; ALL-OR-NOTHING parse; `FALLBACK_CONCEPTS`; the concept rides in the USER turn and never in `SYSTEM_PROMPT`.
  - **`useGenerations` entry:** add "plans first for N ≥ 2; auth/cancel during planning start no run".
  - **Open follow-ups list:** replace the 164 bullet with its outcome.

- [ ] **Step 5: Update `docs/history.md` and `docs/follow-ups.md`.**
  - `docs/history.md`: the round's narrative.
  - `docs/follow-ups.md`:
    - Close **164**, or narrow it, according to Step 2's verdict.
    - Add any measured finding as a new numbered entry.
    - Add any surviving mutation as a new numbered entry.

- [ ] **Step 6: Verify and commit.**
  - Run `npx vitest run` and record the count.
  - Run `npm run build`.
  - Commit with `docs: the batch variety round — live check and the rules it adds` plus the trailer.

- [ ] **Step 7: Merge. ASK THE USER FIRST.**
  - `git checkout master && git merge --no-ff variety`.
  - Run the tests and the build on the merged tree.
  - `git branch -d variety`.
  - **Do not deploy.** Deploying is a separate request.
