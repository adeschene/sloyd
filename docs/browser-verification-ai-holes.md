# Browser verification — AI holes (Generate and Refine author hole rows, fu 329)

Spec: `docs/superpowers/specs/2026-10-23-sloyd-ai-holes-design.md`. Branch `ai-holes`.

## Compile probe (Task 1, 2026-10-23; spec §2.2, fu 322)

The schema with the new required `holes` array (spec §2.1's form: `face`, `diameter`, `depth`, `through`, `offset`,
`toward`, `count`, `pitch`; `face`/`toward` reference the `dir` `$def`; `offset` is the inline `vec3`) was compiled live
before anything else was built on it.

- **Where and how:** the dev server (`npx vite --port 5199`, `localhost:5199`), Playwright MCP. From inside the page, the
  stored `sloyd.llm.v1` was checked for presence only and its key read into the request header in page JS (never
  returned or printed). The schema was built in the page from the source modules: `designSchema(catalogOf({ materials:
  [Baltic birch m-v-11rosydxpx (sheet), Ash m-s-t7721mpmxm (solid)] }))` — Refine's form, enum = the seven built-ins + the
  two custom ids.
- **Request:** `POST https://api.anthropic.com/v1/messages?beta=true`, the same body shape `AnthropicClient.complete`
  sends: model `claude-opus-5-5` (the stored setting Refine uses), `anthropic-beta: server-side-fallback-2026-07-01`,
  `fallbacks: 'default'`, `thinking: { type: 'adaptive' }`, `output_config: { effort: 'medium', format: { type:
  'json_schema', schema } }`, `system` = `SYSTEM_PROMPT` with `cache_control: ephemeral`, one user turn — with
  `max_tokens: 16` in place of 32000.
- **Result: compiled on the first probe (form 0, no fallback needed).** HTTP 200, `req_011CgJGkuYyCJ51nxdbdHDTn`, stop
  `max_tokens`. Schema 2,952 chars (Generate's built-in form: 2,918 chars, against 2,372 before holes). Tokens: 40 in
  uncached + 4,461 cache write, 16 out (all thinking).
- **Probes used:** 1 of the 10 paid runs pre-approved for this feature.
- **Pinned:** `src/document/fixtures/design-schema-builtin.json` was re-captured to the new bytes (verified equal to the
  old bytes plus `holes` and nothing else); its test names this probe.

This probe exercised the grammar compile only, not the model's hole output; the output is checked by the live runs recorded after the merge.

## Live checks after the merge (2026-10-23, master 424c184)

**Dev server:** `npx vite --port 5199`, the user's profile, driven through the Playwright MCP (the user able to watch).
`sloyd.llm.v1` was checked for presence only (model `claude-opus-5-5`). The key was never read into the chat. No
`localStorage.clear()` was run, and the test projects were left in place, as ruled 2026-10-17.

**Method.** Every result below is a DOM or `localStorage` readout. No screenshots were kept. To read each call's usage and
the model's raw design, `AnthropicClient.prototype.complete` was wrapped IN THE PAGE ONLY (the module was imported from
`/src/llm/anthropic.ts`; no source file changed). The wrapper recorded `usage`, `req.system.length`,
`JSON.stringify(req.schema).length`, the user turns' character counts and `json` on `window`. Stored rows were read
through `migrateDocument` → `flatDocument`, then `worldHoles` and `holeFaults`, imported from the dev server's own modules.

**Fixture: Live — AI holes cabinet** (checks 4 and 5). It was written by throwaway vitest code (deleted, not committed)
to `.playwright-mcp/ai-holes-cabinet.sloyd.json` and imported through ⬆ Import…. Before import it passed through
`migrateDocument`, which kept every row byte-identical. `holeFaults` was empty for every row, `checkDesign` returned `[]`
and `holeDesignFaults` returned `[]`.
- **Left side** (`ls`): 30 × 12 × 3/4, upright, turned 90, at x 0. Its inner face is +x (thickness max). It has two
  rows, both measured from the max end (the top): `alongFrom: 'max'`, station 6, 12 holes at 1-1/4" pitch, 1/4" ×
  3/8".
  - `hA`: `acrossFrom: 'min'`, inset 2.
  - `hB`: `acrossFrom: 'min'`, inset 10. This row is measured from its FARTHER side.
