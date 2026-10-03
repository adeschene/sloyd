# Sloyd — batch variety (follow-up 164)

**Date:** 2026-10-03 · **Status:** approved in conversation, section by section
**Builds on:** `2026-10-03-sloyd-generate-design.md` (the Generate round), whose rules all
still hold unless this document says otherwise.

## 1. Problem and goal

A Generate batch of 2–3 sends N **identical** requests, so any difference between the
designs is down to sampling. In the Generate round's live pass, three Sonnet 5.5 side tables
(oak, Mid-century, Detailed) came back as one design three times, differing only in
stretcher width. Variety is the stated purpose of phase 1, which is why the user chose
option C (variety and exploration) first.

**Goal:** in a batch of 2 or 3, each design takes a recognisably different **structural**
approach. Examples: four legs and aprons versus a trestle versus slab ends. Every design
still honours the description, limits, style and material. **A batch of 1 is unchanged.**

**Why it cannot be solved per run:** each run designs alone. A run told only "be different"
cannot see what the others chose, so they converge again, on the second most obvious idea.
Something has to see all N at once.

**Approaches considered and rejected:**

- **Fixed roles per run with no extra call.** This survives only as the fallback in §4.
  Each run still designs blind.
- **Sequential runs, each shown the earlier designs.** This gives the strongest contrast but
  takes about 3× as long for a batch of 3.

## 2. Flow

1. The user clicks Generate with N ≥ 2. Rows appear at once with status `waiting`, and a
   **plan line** appears above them with status `planning`.
2. `planConcepts` makes **one** call through the existing `LlmClient.complete`, with its own
   fixed system prompt and schema (§3). `llm/` is not modified.
3. On success, each run `i` receives `concepts[i]`, and its row shows the concept's title.
   On fallback (§4), each run receives `FALLBACK_CONCEPTS[i]`.
4. The runs go in parallel exactly as today. The concept rides as **one extra line at the
   end of the run's first user message**:

   ```
   Design this version: <title> — <brief>
   ```

   Because the history is append-only (invariant 37), every repair round carries it
   automatically. **The system prompt stays fixed**: the concept goes in the user turn,
   never in `SYSTEM_PROMPT`, which must remain a constant prefix.
5. For N = 1 there is no planning call, no plan line and no `waiting` status. The first user
   message is **byte-identical** to today's.

Project names are unchanged: `<design name> — <letter>`. The concept title is shown in the
dialog only.

## 3. The planning call — `src/generate/concepts.ts`

**`CONCEPTS_SYSTEM`** is fixed text with nothing per-run in it. It says:

- You propose N contrasting concepts for a woodworking piece that will then be designed
  separately.
- Concepts must differ in **structure**: how the piece is supported (legs, trestle, slab
  ends, plinth, cantilever), how it is built (frame and panel, slab, box/case), and the
  arrangement of its parts. **Differing only in dimensions or proportions does not count.**
- Every concept must fit the description, the hard limits, and the style and material
  preferences.
- Sloyd builds only from **rectangular boards touching face to face**: no joinery, no
  curves, no turned or tapered parts. Propose only what can be built that way.
- A title is a few words naming the idea (e.g. "Trestle base"). A brief is one sentence on
  the support, the construction and the distinguishing feature.

**`CONCEPTS_SCHEMA`:**

```json
{ "type": "object", "additionalProperties": false, "required": ["concepts"],
  "properties": { "concepts": { "type": "array", "items": {
    "type": "object", "additionalProperties": false, "required": ["title", "brief"],
    "properties": { "title": { "type": "string" }, "brief": { "type": "string" } } } } } }
```

Structured outputs cannot enforce an array length, so the count is checked in code.

**`conceptsMessage(settings, count)`** is `userMessage(settings)` followed by a blank line
and `Propose <count> contrasting concepts for this.` It reuses the existing limits and
preferences lines, so the planner and the runs read the same constraints from one builder.

**`parseConcepts(json, count): Concept[] | null`:**

- It needs an object whose `concepts` is an array of at least `count` entries, and it uses
  the **first `count`**.
- Each used entry needs `title` and `brief` as strings that are non-blank after trimming.
  Any used entry that fails makes the whole result `null`, with no mixing of planned and
  fallback concepts.
- Values are trimmed, then cut to **40** characters (title) and **300** (brief).

**`planConcepts(client, settings, count, signal): Promise<{ concepts: Concept[] | null; usage: LlmUsage }>`:**

- It makes one `complete` call. An unusable or invalid reply returns `concepts: null` with
  the call's usage.
- An `LlmError` **propagates unchanged**. The caller decides what each kind means (§4).
- No retry: the fallback is the retry.

**`FALLBACK_CONCEPTS`** (index = run):

| | title | brief |
|---|---|---|
| A | Conventional | The classic, most expected construction for this piece. |
| B | Minimal | The fewest, lightest parts that still make a sound piece. |
| C | Different support | Held up some way other than a leg at each corner, e.g. a trestle, slab ends, a plinth or a cantilever. |

