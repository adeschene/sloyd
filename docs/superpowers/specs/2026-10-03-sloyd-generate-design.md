# Generate — design

Describe a piece of furniture, pick a few settings, click **Generate**, and get
back one to three prototype designs built out of ordinary Sloyd boards — each
in its own project, waiting in the project menu. The user brings their own
Claude API key; there is still no server.

Opened 2026-10-03 by the user: *"implement a way to generate structures/3D
construction prototypes with an LLM … the user inputs an API key in the
settings and we have a menu that allows them to pick some settings (style, max
dimensions, etc.) and describe what they want, then click Generate."* This is
the first round chosen since the 08-31 session left the candidate list empty.

---

## 1. Purpose and phasing

The user wants all three of: a way past the blank page, a buildable design, and
fast exploration of variations — weighted toward the last two. They are split
into two specs:

1. **Generate (this spec)** — speed and variety. Describe, set constraints, get
   N prototypes. Geometry must be *sane* (nothing interpenetrates, nothing
   floats, limits respected) so that comparing variants compares designs rather
   than defects. **No joinery**: no `Cut` is ever generated.
2. **Refine / joinery (a later spec)** — takes an existing design and sharpens
   it: real joints, corrected dimensions, buildability. It reuses this round's
   LLM seam, schema, converter and checker, and extends rather than replaces
   them (§4.4 records the one check it must relax).

**Success for this round:** for a request like *"36in-wide bookcase, five
shelves, ¾ ply"*, each generation lands as a project whose parts touch where
they should, nothing floats or passes through anything else, the overall size
respects the limit, and the cut list reads believably. A prototype that still
carries a reported issue is acceptable output, not a failure (§4.5).

**Explicitly out of scope:** phase 2; a budget setting (board feet / sheet
count); "use what I have" stock; providers other than Claude; a preview picker
for variants; an eval set measuring design quality across many prompts (worth
doing before phase 2).

---

## 2. Decisions taken in the design discussion

| Question | Decision |
|---|---|
| What does one click produce? | 1–3 generations (a selector), each in **its own new project**. Comparison is the existing project switcher. |
| Providers | **Claude now, behind an `LlmClient` interface** — the `StorageAdapter` move applied to the network. A second provider is a second implementation. |
| How the model builds | **Whole-design submission + repair loop.** The model returns the complete part list; code checks it; violations go back; it resubmits. Not part-by-part tool calls (too many round trips for variety), not a relational constraint solver (a subsystem too large for phase 1). |
| Settings | Description, generations (1–3), max **Width × Depth × Height** (hard), primary material (soft), style (soft), detail level (soft, with a hard part cap). |
| Where finished designs go | **Into the project menu, not onto the screen.** Generation never adopts a project (§3.3). |

---

## 3. Architecture

### 3.1 Modules and layers

Two new top-level directories join the layer order, between `store`/`storage`
and `viewport`/`panels`:

- **`llm/`** — the provider seam. Imports nothing from the app.
- **`generate/`** — the run loop. Imports `document` and `llm`, nothing above.

| Module | Job | Pure? |
|---|---|---|
| `document/generated.ts` | `GeneratedDesign` / `GeneratedPart` types, the JSON schema the model fills, and `designToDocument` (§4.2). | yes |
| `document/designCheck.ts` | `checkDesign(doc, limits)` → `Violation[]`, each carrying a sentence the model can act on (§4.3). | yes |
| `llm/types.ts` | `LlmClient`, `LlmRequest`, `LlmResult`, `LlmError` with a closed `kind` (§5.4). | — |
| `llm/anthropic.ts` | The Claude implementation over `@anthropic-ai/sdk`. | — |
| `generate/prompt.ts` | The system prompt (fixed text) and the per-run user message built from settings. | yes |
| `generate/run.ts` | `runGeneration(client, settings, signal, onProgress)` — one generation's loop (§4.5). Returns the chosen document plus remaining violations and usage. | yes given a client |
| `panels/SettingsDialog.tsx` | API key, model. | — |
| `panels/GenerateDialog.tsx` | The settings form and the progress rows. | — |
| `App.tsx` | Owns the runs (a `useGenerations` hook beside `pending`/`switchToken`), the dialogs' open state, and the session-only `newIds` set. | — |

