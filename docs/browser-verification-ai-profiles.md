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
