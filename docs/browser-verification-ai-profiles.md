# Browser verification — AI edge profiles (fu 430, chunk 2)

Spec: `docs/superpowers/specs/2026-10-23-sloyd-ai-profiles-bands-design.md` ("Chunk 2, revised", R1–R6). Branch `ai-profiles`.

## Compile probe of the final schema (Task 1, 2026-10-23; spec R1, R5; fu 322)

The FINAL design form: the four angle arrays merged into one `angles` array (`kind`, `dirs`, `toward`, `values`; spec R2)
and the new `profiles` array (`edge`, `kind`, `size`, `fillet`, `depth`, `facing`, `allRound`, `start`, `end`; spec §2.1),
every field required, `additionalProperties: false`, `dir` and `vec3` referenced from `$defs`.

- **Where and how:** dev server (`npx vite --port 5199 --strictPort`), Playwright MCP, the same method as the AI-holes and
  AI-bands probes. `sloyd.llm.v1` checked for presence only; the key was read into the request header in page JS, never
  returned or printed; no `localStorage.clear()`. Schema built in the page from the source modules:
  `designSchema(catalogOf({ materials: [Baltic birch m-v-11rosydxpx (sheet), Ash m-s-t7721mpmxm (solid)] }),
  [BUILT_IN_BAND, Maple edging id_probe_band (solid, 1/4in, material the Ash id)])` — Refine's form, 8 `edging` keys
  (the AI-bands probe's customs).
- **Request:** `POST https://api.anthropic.com/v1/messages?beta=true`, the body shape `AnthropicClient.complete` sends: model
  `claude-opus-5-5` (the stored setting), `anthropic-beta: server-side-fallback-2026-07-01`, `fallbacks: 'default'`,
  adaptive thinking, `output_config` effort medium with the json_schema, `SYSTEM_PROMPT` cached, one user turn,
  `max_tokens: 16`.
- **Result: compiled.** HTTP 200, `req_011CgK3FpwL6Fshe5BsSWfuC`, stop `max_tokens`. Schema 2,800 chars (R1's probe of this
  form: 2,805; the shipped AI-bands Refine form: 2,911). Tokens: 13 in uncached + 5,262 cache write, 16 out (all thinking).
  Generate's built-in form is 2,727 chars.
- **Probes used:** 1 of the 10 paid runs pre-approved for this round.
- **Pinned:** `src/document/fixtures/design-schema-builtin.json` re-captured; verified mechanically equal to the old bytes
  (key order included) once the four angle keys are removed from the old and `angles` and `profiles` from the new, in both
  `properties` and `required`.

This probe exercised the grammar compile only, not the model's output; the angle re-check (Task 2) and the profile runs
follow.

## Angle re-check after the merge into `angles` (Task 2 Step 6; spec R4 gate)

Dev server `:5199`, the user's profile, Playwright MCP; key presence only; no `localStorage.clear()`; test projects left.
Readouts through `migrateDocument` → `flatDocument` → `worldTapers` / `worldAngles` and the stored `angleCuts`.

1. **Generate "a Shaker side table". PASS** (≈ $0.07; `id_mvkvb6mo_o`). Four legs tapered on their two INSIDE faces toward
   `-y`, start 20, amount 0.375, by corner exactly as the prompt's rule: back-left `+x,+z`, back-right `-x,+z`, front-left
   `+x,-z`, front-right `-x,-z`. Top: 1/8in chamfers on its four top edges.
2. **Generate "a picture frame". PASS** (≈ $0.03; `id_mvkvc30q_17`). Every rail and stile mitered 45° at both ends, long point
   OUTSIDE (top rail `-z`, bottom `+z`, left stile `-x`, right `+x`); an inner top-edge chamfer on each.
3. **Refine run 1 "make it 2 inches taller". PASS** (≈ $0.03). Change list: the four legs 25-1/4 → 27-1/4, aprons and top
   moved Y +2". Every angle cut's stored fields (kind, face, from, along, alongFrom, points) identical before and after; the
   world readings identical; only ids are fresh, as before this round (angle cuts have no id-restoring map; holes do).

No regression in the model's angle output; the round continues to profiles. Paid calls so far: 1 probe + 3 runs = 4 of 10.

## Live profile checks after the merge (2026-10-23, master `30f1299`)

Dev server `:5199`, the user's profile, Playwright MCP; key presence only; no `localStorage.clear()`; test projects left.
Readouts through `migrateDocument` → `flatDocument` → `worldProfiles` and the stored `profiles`.

1. **Generate "a cherry side table with a rounded-over top". PASS** (≈ $0.06; `Cherry Side Table`, `id_mvldj1mk_l`). Top
   20 × 20 × 3/4: one 1/4in roundover, face `max` (the top), run `{ loop: true }` (world `edge` `+y/+x`, `allRound`). No
   other part profiled; legs tapered as before (2 angle cuts each).
2. **Refine "add a cove to the top's front edge". PASS** (≈ $0.04; `id_mvldlujd_16`). Change list: `Top: 3/8" cove added
   on the bottom/front edge` (the model put it under the front edge, where the top face already has the loop). Stored: face
   `min`, side width/max, BOTH ends THROUGH (Review Focus 2: no `stop-off`); the loop returned with its id and every field
   identical; every part's angle cuts, size, pose and frame identical.
3. **Refine echo "make it 2 inches taller" on a project with a stopped and a two-side profile. PASS** (≈ $0.04;
   `id_mvldq974_1q`). Fixture (the run-1 project, edited through the store): Top + a 3/8in cove on its underside front edge
   stopped 2 from min to 3 from MAX (world 2–17), beside the loop; the four aprons' shared Shape + a two-side run (width min
   at 8 round to length max at 2; carried, `worldProfiles` null). Change list: the four leg resizes and five moves only, no
   profile line. Every part's stored `profiles` byte-identical (ids included), the Shape's two-side run identical, angle
   cuts and frames identical (Review Focus 1).

Paid calls: 1 probe + 3 angle runs + 3 profile runs = 7 of 10 (≈ $0.14 for the profile runs).
