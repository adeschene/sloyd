# Browser verification — AI bands (Generate and Refine author edge bands, fu 430 chunk 1)

Spec: `docs/superpowers/specs/2026-10-23-sloyd-ai-profiles-bands-design.md`. Branch `ai-bands`.

## Compile probe (Task 1, 2026-10-23; spec §2.3, fu 322)

- **Where and how:** dev server (`npx vite --port 5199`), Playwright MCP, same method as the AI-holes probe. `sloyd.llm.v1`
  checked for presence only; the key was read into the request header in page JS, never returned or printed. Schema built in
  the page: `designSchema(catalogOf({ materials: [Baltic birch m-v-11rosydxpx (sheet), Ash m-s-t7721mpmxm (solid)] }),
  [BUILT_IN_BAND, Maple edging id_probe_band (solid, 1/4in, material the Ash id)])`. The `edging` enum had 8 keys.
- **Request:** `POST /v1/messages?beta=true`, model `claude-opus-5-5`, `anthropic-beta: server-side-fallback-2026-07-01`,
  `fallbacks: 'default'`, adaptive thinking, `output_config` effort medium with the json_schema, `SYSTEM_PROMPT` cached,
  one user turn, `max_tokens: 16`.
- **Result: REFUSED.** HTTP 400 `invalid_request_error`, "The compiled grammar is too large, which would cause performance
  issues." Request id `req_011CgJpd3fNoqKzSmffAtj5M`. Schema 3,267 chars (AI-holes Refine form: 2,952). No tokens billed.
- **Probes used:** 1 of 10. Task 1 stopped as BLOCKED; no fallback tried (spec §2.3's fallbacks are for the profiles chunk's
  fields, not bands).

## Compile probe, second form (Task 1, controller ruling 3)

`vec3` moved into `$defs.vec3` and referenced from `at`, `size`, the hole `offset` and the placements' `at`; `bands` and its
`edging` enum unchanged. Same method, same Refine-form schema (custom Ash solid, custom Baltic birch sheet, built-in and
Maple edging band types), `max_tokens: 16`.

- **Result: compiled (form 0 of the ruling's list, (a)).** HTTP 200, `req_011CgJpkiPjQyZQA8DGccLtW`, stop `max_tokens`.
  Schema 2,911 chars (the refused form was 3,267). Tokens: 25 in uncached + 5,122 cache write, 16 out (all thinking).
- **Probes used:** 2 of the 10 (one refused, one passed). Fallback (b) was not needed.
- **Pinned:** `src/document/fixtures/design-schema-builtin.json` re-captured, verified equal to the old bytes with `vec3`
  moved to `$defs` (and referenced) plus `bands` (enum: veneer and the five built-in solid species) and nothing else.

## Headroom probe (final review I2, after the merge `e7ce893`)

The largest Refine schema among the dev projects was 2,854 chars (below the probed 2,911), so a deliberate upper bound was
probed instead: 4 custom solid materials, 2 custom sheet materials, the built-in band and 4 custom solid band types (13
catalog materials, 15 `edging` keys). **Compiled:** HTTP 200, `req_011CgJwrsfp1mB62kYTJvpiK`, stop `max_tokens`, 3,114
chars; 14 in + 5,502 cache write, 16 out. Probes used: 3 of 10.

## Live checks after the merge (2026-10-23, master `e7ce893`)

Dev server `:5199`, the user's profile, Playwright MCP (the user able to watch); key checked for presence only; no
`localStorage.clear()`; test projects left in place. Readouts: the active project through `migrateDocument` →
`flatDocument` → `boardExtents` / `worldBands`, band type names from the document. No screenshots kept.

1. **Generate "a plywood bookcase with oak edging". PASS** (≈ $0.07; `Plywood Bookcase with Oak Edging`, `id_mvks4gwj_e`).
   One type minted, `Oak edging` (solid oak, 0.25). Banded `+z` (the front): Left/Right side, Bottom, Shelf 1–4, Top (also
   its exposed `-x`/`+x` ends, which overhang the sides). Back panel at z −6..−5.5 (the smallest z), unbanded; toe kick
   unbanded; no band on an edge that meets a part.
2. **Generate "a painted plywood wall cabinet". PASS** (≈ $0.06; `id_mvks65ej_s`). Veneer only, nothing minted: front
   edges of the sides, top, bottom and shelf; all four edges of each door; back unbanded.
3. **Refine `Live — edged bookcase` "make it 6 inches taller". PASS** (≈ $0.04; `id_mvks8wam_x`). `bandTypes` identical
   (`Iron-on veneer`, `Maple edging 0.75` solid maple 0.75); every band identical (sides `-z` Maple, shelf `-z` veneer);
   nothing minted. Change list: the three resize lines only, no edging line. (The project predates the front-is-+z
   prompt, so its front is −z; the bands stay where they were.)
4. **Refine run 1's result "remove the edging from the shelves". PASS** (≈ $0.06; `id_mvksag6g_1a`). Change list:
   `Shelf 1: edging on the front edge removed` … `Shelf 4: …`; every other band unchanged; `bandTypes` unchanged.

Paid calls: 3 probes + 4 runs = 7 of 10 (≈ $0.23 for the runs).