`type Concept = { title: string; brief: string }`.

## 4. Failure handling — `useGenerations`

| During planning | Plan line | Rows | Runs |
|---|---|---|---|
| Success | `ready`, cost shown | concept title, then as today | go |
| Unusable reply, too few or invalid concepts | `fallback`, cost shown | fallback title | go |
| `LlmError` of kind `rate-limit`, `overloaded`, `network`, `refused`, `other` | `fallback`, no cost | fallback title | go |
| `LlmError` `auth` | `failed` + message | every row `failed` + the same message | **none start** |
| `LlmError` `cancelled` (the user pressed Cancel) | `cancelled` | every row `cancelled` | **none start**; nothing written |

- **One batch at a time still holds.** The batch counts as live from the click, through
  planning, until the last run ends. Generate stays disabled throughout, and `start` stays a
  no-op while anything is live.
- **The planning call never touches storage.** Invariant 36 is unaffected: the runs still
  write only through `createProject(doc, { activate: false })`.
- A cancel that lands after planning resolves but before the runs begin counts as a cancel
  during planning. The `signal.aborted` check happens before any run starts.
- Planning's cost is **not** added to any row. A row's cost stays what its own design cost.

## 5. The hook and the dialog

**`useGenerations`**:

- `RunStatus` gains `'waiting'`.
- `RunRow` gains `concept?: string` (the title).
- The hook returns `plan: PlanLine | null`, which is null for N = 1:

  ```ts
  type PlanStatus = 'planning' | 'ready' | 'fallback' | 'failed' | 'cancelled';
  interface PlanLine { status: PlanStatus; costUsd: number | null; error?: string }
  ```

- `start` keeps its signature.

**`GenerateDialog`**:

- It renders the plan line above the rows when `plan` is non-null:
  - `planning`: **Planning N contrasting designs…**
  - `ready`: **Concepts** · `≈ $x.xx`
  - `fallback`: **Concepts unavailable — using built-in variations**, plus the cost when
    known
  - `failed`: **Failed: <error>**
  - `cancelled`: **Cancelled**
- A `waiting` row reads **Waiting for its concept…**.
- A row with a concept shows it after the letter: **B — Trestle base**.
- Styling reuses the existing `.generate-*` classes. The plan line uses the run-row look
  without an Open button.

## 6. Testing

Unit tests use the existing fake `LlmClient`.

**`concepts.test.ts`:**

- The request carries `CONCEPTS_SYSTEM`, `CONCEPTS_SCHEMA` and a message ending in the
  count line.
- `parseConcepts`:
  - takes the first N of a longer list
  - returns `null` for too few entries, a non-array, a missing field, or a blank string
  - truncates at 40 and 300 characters
- `planConcepts` returns `concepts: null` with usage on an unusable reply, and passes an
  `LlmError` through unchanged.
- `FALLBACK_CONCEPTS` has three entries.

**`prompt.test.ts`:**

- With a concept, the first message ends with the `Design this version:` line.
- **Without one, it is byte-identical to the current output.** The N = 1 pin compares
  against a literal, not against the function itself.

**`useGenerations.test.tsx`:**

- N = 1 makes no planning call.
- N = 3 makes exactly one planning call **before** any run call, and the three runs' first
  messages carry three **different** concepts.
- Rows are `waiting` until planning resolves.
- Each fallback trigger (unusable, too few, `overloaded`) leads to fallback titles, and the
  runs go.
- `auth` during planning fails every row and starts no run.
- A cancel during planning starts no run and writes no project.
- The plan line carries the planning call's cost.

**`GenerateDialog.test.tsx`:**

- The plan line's text in each status.
- The concept title is shown on a row.
- `Waiting for its concept…` is shown.

**Mutation checks.** These tests could pass for the wrong reason, so each one is mutated
before it is believed:

- *Different concepts per run*: hand every run `concepts[0]`, and the test must fail.
- *No run starts during planning*: start the runs before awaiting `planConcepts`, and the
  test must fail.
- *Cancel during planning writes nothing*: drop the post-planning `signal.aborted` check,
  and the test must fail.
- *N = 1 unchanged*: always append a concept line, and the test must fail.

**Live check** (paid, with the user's approval). Claude drives the dev server and the user
watches. Re-run the side table (oak, Mid-century, Detailed, 3, Sonnet 5.5), plus one prompt
of the user's choice.

- **Pass:** the user judges the designs to differ in structure, not just in dimensions.
- **Fail:** record it, and decide with the user before changing anything.
- Record each concept, each outcome, and the token usage.

## 7. Out of scope

- Letting the user see, edit or pick concepts before the runs start.
- A separate effort level or model for the planning call.
- Retrying a failed planning call.
- Changing how a batch of 1 behaves.
