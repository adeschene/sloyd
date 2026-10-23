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
