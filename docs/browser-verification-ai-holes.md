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