**`SNAP_INCHES` moves.** It lives in `viewport/Gizmo.tsx` today, and
`generated.ts` needs the same 1/16" — but `document` cannot import `viewport`.
It moves to `document/geometry.ts` and `Gizmo.tsx` imports it from there: one
home, not a second copy (invariant 13's shape).

### 3.2 Data flow for one click

1. `GenerateDialog` validates the form and calls `startGenerations(settings, n)`
   in `App`, which creates one `AbortController` and N run records, and starts
   N `runGeneration` calls concurrently.
2. Each run calls the model (§5), receives a `GeneratedDesign`, and passes it
   through `designToDocument` and then **the existing `migrateDocument`** before
   anything trusts it — the same gate an imported file goes through, so name
   and id dedupe (invariants 8, 33) and every validator default come for free.
3. `checkDesign` runs on the migrated document. Violations go back to the model;
   the loop repeats up to the repair limit (§4.5).
4. The chosen document is written with
   **`storage.createProject(doc, { activate: false })`**, its id added to
   `newIds`, and the project list refreshed.

### 3.3 Generation never adopts a project

A run takes tens of seconds to minutes, and up to three finish at unrelated
moments. Switching the user to each as it finished would yank them out of
whatever they were editing, three times. So a finished design waits in the
project menu with a **new** badge, and the dialog's row offers **Open**, which
calls the existing `openProject` — the only adopting path it uses.

Consequences, each of which is the point rather than a side effect:

- **Generation is not an adopting handler and must not bump `switchToken`.**
  Invariant 32's four handlers are untouched. A generation landing while a
  switch is in flight writes a new index row and nothing else; it cannot move
  the persisted `activeId`, because `activate: false` keeps that write out of
  `createProject` entirely.
- **The open project and its undo history are never touched.** No
  `replaceDocument`, no `edit()`, no gesture. The user can keep working.
- **`createProject` goes through `writeVerifiedProject`** (invariant 31), so a
  generated project cannot appear in the list without its key.

### 3.4 Cancellation

One **Cancel** aborts every in-flight run through the shared
`AbortController`. A cancelled or failed run writes nothing. A run that has
already written its project is finished and Cancel does not delete it.

Closing the dialog does **not** cancel: runs belong to `App`, the Toolbar shows
*Generating 2/3…* while any are live, and reopening the dialog shows the same
rows. Run state is in memory only — a page reload abandons live runs (their
requests die with the page) and writes nothing for them.

---

## 4. The model contract

### 4.1 The schema

The model's response is constrained by **structured output** to:

```ts
interface GeneratedDesign {
  name: string;                 // becomes doc.name, e.g. "Five-shelf bookcase"
  parts: GeneratedPart[];
}
interface GeneratedPart {
  name: string;
  material: MaterialKey;        // enum of Object.keys(MATERIALS)
  at: [number, number, number]; // min-corner, inches, Y up
  size: [number, number, number]; // extent along world X, Y, Z, inches
}
```

The model thinks in **world boxes**, never in Sloyd's
length/width/thickness + posture + rotation encoding. That encoding is ours to
derive, and taking it off the model removes a whole class of mistakes. The
schema is built from `MATERIALS` at module load, so a material added to the
table is offered to the model without a second edit.

### 4.2 Conversion — `designToDocument`

For each part, in order:

1. **Round** every `at` and `size` component to `SNAP_INCHES` (1/16").
   Invariant 25's rule read correctly: model output is a *free* value, like a
   drag, so it is rounded; an exact position or a difference of two is never.
   Rounding happens **before** the check, so the check sees exactly what is
   stored.
2. **Assign dimensions:** sort the three sizes; the largest is `length`, the
   smallest `thickness`, the middle `width`.
3. **Derive posture and rotation** so that `boardExtents(board)` equals the
   rounded `size`: whichever dimension sits on Y gives the posture (`thickness`
   → `flat`, `width` → `on-edge`, `length` → `upright`), and the remaining
   horizontal assignment gives `rotation` 0 or 90. Three postures × two
   rotations cover all six permutations, so this is **total** — every box
   converts. Ties (a square panel, a cube) admit several encodings with
   identical extents; any is correct, and the converter picks
   deterministically.
4. `grain = 'length'`, `cuts = []`, `position = at`.

Then the **whole design is translated** so its overall min-corner is at
`(x, 0, z)` with the footprint centred on the origin. Free to do, so "the
design is floating" or "the design is off to one side" is never a violation.

A part whose size has a component ≤ 0 after rounding is **not converted** — it
becomes a `too-small` violation (§4.3) carrying the part's name, and the rest
of the design proceeds. The document `name` is trimmed and falls back to
`Generated design` when blank; `migrateDocument` handles the rest.

### 4.3 The checks — `checkDesign`

All against the rounded, migrated boards. Tolerance `TOUCH = 1/32"`.

| Kind | Rule | Example message |
|---|---|---|
| `overlap` | Two boxes interpenetrate by more than `TOUCH` on **all three** axes. Faces touching is legal. | "*Shelf 3* passes 0.75in into *Left side* along X." |
| `unsupported` | Every part reaches the floor (`y = 0` within `TOUCH`) through a chain of **contacts** — two boxes in contact when their gap is ≤ `TOUCH` on one axis and their spans overlap by more than `TOUCH` on the other two. | "*Top* is not connected to the floor; nearest part is *Back*, 0.5in below." |
| `too-large` | The overall box fits each **set** limit: Width = X, Depth = Z, Height = Y. | "Overall height 74in exceeds the 72in limit." |
| `too-many-parts` | Part count ≤ the detail level's cap. | "38 parts; the limit is 30." |
| `too-small` | No size component under 1/8". | "*Trim strip* is 0.06in thick." |

Messages name parts by their **stored** names (post-dedupe), and say which
axis, so the model can act on them. Order is stable (kind, then part order) so
the same design always produces the same feedback.

Edge contact alone (spans overlapping on only one axis) does **not** count as
support — a box balanced on another's edge is a defect to report, not a joint.

### 4.4 The check phase 2 must relax

`overlap` is phase-1-only in its present form. In phase 2 a shelf entering a
side's dado is *correct*, so the rule becomes "interpenetration not accounted
for by a cut". Recorded here so phase 2 relaxes it deliberately rather than
discovering it.

### 4.5 The repair loop — `runGeneration`

- **Call 1:** system prompt (fixed) + one user message built from the settings.
- If `checkDesign` returns violations, a user message lists them and asks for
  the **whole** corrected design. At most **3 repair rounds — 4 calls total.**
- **Append-only history.** Each assistant response is appended **exactly as
  received** (its full `content`, including any thinking blocks) and nothing
  earlier is ever edited. Current models reject edited history that carries
  thinking blocks, and append-only is also what keeps the cached prefix valid.
- **Keep the best attempt:** the one with the fewest violations, ties to the
  later one. It is **saved even with violations remaining**, and the run
  reports them (§6.2). A flawed prototype is still a prototype; the user can
  fix it by hand or regenerate.
- An attempt that fails to produce a usable design — a response cut off at
  `max_tokens`, JSON that does not parse or does not validate against the
  schema, an empty `parts` — **counts as an attempt with an "unusable" result**.
  The model is told so and asked again, within the same budget. If no attempt
  ever yields a usable design the run fails.

### 4.6 The prompt

Fixed system prompt, in `generate/prompt.ts`, covering: the coordinate
convention (inches, Y up, `at` is the min-corner, `size` is world extent); that
parts touch face to face and must not interpenetrate (no joinery this round);
typical stock (¾" and 1½" solid, ¾" and ½" sheet goods; 96 × 48 sheets); what
each style means in proportions and part choices; and the detail levels'
intent. The per-run user message carries the description and the settings,
stated as constraints for hard ones and preferences for soft ones.

The system prompt contains **nothing per-run** — no date, no settings — so it
stays a cacheable prefix across a run's calls and across the N parallel runs.

---

## 5. The LLM seam

### 5.1 `LlmClient`

```ts
interface LlmClient {
  /** One call. Streams internally; resolves with the final result. */
  complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult>;
  /** Builds a user turn in this provider's message shape. */
  userTurn(text: string): LlmMessage;
}
interface LlmRequest {
  system: string;
  messages: LlmMessage[];      // opaque to run.ts beyond append
  schema: JsonSchema;          // the structured-output schema
}
interface LlmResult {
  json: unknown | null;        // parsed output, null if unusable
  unusable?: 'truncated' | 'unparseable';
  assistantTurn: LlmMessage;   // to append verbatim
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}
```

`LlmMessage` is opaque to `run.ts`: it appends what `complete` hands back and
builds user turns through a helper on the client. That is what lets a second
provider carry its own message shape.

### 5.2 `AnthropicClient`

- `@anthropic-ai/sdk`, constructed with the user's key and the SDK's explicit
  **browser opt-in** (which sends the direct-browser-access header).
- **Streaming**, resolved with the SDK's final-message helper — a large design
  plus thinking can outrun a non-streaming timeout.
- **Structured output** (`output_config.format`) carries the schema. Forced
  `tool_choice` is rejected by the current models with a 400, which is why this
  is not a forced tool call.
- **Thinking adaptive; effort fixed per model**, tuned during implementation
  and not exposed in the UI.
- **Prompt caching** on the system prompt.
- **Server-side refusal fallback** enabled (`fallbacks: "default"`), so a
  safety classifier mis-firing on a furniture request is retried on another
  model inside the same call. Stated to the user in the design discussion and
  on by default.
- **Models offered:** Claude Opus 5.5 (`claude-opus-5-5`, default) and
  Claude Sonnet 5.5 (`claude-sonnet-5-5`, about half the price). The exact
  request parameters are confirmed against the SDK and API docs at
  implementation time, not copied from this spec.

### 5.3 Cost display

Each run's `usage` is summed and converted to an **estimated** cost from a
per-model price table in `llm/anthropic.ts`, shown on the run's row as
*≈ $0.08*. Labelled as an estimate; the table is the one place to update when
prices change.

### 5.4 Errors

`LlmError.kind` is a closed set, mapped from the SDK's typed error classes —
never by string-matching messages.

| `kind` | Source | Behaviour |
|---|---|---|
| `auth` | 401 / 403 | **Every** run stops — "API key was rejected — check Settings." Letting the siblings fail identically is noise. |
| `rate-limit` / `overloaded` | 429 / 529 after the SDK's own retries | That run fails with the reason; siblings continue. |
| `refused` | `stop_reason: refusal` after the fallback | That run fails — "The model declined this request." |
| `network` | connection errors | That run fails. |
| `cancelled` | abort | That run ends quietly. |

`truncated` and `unparseable` are **not** errors — they are unusable attempts
inside the loop (§4.5).

---

## 6. UI

### 6.1 Toolbar

Two new buttons: **Generate…** and **⚙ Settings**. There is no settings
surface today; this is its first content. While any run is live the Generate
button reads **Generating 2/3…** and still opens the dialog.

### 6.2 Dialogs

Both are native `<dialog>` elements opened with `showModal()`, which makes the
rest of the page inert and handles Escape.

**Settings:** provider (Claude, fixed for now); API key (password field,
**Forget key**); model (Opus 5.5 / Sonnet 5.5); and one line: *"Stored in this
browser only. Anyone with access to this browser profile can read it."*

**Generate:**

| Field | Control | Hard / soft |
|---|---|---|
| Description | textarea, required | — |
| Generations | 1 / 2 / 3 | — |
| Max size | Width × Depth × Height, each optional, `parseLength` | **hard** |
| Primary material | `MATERIALS` labels + Any | soft |
| Style | Any, Shaker, Mission / Arts & Crafts, Modern / minimal, Farmhouse / rustic, Mid-century, Shop / utility | soft |
| Detail level | Simple / Moderate / Detailed — caps 12 / 30 / 60 | soft, **hard cap** |

Below the form, one row per run: *Designing…* → *Fixing 2 issues (round 1/3)…*
→ *Ready · Open* / *Ready · 1 issue · Open* / *Failed: reason*, with the cost
estimate. **Cancel** while any run is live. Generated projects are named from
the design's `name`, suffixed **— A / B / C** when more than one generation
was requested.

**Disabled states:** no key → the Generate button is replaced by *Set up your
API key*, linking to Settings; library unavailable (invariant 30's read-only
session) → Generate disabled with that reason, because a run would have
nowhere to write.

### 6.3 Project menu

A generated project carries a **new** badge until first opened. `newIds` is
session-only state in `App`, prop-drilled to `ProjectMenu` — not persisted,
not in the store.

### 6.4 Shortcuts — invariant 27

`showModal()`'s inertness cannot reach a `window` listener; that is invariant
27's whole point. So **"a dialog is open" joins `cutListOpen`** as a reason
`App`'s one keydown effect early-returns and `Viewport`'s `shortcutsSuspended`
is true. Without it, typing *"make it 36in wide"* in the description would
arm tools and seed the tape readout behind the dialog. No new `window`
listener is added.

---

## 7. Storage and the security policy

**One new key**, `sloyd.llm.v1` = `{ provider, apiKey, model }`, read and
written only through new `StorageAdapter` methods (`getLlmSettings`,
`setLlmSettings`, `clearLlmSettings`) — invariant 7's seam. It sits outside
the library index, is never part of a `SloydDocument`, and so can never reach
an export. A malformed value reads as "no key set", never as a throw.

**The security policy** gains one origin:
`connect-src 'self' https://api.anthropic.com`. The header comment's
*"no network calls of its own"* is rewritten to say exactly one kind of
outside call exists and only on an explicit user action. This is the first
third-party origin the app itself talks to, and the comment should say so.

**Rollback costs nothing at the document level.** No schema change,
`CURRENT_VERSION` stays 6, and a generated project is an ordinary project. A
pre-round build ignores `sloyd.llm.v1`.

---

## 8. Testing and verification

### 8.1 Unit tests

- **`generated.ts`:** for **all six** dimension permutations, the converted
  board's `boardExtents` equals the input `size` and its `position` equals the
  rounded `at` — the expectation comes from the existing `geometry.ts`, not
  from the converter (invariant 23's rule). Rounding, the floor/centre
  translation, tie cases (square panel, cube), the ≤ 0 → `too-small` path, and
  the schema's material enum equalling `MATERIALS`' keys.
- **`designCheck.ts`:** a pass and a fail fixture per kind, at the boundaries —
  faces touching is not an overlap, `TOUCH + ε` is; edge contact is not
  support; a **floating island** (two parts touching each other and nothing
  that reaches the floor) is flagged, which is the case a naive "touches
  something" rule passes. **Every check is mutation-tested.**
- **`run.ts` with a scripted fake `LlmClient`:** stops at 4 calls; keeps the
  fewest-violation attempt when a later one is worse; every request's history
  is a strict extension of the previous one; truncated and unparseable
  replies count as attempts; `auth` ends the run; an abort writes nothing.
- **`anthropic.ts`:** the error-kind table, built from the SDK's own error
  classes; the request shape (schema, streaming, caching, fallback, browser
  opt-in) against a mocked SDK.
- **Storage:** LLM settings round-trip; malformed reads as absent; an
  **exported** document's bytes never contain the key string.
- **`App` / panels:** a finished run calls `createProject(…, { activate: false })`
  and leaves the active project, the document and `past` untouched; it does not
  bump `switchToken`; shortcuts are suppressed while either dialog is open;
  disabled states for no key and an unavailable library.

### 8.2 Browser verification (dev server)

The dialogs, progress rows, **new** badge, and opening a generated project.
**One real generation per model using the user's key** — a few cents, so a
step the user approves rather than one taken unasked. Sample prompts and their
results go in `docs/browser-verification-generate.md`, with screenshots in
`docs/img/`, since the findings are spatial. The viewport is unchanged:
generated designs render through the existing path.

### 8.3 Production

Confirmed by bundle hash, as every round, plus a check that the
`Content-Security-Policy` header lists `https://api.anthropic.com`. Generation
is not exercised against production — it would not overwrite anything (it only
creates projects), but it spends money.