- **Right side** (`rs`): the same part at x 23.25. Its inner face is -x (thickness min). It has two metric rows from the
  max end: diameter 5/25.4, depth 10/25.4, station 160/25.4, 10 holes at pitch 32/25.4.
  - `hC`: `acrossFrom: 'max'`, inset 2.
  - `hD`: `acrossFrom: 'max'`, inset 10. This row is measured from its farther side.
- **Bottom** 22-1/2 × 11-1/4, **Top** 24 × 12-1/2, and **Door** 28 × 22-1/2 (inset between the sides). None of them has
  holes.

### 1. Generate "a bookcase with adjustable shelves" (paid). PASS

- **Settings:** 1 generation, Moderate. The run took 30 s and the done view reads "Ready, ≈ $0.07". There is no issue
  list. The result was opened as **Bookcase with Adjustable Shelves** (`id_mvkg0l4t_g`).
- **The model's design:** Left side 0.75 × 72 × 12 at x 0, and Right side at x 35.25. Each side has two rows:
  - Left side, face `+x`: offsets (0.75, 8, 2) and (0.75, 8, 10).
  - Right side, face `-x`: offsets (0, 8, 2) and (0, 8, 10).
  - Every row: `toward +y`, 45 holes at pitch 1.25, 0.25 × 0.375, `through: false`.
  - The other 7 parts (toe kick, bottom, top, back, three shelves) have `holes: []`.
- **Inside faces: yes.** `worldHoles` of the stored, resolved parts gives:
  - Left side (upright/90): `+x` (its inner face, toward the case).
  - Right side (upright/270): `-x`.
  - Both have offsets z 2 and z 10, y 8, `toward +y`. `holeFaults` is `[]` on all four rows.
- **Linked: yes.** Both sides use ONE Shape, `id_mvkg0l4f_e` (72 × 12 × 3/4), at rotations 90 and 270: the two mirror
  images link through a 180° turn (spec §5). The three shelves are a second Shape.
- **Stored rows** (on the Shape; schema 20). Both rows share these fields: `face: thickness`, `from: max`, diameter
  0.25, depth 0.375, `along: length`, `alongFrom: min`, station 8, count 45, pitch 1.25. They differ only in the across
  side:

  | id | `acrossFrom` | `inset` |
  |---|---|---|
  | `id_mvkg0l4d_1` | `max` | 2 |
  | `id_mvkg0l4d_2` | `min` | 2 |

  So both rows are stored from the min end, each measured from its nearer side (spec §3.1).
- **Change list and issues:** Generate has no change list. The done view shows no issues, and no rejected part.

### 2. Generate "a metric 32 mm system bookcase with shelf pins" (paid). PASS

- The run took 31 s and the done view reads "Ready, ≈ $0.05". The result was opened as **32 mm System Bookcase**
  (`id_mvkg2toz_10`).
- **The model wrote** diameter `0.197` and pitch `1.26` (the prompt's §6 words). Each side has two rows: on `+x` (Left)
  and `-x` (Right), offsets y 6 and z 2 / z 9.25, 50 holes, depth 0.375, `toward +y`.
- **Stored on ONE Shape** (`id_mvkg2ton_y`, 72 × 11-1/4 × 3/4), used by Left side (90) and Right side (270), so the sides
  are **linked**. Both rows:
  - diameter `0.1968503937007874`: `=== 5/25.4` is **true**;
  - pitch `1.2598425196850394`: `=== 32/25.4` is **true**;
  - depth 0.375 and station 6 stay imperial, because 3/8" is nearer the 1/64" grid;
  - insets: `max` 2 and `min` 2.
- **Note (not a fault):** the project's display units stay imperial. The design format carries no units, so a "metric"
  request does not switch the display.

### 3. Refine bookcase 1 with "move the shelf pins 1 inch closer to the front" (paid). PASS

- The run took 13 s. Done view: "≈ $0.03", "Saved as 'Bookcase with Adjustable Shelves — refined'"
  (`id_mvkg4clc_1h`), "0 new issues · 0 already present".
- **Change list** (hole lines present):
  - "Left side: 45 holes added on +x, 1/4" Ø" (×2)
  - "Left side: hole row on +x removed" (×2)
  - "Left side is no longer linked"
  - the same four kinds of line for Right side, on -x.
- **The rows moved 1" toward the front.** The back panel is at the +z side (model z 11.25), so the front is -z. The model
  returned offsets z 1 and z 9 (from z 2 and z 10) on both sides, with y, count, pitch, diameter and depth unchanged.
  Stored rows:
  - Left (90): `max`/inset 1 and `min`/inset 3.
  - Right (270): `max`/inset 3 and `min`/inset 1.
  - Every row is station 8, from min, 45 at 1.25. `worldHoles` reads z 1 and z 9 on both sides, and `holeFaults` is `[]`.
- **Unlinking is correct, and the change list states it.** Rows at z 1 and z 9 are not symmetric about the side's
  centre (z 6), so the left and right sides are now true mirror images that no quarter turn about Y can make equal.
  Sloyd's turns are about Y only. The stored rows above confirm it: the left side's `max` 1 corresponds to the right
  side's `min` 1. The spec's anti-goal (holes moved to the outside faces, or sides unlinked WITHOUT saying so) is not
  met: the pins stay on the inside faces and the change is listed.
- **The other parts are unchanged.** Against the original, through `flatDocument`:
  - Toe kick, Bottom, Top, Back and Shelf 1–3: every field but `id` is identical (posture, rotation, size and position
    included), and `holes` is identical (empty).
  - The shelves are still one Shape (re-minted id).
  - On the sides, only `id`, `shape` (now plain parts) and `holes` differ.

### 4. Echo exactness: Refine **Live — AI holes cabinet** with "make the top 1 inch thicker" (paid). PASS

- The run took 12 s. Done view: "≈ $0.02", "Saved as 'Live — AI holes cabinet — refined'" (`id_mvkg75yn_1o`), "0 new
  issues · 0 already present".
- **Change list:** one line, "Top: 24" × 12-1/2" × 3/4" → 24" × 12-1/2" × 1-3/4"". There are **no hole lines**.
- **Stored rows are byte-identical**, ids included: `JSON.stringify(original.holes) === JSON.stringify(result.holes)` is
  true on all five parts.
  - `hA`/`hB` are still `alongFrom: 'max'`, station 6, `acrossFrom: 'min'`, insets 2 and 10.
  - `hC`/`hD` are still `alongFrom: 'max'` and `acrossFrom: 'max'`, insets 2 and 10. Their diameter, depth, station and
    pitch are `=== 5/25.4, 10/25.4, 160/25.4, 32/25.4`: all true.
  - The model echoed the metric rows with full-precision floats (for example offset y `12.362204724409448`, pitch
    `1.2598425196850394`). The exact-row map restored the max-end, far-side encodings.
- **Every other field:** only the part `id` (re-minted on every Refine) and the Top's `thickness` (0.75 → 1.75) differ.

### 5. Refine **Live — AI holes cabinet** with "add a knob hole to the door" (paid). PASS

- The run took 16 s. Done view: "≈ $0.03", "Saved as 'Live — AI holes cabinet — refined'" (a second project of that
  name, `id_mvkg88wn_1v`), "0 new issues · 0 already present".
- **Change list:** "Door: 1 hole added on +z, 3/16" Ø".
- **The model wrote:** face `+z`, diameter 0.1875, `through: true`, offset (21, 15, 0.75), `toward -y`, count 1, pitch 0.
- **Stored on the Door** (upright/0, 28 × 22-1/2 × 3/4): `{ face: thickness, from: max, diameter: 0.1875, depth:
  'through', along: length, alongFrom: min, station: 15, count: 1, pitch: 0, acrossFrom: max, inset: 1.5 }`.
  - That is a 3/16" through hole 15" up the door and 1-1/2" in from its +x edge.
  - `toward -y` on a single hole was canonicalised to `+y`.
  - `holeFaults` is `[]`.
- **The other rows are identical:** the four side rows (`hA`–`hD`) are byte-identical, ids included. Every other field on
  every part is identical too, except part ids.

### 6. CHARS_PER_TOKEN re-measure. PASS (2 holds)

The cached prefix is `SYSTEM_PROMPT` (7,827 chars) plus Generate's schema (2,918 chars), 10,745 chars in all. It was a
5,057-token cache write on run 1 and a 5,057-token cache read on every later run. Refine's schema is the same length
here, because no project has custom materials.

| Run | Text | Chars | Tokens | Chars/token |
|---|---|---|---|---|
| Generate 1 | prefix | 10,745 | 5,057 | **2.12** |
| Generate 1 | user turn | 163 | 66 | 2.47 |
| Generate 1 | prefix + message | 10,908 | 5,123 | 2.13 |
| Generate 2 | user turn | 175 | 72 | 2.43 |
| Refine 3 | user turn, with the design JSON | 2,678 | 1,416 | **1.89** |
| Refine 4 | user turn | 1,981 | 992 | 2.00 |
| Refine 5 | user turn | 1,981 | 990 | 2.00 |

`estimate.ts`' `CHARS_PER_TOKEN = 2` stays. The prefix runs about 6% fewer tokens than estimated, which is toward the
larger bill. A design-heavy Refine message runs about 6% more tokens than estimated. Both are inside the 1.9–2.3 band
recorded in 2026-10-09's measurement, and the per-run ranges shown cover the observed costs.

### Paid runs and costs

Each cost is computed from `usage` at the price table (Opus 5.5: $4 in, $20 out, $0.20 cache read, $5 cache write), with
the done view's figure in brackets:

| Run | Input | Cache write | Cache read | Output | Cost |
|---|---|---|---|---|---|
| Compile probe (Task 1) | 40 | 4,461 | — | 16 | $0.023 |
| 1. Generate bookcase | 66 | 5,057 | — | 2,450 | $0.075 [≈ $0.07] |
| 2. Generate 32 mm bookcase | 72 | — | 5,057 | 2,281 | $0.047 [≈ $0.05] |
| 3. Refine move pins | 1,416 | — | 5,057 | 1,396 | $0.035 [≈ $0.03] |
| 4. Refine top thicker | 992 | — | 5,057 | 944 | $0.024 [≈ $0.02] |
| 5. Refine knob hole | 990 | — | 5,057 | 1,243 | $0.030 [≈ $0.03] |

Every run took one call and no repair round.

**Total: 6 of the 10 pre-approved paid runs (the probe plus 5), ≈ $0.23.**

### Owed to the user (real hardware, by eye)

- **Bookcase with Adjustable Shelves:** the two 45-hole pin rows on the INSIDE faces of both sides, 2" from front and
  back, in the viewport and on the Plans sheet (callout letters).
- **32 mm System Bookcase:** the 5 mm rows at 32 mm.
- **Whether the check 3 result reads right.** "move the shelf pins 1 inch closer to the front" moved BOTH rows 1" toward
  the front, leaving the back row 3" from the back. The sides then stop linking, and the change list says "is no longer
  linked". Is that what a woodworker would expect, or should the change list say why?
- **Live — AI holes cabinet — refined (the knob):** the 3/16" knob hole on the Door, 15" up and 1-1/2" from its +x edge.
  The fixture has no hinges, so "the opening edge" was the model's choice.
- **The change-list wording:** "45 holes added on +x, 1/4" Ø" names a world face (+x), not "inside face".
