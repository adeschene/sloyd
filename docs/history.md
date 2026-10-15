# Sloyd — round history

> Split out of `CLAUDE.md` on 2026-08-14, when that file passed 195KB. Everything here
> is the **record**, verbatim as it was written at the time: what each round did, why,
> and what each deploy could and could not confirm. `CLAUDE.md` keeps the rules that
> govern new work (invariants, architecture, the module tree); this file keeps the
> reasoning behind them.
>
> Two rounds have **no design spec** and exist only here — the **type-anywhere** round
> and the **empty-solids placeholder**. Do not treat their sections as summaries of a
> document elsewhere; they are the document.
>
> Prohibitions that were embedded in these narratives have been promoted into
> `CLAUDE.md`'s invariants. Where the two disagree, `CLAUDE.md` wins — this file is not
> maintained.

---

## Deployment record

**Production matches `master` as of 2026-10-15 with curves chunk 1 live** (`index-D4nh2vvL.js`, CSS `index-B_EfuaB_.css`,
merge `54ea740`, **schema 17** — a rollback to fu 357, `7f851f9` / `index-BZDp6iOz.js`, refuses projects saved since; export
first). Merged on the user's word (4374 tests across 148 files, build clean on the merged tree; branch deleted). Verified per the
deployment rule: `200` on a deep route at the edge; bundle and CSS match `dist/` in-network (via `127.0.0.1`) and at the edge;
the old bundle `index-BZDp6iOz.js` 404s in-network; CSP `connect-src 'self' https://api.anthropic.com` at the edge; a
real-browser load (0 errors, the Cloudflare beacon and "+ Add board" present; its fresh project stored as `version: 17`; the
load's two keys cleared from a plain asset page and read back empty after 3s, then navigated away).

**Production matches `master` as of 2026-10-14 with holes chunk 2 live** (`index-DFCdm3n1.js`, CSS `index-CT8doMkT.css`,
merge `d74e5c5`, schema 16 unchanged — a rollback to chunk 1, `index-CTpNZw9F.js`, is free). Verified per the deployment
rule: `200` on `/` and a deep route in-network and at the edge; bundle and CSS match `dist/` at both; the old bundle 404s
in-network; CSP `connect-src 'self' https://api.anthropic.com` at the edge; a real-browser load (0 errors, the Cloudflare
beacon and "+ Add board" present; its fresh project stored as `version: 16`; the load's two keys cleared from a plain asset
page and read back empty immediately and after 3s, then navigated away).

**Production matches `master` as of 2026-10-14 with holes chunk 1 live** (`index-CTpNZw9F.js`, CSS `index-gw2MZHzH.css`,
merge `2ded5cc`, **schema 16** — a rollback to `bfde00c` refuses projects saved since; export first). Verified per the
deployment rule: `200` on `/` and a deep route in-network and at the edge; the bundle and CSS match `dist/` at both; the old
bundle `index-qj1aqsa6.js` 404s in-network; CSP `connect-src 'self' https://api.anthropic.com` at the edge; a real-browser
load (0 errors, the Cloudflare beacon and "+ Add board" present; its fresh project stored as `version: 16`; the load's two
keys cleared from a plain asset page and read back empty immediately and after 3s, then navigated away). Checked on the dev
server (`docs/browser-verification-holes.md`).

**Production matches `master` as of 2026-10-14 with custom materials chunk 2 live** (`index-qj1aqsa6.js`, CSS
`index-DmVXKxYH.css`, merge `bfde00c`, schema 15 unchanged). Verified per the deployment rule: in-network and edge `200`s, the
bundle hash at both, the old bundle 404, the CSP's `connect-src`, a real-browser load (0 errors; storage cleared, read back empty).

**Production matches `master` as of 2026-10-14 with custom materials chunk 1 live** (`index-DyeArqLP.js`, CSS
`index-D82WvZxV.css`, merge `4851945`, **schema 15** — a rollback below it refuses projects saved since; export first). Verified
per the deployment rule: in-network and edge `200`s, the bundle hash at both, the old bundle 404, the CSP's `connect-src`, a
real-browser load (0 errors; its fresh project stored as version 15; the origin's storage cleared and read back empty).

**Production matches `master` as of 2026-10-14 with AI angles chunk 2 live** (`index-D6x3XODA.js`, CSS `index-S14NxOeA.css`
unchanged, merge `a4914f1`, **schema 14**). Verified: `200` on `/` and a deep route in-network and at the edge; bundle matches
`dist/` at both; `index-DQwrQ8u9.js` 404s in-network; CSP unchanged; a real-browser load with 0 errors, the Cloudflare beacon
and "+ Add board" present; the load's two fresh keys (`version: 14`) cleared and read back empty after 3s, then navigated
away. Checked on the dev server with two paid runs (`docs/browser-verification-ai-angles.md`, "Chunk 2").

**Production matches `master` as of 2026-10-13 with AI angles chunk 1 live** (`index-DQwrQ8u9.js`, CSS `index-S14NxOeA.css`
unchanged, merge `be4c87c`, **schema 14**). Verified: `200` on `/` and a deep route in-network and at the edge; bundle matches
`dist/` at both; `index-CUVCRzP9.js` 404s in-network; CSP unchanged; a real-browser load with 0 errors, the Cloudflare beacon
and "+ Add board" present; the load's two fresh keys (`version: 14`) cleared and read back empty after 3s, then navigated
away. Checked on the dev server (`docs/browser-verification-ai-angles.md`).

**Production matches `master` as of 2026-10-13 with standard views + image export live** (`index-CUVCRzP9.js`, CSS
`index-S14NxOeA.css`, merge `353dd60`, **schema 14**). Verified: `200` on `/` and a deep route in-network and at the edge;
bundle and CSS match `dist/` at both; `index-B11-8iMQ.js` 404s in-network; CSP unchanged; a real-browser load with 0 errors,
the Cloudflare beacon, "+ Add board", "Save image" and the four view buttons present; the load's two fresh keys (`version:
14`) cleared and read back empty after 3s, then navigated away. Checked on the dev server
(`docs/browser-verification-standard-views-image.md`); a saved PNG and the View group's wrap still owe the user a look on
real hardware (fu 319, 320).

**Production matches `master` as of 2026-10-13 with fu 302/303 live** (`index-B11-8iMQ.js`, CSS `index-BkjfVfaC.css`
unchanged, merge `2a19279`, **schema 14**). Verified: `200` on `/` and a deep route in-network and at the edge; bundle matches
`dist/` at both; `index-DtBsK7RB.js` 404s in-network; CSP unchanged; a real-browser load with 0 errors, the Cloudflare beacon
and "+ Add board" present; the load's two fresh keys (`version: 14`) cleared and read back empty after 3s, then navigated
away. Unit-tested only (the checks have no UI of their own).

**Production matches `master` as of 2026-10-13 with turned links live** (`index-DtBsK7RB.js`, CSS `index-BkjfVfaC.css`
unchanged, merge `3e7474f`, **schema 14**). Verified: `200` on `/` and a deep route in-network and at the edge; bundle matches
`dist/` at both; `index-Cu_W4spT.js` 404s in-network; CSP unchanged; a real-browser load with 0 errors, the Cloudflare beacon
and "+ Add board" present; the load's two fresh keys (`version: 14`) cleared and read back empty after 3s, then navigated
away. Feature verified on the dev server (`docs/browser-verification-ai-tapers.md`, "Turned links"), free.

**Production matches `master` as of 2026-10-13 with fu 313's fixes live** (`index-Cu_W4spT.js`, CSS `index-BkjfVfaC.css`
unchanged, commit `db13999`, **schema 14**). A non-finite taper number is rejected in taper words; the prompt's typical-start
sentence reworded; the rest is tests. Verified: `200` on `/` and a deep route in-network and at the edge; bundle matches
`dist/` at both; `index-CV1sw3YE.js` 404s in-network; CSP unchanged; a real-browser load with 0 errors, the Cloudflare beacon
and "+ Add board" present; the load's two fresh keys (`version: 14`) cleared and read back empty after 3s, then navigated
away. Unit-tested only.

**Production matches `master` as of 2026-10-13 with fu 310's fix live** (`index-CV1sw3YE.js`, CSS `index-BkjfVfaC.css`
unchanged, commit `721cfba`, **schema 14**). Refine's change list diffs tapers face by face at display precision. Verified:
`200` on `/` and a deep route in-network and at the edge; bundle matches `dist/` at both; `index-iDivrN-T.js` 404s in-network;
CSP unchanged; a real-browser load with 0 errors, the Cloudflare beacon and "+ Add board" present; the load's two fresh keys
(`version: 14`) cleared and read back empty after 3s, then navigated away. Unit-tested only.

**Production matches `master` as of 2026-10-13 with fu 311's fix live** (`index-iDivrN-T.js`, CSS `index-BkjfVfaC.css`
unchanged, commit `158b2b6`, **schema 14**). An unjoined Refine lists its taper fault once, in the person's words. Verified:
`200` on `/` and a deep route in-network and at the edge; bundle matches `dist/` at both; `index-DWTxNeO6.js` 404s in-network;
CSP unchanged; a real-browser load with 0 errors, the Cloudflare beacon and "+ Add board" present; the load's two fresh keys
(`version: 14`) cleared and read back empty after 3s, then navigated away. Unit-tested only (a dialog render test).

**Production matches `master` as of 2026-10-13 with AI-tapers chunk 2 live** (`index-DWTxNeO6.js`, CSS `index-BkjfVfaC.css`
unchanged, merge `f7a6202`, **schema 14**, unchanged). Verified: `200` on `/` and a deep route in-network and at the edge;
bundle matches `dist/` at both; `index-B4V-pkp9.js` 404s in-network; CSP `connect-src 'self' https://api.anthropic.com` at the
edge; a real-browser load with 0 errors, the Cloudflare beacon and "+ Add board" present; the load's two fresh keys
(`version: 14`) cleared and read back empty after 3s, then navigated away. Features verified on the dev server with two
user-approved paid runs (`docs/browser-verification-ai-tapers.md`, "Chunk 2").

**Production matches `master` as of 2026-10-13 with AI-tapers chunk 1 live** (`index-B4V-pkp9.js`, CSS `index-BkjfVfaC.css`
unchanged, merge `71510e5`, **schema 14**, unchanged). Verified: `200` on `/` and a deep route in-network and at the edge;
bundle matches `dist/` at both; `index-DACMEk1Y.js` 404s in-network; CSP `connect-src 'self' https://api.anthropic.com` at the
edge; a real-browser load with 0 errors (3 three.js deprecation warnings), the Cloudflare beacon and "+ Add board" present;
the load's two fresh keys (`version: 14`) cleared and read back empty after 3s, then navigated away. Features verified on the
dev server (`docs/browser-verification-ai-tapers.md`); no paid joinery run (no key in the dev profile).

**Production matches `master` as of 2026-10-12 with fu 299/300's wording live** (`index-DACMEk1Y.js`, CSS
`index-BkjfVfaC.css` unchanged, merge `610c2f2`, **schema 14**). One face vocabulary (a length face is an end), short chamfer
Edge labels, one refusal pattern. Verified: `200` on `/` and a deep route in-network and at the edge; bundle matches `dist/`
at both; `index-D4EQ6d5G.js` 404s in-network; CSP unchanged; a real-browser load with 0 errors, the Cloudflare beacon and
"+ Add board" present; the load's two fresh keys (`version: 14`) cleared and read back empty after 3s, then navigated away.

**Production matches `master` as of 2026-10-12 with angle cuts chunk 3 live** (`index-D4EQ6d5G.js`, CSS `index-BkjfVfaC.css`
unchanged, merge `b56dcfd`, **schema 14**, unchanged). Verified: `200` on `/` and a deep route in-network and at the edge;
bundle matches `dist/` at both; `index-b4ad9aBu.js` 404s in-network; CSP unchanged at the edge; a real-browser load with 0
errors, the Cloudflare beacon and "+ Add board" present; the load's two fresh keys (`version: 14`) cleared and read back
empty after 3s, then navigated away. Features verified on the dev server (`docs/browser-verification-angle-cuts.md`, "Chunk 3").

**Production matches `master` as of 2026-10-12 with angle cuts chunk 2 live** (`index-b4ad9aBu.js`, CSS `index-BkjfVfaC.css`
unchanged, merge `80e41b6`, **schema 14**, unchanged by this chunk). Verified: `200` on `/` and a deep route in-network and
at the edge; bundle matches `dist/` at both; `index-DLW02CPM.js` 404s in-network; CSP unchanged at the edge; a real-browser
load with 0 errors, the Cloudflare beacon and "+ Add board" present; the load's two fresh keys (`version: 14`) cleared and
read back empty after 3s, then navigated away. Features verified on the dev server (`docs/browser-verification-angle-cuts.md`, "Chunk 2").

**Production matches `master` as of 2026-10-12 with angle cuts chunk 1 live** (`index-DLW02CPM.js`, CSS
`index-BkjfVfaC.css`, merge `5cb0a4c`, **schema 14** — rolling back below 14 refuses every project saved since: export
first). Verified: `200` on `/` and a deep route in-network and at the edge; bundle and CSS at both match `dist/`;
`index-TRoZVkeX.js` 404s in-network; CSP `connect-src 'self' https://api.anthropic.com` at the edge; a real-browser load
with 0 errors (3 warnings), the Cloudflare beacon and "+ Add board" present; the load's two fresh keys (`version: 14`)
cleared and read back empty after 3s, then the page was navigated away. Features were verified on the dev server
(`docs/browser-verification-angle-cuts.md`, including a re-check after the final fix wave).

**Production matches `master` as of 2026-10-12 with fu 273's note live** (`index-TRoZVkeX.js`, CSS `index-D82Pe9tp.css`
unchanged, commit `47548d3`, **schema 13**). Verified: `200` on `/` and a deep route in-network and at the edge; bundle
matches `dist/` at both; `index-BR6V0tAc.js` 404s in-network; CSP unchanged at the edge; a real-browser load with 0
errors, the Cloudflare beacon and "Cut list" present; the load's two fresh keys (`version: 13`) cleared and read back
empty twice and after navigating away. The note itself is unit-tested (no dev-server pass).

**Production matches `master` as of 2026-10-12 with the lumber yield & cost round live** (`index-BR6V0tAc.js`, CSS
`index-D82Pe9tp.css`, merge `f6261fd`, **schema 13**). Verified: `200` on `/` and a deep route in-network and at the edge;
bundle and CSS at both match `dist/`; `index-ulm_-ktQ.js` 404s in-network; CSP `connect-src 'self'
https://api.anthropic.com` at the edge; a real-browser load with 0 errors, the Cloudflare beacon, "Cut list" and
"+ Add board" present; the load's two fresh keys (`version: 13`) cleared and read back empty twice and after navigating
away. Features were verified on the dev server (`docs/browser-verification-lumber-yield-cost.md`).

**Production matches `master` as of 2026-10-12 with fu 264's fix live** (`index-ulm_-ktQ.js`, CSS `index-ysjULoHK.css`
unchanged, commit `d161946`, **schema 13**). Verified: `200` on `/` and a deep route in-network and at the edge; the
bundle matches `dist/` at both; `index-Dk0nNgH6.js` 404s in-network; CSP `connect-src 'self' https://api.anthropic.com`
at the edge; a real-browser load with 0 errors, the Cloudflare beacon and "Plans" present; the fresh `version: 13`
project's origin `localStorage` was cleared and read back empty twice and after navigating away. The fix itself is
pure layout arithmetic, pinned by unit tests; no dev-server pass.

**Production matches `master` as of 2026-10-12 with fu 254's height cap live** (`index-Dk0nNgH6.js`, CSS
`index-ysjULoHK.css` unchanged, commit `7668787`, **schema 13**). Verified: `200` on `/` and a deep route in-network
and at the edge; the bundle matches `dist/` at both; `index-CNnZg_b6.js` 404s in-network; CSP `connect-src 'self'
https://api.anthropic.com` at the edge; a real-browser load with 0 errors, the Cloudflare beacon and "Plans" present;
the fresh `version: 13` project's origin `localStorage` was cleared and read back empty twice and after navigating
away. The height cap itself was checked on a dev server (a 36x12x72 bookcase: the trio at 82.06% width, aspect 1.523).

**Production matches `master` as of 2026-10-12 with the plans-sheet round live** (`index-CNnZg_b6.js`, CSS
`index-ysjULoHK.css`, merge `b023ac8`, **schema 13**, unchanged). Verified: `200` on `/` and a deep route
in-network and at the edge; the bundle and CSS at both match `dist/`; the old `index-DrjjRDmM.js` 404s in-network;
CSP `connect-src 'self' https://api.anthropic.com` at the edge; a real-browser page load with 0 errors, the
Cloudflare beacon, and "Plans", "+ Add board" and the Explode slider present. The load wrote a fresh empty project
stored as `version: 13`; that origin's `localStorage` was cleared and read back empty twice (3s apart) and again
after navigating away. Features were verified on the dev server (`docs/browser-verification-plans-sheet.md`).

**Production matches `master` as of 2026-10-07 with the components round live** (`index-3fpWh8yo.js`,
CSS `index-QQ-rJZea.css`, merge `9012e1e`, **schema 11**). Verified:
- `200` on `/` and on a deep route, in-network and at the edge;
- the new bundle served at both;
- the old bundle 404s in-network;
- CSP `connect-src 'self' https://api.anthropic.com` at the edge;
- a headless real-browser load with 0 page errors, its `localStorage` cleared afterwards.

**Production matches `master` as of 2026-10-06 with the assemblies round and its two same-day follow-ups live**
(`index-DVAS8FuS.js`, deployed commit `029becf`: the fade hides the grid and reads as a grey ghost,
and a click on empty space inside an assembly moves up one level; both at the user's request after
looking at production). Before those: `index-hmc0odAl.js`, CSS `index-BYFkbcnj.css`, deployed commit
`f8f76e8`, merge `699cc45`, **schema 10**. Verified: `200`
on `/` and a deep route in-network and at the edge, the new bundle at both, CSP `connect-src 'self'
https://api.anthropic.com` at the edge, and a real-browser load (0 page errors) with that browser's
`localStorage` cleared afterwards. The old bundle 404s in-network; at the edge it answered `200` from
Cloudflare's cache, which is harmless for a hashed asset the HTML no longer names.

**Production matches `master` as of 2026-10-06 with the linking round live** (`index-BwdHsyEM.js`,
CSS `index-C7v9uwho.css`, merge `d3120cf`, **schema 9**). This entry also stands in for the seven
deploys of 2026-10-05/06, which are recorded in their round sections below rather than here:
joinery fixes `index-BzWa2ZGT.js` (`c31dd82`), joinery residues `index-D_wzi7Bx.js` (`2b96eb2`),
multi-select `index-D7ySMvky.js` (`232917f`), hide/unhide `index-BpdcUlXf.js` (`366eb37`), quarter
turns `index-bSuJPbkx.js` (`a24287f`, schema 8), copy in a row `index-B8i7dotN.js` (`7487aca`) and
linking. Each was verified the same way: `200` on `/` and a deep route in-network and at the edge,
the new bundle at both, the old bundle 404, CSP `connect-src 'self' https://api.anthropic.com` at
the edge, and a real-browser load with that browser's `localStorage` cleared afterwards.

**Production matches `master` as of 2026-10-05 with the fu 197 round live.** The bundle went from
`index-DjL6FbOz.js` to `index-Ci3NLhVT.js`, and the CSS is unchanged (`index-DqhKBEnY.css`). The
merge commit is `658dfcc`. Verified after the deploy: the new bundle on `/` and a deep route, both
in-network and at the edge, and CSP `connect-src 'self' https://api.anthropic.com` unchanged at the
edge. The change was verified against the dev server (`docs/browser-verification-fu197.md`).

**Production matches `master` as of 2026-10-05 with the fu 200 round live.** The bundle went from
`index-BvsB1zA6.js` to `index-DjL6FbOz.js`, and the CSS is unchanged (`index-DqhKBEnY.css`). The
merge commit is `f37734b`. Verified after the deploy: the new bundle on `/` and a deep route, both
in-network and at the edge, and CSP `connect-src 'self' https://api.anthropic.com` unchanged at the
edge. The change was verified against the dev server (`docs/browser-verification-fu200.md`).

**Production matches `master` as of 2026-10-05 with the 198/199 round live.** The bundle went from
`index-JBiJohQE.js` to `index-BvsB1zA6.js`, and the CSS is unchanged (`index-DqhKBEnY.css`). The
merge commit is `fb8a094`. Verified after the deploy: the new bundle on `/` and a deep route, both
in-network and at the edge, and CSP `connect-src 'self' https://api.anthropic.com` unchanged at the
edge. The changes were verified against the dev server (`docs/browser-verification-fu198-199.md`),
not exercised on production.

**Production matches `master` as of 2026-10-04 with the cut storage round live** (follow-ups 195,
196). The bundle went from `index-BPmx9i74.js` to `index-JBiJohQE.js`, and the CSS is unchanged
(`index-DqhKBEnY.css`). The merge commit is `7fa749d`. Verified after the deploy: the new bundle on
`/` and a deep route, both in-network and at the edge, and CSP `connect-src 'self'
https://api.anthropic.com` unchanged at the edge. The button and the new storage were not exercised
against production — seeing them needs a document with cuts — and were verified against the dev
server (`docs/browser-verification-cut-storage.md`).

**Production matches `master` as of 2026-10-04 with the cut lines round live** (follow-ups 192,
193; 194 closed by decision). The bundle went from `index-Cw_EeWuY.js` to `index-BPmx9i74.js`,
and the CSS is unchanged (`index-DqhKBEnY.css`). The merge commit is `f602a2d`. Verified after the
deploy: the new bundle on `/` and a deep route, both in-network and at the edge, and CSP
`connect-src 'self' https://api.anthropic.com` unchanged at the edge. The new lines were not
exercised against production — seeing them needs a document with cuts — and were verified against
the dev server (`docs/browser-verification-cut-lines.md`).

**Production matches `master` as of 2026-10-04 with the cut words round live** (follow-ups 180,
181, 189). The bundle went from `index-Ci7lVCzJ.js` to `index-Cw_EeWuY.js`, and the CSS is
unchanged (`index-DqhKBEnY.css`). The merge commit is `8c9be52`. Verified after the deploy: the new
bundle on `/` and a deep route, both in-network and at the edge, and CSP `connect-src 'self'
https://api.anthropic.com` unchanged at the edge. The words themselves were not exercised against
production — seeing them needs a document with cuts — and were verified against the dev server
(`docs/browser-verification-cut-words.md`).

**Production matches `master` as of 2026-10-04 with the joinery round live** (phase 2,
follow-up 171). The bundle went from `index-B2Yuq550.js` to `index-Ci7lVCzJ.js`, and the CSS is
unchanged (`index-DqhKBEnY.css`), because the dialog reuses the existing overlay classes. The
merge commit is `d2a14ac`.

Verified after the deploy:
- `200` on `/` and on a deep route, both in-network and publicly;
- the new bundle served at both;
- CSP `connect-src 'self' https://api.anthropic.com` unchanged at the edge (joinery calls the
  API through it, as Generate does).

The round was verified first against the dev server with the user watching, using four paid
calls. There is no schema change, so a rollback to `index-B2Yuq550.js` costs only this round.

**Production matches `master` as of 2026-10-04 with the phantom-cut round live** (follow-up
178). The bundle went from `index-CoHIAVxf.js` to `index-B2Yuq550.js`, and the CSS from
`index-Co3i2lF7.css` to `index-DqhKBEnY.css` (the `.field-note` pill). The merge commit is
`e7bf3bc`.

Verified after the deploy:
- `200` on `/` and on a deep route, both in-network and publicly;
- the new bundle served at both;
- CSP `connect-src 'self' https://api.anthropic.com` unchanged at the edge.

The round was verified against the dev server first, with the user watching. There is no
schema change, so rolling back to `index-CoHIAVxf.js` costs only this round.

**Production matches `master` as of 2026-10-04 with the stopped cuts round live.** The bundle
went from `index-BhhW2iNw.js` to `index-CoHIAVxf.js`; the merge commit is `c054ede`. The CSS
is unchanged (`index-Co3i2lF7.css`).

Verified after the deploy:
- `200` on `/` and on a deep route, both in-network and publicly;
- the new bundle served at both;
- CSP `connect-src 'self' https://api.anthropic.com` unchanged at the edge.

The round was verified against the dev server first, with the user watching.

**This is the first schema bump since the guide-points round: v6 → v7.** Rolling back to
`index-BhhW2iNw.js` would refuse every document saved by this build, so export first.

**Production matches `master` as of 2026-10-03 with the key check round live** (follow-up 174):
bundle `index-B9DOKF_H.js` → `index-BhhW2iNw.js`, merge commit `d0ba83b`, the day's fourth
deploy. The CSS is unchanged (`index-Co3i2lF7.css`). Verified after: `200` on `/` and on a
deep route, both in-network and publicly; the new bundle served at both; CSP `connect-src
'self' https://api.anthropic.com` unchanged at the edge (the free check call depends on it).
Verified against the dev server first, with the user watching. There is no schema change.

**Production matches `master` as of 2026-10-03 with the held and stable round live** (follow-up
165): bundle `index-CHx6ZAo-.js` → `index-B9DOKF_H.js`, merge commit `a0f452f`, the day's
third deploy. **The CSS hash did not move** (`index-Co3i2lF7.css`), because the round is
TypeScript-only. Verified after: `200` on `/` and on a deep route, both in-network and
publicly; the new bundle served both at the edge and in-network; CSP `connect-src 'self'
https://api.anthropic.com` unchanged at the edge. The feature was verified against the dev
server with the user watching, then deployed, the normal order. Nothing was exercised
against production. There is no schema change.

**Production matches `master` as of 2026-10-03 with the batch variety round live** (follow-up
164): bundle `index-BAsxEohe.js` → `index-CHx6ZAo-.js`, CSS `index-DEQSkZ3q.css` →
`index-Co3i2lF7.css`, merge commit `b46b28d`. It is the day's second deploy. The CSS hash
moved because the round added the plan-line and concept styles. Verified after: `200` on `/`
and on a deep route, in-network and publicly; the new bundle served both at the edge and
in-network; and CSP `connect-src 'self' https://api.anthropic.com` unchanged at the edge.
**This deploy follows the deployment rule's normal order**, live test first and deploy
second, unlike the Generate round's earlier the same day. Its feature was verified against
the dev server with the user watching (`docs/browser-verification-batch-variety.md`), so
nothing was exercised against production. There is no schema change.

**Production matches `master` as of 2026-10-03 with the Generate round live**: bundle
`index-CZu96cak.js` → `index-BAsxEohe.js` (CSS `index-CtYur9k3.css` → `index-DEQSkZ3q.css`),
merge commit `fa834dc`. Verified after: `200` on `/` and on a deep route, both in-network and
publicly; the new bundle served at the edge; and the edge's CSP reading `connect-src 'self'
https://api.anthropic.com`. That last check is the one thing the dev server cannot show,
because it sends no CSP.

**This round broke the order the deployment rule assumes, and said so.** It was deployed
*before* its live test and its docs, at the user's request, so they could drive real
generations on the live site. This was safe for a reason specific to the feature:
generation only ever adds new, unactivated library projects (invariant 36) and never writes
into the open one. **The premise behind the request was wrong.** The user can watch the
Playwright browser this session drives, so "Claude drives the dev server, the user
supervises" was available and is the route for next time. The results are in
`docs/browser-verification-generate.md`.

**Production matches `master` as of 2026-08-31 with the ply-sign round (163) live** — bundle
`index-DU8uasNy.js` → `index-CZu96cak.js`, commit `eb6a632`, the **fifth** deploy of that day
and the only one of the day's ten rounds that began with a user bug report. **The CSS hash did
not move** (`index-CtYur9k3.css` both sides), which is the mirror of the standing note that a
CSS-only round still moves the JS hash: a TypeScript-only round leaves the CSS asset alone.
Verified after: `200` on `/` and on a deep route both in-network and publicly, the new bundle
served at the edge and in-network so it is not a stale-cache read, the app mounted with canvas
1296×1168 and the full toolbar, storage banner absent, indicator reading *Saved locally*, 0
console errors with only the two known THREE deprecation warnings, and `localStorage` cleared
in the verifying browser afterward and confirmed empty.

**Its own change was not exercised live, and that reason is the strongest in the series**:
seeing it needs a plywood board *with a cut*, so exercising it would write a document into the
verifying browser. Its correct appearance on a healthy empty load is no appearance, and that
was checked. It was measured against the dev server instead — the edge of a dadoed 3/4"
panel rendered straight on and read back with `gl.readPixels`, `D27 L78 D82 L158 D55` before
against five even plies after, on a scanline the cut does not touch.
`docs/browser-verification-ply-cut-uv.md` carries that and the before/after image. **26a does
not apply to this evidence**: nothing in the path rests on undefined shader behaviour — CPU-
drawn textures, `BoxGeometry`, `MeshBasicMaterial`, no lighting term and no `pow`.

**No schema or storage-layout change**, so rolling back costs only the round.

**The cut list line of work is CLOSED as of 2026-08-01** — cut list, diagrams, label
layout, per-face views and board feet are all shipped and merged to `master`. Do not
treat any of the five as in-flight.

**Production matches `master` as of 2026-08-04, all THREE of that day's rounds included.**
The tape measure and guide points (`dbca088`, bundle `index-BFdaQ-al.js` →
`index-BV9UlR3E.js`), then type-anywhere distance entry (`1e61eae`, `index-BV9UlR3E.js` →
`index-BvW6so6V.js`), and then cardinal guides (`a998793`, `index-BvW6so6V.js` →
`index-K_vbIrhN.js`) were each merged and deployed the same day, as
cut-aware snap points, snap-move and selected-board grabs were before them — unlike the
three rounds before *those*, which sat merged and held back at the user's choice. **The
live schema frontier is now v6, not v5** — the paragraph further down describing v5 as the
first bump to reach production is history, not the current gate; see the v6 rollback note
below it. Cardinal guides changes no schema, so **rolling back only that one is free**: a
document saved by it reads `version: 6` and the previous image opens it unchanged, guides
and all. `DEPLOYMENT.local.md` carries all three runbook entries and what each could and
could not confirm live: the guide-points deploy confirmed the tool's *arming* surface only,
and the type-anywhere and cardinal-guides deploys each confirmed **nothing** of their own
change, because the readout renders only once the tape is anchored — and `X`/`Y`/`Z` act
only when it is — and anchoring needs a board, so the standing localStorage rule below
applied totally rather than partially to both. `sloyd.autosave.v1` was confirmed absent in
the verifying browser after all three.

**Production matched `master` at 2026-08-03 too, cut-aware snap points included**, and
that deploy is worth keeping distinct from the two above, because part of what it carried
was a bug fix rather than a feature. Verified after it: `200` on `/` and on a deep route
both in-network and publicly, the new bundle (`index-BH2XnbVu.js` → `index-BFdaQ-al.js`)
served at the edge and in-network (so this is not a stale-cache read), the app mounted
with its canvas and full toolbar, 0 console errors (two known three.js deprecation
warnings), and exactly one Cloudflare beacon.

**The bug fix inside the cut-aware snap points deploy is worth knowing by name.**
`boardSnapPoints` now filters through `stockProbe` (design §5.1,
follow-up 122), which stops a rabbet's flush-end mouth positions being offered as markers
hanging a quarter-inch out in the air over removed stock. That defect predated the round
— it had been true of every rabbet since joinery shipped, and it went live with snap-move
— so production carried it until this deploy. Rollback costs nothing but the round: no
schema change, so a document saved by either build reads `version: 5` and opens in the
other unchanged.

**That round's own change could NOT be confirmed against production, and that is the
standing rule working rather than a gap in the check.** A cut point only exists on a board
that has a cut, so seeing one marked means building a document — which writes
`sloyd.autosave.v1`, which is the user's real project. So the deploy was confirmed by
bundle hash, and the feature itself was verified against the dev server twice
(`docs/browser-verification-cut-snap-points.md`, the main pass and its re-check after the
§5.1 fix). `sloyd.autosave.v1` was confirmed **absent** in the verifying browser
afterward — checked, not assumed. Contrast the selected-board grabs deploy below, where
the round's change *was* confirmable live because arming a tool writes nothing.

**That earlier verification touched production's `localStorage` not at all, and the reason
is worth carrying forward.** Arming the Move tool is a change to `tool`, which is view state
beside `selectedId` — outside the document, outside the undo stack, never saved — so the
hint could be confirmed live while `sloyd.autosave.v1` stayed absent in the verifying
browser (checked, not assumed). Everything needing an actual board was exercised against
the dev server. The standing rule's test is whether an interaction writes a document, not
whether it looks small.

**Snap-move carried no version-gate rollback cost**, unlike the deploy described below.
It changes no schema, so a document saved by the live build still reads `version: 5` and
the previous image opens it unchanged — rolling this one back would cost nothing but the
tool itself. That is a property of this round, not a new general rule: the paragraph
below still governs any rollback past the sheet-nesting deploy.

**Production was verified by loading the page only, and that is a standing rule rather
than this round's shortcut.** Sloyd has no server-side state, so `sloyd.autosave.v1` in
the user's browser *is* their project; exercising a new feature against production would
overwrite it with a demo document and there is nothing to restore from. New rendering
gets verified against the dev server (that is what
`docs/browser-verification-snap-move.md` is), and the deploy itself gets confirmed by
bundle hash. See `DEPLOYMENT.local.md` for the full statement.

**The live version gate is v6, and rolling back past the guide-points deploy is what now
costs something.** A document saved by the current build carries `version: 6`; the
previous image (`index-BFdaQ-al.js`) understands up to 5 and *refuses* such a file rather
than silently dropping the guides — which is the gate working as designed, and is exactly
the silent-data-loss case the bump was argued from. Autosave lives in the browser at
`sloyd.autosave.v1`, so rolling back that far would strand any project saved since.
Export first if it ever comes to that. The type-anywhere deploy on top of it changed no
schema, so rolling back only *that* one is free.

**The sheet-nesting deploy was the first to ship a schema bump at all**, and its
paragraph is kept because the reasoning is the pattern rather than because the numbers are
current: a document saved by that build carried `version: 5` and the image before it
understood up to 4, refusing the file rather than silently dropping the kerf. Read it as
the first instance of the rule the v6 paragraph above now states with live numbers.
`DEPLOYMENT.local.md` has the full runbook and every bundle hash.

What is deliberately *not* built sits in two places, and both are decisions rather than
omissions: the **"Deferred behind it"** paragraph below (CSV export and name
run-collapsing — the only two items left there now that sheet-goods nesting is closed
by the round below — both declined with reasons worth reading before re-proposing),
and `docs/follow-ups.md`'s open entries. **48 and 49 — a board whose cuts remove all its
stock rendering as nothing — are now CLOSED**, by the empty-solids placeholder described
below; one open follow-up now has a user-visible consequence — see 92 below, bounded to
near-1:1-aspect-ratio parts under free rotation. Two things about the
diagrams remain unverified rather than fixed: a **print-to-PDF render** (this host's
Playwright exposes no `pdf()`) and **hatch-versus-cross-hatch legibility at screen
size**, which is a recorded negative finding, not an assumption — see follow-ups 76
and 79.


---

## What each round did

**What curves chunk 2 did (2026-10-15, fu 361)** (plan `docs/superpowers/plans/2026-10-15-sloyd-curves-chunk2.md`, spec §5, branch
`curves-2` from master `3b4abdb`, HEAD `3f6fba4`). **Built, NOT merged or deployed. No schema change** (17), so rolling back is free.
The plan's rulings Q1–Q6 were approved by the user with it. **Q1 (a live defect on master):** a probe found the Plans sheet drew no
silhouette for a curved surface: a four-corner top's Front and Side elevations had open ends and an arch's Side view lacked its
hidden crown, because a smooth outline point's line along `through` is suppressed (inv 16) and nothing replaced it. `silhouetteLines`
adds that line at each smooth MODEL vertex whose two faces turn opposite ways to the view. **Q2:** visibility is decided on the model
chord and the fine path (0.001", ≤96 chords, nodes ON the true arc) is drawn with that split, so the visible/hidden split is
chunk 1's. **Q3:** an edge-on view keeps the model chords (96 chords fold back over themselves, the holes R2 lesson). **Q4:** a chord
a dado or second curve splits keeps its split end on the chord. **Q5:** part diagrams hatch the waste, draw a sharp-vertex line only
on a face the vertex lies on, and open a curve's through min view only when neither side exists, after holes' entry views. **Q6:**
`curveLineEntries` keeps the four-corner collapse by returning `{ ids, text }`.
**Tasks:** 1 `curveDrawEdges` (`0e3c27a`); 2 `drawView` takes it, with a pin of uncurved drawings first (`00fb0f2`, `2f2b7d7`; timing
~6 ms per view, unchanged); 3 silhouettes (`6372509`, `1b2661c`); 4 diagrams, pin first (`32e078d`, `10e611f`); 5 `PartDiagram`
(`7674e85`); 6 the live check and these records.
**Review findings.** Task 2 (three plan-test corrections accepted: the dado filter, a one-to-one 1e-9 mirror match, an added occluder
test, each fixing a plan-test defect without weakening the pin). Task 3 implementer: the plan's code hid the rounded top's near end
line (a DRAW_EPS graze on the shallow first chord); a 1e-4 lift toward the viewer was added, and the review (Important) found that fixed lift
failed gentle bows (30 × 0.25, 60 × 0.1 read hidden): **fix round 1** probes from 4×`DRAW_EPS` along the viewer-facing adjacent faces'
outward normals (an execution ruling beyond the plan), with Side hidden totals and drawView-pinned bow tests. Final review
(opus, `3b4abdb..7674e85`): no Critical or Important; endorsed the T2, T3 and T6 rulings. **Final fix wave** (`3f6fba4`): the stale
drawView doc; the draw edges deep-frozen; fine nodes at chord parameter 0 or 1 dropped (Q4 exactness; no constructed case reaches the
guard, kept by ruling); a curve run wholly off its face still lists its note in the view it opened (its `— check:` line would appear
nowhere); the T2 occluder-test comment. Re-review: all five addressed. Record-only: Q2's split up to 0.005" off an oblique occluder edge.
**Live check** (controller, dev :5181, software GL): the rounded top's elevations close, the arch is smooth, the bow's hidden arc dashes
continuously, Explode with 0 errors; the cut-list diagrams read as specified (one note for four corners, the dado's thickness-max view
opening no min view); print notes black; metric notes in mm. The 96-chord line weight on a real print and the user's Brave print are
owed (fu 254, 345, 357, 379). The profile read back intact; the joined project's `savedAt` moved (the switch flush).
**Follow-ups:** 361 closed; residue 374–379 (the edge-on fold, a silhouette through another cut's air, chord ends off the arc,
the unreachable node guard, deferred minors, the drawView timing). Tests: 4436 across 151 files (4374 across 148 on master).

**What curves chunk 1 did (2026-10-15, feature gaps §1)** (spec `docs/superpowers/specs/2026-10-15-sloyd-curves-design.md`,
plan `docs/superpowers/plans/2026-10-15-sloyd-curves-chunk1.md`, branch `curves` from `4be8d00`, HEAD `0ccb64f`). **Merged as `54ea740` and deployed 2026-10-15**
(`index-D4nh2vvL.js`). **Schema 17**: a build below 17 refuses every project saved since (export first). Picked by Claude at the user's request. The user's rulings while brainstorming:
curved profiles cut clean through a part first (no edge profiles, no bent parts); arcs now, splines later without a schema
bump (a stored path of segments; an unknown segment type refuses the document); through any of the three dimensions,
default the thickness; Claude features refuse curved projects this round; approach 1, measured — curves become part of the
ONE geometry (`boardBodies`) and a curved part's edges are BUILT, not rediscovered; the grain seam on a curved face is
accepted (with fu 336). Two *Corrected (writing)* notes went to the user with the spec: an arc stores the `side` of its
chord it bows toward (a `bulge: wood | waste` cannot be decided for an arch until it is placed), and the lines use the one
face vocabulary (`the width min side`), not "bottom" or "left".
**The timing spike** (throwaway, the real code with injected bodies, minimum of several runs) decided approach 1's edges:
an arched apron 30 × 5 (24" span, 1-1/2" rise) at 18 chords splits into 20 bodies with `bodyEdges` 25 ms, one drawing 25
ms, mesh 1 ms, cap 0.6 ms; a 36 × 20 top with four 2" corners (12 chords each) stays one body, `bodyEdges` 18 ms, drawing
19, mesh 2, cap 2; the arch at 48 chords: 50 bodies, `bodyEdges` 135 ms, drawing 131. `bodyEdges` grows with the square of
the faces on the two broad planes, so curved edges are built from `unionOutline` plus sharp vertices.
**What shipped on the branch:** `CurveCut` (`Board.curves`, `Shape.curves`): a closed waste outline of `line` and minor
`arc` segments (`rise` or `radius`, `side`) in a face's stored (u, v) from named ends, extruded through `through`.
`curves.ts` is the one model (arc maths, chords ON the arc at 0.005" and ≤24 per arc, inside tests, `curveFaults` —
`runs-off`, `cuts-through` — the canonical writers/readers and `deriveCurveKind`, presets, `mirrorCurveCut`).
`boardBodies` CLIPS a convex-wood curve (corners, a full-span bow) by chord half-planes and SPLITS the rest (arches,
notches) along the waste's ear-clipped convex pieces; `curvedEdges` builds the edges; `bodyMesh` gives chord faces radial
normals and drops seams; snap points at arc ends, crowns and centres; holes into a curve's waste are `breaks-out`; bench
lines (`Arch on the width min side, 3" in from each length end: 24" span, 1-1/2" rise (radius 48-3/4")`, the radius for the
trammel) and cut-list grouping by `CURVE_FIELDS` as a multiset, four equal corners as one line; joinery, Refine and Repair
refuse a curved project; store actions; the Curves section (Arch, Half-round notch, Bow, Rounded corner, Rounded corners).
A curved part still buys its box (inv 18).
**Planning rulings P1–P7** (spec gaps found while writing the plan; approved by the user with it): P1 explicit closure (the
last `to` `===` `start`); P2 a Bow is stored at its edge's length when written and refit by every edit, a resize never
stretches it (`over 18" from the length min end` on the line, a note on the row); P3 the waste is air to the stock probe
except a point on an arc or on a straight side off the face boundary; P4 fault words (`runs past the length max end`,
`cuts right through the part`, `hole 3 runs into the arch`); P5 snap kinds (ends `corner`, crown `edge-mid`, centre
`face-center`, nothing off the face); P6 the clip decider (every arc into the waste, every straight side on the boundary);
P7 `, cut through the width` after the radius bracket.
Subagent-driven, sixteen tasks, each reviewed; rulings while executing:
- `curveKindWord` lives in `curves.ts`, not `curveText.ts` (the pre-flight scan found a duplicate declaration and a
  `holeText` ↔ `curveText` import cycle in the plan).
- The fixtures ARCH and CORNER live in `curveFixtures.ts` (TEST-ONLY): ~10 files imported them from `curves.test.ts`, and
  importing a test module re-registers its suite in every importer.
- Task 4: `wasteContains` closes the chord band PER ARC (strict for an arc bowing into the wood, closed for one into the
  waste) — the plan's uniform closed band read a band along an outward arc's chord as waste (spurious cuts-through on
  non-canonical curves, which the spec says render and print). Spec §2.5's example "an arch or bow deeper than the part is
  wide" is not a cuts-through under the stated rule (the curve leaves the face first); the code follows the rule and such a
  curve reads `runs-off`, which still flags and refuses it. Spec amended in these records.
- Task 6: the implementer STRENGTHENED P6 — CLIP also requires one arc run and convex wood at every off-boundary vertex and
  arc–arc join. P6 as written clipped 28 in³ of real wood off two arcs meeting in a reflex wood corner (hand-edited only);
  the guard only moves curves to SPLIT, which gives the same wood. Accepted and marked for the user's review. The review
  added the containment half of the clip/split agreement pin (volume alone was there) and replaced the plan's
  "no curves byte-for-byte" test, which compared a value with itself.
- Task 7: smooth-line suppression dropped whole lines, erasing a real crease where a dado wall meets a corner's tangent end
  (the oracle shared the filter, so it could not see it) — now per interval, with an independent fixture; and `slanted`
  tested against every through axis made a two-axis part nearly the slow path (5.7 vs 8.0 ms) — now the matching plane's
  own axis. `unionOutline` moved to `outline.ts`.
- Task 8: the controller-added L-shaped notch (a non-convex waste: 14 pieces, 83 bodies, 477 faces) measured 48–54 ms
  against 40 (bodies 4, edges 35 on frozen bodies, mesh 8); ruled a 100 ms bound (the holes guard's precedent for an unusual
  case — no preset authors a non-convex waste), the presets and a two-axis part at 40; the upstream causes are fu 368.
- Task 10: a hole edit adding a hole-into-curve fault crashed the Holes panel's refusal (`edgeName` of a fault with no edge);
  it now reads `Puts hole N into the arch — move it first.`
- Task 14: Span and a Bow's Rise also refuse an arc past a half circle (the loader DROPS `rise > chord/2`, so an unrefused
  edit was silent loss on the next load); the review found a SELECT change (a faulted Bow re-seated through the length,
  refit to a 0.75" span at its old rise) stored one too — the check now runs on every candidate (`pastHalfCircle`).
**Plan defects the reviews and implementers caught** (fixed in code or test, never by weakening): mutations that survived
the plan's tests (a non-closing outline and a 71-segment one were dropped anyway by the area test; the outline's sweep sign;
`curveFaults`' arc extremes (no test of a crown alone past the far side); a notch's `>=`; `intoCurve` in `holeInStock`; withholding a preset that
faults; the re-seat on a thickness→length switch, where the writer puts the arc on v anyway); a one-user shape that
dissolves on load used as a "shape's own curves" fixture; a test fixture on 3/4" stock whose re-seat cuts through; the
plan's `convexPieces` loop that could stop with waste untriangulated; extended piece planes slicing cells the waste never
reaches (a disjointness pre-check); the circle search for a chord's arc replaced by index.
**The live check** (Task 15, dev server :5181, software GL, `docs/browser-verification-curves.md`, the profile restored
after: 6 keys, 3 projects, hashes unchanged): Properties and the cut list read Task 11's strings; four corners in one undo
entry; a Bow through the width reads `Bow the thickness min side 1/2" (radius 225-1/4"), cut through the width`; the tape
reads 24" arch end to arch end and 12-1/16" to the crown; the section's cap follows the arch (Front, for an on-edge apron);
a length of 26 keeps the arch with its note and `— check:` suffix, Span 20 clears it; a Rise into a hole refused in the
field; a mirrored copy's off-centre arch mirrors and follows edits; joinery and Refine refuse with no call; the Plans sheet
draws arches dashed where hidden; 47 undo/redo steps one entry each. It found **light pinholes in the arched apron's ground
shadow** along the arch and faint specks on its section cap (`docs/img/curves-shadow-speckles.png`).
**The final review** (opus, whole branch; "With fixes") traced the pinholes to T-junctions — 90 unmatched directed edges in
the default arch's merged mesh, 92 for the notch, 14 for a lengthened bow, 86 for the L-notch — and found a box cell beside
the slices still drawn as a `BoxGeometry` (T-junctions against them too); a `faultKey` collision (a hole ALREADY past an
edge could be edited into a curve's waste unrefused, since both faults keyed `breaks-out`); and a Bow's select refusal
saying "reduce the Span" (a Bow has no Span). The fix wave (`f1292ee`..`6fb1f4d`): `bodyMeshIdentity.test.ts` written FIRST
(holed multi-body parts without curves hash the same on master and after); every body of a curved part through `bodyMesh`
(`drawsAsBox`), its seams dropped, vertices welded (a crown at mid-length gives 0 in one slice and 1.8e-15 in the next),
every part vertex inside a face's edge inserted (the uncovered remainder's corners included: a dado floor's), centroid fans
(`conform.ts`); the cap fan moved to `capFill.ts` and conformed for curved parts; `curvesWatertight.test.ts` (exact Float32
keys; every directed edge matched by its reverse; caps matched or on the outline). The L-notch went from ~54 to ~65 ms
(bound 100). `faultKey` now keys `:edge` / `:curve:<id>` and `distinctFaults` shares it (so a hole past an edge and in a
curve can still be edited back; its line reads `(and 1 more)`). A select refusal names the field that sizes the kind (a
Bow's Rise; and a corner's Radius, `A radius can't run past … — reduce it first.`, the same defect, fixed beyond the brief).
Re-review: all three addressed, nothing new. **The re-check** (`0ccb64f`): the shadow solid, matching a plain board, the
cap clean, the bow clean, 0 console errors (`docs/img/curves-shadow-fixed*.png`, `curves-section-fixed.png`).
**Not confirmed here** (software GL, fu 26a; fu 370): smooth shading on the curved faces; the grain seam on a curved face
(fu 336); arch-end edge lines and the absence of facet lines (indistinguishable at screenshot scale); a faded curved part
beside a dado (strips at the dado — the box path's control shows the same); drag smoothness (no gizmo resize exists;
in-browser frame times were llvmpipe's: ~1.1–1.4 s with or without the arch; node rebuilds under 16 ms for every preset,
two-axis the least margin). The shadow and cap fix is confirmed on llvmpipe only; a real-hardware look closes it.
**Deferred:** chunk 2's drawings (fu 361), spec §12's list (362–367; the grain seam appended to fu 336), the non-convex
rebuild cost (368), a holed face of a curved part keeping T-junctions (369), real-hardware looks (370), record-only minors
(371–373). Test count 4189 → 4374 (141 → 148 files).

**What fu 357 did (2026-10-15)** (bounded, in-chat design; branch `fu-357`). The approved mechanism — the note as a print-only
header group repeated per page — was measured not to work: Chromium repeats neither a CSS `table-header-group` nor a real
`<thead>` on later printed pages. The user, printing from Brave, took the `@page` margin box instead: a metric sheet carries
`.sheet-metric`, which prints on the named page `metric-sheet`, whose `@top-right` reads `Dimensions in mm` on every page (cut list
16/16, Plans 3/3 in the live check; imperial unchanged). Browsers without margin boxes (Firefox, Safari) print as before.
`docs/browser-verification-metric-display.md`, "fu 357". Merged as `7f851f9` (4189 tests, build clean on the merged tree) and
**deployed the same day**: bundle `index-BZDp6iOz.js`, CSS `index-G3ndwYrP.css` (the CSS changed); the old bundle and CSS 404
in-network, CSP at the edge, a real-browser load with 0 errors, production storage cleared after. No schema change; rollback to
`a927d1e` (`index-BIWe_ffw.js`) is free. A real print from Brave is still owed for the user's eye.

**What fu 360 and fu 355 did (2026-10-15)** (bounded, one in-chat design for both; branches `fu-360` and `fu-355`, merged as
`0f2be31` and `3b7455c`; deployed the same day, `index-BIWe_ffw.js`). **fu 360**: the user chose giving built-in pine the nominal set. Pine keeps its own 1× list (6′ and 8′,
its own ids, so no 1× pick changes) and adds `NOMINAL_DEFAULT_STOCK`'s 2× (8/10/12′) and 4×4 (8′) — 36 sizes; a 2×4 in pine
(1-1/2 × 3-1/2, or 38 × 89 mm in a metric project) buys `2×4 × 8′`. It reaches only a browser whose pine settings were never
saved (or Reset). As for a custom nominal solid, a 3/4" part longer than 8′ or wider than a 1×12 now buys 2× stock with a plane
note. **fu 355**: a `Violation` may carry `shown`, the person's copy, set only in a metric project when it differs; `checkDesign`
and `jointFaults` take display units (default the checked document's; Refine passes the original project's, since it checks the
model's imperial conversion); `collapseViolations` suffixes both; the dialogs render `shownText`. Lengths to 0.1 mm (a 2.6 mm
part must not read "3 mm; the minimum is 3 mm"); taper advice floored to whole mm. The user ruled `too-large` stays in inches —
a fault reads in the unit its limit was typed in. The converter's rejections stay inches. Model feedback and imperial violations
unchanged (pinned). Unit-tested only: a live dialog check needs a paid run.

**What fu 354 did (2026-10-15)** (bounded, in-chat design; branch `fu354`, merged as `bf0bdc2` and deployed the same day,
`index-yiFC6fXl.js`). In a metric project, round-mm parts missed nominal lumber (89 mm = 3.504" > a 2×4's 3.5"), so they were
unnamed and Buying refused them. The user chose matching at display precision: `nominalName(t, w, units)` matches when both
sides read the same whole mm, and every stock-fit decision (sheet nesting's stock bounds, Buying's thickness filter, `fitsIn`,
the packer, the reason) uses `fitsStock` — reads no more than the stock at whole mm — through the one `mmTicks` rounding the
fields use; shelves stay exact (inv 23); imperial exact as before. The review caught the first cut's literal half-mm slack
disagreeing with the naming for decimal mm (89.45 mm named 2×4 but refused; 19.5 mm bought from 3/4"). Live: a 286 mm shelf is
bought as `1×12 × 6′ (19 × 286 × 1829 mm)`. Found on the way: built-in pine has no 2× default stock (fu 360).

**What metric display chunk 2 did (2026-10-15)** (plan `docs/superpowers/plans/2026-10-15-sloyd-metric-display-chunk2.md`,
branch `metric-2` from `133d22a`; chunk 1 merged as `80d41fb`). **Merged as `b993ac7` and deployed with chunk 1 the same day** (`index-BhtsAcfC.js`). No schema change. At the deploy gate the user ruled sheet sizes in cut-list prose read in trade form (`96" × 48" (2438 × 1219 mm)`; placed-part labels stay bare) and shipping with fu 354 and 355 open. Subagent-driven, four tasks plus a final
review: (1) drawings in bare mm — `dimensions.ts`, `diagram.ts`' own labels, `nesting.ts`' `formatDims` and `packOnto` take
`Units` and format through `formatLengthBare` (one string measured and drawn, inv 19), `PlanTrio` memoises on `units`;
(2) one `Dimensions in mm` note in the cut-list and Plans-sheet headers, metric only, shown whenever the sheet is open
(bare-number prose appears with no drawing) and printed black; (3) Buying — parts in the project's units (`formatSize`),
trade sizes imperial with mm in brackets (`tradeLength`/`tradeSize`, then one `mmBracket` home after the final review),
nominal names, `8′`, board feet and money unchanged; (4) the metric grid ladder 10 mm / 100 mm / 1 m with 10× sections.
The final review caught `plane 3/4" (19 mm) stock to 19 mm` — a 19 mm part bought from 3/4" stock (0.05 mm thinner);
ruled: in metric the note is omitted when stock and part read the same whole mm. Deploy-gate questions put to the user:
sheet sizes in cut-list prose (bare vs trade form), fu 354 (round-mm parts miss nominal sections — now printed beside
bracketed stock), fu 355. Live pass appended to `docs/browser-verification-metric-display.md`. Follow-ups 357–359.

**What metric display chunk 1 did (2026-10-15, feature gaps §3)** (spec `docs/superpowers/specs/2026-10-15-sloyd-metric-display-design.md`,
plan `docs/superpowers/plans/2026-10-15-sloyd-metric-display-chunk1.md`, branch `metric-1` from `06409b6`). No schema change
(R6: an older build reads a metric project as imperial; rollback free). **Merged, not deployed: chunk 1 deploys with chunk
2** (the user's ruling at plan review — a metric cut-list sheet would otherwise mix mm rows and imperial diagram labels).
User rulings: per-project (`units.display`); whole mm; Buying keeps trade units; a bare typed number is mm in a metric
project; free drags snap to 1 mm; hole diameters and pitches to 0.1 mm; drawings bare numbers plus a sheet note (chunk 2);
approach A (the document's `Units` passed explicitly, inv 52). Plan-review rulings: Materials dialog sizes and Generate's
limits stay imperial; `snapStep` in `geometry.ts` (no `→ units` edge). Subagent-driven, six tasks plus a final review:
(1) `units/length.ts` — `Units`, metric format/parse, `formatMm`, `formatLengthBare`, `formatSize`, `floorToTick`; the
review caught metric `- 19` parsing as INCHES (the bare-number test ran before the sign strip), and the plan's rounding
mutation could not fail (18.5 mm is exact in float; 0.5 and 6.5 mm sit below the half and test the nudge); (2) the
document's `units.display`, `setUnitsDisplay`; (3) cut list, bench lines, the taper refusal (`floorToTick`), Refine's change
list (`formatSize`, the unit once); (4) every field, the tape, guides, dialogs; (5) the Units switch and 1 mm drag snap;
(6) the temporary number/no-units forms removed so the compiler proved every caller converted, plus an ad-hoc length-text
grep (nothing person-facing left but `designCheck`'s messages, fu 355). The final review caught a metric max refused by
float subtraction (`posDim − offset` is not exact under n/25.4 storage — a 1e-9 bound tolerance, inv 22) and drags storing
k·(1/25.4) where typing stores k/25.4 (`snapToGrid`). Live pass: `docs/browser-verification-metric-display.md`. Follow-ups
353–356.

**What the section cut did (2026-10-15, feature gaps §2)** (spec `docs/superpowers/specs/2026-10-14-sloyd-section-cut-design.md`,
plan `docs/superpowers/plans/2026-10-14-sloyd-section-cut.md`, branch `section-cut` from `e56170f`). **Merged to master as `71e8d19` and deployed the same day** (`index-DwixxasK.js`). No schema change; view
state only, so a rollback costs nothing. User rulings: viewport only (no Plans-sheet sections, fu 256 stays its own item);
axis planes placed by slider + exact field + Flip; solid caps built from the exact model, not a stencil trick; editing left
free (picking and snapping filtered to the kept side); approach A (GPU clipping for meshes and edges, exact caps on the
CPU). At plan review the user approved one spec amendment: a body face lying ON the plane and facing the removed side is
capped, because a holed body's mesh subtracts seam faces (inv 50) — a plane typed at a dado's shoulder would otherwise show
a hole into the part; any face exactly on the plane therefore reads as cut. Subagent-driven, seven tasks plus a final
review: (1) `section.ts`' side test (`keptBySection`, the ONE), plane and span; (2) `localCapPieces`/`sectionCaps` — each
convex body clipped by `clipConvex` in board-local coordinates (the plane is always one of the part's own axis planes), the
on-plane face cap, every piece normalised to one winding (pocketCells MERGES cells, so clip caps and face caps mix), bores
subtracted by `minusPrism`; checked against an independent inside-test over every posture, quarter turn and mirror, tapers,
miters and bevels; (3) `unionOutline` — the boundary of the pieces' union, opposite collinear stretches cancelled;
(4) store `section`/`setSection` (reset only with `explode`); (5) the Section toggle and group (stacked under the View group
in one right-hand column — the first placement, bottom-right, collided with the tape readout); (6) BoardMesh: one shared
`THREE.Plane` with `clipShadows`, the cap inside BoardMesh (shares its click handlers and fade/selection), a raycast wrapper
dropping removed-side hits, Move/Tape candidates filtered (guide points exempt: guides are drawn unclipped — a ruling); the
task review caught every cap BACK-facing (board frames are improper, so world pieces wind clockwise as seen by the
viewer; DoubleSide then flipped the explicit normal away) — fixed by rewinding each piece by its Newell normal; (7) the
perf guard — the first measure was 36–38 ms across 42 bores; bucketed line grouping + a sweep, an affine world map and a
per-hole box prefilter brought it to 13–14 ms (fu 348). Plan mutation claims were wrong twice (a kept-side mutation the
pose sweep could not see — a plane through cell interiors caps the same from either side; a guard the store's own refusal
already covered). The final review found a cap material not remounted on fade (three bakes OPAQUE), the right-hand
column swallowing canvas clicks, and caps rebuilt every drag frame — fixed (a per-part cache of the local cap: a move that
keeps the plane's place costs 0.35–0.55 ms instead of 12–14). Live pass: `docs/browser-verification-section-cut.md`.
Follow-ups 347–352.

**What holes chunk 2 did (2026-10-14, fu 327)** (spec `docs/superpowers/specs/2026-10-14-sloyd-holes-design.md` §3.4, §4.3,
§7, plan `docs/superpowers/plans/2026-10-14-sloyd-holes-chunk2.md`, branch `holes-2` from `fc4875e` — master `0a1060c` plus
the §4.3 amendment). **Merged to master as `d74e5c5` and deployed the same day** (`index-DFCdm3n1.js`); no schema change, so a rollback to
chunk 1 (`2ded5cc`, `index-CTpNZw9F.js`) is free. Drawings and the last preset; a part with no holes draws byte-for-byte as
before (the final review compared hole-free `drawView`/`buildDiagrams` against master on 112 cases: identical, the SVG
differing only by the 20 `M` commands chaining drops). Subagent-driven, five tasks, each reviewed:
(1) the Plans sheet — `holeDrawing.ts`' `holeDrawingSegments`: every rim (entry, and a through hole's exit or a blind
hole's bottom) as a `DRAWING_HOLE_SEGMENTS` = 96-gon (the viewport keeps 48), then the wall's two silhouette generators
(none looking down the axis), all built from `toWorld` of board-local points (inv 44); `drawView` runs them through the
same hidden-line pass as the board edges, against the hole-free occluders (inv 47: you cannot see through a hole; a
through-bore's far rim seen down its axis is hidden, pinned). Ruling R1 replaced the plan's self-comparing "no holes draws
the same" test (it compared the code with itself) with `holeDrawingSegments` returning `[]`, the existing drawing tests'
unchanged expectations guarding byte-identity. **The review caught hidden rims rendering SOLID**: 96 separate `M…L`
subpaths each restart the 4-3 dash, and the chords are far shorter than a dash; edge-on rims also zigzagged twice along one
line in the elevations. R2: (a) a rim whose plane is edge-on to the view (|A·T| ≤ 1e-9·|A|) is ONE segment across its
diameter at its depth — its exact projection; (b) PlanFigure's `pathOf` chains a segment into the previous subpath when its
start meets the previous end (1e-9), so a hidden circle dashes continuously. Folded minors: the exploded test asserts hole
lines exist; the front filter checks both ends; an absolute turned case (upright, turn 90, FRONT) with a hand-derived
silhouette x. Timing: `drawView` with 42 holes, 20–28 ms per view.
(2) the part-diagram data — per view `holes` (circles down the axis: the entry face's view opened, the exit view only if it
already exists), `holeSides` ({axis, bottomAt}: the dashed depth box across the axis, only in views that exist for another
reason) and `holeNotes` (each row's bench line, `holeLine`, inv 19). **The review caught a row-order bug**: a through
hole's far-side circle depended on row order (the exit view was looked up before later rows opened their entry views). R3:
three passes — open every row's entry view first, then circles and sides, then notes in STORED row order. Folded minors:
`dir = +1` (entry from min → `bottomAt` `hmax`/`vmax`) and axis `'h'` (an end-grain hole seen in a width/thickness view)
cases, every side index checked, the two-row order test. Two re-review minors (a duplicate row id repeats a note; a
zero-count row opens a view) are unreachable: `takeId` makes ids unique and validation keeps count ≥ 1.
(3) `PartDiagram` draws them: ellipses (the schematic diagram's unequal scales), centre crosses, dashed sides
(`stroke-dasharray: 3 2`), and the notes under the figure beside the angle notes. Review clean.
(4) the **Hinge cup** preset (35 mm × 1/2" deep, 3" from the min end, 22.5 mm in, on the broad face's max side), withheld
where it would fault (thin stock: too-deep). Review clean.
(5) the live check, the final review and its fix wave, these records.
**The §4.3 amendment** (planning chunk 2, approved by the user 2026-10-14): a row's diagram label is its bench line as an
HTML note under the figure, as angle cuts' notes are — not the measured SVG label `21 × Ø1/4" × 3/8"` the spec first named.
Part diagrams have unequal scales (circles draw as ellipses) and `Ø` is non-ASCII (inv 19 would require a browser
measurement); circles, centre marks and dashed outlines carry no text. Inv 19 now says so.
**The live check** (dev server :5181, software GL, `docs/browser-verification-holes.md` "Chunk 2", the profile's fixture
project deleted and its active project restored after): a cabinet side standing on edge (a dado, a 12-pin 32 mm row on its
far face, a 3/8 through-bore) and a door lying flat with a hinge cup. The exploded view drew the cup and bore as ellipses
and omitted the far-face pins (no hidden lines there, as specified); the plan view drew the cup as a circle and the pins as
short dashed depth marks; the Front elevation (down the pins) drew the bore visible and the pins hidden, the hidden path
34 subpaths over 2421 segments (chained, R2); the Side elevation drew 72 single-segment edge-on rims plus silhouettes;
every plan path `fill: none`, hidden lines `4px, 3px`; the cut-list diagrams drew 13 ellipses with centre marks on the side
and one on the door, each row's bench line as a note; 0 console errors.
**The final review** (a fresh reviewer, no Critical; "With fixes") found the ellipse scale untested (rx and ry swapped
survived), the bottom line's position untested and the records unwritten. R4, one wave: rx = r·sx / ry = r·sy pinned on an
sx ≠ sy part; the bottom line's coordinates pinned (one `v`, one `h` case); hole notes keyed by row (`{row, text}`, the
old `key={line}` could collide on identical lines); a FRONT `drawView` through-hole test; `pathOf` chains only within ONE
part (`Seg2.part`: coincident points of different parts no longer join); the Hinge cup label written with ½".
**R5:** the Hinge cup runs along the LONGER of the face's two dimensions (the shelf-pin convention) — spec §7's "length
min end" assumed length is the longer, as on any door; pinned by a test with width > length, where the cup sits 3" from the
width end. **The user's ruling (2026-10-14): keep the cup on the longer side** (fu 343 closed; spec §7 amended).
**R6:** in FRONT the through-bore's edge-on rims lie in the top and bottom face planes set back from the front face; the
view ray grazes the stock, so they are correctly HIDDEN, drawn beneath the coincident visible edges — the fix brief's
"visible" was wrong and the implementer pinned the actual behaviour (no visible difference). Re-review: all seven items
addressed, nothing new.
**Not confirmed here:** a real print-to-PDF (fu 254: no `pdf()` on this host) — the look of the dashes on paper, the
chained dash phase around box corners and at corner joins (chaining continues the phase through a part's own corners), are
for the user's eye (fu 345). An attempt to re-render the sheet's SVG standalone at 4× lost its stylesheet and showed filled
dots; it was discarded as evidence. Deferred: the exploded view computes ~8k hidden hole segments it discards (~25 ms per
sheet; fu 344, with 263's slider lag); record-only minors as fu 346. Test count 3882 → 3932 (135 files). NEXT: none chosen.

**What holes chunk 1 did (2026-10-14, feature-gaps §1)** (spec `docs/superpowers/specs/2026-10-14-sloyd-holes-design.md`,
plan `docs/superpowers/plans/2026-10-14-sloyd-holes-chunk1.md`, branch `holes` from `fbe5ed9`). **Merged to master as `2ded5cc` and
deployed the same day** (`index-CTpNZw9F.js`); **schema 16** (a rollback below 16 refuses every project saved since: export
first). The user's rulings while brainstorming: holes only (a dowel joint is two holes placed by hand); rows
STORED with a count and a pitch (one entry is the jig); Claude features refuse holed projects this round; strict geometry
(a hole sits wholly on one flat face); station / pitch / inset from named ends. A `HoleRow` (face + from, diameter, depth
or `'through'`, along + alongFrom, station, count, pitch, acrossFrom + inset) is board-local, so resizes keep it on its end
and turns and postures cost nothing. Subagent-driven, twelve tasks plus one inserted, each reviewed:
(1) the primitive, schema 16, validation (malformed dropped, faulted kept), `LINK_FIELDS` `holes: 'shared'`;
(2) copies carry rows (`copyBoard`, Make Unique, Group/Ungroup, `resolveBoard`);
(3) `holeInstances` and the geometry helpers, and `holeFaults`, the ONE strict-rule decider (breaks-out, off-flat,
meets-hole, too-deep; exact closed forms, tangent passes);
(4) mirroring by flag flips (`mirrorHoleRow`) with `lowerHoles` its exact inverse;
(5) `partGeometry`'s frozen `holes`, the mouth as air to `stockProbe`, hole-centre snap points;
(6) the 3D view: holed faces triangulated with the rings as holes (shared rim vertices with the wall), the clip split as
the fallback, walls with radial normals, bottoms, rims; a part with no holes byte-for-byte unchanged;
(7) `holeText.ts`' bench line and cut-list grouping by `HOLE_FIELDS` as a multiset;
(8) joinery, Refine and Repair refuse a holed project (`holedRefusal`);
(9) store actions `addHoleRows`/`updateHoleRow`/`removeHoleRow`;
(10) the Holes section ("+ Add hole ▾": Hole, Shelf-pin row; Count as a whole-number field);
(11) the live check; (11b, inserted) rebuild performance; (12) these records.
Planning amendments, approved by the user with the spec: the clip split leaves T-junctions at every rim, so a face every
ring lies strictly inside is triangulated with the rings as holes from the wall's own ring vertices (the split kept as the
fallback); prism caps pushed out by `PRISM_EPS = 1e-7`; a blind hole draws its bottom rim; the mouth is air (every lattice
point lies on the box surface, so "strictly inside" withheld nothing) and centres reuse `'face-center'`; the pitch prints
at 1/64 at least with whole millimetres shown (`every 1-17/64" (32 mm)` — at 1/16 a jig set to `1 1/4"` drifts 1/5" over 21
holes); a faulted row's bench line ends `— check: hole 20 runs past … (and 1 more)` (the user's ruling); the menu reads
"+ Add hole ▾"; an edit is refused only when it ADDS a fault (else a row a resize faulted could never be edited back);
Every hidden, not disabled, at count 1.
Rulings while executing:
- R1: work on branch `holes` in the main checkout, no worktree.
- R2: `links.test.ts` defines its own row rather than importing `holes.test.ts` (importing a test module re-registers its suite).
- R3: axial contact with a rectangular cut's region is off-flat (zero skin at a dado floor breaks through); in-plane tangency stays allowed.
- R4: the strict triangulation also requires the reaching rings pairwise disjoint; overlapping (faulted) holes take the fallback split.
- R5: raising Count from 1 when the stored pitch would make holes meet seeds the pitch in the same edit (32 mm if it clears the diameter, else 2 × diameter).
- R6: a caller-refused DimensionField edit keeps focus and text (`onCommit` returning `false`) — superseded by R7.
- R7: `onCommit` may return a refusal MESSAGE, shown as the field's own error until its own next commit or a resync; no sibling clears it.
- R8: a blurred caller-refused field keeps its text and visible error, as its own min/max refusals do; a later blur may commit it once it fits.
- R9: the wall-grain seam deferred to the user's texture/shader session (fu 336).
- R10: a bounding-box reject before the face × hole test, though it changes the (equivalent) triangulation in ~180 of 245,700 pairs.
- R11: a holed body skips internal seam faces (inside the stock, invisible; the main earcut cost); unholed parts byte-for-byte.
- R12: helpers may take a precomputed `axisFrame` (a frame-bound mapper through inv 44's helpers, never `board[dim] - u`).
- R13: the permanent perf test bounds ≤40 ms per healthy case (median of 7), passing 3 runs in a row on a quiet machine — the median superseded by R19.
- R14: R11 generalised to covered-region subtraction (exact coincidence matched nothing in the dado fixture).
- R15: a CLEAN hole's wall and bottom are emitted unclipped; a faulted hole keeps the per-body clip.
- R16: the 16 ms target is judged in node (vitest adds ~1.5×); too-deep joins the clean predicate (else a blind hole past the back face would draw outside the part).
- R17: the final review's fix wave (below).
- R18: count-1 rows still compare `pitch` exactly (spec §4.2) — recorded for the user (fu 338).
- R19 (after the records): `holesPerf.test.ts` times the MINIMUM of 9 runs instead of the median (load can only inflate a run); bounds unchanged, the revert mutation still fails the faulted case (fu 340).
Reviews caught: zero skin at a cut floor passing while zero skin at the back face was too-deep (Task 3, R3); the strict
triangulation capping the mouths of overlapping holes (Task 6, R4); a single hole that could never become a row, and a
refused field edit blurring with the refused value showing (Task 10, R5–R8). **The live check** (dev server :5181, software
GL, `docs/browser-verification-holes.md`, two passes, the profile restored after each) confirmed the import, the Holes
section's lines equal to the cut list's, holes rendering open with lit walls, a through-bore showing the ground, no membrane
at the dado seam, a shrunk part keeping its faulted row with its note and `— check:` line, Count refusals owned by the field,
and the joinery/Refine refusals; it found (1) rebuilds of a holed part at 107 ms (two 21-pin rows), 131 ms (with a clear
dado) and ~580 ms (a row crossing a dado) against 0.5 ms unholed — **the user: fix before merge**, so Task 11b (R10–R16):
node medians 11.9 / 12.1 / 24.7 ms, guarded by `holesPerf.test.ts` (≤40 / ≤100 ms in vitest); (2) the wall-grain seam —
**the user deferred it** to a texture/shader session (R9, fu 336); (3) rims indistinguishable at screenshot scale; (4)
"Row Of 6" (CSS capitalisation). Software GL could not confirm shading and grain inside a bore, rims, drag smoothness
(in-browser timings were 1.5–9 s per edit with or without holes), faded holed parts, or cracks at overlapping holes (fu 337);
Tape centre-to-centre and a mirrored holed copy were unit-tested only. The final review (a fresh reviewer, no Critical)
found: the bench line counting too-deep per hole while the note counted it once; one mesh and six materials per hole (42
meshes on one drilled side); unchecking Through seeding half the face dimension (15" on an end-grain row); `mm` multiplying
(n × 0.03937… ≠ n / 25.4 for 5 and 22.5). R17 fixed all four in one wave (`distinctFaults`, `holesMesh`, a 1/2" seed cap,
`mm(n) = n / 25.4`) with its minors: snap centres pinned in upright and on-edge poses at turns 90 and 270, an explicit expect
for the shaped Refine case, `sharedPatch` copying rows, "Row of 6". Deferred minors as fu 340–342. Test count 3724 -> 3882
(134 files). Next: chunk 2 (fu 327).

**What custom materials chunk 2 did (2026-10-14, fu 266's second half)** (plan
`docs/superpowers/plans/2026-10-14-sloyd-custom-materials-chunk2.md`). Nominal lumber names: `src/units/nominal.ts` (the
seventeen US softwood sections, an EXACT matcher at 1e-9 in either order, whole-foot stock lengths as `8′`); pine sold in
nominal sizes; a new nominal custom material starts from a 29-size yard list (1× at 8′, 2× at 8′/10′/12′, 4×4 at 8′); cut-list
rows lead their names cell with the section only when EVERY board is exactly it; Buying reads `2×4 × 8′`; a Properties
"Nominal size" select (one edit; keeps a part's stored thickness/width order when the selection shares it); the dialog's
"Sold in nominal sizes" switch (a new row's prices follow it, a stored row's never). User-approved amendments: the name's
place (the names cell, not the 11em dims cell), the select's label, the layout key label staying actual, the order rule.
Subagent-driven, five code tasks; reviews caught the name printing cream-on-white (the print colour list) and, at the final
review, a missing space (`1×4Rail` in copied text), an amendment with a wrong reason, and an untested approved rule — all
fixed. Live check on the dev server, free. No schema change. 3724 tests across 128 files. Residue fu 326.

**What custom materials chunk 1 did (2026-10-14, fu 266's first half, feature-gaps §3)** (spec
`docs/superpowers/specs/2026-10-14-sloyd-custom-materials-design.md`, plan `…/plans/2026-10-14-sloyd-custom-materials-chunk1.md`).
The user chose all four purposes (more species, other sheet goods, construction lumber, nominal names everywhere),
storage in BOTH a browser library (`sloyd.materials.v1`) and each project file (`doc.materials`, schema 15), Refine keeping
custom materials (Generate staying on the built-ins), nominal names by a per-material switch, edits applying where you
make them, and an explicit catalog over a global registry. While planning, the kind moved INTO the id (`m-s-`/`m-v-`/`m-p-`;
an amendment the user approved), so every kind-only reader kept its `(id)` signature and shop validation stopped depending
on the open project. Lumber & prices became Materials & prices (a pure `materialsDraft.ts` plan; one Save = one undo entry +
library + prices); Properties' picker lists built-ins, the project's and the library's materials (one label each) and
New material…. Ran subagent-driven, ten tasks, each reviewed; the reviews caught real data hazards: the old prices dialog
dropping custom prices on Save (Task 3), untouched sheet sizes rounded to 1/64" and rewritten on every Save and a library
able to hold two "White ash" (Task 6), the dialog's rows going stale after a half-failed Save (Task 7), and Refine's
converter turning custom parts to pine before the carry (Task 9 — a plan defect; the converter now takes `materials`).
The final review added: prices' `extra` lost across write → read (pre-existing, made reachable by a v14 rollback), the
definition-part load path unpinned, unsaved new rows unremovable; all fixed. Live check on the dev server with the user's
two approved paid calls: the per-project Refine schema compiled (`req_011Cg1QMMMwRho2oZCqsS4XQ`), and "make the Ash board
cherry" kept the untouched Baltic-birch part's custom material and pruned Ash (`docs/browser-verification-custom-materials.md`).
3694 tests across 127 files. Residue fu 324, 325; nominal names are chunk 2.

**What AI angles chunk 2 did (2026-10-14, fu 277)** (plan `docs/superpowers/plans/2026-10-13-sloyd-ai-angles-chunk2.md`).
Generate and Refine read and write miters, bevels and chamfers. `angleWorld.ts` is the one crossing between the design's
world words and stored cuts (through the Properties writers), recognising stored cuts structurally; the design schema gains
`miters`/`bevels`/`chamfers`; one stored order (tapers, miters, bevels, chamfers); Refine refuses only a cut it cannot
describe or the converter would reject on the re-encoded part (`'angle-form'`), and keeps untouched angles exactly through
an exact-angle map (measured while planning: rewriting run × (depth ÷ run) is exact in 18,879 cases); the design fault
widened to `angle-joint` (renamed from `taper-joint`); the change list names each kind (change kind `taper` → `angle`); role
linking re-stores every kind under turns. The live Generate was first REFUSED by the API — the schema's compiled grammar
was too large once the part (written twice, loose and in assemblies) gained three arrays; the unit suite cannot see that
limit. With the user's approval, three tiny probes showed `$defs` fixes it (the inline expansion refused, the `$defs` form
and even that plus two more arrays compiled; fu 322); `DESIGN_SCHEMA` now defines the part and the direction once. Then
both paid runs passed: a Generate gave four chamfered legs linked through turns, a top chamfered on four edges and a flat
45° frame (≈ $0.08); a Refine changed only the top's chamfers, everything else back byte for byte (≈ $0.04)
(`docs/browser-verification-ai-angles.md`, "Chunk 2"). Plan defects ruled while executing: Refine's design needed the empty
arrays from Task 2, not Task 4; four mutants survived until tests were added (edge order, the runRefine wiring of the
exact-angle map, the map in linking — a Refine-kept 0.7 slope). The final review (a fresh reviewer) found: Refine refused a
hand-made miter or bevel after a resize (fixed: any stored run is the same plane); the change list hid one of two bevels on
a face (fixed: keyed by face and long point); a false "no wood" for two miters (fixed: the pair check removed — two miters
always leave wood at their shared long-point corner); and the prompt's mitered box on a thin bottom tripped chunk 1's joint
rule at the rabbet — the user ruled a miter on the rabbeted part passes. Minors as fu 323. Test count 3501 -> 3568. No
schema change (SCHEMA 14). Merged to master as `a4914f1`; deployed 2026-10-14 (`index-D6x3XODA.js`).

**What AI angles chunk 1 did (2026-10-13, fu 276/277's remainder, fu 307)** (spec
`docs/superpowers/specs/2026-10-13-sloyd-ai-angles-design.md`, plan `docs/superpowers/plans/2026-10-13-sloyd-ai-angles-chunk1.md`).
Add joinery and Repair stop refusing mitered, beveled and chamfered projects. The user's rulings: accept the angles with no
new joint kinds; a miter does not hold (a sloped face is never a contact); world words for every kind (chunk 2); two
chunks; and, ruled while writing the spec, the tenon-clearance exception (a chamfer or bevel running the length of a rail
through its tenoned end is allowed when it clears the tenon's section, so chamfered rails stay joinable). Every angle cut
gets a touched box (`touchedRegion`: the smallest box holding all it can remove); contact (`contactRegions`) applies the
taper rule unchanged, then splits what is left around each other cut's touched box (`splitRegion`, disjoint pieces, never
removed wood). `angleConflicts` refuses a cut whose touched box overlaps a joint's patch by more than TOUCH, except a cut
on the entering part that clears the tenon; `jointRefusal` is the one sentence-per-part message (a taper's sentence wins
on its part). `rebaseAngleCuts` keeps every angle cut on its wood when joinery grows or trims a part (fu 307 closed).
`isTapered` became `isAngled`. Three spec examples were corrected while planning against the code (an upright mitered
frame reports its top rail, `unsupported`, not its stiles, whose long points reach the floor; the refused rail chamfer is
5/8in, since a 1/2in width leg exactly meets the 1/2in shoulder; Repair never read the joinery refusal). Executing, three
plan fixtures were too weak (two mutants survived until strengthened; a flush-apron fixture used absolute coordinates on
a centred design). Live, on a fresh dev origin (port 5241): the joinery dialog showed the miter sentence for a rail
mitered at its leg and listed "Rail X → Leg: end into face" for the 1/8in-chamfered rail
(`docs/browser-verification-ai-angles.md`). The final review (a fresh reviewer) found: the unjoin gate did not undo the
rebase, so a joined Refine or Repair refused a re-anchored cut and blamed the user (fixed, `resizeAt`); and a hairline cut
under TOUCH on a growing joined end passed the joint rule, then bit the tenon as the part grew through its fixed line —
the spec contradicted itself (§3 allowed it, §4 assumed it refused), so it went to the user, who ruled: refuse it,
however small. Minors recorded as fu 321. Test count 3474 -> 3501. Merged to master as `be4c87c`; deployed 2026-10-13 (`index-DQwrQ8u9.js`). No schema change (SCHEMA 14); rollback is free.

**What standard views + image export did (2026-10-13, feature-gaps §2, fu 260)** (spec
`docs/superpowers/specs/2026-10-13-sloyd-standard-views-image-design.md`, plan
`docs/superpowers/plans/2026-10-13-sloyd-standard-views-image.md`, executed inline with one whole-branch review): the View
group gains Front · Side · Top · Iso, read from the Plans sheet's own `FRONT`/`SIDE`/`TOP`/`ISO` so the viewport and the
sheet name the same faces, and a Save image button that downloads a clean PNG of the view through a new
`StorageAdapter.exportImage`. The framing arithmetic moved into a pure, tested `viewport/framing.ts`; F, Home, the
projection swap and the views now frame exploded parts where they are drawn (fu 260). Two spec amendments came from
reading the source while planning: the camera's `up` stays +Y (three-stdlib's OrbitControls orbits about `object.up`;
Top tilts 1e-4 rad toward +Z instead), and the tools are hidden by a `hidden` prop for the clean frame, never unmounted
(their unmount cleanup ends gestures). The capture renders one clean frame and reads it with `toBlob` in the same task,
so `preserveDrawingBuffer` stays off. A plan-supplied axis test compared against the module's own table and could not
catch a swapped table; it was rewritten to read the sheet constants. The live pass (`docs/browser-verification-standard-views-image.md`)
found the dev origin was not fresh (the user's 16 projects and key); only the check's projects were deleted.

**What fu 302/303 did (2026-10-13)**, at the user's word, bounded and done directly with an independent review: a pair with a
tapered part is measured for overlap on the two parts' real world bodies (their intersection through `clipConvex`, reported
by its extents, only when their boxes overlap), and the tip check weighs a tapered part by its real bodies (`partMass`,
tetrahedra from an interior point). Untapered results are byte-for-byte unchanged. The review measured the first version at
~28x slower on 240 tapered legs (no box prefilter, bodies rebuilt per pair) and found a part with no wood would poison the
centre with NaN; both fixed and pinned. A chunk-1 tip test relied on box weight and was widened (6in top) to keep its reason.

**What turned links did (2026-10-13, fu 301)** (spec `docs/superpowers/specs/2026-10-13-sloyd-turned-links-design.md`, plan
`docs/superpowers/plans/2026-10-13-sloyd-turned-links.md`, subagent-driven): a generated or refined table's four inside-tapered
square legs are ONE linked component. `linkByRole` aligns angle-cut ids to the class representative (identical tapered parts
had never linked: the converter minted fresh ids and `sameShared` compares them) and tries each part at the other quarter
turns that keep its world box and grain axis (`turnCandidates`, tapers re-stored through `taperWorld`), so the legs are stored
at 0/90/180/270 on one Shape. The prompt gives inside-tapered legs one role. Mid-task ruling: cut ORDER is not geometry —
`regroupShapes` groups order-insensitively and the unjoin gate matches cuts as a multiset — or joinery split the legs back
into two pairs and Refine would refuse a joined linked table. Final review: a non-square size edit on one turned leg grows
legs along different axes; the user accepted it (fu 318). Live (free): editing one leg's taper start moved all four.

**What fu 313 did (2026-10-13)**, at the user's word: the AI-tapers test and wording residue. `taperCutsFor` tested in every
pose with two adjacent faces (a four-face version let a min/max mutation survive), NaN and a second-entry fault; a
non-finite taper number rejected as `taper` with its own words; the plural `taper-form` message pinned; a test that could not
fail removed; the prompt's typical-start sentence reworded and all four corner rows pinned. By decision, the same face named
in two entries toward one end stays allowed (Properties allows it; refusing would make Refine refuse such hand-made parts).

**What fu 310 did (2026-10-13)**, at the user's word: `designDiff` compares tapers face by face (a sloped face toward one end)
at display precision, so only faces added, removed or changed get a line ("taper removed (-x)" when one of two goes), faces
sharing a kind and values share a line, and a regrouping or a sub-display difference is not a change. Done directly
(bounded), five tests, two mutations.

**What fu 311 did (2026-10-13)**, at the user's word after AI tapers shipped ("show the fault only once"): when a joined Refine
comes back unjoined, the dialog no longer lists the model-facing `taper-joint` violation under the "Joints were not
re-applied." note; it still counts as an issue and `violations` is unchanged. Done directly (bounded), one mutated test.

**What AI-tapers chunk 2 did (2026-10-13)** (plan `docs/superpowers/plans/2026-10-13-sloyd-ai-tapers-chunk2.md`, subagent-driven,
a review per task and a whole-branch review; spec amended while planning, user-approved): Generate and Refine read and write
tapers. The design schema carries `tapers` in world directions (`taperWorld.ts`: the one world↔stored crossing, through inv
44's helpers; generated tapers stored through `taperCut`); a taper running into a meeting is a `taper-joint` design fault in
`evaluateDesign` (advice floored to 1/16 so following it passes); Refine describes standard-form tapers exactly, refuses
before any call one it cannot describe or the converter would reject (`taper-form`), counts the original's own taper
conflicts as preexisting, and KEEP_LINE keeps tapers; joined Refine proves angle cuts in its gate, refuses an original whose
taper already runs into a joint, and returns an unfixed result unjoined with a note (the spec's "cannot refuse" was false);
the change list names taper changes; the prompt teaches inside-face tapers corner by corner. The final review caught Refine
sending the model hand-made tapers its own converter rejects (knife edge, opposite faces, a part wider than long, start past
a shortened length) — fixed before merge. Live: one paid Generate ("Shaker side table with tapered legs", $0.05) gave four
inside-tapered legs below 5" aprons with no repair round; one paid Add joinery ($0.03, estimate $0.02–$0.14) gave 8
mortise-and-tenons with the tapers byte-identical. The user approved the joined table by eye. Residue: fu 310, 311, 313.

**What AI-tapers chunk 1 did (2026-10-13)** (spec `docs/superpowers/specs/2026-10-13-sloyd-ai-tapers-design.md`, plan
`docs/superpowers/plans/2026-10-13-sloyd-ai-tapers-chunk1.md`, subagent-driven, a review per task and a whole-branch review):
Add joinery and Repair joints accept tapered parts (every other angle kind is still refused; Refine refuses all until chunk 2).
A taper whose sloped wood reaches a joint's patch refuses the whole run before any call (`taperConflicts`, one decider
`joineryRefusal` shared by `runJoinery` and the dialog), naming the part, the other part and a start floored to the display
grid so following the advice passes (the final review caught it rounding up). The checks read `contactSolids` for a tapered
part — only its still-flat wood holds, grounds or forms the tip footprint; untapered pairs are byte-for-byte unchanged.
Residue: fu 301–308. Rulings surfaced to the user: joinery's angled message reworded (spec §4.3 amended), a 1e-9 boundary
tolerance, fu 304 closed by decision, fu 307/308 recorded rather than fixed.

**What fu 299/300 did (2026-10-12)**, the user's wording ruling after angle cuts shipped: one face vocabulary (`faceName`
— a length face is "the length max end" in every angle line, as miters and tapers already said), short chamfer Edge labels
(`Width max side · thickness max side`, no longer clipped), and one refusal pattern (`Removes more than the <dimension> —
reduce the <control> first.`). Done directly (bounded), three mutated tests, checked on the dev server.

**What angle cuts chunk 3 did (2026-10-12)** (plan `docs/superpowers/plans/2026-10-12-sloyd-angle-cuts-chunk3.md`,
subagent-driven): the Bevel and Chamfer presets, completing angle cuts. A bevel (Face, Long point, Angle) runs along the
length and slopes across the other cross dimension, its slope stored as a ratio like a miter's; a chamfer (Edge — any of
twelve, canonical face-before-along — and Size) stores its legs exactly. Final bench wording, approved with the plan:
`Bevel 15.0° off the width face (max side), across the thickness, long point on the thickness min side`, `Chamfer 1/8" on
the edge between the width face (max side) and the thickness face (max side), along the length`. Reviews tightened the
bevel reader (an offset hand-edited line becomes read-only instead of being rewritten), made chamfer legs exact for
decimals, kept a chamfer on a resized part editable, rewrote two plan tests that could not fail, and added the missing
refusal tests (each half of the edge-change guard, the Bevel menu gate). Residue: fu 298–300. No schema change.

**What angle cuts chunk 2 did (2026-10-12)** (plan `docs/superpowers/plans/2026-10-12-sloyd-angle-cuts-chunk2.md`,
subagent-driven): the Miter preset. Properties' Angles section gets a "+ Add ▾" menu (Taper, Miter, Miter both ends — the
pair is one undo entry and a picture-frame trapezoid) and a Miter row (End, Across, Long point, Angle). Fields carry the
stored slope RATIO, not degrees, so 45° stays depth = run exactly through any edit of side or end; DimensionField gained
parse/format props and AngleField wraps it (one set of edit rules). Reviews and the live check found the angle field
stating a rounded-up maximum it then refused (fu 293, now floored), presets allowed on parts wider than long (now
withheld), and — the user's call — a miter line that did not say which side the long point is on (fu 294: it now ends
"long point on the width min side"). Residue: fu 295–297. No schema change.

**What angle cuts chunk 1 did (2026-10-12)** (spec `docs/superpowers/specs/2026-10-12-sloyd-angle-cuts-design.md`,
plan `docs/superpowers/plans/2026-10-12-sloyd-angle-cuts-chunk1.md`, run subagent-driven with a review per task):
**schema 14** adds `Board.angleCuts` — single-angle plane cuts, each a half-space (two points on a line in the
`face` × `along` plane, straight through the third dimension) with a stored `kind` (taper / miter / bevel / chamfer) that
names it but never decides geometry. `boardSolids` became `pocketCells`; the new `boardBodies` clips each pocket cell into
a convex body, and everything that draws, edges, occludes or probes stock reads bodies through one cache
(`partGeometry`): the 3D view (grain on sloped faces from the nearest axis's plan), `bodyEdges` (an edge where faces meet
and are not coplanar; agrees with the old grid rule on a 200-board sweep), snap points (removed corners withheld, sloped
corners offered), the Plans sheet's hidden lines. The cut list prints bench lines (`Taper 5/8" off the width face (min
side), from 24" from the length min end to that end`) and a short point (the least, over the end-face corners, of the
length less both ends' depths — the user approved this correction to the spec's formula after the final review found
parallel ends printed 13" for 16-1/2"); part diagrams hatch the wedge in every through-face view. Mirrored instances
reflect angle cuts by a flag flip; write-back keeps a taper on its world face through a flat↔upright change (a bug the
Task 4 review reproduced, in both the plan's code and the first fix). Add joinery and Refine refuse angled documents;
Repair is not offered. Properties gets an Angles section with **+ Add taper** only (Miter is chunk 2; Bevel and Chamfer
chunk 3). Reviews caught a dozen real defects the plan's own code carried (duplicate snap markers off the origin, a
taper deepening toward the far end losing its start, a print-invisible wedge outline, a face switch writing a removal
past the face, a per-drag-frame 28 ms snap recompute, a hooks-order crash class). Residue: fu 275–292; sloped-face
shading and grain await the user on real hardware (fu 282).

**What the 254 / 264 / 273 fixes did (2026-10-12)**, each asked for by the user after its round shipped, each deployed:
**fu 254** — the plans trio's scale also fits `TRIO_MAX_HEIGHT` (1250 units, Letter's printable ratio), and every plans
figure is drawn at its share of the page width rather than stretched to 100% (which would have undone the cap and also
affected the exploded figure); a 36x12x72 bookcase now prints 82% wide, aspect 1.523. **fu 264** — a container with ONE
child is not a level: explode weights stay full until the first branching container, and the sheet skips a definition
whose every placement is a sole child (its drawing repeated the one above it). **fu 273** — the priced-size rule is
unchanged, but the Buying section now names a smaller unpriced size that would hold a board (once per pair, with a
count). Session close: the user chose **tapers and miters** (`docs/feature-gaps.md` §1) as the next round, to start in
a fresh session.

**What the lumber yield & cost round did (2026-10-12)**: the cut list ends with a **Buying** section — per material
what to buy and what it costs — and a project total; no schema change (spec
`docs/superpowers/specs/2026-10-12-sloyd-lumber-yield-cost-design.md`; `docs/feature-gaps.md` §3). The user's rulings:
both buying modes (hardwood by the board foot with a waste factor, dimensional lumber by the piece), prices in THIS
BROWSER rather than the project (`sloyd.shop.v1`, through `StorageAdapter`; per-project overrides are a later round),
several stock sizes per material with the packer choosing the mix. By the piece reuses the sheet packer's shelf core
(`packOnto`): grain locked along the board, the largest size opened first, then each board swapped down to the
cheapest size that still holds its parts (proved by re-packing) — a heuristic, said so. Three amendments while
planning: a part comes from the thinnest stock that can actually HOLD it (a 10"-wide ¾" shelf from 1"×11¼", planed,
rather than "unplaceable"); board layouts reuse `SheetLayout` with a `noun`; defaults are `defaultShop()`. The plan's
code was prototyped and run before the plan was written (the whole tree applied cleanly: 3038 tests), and the round ran
inline. Browser pass on a fresh dev port (`docs/browser-verification-lumber-yield-cost.md`): every check passed;
cleanup removed only the check's own keys. Residue: fu 265–274 (273, 274 from the final review; it also fixed a false "$0.00" total, the dialog losing a material's settings on a mode round trip, end grain priced as long grain, and unknown materials erased on save).

**What the plans-sheet round did (2026-10-11)**: a printable **Plans** sheet and a live exploded view, no schema change
(spec `docs/superpowers/specs/2026-10-11-sloyd-plans-sheet-design.md`; `docs/feature-gaps.md` §2). The sheet holds an
exploded isometric, then dimensioned third-angle elevations (front, right side, plan, one scale) of the whole piece and
of each assembly (a placed-twice definition once, "× 2", with a mirrored copy noted). The viewport gets an Explode
slider that makes the model **read-only while exploded** (invariant 47). Drawings are exact vector geometry: edges from
`boardEdges` (inv 16), occluders from `worldSolids` (inv 38), no rendering, so 26a does not apply to them. New:
`document/{drawing,explode,dimensions,plans}.ts`, `panels/{PlansSheet,PlanFigure,planDims,planLayout}.tsx|ts`, and
`toWorld` exported from `snapPoints.ts` as the one local-to-world mapping.
**Three spec amendments found while planning.** (1) **Telescoping weights**: the first explode used weight k on every
level, and the per-level terms telescope to `k·(centre(p) − centre(root))`, plain radial explode, not the hierarchical
option the user chose. The top level keeps weight k and every deeper level takes `EXPLODE_INNER` (0.5, must stay below
1), so an assembly moves out as a unit and then opens a little. (2) **Closed-box seams**: occlusion by the strict
interior of each box called a mortise wall visible, because `boardSolids` splits a cut board into abutting boxes and the
ray along the seam is in neither interior. A ray along a seam is inside; a point is hidden by a box when the ray travels
a positive length inside the CLOSED box grown by half of `DRAW_EPS`. (3) **The layer split**: `dimensions.ts` (document
layer, values and strings as exact differences) versus `planDims.ts` (panels, fitting with `labelWidth`, inv 19).
**Store.** `explode` (0..1) is view state; `setExplode` is its one writer and leaving 0 goes only through
`setTool('select')`. The review found that a gate in `edit()` alone is not enough: `editRekeyed`, Group, Ungroup,
`removeGuide`, `clearGuides`, `deleteBoards` and `addBoard` mutate state (re-key, drop hidden ids and held points, set
`pendingLengthFocus`) BEFORE calling `edit()`. Each now has a `readOnly()` entry guard; `edit()`, `undo` and `redo`
remain the backstop, `setTool` refuses all but Select, `renameItem` returns the stored name. The UI lock is a
`<fieldset class="edit-lock" disabled>` with `display: contents`, so the sidebar's flex layout is unchanged (the first
version made the guides footer the flex item and lost its 34% cap).
**Browser pass (user watching; `docs/browser-verification-plans-sheet.md`)** found four things. F1: every chain on
casework was omitted as "too dense" (the one-third-dropped arm of spec §5.3 always fires with 1/4"-3/4" panels); **the
user's decision**: drop only the narrow segments, with a note ("N small spacings not labelled"), and omit a chain only
past `CHAIN_MAX` (12) labelled segments. F2: the plans SVG printed in the screen's light ink; fixed with the cut list's
print rule. F3: Move and Tape did not look disabled while exploded; fixed. F4: at 100% the lower drawer sank below the
floor; **the user's decision**: lift the exploded set by `dy = max(0, assembledMinY − explodedMinY)`. Final constants:
`EXPLODE_SPREAD` 1, `EXPLODE_INNER` 0.5, `CHAIN_MAX` 12; the user approved the spread on software GL. Not confirmed:
real print-to-PDF (fu 254; Playwright has no `pdf()`) and the spread on real hardware (fu 255).
Residue: fu 252-258 (callouts, user-placed dimensions, print-to-PDF, spread constants, section views, joint-direction
explode, live dimensions). Test count 2933 -> 2998. No schema change (SCHEMA 13); rollback is free. On `plans-sheet`,
merged to master the same day; **not deployed**.

**What the ui-polish round did (2026-10-11)**: a restyle and regroup, every control kept, by the user's choices
(spec `docs/superpowers/specs/2026-10-11-sloyd-ui-polish-design.md`). Measured first on the dev server: at 1440×900
the header wrapped and overlapped (⚙ over the Origin checkbox, Guides over "Saved locally"), an assembly's six
actions wrapped into a 3×2 grid, the Mirrored checkbox split from its label, a part with a cut scrolled the panel.
Decisions: **palette A** — a warm grey toolbar and floating chrome (`--grey-*`; the plan once said slate, the user's
mockup was grey), walnut panels and dialogs (`--walnut-*`), a honey-oak accent (was brass), a pale maple viewport
(`GROUND` `#ebe3d4`, grid and hemisphere ground warmed, selection emissive oak; snap colours unchanged); rules read
surface ROLES (`--surface`, `--control`, `--rule`, `--ink`…) and the grey context re-points them, so one button rule
serves both materials; no `--graphite`/`--brass` survives. **Layout B** — the header holds project-level actions
(project, Add board, Cut list, **Claude ▾** holding Generate/Refine/Add joinery, undo/redo, ⚙, save state, Export);
tools, projection and Grid/Origin/Guides float over the viewport (`ViewportControls`; the three toggles became
`aria-pressed` buttons), the Move hint bottom-left, the tape readout still unconditionally mounted bottom-right
(inv 28). **The action table** — three visible actions per selection kind, the rest under **More ▾**, Delete a
right-aligned trash icon (`ActionBar`, spec §4.2); `CopyInRow`'s open state lifted so More can open it. Properties
fields side by side (Size, Position, Orientation & stock as grids; kind chip; "Runs" → "Grain runs"; cuts as cards
with a ✕ and a count). **Guides auto-open** — the one behaviour change: Guides became a footer (`GuidesFooter`),
closed by default, opening itself when the guide count goes up, never closing itself; the state is component-local
view state. Dialogs and the cut list sheet are walnut, one control rule styles every select/checkbox/radio (oak
`accent-color`), Generate's limits one row of three and its Generations radios inline. Files added:
`src/panels/Popover.tsx` (a disclosure menu with ProjectMenu's closing rules; it focuses the trigger before running
an item so App records the opener; ProjectMenu keeps its own copy), `ViewportControls.tsx`, `ActionBar.tsx`,
`GuidesFooter.tsx`, `src/palette.test.ts` (twelve ink/surface pairs at ≥ 4.5:1, and the retired tokens). Test churn
moved routes only (tests open Claude ▾ or More ▾ first); assertions stayed. What the reviews and passes caught: the
plan's claim that no test named "Stop short of" (eleven did), Generate's radios stacking under the new `.field` until
Task 8, Copy in a row's radios jammed against their text by the global control rule, a missing `props-title` on the
group panel. Live pass on the dev server (`docs/browser-verification-ui-polish.md`) at 1920×1080 and 1366×768: the
header fits on one line with nothing overlapping at both; focus returns to ⚙ and to the Claude trigger after a real
click; More ▾ and Claude ▾ close on Escape and outside click; at 1920 a part with a cut shows without scrolling; the
assembly action row fits the 380px panel floor; Generate's radios share the legend's line at 1366; the printed cut
list is pixel-identical before and after; contrast measured (lowest `--alert` on walnut-800 at 4.73:1); the snap
markers legible on maple, cyan edge midpoint the weakest at 1.86:1 (unchanged from the old ground). Could not
confirm: the colours on a real GPU (26a; fu 248), real print-to-PDF (70/79/84), browsers other than Chromium on
Linux (fu 250). Residue: fu 248–251. Test count 2881 -> 2925. No schema change; rollback is free.
Merged to master 2026-10-11 (`14609fe`, `--no-ff`; merged tree 2925 tests, build green) after the whole-branch review and one fix wave. Deployed the same day as `index-pwj6gaFP.js` / `index-snqYHkpL.css` (commit `2429c51`): hashes at the edge and in-network, CSP at the edge, a page load with 0 errors, the verifying browser's `localStorage` cleared and read back empty.
**After the deploy, the same day — three follow-ups closed:** fu 248, the user looked on real hardware: "The viewport
colors look fine." Fu 250, at the user's request: ProjectMenu got Popover's null-`relatedTarget` focusout guard, and its
caret, Duplicate and arm buttons focus themselves on click (unlike Popover's items, those two leave the popup open, so
Escape needs focus inside); seven tests in `ProjectMenu.test.tsx` plus Popover's missing stale-press test, every part
mutated red; real clicks in Chromium unchanged; Safari itself unavailable here (`af3928d`, live as
`index-c2pDi0bK.js`). Fu 249, at the user's request ("they do kind of stick out"): the snap markers recoloured to muted
milk-paint tones — moss `#3a6028`, verdigris `#378988`, mulberry `#753c60`, slate blue `#5469a6` (also the tape) —
found by a search under floors now written in `SnapMarker.tsx` (≥ 3:1 on the ground, ≥ 3.4:1 against the ring,
mutually distinct under simulated deuteranopia/protanopia, clear of the selection oak); the old cyan was 1.86:1 on the
ground and the old violet/blue pair indistinguishable to those viewers. The user judged them on the dev server; a
scripted per-wood hover sweep was stopped by the user as unnecessary (`d5dc553`, live as `index-DrjjRDmM.js`). Test
count 2925 -> 2933. Residue: fu 251 only, record-only.

**What the mirrored-instances round did (2026-10-11)**: fu 225's first item, a LIVE mirrored copy, by the user's
choices (live copy, assemblies only, Copy mirrored + a Mirrored checkbox, approach A: the mirror inside the one
composition). **Schema 13** (`Instance.mirrored`, stored only when true; no step; harm one version back: wrong
geometry). `placeBoard`/`placeInstance` reflect a child first (turn negated, cuts mirrored along the posture's turn-0
X dimension with `mirrorCutAlong`, moved verbatim to `mirrorCut.ts`, min corner reflected); every world part stays an
ordinary board, so the viewport, cut list, sheet, checks, snapping and joinery are unchanged. Write-back is the exact
inverse (`lower`/`lowerDelta`/`lowerCuts`, positions as deltas, an untouched cut maps back to the same stored object;
a Properties resize keeps stored cuts, keepWorld re-mirrors at the new size); world->local vectors go through
`toLocal(containerLinear(...))` (`containerTurn` removed). `setMirrored`/`mirroredCopy` share `placedBox`/
`replaceKeepingBox` with `turnInstance`; Ungroup lifts a shaped part through a mirror as plain; Refine refuses a mirrored
assembly. What the reviews caught: a Properties resize through the mirrored copy rewrote every copy's cuts (ruled
against spec §4); a copy-in-row test that could not see the mirror; a near-copy of turnInstance's box rule; and, in
the final review, Link flipping the source's cuts across a mirror (Shape built from world cuts) and a posture change
throwing on a Shape spanning both mirror sides. The user decided: Link refuses a part with no occurrence on the
source's side (narrowed from "any mirror crossing" so linking inside a mirrored pair works) and a flat<->upright change
is refused only when a Shape user has no occurrence on the edited side; two further rounds removed the last
"disagreeing edits" throws (Link now writes no shared field through an occurrence). Live check on the dev server
(`docs/browser-verification-mirrored-instances.md`): Copy mirrored abuts and badges; the cut list splits the one-handed
Side and merges the symmetric Top; an offset edited on the right half appears mirrored on the left. Residue: fu 247.
Test count 2811 -> 2881. Rollback: a build below 13 refuses every project saved after the deploy; export first. **Deployed 2026-10-11** as
`index-Ck21KxtH.js`, CSS `index-DzUjIHyD.css` (deployed commit `a11ec0b`, docs-only past the merge `e553f57`), confirmed
by page load, bundle hash and the CSP at the edge and in-network; the load's fresh project stored `version: 13`;
`localStorage` cleared and read back empty twice.

**What the 229/233 round did (2026-10-11)**: two follow-ups whose remedies were written down; the user asked for
"whichever follow-ups make sense" (221 fails safe and its remedy was judged not worth it; 234 is an unmeasurable
prompt change; 225, 232 and 241 are open by decision). **No schema change.** Fu 229: `ungroupItem` returns a `Lift`;
a hidden assembly dissolved in another copy passes its hidden-ness to its lifted children (deduped; several ungroups
compose in order). Fu 233: `evaluateDesign` drops the placed ceiling's report when the distinct cap fired and the
counts are equal (no repeated assembly). Final review (opus): ready to merge, 0 Critical/Important; the stale
`editRekeyed` comment fixed and inv 46 notes the lift. Test count 2808 -> 2811. **Deployed 2026-10-11** as `index-CUMg8UjZ.js` (CSS unchanged; deployed
commit `43b4928`), confirmed by page load, bundle hash and the CSP at the edge and in-network; `localStorage` cleared.

**What the 246/226/227 round did (2026-10-11)**: three follow-ups, a bounded change (design in chat). **No schema
change.** Fu 226: `removeItems` drops every placement of a definition the delete emptied (held something before),
cascading up and across shared copies; an already-empty assembly stays; `deleteBoards` closes the open level to the
deepest one left. Fu 227: a dead eye says why ("<name> is hidden with <nearest hidden assembly>", or "<name> is open
and can't be hidden"); `cleanName` turns `›` into `>` where a name is written (`renameItem`, Generate). The approved
design put it in `uniqueName` (so on load too); that renamed every assembly part on joinery's write-back, because
flat documents carry " › " and pass through `migrateDocument` (47 tests red), so it moved to the write sites and the
prohibition joined inv 8. Fu 246: stale vUp comments fixed; the overlap sweep re-run on all six views (12 views, 54
rotated labels): no overlaps, nothing outside the viewBox; its P3 check predated the leader columns and flagged every
column label, now exempt when wholly in the column band; three test gaps pinned. Final review (opus): ready to merge,
3 minors, all fixed. Test count 2793 -> 2808. **Deployed 2026-10-11** as `index-Dz_13Lc-.js` (CSS unchanged;
deployed commit `26e088f`, docs-only past the merge `39b465b`), confirmed by page load, bundle hash and the CSP at
the edge and in-network; that origin's `localStorage` cleared and read back empty twice.

**What the posture-handedness round did (2026-10-10)**: follow-up 215, by the user's decision to do both
steps as one round. **Schema 12.** The probe: flat and upright mapped (length, width, thickness) onto the
world as mirrors, on-edge as a proper rotation, so a posture change mirrored a one-handed part's cuts; the
sheet drew every face with the earlier dimension right and the later DOWN, so one side of each face was a
mirror image; and the cut list's row key omitted posture, grouping flat and on-edge parts that were mirror
images. Decisions: `axisFrame` reverses thickness for on-edge (all postures det -1, flat and upright
byte-identical); `onEdgeToV12` mirrors on-edge parts' stored cuts along thickness with `mirrorCutAlong`
(root parts, definition parts and Shapes; after validation and `linksToShapes`, before `repairTree`, guarded
by `version < 12`, not idempotent) so nothing moves on screen; sheet views thickness/min, width/max and
length/min draw vertical upward (`DiagramView.vUp`, cells and leaders via `drawnSpan`/`orientColumn`), so
every view is a true view, pinned for every posture x turn x face x side. Task 4 added the cut-list test (a
flat and an on-edge part with one stopped dado share a row AND are congruent by a proper rotation, derived by
hand; mutating `axisFrame`'s toggle fails it) and recorded the docs. What the reviews caught: without the
migration a joined on-edge design fails the joint gate (`gateUnjoin` refuses), and passes with it. The pins are
unjoin.test.ts's two on-edge describes (the symmetric-tenon rail, and the final-review ONE-SIDED pocket in an
on-edge rail, which a mirrored joint cannot pass) and throwGuards.test.ts's `plainForRefine` on fixture 5; the
unjoin gate tests are real pins, not decoration. Test count 2763 -> 2793 across the
round. The live browser check (an on-edge part with a stopped dado saved under v11 reloads unchanged, six
sheet views read true) is the controller's, run on the dev server after the final review. Rollback cost:
a build below 12 refuses every project saved since the deploy; export first. **Deployed 2026-10-11** as
`index-DUH2frTq.js` (CSS unchanged, `index-NXp0eTQP.css`; deployed commit `52df4c4`, docs-only past the merge
`1a52fec`), confirmed by page load, bundle hash and the CSP at the edge and in-network; the load's fresh project
stored `version: 12`; that origin's `localStorage` cleared and read back empty twice.

**What the opposite-end-cut round did (2026-10-10)**: follow-up 245, a bounded change (design in chat;
spec §2 of the joinery-end-cuts design amended). **No schema change.** A full-span cut stored into the
OPPOSITE end (a full-length back-edge rabbet as `face: 'length', from: 'max'`) also reaches the moving end, so
`rebaseCuts` now re-faces it too (`reachesMovingEnd`: stored from the moving end, or depth ≥ the whole of `d`);
it then runs out the grown length like its other two forms. A partial far-end cut is left as stored — the
"re-face every cut" mutation lands it in the same place, so its STORED form is what the test pins (no
cut-list churn). The trim case was already right and is kept as a non-regression test; a 180°-turned shelf
gives the unturned answer. Tests 2758 → 2763.

**What the joinery end cuts round did (2026-10-10)**: follow-ups 205 and 206, from
`docs/superpowers/specs/2026-10-10-sloyd-joinery-end-cuts-design.md`. **No schema change.** Follow-up 205:
`cutIntoEnd` asked `rebaseCuts`' throwing condition (`face === d && from === end`), which reads how a cut is
STORED, so a corner notch stored with its depth along the length skipped the far dado while the same notch
stored on the width face joined. The cause is two equally valid storage forms that `storedAsShape` keeps as
given. The new `refaceFromEnd(b, c, d)` (recipes.ts) re-stores a cut stored into the resized end from another
face its box reaches, guarded by the exact same box within 1e-9 per axis; it returns null for a cut reaching no
other face or extending outside the board (shallower span first, ties thickness, width, length; a full span
enters `from: 'min'`; the cut keeps its id). Both `rebaseCuts` and `cutIntoEnd` use it. A cut that runs along
`d` to the moving end (a bookcase bottom's rabbet) is not stored into the end and is never touched; an
end-grain mortise still refuses. Skips that became joins or clips: the shelf-notch and rail-notch tenon and
dado tests, the 180-turn describe's shelf and rail fixtures and the rigid-turn describe's shelf fixture, both "shelf grooved into its back edge" trim tests, the
back-panel end-notch trim tests, and "blockers judge solids > a cut making only PART of the room". New tests
cover both storage forms of the probe, the end-grain mortise (also at 90/180/270), a trim through a notch,
turned shelves at 90 and 180, end-grain cuts pinning both trim-path refusals, and an end-grain fixture in the
180-degree equivariance set. Follow-up 206 closed by the user's decision: the two-axis half-lap refusal is
pinned by a test with hand-built sites (`findSites` cannot reach it: a crossing needs E's thickness axis to be
the contact axis, and a part has one), mutation-tested by restricting the coplanar filter to the site's axis.
A whole-branch review then moved the re-facing AHEAD of the `storedAsShape` pass in `rebaseCuts`, so a
re-faced cut spanning all of `d` (a full-length back-edge rabbet stored into the end) is re-stored as running
and runs out on growth like its run form, instead of stopping 1/4in short; the end-grain mortise was added to
the rigid quarter-turn describe so the refusal is exercised under 90/270. One residue recorded as fu 245.
Tests 2732 → 2758.

**What the older-record-only round did (2026-10-10)**: follow-ups 211, 214, 217, 220, 222, 228, 230,
231, 235 and 239 — every item triaged FIX / TEST / CLOSE in
`docs/superpowers/plans/2026-10-10-sloyd-older-record-only.md` (approved by the user), then run as four
subagent batches (A store/panels, B1 tree fixes, B2 tree tests, C turn/joinery tests, D generate/refine),
each task-reviewed and merged, then a whole-branch review and one fix wave. **No schema change.**
The user ruled on 214: consecutive hide/show toggles share ONE undo entry (inv 43 updated), so visibility
toggling can no longer push real edits out of the 50-entry history. Behaviour fixes: no-op `edit()`s push
no undo entry; `copyInRow` refuses a sign other than ±1; `commitSnapMove` refuses a twin target
(`sharesStorageWith`, now the one twin predicate, shared with `moveCandidates`); `linkPlan` refuses fewer
than two distinct stored parts; `copyBoard` keeps a shaped part's own fields; `translateItems` drops
covered descendants; Select linked counts visible mates only; `distinctParts` counts only definitions a
placement reaches; Refine has one status region (the bad-limit message now sits below Detail). The final
review caught a cross-batch bug the per-batch reviews could not see: undoing a LATER edit re-exposed a
hide run's entry, so one undo then removed two hides — fixed (undo/redo end a run) and pinned, along with a
latent `editRekeyed` overwrite once no-op edits push nothing. Closures are item by item in
`docs/follow-ups.md`; some items proved already covered or untestable (equivalent mutations) and say so.
Tests 2594 → 2732.

**What the record-only round did (2026-10-10)**: follow-ups 243 and 244, a bounded change (design in
chat, no spec). **No schema change.** The user chose these two of the twelve record-only entries.
One latent fix: `repairDocument` and `plainForRefine` run inside the dialogs' memos, so a throw there
would have broken the dialog's render; both now catch, log the cause, and return their usual
refusal (the user asked for `plainForRefine` too). New tests: the guards (the write-back made to
throw through `vi.mock`), `runJoinery`'s `alsoPresent` excusing only problems that name parts (a
faked `checkDesign`: joinery can hardly cause a tip), `repairDocument` passing a refusal through,
and `unjoin`'s whole internal reason — which showed a hand cut crossing the back rabbet makes the
rabbet read as unexplained too (refused either way). The rest closed with reasons (follow-ups 243/244).
A live pass drove the refused text, a storage failure and the turned/nested fixtures. Tests 2589 → 2594.

**What the join-repair-text round did (2026-10-10)**: follow-up 242's remaining half, a bounded change
(design in chat, no spec). **No schema change.** A joined Refine's joinery call has repair rounds of
its own, but `progressPatch` kept the `stage: 'join'` marker only for the first joinery call, so its
rounds read exactly like the design's. `RefineRun` now carries `join` on EVERY patch (false included —
patches merge into the run, so an omitted field would carry over), and the dialog says "Choosing
joints — fixing N issues (round r/3)…" / "Choosing joints — retrying (round r/3)…". A new run test
pins that `runRefine` tags joinery's retry with the stage. Generate and Joinery dialogs unchanged
(one kind of call each). Tests 2585 → 2589.

**What the refined-name round did (2026-10-10)**: follow-up 237, a bounded change (design in chat,
no spec). **No schema change.** The user chose counting over stripping or numbering against the
library, and widened it to Duplicate. `derivedName` (`src/document/names.ts`) names every derived
project: Refine, joinery, repair and Duplicate. "Box — refined" → "Box — refined 2" → "… 3"; "Bench copy" →
"Bench copy 2". The count reads only the source's name, so refining one project twice still gives
two rows alike (project names are not unique, by `duplicateProject`'s stated reasoning); a different
suffix underneath stacks ("— joined — refined"); "— refined 1" and "— refined 02" are not ours. The
mutation pass found a real gap: without the stem check, "Shelf unit 2" refined became "Shelf unit 3"
— now pinned. No browser check: the dialogs show the name they are given. Tests 2573 → 2585.

**What the estimate-range round did (2026-10-09)**: follow-up 236, a bounded change (design in chat,
no spec). **No schema change.** The user chose a range over a typical figure or a labelled floor,
and approved two small paid runs to calibrate. They showed the old Refine estimate under-read for
reasons other than thinking — ~2 characters per token rather than 4, the cached prefix (system
prompt plus output schema) missing, output ~1 token per design character — while joinery's flat
2,000-token output over-read. `src/generate/estimate.ts` now prices one call low and every repair
round high; both dialogs show `≈ $low–$high`. Tests 2558 → 2573.

**What the repair-joints round did (2026-10-09)**: follow-up 240, repairing projects whose joints
the pre-`a899b51` joinery doubled, with a spec and plan
(`docs/superpowers/specs/2026-10-09-sloyd-repair-joints-design.md`). **No schema change.** The user
chose a repair action over a warning, prune-and-prove over rebuilding, and recreated fixtures (no real
affected projects exist). The fixtures were made by running the buggy commit (`4a340f7`) in a scratch
worktree, and they corrected the spec before any code: only receiving pockets were doubled (no
stray tenon shoulders), so the undamaged fixture became the null case; an exact compare misses a
metric twin's last-bit difference; the stored order already matched the re-join (reorder pinned
synthetically). Self-review added the evidence rule (designs not damaged this way get no message)
and the emptiness rule (a stray must be a pocket nothing occupies). Found during execution:
`applyJoints`' own `migrateDocument` re-mints `/` ids, so tests of "today's joinery" must go through
`writeBackFlat` as the app does, or they pass at the pre-check for the wrong reason; and only a
SHORTENED hand-resized part needs the emptiness rule (a lengthened one fails the re-join match). The
final review found an undamaged design that still got the note (a copy Made Unique, then its rail
deleted, leaves an empty mortise matching the other copy's); the user ruled that a stray's twin must
be the same stored part (`storedKeys`). Live
check (`docs/browser-verification-repair-joints.md`): fixture 2 imported, repaired from Refine (3
stray cuts, Front/Back split), the repaired project passes the gate. Tests 2486 → 2558.

**What the refine-joined round did (2026-10-09)**: follow-up 238, refining designs with joints, with a
spec and plan (`docs/superpowers/specs/2026-10-09-sloyd-refine-joined-design.md`). **No schema
change.** A throwaway spike first measured that joinery can be read back from the joined design
alone: 126/126 joined designs (all five joint kinds, mixed designs, the lowered drawer) re-joined
exactly. `unjoin` turns a joined design into plain boxes plus joint records; `gateUnjoin` proves it
by re-joining (refusing anything it can't reproduce, before any call); Refine refines the plain
design and re-joins with the records as `fixed` choices, so only genuinely new or no-longer-fitting
meetings reach one joinery call. The user's rulings: keep joints where possible, infer them (not
record them at joinery time), the model chooses only new meetings, all five kinds; after the final
review, the gate compares within 1e-9in (metric/typed designs were refused over float noise) and
kept joints that collide are re-opened. Found during execution: meetings the original left butt had
no record and were re-chosen on every refine (now fixed butts), the original joined design's
problems re-reported as new (now already present), joinery's own thin-post tenons failing the
strict check, and an older joinery bug — shared assembly copies storing every joint twice, with
phantom mortises (`a899b51`, fu 240). Live check with the user watching
(`docs/browser-verification-refine-joined.md`): a model-joined bookcase (10 stopped dados, 3
rabbets) refined "2in taller" kept all 13 joints in one call; "add a third shelf" kept 13 and asked
about 2. Tests 2207 → 2486.

**What the refine round did (2026-10-09)**: follow-up 179, refine by instruction, with a spec and plan
(`docs/superpowers/specs/2026-10-09-sloyd-refine-design.md`). **No schema change.** "Refine…" sends
the open prototype, in Generate's own format, plus an instruction through the same repair loop and
evaluation step (now one shared `evaluateDesign`); the result is a new unopened project with a list
of what changed. The user's rulings: fresh prototypes only (a design with a cut is refused before
any call; also turned or nested assemblies and > 60 distinct parts), a new project, the whole design
back plus a change list, one result per run, and only new problems drive repairs. Amended while
planning: the spec's "most common offset" realignment would have lifted a lowered case back into
the air, so Refine keeps the model's coordinates (`centre: false`, floor rule only). The final review
(probes) found the already-present filter swallowed every size limit (part-less problems all keyed
alike) — the user ruled limits are judged on the result; also exact values are kept for untouched
off-grid parts, detail is preselected with 3 parts of headroom, and definitions are normalised so a
Group'd assembly does not read as moved. Executed subagent-driven (five tasks, one final review on
the most capable model, one fix wave). Live check with the user watching
(`docs/browser-verification-refine.md`): a side table refined with "legs 2in longer, add a drawer"
came back clean, untouched parts exactly in place, the change list matching storage; a project with
a cut was refused before any call. The estimate read $0.02 against $0.07 actual (fu 236). Tests
2147 → 2207.

**What the generate-assemblies round did (2026-10-09)**: Generate can describe a multi-part unit
once and place it several times, and links same-role identical parts, with a spec and plan
(`docs/superpowers/specs/2026-10-09-sloyd-generate-assemblies-design.md`). **No schema change**
(v11 structures only), so rolling back costs nothing. The user's rulings: approach B (the model
authors assemblies — local frame, translation only, one level; Sloyd decides components), the cap
counts DISTINCT parts with a 4× placed ceiling, components need a shared `role` AND exact equality,
reuse `linksToShapes` (invariant 45 amended to name it the ONE label→shape builder), and collapse
repeated violations by authored part. Amended while planning and after the final review: roles
normalised; a non-finite placement rejected alone; magnitudes beyond 10,000in rejected (a huge
value overflowed the centring shift — crashed the run, or silently dropped a placement); "›" in
model names replaced with ">"; "fix the assembly" said only for overlaps inside every placement,
with an inside/between flag in the merge key (without it a drawer's own overlap merged with a
spacing overlap between drawers). Executed subagent-driven (five tasks, each reviewed; one final
review on the most capable model and one fix wave). Live check on the dev server with the user
watching (`docs/browser-verification-generate-assemblies.md`): "A three-drawer chest" came back
clean with one drawer definition placed three times and three linked pairs; an edit inside one
drawer changed all three; joinery kept the drawer definition shared. Tests 2080 → 2147.

**What the components round did (2026-10-06/07)**: round 2 of 2. Copies of an assembly share one
definition, and part links became shared shapes, with a spec and plan
(`docs/superpowers/specs/2026-10-06-sloyd-components-design.md`). **Schema 11.** Claude drove its
live check headless, because the SSH display the user watches from had gone; the user did not watch
(`docs/browser-verification-components.md`). Merged (`9012e1e`) and deployed 2026-10-07 at the
user's request as `index-3fpWh8yo.js`, confirmed by page load, bundle hash and the CSP at the edge
and in-network. Rolling back past it strands v11 documents; export first.

- **The user's rulings.**
  - **Duplicate shares; Make Unique splits.** One kind of assembly, not SketchUp's
    group/component split.
  - **Links fold into components.**
  - **Joinery shares where identical.**
  - **Storage is shared shapes** (approach A): a linked part stays a part, and its shared fields
    are stored once in a `Shape`.
- **Shape.**
  - `SloydDocument.shapes`.
  - A stored part is a `StoredBoard`: a plain `Board`, or a `ShapedBoard` holding only id, name,
    position and turn plus `shape`. Both types derive from `LINK_FIELDS`.
  - `resolveBoard` is the one place a shape is read into a part, and `worldParts` resolves before
    it places.
  - `applyWorldEdits` keys on the storage target (`<definition or ROOT>:<part>`). It writes shared
    fields of a shaped part into its shape, merges agreeing edits field by field, and throws on
    disagreeing ones.
  - The store sends one edit per storage target (`oneEditPerTarget`) and judges every held point
    after an edit (`judgeHeld`).
  - Duplicate and Copy in a row share the definition (`shareInstance`); Make Unique copies one
    level deep, keeping ids (`makeUniqueItem`); Select copies.
  - Link, Unlink, cut actions and copies of a linked part work on shapes. `Board.link`,
    `repairLinks` and `dissolveSingletons` are retired; `dissolveShapes` turns a one-user shape
    back into a plain part.
  - `linksToShapes` migrates v10 links on load; `repairTree` copies a definition placed twice only
    below v11.
  - `writeBackFlat` splits definitions and shapes by identical results.
  - Panels show `×N` on a shared copy, "Shared by N copies", Select copies and Make Unique.
- **Rulings during execution** (the spec's §8 amendments, each with its cost in the ledger):
  - a resolved part carries `shape`;
  - `FlatDocument`;
  - the migration runs after validation;
  - a malformed shape claims no id, and a `ROOT` definition id is dropped;
  - joinery splits shallowest-first;
  - exact comparison may split by a last bit;
  - Make Unique is offered by references;
  - hidden ids and tape points are re-keyed under every placement.
- **What the reviews caught.**
  - **Task 3:** the plan's ungroup test expected the wrong root instances.
  - **Task 4:**
    - the plan's shared-parent test could not fail, so a position-patch test that can was added;
    - Move, Delete and Turn still judged held points only on the edited copy (fixed);
    - a plan step listed five actions where the spec meant every edit.
  - **Task 7:** BFS split order broke on a drawer placed at the root and inside cabinets, so the
    order changed.
  - **Final review:** hidden ids and tape points in OTHER copies were not reconciled after Delete,
    Group or Ungroup inside a shared definition. That gave a false "Show all (1)" and made a hidden
    part reappear. It is fixed with an all-placements re-key, plus six small fixes. One mutation
    survives by ruling: `judgeHeld` after a re-key is a fail-safe.
- **Live check (headless).**
  - A v10 file with four linked legs and a drawer loaded as one shape, with nothing moved.
  - Duplicate shared; an edit and a cut inside one copy reached all three; two undos restored.
  - Make Unique split the third copy off.
  - The legs: a cut on one reached all; a posture change re-pivoted each about its own centre.
  - Unlink, Link and Select linked behaved as before.
  - The joinery dialog listed its sites.
  - A reload was byte-identical; a v9 file imported unchanged.
- **Evidence.** 2005 tests across 72 files before the round, 2080 across 75 after; build clean.
- **Residues:** follow-ups 229-231; 223 and 224 are closed.

**What the assemblies round did (2026-10-06)**: parts grouped into assemblies, which can be nested,
duplicated, moved, turned, opened and edited in place, with a spec and plan
(`docs/superpowers/specs/2026-10-06-sloyd-assemblies-design.md`). **Schema 10.** It is round 1 of
two in the user's order: assemblies first, so Duplicate makes an independent copy; components, with
shared definitions, second. Claude drove its live check on the dev server
(`docs/browser-verification-assemblies.md`); the user approved the merge without reporting
hands-on results. Merged (`699cc45`) and deployed 2026-10-06 as `index-hmc0odAl.js` (deployed commit
`f8f76e8`), confirmed by page load, bundle hash and the CSP at the edge and in-network. **Deployed at
the user's request.** Rolling back past it strands v10 documents; export first.

- **Why it exists.** The user found linking (v9) too narrow. A drawer's five parts could not be
  duplicated or moved as one. They asked for SketchUp's component system, researched first.
- **The user's rulings.**
  - **Model A:** a real definition/instance tree, rather than group tags on flat parts.
  - **Two rounds**, assemblies first.
  - **SketchUp's click model:** a click selects the outermost assembly, a double-click opens it,
    Escape closes it.
  - **Names unique per level.**
- **Shape.**
  - `SloydDocument` gained `instances` (the root's) and `definitions`. A `Definition` is
    `{ id, boards, instances }`. An `Instance` is `{ id, name, definition, position, rotation }`;
    `position` is its frame's ORIGIN, not a min corner.
  - Occurrence ids are paths (`i1/i2/b3`), and root parts keep plain ids.
  - `frames.ts` holds the one composition step: `placeBoard` and `placeInstance`, with `rotateVec`
    and `cornerShift`.
  - `tree.ts` holds `worldParts`, the one walk to placed parts, cached per document object, plus
    the path helpers, `isCovered`, `flatDocument` (path names for the cut list and joinery) and
    `treeRows`.
  - `treeEdit.ts` writes edits back: `applyWorldEdits`, `mapWorld`, `translateItems`,
    `writeBackFlat`.
  - `treeOps.ts` holds the structural operations: group, ungroup, copy, remove, turn and prune.
  - `treeRepair.ts` holds the load repair.
  - The store gained `openPath`, plus `openAssembly` / `closeAssembly`, `selectItem` /
    `clickPart` / `openPart`, `groupSelected` / `ungroupSelected` (Ctrl/Cmd+G, Ctrl/Cmd+Shift+G),
    `turnAssembly` and `renameItem`.
  - The viewport fades what is outside the open assembly and keeps it clickable, and a
    double-click opens an assembly.
  - The parts list became a tree, and Properties gained an assembly panel.
  - Invariant 46 is new; invariants 8 and 33 were restated per level.
- **Schema.** v9→v10 is document-level: absent `instances` and `definitions` default to `[]`. The
  bump's argument is silent data loss, stronger than v9's: a v9 build drops both, so every part
  inside an assembly vanishes and is autosaved away.
- **Plan-time amendments** (spec §10):
  - `worldParts` keeps each part's own name;
  - Ungroup is exact for direct child parts only;
  - `position` is compared element by element;
  - every move is a world delta rotated into the container's frame;
  - joinery maps parts back by index and throws on a count mismatch.
- **Execution rulings** (the ledger's, each with its cost if wrong):
  - **Joinery keeps world geometry; Properties keeps the stored local position.**
    `applyWorldEdits` gained `keepWorld`, and only `writeBackFlat` passes it. Cost: two
    write-back rules side by side, so a future caller must pick the right one.
  - **A malformed board inside a definition refuses the file**, as at the root, rather than
    dropping the assembly. Cost: a hand-edited file with one bad nested board will not open.
  - **Group and Ungroup are refused while `gesturing`** (invariant 43's argument). Cost: Ctrl+G
    mid-drag does nothing.
  - **Select linked selects the members at the open level**, and is shown only when another
    member is there. Cost: linked parts in different drawers cannot be selected together until
    round 2.
  - **The eye is disabled** under a hidden ancestor, and on the open assembly and its ancestors.
    Cost: one more click to reveal.
  - **Ungroup keeps selected plain parts selected.** Cost: none.
  - **The empty-assembly and ` › `-in-a-name gaps ship as follow-ups 226 and 227.** Cost: a
    lingering row; a rare rename.
  - **The plan's `turnInstance` test was wrong** (it compared min/max corners, which swap
    diagonals under a turn). The implementer's all-8-corners version stands.
  - **`lower()`'s duplicate early return was deleted**, and the `moved` guard is pinned by an
    identity assertion.
- **What the reviews caught.**
  - **Task 11, critical.** Joinery inside an assembly turned 90° or 180° wrote a lengthened rail
    back keeping its LOCAL position, so the growth went to the wrong side and pulled the tenons
    out of their mortises. The tests used identity frames only. Fixed with `keepWorld`, and now
    tested at all four turns.
  - **Task 10.** The hidden-ids patch on the past entry could overwrite a gesture's lazy
    snapshot. Fixed by refusing Group and Ungroup while `gesturing`.
  - **Final review, critical.** `App.tsx` computed the joinery dialog's sites on the TREE
    document, so a grouped design showed none. No task touched that file, so no per-task review
    could see it. It is now computed on `flatDocument`, and the live check saw 12 sites.
- **Live check.**
  - A v9 drawer was imported, grouped bit-exactly, duplicated independently, moved, turned in
    place and opened (with the fade).
  - A Properties edit inside the turned copy behaved as predicted, and a gizmo drag there moved
    world X only. Escape closed.
  - The drawers were nested in a cabinet and the cut list read by path. Hiding the cabinet hid
    everything below it.
  - The joinery dialog found 12 sites. A reload was byte-identical, and Ungroup was exact.
  - **` › ` measured 12.03px**, the same as ASCII in `--font-num`, under `CHAR_W` 12.4, so it
    stays.
  - **One layout fix:** the five-button action row clipped Delete, so `.row` now wraps
    (`1cb478f`).
  - **One input fix** (`4814900`). An orbit followed by a click opened the assembly under the
    cursor, because a dblclick's travel is measured from its second press. Click pairs are now
    tracked on the canvas element. The first check of this used Playwright's default
    `clickCount: 1` and could not have failed.
- **Evidence.** 1883 tests across 64 files before the round, 2003 across 72 after; build clean.
- **Residues:** follow-ups 224-228.

**What the linking round did (2026-10-06)**: linked parts, which stay identical, with a spec and
plan (`docs/superpowers/specs/2026-10-06-sloyd-linking-design.md`). **Schema 9.** Its live check
passed on the dev server with the user watching (`docs/browser-verification-linking.md`). Merged
(`d3120cf`) and deployed 2026-10-06 as `index-BwdHsyEM.js`, confirmed by page load, bundle hash and
the CSP at the edge and in-network. The LAST of the three repeated-parts rounds (quarter turns, copy in a row, linking).
Rolling back past it strands v9 documents; export first.

- **The user's rulings.** Copy and link are separate actions; a link is made on existing parts.
  Shared: length, width, thickness, material, grain, **posture** and cuts. Per part: name,
  position and turn (four legs share their mortises, each turned to face its own rails). Linking
  parts that differ: the **FIRST SELECTED part wins** and the others take its values. **Copies
  join**: Duplicate and Copy in a row produce members of the source's link.
- **Shape.** `Board.link` is a label, not a separate definition, so every part stays
  self-contained and no reader of a part changed. `links.ts` holds `LINK_FIELDS` (the one
  shared/own table, `satisfies`), `sameShared`, `repairLinks` and `linkPlan` (the one decider,
  read by the store and the panel). The store gained `linkBoards`, `unlinkBoards`,
  `selectLinked` and the private `mates`; `updateBoards` and the three cut actions reach every
  member in the same `edit()`. The group panel has Link, Unlink and the "will match" line; the
  single panel a linked block with Select linked and Unlink; the parts list a chain icon.
  Invariant 45; invariants 33 and 40 were amended to match.
- **Schema.** v8→v9 is document-level: an absent `link` is an unlinked part. The bump's argument
  is v6's, silent data loss on round-trip. `repairLinks` runs after validation on every load and
  unlinks, never moves.
- **Planning ruling.** Joinery's output would be repaired at `runJoinery`'s result, not at save,
  so any caller gets a consistent document. Cost if wrong: none (the load repair).
- **Execution rulings.**
  - **Four plan-supplied tests could not fail** and were strengthened. Task 1: the `repairLinks`
    reference test passed with the member compared against the PREVIOUS member instead of the
    first, and the `linkPlan` no-op test passed with the no-op check ignoring `changing`; a test
    was added for each. Task 2: the "own fields do not propagate" patch carried no shared field,
    so `sharedPatch` came back empty and sending the FULL patch to the mates survived (`length`
    was added to the patch); and the pivot test's parts were already upright, so it only
    exercised `updateBoards` and a plain spread in `linkBoards` survived (a Link-pivot test was
    added).
  - **The plan told Task 2 to leave `copyBoard` alone, and that was wrong.** `copyBoard` minted
    fresh cut ids, so a copy of a linked part with cuts joined the link with DIFFERENT cut ids:
    every cut edit skipped it, `linkPlan` reported it changing, and the next load unlinked it.
    The review caught it. Fixed (`bccf663`): a linked source's copies keep its cut ids (legal,
    cut ids are per board, invariant 33); an unlinked source's copies still get fresh ones. Both
    directions were mutated red, including the over-fix of keeping ids for every copy.
  - **The planning ruling was superseded.** `applyJoints` already ends in `migrateDocument`,
    whose load path runs `repairLinks`, so `runJoinery`'s result was already consistent and
    `run.ts` needed no change. Task 3 added two tests that pin it (two linked legs cut
    by joinery come out unlinked, even with identical mortises, because `pocketFor` mints fresh cut ids per board; a linked pair joinery does not cut keeps its link); making
    `repairLinks` the identity turns the first red.
  - **The single panel's linked count is a selector returning a number**, not a `useMemo` over
    the boards: cheaper, and it re-renders only when the count moves (invariant 43's selector
    rule).
- **Evidence.** 1843 tests across 63 files before the round; 1859 across 64 after Task 1, 1873
  after Task 2, 1875 after its fix, 1877 after Task 3, 1882 after Task 4, 1883 after the final-review fix wave (sharedPatch copies cuts; a compile-time guard that a shared field other than cuts is a primitive); build clean. Mutations,
  each shown red: rotation marked shared, the cut-id compare dropped, delete instead of unlink,
  `linkPlan` ignoring unselected members, an empty `link` kept, the full patch to mates, mates
  skipped, a cut id per member, no `dissolveSingletons` in Unlink and in Delete, `copyBoard`
  stripping `link` or adding `link: undefined`, the cut actions and `updateBoards` dropping held
  points for the edited part only, `linkBoards` by plain spread, identity `repairLinks` on
  joinery output, and in the panels the note shown whenever a plan exists, Link always shown,
  Select linked as a plain select, and the icon inside the name button.
- **Residues:** follow-ups 221-223.

**What the copy-in-a-row round did (2026-10-05)**: N ordinary copies of the selection along an
axis, with a spec and plan (`docs/superpowers/specs/2026-10-05-sloyd-copy-in-a-row-design.md`).
No schema change. **Merged (`7487aca`) and deployed** (`index-B8i7dotN.js`). **Live check passed**
with the user watching (`docs/browser-verification-copy-in-a-row.md`). The second of the three repeated-parts rounds (quarter turns, copy in a row, linking).

- **The user's rulings.** Copy and link are separate actions; copies are ordinary and
  independent. All three spacing modes (gap, centre-to-centre pitch, fit N across a distance).
  Direction is +/-X, +/-Y or +/-Z. The count is the TOTAL in the row, the original included.
  Controls are an inline form in Properties; a dialog and dragging in the viewport were rejected.
- **Shape.** `rowLayout` (`document/row.ts`) is pure and returns step, gap and row length, or a
  refusal CODE (no `units` import; the panel words it). `copyInRow` (store) makes N-1 copies, copy
  k at `original + k*step*sign`, as one `edit()` so one undo entry; it shares `copyBoard` with
  `duplicateBoards`. `CopyInRow.tsx` holds its values locally until Apply and sits inside each
  Properties panel's selection-keyed root.
- **Placement ruling (planning).** The "Copy in a row..." button sits on its own line under the
  Duplicate row, not inside it, because the component owns its open state. Cost if wrong: a
  one-line move.
- **Execution rulings.**
  - The plan's exactness test used 7 parts, whose step (30 - 0.75)/6 = 4.875 is on the 1/16 grid,
    so rounding the step could not fail it. Changed to 8 parts ((30 - 0.75)/7, not on the grid),
    with a guard asserting the step is not a multiple of 1/16. The rounding mutation is now red.
  - `key={mode}` on the measurement field was first recorded as an unobservable mutation (the field
    adopts a changed `value` when not editing). A reviewer then showed it is observable: a refused
    draft survives a mode switch when the new mode's value equals the old one. The final-review fix
    wave added that test (Gap 7, a refused `abc`, then Fit across, whose default is also 7); removing
    the key turns it red.
  - `--danger` does not exist in the stylesheet; the invalid summary uses `--alert`, as
    `.field-error` does.
- **Final review fixes.** Apply took the last GOOD value while the field showed a refusal; it is
  now disabled then (fu 218), through `DimensionField`'s new optional `onErrorChange`. A typed
  Pitch/Across equal to the live default was not recorded (the field skips a commit equal to its
  value), so a direction change replaced it; the user's ruling was that defaults follow the
  direction only until the person types, through the new optional `commitUnchanged`. Also: the
  count is marked `aria-invalid` when refused, the closed form no longer computes the selection,
  and `rowLayout`'s `s > 0` guard (fu 219), the group copy's selection order and a −X row are
  pinned. 1843 tests.
- **Evidence.** 1831 tests across 63 files before the final review, 1843 after, build clean. Mutations run on rowLayout (rounding,
  guards) and copyInRow (drift, one undo entry, refusals), each shown red.
- **Residues:** follow-ups 218-220 (218 and 219 closed by the final review).

**What the quarter turns round did (2026-10-05)**: four true quarter turns about the vertical, with a
spec and plan (`docs/superpowers/specs/2026-10-05-sloyd-quarter-turns-design.md`). **Schema 8.** On
branch `repeated-parts`; **merged (`a24287f`) and deployed** (`index-bSuJPbkx.js`). Live check passed with the user watching, one
paid joinery run on four legs at 0/90/180/270 (`docs/browser-verification-quarter-turns.md`). Rolling back past it
strands v8 documents; export first.

- **Decomposition.** "Repeated parts", the third round the user asked for after multi-select and
  hide/unhide, was split into three rounds of its own, in the user's order: **quarter turns**, then
  **copy in a row**, then **linking**. Copy and link are separate actions; a link will share
  dimensions, material, grain and cuts, while each linked part keeps its own position and its own
  turn (the user's example: four table legs with the same mortises, each turned to face its rails).
  This round is the turn that example needs.
- **The finding: 90° was a mirror.** `rotation` was `0 | 90`, and `axisDimensions` only said WHICH
  dimension ran along each world axis, never in which direction. So 90° swapped the two
  horizontals, a reflection across the X=Z diagonal, not a rotation. Two parts with identical cuts
  could face them toward (+X, +Z) or (−X, −Z) but never (−X, +Z): one corner of a frame was
  unreachable.
- **The user's rulings.** Three rounds, quarter turns first. **True rotations, and migrate**:
  existing 90° parts with cuts are rewritten on load so they look exactly as before; a separate
  mirror flag was rejected.
- **The change.**
  - `axisFrame` in `geometry.ts` is the one turn table (spec §2): per world axis an `AxisMap`
    `{ dim, reversed }`. `axisDimensions` derives from it. Four helpers plus `endFacing` are the
    only part↔world crossings (invariant 44).
  - Every crossing a search found now uses them: `solidWorldBox`, `pointToLocalXYZ`, the
    `boardSnapPoints` filter, `toWorld` (cut snap points), `worldSolids`, `pocketFor`, `resize`,
    `cutIntoEnd` and `boardUVs` (per geometry axis, before invariant 35's sign and swap).
  - `trueTurnsToV8` (v7→v8, per board, raw data) mirrors each cut of a 90° part with cuts along
    h0: exactly one of `from` flipping, the stops swapping, or `offset → size − (offset + width)`
    (on the interval clipped first as `validateCuts` clamps it; final review C1) applies, because face, across and position axis are three different dimensions. Everything
    else passes through byte-identical. The bump's argument is wrong geometry, as v7's was.
  - Properties' Turn offers 0/90/180/270. Generate still emits only 0 and 90.
- **Rulings made while planning.** `faceGrainKinds` needed **no code change**: both faces of an
  axis pair share one grain kind, so swapping the ± slots on a reversed axis is a no-op. It got a
  comment instead; the UV test covers what is drawn.
- **Rulings made during execution.**
  - **The plan split one mapping change across Tasks 2-4 and left the tree red between them.**
    Once `worldSolids` and `solidWorldBox` carried direction, `pocketFor` (Task 3) and `boardUVs`
    (Task 4) still did not, so the checks and the cuts disagreed: 34 failures. The joinery and
    texture CODE moved into Task 2; Tasks 3 and 4 became tests plus mutation evidence against code
    already present, with no RED-first run possible. **Two intermediate commits on the branch are
    red** (`bc42990`, `73e0e65`); HEAD is green. Accepted rather than squashed, because the ledger
    cites the reviewed SHAs and the `--no-ff` merge keeps master's first-parent history green; the
    cost is that a bisect inside the branch can land on a red commit.
  - **Existing tests that pinned the old mirrored 90° were updated to the true-turn values**, each
    proved to differ only by the mirror before it was changed:
    - 7 `snapPoints.test.ts` pins on the `posed` fixture (world Z = 14 − old Z), plus 2 negative
      assertions that had become vacuous at the old Z (proved by wrapping the real functions in a
      Z reflection: the old file then passed 80/80);
    - 2 oracles that reimplemented the mirror: `assertCarves` in `pocket.test.ts` and `worldOf` in
      `recipes.test.ts`, now on `toWorldOffset` / `spanToWorldOffset` with no assertion changed;
    - 5 part-frame tests carrying 6 assertions on the turn-90 bookcase sides (`recipes.test.ts`
      and `cutlines.recipe.test.ts`): the back rabbet's `from` max → min on both sides (Right's
      was masked by Left's), the sheet's "(min side)" → "(max side)", the housings' "short of the
      max end" → "min end", `stopMaxLabel` → `stopMinLabel`, and the housings' stops swapped. The
      world cut is the same in every case. **So joinery on a 90° part now names the opposite end
      on the sheet for the same world cut**; spec §4's stated cost, reaching new joinery runs too,
      because Generate's sides arrive at 90°.
  - **A plan-supplied `boardSnapPoints` equivariance test could not fail** — green before the
    implementation and green under the filter mutation — because no lattice point of `chiralPart`
    sat in removed stock. `chiralPart` gained `c3`, a stopped rabbet that takes a box corner; the
    test then went red under the mutation. All three cuts are off-centre on every axis, so each alone is one-handed.
- **Test evidence.** 1806 tests across 61 files (from 1749 across 59), build clean. Mutations, each
  red: every site's helper dropped (worldSolids, solidWorldBox, edges, cut and box snap points,
  pocketFor, resize, cutIntoEnd, boardUVs part-frame spans and reflection after the swap), the
  migration's chain line, each of its three per-field cases, mirroring h1 instead of h0, touching
  0° parts, and the 270° option. The store anchor tests (a box-corner anchor kept on a 180° turn,
  a cut-point anchor dropped) were not separately mutated.
- **Residues** are follow-ups 215-217: 215 the handedness-across-postures question, 216 the
  millimetre ulp finding, 217 the record-only gaps.

**What the hide/unhide round did (2026-10-05)**: hiding parts from the 3D view and bringing them
back, with a spec and plan (`docs/superpowers/specs/2026-10-05-sloyd-hide-unhide-design.md`). No
schema change. **Merged (`366eb37`) and deployed** (`index-BpdcUlXf.js`). **Live check passed** with the user watching (`docs/browser-verification-hide-unhide.md`).

- **Decomposition and order.** The second of the three rounds the user asked for: multi-select
  (shipped), hide/unhide, then repeated parts. Five tasks: the store (hidden set, history
  entries, `selectionPatch` filter), the viewport readers, the panels, the keys, the docs.
- **The user's rulings.** Hidden-ness is view state, not saved. All four controls offered: an
  eye per row, H, Show all (Alt+H and a button), hide others (Shift+H and a Properties button).
  A hidden part cannot be selected. Undo was asked for after the first draft, so a history
  entry became `{ doc, hiddenIds }`; the accepted cost is that a hide after an undo discards
  the redo list.
- **The change.** `hiddenIds` in the store with four user writers through `applyHidden`
  (invariant 43), which never runs `edit()` and pushes an entry holding the same document.
  `undo`/`redo` share one `restore`. `visibleBoards` is the one filter the viewport reads:
  hidden parts are not drawn, not snap points in either tool, and not framed by Home.
  `moveCandidates` takes `hiddenIds`. PartsList has the eye and Show all (N), Properties has
  Hide others in both panels, and App's keydown effect has H / Shift+H / Alt+H. Invariants 24,
  34 and 42 were amended to match.
- **A pre-existing bug the live check surfaced: the projection swap framed beside the model.**
  The user saw the ortho/perspective toggle zoom in and look off to the side of the visible parts.
  Diagnostic logs showed the cause, and it reproduced with nothing hidden:
  - the swap effect ran when the camera changed, while drei's OrbitControls were still bound to
    the OUTGOING camera, so the framed target went into the old controls;
  - the rebuilt controls came up targeting [0, 0, 0] and turned the new camera to face the
    origin.

  It hid until now because the whole model's centre usually sits near the origin; a few visible
  parts far from it made it obvious. The effect now waits for `controls.object === camera` and
  frames once per swap. Re-measured with one leg visible: both directions frame on the leg's
  centre, and the live controls keep it.
- **Two spec corrections found while planning.**
  - The selection is filtered STRUCTURALLY, inside `selectionPatch`, rather than by each
    caller remembering to skip hidden parts.
  - Undo and redo used to clear every held point unconditionally. The undo of a hide restores
    the SAME document, so they now keep held points then; otherwise Ctrl+Z after hiding a part
    would drop a tape measurement the hide itself was forbidden to drop.
- **Placement ruling.** Show all (N) renders inside PartsList directly under the Parts heading,
  not on the heading line.
- **Rulings made during execution.**
  - Task 1: a plan-supplied test of invariant 24's prohibition was vacuous — `hideUnselected`
    ran with an empty selection, so it did nothing and the tape fields survived trivially. It
    now re-selects first and asserts the set at each step. A mutation (`restore` using the
    entry's set unfiltered) survived the plan's tests, so a ghost-id test was added.
  - Task 4: two plan-supplied tests (Alt+H, and H then Ctrl+Z) passed with the whole H block
    deleted; both now assert the hide happened first. The text-field test was masked by the
    gesture refusal (focusing the project-name field opens a gesture, so the hide was refused
    for the wrong reason); found by controller mutation, it now uses a bare input and asserts
    `gesturing` is false. The plan matched H by `e.code` for all three keys, which made the key
    that types `d` on Dvorak/Colemak hide parts; plain and Shift+H now match by `e.key`, and
    only Alt+H by code (Option+H types `˙` on a Mac).
- **Residues** are follow-ups 213-214.

**What the multi-select round did (2026-10-05)**: selecting and editing several parts at once, with a
spec and plan (`docs/superpowers/specs/2026-10-05-sloyd-multi-select-design.md`). No schema change.
**Merged (`232917f`) and deployed** (`index-D7ySMvky.js`). **Live check passed** with the user watching and doing the drags (`docs/browser-verification-multi-select.md`).
- **One change came out of it (follow-up 212).** The user found clicking away to commit a field
  awkward. Enter already committed but showed nothing, so by the user's ruling Enter now commits and
  blurs, in `DimensionField` and `NameField` alike. A refused entry keeps focus.

- **Decomposition.** The user's wish, hide/unhide and repeated parts, was split into three rounds in
  the user's order: multi-select, then hide/unhide, then repeated parts. Only the first is built.
- **Scope rulings.** Operations: move together, delete/duplicate, shared properties. Gestures:
  Shift/Ctrl-click and Ctrl/Cmd+A. Group fields: length, width, thickness, grain and material.
- **The change.** `selectedIds` in the store with one writer for user selection changes (undo, redo
  and `replaceDocument` reconcile it); `commitSnapMove` and `moveGroupTo` move the group by one
  delta; `updateBoards`, `deleteBoards` and `duplicateBoards` are one undo entry each; the gizmo
  drags the group; `DimensionField` takes `value: null` for mixed; Properties has a group mode.
  Invariant 42 states the writer rule, and invariants 5 and 24 were widened.
- **Spec corrections found while planning.** `f` with nothing selected is a no-op, and
  `replaceDocument` clears the selection.
- **Controller ruling (found by the Task 5 implementer).** A selection change mid-drag ENDS the
  gesture. A group keeps a gizmo target across the change, so unlike the single part (which got this
  by unmounting) the drag would otherwise commit the new group's size against the old proxy and the
  parts would jump. Cost if wrong: a drag interrupted by Ctrl+A must be restarted.
- **The reviews' catches.**
  - A grab whose owner is toggled out of the selection could become a target; the selection patch
    now drops the grab (tested).
  - MoveTool had to withhold every selected part's points, not only the grabbed one's; carried from
    Task 2 to Task 4.
  - The invariant 42 wording was corrected to one writer for user changes.
  - The final review asked for two stale comments fixed (`commitSnapMove`'s duplicated self-snap
    paragraph, `isBoardOwned`'s reason) and a test that a grab owned by a non-first group member
    is dropped; mutating the clause to `ids[0]` alone turns it red.
- **Residues** are follow-ups 207-211.

**What the joinery residues round did (2026-10-05)**: follow-ups 182, 186, 188, 191 and 201–203,
no spec (the user ruled the design in chat: 201 = trim, 188 = shorter default tenons down to 1/4in
and butt below, 182's `stopped rabbet` accepted; 202, 204 and 186's blamed `tips` closed by
decision). No schema change. **Merged as `2b96eb2` and deployed 2026-10-05 (`index-D_wzi7Bx.js`). Live check passed** with the user
watching (`docs/browser-verification-joinery-residues.md`).

- **182 / 201:** a rabbeted panel's sites on one face are one unit, resolved from its FINAL box;
  every pocket is cut against it, and any other part in the panel's path is trimmed by the
  intrusion (a pass-through refuses the unit).
- **188:** default tenons shrink to 1/4in where the collision cap is under 1/2in, else the site
  butts. The model's range and the prompt are unchanged.
- **203:** every blocker, trim and pass-through test judges solids through the one exported
  `worldSolids`; the half-lap plane guard refuses before E moves; `movedFace` is per (part, axis).
  Every `resize` caller asks rebaseCuts' throwing condition first (`cutIntoEnd`).
- **191 / 186:** `findTenons` merges breakpoints within `FLUSH_EPSILON`; `problemKey` is a JSON key.
- **Probe first, and it found more than the ledger said.** 182's voids were not a back-stopped-dado
  oddity but one ORDER root cause: each rabbet site cut its pocket against the panel as it stood
  then, so a side's rabbet ran full height and a later top rabbet trimmed the back off its end. The
  unfilled corner pockets were present in the cabinet live-checked the round before (0.0117 in³ a
  corner), the drawer (0.0078 a side) and the 72in bookcase (0.0234 a side), and `checkDesign` reported nothing, because it cannot see a void. A void
  metric (pocket volume minus what other parts' solids fill, no `filled > 0` filter) now asserts
  the geometry. 188's first probe sat exactly on the 1in boundary; the advisor caught it before it
  was trusted. 201 reproduced with a
  shelf 1/8in short of the back, which the back drove 1/8in into.
- **The reviews' catches.**
  - Trimming a part already cut into its trimmed end threw inside `rebaseCuts`, and the new gap
    trim had WIDENED that from butting parts to gap parts. The task report first called it
    pre-existing; it is now a refusal decided before any change.
  - A surviving mutation (the panel's solids not clipped to its final box) was recorded as
    unobservable; the review built the overhang that kills it.
  - After blockers moved to solids, the rabbet trim loop still judged boxes; it was moved too.
  - The final review found tenon and dado growth could still throw on a hand-made part already cut
    at its growing end (on master too); it is now a skip with a reason.
- **Rulings:** a model tenon with no length at a site whose default is butt takes the butt, with a
  note, rather than the 1/2in floor and a certain collision. Residues are follow-ups 205 and 206.

**What the joinery fixes round did (2026-10-05)**: follow-ups 190, 185, 183 and 184, no spec (the
user ruled the design in chat: 183 = outer-face chain, 190 = defaults only, no prompt change). No
schema change. Merged as `c31dd82` and deployed 2026-10-05 (`index-BzWa2ZGT.js`).

- **190:** default tenons from opposite faces of one receiver are capped at down(depth/2 − 1/32)
  (13/16″ each in a 1-3/4″ post), combined with the adjacent cap by `min`. Unit-verified only: the
  collision is reachable solely through the fallback defaults.
- **185:** crossings run bottom-up, grouped by axis, so each part is final before anything lands on
  it and moves once. Half-laps need only to still cross in plan with R wholly below E, and a
  swept-volume check replaces the butting-face blocker. The "carry riders" design was rejected: a
  part with two lap partners would be carried twice.
- **183:** a rabbeted panel carries its outer-face chain; a carried part that would collide makes the
  site a skip, decided before any trim, move or cut.
- **184:** `JoinResult.lowered`, and the dialog's "Moved relative to the rest" wording.
- **Probe first, and the ledger was partly off:** 183's floating part measured as `unsupported`, not
  `hangs`; 185 had a silent-void variant (a stack whose top and bottom parts share a footprint
  finished with no violation and two empty notches), now a skip with a reason.
- **Review catch on 183:** the task report argued the receiver exclusion in the carry walk was
  unreachable (a surviving mutation). The review showed it reachable through a panel rabbeted on
  both faces, which would carry its own receivers; a test now pins it.
- **Live check:** passed on the dev server with the user watching, three paid runs (≈ $0.05 in all): a cabinet whose cleat rode with the rabbeted back (183), a lap stack ending in one plane with every notch filled (185), and a drawer box whose dialog reported the 1/4in lowering (184). 190 is fallback-only and unit-verified. See `docs/browser-verification-joinery-fixes.md`.
  Residues are follow-ups 201-204.

**What the fu 197 round did (2026-10-05)**: a bounded round, with the design approved in chat.

- **The change:** `clippedRegion` (the cut's box ∩ the board, which is exactly what it removes) is
  now the one clip that everything showing a cut reads:
  - the drawing's leader spans;
  - the snap points;
  - and, because the review asked for one home for the rule, `cutShape`, `openSides` and
    `findTenons`, whose inline copies did the same arithmetic.

  `cutRegion` stays unclipped for building solids. A cut inside the board is provably unchanged
  (a sweep shows the two boxes are equal there).
- **Found while exploring:** the issue had a second instance the follow-up did not name. The snap
  points were spread over the stored box, so the same cut offered different points depending on how
  far it overhung. The review then found a third case: an over-deep dado's floor points sat outside
  the board, and that is now pinned by a test.
- **A live-check false start:** an overhang written into a file is clamped by `validateCuts` on load,
  so the first test file showed an honest 1-1/4″ rabbet. The real path is in-session: shrinking a
  board under an end cut.
- The browser pass is `docs/browser-verification-fu197.md`.

**What the fu 200 round did (2026-10-05)**: a bounded round, with the design approved in chat.

- **The change:** `runAxis` and the word table compared the opening's computed extents EXACTLY, so a
  square typed in millimetres went by its last bits. They now compare within `FLUSH_EPSILON`, which
  is invariant 22's rule (tolerance for computed values), and the same tolerance the open-end tests
  already used. Stored values stay exact.
- **Measured before it was designed.** A reverted probe compared exact against tolerant over 6,000
  random mm cuts, 6,000 sixteenth cuts and the joined workbench and bookcase. Every change was an mm
  opening equal to the last bits; the sixteenth cuts and both designs had none. Putting the tolerance
  in the word table too was what fixed the six mm corners that had tipped from notch to stopped dado.
- **Two things the review got right.**
  - The implementer reported a "hang". It was the implementer's own unbounded search loop, not the
    app: `storedAsShape` is bounded at 17 evaluations, measured at about 0.1 ms per call.
  - The implementer concluded the Match guard was now unreachable. The reviewer showed it fires at the
    tolerance boundary itself, 186 of 20,000 constructed cases, and the guard is now pinned there.
    Deleting it had kept the whole suite green.
  - The general lesson: a random search that finds nothing has sampled where it looked, not where the
    rule bends. Search at the boundary.
- The browser pass is `docs/browser-verification-fu200.md`.

**What the 198/199 round did (2026-10-05)**: a bounded round with the design approved in chat and no
spec, closing the cut storage round's two open questions.

- **198:** `CutShape.runByDefault` marks a run decided only by the square tie's length-first
  default. Properties shows no Match note then, by the user's ruling.
- **199:** `rebaseCuts` re-stores a growing part's cuts by shape before applying its rule, so how a
  cut follows a growth no longer depends on how it was stored.
  - My brief had it judge the shape on the already-grown board. The implementer showed that was
    wrong, since `resize()` changes the dimension first, so the shape is read on the part as it was
    before growing.
  - The final review's 648-case probe went from 72–144 storage-dependent cut-list differences per
    design to none.
  - It also found that the "stays put" half had no test and that a mutation survived; that test now
    exists.
- **Follow-up 200** is filed: a square typed in millimetres is not a float-exact tie.
- The browser pass is `docs/browser-verification-fu198-199.md`.

**What the cut storage round did (2026-10-04)**: follow-ups 195 and 196, the cut lines round's
open questions. There is no geometry change, no schema change and no load-time rewrite.

- **What it does.**
  1. **A square opening's direction reads only its shape (196).** On an exact tie it runs from the
     edge with exactly one open end, otherwise along length, then width, then thickness.
     `runAxis` no longer reads the stored `across`. It had to stop, or storing `across = run`
     would have let storage and direction decide each other.
  2. **Joinery stores each cut the way the sheet reads it (195).** `pocketFor` passes every cut
     through `storedAsShape` against the board with its existing cuts, so a shelf housing beside
     the back rabbet is stored across the width. A 248-variant joinery corpus showed no change in
     any board, line, check or region.
  3. **Properties offers one click (195).** A row stored the other way says *"The cut list reads
     this cut as running across the width."* and offers **Match the cut list**: one undo step, the
     same stock, and focus to "Runs across".
- **Measured before it was specified.** Of 108 joinery cuts in the three live-check designs, only
  the 4 stopped housings were stored the other way.
- **The final review found that the format cannot always store a cut exactly.**
  - A cut's far end is computed as `dim − stopMax`. For a far end under half the board, typed in
    millimetres, no float `stopMax` reaches it, so re-stored mm cuts drifted by an ulp.
  - On exactly square openings that drift flipped the direction, so the note came back and a
    second click flipped it again.
  - The fix searches each far end one ulp at a time and lands on the side that keeps the run.
    That took run flips from 282 to 0 in an 8,114-cut sweep.
  - Six exact-square corners would still read as a different word. **The user ruled: guard the
    sheet.** The button is offered only when the re-stored cut prints the same word, direction and
    stops. The general lesson: "the same stock" is a claim about floating point, and it needs
    measuring before it is promised.
- **Reviews.**
  - One planned mutation was equivalent: `openSides` only looks outside the cut's own box, so it
    was accepted as such, with a test covering the real intent.
  - One plan test could not fail (a board shrink did not reach the removes-nothing guard) and was
    replaced with a depth-0 cut.
  - Follow-ups 198 (the note on a square tie's default) and 199 (`rebaseCuts` and the two stored
    forms) are its residues.
- The browser pass is `docs/browser-verification-cut-storage.md`.

**What the cut lines round did (2026-10-04)**: follow-ups 192, 193 and 194, the cut words round's
residues. It changed what the sheet prints: no geometry, no schema, no change to how rows group.

- **What it does.**
  1. **One description of a cut.** `cutShape` reads the clipped opening once and gives:
     - the word;
     - which way the cut runs (`run`: the axis open at both ends, else the longer extent, else
       the stored `across` on an exact tie);
     - where it sits;
     - its stops, at closed ends only.

     `cutLabel` is its `.word`.
  2. **The setup line and the drawing's labels are both formatted from it (192).** One pocket
     stored two ways now prints one line and one drawing. A through word can no longer carry a
     stop. The live case: the front-stopped shelf housing reads `3/4" stopped dado … 24" from the
     length min end, running across the width, stopped 3/4" short of the max end`.
  3. **`groove` (193).** A channel whose run axis is the board's grain says `groove`, `stopped
     groove` or `blind groove`, on solid wood and plywood. MDF has no grain and keeps `dado`.
  4. **194 was closed by decision.** Follow-up 55a's ruling covers it.
- **The spec missed the drawing.** It said "words and lines only", but the drawing beside each line
  printed the same stored numbers, and an existing test requires the two to agree. Planning caught
  it, and the spec was amended before any code. The general lesson: when a printed value changes
  its source, find every other place that prints it.
- **Measured before it was specified.** A throwaway probe compared the old and new lines over the
  three live-check designs. 38 lines were unchanged and 4 changed, all of them 192's own housings.
  The tests pin the unchanged ones as literals, run once against the old code to show they pass.
- **Reviews.**
  - Mutation testing found one rule (the axis open at both ends wins) with no test that could fail
    it. It now has one.
  - The final review raised three design questions, filed for the user as follow-ups 195–197:
    - Properties still shows each cut as stored;
    - a square opening prints one of two lines;
    - an overhanging cut's drawn band is unclipped while its labels are clipped.
  - Cost was unchanged: `buildCutList` on the joined workbench took 8.1 ms before and after.
- The browser pass is `docs/browser-verification-cut-lines.md`.

**What the cut words round did (2026-10-04)**: follow-ups 180, 181 and 189, the three wording
residues the joinery round left. It changed words only: no geometry, no schema, no change to how
cut-list rows group.

- **What it does.**
  1. **A cut is named from its shape, never from how it is stored.** `cutLabel` reads the opening
     the cut's clipped box makes on its face: which sides are open, plus its proportions. So one
     pocket stored two ways gets one word (181), and a closed shallow housing reads `blind dado`
     (189).
  2. **A tenon is recognised from its cuts.** `findTenons` looks for at least two end cuts that
     share one length and leave exactly one tongue. It prints as one line, `1-1/4" tenon, 1/2"
     thick × 4-1/2" wide — at the length min end`, in place of four rabbet lines (180). Properties
     labels its cuts `tenon shoulder`.
- **The live check changed the rule, at the user's call.** A shelf housing running out into a back
  rabbet printed `stopped dado … stopped 1/4" short`, but at the bench it is a through dado.
  - "Open" now means **no stock remains** between the side and the board's edge (spec §2.4,
    `openSides`). The word and the stop clause read the same helper.
  - The user then left three calls to Claude, with research (spec §2.5–2.7):
    - a full-thickness corner cut is a `notch`;
    - a mortise must be deep relative to its length, at most 8× its depth;
    - writing the whole line from the shape was deferred, as follow-up 192.
  - A 4× length-to-width rule for mortise was rejected **because it would have renamed the
    workbench's real mortises**. Checking a proposed vocabulary rule against the user's own fixture
    caught that before any code.
- **Reviews mattered as usual.**
  - Mutation testing found four guards with no test that could fail them:
    - `findTenons`' fill check;
    - its ℓ tolerance, where a real ULP case exists at L = 17.9;
    - the max side of `openSides`;
    - its stop clause.
  - The Task 5 review measured `buildCutList` about 20× slower. One `boardSolids` per board instead
    of one per cut brought the joined workbench from 50 ms to 14 ms.
- **Follow-ups 191–194** are its residues, recorded in `docs/follow-ups.md`. The browser pass is
  `docs/browser-verification-cut-words.md`.

**What the joinery round did (2026-10-04).** This is phase 2, follow-up 171. The user chose
"Add joinery" as phase 2's first job, ahead of refining a design by instruction. It ran
straight after the stopped-cuts round, which supplied the mortise, and the phantom-cut round,
which keeps a resized part's dead cuts off the sheet.

- **What it does.**
  1. The code finds every place two parts meet: end into face, a thin panel's face against an
     edge, or two parts crossing.
  2. One model call picks a joint for each of those places, from what the place allows.
  3. Pure recipes build the joints through ONE converter, `pocketFor`, which turns a world box
     into a cut (invariant 41).
- **Two checks changed.**
  - `checkDesign` measures overlap between SOLIDS, and the contacts `hangs` reads come from
    solids too (invariant 38, rewritten).
  - Only problems the joinery introduced drive repairs.
- **Reviews: the plan and spec were wrong several times, and every time it was caught before it
  shipped.** Each fix is recorded in the spec.
  - Hanging rails: the box-based `hangs` would have reported every tenoned rail as hanging.
  - The back panel: a centre partition would have silently lost half the back, and rule 3 was
    corrected.
  - Half-laps:
    - in a grid, they moved a part once per crossing;
    - a drop could run a part into a block;
    - tolerances could add up and strand a part out of plane.
  - The floor: a rabbeted bottom lifted the piece off the floor.
  - Labels: `pocketFor` labelled a stopped dado a "notch".
  - Default joints:
    - an ordinary rail defaulted to a dado;
    - legs defaulted to housings in a top that would crack.
  - Test gaps: tests could not see the max-face recipe branch.
  - Errors: the fallback reported our own bugs as model failures.
  - **The worst:** a part's existing cuts did not move when the part grew. Tenons landed wrongly
    depending on document order, and the model could never repair it. The final review found it
    by reordering the user's workbench legs. The fix's own run-out rule then needed narrowing,
    which the user approved.
- **Live pass** (`docs/browser-verification-joinery.md`), four paid calls, about $0.13:
  - **The workbench:** 16 mortise and tenons, no new problems.
  - **A generated bookcase:** 13 dados, no new problems. Shelf housings print "mortise" (189).
  - **A forced corner collision:** the model avoided it.
  - **Not seen live:** a rabbet and a repair round.

**What the phantom-cut round did (2026-10-04)**: follow-up 178. This was a bounded round, and
it came straight after the stopped cuts round. It went before phase 2 for one reason: phase 2's
"refine" step will resize boards that already carry cuts, which is exactly what produces a cut
that removes nothing.

- **The detection.** `cutRemovesNothing` in `cuts.ts` asks whether the cut's box, clipped to
  the board, has any volume. Clipping matters because `cutRegion`'s all-zero sentinel catches
  crossed stops but not an offset past the end.
- **Readers that skip such a cut:**
  - the cut list's text and its row signature (the latter through `cutsThatRemoveStock`);
  - the diagrams;
  - the snap points.
- **Properties keeps the cut and flags it.** The user chose this over dropping it at the edit,
  so that growing the board back restores the joint.
- **What the review found.** It approved the change. Its one real catch was that the test
  meant to prove the predicate agrees with `boardSolids` never called the predicate. The
  rewrite asserts the agreement for every case and caught a NaN disagreement as well.
- **Docs.** Invariant 40 gained a paragraph. The row key now depends on exact board dimensions
  through the predicate, which is invariant 18's rule, and that is recorded so nobody rounds
  it away.
- **Live pass:** `docs/browser-verification-phantom-cut.md`.

**What the stopped cuts round did (2026-10-04)**: chosen by the user as the step before
phase 2 (follow-up 171). Their question was whether the joint vocabulary should grow before
phase 2 does. The answer: a `Cut` could already express dados, rabbets, grooves, half-laps,
tenons (as four rabbets), bridle slots and finger joints. It could not express anything that
**stops short**, so there was no mortise for a tenon to sit in. Without one, 171's "overlap
accounted for by a cut" rule would be written against the wrong joint set.

- **What changed:**
  - `Cut` gains `stopMin`/`stopMax`, and the schema goes to v7. The bump is argued from
    **wrong geometry**: a v6 build would show a blind mortise as a through-dado.
  - `cutRegion` honours the stops.
  - `cutLabel` names seven shapes, with the vocabulary set by the user.
  - The cut list prints the stops, and its drawings label them on a second leader.
  - A cut's mouth now offers its whole opening as snap points.
  - Properties gains two "Stop short of…" fields.
- **The user's rulings:** labels derived from the shape; entry as two stop distances; stops
  labelled on the drawing, not only in text.
- **Reviews caught three plan-supplied test gaps and one real defect:**
  1. The 2D/3D agreement test probed only cell centres, so it passed with the old
     full-length hatch (invariant 20).
  2. Four mutations to the new stop leader all survived the plan's drawing tests.
  3. The final whole-branch review found `boardUVSignature`, BoardMesh's memo key, still
     building its cut part from a hand-written list without the stops. A stop edit would
     never reach the 3D view until a reload.
     - That last one is why invariant 40 names **two** readers.
     - It is also why the field table now lives in `cuts.ts` (`CUT_GEOMETRY_FIELDS`).
  4. The same review also found a Properties cut row that locked after a board shrink. It is
     fixed: the "leave no cut" refusal fires only on a transition into that state.
- **Deferred:** a cut a shrink has left removing nothing is still printed until reload, as a
  shrunken dado already was. That is follow-up 178, open for the user's decision.
- **Live pass:** `docs/browser-verification-stopped-cuts.md`. It includes a stop edit and its
  undo redrawing without a reload, and a tenon snapped into a mortise with zero overlap.

**What the key check round did (2026-10-03)**: follow-up 174, a bounded round with a design
approved in chat and no spec. During the batch variety live pass, three pastes into Settings
were saved and then rejected by the API one call later. The error said only "check
Settings". The fix measured before it chose:

- **A shape check alone would have caught two of the three.** The third key was well-formed
  and invalid. So Save now refuses a key with whitespace or non-printable-ASCII inside it,
  instantly and offline.
- **Save then verifies the key with one free call** that lists models. A 401/403 refuses the
  key with the API's own reason; anything else saves it with a note. A generation's auth
  error now appends the API's reason too.
- **No prefix rule.** A key that works does not start with `sk-ant-api`, so a prefix rule
  would refuse a valid key, and a mutation proves the tests would catch one being added.

The live check was free: Claude drove both refusal cases, and the user pasted the real key.
Deployed the same day (bundle `index-BhhW2iNw.js`). Tests went from 1163 to 1180. There is no schema change.

**What the held and stable round did (2026-10-03)**: follow-up 165. `checkDesign`'s support
rule only asked whether parts connected to the floor through face contacts, in any direction,
so the user's live workbench passed with its lower shelf hanging by four corner patches
under its low rails. The user chose two failure classes to catch: tipping, and parts that
hang. They then exported the actual workbench to the server, and **reading it changed the
rule**. "Held between two parts" passes that shelf, because legs touch both its ends; what
was wrong was 19% coverage of each end. So `hangs` measures coverage:

- (a) resting on something;
- (b) between two parts covering ≥ 50% of each opposite side;
- (c) lapped on a broad face, so a backrest screwed to a post's face still passes.

`tips` compares the grounded parts' volume-weighted centre of mass with the floor
footprint's hull, using a 1in margin that shrinks for narrow bases. The model is also told
both rules up front.

**The round is mostly the story of rule (c), and every turn in it was a probe, not an
argument.** The task reviewer set a crate on the hanging shelf, and (c) counted the crate's
contact on the shelf's top face, so the shelf passed. The user ruled the top face out. The
final reviewer then built cleats under a bench seat, which now failed, and showed that the
prompt's own "fasten its broad face" advice steered a repair to a non-fix. The user ruled
the top face back in, but only when the part above is held without this part. The fix-wave
re-reviewer then stood a box, and separately two lapped uprights, on the hanging shelf.
They held each other and so held the shelf. The user ruled that the part above must also
still reach the floor without this part. **Three rulings, three proven holes.** Invariant
39 records the result and prohibits "simplifying" any of it back.

**The tests had the usual weakness, and the reviews caught it again:**
- The test named for rule (a) could not fail without (a), because a flat top's underside is
  also a broad face.
- The `tips` margin boundary survived a `>=` → `>` mutation.
- Only the +X tip direction was ever asserted.

Each was replaced by a test that a deliberate break turns red. Two approved plan deviations
apply one-fault-one-report: a floating part adds no weight to `tips`, and an overlapping part
is not also reported as hanging.

**The live pass**, driven by Claude with the user watching:
- The same workbench request put the shelf **on** the stretchers, first time.
- The side table batch produced a plinth cabinet where it had produced a spine cantilever.
- All four designs check clean when the shipped `checkDesign` runs on the stored documents.
- No `hangs` or `tips` message was ever sent, so the repair round trip is still unseen
  (follow-up 177).

Deployed the same day (bundle `index-B9DOKF_H.js`). Tests went from 1134 to 1163. There is no schema change.

**What the batch variety round did (2026-10-03)**: follow-up 164, the Generate round's
own top finding. Phase 1's whole purpose was variety, and a batch of three Sonnet side
tables had come back as one design three times. The cause was structural: N identical
requests, so any difference was down to sampling. Telling each run to "be different"
cannot fix it, because a run designing alone cannot see its siblings, and every run reaches
for the same second-most-obvious idea. So the design is **one planning call that sees all
N at once**.

**What it is:**
- `concepts.ts` asks for N concepts that differ in *structure*: support, construction and
  arrangement, with "only the dimensions differ" explicitly excluded. It also states what
  Sloyd can build (rectangular boards, face to face, no joinery, curves or tapers), so the
  planner cannot propose what a run cannot make.
- It reuses the runs' own `userMessage`, so planner and runs read one set of constraints.
- The parse is **all-or-nothing** over the first N, so a batch never mixes planned concepts
  with the built-in roles.
- Each concept rides as one line at the end of its run's first user message, so the system
  prompt stays a fixed prefix and repairs carry the concept for free (invariant 37).
- In `useGenerations`, a rejected key or a cancel during planning ends the batch before any
  run starts. Any other failure falls back to three built-in roles: Conventional, Minimal,
  Different support. A cancel landing as planning resolves still starts nothing.
- A batch of 1 is byte-for-byte unchanged, pinned against a literal.

**The process caught three tests that could not fail.**
- Task 4's review found a row's concept rendered *after* its status, contrary to the spec.
  The only test checked that the text existed.
- The fix round's order test then wrapped its assertions in an `if`, which passes vacuously
  when a class is renamed. The final review caught that by mutation.
- The final review also found that the spec's required "batch of 1 unchanged" mutation
  survived every hook test. Only `userMessage` was pinned, not the hook's wiring.

That is follow-up 155's shape twice more in one round. **Mutate the test, don't just run
it.** It held here only because the final review did.

**The live pass was the first driven by Claude with the user watching** the same Playwright
browser: the route the Generate round's record named, after that round had been deployed
early because it was assumed unavailable. The verdict, *structurally different*, was the
user's. Two findings outlived the round:
- **Prompt caching works.** Follow-up 167's premise was wrong; the real gap is a batch's
  cold parallel start.
- **Settings saves text that cannot be a key** (follow-up 174). Diagnosing it produced a
  wrong claim, that keys start with `sk-ant-api`, which the working key disproved. It is
  recorded so the eventual check does not encode it.

**Deployed the same day** (bundle `index-CHx6ZAo-.js`). Tests went from 1094 to 1134 across 45 files. There is no schema change.

**What the Generate round did (2026-10-03)**: the first feature round since the project
library, and the first with a network dependency. The user asked whether a person could
describe a piece, pick some settings and get a prototype built from Sloyd boards by an LLM.
The design discussion settled on three phases. **Phase 1, this round, is variety and
exploration** (the user's option C): 1–3 independent designs per click. **Refine and joinery
(B) is phase 2.** A budget cap and "use what I have" come later, and materials take little
effort because the user can change them in one field.

The shape, in one pass. The user stores a Claude API key in Settings, held in
`sloyd.llm.v1` and never in a project or the index. Generate takes a description,
max width/depth/height, material, style and detail. Each run sends one request with a
structured-output JSON schema: a design is `{ name, parts: [{ name, material, at, size }] }`
in world inches. `designToDocument` converts it into boards, getting length, width,
thickness and posture from the size via `axisDimensions` (inv 13), snapping to `SNAP_INCHES`,
translating onto the floor and centring, then passing everything through `migrateDocument`
like any other load. `checkDesign` then reports overlaps, unsupported parts, too-large and
too-many. A design with problems goes back as a repair turn, up to three times (four calls),
in an append-only history (invariant 37). The run keeps the attempt with the fewest
violations and lets a later attempt win a tie. A design that still has violations after the
last call is saved anyway and reports them, because a flawed prototype is still a
prototype.

**Where it sits.** `llm/` is the provider seam (`LlmClient`, with `LlmMessage` opaque) and
imports nothing from the app. `generate/` is the prompt and the run loop and imports only
`document` and `llm`. `useGenerations` beside `App` owns the batch: one batch at a time,
" — A/B/C" name suffixes, an auth error aborting every run, and a post-run abort guard so
a cancel that lands after the answer writes nothing. Results go into the library through
`createProject(doc, { activate: false })` and nothing else (invariant 36). The user is
never pulled out of their work, and invariant 32's token is never touched. The dialogs
share the cut list's modal flag, generalised to `modalOpen` (invariant 27).

**Four deviations from the spec, all approved with the plan:**

1. **Vectors are `{x, y, z}` objects, not tuples.** Structured outputs cannot enforce a
   fixed-length array, but they can enforce three required number fields.
2. **The dialogs use the cut list's overlay pattern, not native `<dialog>`.** This keeps one
   modal mechanism, the one invariant 27 already reasons about. The spec's §6.2 now carries
   an as-built note.
3. **"An export never contains the key" is tested as "no stored key except `sloyd.llm.v1`
   contains it".** Export serialises a document with no field the key could ride in, so
   the reachable mistake is the adapter writing settings into the wrong key. This version
   of the assertion can fail on that.
4. **Spec §6.4's reason was wrong and was corrected before execution.** Typing in the
   description is never at risk because `isTextEntry` returns first. The exposure is focus
   on the sheet or a button, which is the state the dialog opens in.

**What the reviews caught**, worth knowing because each one passed its task's own tests:

- `parseDesign` used `in MATERIALS` and so accepted `"constructor"`. `validateBoard` had the
  same hole and predated the round; both now use `Object.hasOwn`, so there is one rule for
  one question.
- When a refusal triggered the server-side fallback, the client joined text across both
  answers. It now parses only after the last fallback block, while still sending the whole
  turn back verbatim.
- API errors surfaced as a bare status. They now carry the API's own message, and a 5xx
  gets *server error* wording.
- An unusable attempt displayed "Fixing 1 issue". It now reads "Retrying".
- A snap could overflow `1e308` to `Infinity` after the finiteness check, so finiteness is
  re-checked after the snap.
- Two tests that could not fail without the code they guard were added: the post-run
  abort guard, and the appended assistant turn's identity.

**The SDK added 58.8 kB gzipped** (336.72 → 395.52 kB), under the 150 kB threshold that
would have made it lazy-loaded. **Tests went from 954 to 1094 across 44 files.**

**The live pass**: Opus bookcases 2/2 with no repair; a Sonnet workbench with one repair, a
workable design with MDF chosen for the top, but one piece the user judged badly supported
(follow-up 165); Sonnet side tables 3/3 after one, one and two repairs, but **essentially one
design three times** (follow-up 164). Variety is phase 1's stated purpose, so 164 is the
finding to carry forward.

**What the ply-sign round did (2026-08-31)** — the tenth round of the day and the only one
of the ten that started from a user bug report rather than the ledger. `FACE_AXES` recorded
which world axis each of `BoxGeometry`'s default UV axes runs along and threw away **which
way** it runs, with a comment stating that as a decision: *"signs are irrelevant here — grain
is mirror-symmetric, so all that matters is which axis carries u and which carries v."*

That is true of a whole board and false of a solid, and the distinction is invariant 17 —
`boardUVs` looks a SOLID up in the BOARD's tiling, so a solid's span is a sub-range, and
reversing the axis puts that sub-range on the wrong side of its face. On a 3/4in plywood panel
with a 1/4in dado the two solids meeting at the split plane handed each other **v = 0 from one
side and v = 1 from the other**: the outermost ply butted against the innermost, one
double-width light band in the middle of the stack and a part-ply at each edge. Which is the
report word for word — *"the middle layer is too wide and the outer layers are too narrow"*.

**Three of the box's twelve UV axes run backwards** (`+X`'s u, `+Y`'s v, `-Z`'s u), so three
of six faces had been wrong on every board the app ever drew. Four things hid it and all four
had to hold at once: an uncut board shows the whole tile either way; solid wood's figure is
near-random, so a mirror reads as a different board rather than a wrong one; MDF has no
structure to misplace; and plywood's edge is the one texture in the app where **position
within the tile carries meaning**. Plywood plus a cut is the only combination that shows it,
which is exactly the combination the user narrowed to on their second message — the first
described it as an orientation problem, and an orientation problem is what the first pass
spent its time not finding.

**The most portable part of the round is that negative pass, because it was rigorous and
wrong.** Three things were measured before the cut was mentioned and all three came back
clean: the texture (five equal bands, read off the canvas at texel rows 0/102/205/307/410),
the UV scale (`tileInches[1] === thickness` in all 24 posture × rotation × grain combinations,
on both narrow faces), and the render (five bands equal within 3% in all 48 face/orientation
cases). **A 48-case sweep written during the diagnosis passed with the bug live**, and so did
every uv assertion already in `grainTiling.test.ts`, because all of them assert a **scale** —
how much of the tile a face covers — and the defect was a **direction**. A reversed axis maps
`[0, 1]` to `[1, 0]`: same span, same min, same max, mirrored content. **A test that reads
only the extremes of a mapping cannot see the mapping.** That is 155's shape in a new place,
and it is why the fix ships with a test that asserts one interior number rather than a range:
`uv - position / tileInches` is `boardUVs`' additive constant, so it must be identical for
every vertex of every solid of a board — varying *within* a face catches a reversed axis,
differing *between* solids catches a misplaced sub-range.

**The ordering in the fix is the half a tidying pass gets backwards, and it is stated as such
at the code.** A sign belongs to the pair (face, GEOMETRY axis), which is the same thing as
the drawn u/v only when `swap` is false. So the flip runs BEFORE the swap; flipping after it
applies `+X`'s u sign to the drawn v — precisely the upright faces the defect showed on. That
version reds four tests; the original no-flip reds six; one wrong sign in the table reds five.

**Both new tests build a real `THREE.BoxGeometry`**, which is the point rather than a
convenience: the vertex layout and the default UVs belong to three.js, a fixture would be this
module's own belief about them, and this module's own belief about them was the bug
(invariant 23's rule). No WebGL is involved, so it stays inside the no-unit-tests-for-the-r3f-
viewport rule.

**One change nobody asked for, recorded rather than left to be found**: the fix mirrors the
drawn texture on `+X`, `+Y` and `-Z` for every board, cut or not. Invisible on plywood edges
and streaky faces; visible on **wood end grain**, whose ring pattern has its pith off-tile at
v = 1.8, so flipping `+Y`'s v moves it to -0.8 and the arcs curve the other way. A board's
`+Y` and `-Y` ends used to disagree with each other and now agree.

**And one thing the round deliberately did not do.** The first pass also measured why five
correctly-placed plies are hard to read at 3/4in — 2 px boundary rules that go sub-pixel at
any real board size, a 7% light/dark step, and the mesh outline covering a share of the outer
plies only. That was put to the user, who looked and said the layers read as even. It is
filed under 163 as open-by-decision; bundling a taste change into a correctness fix would have
made both harder to judge.

**What the key-list round did (2026-08-31)** — the ninth and smallest round of the day, one
CSS rule, closing **162** the same day the browser pass for 161 raised it. The sheet's key
list drew the browser's default disc in front of an `<li>` whose text already begins `1. `,
so an entry read `• 1. Side — 15" × 18" turned`. Pre-existing, and newly visible because 161
made the index tier common enough to look at.

**What it turned out to be is better than "a stray bullet".** `.parts`, `.guides`,
`.cutlist-rows` and `.cutlist-setup` all carry `list-style: none` with `padding: 0`;
`.cutlist-layout-key` was the **one list in the app that never got that reset**. So the fix is
the app catching up with its own idiom, not a new opinion about how a key list should look —
which is why it needed no design question of its own, unlike 161.

**The `<ol>` version was rejected for 161's own reason.** Making it an ordered list and
dropping the `n. ` prefix would let the browser number the entries — but the number inside the
part's rectangle comes from `nextIndex`, so the two numbers would then have **two deciders**,
agreeing only while DOM order and counter order happen to match. One counter printed in both
places is the point, and `styles.css` carries that as a prohibition at the rule itself.
`padding-left` went with the marker rather than surviving it: it existed to make room for a
disc, and zero puts the key's left edge on the same pixel as the `Sheet n` caption and the
drawing — measured at 453px for all three.

No unit test, and that is a classification rather than a gap: CSS is the same class as the
r3f viewport — verified by driving a real browser, not by asserting on a stylesheet. The pass
used a **two-entry** key list, a fourth turned part added to 161's fixture, because a one-line
list can show neither alignment nor numbering. 947/947, build clean. **Deployed the same day,
bundle `index-CePWNaxg.js` -> `index-DU8uasNy.js` with the CSS at `index-CtYur9k3.css` — the
fourth deploy of 2026-08-31.** Both hashes move: the JS entry references the CSS asset name,
so a CSS-only change is not a JS-identical build.

**What the turned-index round did (2026-08-31)** — the eighth small round of the day, the
first since the duplicate-error round to change what the app draws, and the one that closed
follow-up 92's residue. **161** recorded that `fitLabel`'s `name` tier draws the name and
nothing else, so a part whose rectangle fits its name but not its dimension line prints
neither its dimensions nor the word 92 put on that line — the one tier 92's fix does not
reach. The entry stopped there deliberately: the remedy is a legible-sheet judgement, not a
correctness question.

**The design question was put to the user with the affected band measured rather than
asserted.** On a 96" sheet, `24" × 18"` needs about 11.9" of part width to print and
`24" × 18" turned` needs about 20.2", so a turned part roughly 12" to 20" wide fell to the
`name` tier and printed nothing about itself. Three options: demote a turned part to `index`;
retire the `name` tier altogether (uniform, since an unturned part at that tier also prints no
dimensions — but it repaints sheets with no defect); or leave it, on the entry's own bound that
no dimensions are printed to be transposed. The user chose the demotion.

**The rule went into `fitLabel`, not into `SheetLayout`.** The tempting version is a panel-side
override, and it would leave the ladder with two deciders — invariant 31's shape, a rule
written twice holding in one place after the next edit. Instead `fitLabel` gained
`options?: { requireDetail?: boolean }`, which **removes the middle rung**: `full` or `index`,
nothing between. Default off, so every existing caller is untouched, and `SheetLayout` is the
only one that ever passes it. It travels as a **boolean argument, never a search of the
strings** — recovering `turned` by looking for the word in the dimension line would parse a
formatted string to learn a fact the caller already holds, which is exactly why `nesting.ts`
keeps `turned` beside `dims` instead of only inside it.

Nothing else had to move, which is the sign the tier was the right lever: the key entry is
already `name — dims` and `dims` already carries the word, so a demoted part's entry is
complete for free, and `nextIndex` already counts only parts that reach the index tier, so the
new route feeds the existing counter rather than opening a second one.

**`SheetLayout` got its first tests, and the mutation pass is why they exist.** The component
had none — 92's browser pass says so in as many words. Five mutations, all caught: dropping the
`requireDetail` branch reds four tests across both files; skipping the `name` rung
unconditionally reds six, including the unturned-part assertion that bounds the change;
returning `index` whenever the flag is set reds two; inverting the flag reds three. **And
dropping the argument from `SheetLayout` reds only the component tests** — the `fitLabel` unit
tests sail through it, which is the entire justification for the new file. `PAD` is exported so
the tests size their parts from `labelWidth` rather than keeping a second copy of the number.

One thing the round did **not** do on its own authority: a bullet the key list draws in front
of a line that already numbers itself (`• 1. Side — …`), which `.cutlist-layout-key` never
suppresses. Pre-existing, but this round makes the index tier common enough to notice it.
Filed as **162** rather than folded in — it is a visual change to a printable sheet and was not
in the approved design.

**The browser pass was built so the geometry decides nothing**: `Side` (turned) and `Back`
(unturned) sit on rectangles of exactly the same size, 187.5 × 156.25 drawing units, and only
the flag separates their results; a third part, `Rail`, is unturned at the `name` tier to show
the rung survives. All three tiers were computed against the real `buildNesting` output before
the browser was opened, then confirmed in it — the turned part drawing `1`, the key reading
`1. Side — 15" × 18" turned`, its twin printing both lines, and the numbering staying one
sequence. `docs/browser-verification-turned-index.md`. 947/947 tests across 36 files, build
clean, no schema or storage-layout change — but the bundle does change, so unlike the two
rounds before it this one shipped. **Deployed the same day as `5985ee2`, bundle
`index-8v7-ukbU.js` -> `index-CePWNaxg.js`, the third deploy of 2026-08-31.** Confirmed by
page load and bundle hash at both the edge and in-network, `localStorage` cleared afterward;
the demotion itself was not exercised against production, since seeing it needs parts on a
sheet and that would write a document. `DEPLOYMENT.local.md` carries the runbook entry.

**What the delete-token round did (2026-08-31)** — the seventh small round of the day, the
second in a row to close a follow-up by rejecting the remedy that follow-up named, and the
second to ship no source change at all. Follow-up **160** recorded that
`onDeleteProject`'s in-flight token (invariant 32) covers its adoption but not the adapter's
own move of the index `activeId`, so a delete overtaken by a later-started switch could leave
the persisted id on the replacement rather than on the project now open. It named a fix —
`deleteProject` taking the caller's intended active id, the shape of `autoSave`'s explicit id
— and deferred it as worth doing if the adapter were touched anyway.

**Both the named remedy and the obvious restructure turned out not to close it.** The named
remedy cannot: `onDeleteProject` captures `activeId` **before** its awaits, so on the only
path that matters the captured value names the project being deleted, and writing it would
leave the index naming something that no longer exists — strictly worse than naming the valid
replacement. An argument computed at call time cannot know a switch that starts after it. The
restructure that looked like invariant 32's own pattern — `{ activate: false }` plus a
caller-side `setActiveProject` after the token check — helps only if the adapter's index
read-modify-write is atomic; where it is, the residue does not arise, and where it is not, the
delete's write is derived from a stale read and can clobber the winner's id with a **deleted**
one, a dangling `activeId` that makes `autoSave` refuse and raises the storage banner. Since
`createProject`, `autoSave`, `setActiveProject` and `deleteProject` all read-modify-write the
index, an adapter without that atomicity is already broken for all four. **The property belongs
to the seam, not to one method's signature.**

**And the residue is unreachable on the current adapter, which the entry never checked.**
Every index write in `deleteProject` lands in the same synchronous run as the
`readIndexForWrite` it derives from — no `await` between them on either branch that moves
`activeId`, and the last-project branch writes through `createProject`, whose body is
synchronous end to end. The claim generalises: **every method on `BrowserStorageAdapter` is
synchronous-bodied**, so no two of `App`'s four adopting handlers can overlap in production at
all, because microtasks drain before the next click is dispatched. That is why 157's race tests
have to hang a mocked `loadProject` to build a race, and it puts 160 in 157's class — latent,
reachable only on a future adapter with real async I/O. `importProject`'s `await file.text()`
is the one genuine suspension in the file and is not a counterexample: it sits before
`importIntoLibrary`'s token bump, so no token-holding critical section spans it.

**So what shipped is the pin, because the property was an accident and is now a decision.**
`deleteProject`'s doc comment carries an explicit prohibition against an `await` between the
index read and the index writes, and two tests call `deleteProject` **without awaiting it**,
reading the committed index straight out of the store — one per branch that moves `activeId`.
Awaiting the call is exactly what would make them unable to fail, so the comment says not to
tidy them that way. Mutated rather than merely run: an `await Promise.resolve()` between the
read and the write turns both red, and one inside `createProject` before its own write turns
the last-project test red on its own, showing it covers the callee rather than the caller. No
other test in the file caught either mutation. 937/937 tests, build clean, no source, schema
or storage-layout change — nothing to deploy.

**What the duplicate-error round did (2026-08-31)** — the sixth small round of the day, and
the first since the project library to add a control surface rather than only correct one.
Follow-up **159** had recorded that `onDuplicateProject` reports the storage layer's verdict
like its three siblings, but that `duplicateProject` returning null for a missing or
unreadable source moves no verdict to report: `storage.available` stays true, correctly,
because the store is working and one project's data is gone. The user pressed ⧉ and nothing
happened — no row, no banner, no message. The entry stopped there on purpose, because the
honest fix is a surface and a surface is a design question.

That question was put to the user with four options — a message on the failing row, one
message at the foot of the popup, marking the row unopenable instead, and (implicitly, from
`importIntoLibrary`) throwing. The row-level surface was chosen, which is also the one the
app's own idiom already argues for: a cut's error lives with its cut.

**The cause is carried rather than collapsed to a boolean**, because `duplicateProject`
returns null for two reasons that need different sentences. `source-missing` is 159's case;
`write-failed` is storage refusing the new key, which raises the banner too, and telling that
user their data is "missing" would send them looking for the wrong thing. This is
`TapeReadout`'s cause-carrying `TapeError` applied one component over.

**The two are told apart by `storage.available` — the adapter flag, never the `available`
React state**, which is a render behind and is not updated synchronously by `setAvailable`.
Mutation pinned that: swapping them turns the write-failure case red. The same mutation pass
also killed a claim of the round's own — that the read had to sit *after* `setAvailable`. It
does not; that call touches React state and mutates nothing on the adapter, so hoisting the
read changes no behaviour and no test. The comment was corrected to say which half is real,
so a later reader does not preserve an ordering that means nothing while feeling protected by
it. That is the ledger's recurring "a constant whose stated justification doesn't reproduce"
shape, caught this time inside the round that wrote it.

**One clearing rule, as an effect keyed on `open`**, not a reset beside each of the popup's
six close paths — invariant 34's argument, one component over. The per-row error also dies
with its row for free, since it renders inside `projects.map`.

Ten mutations, with both survivors reported rather than hidden. Caught: never reporting (6
red), never clearing on success, dropping the clearing effect, showing the message on every
row (4), one message for both causes (2), always `source-missing`, always `write-failed`,
never reporting from `App` (2), and reading React state instead of the adapter flag. Survived:
the `setAvailable` ordering above, which is why the comment changed instead of the code.

**The browser pass covered what no fake could.** The unit tests drive a stubbed `onDuplicate`
and a fake store, so they pin the wiring; only a real browser shows the real adapter taking
its null branch for a key that is really absent. `localStorage` was seeded with a library
index naming two projects and only one project key written — the state the two-tab case
(**154**) or a hand edit produces. The message appeared under the failing row and not the
healthy one, in `.field-error`'s existing `--alert` colour at 11px, wrapping to two lines
inside the 20rem popup without overflowing it; the banner correctly stayed away; nothing was
written; and both clearing rules held live, including a success on the healthy row clearing
the broken row's message. `docs/browser-verification-duplicate-error.md`. 934/934 tests,
build clean, no schema or storage-layout change.

**What the agreement-test round did (2026-08-31)** — the fifth small round of the day, and
the only one to close a follow-up by rejecting both remedies that follow-up named. **140**
recorded `depthField.agreement.test.ts`'s heaviest case ("rabbets on all four edges plus
crossing dados") timing out at 5,000 ms about one run in four, diagnosed it as legitimately
heavy geometry sitting close to the ceiling, and named two fixes: raise `testTimeout` for the
file, or split the case.

Both treat the cost as irreducible. It was not. The two probe helpers, `stockAtMinFace` and
`removedDepthAtMinFace`, each called `boardSolids(board)` **on every invocation** — and the
test probes 21 cells twice over plus a 96 × 48 converse sweep, so one case made **4,650
calls** to a pure function of a board that never changes inside it, every one returning the
same six regions. Hoisting it to a single call per case changes what the test costs and
nothing about what it checks; the assertions are untouched, and `depthField.ts` was not
edited at all.

Measured inside a full-suite run, which is the contended condition the flake needs — the file
run standalone never reproduced it — the heaviest case went from **1,549–1,690 ms** (a third
of the ceiling) to **11–19 ms** (a fraction of a percent). No `testTimeout` was added: a
per-file ceiling is the tool for work that is genuinely irreducible, and setting one here
would have preserved the waste and hidden the cause.

**Two things reported rather than glossed.** The timeout itself was **not reproduced** this
session — eleven full-suite runs on the unmodified file all passed, consistent with a rate
quoted at ~1 in 4 on a day when the box was running many parallel agents, and not evidence
the flake was imaginary. And the first attempt to demonstrate the fix was a bad measurement:
a background Chromium left over from the previous round's browser pass was taking 262% of
this box's four cores, which inflated whole-suite duration from ~18 s to ~33 s and briefly
looked like the change had made things slower. It had not; the comparison was re-run old
against new under one condition.

**The test was mutated afterward**, because a hoist that quietly broke the assertions would
also be fast and green — and invariant 20 records that this very file's first version passed
with its cover step broken. Four mutations of `depthField.ts`, all caught: `Math.min` for
`Math.max` (3 red), every depth shaved by 1/64 (6 red) — the right-coverage, wrong-number
case invariant 20 exists to warn about — dropping cells covered by a single cut (6 red), and
emitting a cell everywhere (6 red).

The portable lesson goes in the same family as the ledger's long-running one about
plan-supplied text, turned on the ledger itself: **a remedy an entry names is a hypothesis
recorded at diagnosis time, not a prescription.** Both of 140's were reasonable and both
would have turned the suite green. Neither would have noticed the test was doing 4,650 times
the work it needed to. 926/926 tests, build clean, no source change.

**What the turned-label round did (2026-08-31)** — the fourth small round of the day, and
the first of them with anything a user can see. Follow-up **92** had been open since the
sheet-nesting round with two unrelated halves, and both are closed here.

The first half was structural. `` `${formatLength(length)} × ${formatLength(width)}` ``
appeared verbatim in the placed-part path, the unplaceable-part path and — unnamed by 92,
but the same expression over a `SheetStock` — the sheet-size label, with nothing pinning
that the three stayed in agreement if one were ever edited alone. `nesting.ts` imports
`formatLength` in the first place so that one dimension cannot read differently in two
places on one printed sheet; three spellings is that guarantee held by convention rather
than by construction. It is now `formatDims(length, width, precision)`, taking two numbers
rather than a `Board` so the sheet-stock caller can share it. No test came with it,
deliberately: two spellings that must agree needed one pinning them, one spelling does not.

The second half was the user-visible one. `PlacedPart.turned` existed in the data and was
asserted in tests, but nothing on a rendered sheet said it in words, so a near-square
rectangle could not be told apart from a transposition of the printed dimensions. Four
options were put to the user — a word, a symbol, printing the placed footprint instead, and
a corner tick with a legend — and the word was chosen. A turned part now reads
`23" × 24" turned`, and its key-list entry `1. Cleat — 5" × 6" turned`.

**The word rides on `PlacedPart.dims` rather than being concatenated in the panel, and that
is invariant 19 rather than tidiness.** `SheetLayout` hands `[name, dims]` to `fitLabel` and
then draws those same two strings; a panel-side concatenation would measure one string and
draw a longer one, and every unit test would still pass — the tests assert the arithmetic,
not the render. It is appended and never a transposition, so the pair still matches the
cut-list row for the same board; the test that pins that now also asserts the swapped pair
is absent, since a whole-string `toBe` would go on passing if a future edit swapped the
numbers and kept the suffix. An unplaceable part never gets the word: it fit no sheet in any
orientation, so it was never placed and has no orientation to report.

**The browser pass earned its keep, and would have earned more against the option not
chosen.** `SheetLayout` has no panel tests at all — its only coverage is `buildNesting`'s
unit tests and this pass — and the change lands on invariant 19's arithmetic, whose failure
mode is invisible by construction: `labelWidth` is characters × `CHAR_W`, and a glyph with a
different advance makes that number unrelated to the render while everything stays green.
Measured in Chromium: ASCII letters, digits, `"` and the non-ASCII `×` all advance 12.0345
at the applied 20px, against `CHAR_W`'s 12.4 — an over-estimate of about 3%, the safe
direction its own comment says it is rounded up for. The rejected symbol option is exactly
what that measurement exists to catch. All three label tiers were driven (`full` turned,
`full` unturned, `index` via the key list) and no label exceeded its rectangle; the longest,
at 192.6, sat in a 250-wide box. `docs/browser-verification-turned-label.md` has the tables.

The accepted cost is seven characters, so a turned part reaches a smaller label tier sooner
than an unturned one. That has a residue, filed as **161** rather than fixed: the `name`
tier prints neither dimensions nor the word, so it is the one tier where a turned part still
says nothing. The remedy — demote a turned part from `name` to `index`, where the key entry
carries everything — is a legibility judgement about mid-sized parts, and the round's design
question had already been asked and answered. Mutation: never appending (2 red), always
appending (3 red), transposing inside `formatDims` (7 red). 926/926 tests, build clean, no
schema change.

**What the gesture-flags round did (2026-08-31)** — the third small round of the day, and
the one with the least user-visible surface: nothing about the app changes, and the defect
it closes was only ever reachable in tests and in a browser path nobody had hit. Follow-up
**148** had the diagnosis, the reproduction and the named remedy already written down, so
there was no spec and no plan — the same shape as the day's first two rounds.

`store.ts` held `gesturing` and `gestureSnapshotTaken` as `let` bindings in the closure
`create()`'s factory opens, not as fields on the store. Everything else that must not
outlive a document — the document, the history, all three held points, the tape axis —
is state, and `replaceDocument` rewrites it; these two were the exception it could not
reach. So a component that unmounted **while a gesture was open** left `gesturing` true for
the rest of the session, and invariant 4's lazy snapshot then skipped every undo snapshot
from that point on. The symptom is not an error: it is missing undo entries in code that
never opened a gesture, which reads as a defect in whatever runs next. In RTL, where
`cleanup()` tears the tree down between tests and jsdom fires no blur on unmount, "whatever
runs next" is every later test in the file.

The fix is the first of the two remedies 148 named, and it named it the better one for a
reason worth restating: a flag reset by convention at every call site is the same shape as
the held-point clearing rules invariant 24 had to enumerate, and what makes those
enumerable at all is that they live in the state. The entry attached a precondition to it —
`beginGesture`/`endGesture` cost no re-render precisely because the flags were outside
state — and that was checked rather than argued: every `useStore` call site in `src/`
passes a selector and none names either field, so the move costs one `set()` at each
gesture boundary (focus, blur, gizmo mousedown and mouseup — never per frame) and re-renders
nothing. The fields are public by necessity and private by intent, and `StoreState`'s
declaration says so.

**The interesting part of the round is the test, and it is a 155 lesson applied
prospectively rather than learned again.** The obvious test — assert `gesturing === false`
after `replaceDocument` — cannot fail: the field initialises false, so it passes with the
reset deleted. The test written instead leaves a gesture open, replaces the document, edits,
and asserts `past` grew; with the flags left standing the edit coalesces into a snapshot
nobody took and `past` stays empty. Mutation confirmed it turns **7** tests red, six of them
the contamination crossing into later tests — the reported symptom, reproduced from the
other side.

**Two mutations survived, and reporting them is the point.** Deleting
`gestureSnapshotTaken: false` from `replaceDocument` passes 137/137, because `!gesturing`
short-circuits the snapshot test and `beginGesture` clears the flag regardless; it is kept
as symmetry with `endGesture` — "the gesture is closed" said once, wherever it is said —
and not claimed as covered. `takeSnapshot = gesturing` can be written `= true` with nothing
observing the difference, for the same reason and pre-dating this round. Both semantic
mutations — the `gesturing` reset, and persisting `gestureSnapshotTaken` out of `edit()` —
fail loudly. 924/924 tests across 35 files, build clean, no schema change and no storage
change.

Two comments were corrected rather than left to drift. `Gizmo.tsx`'s mid-drag guard called
`gesturing` "the store's private flag" and said a leak lasts "forever"; both are now false,
and the guard stays primary anyway, since nothing about a mid-drag unmount implies a
document is about to be replaced. `App.test.tsx`'s `.blur()` workaround was **kept** — the
reviewer who confirmed the leak also confirmed the blur was legitimate rather than masking,
because it ends the test in the state a real browser would end in, which is true no matter
where the flag lives.

**What the id-uniqueness round did (2026-08-31)** — the second small round of the day, and
like the first it had no spec: follow-ups 97 and 131 had the remedy written down, and 131
explicitly deferred to "whichever round closes 97", so closing either alone was ruled out
before the work started.

The gap was that `validateBoard` minted an id only when one was **missing**. Two boards
arriving as `id: 'a'` both kept it — and by the sheet-nesting round that had become
load-bearing without anyone noticing: `buildNesting`'s tiebreak (`a.id.localeCompare(b.id)`)
needs a total order or the layout can reorder between renders, and `SheetLayout` keys its
groups by board id. Guides had the same exposure by a different route, where a duplicate id
makes `removeGuide` delete two rows at once. Only reachable through Import, which is the
only door a hand-edited or badly-merged file comes through.

**The rule was already in the file.** `validateCuts` had been re-minting a duplicate cut id
since the joinery round; it just had it inline and nobody had given it a name. So the round
is an extraction rather than an invention: `takeId(raw, seen)`, called by all three
validators, with `seen.add` **inside** it — a call site that forgets that turns the whole
rule into a no-op, and no test of that call site's own behaviour would see it.

Two design points were decided rather than inherited. The first is that it is a threaded
`seen` set rather than a `dedupeIds` pass beside `dedupeNames`, which is the symmetric-looking
option and the wrong one: a name needs a replacement computed *from* its siblings, which is
precisely why `dedupeNames` cannot live inside `validateBoard`, whereas an id needs nothing
from them but "is this taken". A second pass would have left two deciders for one field. The
second is that cut ids stay scoped **per board** while board and guide ids are per document —
`Properties.tsx` keys `CutRow` by cut id within one board, so two boards may each carry a cut
called `c1` and neither is wrong.

What makes re-minting the later duplicate safe is a property of the schema rather than luck,
and it is written into invariant 33 so it can be checked when it stops being true: nothing
inside a document references a board or guide id. `Board.cuts` is inline, `GuidePoint` is
`{ id, at }`, and every id lookup in the app reads runtime state set after a load. A future
field pointing at a board BY ID would turn this single expression into a two-pass rewrite.

**Four mutations, all caught.** `takeId` returning `raw` unconditionally (4 red), `seen.add`
deleted (4 red), re-minting *everything* (9 red), and cut ids sharing one document-wide set
(3 red). The third is the one worth keeping: re-minting every id passes every distinctness
assertion just as well as the correct rule does, and would quietly rewrite the ids in every
file that was already correct — so there is a test whose whole job is to assert that an
already-distinct document comes back untouched, and the others pin the surviving id by its
literal fixture value rather than by counting the set.

923/923 tests across 35 files, `npm run build` clean. No schema change: `CURRENT_VERSION`
stays 6, because an id repair is a normalisation in the same family as the name and material
fallbacks, not a migration.

**What the switch-token round did (2026-08-31)** — no spec and no plan; both remedies
were already written down in the ledger as follow-ups 157 and 158, which is why this
went straight at the code. It closes the project library round's own two loose ends.

**157 — one shared in-flight token.** The four handlers that adopt a new active project
are all async before they mutate, so two can be out at once and adopt in either order.
The library round guarded only `openProject`, on the ruling that it was the one path a
user could double-click. Executing the fix turned up three things the ledger entry did
not say.

The first is that the shipped guard was not merely narrow, it was the **wrong shape**.
It was a boolean that DECLINED the second click — so a user who clicked row A, reopened
the caret and clicked row B ended on **A**, the row they did not choose. That is the
same casualty the entry was filed about, arriving by the other road. Worse, the test the
entry itself specified — "two rows clicked and resolved out of order" — is unreachable
under a decline, because the second click never issues a `loadProject` at all. The
ledger had specified a test its own code could not run. So the guard was deleted rather
than generalised, and the rule became one sentence: **the last handler to start owns the
outcome.**

The second is that the token check alone did not fix the thing it was supposed to fix.
A superseded `onNewProject` had already let `createProject` move the index's `activeId`
to the project it wrote, so abandoning the adoption still left the persisted id on a
document the user was not looking at. `browser.ts` had already ruled on exactly this for
`duplicateProject` — an implicit activate "leaves the trap armed for the NEXT caller" —
and `onNewProject` and `importIntoLibrary` **were** the next callers. Both now pass
`{ activate: false }` and call `setActiveProject` themselves after the check, so moving
the persisted id and adopting it are one step on one side of it. `onDeleteProject`
cannot be made to do this (its index write is intrinsic — the project is gone and a
replacement must be named in the same write), so it keeps a narrower guarantee, written
down as follow-up 160 rather than left as a silence.

The third is small and was decided rather than inherited: the bump sits *before*
`openProject`'s `id === activeId` early return, so clicking the already-open row while a
switch is out means "stay here" and cancels it. Uniform last-click-wins is one sentence.

**158 — a `tsc` receipt instead of a review comment.** The pending autosave write was
`{ id, doc, timer }`, and invariant 29's matched-pair requirement was doc-enforced only:
rewriting the flush to `storage.autoSave(activeId, p.doc)` reintroduced exactly the
forbidden mismatch and passed all 51 `App.test.tsx` tests. The record is now
`{ write, timer }`, where `write` is a thunk built inside the autosave effect — the one
scope where `activeId` and `doc` are each other's counterpart by construction, because
the effect reran for exactly those two values. The flush has no id and no document, so
the forbidden line does not compile. A branded pair type was considered and dropped: it
relocates the mismatch (`projectWrite(activeId, p.doc)` is still constructible) and
costs a `StorageAdapter` signature change across a dozen test call sites. The other half
of 158 was comment-only — `App.tsx` claimed "ONE RULE FOR ALL FOUR HANDLERS" about
reporting the storage verdict, which is false for `onDuplicateProject`, and the comment
now states the rule and its limit. Flipping `_available` there was rejected: the store is
working, one project is simply gone, and the banner would be lying. What that leaves —
a failed duplicate being silent — is follow-up 159.

**Everything here was mutated before it was believed**, which is the project library
round's own lesson (follow-up 155) applied to its own leftovers. Deleting `openProject`'s
supersede check turns both new App tests red; making `onNewProject` read the token
without bumping it turns the first red; the `activate` contract is pinned against the
**real** adapter in `browser.test.ts` and mutated in both directions. That last choice
was forced: `App.test.tsx`'s fake `createProject` took one parameter and activated
unconditionally, so an assertion about the persisted active project written against it
would have passed for reasons unrelated to the change. That is the **sixth** divergence
between the App fake and the real adapter, after the five follow-up 156 enumerates; the
fake was taught the parameter rather than the divergence being left silent.

916/916 tests across 35 files, `npm run build` clean. No schema change, no storage layout
change, nothing user-visible except that the project you finish on is the project that
reopens.

**What the project library round did**, design in
`docs/superpowers/specs/2026-08-14-sloyd-project-library-design.md` (amended mid-round —
see §2.2 below), browser pass in `docs/browser-verification-project-library.md`. Opened
2026-08-14 by the user: *"There doesn't seem to be a clear way to store, switch, or create
new projects."* That was an accurate reading of the app, and this round makes it false.
Sloyd had exactly one project and nothing said so: `sloyd.autosave.v1` was the whole of the
user's persistent state, the only way to start a second project was to empty the first, and
Import replaced what was on screen behind a `window.confirm`. There are now an index at
`sloyd.library.v1` and one `sloyd.project.<id>` per project, with a caret beside the
toolbar's project-name field opening a list that switches, creates, duplicates, deletes and
imports. The seam had anticipated this — `StorageAdapter` already declared `listRecent()`
and a `capabilities.recentFiles` flag, and the browser adapter answered `[]` and `false` to
both; much of the round is making those honest.

**Why the project id lives in the index and not the document — the decision the whole
layout hangs off.** A project needs an identity that survives renaming, and `SloydDocument`
has a `name` and no `id`; keying the library by name breaks the moment two projects share
one, which the app cannot prevent and should not try to. The id is therefore minted by the
library and stored **only in the index**, so the document gains no field and
`CURRENT_VERSION` stays **6**. That is a deliberate reading of the rule that a version bump
exists for the refusal gate at the far end, applied by checking what a *lost* id would
actually cost: a `.sloyd` file carries no id, so importing one into any build produces a new
library entry — which is not v5's wrong number and not v6's silent data loss, it is the
behaviour you would want from an import anyway. Neither bump argument reaches this field, so
no bump. The payoff is stated in the status section and is large: **rolling back past this
round costs nothing at the document level**, which is not true of the two rounds before it.

**Two things now carry a version, and they are separate on purpose.** `migrateDocument`
versions the *document*; nothing versioned the *arrangement of keys the documents sit in*,
because until now there was one key and no arrangement. `layout: 1` in the index is that
version. They move on their own schedules because they change for unrelated reasons, and a
`.sloyd` file written by this build is byte-identical to one written before the library
existed.

**Why adoption verifies before it commits.** `sloyd.autosave.v1` *is* the user's project on
a pre-library build — no server-side state, nothing to restore from — so an adoption path
that orphans that key destroys real work and the round has no way to apologise for it. The
order is therefore: read the legacy key, migrate it, write `sloyd.project.<id>`, **read that
key back and confirm it parses**, and only then commit the index. Write new, verify, commit;
never overwrite in place. If the verify fails, the index is not written, the legacy key stays
authoritative, the session runs the pre-library path, and adoption is simply retried on the
next boot — since the absent index is the only thing that triggers it. **A failed adoption
must degrade to *today's app*, not to an empty one.** And the old key is never deleted: it
costs a few kilobytes and it is the entire rollback story, so the adapter carries a comment
saying so at the point where deleting it would be natural. All of that is invariant 30 and
31; the browser pass confirmed the byte-identity of the legacy key in all four of its
adoption cases, comparing against a pretty-printed seed so that an equivalent-JSON rewrite
could not pass as no rewrite.

**§2.2 was amended mid-round, and the amendment is the round's most important correction
(R7).** The spec said adopt "when `sloyd.library.v1` is absent"; the implementation
broadened that to "absent **or** unusable", which meant a `layout: 2` index naming real
projects would be silently rewritten to a layout-1 index holding the stale pre-library
document. The argument that settled it is an appeal to a rule the codebase already had: **the
document layer refuses a `version` it does not understand rather than guessing at it — that
is exactly what the v6 bump bought — so the storage layer owes the same refusal to a `layout`
it does not understand.** Adoption was narrowed to the spec's literal words and the spec was
amended in the same commit, evidence governing over authored plan text. A present-but-unusable
index now writes nothing and degrades to a genuinely read-only legacy session with the storage
banner showing (R16 — the first cut of that branch left `available` true, so the app claimed
"Saved locally" while writing nowhere). Two neighbouring branches were then enumerated rather
than discovered later: an index that parses but names a missing project falls back to another
loadable one, and one with `projects: []` creates a fresh `Untitled` — **never a re-adopt**,
for one reason, that an index existing means adoption already happened and the legacy
document is stale by definition.

**Why the menu's Escape sits outside `App`'s single keydown effect.** Invariant 27 requires
every **window-level** shortcut to live in that one effect and any new `window` listener to
take the cut-list-open flag explicitly. The menu's Escape is bound to the menu's **own
subtree** and its outside-click listener is mounted only while the menu is open, so neither
is window-level in invariant 27's sense: the hazard that invariant exists for is a listener
that cannot tell which subtree an event came from, and a listener scoped to `root` can. The
positive reason not to route it through `App` is that doing so would mean threading menu
state upward and re-deriving a `cutListOpen` guard. That guard's job is to stop a shortcut
acting on a hidden subtree — and by the time the cut list could be open, the popup's own
close-on-focusout has already closed it, since opening the sheet is a toolbar click that
moves focus out of the popup first. Worth recording that the *first* version of this comment
overclaimed: it said the popup was provably unreachable behind the cut list, and it is not —
Tab out of the open popup to the Cut list button and press Enter, and the resulting `click`
fires with no preceding `pointerdown`, which the outside-click handler never sees. No stuck
state results, because focusout closes it during that same Tab; but the closing is doing real
work there rather than being a formality, and the comment now says so.

**Why the ARIA menu roles were dropped rather than backed with roving tabindex (R19).** The
first cut claimed `role="menu"` with generic `div` wrappers inside it, plain buttons as
descendants, a bare `div` divider and no arrow-key navigation — so assistive technology in
menu-navigation mode might not expose the duplicate and delete controls at all, defeating the
keyboard-reachability constraint at the semantic layer even though the DOM and the CSS were
right. The choice was between implementing the full pattern and dropping the claim. **Dropped
it:** a row carries a name plus two independent actions, which is grid-shaped rather than
menu-shaped, and the full menu pattern is more machinery defending a role this popup does not
need. Plain buttons in DOM (Tab) order are the honest interaction, `aria-expanded` stays on
the caret, `aria-current` marks the open project the way a nav landmark would (not
`aria-checked`), and close-on-focusout was added to cover the Tab-out that no pointerdown
accompanies. The browser pass then had to earn that back: Tab order was walked in both
directions, both row controls were reached and operated by keyboard alone, and a full two-step
delete was armed and confirmed without a pointer.

**Two more decisions stated rather than left implicit.** Import's `window.confirm` is
**retired**: it existed because the outgoing document was about to be destroyed, and once
every project autosaves to its own slot nothing is destroyed by opening another one — so
Import, New and picking a row all switch without prompting, which is written down precisely
because inheriting the confirm by analogy is the obvious thing to do and would be wrong. And
delete is a **two-step inline confirm** rather than a native dialog — the app throws exactly
one native dialog today and this round retires it, so adding a second would move against that;
keeping the confirmation inside the row also keeps the project's name visible while you
confirm, which is the fact you actually need. Deleting the active project switches to the most
recently saved remaining one; deleting the last immediately creates a fresh `Untitled`, so
there is never a no-project state and no component has to render one.

**The bug that reached the fix round, and why it was invisible (R21/R22).** `createProject`
had a hidden side effect — it set the stored `activeId` — which two of its three callers
wanted and `duplicateProject` did not. After duplicating, the stored `activeId` moved to the
copy while React's `activeId`, the on-screen document and the menu's `aria-current` all stayed
on the original: nothing looked wrong, and the **next boot opened the copy**. It was fixed at
the adapter by making the side effect explicit in the signature —
`createProject(doc, { activate })`, so every call site states which it means — rather than by
patching `duplicateProject` to restore the prior id, which would leave the trap armed for the
next caller. The reason no test caught it is R22 and is the more useful half: `App.test.tsx`'s
fake `duplicateProject` never touched `activeId` where the real adapter did, so the fake could
not model the bug. The browser pass checked the fix at the byte the bug lived in — duplicate,
reload, and read `activeId` out of the index — rather than at what looked selected.

**Six distinct plan-supplied tests in this round could not fail, and that belongs in the
record.** (*Distinct* is load-bearing: the ledger's own running count calls R18 the sixth
instance, which it is only because the dep-array observation was logged twice — as a Task 4
deferred minor and again as R17 — so R22 is the seventh ledger entry and the sixth distinct
test. Both counts are right; follow-up 155 carries the derivation, because a bare number
copied into several homes is 146's shape.) The
repo already tracks this failure class — invariant 23 is the canonical case, and CLAUDE.md's
"code and justifications supplied verbatim by a plan have been wrong" chain is the ledger —
but six in one round is the sharpest single data point in it, and one of the six was hiding a
real shipped bug rather than merely being weak. Enumerated in follow-up 155; in brief: the
write-verify-commit ordering survived being inverted (22/22 green), the byte-identity
guarantee survived an equivalent-JSON rewrite of the key it protects, "a background delete
leaves the open project alone" survived an early return that made it vacuous (55/55), the
switch-race test passes with `activeId` removed from the dep array, the
`libraryAvailable: false` gate survived being flipped to `libraryAvailable ||` (all 889), and
the App fake's `duplicateProject` diverged from the real one in exactly the field R21's bug
lived in. Five were found by a reviewer mutating the code and re-running; the sixth by asking
why a known bug had produced no red. The pattern is narrower and more actionable than "write
better tests": **a test whose subject is an ordering, a refusal, or a "cannot exceed" property
must be mutated before it is believed**, because all three shapes admit a test that observes
the end state and cannot see the step that was skipped.

**The autosave race, and a correction to how it is prevented (R17).** If the active project id
lived inside the adapter, a debounce armed while project A was open would fire after a switch
and write A's document into B's slot — real, silent data loss. So the id is an explicit
argument, `autoSave(id, doc)`. The plan said the `activeId` entry in the effect's dependency
array was what closed the race; mutation testing showed that is false — with `[doc]` alone
the race test still passes, because the id is captured in the same closure as `doc` and `doc`
changes on every switch, so the effect's existing cleanup clears the pending timer before the
new one arms. The dep entry is nevertheless load-bearing, for a different reason found in the
same investigation: there is exactly one path where `activeId` changes and `doc` does not —
the restore effect's edit-wins branch — and without the entry that adoption never re-arms
autosave, killing every save for the session while the indicator still reads "Saved locally".
Both halves are now invariant 29, written so a future reader who deletes the entry because
"the race doesn't need it" is warned off.

**The write-verify-commit ordering ended up in one primitive because it was on its way to
three (R10).** `adopt` and `addUntitledProject` each carried a copy and `createProject` was
about to add a third; a safety rule written out three times is a rule that holds in two places
after the next edit. It is now `writeVerifiedProject`, called by all three — invariant 31. The
same seam carries the refusal (R13): a mutating operation reads the index through
`readIndexForWrite` and refuses when it is unusable, rather than trusting every caller to
check `libraryAvailable` first, because a convention that has to hold in `App.tsx` to protect
`localStorage` is not a seam. `deleteProject` refuses before touching the project key itself —
a partial delete is worse than no delete.

**What the browser pass confirmed and what it could not.** All five adoption cases passed,
including the two the tests can only approximate: a v1-era document migrating *before*
adoption (asserted on the payload — rotation 270 → 90 and `standing: true` → `on-edge`, since
invariant 11's failure mode is a legal-but-wrong value that looks fine in any render), and the
refusal gate, where a `layout: 2` index left every byte untouched, the caret was absent from
the DOM, the storage banner rendered with its real text, and — beyond the brief — an edit made
in that degraded session still wrote nothing anywhere after the debounce elapsed. Switch,
duplicate-then-reload, all three delete shapes and two imports were driven for real, with
every result read out of `localStorage` rather than judged from the screen. Zero console
errors throughout. What it could not reach: a genuinely quota-full `localStorage` (153), two
tabs sharing one origin (154, a materially new situation this round creates and nothing was
designed for), any browser but Chromium, any window size but one, and touch input. Two
cosmetic findings were recorded rather than fixed (151, 152).

**What the snap-move round did**, design in
`docs/superpowers/specs/2026-08-02-sloyd-snap-move-design.md`. Chosen 2026-08-02, after
the sheet-nesting round shipped and production caught up to `master`. Point-to-point
board placement, and the first thing in six rounds that is not about the cut list: with
the Move tool active, hovering the viewport marks the single nearest *snap point* — a
board corner, an edge midpoint or a face centre — within a pixel radius of the cursor;
clicking it grabs it; clicking a point on another board moves the grabbed board so the
two points coincide exactly. No button is held between the two clicks, which is the
whole payoff of click-move-click over press-drag-release: the camera stays fully usable
mid-move, so you can orbit around to find the face you are aiming at and the grab
survives it.

- **26 points per board, and the volume centre is deliberately not the 27th.** A board
  is always an axis-aligned box — `rotation` is only 0 or 90 about Y and `posture` merely
  names which dimension points up — so its candidates are exactly the 3×3×3 lattice of
  `{min, mid, max}` on each world axis, read off `position` and `boardExtents`. There is
  no arbitrary transform to invert and no oriented bounding box. The count of axes
  sitting at `mid` is what names the kind, out of the same loop rather than from a
  separate classification: none is a corner, one an edge midpoint, two a face centre.
  Three would be the volume centre, and `boardSnapPoints` skips it — it is the one
  lattice point that floats inside the solid where nothing draws it, so its marker would
  hang in mid-air with no feature under it, which is the opposite of an inference
  indicator's job. All 26 are distinct for any board with non-zero dimensions, so no
  de-duplication step exists to go wrong.
- **`SnapOwner` is the one decision in the round that outlives the round.** The picker
  consumes `SnapPoint[]` and never sees a `Board`, and a `SnapPoint`'s `owner` is a
  discriminated union (`{ type: 'board'; id: string }`) rather than a bare board id.
  At that point there was exactly one member, which made the union look like ceremony
  until you looked at the named follow-ups: a guide point is a bare position the user
  placed, a guide line contributes its endpoints and its intersections with other guides,
  and the tape measure's anchor was expected to be transient and owned by the tool itself.
  None of those belongs to a board. With a bare id, every one of them would have to reopen
  the picker's signature — and the cheapest shortcut at that moment would be to synthesise
  a fake `Board` to carry a guide point, which would put a lie in the document layer.
  Taking `SnapPoint[]` cost nothing and made each follow-up a new *provider* instead.
  The cut-aware points deferred in §8 landed the same way: dado shoulders are a second
  provider over the same board, not a different picker (follow-up 99). **The
  guide-points round then added the second member and settled two of those predictions,
  one of them the other way**: guides are indeed a provider and the picker's signature
  never moved, but the tape's anchor turned out to need the *store* rather than the tool
  (it holds a captured world position, so it needs invariant 24's clearing, which a
  `useState` in the component cannot get), and guide lines were dropped outright
  (follow-up 130). The widening also has a cost this bullet could not foresee — see
  invariant 26.
- **Screen space, not raycast-first — chosen against the cheaper option for a concrete
  reason.** The obvious approach is to raycast the board under the cursor and offer only
  that board's points; it is cheaper and it disambiguates for free. It is also wrong,
  because **a corner silhouetted against empty space has no board under the cursor at
  all**. Raycast-first would make exactly the corners that are easiest to see the
  hardest to hit, which is the reverse of what the tool is for. `pickSnapPoint` instead
  projects every candidate to canvas pixels and takes the nearest within `PICK_RADIUS_PX`,
  breaking ties by depth. `project` is a **callback, not a camera**, which is what keeps
  the module free of THREE and therefore unit-testable — the repo's rule that the r3f
  viewport is verified by driving a browser still holds for how the tool *feels*, but
  which point is nearest is arithmetic, and arithmetic does not need a browser. The same
  argument covers occluded candidates staying pickable: from some angles the silhouetted
  corner *is* the occluded one (follow-up 104).
- **The move is one subtraction through `updateBoard`, and is deliberately unsnapped.**
  `position += target.at − grabbed.at`, applied through the existing action, which earns
  undo, autosave and gesture coalescing without a line of new bookkeeping. It is **not**
  rounded to `SNAP_INCHES` — see invariant 25 for why that is the opposite of what
  `Gizmo.tsx` correctly does. Two guards sit in front of the edit and both have named
  failure modes rather than being defensive habit: a **zero-delta guard**, because
  `edit()` unconditionally pushes an undo snapshot and clears redo, so a no-op move would
  leave a no-op undo entry (invariant 4) and silently wipe the redo stack; and a
  **self-snap guard**, deliberately redundant with `MoveTool`'s candidate filter, which
  already withholds the grabbed board's own points so the case draws no marker and cannot
  be clicked. The filter makes the rule true of the UI; the guard makes it true of the
  action. Snapping a board's corner onto its own opposite corner is a legal subtraction —
  it translates the board by its own length — and never what a person means.
- **`tool` and `grabbed` live in the store, which departs from `shortcutsSuspended`'s
  reasoning on purpose.** Both are view state beside `selectedId`: outside the document,
  outside the undo stack. CLAUDE.md's existing text says `shortcutsSuspended` is
  prop-drilled from `App` because putting one flag into shared state *"to save one prop
  would move it into the app's shared state for no gain"* — that reasoning is still
  correct there and does not reach here. `tool` has four consumers at three different
  depths: `Toolbar` renders the pair, `Viewport` hides the gizmo, `MoveTool` decides
  whether to listen at all, and `BoardMesh` (via one prop) stops selecting. Threading one
  flag to four places through two levels is the worse trade, and the store already holds
  exactly this category of state. Read the two as one rule applied to two different fan-
  outs, not as a contradiction.
- **Four existing behaviours had to be gated, and none was hypothetical.** Board
  click-to-select (the commit click lands on a board having travelled ~0 px, so it passes
  the slop test and the panel jumps to the board you just dropped onto); click-to-deselect
  via `onPointerMissed` (cancelling a grab in empty space would clear the selection, and a
  modal tool must not change selection as a side effect); the gizmo, whose handles sit
  over the very board whose corner you are trying to grab and which captures the pointer
  first, so it is not rendered in move mode; and Delete/Backspace, which would delete the
  board being carried. `OrbitControls` needs **no** gate — a drag past
  `CLICK_DRAG_SLOP_PX` is not a click — and that is the payoff that justified
  click-move-click over press-drag-release.
- **The design's §5.5 was corrected during implementation (`88fd8e1`), and the corrected
  version is both cheaper and more correct.** The design originally said `Escape` would
  be a *new* `window` listener joining the standing list of shortcuts that must take the
  cut-list open flag explicitly. It is not. All three keyboard bindings — `M`, `Escape`
  and the Delete guard — went inside `App`'s **existing** keydown effect, which already
  early-returns on `cutListOpen` at its top. That is not merely one fewer listener: it is
  the behaviour the round actually wants. Pressing Escape while reading the cut list must
  close the sheet and leave any grab behind it untouched, which is exactly what the
  existing guard produces, and which a second listener would have had to re-derive and
  could drift from. Below that guard, Escape backs out one level at a time — drop the
  grab if there is one, otherwise leave the tool.
- **Three off-palette colours, with the user's explicit approval.** Corner green
  (`#2e9e5b`), edge-midpoint cyan (`#22b8d4`), face-centre violet (`#8a5fd0`), each with
  a light ring (`#f5f2ec`) because a flat fill legible on the near-white ground is not
  reliably legible on walnut. CLAUDE.md records brass as *"the one live colour in the
  app"*, and these break that deliberately: an inference marker is transient chrome, not
  part of the model, and it has one job — telling you which *kind* of point you are about
  to snap to before you commit. Shape cannot carry that at the ~9 px a marker must be to
  sit on a corner without hiding it; hue can. All three are cool and saturated against a
  palette that is entirely warm and desaturated, so they read as not-part-of-the-model
  rather than as a clashing member of it. Browser-settled in the sense of follow-up 60,
  not test-settled.
- **Known, deferred, and verified in a real browser** — see
  `docs/browser-verification-snap-move.md` for Task 9's pass (marker colour and
  legibility for all three kinds on all three woods, screen-constant marker size across
  zoom, a silhouetted corner, a deliberately constructed occluded corner, exact
  coincidence read out of `localStorage` rather than judged by eye, an off-grid move
  confirming no 1/16" rounding, one `Ctrl+Z` reverting a whole move, all four gates, and
  the cut-list Escape interaction) and `docs/follow-ups.md`'s "From the snap-move round"
  section (99-108) for the deferrals and the round's own two lessons: a plan-supplied
  test whose *fixture* put two boards at one default position so the delta was
  legitimately zero — the seventh instance of that chain, and the cleanest one, because
  the implementer stopped rather than editing the assertion — and a verification report
  that claimed broader marker coverage than it had checked, closed by taking the missing
  screenshots rather than by narrowing the prose.

**What the selected-board grabs round did**, design in
`docs/superpowers/specs/2026-08-03-sloyd-selected-board-grabs-design.md`. Chosen
2026-08-03, immediately after snap-move deployed, because the tool as shipped offered
**every** board's snap points as grab candidates — and boards in a real project touch,
which is what the tool is *for*, so two of them routinely share a corner and
`pickSnapPoint`'s depth tie-break silently decided which board was about to move. The
tie-break is deterministic but invisible: the marker sits at a position both boards
share, so nothing on screen said which one it named. Before a grab, the candidates are
now the **selected** board's points only; after a grab, the target set is unchanged.

- **The asymmetry is the design.** Two coincident *target* points produce the identical
  delta, so which one wins is unobservable — the board lands in the same place either
  way. Two coincident *grab* points name two different boards. Only one side is harmful,
  so only one side is restricted, and restricting targets "for symmetry" would be
  actively wrong: the board being moved is by definition the selected one, so a
  selected-only target set would leave nothing to snap **to** (follow-up 110).
- **Two sets, not one set with a filter.** `MoveTool`'s memo now branches: no grab →
  the selected board's points (empty when nothing is selected); grab live → unchanged,
  every board's points minus the grabbed board's own. The dep list gains `selectedId`,
  which is invariant 15's exact failure mode and would have looked like it worked.
- **The grab must not survive the selection moving.** Written at `edit()`'s `selection`
  callback rather than at each caller — `addBoard` and `duplicateBoard` both select what
  they create through it, so a grab plus **+ Add board** was a live path to the state
  this prevents — plus `selectBoard`, plus a redundant refusal in `commitSnapMove`. See
  invariant 24's second list: this clears a grab because the *user retargeted the tool*,
  not because the world moved under a captured position.
- **A toolbar hint, and the Move button stays enabled.** *Select a part to move*, shown
  when `tool === 'move' && !selectedId`, because with nothing selected nothing is
  markable and the tool otherwise reads as broken rather than as waiting. Disabling the
  button was rejected: it takes a control away to explain a state, and it would need its
  own rule for the selected board being deleted mid-tool — which the hint needs no rule
  for, since `deleteBoard` already clears both and the app lands in the hinted state.
- **Known, deferred, and verified in a real browser** — see
  `docs/browser-verification-selected-board-grabs.md` and `docs/follow-ups.md`'s "From
  the selected-board grabs round" section (109-118). That pass found **no defect**, and
  it changed the repo's browser method in two ways worth reusing: the projector is the
  app's own `project()` run against the live r3f camera (reached through the Vite dev
  server's module graph) rather than a re-derivation, and every interaction backing a
  recorded result was real `page.mouse`/`page.keyboard` input rather than a synthetic
  `PointerEvent` — which closes half of follow-up 106 and leaves touch/pen open. 115 also
  records how that second half was earned: the pass started synthetic, review caught the
  report claiming otherwise, and the fix was to re-drive the affected checks under real
  input rather than to narrow the claim.

**What the cut-aware snap points round did**, design in
`docs/superpowers/specs/2026-08-03-sloyd-cut-snap-points-design.md`, browser pass in
`docs/browser-verification-cut-snap-points.md`. Chosen 2026-08-03, closing follow-up 99
ahead of the guides round that had been picked a day earlier. A dado's shoulders are now
snap points, which closes the operation the Move tool most obviously exists for: cut a
dado in a side panel, grab the shelf's end corner, click the inside corner where the dado
floor meets its shoulder, and the shelf seats exactly instead of being snapped to a face
centre and nudged. No schema change — `CURRENT_VERSION` stays 5 — no new tool, no new
document state, no new store field, no new UI surface.

- **The governing constraint is not new, and it decides everything.** *A marker must sit
  on a feature that is actually drawn.* That rule was already written twice in this repo:
  the snap-move design excludes a board's volume centre because it floats inside the solid
  where nothing draws it, and invariant 16 is the same rule for edges, which is why
  `boardEdges` exists rather than per-solid `EdgesGeometry`. Applied here it rules out
  three tempting shortcuts. **Deriving from `boardSolids`** — which follow-up 99 itself
  pulled toward, saying *"`boardSolids` already yields them"* — is wrong for exactly the
  reason invariant 16 already litigated: the canonical dado leaves three abutting solids
  across a continuous uncut face, so the solids' corners include phantom seam corners that
  correspond to no real feature. Solid corners are not the shape's corners. **Reusing the
  3×3×3 rule verbatim on the cut's box** is wrong because the cut's mouth is an *opening*:
  its face centre and the edge midpoints spanning it hang in void. And **offering points
  unconditionally** is wrong because two cuts can overlap and the shallower one's floor may
  no longer exist.
- **A cut DEFINES up to 15 points and OFFERS those touching remaining stock.** The floor
  rectangle contributes all nine combinations of `{min, mid, max}` on the two in-plane
  axes; the mouth contributes only its two shoulder lines, six points, because its middle
  row spans the opening. A plain dado offers all 15. **A rabbet offers 12**, because its
  flush end has no shoulder — and that falls out of the filter with **no `cutLabel`
  branch**, which is the cleanest evidence the filter does real work: *"is there a shoulder
  here"* and *"does this point touch stock"* are the same question. Nothing downstream may
  treat 15 as a count it can rely on.
- **`stockProbe` is `boardEdges`' rule generalised from a segment to a point.**
  `cuts.ts`'s one new export builds the same cell grid `boardSolids` and `boardEdges`
  already share, once, and returns a predicate. For each dimension it takes every cell
  index whose **closed** span contains the coordinate — one when the coordinate falls in a
  cell's interior, two when it lands exactly on a split plane — and the point touches stock
  iff any combination of those indices is a filled cell. Up to eight cells rather than
  four; same shape of rule, same reason. One rule, not a case each: a consumed board's
  points, a floor corner a deeper cut removed, and a rabbet's flush end all fall out of it.
  A board with no cuts returns before any grid arithmetic runs, the same zero-cost
  guarantee `boardSolids` makes in its first line.
- **The existing three `SnapKind`s cover all 15, and `SnapMarker.tsx` is unchanged.**
  Follow-up 99 worried that `boardSnapPoints`' rule — count the axes sitting at `mid`, and
  the count names the kind — would not transfer. It transfers; it applies **within the
  rectangle**, counting mids among the two in-plane axes only. The depth axis never
  contributes a mid, because a mid-depth point would sit on the shoulder wall rather than
  on either rectangle, and shoulder-wall points are declined (follow-up 119). A fourth kind
  was rejected because hue encodes *which kind*, position encodes *which feature*, and a
  new off-palette colour would have imported follow-up 60's whole browser-settling
  obligation to say something the marker's location already says.
- **`boardSnapPoints` is now filtered too, and that fixed a defect older than the round.**
  Design §5.1 was written *after* the browser pass, which found the round's own governing
  constraint failing on the oldest code in the feature: a rabbet's flush-end mouth
  positions are also board box-lattice points by construction, so `boardSnapPoints` —
  which never consulted `cuts` — offered markers hanging a quarter-inch out in the air over
  removed stock. True of every rabbet since joinery shipped, and live in production today.
  It is filtered through the same probe, with **one explicit exception**: when
  `boardSolids(board).length === 0` all 26 box points stay, because the ghost box at the
  AABB *is* drawn (invariant 21) while nothing at all draws a consumed board's shoulders.
  The exception is a literal `boardSolids(board).length === 0` check rather than being
  inferred from the filtered set coming back empty — those two conditions are not
  equivalent, and the explicit one is the rule the design states. See follow-up 122.
- **Local→world is the round's one invisible-to-numbers trap.** Cut points are the first
  snap points where posture and rotation actually matter: the box lattice is
  posture-agnostic because `boardExtents` has already folded both in, but a cut is defined
  in part-local `length`/`width`/`thickness`. The mapping is
  `position[axis] + local[axisDimensions(board)[axis]]`, a bare addition only because
  `position` is the min-corner (invariant 2). **Neither existing helper does this and both
  look like they do** — `pointToLocalXYZ` and `solidWorldBox` return coordinates relative
  to the board's *centre*, because `BoardMesh` hangs solids in a `<group>` at
  `boardCenter(board)` — so reaching for either puts every point off by half the board,
  which looks entirely plausible in a screenshot. Two poses with hand-derived world
  coordinates are what pin it; a flat, unrotated board at the origin passes with a
  completely wrong mapping, because every axis is the identity there.
- **`snapPointsFor` is one function called in BOTH of `MoveTool`'s branches, and the
  post-grab one is not optional.** The roadmap text that preceded this round described it
  as extending "the pre-grab branch", and read alone that would have shipped the feature
  half-working: the headline operation grabs a corner **on the shelf** and clicks the dado
  shoulder **on the side panel**, so the cut point is a *target*, on the board that is not
  selected. Pre-grab only and the operation this round exists for does not work; post-grab
  only and a shoulder cannot be grabbed. One exported union rather than two concatenations,
  so the branches cannot drift — follow-up 113's rule applied before it can bite rather
  than after. No new memo and no dependency-list change: `cuts` rides inside `boards`,
  already a dependency, so invariant 15's failure mode is not reachable here.
- **Invariant 24 gained three names and a third *reason*** — see the invariant itself for
  the mechanism. `addCut`/`updateCut`/`removeCut` do not invalidate a captured position;
  they can destroy the *feature underneath it*, which is why their clear is point-precise
  rather than blanket. `sameSnapPoint` moved from `viewport/snapPick.ts` into
  `document/snapPoints.ts` to make that possible, because the store cannot import from
  `viewport`; `snapPick.ts` imports it from `document` instead — one home, not a re-export,
  so there is no second name for it to be found under.
- **Known, deferred, and verified in a real browser** — see
  `docs/browser-verification-cut-snap-points.md` (the main pass, plus a narrower "Re-check
  after the box-lattice fix" section appended to it) and `docs/follow-ups.md`'s "From the
  cut-aware snap points round" section (119-129). The pass found **no defect in this
  round's code** and two findings, both adjudicated with the user: the box-lattice gap was
  **fixed now** and became design §5.1, and the pick ambiguity was **accepted**. That
  second one is the round's honest negative result and is recorded with its numbers rather
  than as an impression: at the default camera (14.08 px/inch) a dado's floor corner and
  its mouth corner project 3.6 px apart, both `corner` so both the same green, and the
  marker is ~9 px wide — so the two discs overlap almost entirely. Aim tolerance is ±1.8 px
  there and ±4.2 px at 43.25 px/inch, with parity against `PICK_RADIUS_PX = 12` needing
  roughly 45-50 px/inch. **No radius can separate two candidates that close** — any radius
  large enough to aim with contains both — so retuning the constant, which design §9.1 had
  proposed as the remedy, is not one. The remedy is zoom, which is what anyone aiming at a
  ¼" feature would do anyway. See follow-up 123.

**What the sheet-nesting round did**, design in
`docs/superpowers/specs/2026-08-02-sloyd-sheet-nesting-design.md`. Chosen 2026-08-01,
closing the cut list's last §7 non-goal — nesting was deferred with a reason (a real 2D
packing problem, not a cheap addition; the cut list declined it outright and the
board-feet round chose square feet over a sheet *count* for the identical reason), and
that reason is now answered rather than expired. For every sheet-goods group, one
purchasing number and its evidence: a sheet count (*3 sheets (96" × 48")*) beside the
square feet already there, and, behind its own toggle, one SVG drawing per sheet
showing where each part sits — guillotine-cuttable by construction, so it is a sheet a
reader can actually take to the panel saw.

- **Three facts, three homes.** Sheet size and rotation policy are facts about the
  *material*, not the project: `MATERIALS.sheet` changed from `boolean` to a
  `SheetStock` object (`{ length, width, rotate: 'grain' | 'free' }`) — plywood is
  `{ 96, 48, 'grain' }` (a part turned 90° would run its face veneer the wrong way),
  MDF is `{ 96, 48, 'free' }` (no grain to protect). `isSheetGood` keeps its exact
  signature; `sheetStockOf` is new. Kerf is a fact about the *shop*, so it lives on the
  document as `stock: { kerf: number }`, default 1/8". A part's orientation is a fact
  about the *part*, and nothing new was stored for it — `Board.grain`, already
  part-local since v3, is what `footprintsOf` reads to decide whether a part lies on
  the sheet turned.
- **Schema 5, and the first migration step in the chain that is not a per-board
  upgrade.** `stock` is document-level, so unlike `foldRotationToV2`,
  `addPostureToV3` and `addCutsToV4` it has no `rawBoards.map` step at all — it is
  read defensively off the raw document and defaulted to `0.125` when absent,
  non-numeric, or outside `[0, 1)` (not clamped to that range's nearest boundary —
  a `kerf: 1.5` becomes `0.125`, not `0.999`), exactly the way `units.precision`
  already was, rather than joining the per-board chain. The version
  bump exists for the gate at the *other* end, not for upgrading old files (an absent
  `stock` simply defaults): without it, a v4 build would open a file with a
  user-set kerf, silently drop the field, and print a different sheet count than the
  build that saved it. See the Architecture section for the worked contrast with the
  four `rawBoards.map` steps before it.
- **`src/document/nesting.ts` — shelf first-fit-decreasing, because guillotine
  cuttability is a domain fact, not a quality tier chosen for simplicity.** Every cut a
  shop makes on a sheet runs edge to edge; a denser maxrects packer routinely produces
  placements — an L-shaped remainder needing a cut that stops mid-sheet — nobody can
  actually cut. `buildNesting` takes `doc.boards`, never `CutListRow`s — the fourth
  instance of the 55/55a representative-row shape (follow-up 82), resolved the way
  board feet resolved it: a row's rounded, representative dimensions can overflow a
  real sheet, so every rectangle carries its own board's exact footprint, and
  `buildCutList` packs each sheet-goods group from that group's boards in the same
  pass that already accumulates its square footage. Stock, not remainder — `cuts` are
  never read, the same rule `stockInchesOf` states for board feet, for the identical
  reason: a part is cut from the sheet at its stock size, and joinery happens
  afterward, out of material already on the bench. A part too big for any sheet is
  recorded in `Nesting.unplaceable` and named on the printed sheet, never dropped —
  follow-ups 48/49's shape, applied here rather than repeated.
- **`src/panels/SheetLayout.tsx` draws one SVG per sheet**, deliberately not an
  extension of `PartDiagram` — a sheet with parts on it and a board with cuts in it are
  different drawings that happen to both be SVG. `fitLabel` (in `diagramLabels.ts`)
  degrades a label through a three-tier fallback ladder — name and dimensions stacked,
  then name alone, then a bare index keyed to a list printed beside the sheet — using
  the same measured `labelWidth`/`LABEL_BOX_H` the diagrams already rely on, because
  every label here lives inside its own disjoint rect and so needs a fallback rather
  than `packRow`'s collision arithmetic.
- **`MATERIALS.sheet`'s new shape is deliberately what a future custom-materials round
  fills in.** Customisable ply count, veneer colour, grain on/off, custom sheet
  sizing are planned but not part of this round; when they land, `MATERIALS` entries
  move from a module constant into document data, and nothing in `nesting.ts` changes
  when that happens — it already reads `sheet.length`/`.width`/`.rotate` off whatever
  entry it's handed.
- **No UI for editing kerf.** The field is migrated, defaulted, validated, undoable and
  used by the packer — but changing it means editing the saved JSON directly. This is
  a deliberate deferral to the custom-materials round's own settings surface, not an
  oversight: a kerf control needs a store action and a toolbar or preferences panel
  that nothing else in this round needs.
- **Known, deferred, and verified in a real browser** — see
  `docs/browser-verification-sheet-nesting.md` for what Task 8's pass checked (sheet
  counts against rendered figure counts, zero label bleeds across ten placed parts,
  the unplaceable line and its exclusion from every sheet's part list, zero overlaps
  and zero out-of-bounds rects, print colours including the exact two-class selector
  that broke in follow-up 81) and `docs/follow-ups.md`'s "From the sheet-nesting
  round" section (85-98) for what it found in review before that pass — including a
  test whose own stated justification didn't reproduce (the sixth instance of that
  lesson, follow-ups 64/68/80) and a guillotine-cuttability test that could not fail
  until its bound stopped being self-derived.

Sheet-nesting closed the cut list's §7 list entirely — see the updated "Deferred behind
it" paragraph below — and snap-move was the successor picked, deliberately in a
different part of the app rather than a sixth cut-list descendant.

**What the guide-points round did**, design in
`docs/superpowers/specs/2026-08-03-sloyd-guide-points-design.md` (amended twice during
execution), browser pass in `docs/browser-verification-guide-points.md`. Chosen
2026-08-03 and executed 2026-08-04. This is the expensive round the two cheap ones were
sequenced ahead of — it had been moved back one place to let cut-aware snap points go
first, because guides are the general-purpose *workaround* for the absence of cut points
and shipping them first would have taught people to reach for the workaround. That
reordering is spent. It is also the first round in the repo to start from a design **and**
a committed plan written a day earlier, which is what made a pre-execution revision pass
possible — see the lesson at the end.

A third tool, modal, beside Select and Move. With **Tape** active (`T`): hovering marks
the nearest snap point exactly as Move does; clicking sets the **anchor**; hovering
elsewhere marks a second point, draws a line between them and shows the distance in an
overlay; and then **clicking** places a persistent **guide point** at the hovered
position, or **typing a length and pressing Enter** places one at
`anchor + normalize(hover − anchor) × typed`. No button is held between the two clicks,
for the reason snap-move chose click-move-click: the camera stays fully usable
mid-measurement.

- **Schema v6, and the bump's argument is NOT v5's — copying v5's wording would have been
  wrong.** `guides: GuidePoint[]` is a document-level field, so it takes `stock`'s
  migration shape and has no `rawBoards.map` step at all; that makes it the **second**
  instance of that shape, which is what turns it into the stated pattern for
  document-level fields rather than an exception. But v5's justification was a *wrong
  purchasing number* — a v4 build would drop a user-set kerf and print a different sheet
  count. Guides produce no number: nothing on the cut list, in the nesting or in the
  board-feet totals reads them, and a build without them prints exactly what a build with
  them prints. The argument here is plainer and weaker, and it is still what the gate is
  for: **silent data loss on round-trip**. A v5 build opens a v6 file, drops every guide
  the user placed, autosaves, and they are gone with nothing indicating it. As with v5 the
  bump is **not** needed to upgrade an old file — an absent `guides` defaults to `[]`
  cleanly regardless of `CURRENT_VERSION`. `validateGuides` drops a malformed guide rather
  than refusing the file (`validateCuts`' rule and its reason), and dropping is the only
  available repair because a guide has no nearest-legal-value to clamp toward.
- **A guide has no name, and that is a schema decision rather than a UI one.** Its
  position is what identifies it. A naming scheme would have dragged in `uniqueName`,
  invariant 8's four-place enforcement and a rename field, for a marker whose only job is
  to be somewhere. Guide ids are deliberately **not** deduplicated — see follow-up 131,
  which inherits 97's exposure rather than closing half of it.
- **`SnapOwner`'s widening is the round's single most dangerous edit, and the answer was a
  TYPE rather than eight checks.** Both union members carry an `id: string`, so every
  existing `owner.id` read keeps typechecking while quietly meaning something else. Eight
  reads in `store.ts` assume `owner.id` names a board, and seven of them are correct only
  because `MoveTool` never offers a guide as a grab source — an invariant enforced two
  modules away, which is exactly the kind of accident the next round breaks and which no
  comment can hold. `BoardSnapPoint` moves that enforcement into tsc. See the new
  invariant 26 for the full rule, and follow-up 135 for what a type does **not** buy.
- **Follow-up 125 was closed by a document, not by code, and the absence is deliberate.**
  125 asked whoever shipped second to merge design §3.1's board-owned candidate filter
  with the selected-board rule into one predicate. There was nothing to merge:
  `MoveTool`'s pre-grab branch is already the selected board's points, board-owned by
  construction, so the filter was **discharged** — writing it would have produced the dead
  code 113 and 125 exist to warn about. Guides join the **post-grab** branch only. A
  reader looking for a merged predicate will find a comment; that is the resolution, not
  an oversight.
- **`tapeAnchor` is invariant 24's second instance and `tapeHover` its third, and the
  third earned it the hard way.** An anchor holds a world position captured at click time,
  exactly as a grab does. A *hover* would normally be too transient to go stale — the next
  pointermove re-picks it — except that `TapeTool` **latches** it while anchored, because
  the only route to typing a distance is off the canvas and into the readout. So it can
  sit unreplaced across an arbitrary number of edits. All three are cleared through one
  generalised helper, `dropHeldIfGone`, and the clearing rules differ per field in ways
  invariant 24 now spells out — including a `grabbed`/`tapeAnchor` asymmetry at
  `updateBoard` that is deferred **with a condition**, because it is a trap in both
  tidying directions (follow-up 134).
- **A fourth `SnapKind` and a fourth off-palette hue (`#4f6fd0`), which reads against
  follow-up 121 rather than contradicting it.** 121 *rejected* a fourth kind for cut
  points because hue encodes which *kind* and position encodes which *feature*, and a dado
  shoulder is a corner — a new colour would have said what the marker's location already
  said. A guide is not a corner, an edge midpoint or a face centre of anything; it is a
  position the user placed. Same rule, opposite answer.
- **A guide draws differently resting than hovered, and that is not decoration.** Every
  other snap point exists only while hovered, so its marker *appearing* is the confirmation
  that it is what you are about to snap to. A guide is drawn whenever guides are shown,
  which takes that signal away. `SnapMarker` gained a `resting` variant (`RESTING_PX`,
  no ring) so a guide under the cursor **grows** into exactly the marker every other kind
  uses. This is the one place the round touches `SnapMarker`'s geometry rather than its
  palette.
- **The Guides checkbox gates candidates, not just pixels.** While guides are hidden they
  offer no snap candidates, in **either** tool — a marker over an invisible point is the
  same defect snap-move avoided by skipping the volume centre. `showGuides` is local view
  state in `App`, prop-drilled: it joins `shortcutsSuspended`, **not** `tool`/`grabbed`.
  Read the three together as one rule applied to three fan-outs.
- **The guides list has no selection model**, deliberately — no `selectedGuideId`, no
  Delete-key path, nothing touching `selectedId`. It exists to remove guides. This also
  sidesteps invariant 21's trap rather than meeting it in a browser: a guide's marker is
  far smaller than a board, so click-the-guide-in-the-viewport is a known-bad hit target,
  recorded before anyone builds it.
- **Known, deferred, and verified in a real browser** — see
  `docs/browser-verification-guide-points.md` (20/20 checks, **no defect** in the round's
  code, neither browser-settled constant retuned) and `docs/follow-ups.md`'s "From the
  guide-points round" section (130-141) for the deferrals and the round's lessons. 141 is
  the one to read: the plan-supplied-code chain took **four** instances in this round plus
  a fifth from a brief-supplied comment, and three fixtures passed for the wrong reason —
  two of them sharing one root cause, that `boardSnapPoints(board)[0]` is the min corner,
  which *is* `board.position`, so a length change never moves it. The most obvious point to
  grab in a fixture is the one point that survives the edit you are testing.

**What the type-anywhere round did** (2026-08-04, no spec — the diagnosis was one
sentence from the user and the remedy followed from it). The guide-points round shipped
the typed path as the tool's whole value and left it effectively undiscoverable: the
distance box sits in the corner of the canvas, appears only after anchoring, is
deliberately not autofocused, and announced itself with the placeholder *distance*. Using
it meant taking the pointer off the target you were measuring to — which is precisely why
that round had to build the hover latch. The verdict was the user's: *"I can't place guide
points anywhere that isn't a snap-point, so I can effectively only duplicate existing
grab-points, which adds nothing."* No schema change (`CURRENT_VERSION` stays 6), no new
tool, no new document state.

- **Typing a digit anywhere routes it into the box and focuses it — SketchUp's VCB.** It
  went into `App`'s **existing** keydown effect rather than a listener of its own, which
  is the standing rule for every window-level shortcut, and here the inheritance buys the
  behaviour rather than merely satisfying the rule: `cutListOpen` above means nothing
  seeds a box hidden behind a sheet, and `isTextEntry` at the top is *why only the first
  character needs capturing at all* — once the input has focus every later keystroke
  matches that guard and returns early, reaching the field directly. `TapeReadout` takes
  focus from an effect keyed on the text rather than being handed a ref by `App`, so
  neither module knows the other exists.
- **`canBeginLength` lives in `units/length.ts`, beside the grammar it is derived from,
  and its set is `{0-9, ., -}`.** Not `/`: `FRACTION_RE` is `^(\d+)\/(\d+)$` and
  `MM_RE`/`FEET_RE`/`MIXED_RE` all require a digit first, so nothing this app parses
  begins with a slash and capturing one would swallow a keystroke *and* seed a value that
  can never parse. Whitespace is the one exclusion the grammar does not justify
  (`parseLength` trims, so `' 4'` parses) and it is rejected anyway, with its own test so
  it does not read as an oversight. The predicate stays *can begin a length* even though
  the write appends — that question is asked afresh on every unfocused keystroke, and
  widening it to *can appear in a length* would hand `/` and `"` to a possibly-empty box.
- **The capture APPENDS, and the first version replacing was a real defect rather than a
  taste call.** A drag past `CLICK_DRAG_SLOP_PX` is an orbit, not a click — the camera is
  left deliberately usable between anchoring and placing, and CLAUDE.md sells that as the
  payoff — but a pointerdown on the canvas **blurs the input while the anchor lives**. So
  the gesture the tool is built around is *type `1`, orbit to see the face, type `2`*, and
  replacing answers `2` while the box read `1` the whole way round. The rule is that the
  displayed text and the next keystroke's effect must not disagree; appending is what
  makes the box behave the same whether or not it has focus.
- **`tapeTyped` is in the store and is deliberately NOT invariant 24's fourth instance.**
  The three fields beside it hold captured world positions and go stale when the boards
  move under them; this holds a string, and `"3 1/2"` means the same thing after an undo,
  a resize or a deleted cut. Giving it clearing rules by analogy would wipe a half-typed
  number on every unrelated edit. Two tests hold both halves — `setTool` clears it (the
  anchor is gone, so there is no ray for the number to be a distance along), and it
  **survives** an edit that clears the anchor it was typed for. Its other clear is owned
  by a panel effect rather than the store, which is the right home and also a coupling —
  see follow-up 143 for why `TapeReadout` must stay unconditionally mounted.
- **The preview is DERIVED every render and never stored**, which is the same rule the
  app already applies to snap points generally. A stored preview position would be a
  fourth held world position needing every clearing rule invariant 24 spells out; derived
  from the anchor, the hover and the text, it evaluates to `null` the instant any of them
  goes and cannot be stale because it is never a fact. It shares `offsetPoint` with the
  commit path, so the marker and the placement agree by construction rather than by two
  pieces of code being written to match. The measuring line runs to the preview when there
  is one — otherwise an overshooting or negative distance leaves the marker floating free
  of the line.
- **`SnapMarker`'s prop narrowed from `SnapPoint` to `{ at, kind }`.** The preview belongs
  to nothing and is in no candidate list, so typing it as a `SnapPoint` would have meant
  inventing an `owner` — and `owner` is read by `pickSnapPoint` and by the store's
  point-precise clearing, so a fabricated one invites handing the preview to logic that
  would be meaningless for it. A narrower prop makes tsc refuse instead.
- **Known, deferred, and verified in a real browser** — the round's own defect (the
  `invalid` marking outliving its cause, an invariant-5-family staleness reached from a
  new direction: the path that writes the text is no longer the path that clears the
  error), the two-digit browser check that is the only one able to distinguish a landed
  focus from a failed one, and follow-ups 142-143. Two tests in this round passed for the
  wrong reason and were found by mutation, not by reading: one asserted `canBeginLength`
  rejects letters while actually pinning that the `M` block sits above the capture, and
  one named the `key.length` guard while every key it listed was rejected by the character
  range anyway.

**What the cardinal guides round did**, design in
`docs/superpowers/specs/2026-08-04-sloyd-cardinal-guides-design.md`, browser pass in
`docs/browser-verification-cardinal-guides.md`. Chosen 2026-08-04 by the user immediately
after confirming both tape rounds work in real use, and executed the same day — the third
round in a row on the tape's surface. A guide could land in exactly two places, and both
borrowed their direction from a feature that already existed: **on** the hovered snap
point, or along the **anchor→hover ray**. So the tool could only ever measure *between
things that already exist*, and in a model made of rectangular parts the direction you want
is usually one no feature points along yet. With an anchor set, `X` / `Y` / `Z` now locks a
world axis and a typed distance places a guide that far along it. Negative distances go the
other way. **No schema change** — `CURRENT_VERSION` stays 6, `validateGuides` is untouched,
and no migration step was added, which is the point rather than a coincidence: nothing about
how a guide was created is stored, and nothing should be.

- **The round's own stated "central question" COLLAPSED under §2, and that is the thing a
  later reader would otherwise re-litigate.** The question was world axes or board-local
  axes, and it was recorded as genuinely open. It is not a balance of arguments:
  `axisDimensions` is by construction always a **permutation** of the world axes — `posture`
  names which dimension is up, `rotation` is only 0 or 90 about Y, so each of
  length/width/thickness lands on exactly one axis and no two share one, and the document
  can express no oblique case at all. Board-local axes therefore reach the *same six
  directions*: they would buy a **label**, not a capability. The guide-anchor asymmetry
  (a guide-owned anchor names no board, so board-local is not reachable from every anchor)
  survives as a second, independent reason, but it was not the deciding one. Written into
  `towardFor`'s doc comment so the argument sits beside the code it justifies. The browser
  pass is what turns it from a reading of the code into an observation: the same three keys
  produce the same three world offsets from a `flat` board and from an `upright` board
  turned 90°.
- **`towardFor` is the round's one real idea, and it exists so the marker and the placement
  cannot disagree.** One exported function, called from **both** `TapeTool`'s preview memo
  and `TapeReadout`'s `commit()`: locked, it returns the anchor plus exactly one inch along
  the axis; unlocked, it returns the hovered point unchanged. Round 2's guarantee was that
  the preview and the placement agree by construction because both call `offsetPoint`, and
  axis mode changes what `toward` **is** — so had each side computed its own direction that
  guarantee would have been half true, arithmetic shared and direction not. The one-inch
  length is deliberate and never zero: the magnitude is normalised away, so any non-zero
  value would do, and it makes `offsetPoint`'s zero-length refusal unreachable in axis mode.
- **The axis WINS over a hover rather than falling back to it**, which is the trap §5.1
  closes. `TapeTool` latches its hover while anchored (invariant 24's third instance exists
  because of that latch), so a hover captured before the lock can sit unreplaced across an
  arbitrary number of events — and a lock that a value the user cannot see can override is
  not a lock. The hovered marker is still **drawn** while locked, because it truthfully says
  *this is what you would snap to if you unlocked*, and suppressing it would make the tool
  look broken. The browser pass produced an accidental proof of the rule: in all six of
  check 1's placements the latched hover was the anchor corner itself, which on the ray path
  is a zero-length direction `offsetPoint` refuses — so every one of them would have failed
  had the hover won.
- **`tapeAxis` is store state and is deliberately NOT invariant 24's fourth instance**, for
  `tapeTyped`'s reason rather than its own. The three fields beside it hold captured **world
  positions**, which is what makes them go stale when the boards move under them; this holds
  an enum, and `'x'` means the same thing after an undo, a resize or a deleted cut. Giving
  it clearing rules by analogy would silently unlock an axis mid-measurement on every
  unrelated edit. Its one rule is **structural** instead — an axis with no anchor names no
  ray, so it lives exactly as long as `tapeAnchor` — and that rule is stated over the
  anchor-clearing set rather than as a list of writers, because a list here is a count that
  goes stale. Read it at `tapeAxis`'s declaration in `store.ts`; do not restate it anywhere
  else, including here.
- **Two keyboard handlers, and the second one is forced rather than redundant.** `X`/`Y`/`Z`
  went into `App`'s **existing** keydown effect beside `M` and `T` — CLAUDE.md's standing
  rule for every window-level shortcut, and here the inheritance buys behaviour: `cutListOpen`
  above means nothing arms an axis behind a sheet. But `isTextEntry` at the top of that same
  effect is exactly why `TapeReadout` needs its **own** branch: once the first digit lands
  the box has focus, and `App`'s listener never sees another key. Escape had already set that
  precedent for the identical reason. Both call one `tapeAxisFromKey`, which lives beside the
  type it produces — the drift shape follow-up 64 recorded, refused before it can start. One
  spelling detail is load-bearing: the modifier test is part of the *condition*, not an early
  `return` like `M`'s and `T`'s, because `Ctrl+Z` is `e.key === 'z'` and a returning guard
  would swallow undo. That branch is also the one thing in the round no jsdom test can prove
  — the question is which handler an event reaches — and the browser pass drove it both ways
  (from no axis, and changing an existing lock), confirming the letter never enters the text.
- **A click while locked RE-ANCHORS and keeps the lock rather than placing a guide.**
  Placing at the clicked point was rejected: a click and Enter would then place guides in two
  different positions while one direction is drawn on screen, which is the disagreement the
  lock exists to prevent. `setTapeAnchor` preserving the axis is the half a "clear it
  everywhere" implementation breaks while passing every other test.
  **What that does NOT buy is a lock outliving a COMMIT** — `commit()` ends with
  `clearTapeAnchor()`, which is the structural rule above doing what it says, so walking a
  row of corners costs one axis press per guide. The design's §5.2 illustrated the bullet
  with a gesture (*click, type, Enter, click, type, Enter*, one axis press) that its own §3.1
  makes false, and the claim had been copied verbatim into three code comments. Found by
  driving it end to end in a browser, not by reading — every individual task's code was
  correct. All three code comments are corrected; the design and the plan are left as the
  record. The third copy sat in `TapeTool.tsx`, on the locked-click branch — the one piece
  of code in the round whose behaviour is unambiguously correct, which is exactly why its
  prose went unchecked, and it was caught only by a review sweeping for the sentence rather
  than for the behaviour. See
  follow-ups 146 and 147, and note that whether the axis *should* survive a commit is a §3.1
  amendment and a human decision, not a bug fix.
- **Follow-up 144 is CLOSED, and the axis is what made it stop being cosmetic.** `error`
  became `'no-direction' | 'unparseable' | 'degenerate' | null` and the one over-wide effect
  split in two: `[text]` clears only `unparseable`, `[hovered, axis]` clears only the two a
  pick or a lock can answer. 144 was filed as not-worth-fixing because its one broken case
  was cosmetic; axis mode turns *there is no target* from a refusal into a legitimate state
  by construction, and pressing `X` after a `no-direction` refusal genuinely cures it — a
  cure a hover cannot express and one bit cannot distinguish. The cause is also **printed**
  now, one short line in the hint's own slot so the box does not change height when a commit
  is refused. Note the names moved from the ones 144 proposed (`no-target` → `no-direction`,
  `zero-length` → `degenerate`), because the question stopped being *is there a target*.
- **Locked with nothing typed draws NO measuring line**, chosen on scope grounds rather than
  as an omission: the honest thing to draw is a semi-infinite axis line, which is follow-up
  130's construction line and is out of this round's scope. §9.1 named a 1" stub as the
  remedy if the browser pass found it read as broken. It reads as **waiting** — the chip
  appears in the same instant, the hint changes to *Along Y — Enter to place*, and one
  keystroke restores both a line and a preview marker — so the stub was **not** applied. The
  sharpest observation in the pass is recorded with it: the line does not merely fail to
  appear, it *disappears*, and a thing vanishing is a weaker confirmation than a thing
  appearing. See follow-up 150.
- **The axis chip is the app's existing active-control idiom, not a fifth off-palette hue.**
  Brass on graphite with a brass-dim border, borrowed from `button[aria-pressed='true']`.
  The reasons `SnapMarker` went off-palette — a ~9 px disc that must read on walnut — do not
  reach a text badge on a dark DOM panel, so nothing here imports follow-up 60's
  browser-settling obligation beyond "is it legible", which the pass answers directly.
- **Known, deferred, and verified in a real browser** — see
  `docs/browser-verification-cardinal-guides.md` (all 8 checks run, **no defect in this
  round's code**, no constant retuned, and the two-posture fixture that is the check the
  cut-points round's local→world trap exists to demand) and `docs/follow-ups.md`'s "From the
  cardinal guides round" section (146-150). 148 is the one to read even if nothing else here
  is touched: `store.ts` holds `gesturing` and `gestureSnapshotTaken` as module-level closure
  variables that `replaceDocument` does not reset, so a component unmounting mid-gesture
  leaks them into every later test in the file and silently breaks undo bookkeeping.
  Reproduced, worked around in-file, and independently confirmed by a reviewer; the real
  remedy is store-level and was not attempted.

**What the empty-solids placeholder did** (2026-08-01, closing follow-ups 48 and 49; no
spec — the diagnosis and the chosen fix were already in the ledger). A board whose own
cuts consumed all of its stock drew *nothing*: no meshes, and no edges either, since
`boardEdges`' rule draws only where filled and empty cells meet. It sat in the parts
list showing its dimensions while being invisible and unclickable, and a reload silently
repaired it (`validateCuts` drops the cut), which made the state read as a rendering
glitch rather than as something the user did. `BoardMesh` now falls back to one
translucent ghost box at the board's AABB whenever `boardSolids` returns `[]`.

- **The ghost is a mesh because "selectable" demands one.** `THREE.Line` raycasting
  only hits within ~1" of a drawn line, so the wireframe the ledger first sketched
  would have made the part legible without making it clickable — half of what 48 asked
  for. The fill is what makes the whole face pickable; the outline (taken from the
  ghost's own box, since `boardEdges` yields nothing here) is what carries its shape.
- **It rides in the existing `geometries` memo**, which is now `{ placeholder, items }`
  rather than a bare array. A separate memo would have needed its own hand-written
  dependency list — invariant 15's exact failure mode — where riding along inherits the
  `boardUVSignature` key and the disposal effect unchanged.
- **No guard was added to dimension writes**, 48's other candidate fix. One state, one
  mechanism: the placeholder covers both routes and any future one, and a dimension
  guard would have to refuse an edit the user is entitled to make.
- **Verified in a browser, both routes, before and after** — the repo's rule for
  viewport work. `GHOST_OPACITY` is a browser-settled constant in the sense of
  follow-up 60, not something a test could fix. No schema change, no new tests: the
  precondition (`boardSolids` returning `[]`) was already pinned in `cuts.test.ts`.

**What the cut list did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-cut-list-design.md`, plan in
`docs/superpowers/plans/2026-08-01-sloyd-cut-list.md`:

- **Stock rows, then setup lines.** `buildCutList(doc)` groups parts by material and
  thickness (*Pine — ¾"*), collapses identical parts into one row carrying a
  quantity and the names it covers, and hangs one bench-readable setup line under each
  part that has joinery — *¾" dado, ⅜" deep — into the thickness face (max side), 6"
  from the length min end, running across the width*. Joinery was deliberately
  built first for this reason: a cut list that does not know about dados reports the
  wrong numbers for every part that has one, so a board's cuts join its row identity
  and two otherwise-identical boards split apart the moment one of them is dadoed.
- **Pure derivation, no new state.** `src/document/cutlist.ts` is a pure function of
  the document and `panels/CutList.tsx` calls it on every render — there is no cached
  copy and therefore nothing that can go stale. No schema change: `CURRENT_VERSION`
  is still 4, because everything the sheet reports was already stored.
- **The layering amendment.** `cutlist.ts` is the first thing in `document` to import
  from `units` — see the Architecture section for why identity has to be spelled by
  the same function that does the printing.
- **Asymmetric tolerance.** Dimensions collapse at display precision, cuts must match
  exactly — see invariant 18.
- **Printable, and print is the point.** The sheet is a full-screen modal that
  `@media print` strips to ink on white: toolbar, viewport and panels are hidden, the
  Print and Close buttons with them.
- **A modal is inert twice over, and the second half is easy to miss.** While the sheet
  is open the rest of the app — everything under `.app-shell` — carries the `inert`
  attribute, which takes the whole subtree out of the tab order, out of hit-testing and
  out of the accessibility tree in one attribute; the sheet takes focus on mount and
  `App` gives it back to the opener on close. That is what stops Tab reaching
  `NameField`, the project-name field and the `DimensionField`s behind the scrim, all of
  which commit on change or blur — the failure mode was *silently editing the document
  while reading a sheet that shows no selection*, not merely an aria gap. But `inert`
  cannot touch a **`window` listener**, which never sees which subtree an event came
  from, so every window-level shortcut needs the open flag passed to it explicitly:
  `App`'s own keydown effect early-returns on it (Delete/Backspace, undo/redo, and —
  since the snap-move round — `Escape` and `M`, which joined that same effect rather
  than adding a listener), and
  `Viewport` takes it as the `shortcutsSuspended` prop for `f`/`Home` — without which
  `f` re-frames the camera invisibly and hands back a moved view. A prop rather than
  store state on purpose: the open flag is local view state, outside the document and
  the undo stack — see the snap-move round for the fan-out where that reasoning
  correctly does *not* reach, and why `tool`/`grabbed` went into the store instead.
  **Any new `window` listener must join this list.**

**What the cut list diagrams did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-cut-list-diagrams-design.md`, plan in
`docs/superpowers/plans/2026-08-01-sloyd-cut-list-diagrams.md`:

- **One view per `(face, across)` pair — SUPERSEDED by the per-face diagrams round,
  below.** `buildDiagrams(board, precision)` grouped a board's cuts by which face they
  were cut into and which dimension they ran across, because within a view the
  horizontal axis was always the implied position axis and every cut was a band
  touching two opposite edges. This fragmented a face carrying perpendicular cuts into
  two figures instead of one — see follow-up 72. The per-face diagrams round re-keys on
  `(face, from)` instead; near/far is now which figure you're looking at, not a dash
  inside one, so read this bullet as history, not current behaviour.
- **A schematic, not a scale drawing.** `diagramScale.ts`'s `fitView` maps board
  inches to drawing units uniformly except at two extremes — a sliver clamp
  (`MAX_ASPECT`) keeps a long thin rail's cross-section wide enough to draw a dado on,
  and a height ceiling (`MAX_HEIGHT`) keeps a square panel from growing off the sheet.
  `band`'s own widening (`MIN_FEATURE`) is centred, not left-anchored, so a narrow cut
  still reads as being where the setup line says it is. All four constants are named
  exports precisely so a browser pass can retune them without touching the geometry —
  see the browser-verification report for the ones this pass exercised.
- **`PartDiagram.tsx` formats nothing.** Every label string arrives ready from
  `buildDiagrams`, the same rule `CutList.tsx` already followed for the row text, so
  display rounding stays in one place. The hatch is an SVG `<pattern>` fill —
  foreground content, not a CSS background — specifically so it survives print with
  Chrome's "Background graphics" turned off; a CSS background would not, and the
  near/far distinction would silently collapse to solid-versus-dashed.
- **A three-state toggle, not a boolean.** `CutList.tsx` defaults to drawing only
  parts that have joinery — a plain board's outline adds nothing prose doesn't already
  say — with "All parts" and "None" as the other two states. Local view state, same
  reasoning as `shortcutsSuspended`: it's outside the document and the undo stack.
- **No schema change.** `CURRENT_VERSION` is still 4; the diagrams are derived from
  `cuts`, which was already stored.
- **The second `document → units` import.** `diagram.ts` imports `formatLength` from
  `units` for the same reason `cutlist.ts` does — a label has to be produced by the
  function that does the printing — which makes that edge a settled boundary rather
  than the one-off exception it read as when `cutlist.ts` opened it.
- **Known, deferred, and verified in a real browser** — see
  `docs/follow-ups.md`'s "From the cut list diagrams" section for which constants
  turned out to need browser judgement rather than a test, and what the browser pass
  actually checked versus what it could not. The depth-label collision on close cuts
  was shipped open on purpose; it is closed by the label layout round below, not by
  this one.

**What the label layout round did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-diagram-label-layout-design.md`. Chosen
2026-08-01, after the cut list diagrams shipped and deployed. The subject was
follow-up **59**, whose diagnosis was one sentence: *every `<text>` in
`PartDiagram.tsx` is positioned by geometry alone, and nothing measures the width of
the string being placed — SVG text has extent, and the code treated it as a point.*
Sharpened: a label overflowed whenever its run was shorter than the label was wide.

- **Measured, not estimated — and arithmetic because the obvious tool doesn't exist
  under test.** The fix needed to know how wide a label is before drawing it. The
  obvious way, `getComputedTextLength()`, returns `0` under jsdom — invisible to
  vitest by construction, which is the exact hole the whole defect class came through
  in the first place. So `diagramLabels.ts`'s `labelWidth` is arithmetic instead:
  character count × `CHAR_W`, where `CHAR_W` rests on `--font-num` (the monospace
  stack already used everywhere else numbers print in this app) advancing at a fixed
  rate per glyph. Measured in a real browser: **≈12.03 units/glyph** at font-size 20
  (two independent probes, 12.042 and 12.029, identical for digits, punctuation and
  mixed strings) — a real monospace face, not an assumption. `CHAR_W = 12.4` bounds
  that from above with **0.358** units/glyph of headroom against the higher of the two
  probes, so the bound errs toward spacing labels slightly too far apart rather than
  too little (see follow-up 66 for what happens on a machine where the headroom isn't
  enough).
- **One-row-per-cut closes cross-cut collisions by construction.** Every number a cut
  owns now lives in that cut's own stacked leader row, `ROW` units apart with no
  arithmetic involved — two different cuts' labels cannot collide regardless of
  string length, because nothing has to compute whether they do. Only the up-to-three
  labels sharing one row (offset, width, depth) can still collide, and those are
  settled by `packRow`, which measures each label via `labelWidth` and runs in two
  phases: labels cascade RIGHT, in board order, during the left-to-right sweep; only
  if the row still overflows `max` afterward does the WHOLE row then shift LEFT as
  one, which is what preserves every gap. See follow-up 71 for a worked case
  (`flush-max`) where that left shift pulls a label past the band it names.
- **Depth moved into the row for a reason deeper than the collision that prompted
  it.** Depth runs perpendicular to this view — it has no position on the page, so
  centring it on its band was never spatially meaningful in the first place. Placing
  it beside the band, in the row, is honest about that; the collision was the symptom
  that surfaced a placement that was wrong on its own terms even before two labels
  ever got close enough to overlap.
- **End ticks fixed a defect the collision fix hadn't touched.** Adjacent leader-row
  runs (the offset run, the band run) were collinear with identical stroke and read as
  one continuous line, so the offset label appeared to measure all the way to the
  cut's far side. A human looking at a rendered diagram found this, not the sweep
  (which only reads `<text>`) or any test. Fixed with a short tick (`TICK`) at each
  run boundary.
- **The honest boundary: the unit tests cover layout logic, not font metrics.** Eight
  geometries are pinned as unit tests and pass because `packRow`'s arithmetic is
  correct given `CHAR_W` — they cannot, and do not claim to, prove that `--font-num`
  actually advances at that rate in any given browser. That claim is browser-measured
  (above) and re-verified by the sweep (`docs/diagram-overlap-sweep.js`), which came
  back **ALL CLEAN: 8 geometries, 0 issues** at a re-derived `TOL = 0.1` (see follow-up
  65). See follow-ups 59, 62, 65-70 for the full record, including the round's own two
  new instances of plan-supplied code being wrong (68) and what "sweep clean" does and
  does not mean (69).

**What the per-face diagrams round did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-per-face-diagrams-design.md`. Chosen
2026-08-01, after the label layout round shipped. The subject was a defect the label
layout round didn't touch: a board with perpendicular cuts on one face — a dado across
the length and another across the width of the same broad face — wasn't having a cut
dropped, it was having the face **fragmented** into two figures, both headed the same
thing, each showing one cut and neither showing where they cross. Verified in a real
browser with a twelve-cut board before any code changed — see follow-up 72.

- **One view per physical face, not per `(face, across)` pair.** `buildDiagrams` now
  keys on `(face, from)`: six possible views, drawn only where that physical face has at
  least one cut. Splitting on `from` (near versus far) rather than `across` means every
  cut made into a given face-and-side appears in the same drawing regardless of which
  in-plane dimension it runs across, so two perpendicular dados on one face draw
  together, crossing, in one figure — see follow-up 72 for the fragmentation this
  replaces and follow-up 73 for what the re-key retires.
- **The depth field: `cuts.ts`'s split-cover skeleton, one dimension down, with the
  cover step assigning a maximum instead of dropping a boolean.** `boardSolids` splits
  the board into cells and drops each one whose centre falls inside any cut — a boolean
  decision. A face's depth field splits the same way in 2D, and each surviving cell
  takes the **maximum** depth among the cuts covering it (0 if none) — emitted as one
  cell per grid rect, with no merge step. Same skeleton, different operation — this is
  deliberately **not** `cuts.ts` reused, and the distinction is load-bearing: reaching
  for `boardSolids` here would not fit, because a depth field needs a number where
  `boardSolids` only ever needed a keep/drop bit. One rule produces the crossing case,
  the parallel-overlap case, and the three-or-more-way overlap case together, the same
  way invariant 16's `boardEdges` rule makes the outer silhouette, the convex corners
  and the concave dado shoulders fall out of one rule.
- **Agreement with `boardSolids` is asserted by a test, not argued as a property.** A
  cell has depth > 0 exactly when the corresponding 3D column has stock removed at that
  face — design §4 states this as the reason the drawing and the 3D model can't
  disagree, and `depthField.agreement.test.ts` turns the claim into a test across a set
  of boards rather than leaving it as prose. See the new invariant below for how that
  test earned its current shape: it originally asserted only which cells were cut
  (coverage), not their depth, and a `Math.max → depths[0]` mutation passed silently
  until the test was corrected to pin depth too.
- **Rotated leader columns for the vertical axis.** A cut positioned along the
  horizontal axis keeps the existing leader rows below the drawing; a cut positioned
  along the vertical axis now gets a leader **column** at the left, its text rotated
  `-90°`. `packRow` is reused verbatim for both — it's axis-agnostic 1-D arithmetic, so
  feeding it y-coordinates works unchanged. This needed one new measured constant
  (`labelHeight`, alongside `CHAR_W`) because a rotated label's extent along the page's
  x-axis is the glyph box's **height**, not its character-count advance — nothing in
  `diagramLabels.ts` modelled that before. See that file's own doc comment on
  `LABEL_ASCENT`/`LABEL_DESCENT` for how it was measured (23.68 units, identical across
  every string tested, because `getBBox()` on `<text>` returns the font's EM box rather
  than the tight ink box) and follow-ups 74-75 for a harness trap and a harness bug this
  measurement work ran into.
- **Two fills, and a legend line only where crossing cuts actually disagree.** A
  crossing region is cross-hatched, and gets one legend line (*overlap: 1/4" deep
  governs*), only when the depth field's cover step assigns a cell a depth that differs
  from at least one of the covering cuts' own depths — which falls out of the depth
  field's own maximum rule rather than needing a separate check. Two crossing cuts at
  the same depth produce uniform-depth cells and correctly show nothing extra: there is
  no distinction to report. `diagram.ts` still de-duplicates by depth before printing a
  legend line, which is what keeps two *separate* crossings at the same governing depth
  to one line, not two — there is no merge step upstream doing that collapsing for it.
  See follow-up 76 for a negative browser finding on how well the two fills read at
  screen size on their own, independent of the legend line.
- **No schema change.** `CURRENT_VERSION` is still 4; the depth field derives entirely
  from `cuts`, which was already stored.
- **Known, deferred, and verified in a real browser** — see `docs/follow-ups.md`'s "From
  the per-face diagrams round" section (72-80) for the fragmentation defect and how it
  was found, the `getBBox()` transform trap and the harness bug in its own fix, the
  negative hatch-legibility finding, the measured sheet-length numbers, a benign
  float-dedup gap next to invariant 18, and the round's own (fifth) instance of a
  plan-supplied constant shipping with a justification that didn't reproduce.

**What the board-feet round did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-board-feet-design.md`. Chosen 2026-08-01,
closing the first half of the cut list's §7 non-goal — board-feet and sheet totals had
been deferred with a reason, not omitted, and that reason (*"a purchasing number, not a
bench number, and this release is about the bench"*) had expired once the bench release
shipped. Adds one purchasing number beside the bench numbers already on the sheet: board
feet per row and per group for solid stock, square feet for sheet goods (keyed off the
existing `isSheetGood`), with no document-wide grand total — pine and walnut board feet
sum to a real number but not a useful one, and board feet cannot be added to square feet
at all.

- **Stock, not remainder.** The volume comes from a board's stock dimensions;
  `cuts` are ignored entirely. A dado does not reduce the board you buy — the stock
  leaves the yard whole and the joinery happens afterward, out of material already paid
  for. This is the inverse of what every other consumer of `cuts` does (`boardSolids`
  removes stock, `buildDepthField` reports how much, `buildDiagrams` draws it), which is
  exactly why the rule is stated as a comment in `cutlist.ts`, not left to be inferred
  from the pattern everything else follows.
- **Exact, not representative — the third instance of the 55/55a shape, resolved the
  *other* way.** A cut-list row is representative: two boards belong on one row when
  they *print* identically, not when they are equal (follow-up 55, invariant 18). For a
  printed dimension that's invisible by construction, but board feet is a sum, so the
  error would multiply by `qty` and then accumulate again across the group. The
  accumulator sums each board's *exact* volume as the existing grouping loop visits it —
  no second pass, and a row and its group subtotal come from the same numbers in the
  same pass, so they cannot disagree. The visible consequence is stated rather than
  hidden: a row's board feet may not exactly equal `qty ×` the dimensions printed beside
  it, because the printed dimensions are rounded and the total is not. Rounding the
  total to match was considered and rejected — it would make the sheet self-consistent
  by making the purchasing number wrong, which is the wrong direction for a number whose
  whole job is telling you how much lumber to buy.
- **A new leaf, not a widened one.** `src/units/quantity.ts` exports
  `formatBoardFeet`/`formatSquareFeet`, fixed at two decimal places and not
  user-configurable — the document's `units.precision` is a fractional-inch denominator,
  meaningless applied to a decimal volume. `cutlist.ts` already imported from `units`
  (for `formatLength`), so this widens an existing layer edge rather than opening a new
  one; see the Architecture section.
- **The panel formats nothing**, the same rule the row text and the diagram labels
  already follow — `row.stock`/`group.stock` arrive ready to print from `buildCutList`.
- **A print-block gap that survived one task review and one implementer self-review,
  caught only by rendering the fix.** Follow-up 58's exact defect shape recurred:
  `.cutlist-subtotal .cutlist-stock`'s two-class screen rule (brass) outranked the print
  block's enumerated single-class `.cutlist-stock` override, so the group subtotal —
  the number most likely to be read at the bench — kept printing brass on white while
  every row total printed correctly black. The enumeration itself was done correctly;
  it just wasn't the most specific rule in the cascade. Fixed by adding a matching
  two-class override, verified both by `getComputedStyle` (`rgb(0, 0, 0)`) and by eye on
  a rendered screenshot. See follow-up 81 for why this is a new wrinkle on 58, not a
  restatement of it.
- **No schema change.** `CURRENT_VERSION` is still 4; board feet derives entirely from
  dimensions already stored.
- **Known, deferred, and verified in a real browser** — see `docs/follow-ups.md`'s
  "From the board-feet round" section for the print-block finding above, what
  `formatBoardFeet` deliberately does not do (no rounding up, no waste factor, no
  user-configurable precision), and confirmation this pass used media emulation, not a
  real PDF render (follow-ups 70 and 79 still apply — this host's Playwright exposes no
  `pdf()`).

**Deferred behind it**, from the cut list's §7, recorded as decisions rather than
omissions: board-feet and sheet totals are no longer deferred — see the board-feet round
above — and sheet-goods nesting is no longer deferred either — see the sheet-nesting
round above. That closes the cut list's §7 list entirely, leaving only the two items
looked at and declined on purpose: CSV/clipboard export and name run-collapsing
(`Leg 1..4`), for reasons worth reading before proposing either again. In the older
ledger, **48 and 49** were the only two entries with a user-visible consequence —
unaffected by the cut list or the diagrams, and closed separately by the empty-solids
placeholder.

**What joinery did**, design in
`docs/superpowers/specs/2026-07-31-sloyd-joinery-design.md`, plan in
`docs/superpowers/plans/2026-07-31-sloyd-joinery.md`:

- **One primitive.** A `Cut` is a rectangular removal that runs fully across one of
  the board's dimensions. A dado is that cut in the middle of a face; a rabbet is the
  same cut at an edge — so the difference is *derived* (`cutLabel`), never stored.
  Fields are part-local (`face`, `from`, `across`, `offset`, `width`, `depth`), named
  in length/width/thickness, so a cut survives posture and rotation the way `grain`
  does. `face` and `across` name two dimensions; the third — the **position axis**
  that `offset` and `width` are measured along — is implied via `positionAxisOf`,
  never stored, so a cut cannot name the same dimension twice.
- **Schema 4.** `addCutsToV4` defaults `cuts` to `[]` on raw data before
  `validateBoard`, extending the chain to 1→2→3→4.
- **Sub-box decomposition, not CSG.** `src/document/cuts.ts` splits the board at
  every cut boundary into a grid of cells, drops each cell whose centre is inside any
  cut, and merges the survivors. Splitting first is what makes the centre test sound;
  dropping against the **union** is the whole of overlap handling, so two overlapping
  dados remove the overlapped stock once with no pairwise intersection case. CSG was
  rejected for a concrete reason: `boardUVs` returns a `Float32Array(48)` keyed to
  `BoxGeometry`'s 24 vertices, so arbitrary triangle counts would have invalidated
  invariants 12, 14 and 15 together. A board with no cuts still yields exactly one
  solid matching `boardExtents`, which is what makes joinery free for boards that
  don't use it.
- **Edges come from the grid**, not from the solids — see invariant 16.
- **UVs stay parent-relative**, so the figure runs continuously across a dado rather
  than restarting at it — see invariant 17.
- **Clamp on load, refuse in the panel.** `validateCuts` clamps a cut back inside a
  board that was later shrunk (a saved document must always open), dropping only what
  has no nearest legal value. The panel refuses out-of-range entry outright, because
  silently correcting a number the user just typed loses a measurement.

**What v2 did:** collapsed the four-value rotation select to a two-state **Grain**
select ("Along X" / "Along Z") — a rectangular box has 2-fold symmetry about the
vertical axis, so 0°/180° and 90°/270° were always literally indistinguishable — and
fixed the reorient-pivot bug (`boardExtents` swapped extents with the min-corner
pinned, so a 24×5½ board jumped sideways when it turned; `reorientedPosition` fixes
that by preserving the footprint's X/Z centre and the Y-min). `CURRENT_VERSION` went
to 2, with a migration folding 180→0 and 270→90. Plus wood grain textures: face, edge
and end grain distinguished per face, with plywood showing veneer on its faces and
visible plies on its edges.

**What v3 actually did**, design in
`docs/superpowers/specs/2026-07-31-sloyd-v3-design.md`, plan in
`docs/superpowers/plans/2026-07-31-sloyd-v3.md`:

- **Posture.** `standing` (boolean) became `posture`
  (`'flat' | 'on-edge' | 'upright'`), naming which dimension points up. One rule
  generates all six orientations — at 0° the earlier of `[length, width, thickness]`
  goes on X, at 90° they swap — and it reproduces all four of v2's rows exactly (that
  agreement is pinned by explicit tests). The two orientations it adds are the
  upright ones: a leg, a post or a stile could not be modelled before.
  `axisDimensions` — the single source for this mapping — moved into
  `src/document/geometry.ts`, with `boardExtents` now a direct expression of it in
  the same file. The viewport's separate copy is gone.
- **Part-local grain.** `grain` is its own field
  (`'length' | 'width' | 'thickness'`), independent of posture. The face whose
  normal runs along the grain shows end grain; face grain goes to the first of
  `[thickness, width, length]` that is not the grain; edge grain to the one left.
  Grain along length reduces to the old fixed map exactly. Grain changes which faces
  show which cut — it never moves a board, and is deliberately absent from the
  store's reorient predicate.
- **Schema 3.** The v2→v3 step maps `standing` to `posture` and defaults `grain`,
  running on raw board data before `validateBoard` — see invariant 11. Migration is
  now a real chain: a v1 file walks 1→2→3, folding 270→90 before it gains a posture.
- **Log-derived grain textures.** Wood is now three cuts through one log: face far
  from the pith (cathedral arches), edge through it (quartersawn lines), end the
  cross-section. The ring maths lives in `src/viewport/grainLog.ts`, pure and
  unit-tested, with `seededRandom`/`hash` moved there from `grainTexture.ts` — this
  closes follow-up 32. See invariant 14 for why `bandRadius` is `hypot(d, k·delta)`.
- **`boardUVSignature`**, added after the browser gate caught a real bug:
  `BoardMesh`'s geometry memo was keyed on a hand-written field list that did not
  include `grain`, so grain changes never reached the screen while the document was
  correct. See invariant 15.

**Post-v3 fixes**, found in use rather than in review: `DimensionField` and `NameField`
both share a display-staleness defect shape, closed in the same session — see
invariant 5 for the full mechanism, and follow-ups 36 and 45 for what each field's
specific consequence was. Separately, `fe4deed` (in the v3 branch above) fixed a real
bug by having sheet goods ignore `grain` entirely in the tiling rank, which also
silently removed the veneer rotation on plywood's face — the rule now promotes grain
among the two non-thickness dimensions for sheet goods, so the ply stack still spans
the true thickness *and* the veneer still turns; see follow-up 46 for the traced case.


---

## Follow-ups recap, as it stood on 2026-08-14

The authoritative list is `docs/follow-ups.md`. This is the prose recap that used
to live in CLAUDE.md's `## Open follow-ups` section.

`docs/follow-ups.md` lists everything found during v1 review, the two polish passes,
v2, v3, the post-v3 fixes, joinery, the cut list and its diagrams rounds, the
board-feet round, the sheet-nesting round, the snap-move round, the selected-board grabs
round, the cut-aware snap points round, the guide-points round, the type-anywhere round
the cardinal guides round and the project library round, consciously deferred
rather than missed, numbered 1-30 plus the per-release additions. Read it before starting new work
in the same area — several items are "correct but untested", which is exactly what a
refactor breaks silently.

**29 and 30 are closed** — the gizmo now has a size ceiling tied to the selected board
(with a floor that keeps it grabbable when zoomed far out), and the origin lines have
their own toolbar checkbox. **5 is closed** — the version gate now rejects versions
below 1 and non-integer versions. **32 is closed** — `hash` and `seededRandom` moved
to `src/viewport/grainLog.ts` and are unit-tested there. **36, 45 (the `NameField`
stale-write), and 46 (the plywood-grain regression) are closed** — see invariant 5
(display staleness, both fields), invariant 9 (`NameField`'s additional stale-write
mode), and the "Post-v3 fixes" paragraph above (plywood grain). All closures are
written up in place. **47 is open**: the toolbar's project-name field was checked
against the same display-staleness shape and does **not** have it — see
`docs/follow-ups.md` for why.

Joinery added **48-53**. **48 and 49 are now CLOSED**, together, by the single fix 48
itself predicted would cover both: a placeholder render whenever `boardSolids` is empty.
Both routes into the state are still reachable and still worth knowing before touching
the panel — 48's is a *Dimensions* write, which goes through `updateBoard` and never
meets the Cuts section's guard, so shrinking a board can leave a cut that removes all of
it; 49's is two individually-legal cuts that jointly do the same. What changed is the
consequence: the part now draws as a ghost, stays selectable, and can be recovered by
removing the offending cut, instead of vanishing until a reload silently repaired it.
**50-53 remain open**, all hygiene. See `docs/follow-ups.md` for the closure write-up,
including why a wireframe would have closed only half of 48 and why no guard was added
to dimension writes.

The joinery section also ends with a lesson rather than a defect, worth reading before
executing another plan: **seven of joinery's defects were in code the plan supplied
verbatim.** They were caught because implementers were told to fix the code rather than
the expectation, and to stop and escalate when they believed an expectation was itself
wrong — which happened once, correctly, and changed the plan.

The cut list added **54-58**. **56 and 58 are closed** by the branch's final review pass
— the modal is now contained (`inert` shell, focus on mount, focus restored on close)
and the print block no longer leaves `body` or `.cutlist-empty` dark; 54 and 55 were
also *corrected* rather than closed, 54 having overstated its risk and 55 having gained
55a, the one place the representative rule reaches a printed word. **48 and
49 were unaffected by it** (they were closed separately, in the viewport): the cut list
reports *stock* dimensions, and a board whose cuts happen to remove all of it still has
the stock it was cut from, so it appeared on the sheet correctly even back when it
rendered as nothing in the viewport.

The cut list diagrams added **59-64**. **59 is now closed** by the label layout round
below — depth labels no longer collide, because every number a cut owns lives in that
cut's own stacked leader row (cross-cut collisions close by construction) and the
up-to-three labels sharing a row are settled by `packRow` (collisions within a row
close by arithmetic on a measured monospace advance). **60** records
`MAX_ASPECT`/`MAX_HEIGHT`/`MIN_WIDTH` as browser-settled rather than test-settled — the
label layout round re-checked all three extremes with the new layout in place and
changed no constant. **61** confirms the §2 non-goal (one view per `(face, across)`
pair, cuts that name the same dimension twice) survived verification — the panel's own
`setFace` already prevents the degenerate case, so `diagram.ts`'s guard is
belt-and-suspenders, not load-bearing, in the UI path. **62 is now closed** — an
ordering guard on `band()`'s `Span` argument, added opportunistically while that
function was already open for another fix. **63** is latent-not-live still:
`DiagramCut.v`/`.kind`/`DiagramFit.sy` are unused by `PartDiagram` today. **64** is a
lesson, not a defect — Task 4's plan-supplied spacing constants overlapped a label with
the outline before review caught it, the same failure shape as joinery's "seven defects
in code the plan supplied verbatim," now with a second instance from a different
feature.

The label layout round closed **59 and 62**, amended **60, 63 and 65**, and added
**66-70** — see `docs/follow-ups.md`'s "From the label layout round" section. **68** is
a second lesson entry worth reading beside 64: this round produced a *third and
fourth* instance of plan-supplied code being wrong, both shaped the same way — a guard
written for one direction, and a test written to the guard rather than to the
requirement. **69** records what the sweep's green does and does not mean: it collects
only `<text>`, so a defect made of two fused `<line>`s (found by a human, not any
guard or test) was invisible to it. **70** records what was *not* verified — an actual
print-to-PDF render, which the Playwright MCP on this host cannot produce.

The per-face diagrams round **supersedes follow-up 61** (the `(face, across)` key's
non-goal no longer applies, because a face can no longer produce two figures at all —
see follow-up 72) and added **72-80** — see `docs/follow-ups.md`'s "From the per-face
diagrams round" section. **72** is the fragmentation defect itself, found by driving a
real browser with a twelve-cut board rather than by reading code. **73** records what
the re-key retired (`hasFar`, `DiagramCut.side`, the far-side dash) and why that isn't
a regression. **74** and **75** are harness entries: `getBBox()` ignoring an element's
own transform, and the harness's own first fix for that being written backwards
(`elCTM.multiply(svgInv)` instead of `svgInv.multiply(elCTM)`) — an identity for
unrotated text, so it produced false failures on rotated labels only, caught by
sanity-checking an absurd coordinate rather than by a failing assertion. **76** is a
negative browser finding: hatch versus cross-hatch alone isn't reliably
distinguishable at screen size — the legend line carries the distinction. **77**
confirms design §10's view-count risk as real but mild with measured sheet-length
numbers. **78** is a benign float-dedup gap in `boundaries()`, recorded next to
invariant 18's reasoning. **79** carries forward the still-unverified print-to-PDF
render. **80** is a fifth instance of the plan-supplied-constant lesson (64, 68): a
task report's justification for a replacement layout constant didn't reproduce under
review, closed by adding a real guard rather than trusting the arithmetic on its own.

The board-feet round added **81-84** — see `docs/follow-ups.md`'s "From the board-feet
round" section. **81** is a new wrinkle on follow-up 58, not a restatement: the print
block's `.cutlist-stock` was correctly enumerated into the `@media print` black-text
list, but a more specific two-class screen rule (`.cutlist-subtotal .cutlist-stock`,
brass) still outranked it, so the group subtotal printed brass on white through one task
review and one implementer self-review — caught only when task 4's browser pass actually
rendered the page, and closed by adding a matching two-class print override (`a54a086`).
**82** is the third instance of the 55/55a representative-row shape, resolved the
*other* way on purpose: board feet accumulates each board's exact volume rather than
`qty ×` the row's representative dimensions, so a row's total may not exactly equal what
a reader would compute from the rounded dimensions printed beside it — correct, because
rounding the total would make the purchasing number wrong. **83** records what
`formatBoardFeet`/`formatSquareFeet` deliberately don't do: no rounding up, no waste
factor, no user-configurable precision. **84** carries forward the still-unverified
print-to-PDF render (70, 79) — this round's browser pass used `emulateMedia`, not a real
PDF.

The sheet-nesting round added **85-98** — see `docs/follow-ups.md`'s "From the
sheet-nesting round" section. **85** records shelf FFD's density cost against a
maxrects packer as the design's deliberate choice, not a shortfall — guillotine
cuttability is a domain fact, not a quality tier. **86** carries follow-up 83's rule
forward from board feet to sheets: no offcut tracking, no waste factor, no rounding
up, plus this round's own non-goals (no solid-stock nesting, no hand-rearranging, no
mixed sheet sizes per material). **87** and **88** are the sixth and (a second,
related) instance of the plan-supplied-justification lesson (64, 68, 80) — an epsilon
test whose fixture never touched `EPS` at all, and a guillotine-cuttability test that
could not fail because its bound was derived from the parts it was checking; see
invariants 22 and 23 above for the mechanism of each. **89** is a pure-derivation
lesson: a first review-fix pass added a `throw` to `buildNesting`, which is called on
every cut-list render with no error boundary, and the actual fix collapsed two
predicates into one path instead. **90** is the round's own instance of the
cut-list-must-agree-with-itself defect the diagrams and board-feet rounds already hit
in different shapes — a placed part's dims printed as an unformatted, possibly
transposed float — closed by moving formatting into `nesting.ts`. **91** upgrades a
label-centring finding filed MINOR to load-bearing: the old baseline placed ink 3
units past the box `fitLabel` had just measured it against. **92** records two
deferred minors: a formatted-dims expression duplicated verbatim in two places in
`nesting.ts` with nothing pinning agreement, and no rendered sheet ever says "turned"
in words, so a near-square part's rotation is ambiguous on the page. **93** and **94**
are the Task 8 browser pass: no defect found, the exact `.cutlist-subtotal
.cutlist-stock` selector that broke in follow-up 81 re-checked and held, and the
still-open gaps (print-to-PDF, carrying 70/79/84; a 3+-shelf sheet's rendering, not
just its packing, unexercised). **95-98** came *after* that list was first written —
they are the final-review and post-merge additions (`316204d`, `7594473`), which is why
the snap-move round starts at 99 rather than at the 95 its own brief expected: an
unplaceable part counted in square feet but not in sheets, `fitLabel`'s terminal
`index` tier having no height check, board `id` uniqueness being newly load-bearing
(via `buildNesting`'s sort tiebreak and `SheetLayout`'s React key) but never enforced
the way `dedupeNames` enforces names, and the missing kerf-editing UI with its
asymmetric default — the `0.125` default under-counts for a wider kerf, which is the
direction that costs a trip back to the yard.

The snap-move round added **99-108** — see `docs/follow-ups.md`'s "From the snap-move
round" section. **99-105** are the design's §8 non-goals, recorded as decisions rather
than omissions and worth reading before re-proposing any of them: cut shoulders as snap
points (deferred at the user's direction, and cheap when it lands because it is a second
*provider*, not a change to `pickSnapPoint`), no free movement, no axis inference or
locking (downstream of the free-movement deferral, not an independent gap), no ghost
preview (rejected with the user — with snap-targets-only the result is fully determined
by the marker already on screen), single-board moves only (a selection-model change, not
a tool change), occluded candidates being pickable **on purpose**, and the tape measure,
guide points and guide lines the user named as the intended successors. **106** is a
harness entry in the shape of 74/75: every interaction Task 9 drove was a synthetic
`PointerEvent` at a screenshot-located pixel, because board corners have no DOM presence
— so real pointer-capture, touch and OS input timing were never exercised, and the one
artifact that produced (a confused `OrbitControls` drag state after
`releasePointerCapture` threw) was root-caused to the harness and worked around, not
absorbed into a finding. **107** and **108** are the round's own two lessons: the
**seventh** instance of the plan-supplied-code chain (64, 68 twice, 80, 87, 88) — a Task
3 test whose *fixture* left two boards at one default position, so the delta was
legitimately zero and `commitSnapMove` correctly took its no-op path, found by an
implementer who stopped and escalated rather than editing the assertion to match — and a
verification report that stated marker coverage more broadly than it had checked, closed
by taking the four missing screenshots rather than by narrowing the prose, because
narrowing would have been cheaper and worse.

The selected-board grabs round added **109-118**. **109-113** are the design's §9
non-goals and its §5 composition note, recorded as decisions: no click-to-select in Move
mode, no restriction on the target set, no multi-board moves, no gizmo or gate change,
and — the one that will matter soonest — the guide-points design's §3.1 board-owned
filter is *subsumed* by this round's selected-board rule, so whichever ships second must
merge the two into one expression rather than stacking them. **114** records that the
browser pass found no defect, stated plainly so the section is not read as having
findings it did not have. **115** half-closes follow-up 106: real `page.mouse` input and
a projector taken from the app's own `project()` replaced synthetic `PointerEvent`s and a
failed re-derivation; touch and pen remain unexercised. **116** is a verification-design
note — a marker's colour encodes snap *kind*, not owner, so the fixture was built with a
shared point that is a corner of one board and an edge midpoint of the other, which is
what let a screenshot say anything about ownership at all. **117** records the toolbar
hint's missing unit test as a decision — `panels/` *is* RTL-tested here, so the reason is
that the hint's real claim (nothing is markable or grabbable) cannot be made in jsdom at
all, not that panels are exempt. **118** is the newest link in the
plan-supplied-justification chain (64, 68 twice, 80, 87, 88, 107) and the first sourced
from a **reviewer** rather than a plan: a requested test whose premise — that a mutation
of `edit()`'s grab-clearing condition survives the suite — did not reproduce, both halves
of that condition already being pinned by a different existing test each. Closed by
running the two mutations and recording the output, not by adding a duplicate test.

The cut-aware snap points round **closed 99** and added **119-129** — 129 landed after
that round's own final review, which is why the guide-points round starts at 130 rather
than at the 129 its plan expected. **119-121** are the
design's §9 non-goals as decisions: no points on the shoulder walls (declined on clutter
grounds, *not* by the governing constraint — a wall is real drawn material, which makes
this the one exclusion that needed a different argument), no de-duplication against the
box lattice, and no fourth `SnapKind`. **120** carries the subtlety in the second of
those: two coincident candidates produce the identical delta, so the move is unaffected,
but they can differ in *kind* and therefore in marker hue, which means the colour is
decided by `pickSnapPoint`'s depth tie-break — and if that ever reads as flicker the fix
is a deterministic ordering rule, not a de-duplication step. **122** is the round's most
interesting entry: a browser pass found the round's own governing constraint failing on
the oldest code in the feature, and it was fixed in-branch (`999ca29`) rather than filed.
**123** is the accepted pick-radius finding with its measured numbers — 3.6 px separation
at the default camera, ±1.8 px aim tolerance, ±4.2 px at 43.25 px/inch, parity with
`PICK_RADIUS_PX = 12` at roughly 45-50 px/inch — and the reason no radius can fix it.
**124** collects what neither browser pass checked, from both reports. **125** is
follow-up 113 with a third contributor to the same branch — **closed by the guide-points
round, and by a document rather than by code; see 132**. **126** is the newest link in the
plan-supplied-justification chain (64, 68 twice, 80, 87, 88, 107, 118) and the first
sourced from a test *title*: "(fast path, no grid built)" pins neither half of itself.
**127** and **128** are deferred minors — two grab-clearing cases the store tests do not
reach, and three hygiene items including two type assertions resting on facts the
assertion cannot enforce. **129** is a post-round entry from that branch's final review:
three documents illustrated `dropGrabIfGone`'s rule with a claim a later task in the same
round had made false, visible only from outside both tasks.

The guide-points round **closed 105** (for two of the three things it named — guide lines
were dropped, with a reason) **and 125** (by a document rather than by code: there was no
filter to merge, so none was written) and added **130-141**. **130** and **131** are the
design's §9 non-goals and the guide-id exposure, both decisions rather than omissions —
semi-infinite construction lines are the one item there still genuinely open. **132**
records 125's discharge in the form a future reader needs, since an absent filter is
indistinguishable from a forgotten one. **133** is follow-up 120 gaining a *reachable*
instance at zero separation (a guide on a board corner), found stable 6/6 and 8/8 with the
mechanism confirmed in code — concat order plus first-found-at-equal-depth — and scoped to
one `boards` ordering. **134** is the `grabbed`/`tapeAnchor` asymmetry at `updateBoard`,
deferred with a condition and written into invariant 24 because it is a tidying trap in
both directions. **135** is what `BoardSnapPoint` bought and what it does not cover.
**136** records that neither browser-settled constant was retuned and what evidence
settled each. **137** and **138** are Task 10's three self-flagged concerns and its named
gaps. **139** is two store tests that cannot fail, honest rather than false — do not
"strengthen" them with an ESM spy. **140** is a **pre-existing** ~1-in-4 test flake, newly
diagnosed with evidence: `depthField.agreement.test.ts`'s heaviest case times out at
5000 ms, reproduces identically on master, and this branch touches none of that code;
remedy is a per-file `testTimeout` or splitting the case. **141** is the round's biggest
lesson and the largest single-round addition the plan-supplied-code chain has taken.

The type-anywhere round added **142-144**, all three about the same small surface. **142**
narrows the round's legibility deferral rather than adding to it: a guide hovered as the
tape's *target* draws the same size and hue as the typed preview beside it, and the
browser pass hovered a board corner, which is the case that cannot show it. **143** is a
coupling rather than a defect — `tapeTyped`'s anchor-loss clear is owned by a
`TapeReadout` effect, which is the right home and which rests on that component being
**unconditionally mounted**; the append fix in the same round is what turned the
consequence of breaking it from a cosmetic flicker into a silently wrong placement, so do
not "tidy" the mount behind `tool === 'tape'`. **144** is a knowingly-made trade: widening
the error-clearing effect to `[text, hovered]` cures two of `commit()`'s three refusal
causes and clears the third without curing it, because a boolean cannot express the
distinction at all — its named remedy is to make `error` carry its cause. **144 is now
CLOSED** by the cardinal guides round, with the cause names shifted from the ones it
proposed (`no-target` -> `no-direction`, `zero-length` -> `degenerate`) because the
question stopped being *is there a target*; the original entry is kept unedited beneath
its closure note, because what it records about the limits of one bit is what produced
the union.

**145 is SHIPPED** — cardinal-direction guide placement, named by the user on 2026-08-04
and executed the same day; the entry now carries an answer to each of the open questions
it recorded, including that its own "central question" collapsed rather than being decided.
It **narrows and does not close** 130's semi-infinite construction lines bullet, which
remains the one genuinely open item there — and the browser pass is what makes that
narrowing evidence rather than assertion: typed offsets are enough as a *mechanism*, and
what is still wanted is the line as a *visual*.

The cardinal guides round added **146-150**. **146** is the round's one finding and it is
against a claim rather than against code: design §5.2 illustrated its own mechanism with a
gesture (*click, type, Enter, click, type, Enter*, one axis press) that its own §3.1 makes
false, because `commit()` ends with `clearTapeAnchor()` — found by driving the sentence end
to end in a browser, since every individual task's code was correct, and it is follow-up
129's shape recurring with the claim present in the design *before* any code existed. The
three code comments that had copied it are corrected; the design and plan text are left as
the record.
**147** is the behaviour question 146 leaves open — should the axis outlive a commit? — a
§3.1 amendment and a human decision, with the trade and a cheap middle option written out
so it is not re-derived. **The user was asked and ruled SHIP AS-IS**, so it is open by
decision rather than by default: the single-sentence rule (the axis lives exactly as long
as the anchor) is worth one keystroke per guide, and it is worth revisiting only with real
use behind it — which now exists, the round being live and confirmed working. **148** is the most portable entry here and has nothing to do with
this round's feature: `store.ts` holds `gesturing` and `gestureSnapshotTaken` as
module-level closure variables that `replaceDocument` does not reset, so a component
unmounting mid-gesture leaks them into every later test in the file and silently breaks
undo bookkeeping; reproduced, worked around in-file with a `.blur()`, and independently
confirmed by a reviewer, with the real store-level remedy named and not attempted.
**149** records §8's non-goals as decisions. **150** carries the browser pass: no defect in
this round's code, no constant retuned, the disappearing-line observation recorded with the
framing §9.1's stub would rest on, `no-direction` found unreachable live and why, the named
coverage gaps, and two harness traps (autosave lagging the store by ~200 ms, and a DOM read
racing a React effect).

**The tape line of work is complete for now, and the project library was its successor.**
Three tape rounds landed on that surface in one day and all three are live; the user's original
critique of the first — *"I can effectively only duplicate existing grab-points, which adds
nothing"* — is fully answered, since a guide can now go 3" straight up from a corner with
nothing in that direction. The roadmap paragraph that used to sit in the status section was
that round; the project library (08-14) replaced it, and `docs/follow-ups.md`'s open
entries — 130's semi-infinite construction lines and 147 among them — are where the next
conversation should start.

**From the project library round: 151-156.** Full narrative in the round's own section
above and in `docs/browser-verification-project-library.md`. **151** and **152** are the two
cosmetic findings the browser pass recorded rather than fixed — the row's controls reveal
independently on keyboard focus, so a keyboard user never sees that a second one follows,
and Escape leaves focus on `<body>` rather than returning it to the caret. **153** and
**154** are what the pass could not reach: a genuinely quota-full `localStorage` (only the
unrecognised-layout route to `available === false` was driven live), and two tabs sharing one
origin — a materially new situation this round creates, since each tab now holds its own
`activeId` and its own autosave timer and nothing listens for the `storage` event. **155** is
the round's most portable entry and the one to read before executing any plan: **six**
plan-supplied tests were shown by mutation to be incapable of failing, enumerated one by one,
with the pattern named — a test whose subject is an ordering, a refusal, or a "cannot exceed"
property must be mutated before it is believed. **156** records the App fake's remaining
`activeId` divergence, left knowingly because the contract is pinned at the adapter layer
instead, which is the layer the bug lived in.

One entry is a lesson rather than a defect and is worth reading before touching anything
in the viewport: **26a**. Browser verification on this host runs on software GL
(llvmpipe, no GPU), which returns 1.0 for `pow(0.0, 0.0)` where real hardware returns
NaN. That difference hid a grid bug completely — it looked correct in every screenshot
and shipped as a camera-following disc. Anything resting on undefined or
precision-sensitive shader behaviour needs a human looking at real hardware.

Host-level open items (proxy auth, Cloudflare, monitoring) are in
`DEPLOYMENT.local.md`, not in the public repo.


---

## Removed from CLAUDE.md, 2026-10-07

> CLAUDE.md was condensed from 190KB on 2026-10-07. The sections below are the text it
> carried before that, verbatim: Status (with the rounds table and the deployment rule),
> the annotated module tree, the full Invariants and the Open follow-ups digest. CLAUDE.md
> keeps the rules in condensed form and wins where the two disagree; this is the record.

### Status

Static SPA, containerized, **2080/2080 tests passing across 75 files** (the ~1-in-4 `depthField.agreement.test.ts` flake is closed — follow-up 140), schema
`CURRENT_VERSION` **11**.

**PRODUCTION MATCHES `master` as of 2026-10-07 with the components round live** — bundle `index-3fpWh8yo.js`, CSS `index-QQ-rJZea.css`, merge `9012e1e`, **schema 11** (rolling back past it strands v11 documents; export first).

**The components round (2026-10-07) is merged (`9012e1e`) AND deployed.** It is round 2 of 2. **Duplicate and Copy in a row of an assembly SHARE its definition**: an edit inside any copy changes them all, in one undo entry, and **Make Unique** splits a copy off one level deep. **Links became shared `Shape`s**: a linked part stores only its own fields plus a `shape` id, so the shared fields are stored once. Shared copies show `×N`, "Shared by N copies", **Select copies** and **Make Unique**. Joinery keeps sharing where results come out identical (closes follow-up 223). Its live check was driven HEADLESS, because the SSH-forwarded display the user watches from had gone; the user did not watch (`docs/browser-verification-components.md`). Invariants 45 (rewritten) and 46 (amended); spec `docs/superpowers/specs/2026-10-06-sloyd-components-design.md` (§8 records the implementation amendments). Residues are follow-ups 229-231.

**Before it, the assemblies round was live (2026-10-06)** — bundle `index-DVAS8FuS.js`, CSS `index-BYFkbcnj.css`, deployed commit `029becf` (merge `699cc45`, then the grey fade and click-empty-to-close-a-level, both at the user's request), **schema 10**; before those two, `index-hmc0odAl.js` (`f8f76e8`) (rolling back past it strands v10 documents; export first).

**The assemblies round (2026-10-06) is merged (`699cc45`) AND deployed (`index-hmc0odAl.js`).** Claude drove its live check on the dev server (`docs/browser-verification-assemblies.md`); the user approved the merge and the deploy without reporting hands-on results, so the fade on real hardware is still unconfirmed. It is round 1 of two, in the user's order: assemblies, then components (shared definitions). Select parts and **Group** (Ctrl/Cmd+G). The parts become an assembly, a real definition/instance tree that nests, duplicates (an INDEPENDENT copy in round 1), moves and turns as one. SketchUp's click model: a click selects the outermost assembly, a double-click opens it (everything outside fades but stays clickable), and Escape closes it. **Ungroup** is Ctrl/Cmd+Shift+G. Names are unique per level, and the cut list and joinery name parts by path (`Cabinet › Drawer › Side`). Invariant 46; invariants 8 and 33 are restated per level (spec `docs/superpowers/specs/2026-10-06-sloyd-assemblies-design.md`). **Schema 10**: `instances` and `definitions`. Residues are follow-ups 224-228; 224 holds round 2's design questions.

**Before it, the linking round was live** — bundle `index-BwdHsyEM.js`, CSS `index-C7v9uwho.css`, merge commit `d3120cf`, **schema 9** (rolling back past it strands v9 documents; export first). Before it: copy in a row `index-B8i7dotN.js` (`7487aca`, 2026-10-06, schema 8), quarter turns `index-bSuJPbkx.js` (`a24287f`, 2026-10-05), hide/unhide `index-BpdcUlXf.js` (`366eb37`, 2026-10-05), multi-select `index-D7ySMvky.js` (`232917f`, 2026-10-05), joinery residues `index-D_wzi7Bx.js` (`2b96eb2`, 2026-10-05), joinery fixes `index-BzWa2ZGT.js` (`c31dd82`, 2026-10-05), fu 197 `index-Ci3NLhVT.js` (`658dfcc`, 2026-10-05), fu 200 `index-DjL6FbOz.js` (`f37734b`, 2026-10-05), 198/199 `index-BvsB1zA6.js` (`fb8a094`, 2026-10-05), cut storage `index-JBiJohQE.js` (`7fa749d`, 2026-10-04), cut lines `index-BPmx9i74.js` (`f602a2d`), cut words `index-Cw_EeWuY.js` (`8c9be52`), joinery `index-Ci7lVCzJ.js` (`d2a14ac`), phantom cut `index-B2Yuq550.js` (`e7bf3bc`), stopped cuts `index-CoHIAVxf.js` (`c054ede`), which bumped the schema to 7 (rolling back past it strands v7 documents; export first). Before it, 2026-10-03: key check `index-BhhW2iNw.js` (`d0ba83b`), held and stable `index-B9DOKF_H.js` (`a0f452f`), batch variety `index-CHx6ZAo-.js` (`b46b28d`). The Generate round's own deploy, earlier the same day, is described next. It served
bundle `index-BAsxEohe.js` with CSS `index-DEQSkZ3q.css`, from merge commit `fa834dc`. A
person stores a Claude API key in Settings, describes a piece, and gets 1–3 prototypes built
from boards, each saved as a **new, unactivated** library project (invariant 36). **It is
the first round with a network dependency**: the browser calls `api.anthropic.com`
directly, and the CSP's `connect-src` names it. **It was deployed before its live test, at
the user's request, and the user then drove real generations on production.** That was safe
only because generation never writes into an existing project. The better route is now
known: the user can **watch** the Playwright browser this session drives, so next time
Claude drives the dev server and the user supervises. Results are in
`docs/browser-verification-generate.md`. 6 of 6 generations completed. It left two
findings: 164, a batch converging on one design, and 165, a support check that passed a
badly supported part; both are now CLOSED (below).

**The joinery residues round (follow-ups 182, 186, 188, 191, 201–203, 2026-10-05) is merged AND deployed.** Verified against the dev server with the user watching, one paid run (`docs/browser-verification-joinery-residues.md`). A rabbeted panel is resolved as one unit from its final box, so its pockets leave no voids and parts in its path are trimmed (182, 201); default tenons shrink to 1/4in, else butt (188); joinery blockers judge solids (203); every `resize` is pre-checked, so an end already cut is a skip, never a throw. No schema change. Residues are 205–206.

**The joinery fixes round (follow-ups 183, 184, 185, 190, 2026-10-05) is merged AND deployed.** Verified against the dev server with the user watching, three paid runs (`docs/browser-verification-joinery-fixes.md`). Default tenons from opposite faces are capped under half the post (190), crossings run bottom-up with a swept-volume blocker (185), a rabbeted panel carries its outer-face chain or refuses before any mutation (183), and the dialog reports the re-ground (184). No schema change. Residues are 201-204.

**The linking round (2026-10-06) is merged AND deployed; its live check passed with the user watching** (`docs/browser-verification-linking.md`). The LAST of the three repeated-parts rounds (quarter turns, copy in a row, linking). Select 2+ parts and **Link**: the FIRST selected part's size, material, grain, posture and cuts (cut ids included) go to the others, and each keeps its own name, position and turn. An edit to a shared field of a linked part, a cut edit included, then reaches every member in the same undo entry, hidden members too. **Unlink** keeps the values; a link left with one member dissolves. Duplicate and Copy in a row copies join the source's link. The group panel shows a "will match" line when Link would change parts; a linked part's single panel shows a block with **Select linked** and **Unlink**; a linked row in the parts list carries a chain icon (invariant 45; spec `docs/superpowers/specs/2026-10-06-sloyd-linking-design.md`). **Schema 9**: `Board.link`, a label. **Rolling back past it strands v9 documents; export first.** Residues are follow-ups 221-223 (223, joinery unlinking the linked parts it cuts, is open by decision).

**The copy-in-a-row round (2026-10-05) is merged AND deployed; its live check passed with the user watching** (`docs/browser-verification-copy-in-a-row.md`). Round 2 of the three repeated-parts rounds, in the user's order: quarter turns, then copy in a row, then **linking** (shipped 2026-10-06; copies made here are ordinary, and a copy of a LINKED part joins its link). Properties' **Copy in a row…** (under the Duplicate row, in both panels) opens an inline form: count (the TOTAL in the row, original included), a direction (±X, ±Y, ±Z) and one of three spacings, gap, centre-to-centre pitch, or fit N across a distance, with a live summary and one Apply that is one undo entry (spec `docs/superpowers/specs/2026-10-05-sloyd-copy-in-a-row-design.md`; invariant 25 extended). No schema change. Residues are follow-ups 218-220; 218 and 219 are closed by the final review, 220 keeps one record-only item.

**The quarter turns round (2026-10-05) is merged AND deployed; its live check passed with the user watching, one paid joinery run** (`docs/browser-verification-quarter-turns.md`). The first of the three repeated-parts rounds, in the user's order: quarter turns, then copy in a row, then linking. `rotation` is now `0 | 90 | 180 | 270`, all TRUE rotations about the vertical, counter-clockwise from above; before it, 90° was a mirror across the X=Z diagonal, so identical parts could never face their cuts toward (−X, +Z). `axisFrame` is the one home of the turn table and every part↔world crossing goes through its helpers (invariant 44; spec `docs/superpowers/specs/2026-10-05-sloyd-quarter-turns-design.md`). Properties' Turn offers all four. **Schema 8**: `trueTurnsToV8` mirrors the cuts of every existing 90° part with cuts so it looks exactly as before. **Rolling back past it strands v8 documents; export first.** The visible cost: a migrated 90° part may measure its cuts from the other end on the sheet, and joinery on Generate's 90° parts now names the opposite end of the part for the same world cut. Generate still produces only 0° and 90°. Residues are follow-ups 215-217 (215 is the open handedness-across-postures question).

**The hide/unhide round (2026-10-05) is merged AND deployed; its live check passed with the user watching** (`docs/browser-verification-hide-unhide.md`), and it fixed a pre-existing projection-swap framing bug. Each part-list row has an eye; H hides the selection, Shift+H (and **Hide others** in Properties) hides the rest, Alt+H (and **Show all (N)**) shows everything (invariant 43; spec `docs/superpowers/specs/2026-10-05-sloyd-hide-unhide-design.md`). A hidden part is not drawn, not a snap point, not framed by Home and never selected; it is still in the cut list, joinery, Generate, the checks and the saved file. Hidden-ness is view state, not saved, so no schema change, but it is undoable. Repeated parts followed (all three rounds live 2026-10-06). Residues are follow-ups 213-214.

**The multi-select round (2026-10-05) is merged AND deployed; its live check passed with the user watching** (`docs/browser-verification-multi-select.md`). Shift/Ctrl-click and Ctrl/Cmd+A build a selection; move together, delete, duplicate and shared Properties fields (length, width, thickness, grain, material) act on all of it (invariant 42; spec `docs/superpowers/specs/2026-10-05-sloyd-multi-select-design.md`). No schema change. A selection change mid-drag ends the gizmo drag. Hide/unhide and repeated parts followed it, in the user's order; all are live. Residues are follow-ups 207-211. From the live check, Enter in a field now commits AND blurs (fu 212, every field).

**The fu 197 round (2026-10-05) is merged AND deployed.** `clippedRegion` is the cut's box clipped to the board, and the drawing's leader spans, the snap points, `cutShape`, `openSides` and `findTenons` all read it (`docs/browser-verification-fu197.md`). No schema change; a cut inside the board shows exactly as before.

**The fu 200 round (2026-10-05) is merged AND deployed.** `runAxis` and the word table compare computed extents within `FLUSH_EPSILON`, so a square typed in millimetres reads exactly like its fractional twin (`docs/browser-verification-fu200.md`). No schema change; fractions provably unchanged.

**The 198/199 round (2026-10-05) is merged AND deployed.** No Match note when only the square tie's default decides a cut's direction (`runByDefault`), and a growing part's cuts follow their shape in `rebaseCuts` (`docs/browser-verification-fu198-199.md`). No schema change. Follow-up 200 followed.

**The cut storage round (follow-ups 195, 196, 2026-10-04) is merged AND deployed.** Joinery stores each cut the way the sheet reads it (`storedAsShape`), Properties offers **Match the cut list** for one stored the other way (guarded: offered only when the sheet would read the same), and a square opening's direction reads only its shape (`docs/browser-verification-cut-storage.md`). No schema change. Its open questions, 198 and 199, are closed by the 198/199 round.

**The cut lines round (follow-ups 192–194, 2026-10-04) is merged AND deployed.** `cutShape` is the one description of a cut; the setup line and the drawing both format from it, and a with-grain channel says `groove` (`docs/browser-verification-cut-lines.md`). No schema change. Its open questions, 195–197, are closed by later rounds.

**The cut words round (follow-ups 180, 181, 189, 2026-10-04) is merged AND deployed.** Words only: a cut is named from the stock actually left around its opening, a tenon prints as one line (`docs/browser-verification-cut-words.md`). No schema change.

**The joinery round (phase 2, follow-up 171, 2026-10-04) is merged AND deployed.** "Add joinery…" returns the open design joined, as a new unactivated project
(`docs/browser-verification-joinery.md`). No schema change. Read invariants 38 and 41 before
touching `generate/joints/` or `checkDesign`.

**The phantom-cut round (follow-up 178, 2026-10-04) is merged AND deployed.** A cut a board edit has left removing nothing is hidden from the cut list, its
drawings and the snap points, and flagged on its Properties row; it is kept, so growing the
board back restores it (`docs/browser-verification-phantom-cut.md`). No schema change.

**The stopped cuts round (2026-10-04) is merged AND deployed.**
A `Cut` can stop short of either end (`stopMin`/`stopMax`), schema **7**, so mortises exist
for phase 2 (171) to write its overlap rule against. Verified against the dev server with the
user watching (`docs/browser-verification-stopped-cuts.md`). Rolling it back strands v7 files;
export first.

**The key check round (follow-up 174, 2026-10-03) is merged AND deployed.** Settings refuses a key with whitespace or non-ASCII inside it,
verifies a newly typed key with one free `GET /v1/models` before storing it, and an auth
error now carries the API's own reason. There is **no prefix rule**, on purpose
(`docs/browser-verification-key-check.md`).

**The held and stable round (follow-up 165, 2026-10-03) is merged AND deployed.** `checkDesign` now reports a part that is not *held* (`hangs`) and a
piece that would *tip* (`tips`), and the model is told both rules up front (invariant 39).
Verified against the dev server with the user watching
(`docs/browser-verification-held-and-stable.md`). There is no schema change.

**The batch variety round (follow-up 164, 2026-10-03) is merged AND deployed**, confirmed by
page load, bundle hash and the CSP header at the edge and in-network. A batch of 2–3 now makes one planning call
(`generate/concepts.ts`) for N structurally contrasting concepts, and each run designs its
own; a batch of 1 is unchanged. It was the first live pass **driven by Claude with the
user watching**. The user judged both batches (a side table on Sonnet, a bench on Opus)
structurally different, which closed 164. Results are in
`docs/browser-verification-batch-variety.md`. There is no schema change, so rolling it
back costs nothing but the round.

**The previous production build, 2026-08-31.** It served bundle
`index-CZu96cak.js` with CSS `index-CtYur9k3.css`, which is `eb6a632` — the ply-sign round
(follow-up 163), the day's **fifth** deploy and the only one of the ten rounds that came from
a user bug report rather than the ledger. It fixes a real rendering defect that had been live
since v3: `FACE_AXES` discarded the *direction* of each of `BoxGeometry`'s UV axes, so on a
board with a **cut** each solid's sub-range landed on the wrong side of its face and the two
solids meeting at a split plane disagreed about the coordinate there. Visible only on
**plywood with a cut** — invariant 35 says why that combination and no other. **Note the
mirror of the CSS/JS-hash note below: this round moved the JS hash and left the CSS hash
alone**, being TypeScript-only. **163 was not exercised against production either**, and its
reason is the strongest of the series: seeing it needs a plywood board *with a cut*, so
exercising it would write a document. Its correct appearance on a healthy empty load is no
appearance, and that was checked; the change itself was measured against the dev server with
`gl.readPixels` (`docs/browser-verification-ply-cut-uv.md`).

The day's fourth deploy served `index-DU8uasNy.js` with CSS `index-CtYur9k3.css`, which was
`c50a138` — the key-list round (follow-up 162), the smallest round yet shipped: one CSS rule,
dropping the default disc the sheet's key list drew in front of a line that already numbers
itself. **Note that a CSS-only change still moves the JS hash** — the entry chunk
references the CSS asset by name — so a moved JS hash is not by itself evidence that
behaviour changed.

The day's third deploy served `index-CePWNaxg.js`, which was `5985ee2` — the turned-index
round (follow-up 161), a rendering change to the printable cut list: a turned part whose
rectangle fits its name but not its dimension line now demotes to a numbered box whose key
entry carries name, dimensions and the word, instead of printing a bare name that says
nothing. Neither 161 nor 162 was exercised against production — both need parts nested on a
sheet, so exercising either would write a document — and both were verified against the dev
server instead (`docs/browser-verification-turned-index.md`), which is the deployment rule
working rather than a gap. Both confirmed live by page load and asset hashes at the edge and
in-network, with `localStorage` cleared in the verifying browser afterward.

The day's second deploy served `index-8v7-ukbU.js`, which was `59d531b` — the
duplicate-error round (follow-up 159). Its one shipped change could **not** be exercised
live either: reaching it means manufacturing a corrupt library state in a production browser,
so it was driven against the dev server on that seeded state
(`docs/browser-verification-duplicate-error.md`). Its correct appearance on a healthy
production load is no appearance, and that was checked. The first deploy that day served
`index-Bt74Y3lR.js`, which was `4484f92`. That build shipped three rounds at once: the
id-uniqueness round (follow-ups 97 and 131), which had been unreleased by decision; the
gesture-flags round (follow-up 148); and the turned-label round (follow-up 92), **the only
user-facing change of the three** and the one that prompted the deploy. Confirmed live by
page load and bundle hash at both the edge and in-network, with `localStorage` cleared in the
verifying browser afterward. The turned label itself was **not** exercised against
production — it needs boards, so exercising it would write a document — and was verified
against the dev server instead (`docs/browser-verification-turned-label.md`), which is the
deployment rule working rather than a gap.

**Check what a later commit touches before reading `git log` as a pending release.** Two
different things make `git log` look ahead when it is not, and both are normal here:

- **The deployed commit ALWAYS trails `HEAD`, by construction.** A deploy's own record — this
  Status block, the runbook entry, the history note — is written *after* the deploy it
  describes, so the commit naming a bundle can never be the last commit. Expect at least one
  docs-only commit past whatever hash Status names, and do not read it as unreleased work.
- **Some rounds ship nothing at all.** Three inside the current build are edit-tests-only and
  built a byte-identical bundle: the agreement-test round (follow-up 140), 159's focus test,
  and the whole delete-token round (follow-up 160).

**Nothing is pending** (the components round is live, above). `DEPLOYMENT.local.md` carries every runbook entry and bundle hash.

**The 2026-08-15 project-library deploy was the first that ACTS on a user's stored data at
page load**, which
changes what "verified by loading the page" buys — see the deployment rule below. Every
earlier round's feature was inert until exercised; adoption is not. Read
`DEPLOYMENT.local.md`'s entry for the safety argument and the asymmetric rollback cost
before assuming a future round can be reverted as cheaply.

**The project library changed the storage layout, and NOT the schema.** There are now two
things carrying a version: the document's `version` (still **6**) and the library index's
`layout` (**1**), and they change for unrelated reasons. The consequence to hold on to:
**rolling back past this round costs nothing at the document level** — a `.sloyd` file this
build writes is byte-identical to one written before the library existed, and a pre-round
build finds `sloyd.autosave.v1` exactly as it left it. The one thing a rollback loses is any
project created *after* adoption, which lives in `sloyd.project.<id>` keys the old build
cannot see. Export first. This is not true of the two rounds before it — see the rollback
paragraph below.

**The tape line of work is complete for now** — three rounds landed on that surface on 08-04
and all three are live. **The project library (08-14) was the successor**, chosen from the
user's own critique that there was no clear way to store, switch or create projects; it is
merged and live as of 2026-08-15. Its two loose ends were closed on 2026-08-31 by the
switch-token round (follow-ups 157 and 158), which is live, and the same day's id-uniqueness
round (97 and 131) closed a pre-existing gap that the sheet-nesting round had made
load-bearing.

**The Generate round (2026-10-03) was the successor**, chosen by the user from a blank
slate. **Batch variety (164) and held and stable (165) followed it and are done.** The
planned follow-on is **phase 2, refine and joinery (follow-up 171)**; read invariants 38
and 39 first, because joinery is exactly where "overlap" and "held" both change meaning.
174 (the key check) is done too. Phase 2's joinery half (171) shipped on 2026-10-04.

**As of 2026-10-07: the components round is merged AND deployed; nothing is pending. NO SUCCESSOR IS CHOSEN: ask what to work on.**

**Earlier on 2026-10-06, before the assemblies round: NOTHING WAS PENDING and NO SUCCESSOR WAS CHOSEN.**
The user asked on 2026-10-05 for three features, in order, and all three are live: multi-select,
hide/unhide, and repeated parts (split by the user into quarter turns, copy in a row and linking).
Production matches `master` (`index-BwdHsyEM.js`, schema 9). The docs-only commits past the merge
`d3120cf` are its own record. **Ask what to work on; do not pick.** Open near the recent code:
223 (joinery unlinks the linked parts it cuts, open by decision), 221 (a hand-edited linked file
without cut ids unlinks on load, fails safe), 215 (posture handedness, a question), 205/206
(joinery's safe refusals) and **179, refine by instruction**. The paragraphs below are earlier
states, kept for their reasoning.

**As of 2026-10-05: the cut-list line of work that followed joinery (follow-ups 180–200) is
COMPLETE and live**, across seven rounds: cut words, cut lines, cut storage, 198/199, 200 and
197. Every follow-up it raised is closed. **No successor is chosen.** What remains open on the
ledger near this code is joinery's own residue (205, 206; 182–191 and 201–203 are closed, the
residues round on its branch) and
**179, refine by instruction**, phase 2's other half. Ask before starting anything.
The paragraphs below are the 2026-08-31 state, kept for its reasoning.

**As of 2026-08-31: NO SUCCESSOR FEATURE ROUND HAD BEEN CHOSEN, and 130 is no longer the presumed one** — it
was picked on 2026-08-31 and set aside a moment later without a stated reason, so treat it
as available rather than as either chosen or rejected.

**The 08-31 session ran TEN rounds instead, across FIVE deploys, and every one of them is now
live** — 157/158, 97/131, 148, 92, 140, 159, 160, 161, 162 and 163, all listed in the table
below. Three ship nothing on their own (140, 159's focus test, and all of 160: test files
only, byte-identical bundles).

**NINE of the ten were small already-diagnosed items off the ledger. 163 is the exception and
is a different kind of thing, which is the part worth carrying forward:** it started from a
user bug report, it was a live rendering defect dating to v3 rather than a known residue, and
the first investigation measured the wrong layer clean and said so before the user's second
message ("only when I add a cut") narrowed it. Read its follow-up entry before writing any UV
assertion — a 48-case sweep written *during* that diagnosis passed with the bug live.

**NO CANDIDATE IS STANDING and nothing is pending.** The standing-candidate list is empty for
the first time since the tape rounds: 160, 161, 162 and 163 all closed on 08-31, and 161's own
residue (162) closed the same day. 163 left a residue of its own and it is **open by
decision, not by oversight** — the measured legibility of a plywood edge at 3/4in (sub-pixel
ply rules, a 7% light/dark step, the mesh outline covering the outer plies only). The user was
shown the measurements and ruled that the layers read as even. Do not re-open it without
asking. 130 remains available-but-unasked — read its bullet below
before proposing it, especially 26a's cost. **So the next conversation starts from a blank
slate on feature direction**, and the honest first move is to ask rather than to pick from
`docs/follow-ups.md`, whose remaining open entries are deferred-by-decision or
recorded-negative findings rather than queued work.

**The cut list line of work is CLOSED as of 2026-08-01.** Cut list, diagrams, label
layout, per-face views, board feet and sheet nesting are all shipped and merged. Do not
treat any of them as in-flight, and do not re-propose the two items declined on purpose:
CSV/clipboard export and name run-collapsing (`Leg 1..4`).

### Rounds shipped

Each row's design spec is `docs/superpowers/specs/<date>-sloyd-<slug>-design.md` and, for
the later ones, a browser pass at `docs/browser-verification-<slug>.md`. The full
narrative for every row is in `docs/history.md`. **Screenshots from a browser pass live in
`docs/img/`** — new as of the turned-index round (161), which is the first pass where the
thing under test was a layout decision rather than a value, so a DOM readout alone did not
show it. Prefer a readout where one suffices; add an image when the finding is spatial.

| Round | Date | Schema | What it added |
|---|---|---|---|
| v1 + polish | 07-29/30 | 1 | boards, gizmo, unique names, origin axes, grid |
| v2 | 07-30 | 2 | two-state grain orientation, reorient-pivot fix, wood textures |
| v3 | 07-31 | 3 | posture, part-local grain, log-derived grain textures |
| post-v3 fixes | 07-31 | — | `DimensionField`/`NameField` staleness (invariant 5), plywood grain |
| joinery | 07-31 | 4 | `Cut` — stock removed from a board, by sub-box decomposition |
| cut list | 08-01 | — | the printable bench sheet, derived not stored |
| cut list diagrams | 08-01 | — | each part's joinery drawn on the sheet |
| label layout | 08-01 | — | measured labels; nothing overlaps or bleeds (invariant 19) |
| per-face diagrams | 08-01 | — | re-key on `(face, from)`; perpendicular cuts draw together |
| board feet | 08-01 | — | the purchasing number beside the bench numbers |
| empty-solids placeholder | 08-01 | — | *no spec* — ghost box for a fully-consumed board (invariant 21) |
| sheet nesting | 08-02 | 5 | sheet count + guillotine-cuttable layout; `stock: { kerf }` |
| snap-move | 08-02 | — | the Move tool: point-to-point board placement |
| selected-board grabs | 08-03 | — | grab candidates narrowed to the selected board |
| cut-aware snap points | 08-03 | — | every `Cut` contributes snap points; fixed an older rabbet defect |
| guide points + tape | 08-04 | 6 | the Tape tool, `guides: GuidePoint[]` |
| type-anywhere entry | 08-04 | — | *no spec* — typing a digit anywhere routes into the readout |
| cardinal guides | 08-04 | — | `X`/`Y`/`Z` lock a world axis for a typed distance |
| project library | 08-14 | — | multiple projects in the browser; `sloyd.library.v1` |
| switch-token fixes | 08-31 | — | *no spec* — one in-flight token for the four adopting handlers (invariant 32); the pending write becomes a captured-pair thunk |
| id uniqueness | 08-31 | — | *no spec* — `takeId` closes follow-ups 97 and 131; duplicate board and guide ids are repaired on load (invariant 33) |
| gesture flags | 08-31 | — | *no spec* — follow-up 148: `gesturing`/`gestureSnapshotTaken` move into the store's state, so `replaceDocument` ends a leaked gesture |
| turned label | 08-31 | — | *no spec* — follow-up 92: `formatDims` is the one home of `length × width`, and a turned part's label says so in words |
| agreement-test cost | 08-31 | — | *no spec* — follow-up 140: the agreement test hoists `boardSolids` out of its probe loops; no source change |
| duplicate error | 08-31 | — | *no spec* — follow-up 159: a failed duplicate reports its cause inline on the failing row |
| delete token | 08-31 | — | *no spec* — follow-up 160: `deleteProject`'s index write is pinned synchronous with its read; no source change |
| turned index | 08-31 | — | *no spec* — follow-up 161: `fitLabel`'s `requireDetail` removes the `name` rung, so a turned part demotes to `index` rather than printing a bare name |
| key list | 08-31 | — | *no spec* — follow-up 162: `.cutlist-layout-key` gets the `list-style: none` reset every other list in the app already had. CSS only |
| ply sign | 08-31 | — | *no spec* — follow-up 163: `FACE_AXES` carries each UV axis's SIGN, so a solid's sub-range lands on the right side of its face (invariant 35). The one round of the day that came from a bug report |
| generate | 10-03 | — | prototypes from a description via Claude; each generation is a new, unactivated project (invariant 36) |
| batch variety | 10-03 | — | one planning call gives each run in a batch of 2–3 a contrasting concept (fu 164); a batch of 1 is unchanged |
| held and stable | 10-03 | — | checkDesign reports a part that is not held and a piece that would tip (fu 165, inv 39) |
| key check | 10-03 | — | *no spec* — fu 174: Settings shape-checks a key and verifies it with a free call before storing it; the auth error carries the API's reason. No prefix rule |
| stopped cuts | 10-04 | 7 | a `Cut` stops short of either end (`stopMin`/`stopMax`): mortises, through mortises, stopped dados, notches. One field table, two readers (inv 40) |
| phantom cut | 10-04 | — | *no spec* — fu 178: a cut a board edit has left removing nothing is hidden from the cut list, drawings and snap points, and flagged on its row; kept, not dropped |
| joinery | 10-04 | — | "Add joinery…": sites found by code, one model call chooses, `pocketFor` recipes build mortise and tenon / dado / stopped dado / rabbet / half-lap into a new unactivated project (invs 38 rewritten, 41) |
| cut words | 10-04 | — | fu 180/181/189: a cut is named from its OPENING, open meaning NO STOCK left (`openSides`), so one shape gets one word; `findTenons` prints a tenon as one line; corner notch; mortise by depth:length |
| cut lines | 10-04 | — | fu 192/193 (194 by decision): `cutShape` is the ONE description of a cut (word, run axis, position, stops at closed ends); the setup line AND the drawing format from it, never stored fields; `groove` with the grain, solid wood and plywood |
| cut storage | 10-04 | — | fu 195/196: `storedAsShape` — joinery stores a cut the way the sheet reads it; Properties' **Match the cut list** (one undo, same stock, guarded so the sheet never changes); the square tie reads only the shape |
| 198/199 | 10-05 | — | *no spec* — fu 198: `CutShape.runByDefault`, no Match note when only the tie's default decides; fu 199: `rebaseCuts` re-stores by shape (judged before the growth), so growth never depends on storage |
| fu 200 | 10-05 | — | *no spec* — computed opening extents compare within `FLUSH_EPSILON` in `runAxis` and the word table (invariant 22's rule), so a millimetre square reads like its fractional twin; stored values stay exact |
| fu 197 | 10-05 | — | *no spec* — `clippedRegion`: the cut's box clipped to the board is the one clip read by everything that shows a cut (drawing spans, snap points, cutShape, openSides, findTenons); an in-session overhang draws as what remains |
| multi-select | 10-05 | — | `selectedIds`: Shift/Ctrl-click, Ctrl/Cmd+A, group move/delete/duplicate, shared Properties fields; one writer for user selection changes (inv 42); a selection change mid-drag ends the gizmo drag; Enter commits and blurs a field (fu 212) |
| quarter turns | 10-05 | 8 | `rotation: 0 \| 90 \| 180 \| 270`, true rotations; `axisFrame` is the one turn table and every part↔world crossing goes through its helpers (inv 44); `trueTurnsToV8` mirrors old 90° parts' cuts so they look unchanged |
| copy in a row | 10-05 | — | `rowLayout` (gap / pitch / fit-across, no rounding) and `copyInRow`: N−1 ordinary copies of the selection along ±X/Y/Z, each shifted k·step from the ORIGINAL, one undo entry; Properties' inline **Copy in a row…** form (inv 25) |
| linking | 10-06 | 9 | `Board.link`, a label; `LINK_FIELDS` is the one shared/own table; `linkPlan` decides Link for store and panel; shared edits and cut edits reach every member in one undo entry; Unlink, Select linked, linked copies; `repairLinks` in `migrateDocument` unlinks a differing member (inv 45) |
| assemblies | 10-06 | 10 | `instances` + `definitions`: a definition/instance tree; Group / Ungroup (Ctrl/Cmd+G, +Shift), double-click opens, Escape closes, the rest fades; `worldParts` the one walk, `placeBoard`/`placeInstance` the one composition, every edit written back through `treeEdit.ts` (inv 46); names unique per level, ids unique per container (invs 8, 33 restated); cut list and joinery read `flatDocument` (path names) |
| components | 10-07 | 11 | shared definitions (Duplicate shares; Make Unique one level deep; Select copies; `×N`); links are `Shape`s (`ShapedBoard` = own fields + `shape`; `resolveBoard` the one reader; `Board.link`/`repairLinks` retired); write-back keyed on the storage target, disagreeing edits throw; v10 links migrate to shapes on load; joinery shares where identical (fu 223) (invs 45, 46) |
| hide/unhide | 10-05 | — | `hiddenIds`: an eye per row, H / Shift+H / Alt+H, Show all (N), Hide others; view state, not saved, but undoable (history entries are `{ doc, hiddenIds }`); a hidden part is not drawn, snapped to, framed or selected (inv 43) |
| joinery fixes | 10-05 | — | *no spec* — fu 190/185/183/184: opposite-face tenon cap, bottom-up crossings with a swept-volume blocker, outer-face carry (refuses before any mutation), `lowered` reported |
| joinery residues | 10-05 | — | *no spec* — fu 182/201/188/203/191/186: rabbet unit from the panel's final box (no voids, path parts trimmed), 1/4in default tenons else butt, blockers on solids, `resize` pre-checked |

### The deployment rule, stated once

**Production is verified by loading the page only.** Sloyd has no server-side state, so
`sloyd.autosave.v1` in the user's browser *is* their project; exercising a new feature
against production would overwrite it with a demo document and there is nothing to
restore from. So: **new rendering is verified against the dev server** (that is what
every `docs/browser-verification-*.md` is), and **the deploy itself is confirmed by
bundle hash**. Whether a round's own change is confirmable live depends on whether
exercising it writes a document — arming a tool writes nothing and was confirmed live;
anything needing a board was not. `sloyd.autosave.v1` is confirmed **absent** in the
verifying browser afterward, checked rather than assumed.

**The Generate round is the one exception, and the reason it holds is narrow.** Generation
was exercised against production by the user, because it only ever ADDS library projects
with `activate: false` and never writes into the open one (invariant 36). That makes it a
different kind of thing from every earlier feature, not a precedent for them. Even so, the
preferred route is the dev server with the user watching the Playwright browser Claude
drives. A paid run needs the user's approval each time, and the key never goes into chat
or a committed file. A Generate deploy is verified by page load, bundle hash, **and the
edge's CSP header** (`connect-src 'self' https://api.anthropic.com`), which the dev server
does not send.

**Rollback cost is a schema question.** A document saved by the current build carries
`version: 11`, and any build understanding less **refuses** it rather than silently dropping
what it cannot read. That is the gate working as designed. Each bump's own argument is in
Versioning below. Autosave lives in the browser, so rolling back past a schema bump strands
every project saved since; export first. Rolling back a round that changed no schema costs
nothing but the round itself.


### Where things live (annotated, as of 2026-10-07)


An index. Layer rationale is in Architecture; the rules are in Invariants (`inv N`).
Where a file's own doc comment is the stated single source of truth for something —
`tapeHover`'s clearing enumeration, `tapeAxis`'s structural rule, `TapeAxis`'s
world-vs-board-local argument, `woodCut`'s seam argument — **read it there.**

```
src/
├── units/                  bottom layer, imports nothing
│   ├── length.ts           parseLength / formatLength / canBeginLength (capture set
│   │                       {0-9, ., -} — NOT '/', nothing here starts with a slash)
│   └── quantity.ts         formatBoardFeet / formatSquareFeet — two decimals fixed,
│                           NOT units.precision (meaningless on a decimal volume)
├── document/
│   ├── row.ts              `rowLayout(mode, value, s, count)`: step, gap and row length for gap /
│   │                       pitch / fit-across, `MAX_ROW` = 100. Refusals are CODES (`count`,
│   │                       `value`, `negative-gap`, `pitch-short`, `no-room`), not sentences, and
│   │                       it imports no `units` (the edge rule: it produces no string). Nothing
│   │                       rounds (inv 25). The panel's summary AND Apply both read it
│   ├── types.ts            Board, GuidePoint, SloydDocument, Rotation, Posture,
│   │                       Grain, MATERIALS, SheetStock, isSheetGood, sheetStockOf.
│   │                       `Board.shape?: string` — set ONLY on a RESOLVED part; `Shape`
│   │                       (the shared fields + id), `ShapedBoard` (own fields + `shape`),
│   │                       `StoredBoard` = Board | ShapedBoard, `FlatDocument` (resolved
│   │                       boards), `SloydDocument.shapes` — all derived from LINK_FIELDS
│   │                       (inv 45). `Instance` (`position` is its
│   │                       frame's ORIGIN, not a min corner) and `Definition`
│   │                       `{ id, boards, instances }`; `SloydDocument.instances` is the
│   │                       root's (inv 46)
│   ├── ids.ts              `nextId`, the one id minter
│   ├── shapes.ts           `isShaped` (no `length` key), `shapeMap`, `resolveBoard` (THE
│   │                       place a shape is read into a part; a plain part comes back as the
│   │                       SAME object; shared fields from SHARED_KEYS, cuts copied),
│   │                       `shapeUsers` (STORED users, not placements), `pruneShapes`,
│   │                       `dissolveShapes` (a one-user shape: its user turns plain, cut ids
│   │                       kept), `plainOf` (strips `shape`)
│   ├── linksToShapes.ts    the v10→v11 step: each link label → one Shape from its FIRST member
│   │                       in worldParts order; equal members (`sameShared`, exact, cut ids
│   │                       included) become shaped parts; nothing moves
│   ├── frames.ts           the ONE composition step (inv 46): `rotateVec` (90 maps (x,y,z) to
│   │                       (z,y,−x)), `cornerShift`, `placeBoard(frame, board)` = (origin +
│   │                       R(p)) + shift, `placeInstance`, `inverseTurn`, `addTurns`. Pure
│   ├── tree.ts             occurrence paths (`i1/i2/b3`; `/` reserved), `isCovered` (THE
│   │                       ancestor test: `i3` covers `i3/b1`, not `i30/b1`), lookups,
│   │                       `worldParts` (THE walk to placed parts, cached per document
│   │                       object in a WeakMap; each part keeps its OWN name), `flatDocument`
│   │                       (path names joined by `NAME_SEPARATOR` ` › `, for the cut list and
│   │                       joinery), `childrenOf`, `itemPaths`, `containerTurn`, `treeRows`
│   ├── treeEdit.ts         every write-back (inv 46): `applyWorldEdits` keys on the STORAGE
│   │                       target (`storageKey` = `<definition id or ROOT>:<part id>`, the same
│   │                       for every placement); changed fields only, merged field by field;
│   │                       DISAGREEING edits throw; shared fields of a shaped part go to its
│   │                       Shape. `lowerEdit` is the ONE lowering (a moved position goes down
│   │                       as a delta level by level; `keepWorld` for joinery only). `mapWorld`,
│   │                       `translateItems` (a WORLD delta rotated into each container's
│   │                       frame), `updateContainer`. `writeBackFlat` (joinery) splits
│   │                       definitions shallowest-first and then shapes by IDENTICAL results
│   │                       (cuts by geometry), one edit per storage key
│   ├── treeOps.ts          `groupItems` (identity frame, so bit-exact), `ungroupItem` (exact
│   │                       for direct child parts; shaped parts stay shaped, cuts copied).
│   │                       Both return a `Rekey` built for EVERY placement of the edited
│   │                       container (`containerPlacements`, `rekeyEverywhere`).
│   │                       `shareInstance` (Duplicate: same definition), `instanceRefs`,
│   │                       `makeUniqueItem` (one level deep, ids kept, so paths survive),
│   │                       `removeItems` + `pruneDefinitions` (+ prune/dissolve shapes),
│   │                       `turnInstance` (about the assembly's centre), `insertItems`,
│   │                       `siblingsOf`, `nextAssemblyName`
│   ├── treeRepair.ts       `repairTree(doc, { copyShared })` (duplicate definition ids,
│   │                       missing definitions, cycles, a definition placed twice copied ONLY
│   │                       below v11, unreferenced dropped, ids and names per container) and
│   │                       `dropUnresolved` (a shaped part naming a missing shape); run in
│   │                       `migrateDocument` on every load
│   ├── treeFixtures.ts     TEST-ONLY `assemblyDoc()`: `r1`, `i1/b1`, `i1/b2`, `i1/i2/b3`; i1
│   │                       "Drawer" turned 90, i2 "Peg" turned 270
│   ├── links.ts            `LINK_FIELDS` — the ONE shared/own table, `satisfies
│   │                       Record<keyof Board, …>` (inv 45); `SHARED_KEYS` / `OwnField` /
│   │                       `sharedOf` (cuts copied, ids kept) / `sharedPatch` /
│   │                       `sameShared` (cuts in order, by id and `CUT_GEOMETRY_KEYS`,
│   │                       exact) / `linkPlan` (the ONE decider for Link: source, members,
│   │                       changing, the shape to reuse; null for a no-op). Pure
│   ├── geometry.ts         `axisFrame` — the ONE turn table (inv 44): per world axis an
│   │                       `AxisMap` `{ dim, reversed }`; `horizontalOf(posture)` gives
│   │                       [h0, h1]. `axisDimensions` (inv 13) is `axisFrame` without
│   │                       direction. The ONLY part↔world crossings: `toWorldOffset` /
│   │                       `fromWorldOffset` (a value), `spanToWorldOffset` /
│   │                       `spanFromWorldOffset` (a span, still [min, max]) and
│   │                       `endFacing` (which part end faces a world side). Never
│   │                       `board[dim] - u` at a call site. Also boardExtents /
│   │                       boardCenter / reorientedPosition (inv 2) / `boardsBounds` — the
│                       box around a set of boards; the group gizmo sits at its centre
│                       and `moveGroupTo` rounds its `min`
│   ├── turnFixtures.ts     TEST-ONLY: `chiralPart(posture)` — three cuts with a HAND (all
│   │                       three are off-centre on every axis, so each alone is
│   │                       one-handed; c3 takes a box corner so boardSnapPoints'
│   │                       filter has something to see) — plus `turnedAbout`,
│   │                       `rotateQuarter` and `sameSet`, the equivariance kit (inv 44)
│   ├── names.ts            uniqueName / dedupeNames over `Named` (parts AND assemblies,
│   │                       one container's siblings; inv 8).
│   │                       NAMES ONLY — id uniqueness is `takeId` in
│   │                       document.ts (inv 33), for the reason stated there
│   ├── cuts.ts             cutRegion / boardSolids (split, drop against the UNION,
│   │                       merge) / boardEdges (inv 16) / solidWorldBox and
│   │                       pointToLocalXYZ (centre-relative, through axisFrame's
│   │                       helpers, inv 44) / cutLabel /
│   │                       stockProbe (boardEdges' rule from a segment to a point;
│   │                       CLOSED spans, so a point on a split plane sees both sides).
│   │                       `cutRemovesNothing` / `cutsThatRemoveStock`: a cut whose box,
│   │                       CLIPPED to the board, has no volume (fu 178) — skipped by the
│   │                       cut list, the diagrams and the snap points, kept in the document.
│   │                       cutRegion honours `stopMin`/`stopMax` (crossed stops remove
│   │                       nothing); `cutLabel` names a cut from its OPENING (sides
│   │                       reaching the edge + proportions; cut-words spec §2).
│   │                       One box, one word; a cut removing nothing keeps the
│   │                       old table. `openSides`: open = no stock between a side
│   │                       and the edge; called only inside `cutShape`, which the
│   │                       word, the setup line and the drawing all read.
│   │                       `clippedRegion` = the cut's box ∩ the board, what it removes:
│   │                       the ONE clip, read by everything that SHOWS a cut (drawing
│   │                       spans, snap points, cutShape, openSides, findTenons; fu 197).
│   │                       `cutRegion` stays unclipped for building solids.
│   │                       `cutShape` is the ONE description of a cut (word, run axis,
│   │                       position, stops at closed ends, as numbers); `cutLabel` is
│   │                       its word, and the setup line AND the drawing format from it,
│   │                       never from stored fields (fu 192). `groove` when the run axis
│   │                       is the grain on a material with grain (fu 193).
│   │                       `CutShape.runByDefault` marks a run decided only by the tie's
│   │                       final default; it exists for Properties' note (fu 198).
│   │                       Extents are COMPUTED, so `runAxis` and the word table compare
│   │                       them within FLUSH_EPSILON (inv 22; fu 200) — an mm square is
│   │                       a tie like a fractional one. Stored values stay exact (inv 18).
│   │                       `storedAsShape` re-stores a sideways cut with across = its
│   │                       run (same stock; an already-aligned cut comes back as the
│   │                       same object, so no float noise splits rows). A far end the
│   │                       schema cannot express exactly lands within one ulp, on the
│   │                       side that keeps the run. The run never reads the stored
│   │                       across, square ties included (fu 196).
│   │                       It and `cutLabel` take an optional precomputed `solids`
│   │                       (one `boardSolids` per board) — skip it, cut list ~3.5×
│   │                       slower. Home of
│   │                       `CUT_GEOMETRY_FIELDS` / `CUT_GEOMETRY_KEYS` (inv 40)
│   ├── tenons.ts           findTenons: a tenon from the end cuts leaving one tongue
│   │                       (ℓ ≤ L/2, ≥ 2 cuts, exactly one remaining rectangle).
│   │                       The sheet prints one line per tenon. Section breakpoints
│   │                       merge within FLUSH_EPSILON (fu 191)
│   ├── cutlist.ts          buildCutList (inv 18). STOCK, NOT REMAINDER — `cuts`
│   │                       ignored, because a dado does not reduce the board you buy;
│   │                       accumulates EXACT stock, never qty × rounded dimensions.
│   │                       The setup line is formatted from `cutShape`, never from
│   │                       stored `across`/`offset`/`width`/stops (fu 192).
│   │                       `cutSignature` is derived from `CUT_GEOMETRY_FIELDS`
│   │                       in cuts.ts, checked against `Cut` by `satisfies` (inv 40)
│   ├── depthField.ts       buildDepthField (inv 20). Reads its rectangles
│   │                       from `cutRegion` — it once rebuilt them with the across
│   │                       span hard-coded to full length
│   ├── diagram.ts          buildDiagrams — one view per (face, from), so
│   │                       perpendicular cuts on a face draw together. Its labels
│   │                       are formatted from `cutShape`, never from stored
│   │                       `across`/`offset`/`width`/stops (fu 192)
│   ├── nesting.ts          buildNesting — shelf FFD, because guillotine cuttability
│   │                       is a DOMAIN FACT, not a quality tier. `formatDims` is
│   │                       the ONE home of `length × width` here, shared by the
│   │                       placed part, the unplaceable part and the sheet label
│   │                       (fu 92); a turned part's `dims` carries the WORD
│   │                       `turned`, on the string rather than in the panel so
│   │                       fitLabel measures what SheetLayout draws (inv 19).
│   │                       Takes doc.boards,
│   │                       NEVER CutListRows (rounded row dimensions can overflow a
│   │                       real sheet). Stock, not remainder. Too-big parts go in
│   │                       `unplaceable`, never dropped. Invs 22, 23
│   ├── snapPoints.ts       boardSnapPoints (the 3x3x3 lattice minus the volume
│   │                       centre; axes at `mid` name the kind — 0 corner, 1
│   │                       edge-mid, 2 face-centre; filtered through stockProbe
│   │                       EXCEPT a fully consumed board, a literal
│   │                       `boardSolids(b).length === 0` check, which keeps all 26
│   │                       because the ghost box IS drawn — inv 21) / cutSnapPoints
│   │                       (over the cut's CLIPPED box, `clippedRegion` — fu 197;
│   │                       floor rectangle 9 + the mouth's opening, every point
│   │                       but its centre, 8; stockProbe drops a through-cut's two
│   │                       across-end mouth points, so 15 for a dado, 12 for a
│   │                       rabbet, 17 for a blind mortise) / snapPointsFor (the
│   │                       union, called in BOTH of MoveTool's branches — a cut point
│   │                       must be a TARGET on the unselected board or the headline
│   │                       operation does not work) / guideSnapPoints / sameSnapPoint
│   │                       (HERE, not in viewport, because the store needs it and
│   │                       cannot import viewport — one home, not a re-export) /
│   │                       offsetPoint (null on a zero-length direction or non-finite
│   │                       distance, rather than letting NaN into the document) /
│   │                       towardFor (the tape's ONE direction source, called from
│   │                       BOTH the preview memo and commit(), which is what keeps
│   │                       marker and placement agreeing; THE AXIS WINS OVER A HOVER,
│   │                       never falls back to it) / tapeAxisFromKey. Exports
│   │                       SnapKind / SnapOwner / SnapPoint / BoardSnapPoint (inv 26).
│   │                       LOCAL→WORLD IS `position[axis] + toWorldOffset(board,
│   │                       axis, local[axisFrame(board)[axis].dim])` (inv 44; the
│   │                       filter's world→part step is `fromWorldOffset`) — neither
│   │                       pointToLocalXYZ nor solidWorldBox does this and BOTH look
│   │                       like they do (centre-relative), so either puts every point
│   │                       off by half the board, plausibly, in any screenshot; pin
│   │                       it with a rotated, non-flat pose. Imports ./types,
│   │                       ./geometry, ./cuts — notably NOT ../units
│   ├── generated.ts        the LLM's design shape: DESIGN_SCHEMA ({x,y,z} objects, not
│   │                       tuples — structured outputs cannot enforce an array length),
│   │                       parseDesign (Object.hasOwn on MATERIALS), designToDocument
│   │                       (axisDimensions, SNAP_INCHES, floor + centre, then
│   │                       migrateDocument like any load; finiteness re-checked AFTER
│   │                       the snap)
│   ├── designCheck.ts      checkDesign: overlap between SOLIDS (> TOUCH on all 3
│   │                       axes, inv 38; `faceContacts`; every violation carries
│   │                       `parts`), unsupported (a chain of FACE contacts to the floor —
│   │                       topological, unchanged), too-large, too-many, then `hangs`
│   │                       (every part off the floor HELD, inv 39 — contactsOf /
│   │                       coverage / isHeld; groundedSet is the ONE grounding walk,
│   │                       with an optional skip) and `tips` (grounded parts' volume-
│   │                       weighted centre of mass >= min(1in, s/4) inside the floor
│   │                       hull). Messages are FOR THE MODEL. Pure. The user's real
│   │                       workbench is `fixtures/simple-workbench.sloyd`.
│   │                       `worldSolids` (exported) is the ONE home of the world-solid
│   │                       mapping, spans through `spanToWorldOffset` (inv 44);
│   │                       joinery's blockers import it (fu 203)
│   └── document.ts         create / validate / migrate (inv 11); validateGuides;
│                           createGuide; `takeId`, the ONE home of the
│                           id-uniqueness rule for boards, guides and cuts
│                           (inv 33); `trueTurnsToV8` / `mirrorCutAlong`, the v7→v8
│                           step (inv 44); `validateBoard` keeps a non-blank
│                           `link` from a file below v11 only (the legacy map
│                           `linksToShapes` consumes); `validateShapes`; a
│                           ShapedBoard validated by its own fields; re-exports
│                           the rest
├── store/store.ts          Zustand, snapshot undo/redo (inv 4), gesture coalescing.
│                           `gesturing`/`gestureSnapshotTaken` are STATE, not closure
│                           variables, so `replaceDocument` clears a gesture whose
│                           component went away without closing it (fu 148) — public
│                           by necessity, private by intent: nothing subscribes, and
│                           subscribing would re-render on every gesture boundary.
│                           `tool` and the three HELD POINTS — `grabbed`
│                           (BoardSnapPoint, narrow on purpose — inv 26),
│                           `tapeAnchor`, `tapeHover` (SnapPoint, wide because either
│                           can hold a guide) — plus `tapeAxis`, which is NOT a fourth
│                           held point (it holds an enum, so it cannot go stale and
│                           must not be given clearing rules by analogy). Inv 24
│                           `selectedIds` — insertion order, no duplicates, view state,
│                           NO primary part — written ONLY through `selectionPatch`,
│                           which also carries invariant 24's retargeting rule for a
│                           set. Group actions are each one `edit()`: `deleteBoards`,
│                           `duplicateBoards` (names against the growing list, inv 8)
│                           and `updateBoards` (each part through `patchBoard`, the one
│                           per-board rule set). The singular actions delegate.
│                           `moveGroupTo` takes an ABSOLUTE min corner and rounds the
│                           group's, once (inv 42). `commitSnapMove` translates every
│                           selected part through `translateBoards`.
│                           `hiddenIds` — insertion order, no duplicates, view state,
│                           NOT saved but undone: `past`/`future` hold `HistoryEntry`
│                           = `{ doc, hiddenIds }`. The four user actions
│                           (`hideSelected`, `hideUnselected`, `showAll`, `setHidden`)
│                           all go through `applyHidden`, which never runs `edit()` and
│                           pushes an entry holding the SAME `doc`. `undo`/`redo` share
│                           `restore`, which keeps the held points when the entry's doc
│                           is the current object. `selectionPatch` drops hidden ids
│                           (inv 43)
│                           `copyInRow(ids, count, axis, sign, step)`: N−1 copies, copy k at
│                           `original + k·step·sign` (from the ORIGINAL, never the previous
│                           copy), ONE `edit()`, selects originals then copies; refuses before
│                           `edit()` on a bad count or step. It and `duplicateBoards` share
│                           the `copyBoard` helper (a fresh id, copied cuts, a name unique
│                           against the growing list), so the two cannot drift. A copy
│                           of a SHAPED part is a ShapedBoard on the same shape; a copy
│                           of a plain part is plain with fresh cut ids (inv 45). An
│                           ASSEMBLY's copy shares its definition (`shareInstance`).
│                           Components: `oneEditPerTarget` (ONE edit per storage key —
│                           two placements of one stored part must not both send one,
│                           or `applyWorldEdits` throws), `judgeHeld()` (every held
│                           point judged point-precisely after any part edit, because an
│                           edit inside a definition moves parts in EVERY copy),
│                           `makeUnique`, `selectCopies`, `reconcileHidden`.
│                           Links (inv 45): `shapeMates` exist ONLY so a posture change
│                           re-pivots every other user about its own centre; cut actions
│                           write the shape once. `linkBoards` follows `linkPlan` and
│                           points every member at one shape; `unlinkBoards` turns the
│                           selected users plain and dissolves a one-user shape.
│                           `selectLinked` writes through `selectionPatch`
│   └── assemblyPick.ts     `clickTarget`: which item a viewport click on a part selects
│                           (the outermost item below the open level; inv 46)
│                           `openPath` (the open assembly, null at the root) is view state.
│                           `selectionPatch` keeps only DIRECT CHILDREN of the open level, so
│                           a selection is always one level. Edits go through `worldParts`
│                           and `treeEdit.ts`, never a hand walk. `groupSelected` /
│                           `ungroupSelected` re-key hidden ids and the tape's held points
│                           (`rekeyHeld`), and are refused while `gesturing` (inv 43's
│                           argument). Also `openAssembly`, `closeAssembly`, `selectItem`,
│                           `clickPart`, `openPart`, `turnAssembly`, `renameItem`
│   └── selectionGesture.ts `isToggleModifier` (Shift/Ctrl/Cmd), `selectByClick`,
│                           `clearOnMiss` (no clear on a MODIFIED miss, nor outside the
│                           Select tool; inside an open assembly a plain miss moves up one
│                           level, `closeAssembly`, as Escape does — the user's ruling). In the store layer because the viewport AND
│                           the parts list share it
│   └── visibility.ts       `visibleBoards(boards, hiddenIds)`, the ONE filter for which
│                           parts are drawn and offered as points; the viewport's
│                           readers (Viewport, CameraKeys, TapeTool, moveCandidates) all
│                           use it. Returns the SAME array when nothing is hidden. Call
│                           it in a memo or handler, never a selector (inv 43). Pure
├── storage/                types.ts (StorageAdapter), browser.ts (the singleton).
│                           Inv 7; and invs 29, 30, 31 for the library
│   └── libraryIndex.ts     LAYOUT_VERSION + parseIndex / sortEntries / touchEntry /
│                           removeEntry. Versions the ARRANGEMENT OF KEYS, never a
│                           document — which is why it is separate from
│                           CURRENT_VERSION and why `parseIndex` returning null is a
│                           REFUSAL (inv 30), while a single malformed ENTRY is
│                           dropped (validateGuides' argument verbatim). Pure;
│                           imports only ./types
├── llm/                    imports nothing from the app
│   ├── types.ts            LlmClient / LlmMessage (OPAQUE, inv 37) / LlmUsage / LlmError
│   └── anthropic.ts        the Claude client: beta.messages.stream + finalMessage,
│                           structured output, adaptive thinking, effort medium,
│                           server-side fallback. JSON is parsed from text AFTER the last
│                           fallback block; the turn goes back verbatim. toLlmError
├── generate/               imports only document + llm
│   ├── prompt.ts           SYSTEM_PROMPT, STYLES, DETAIL_CAPS, user/repair messages;
│   │                       `Concept` lives HERE so prompt.ts never imports concepts.ts.
│   │                       The concept rides in the USER turn (one `Design this
│   │                       version:` line), NEVER in SYSTEM_PROMPT, which must stay a
│   │                       fixed prefix
│   ├── concepts.ts         the batch planning call (fu 164): one call sees all N, which
│   │                       is the point — a run designing alone cannot contrast with
│   │                       siblings it cannot see. Reuses userMessage. Parse is
│   │                       ALL-OR-NOTHING over the first N (never mixes planned and
│   │                       built-in). FALLBACK_CONCEPTS: Conventional / Minimal /
│   │                       Different support
│   ├── run.ts              runGeneration: MAX_REPAIRS = 3 (4 calls), append-only
│   │                       history, keeps the fewest-violation attempt (later wins a tie).
│   │                       `runRepairLoop` is the shared loop; `runJoinery` is its second
│   │                       adapter: falls back to defaults only for model-call failures
│   │                       (LlmError not auth/cancelled, RunFailed), keeps spent usage
│   │                       via `spentBefore`; blame by kind + `parts` (inv 41)
│   └── joints/             joinery for a finished design (inv 41). Imports document
│       ├── pocket.ts       pocketFor: the ONE world box -> Cut converter (inv 41);
│       │                   throws on a box removing the whole board; snaps within 1e-9
│       │                   of 0 or a board end; `across` = most boundary contact, not
│       │                   dimension order (a stopped dado read as a "notch"), then
│       │                   stores it the way the sheet reads it (`storedAsShape`, fu 195).
│       │                   Clamps in world-offset space, then `spanFromWorldOffset`
│       │                   per axis (inv 44); its pose test covers all 12 poses
│       ├── sites.ts        findSites / rangesOf. Rule 3 needs a thin panel (<= 1/2in)
│       │                   and the contact reaching the panel's edge along the
│       │                   RECEIVING part's thickness axis (a centre partition otherwise
│       │                   lost half the back)
│       ├── recipes.ts      applyJoints; re-grounds a floored design and reports it
│       │                   (`JoinResult.lowered`, fu 184). Crossings run BOTTOM-UP by
│       │                   the entering part's original min, grouped by axis, so each
│       │                   part moves once (fu 185). A rabbet's sites on one panel
│       │                   face are ONE unit, resolved from the panel's FINAL box
│       │                   (moved, then trimmed to every rabbet line; fu 182): pockets
│       │                   are cut against it, any other part in its path is trimmed
│       │                   by the intrusion (fu 201), and it CARRIES its outer-face
│       │                   chain (never its receivers; fu 183). A half-lap needs only
│       │                   to still cross in plan with R wholly below E, ALIGNS E
│       │                   (never moves it by t) and skips on a SWEPT-VOLUME overlap.
│       │                   Every blocker and trim judges SOLIDS via `worldSolids`
│       │                   (fu 203). Every refusal is decided BEFORE any mutation, and
│       │                   every `resize` is pre-checked by `cutIntoEnd` (rebaseCuts'
│       │                   throw), so an end already cut is a skip, never a throw.
│       │                   A growing part's cuts are re-stored by SHAPE first (fu 199).
│       │                   It runs on `flatDocument`; `writeBackFlat` writes the result into
│       │                   the tree, splitting definitions and shapes whose results differ
│       │                   and keeping the rest shared (inv 45, 46), and `run.ts` then runs
│       │                   `migrateDocument` on it. `runJoinery.test.ts` pins the linked case
│       │                   (identical mortises stay one shape, fu 223)
│       │                   `resize` and `cutIntoEnd` take WORLD ends and map them to the
│       │                   part's own end with `endFacing` (inv 44)
│       └── choose.ts       JOINERY_PROMPT / JOINT_SCHEMA / parseChoices / defaults;
│                           `defaultTenon` caps opposite-face tenons at down(depth/2
│                           − 1/32) (fu 190; fallback only, the prompt is unchanged);
│                           a cap under 1/2in shortens the default to >= 1/4in, else
│                           butt (fu 188). The model's range is unchanged
├── useGenerations.ts       the batch: one at a time, " — A/B/C" names, auth aborts all,
│                           post-run abort guard, writes ONLY via createProject(doc,
│                           { activate: false }) (inv 36). For N ≥ 2 it PLANS FIRST:
│                           auth or cancel during planning start no run, anything else
│                           falls back; a cancel landing AS planning resolves is caught
│                           by a check BEFORE the runs — its test asserts run CALLS,
│                           because the post-run guard would hide started runs from a
│                           nothing-was-written check
├── useJoinery.ts           the joinery run beside useGenerations: writes ONLY via
│                           createProject(doc, { activate: false }) (inv 41, 36)
├── viewport/               NO unit tests by design — driven in a real browser
│   ├── Viewport.tsx        Canvas, lights, grid, camera keys; hides Gizmo outside
│   │                       select mode, gates onPointerMissed. Plain click selects, a
│   │                       modified click toggles (`selectByClick`); a modified miss keeps
│   │                       the selection (`clearOnMiss`); `f` frames the whole selection
│   │                       and stays a no-op with none. Draws only visible parts; Home
│   │                       and the projection swap frame visible parts, and Home with
│   │                       every part hidden does nothing. The swap re-frames only once
│   │                       `controls.object === camera`: drei rebinds OrbitControls a
│   │                       render after the camera changes, and framing earlier aims the
│   │                       new camera at the origin
│   ├── BoardMesh.tsx       one board per render; ghost box when boardSolids is empty
│   │                       (inv 21). Required `selectable` prop, so the Move tool's
│   │                       commit click cannot select the board it drops onto.
│   │                       `onSelect(id, modifiers)`. Its `stopPropagation` is load-bearing:
│   │                       a toggle delivered to two solids of one board is a no-op
│   ├── MoveTool.tsx        raw pointer events on gl.domElement. Candidates are
│   │                       `moveCandidates` (pure, tested): pre-grab every SELECTED part's
│   │                       points, post-grab every UNSELECTED part's. A selected part moves
│   │                       with the grab and is never a target. Guides are POST-GRAB only — targets,
│   │                       never grab sources. Dep list is inv 15's failure mode
│   ├── moveCandidates.ts   the Move tool's two candidate sets. Pure. Takes `hiddenIds`
│   │                       (4th parameter): a hidden part offers no points in EITHER
│   │                       branch (inv 16's rule: a marker sits on something drawn)
│   ├── TapeTool.tsx        MoveTool's sibling; withholds nothing either way EXCEPT
│   │                       hidden parts, which are not drawn. LATCHES
│   │                       the hover while anchored (why inv 24 covers it).
│   │                       SUBSCRIBES to tapeAxis — a dep entry over a value nothing
│   │                       subscribes to is inv 15 in disguise. Locked with nothing
│   │                       typed draws NO line (a decision; the honest alternative is
│   │                       fu 130). A click while locked RE-ANCHORS and keeps the lock
│   ├── GuideMarkers.tsx    every guide whenever guides are shown, independent of any
│   │                       tool — a guide is document data
│   ├── SnapMarker.tsx      screen-constant, always-on-top (depthTest off). Owns the
│   │                       four off-palette colours and MARKER_PX / RING_PX /
│   │                       RESTING_PX, all browser-settled (fu 60). RESTING_PX is the
│   │                       guide-only ringless variant: guides are the only points
│   │                       drawn when nothing hovers them, so GROWTH replaces "the
│   │                       marker appeared" as the pick confirmation
│   ├── snapPick.ts         pickSnapPoint — nearest in SCREEN space, ties by depth,
│   │                       exact tie keeps first-found. Screen space rather than
│   │                       raycast-first ON PURPOSE: a corner silhouetted against
│   │                       empty space has no board under the cursor, so
│   │                       raycast-first would make the easiest corners to see the
│   │                       hardest to hit. `project` is a CALLBACK, not a camera —
│   │                       what keeps THREE out and makes it unit-testable. Pure
│   ├── pointer.ts          CLICK_DRAG_SLOP_PX, shared not copied (the fu 64 shape)
│   ├── OriginAxes.tsx      R=X G=Y(up) B=Z; dashed = negative
│   ├── gridDensity.ts      grid tier ladder (1in → 1ft → 12ft). Pure
│   ├── screenScale.ts      px-per-inch + screen-stable dash scale. Pure
│   ├── Gizmo.tsx           TransformControls, 1/16" snapping. Invs 3, 10, 25
│   │                       With 2+ selected: one proxy at the selection box's centre,
│   │                       committing through `moveGroupTo`. The single-part commit is
│   │                       untouched ON PURPOSE (inv 42). A selection change mid-drag ENDS
│   │                       the gesture and commits nothing
│   ├── gizmoScale.ts       size ceiling + grabbable floor. Pure
│   ├── extent.ts           SCENE_EXTENT, shared by Viewport and OriginAxes
│   ├── grainFaces.ts       faceGrainKinds + grainFamily; re-exports axisDimensions
│   ├── grainTiling.ts      per-face UVs, boardUVSignature. FACE_AXES carries each UV
│   │                      axis's world axis AND ITS SIGN, and boardUVs applies the
│   │                      sign BEFORE the swap (inv 35) — a whole board hides a
│   │                      reversed axis, a SOLID does not. Each span is first put in
│   │                      world-offset space by `spanToWorldOffset` per GEOMETRY axis,
│   │                      before the sign and the swap (inv 44). Invs 12, 15, 17, 35. Pure
│   ├── grainLog.ts         bandRadius (inv 14), wobble, seededRandom / hash. Pure
│   └── grainTexture.ts     seeded canvas textures, cached, never disposed
├── panels/
│   ├── DimensionField.tsx  min/max REFUSE out-of-range entry rather than clamping,
│   │                       because silently correcting a number the user just typed
│   │                       loses a measurement. Inv 5. `value: null` is MIXED: an empty
│   │                       box with a `mixed` placeholder. Every resync path formats
│   │                       through `display`. Enter commits and BLURS (fu 212); a
│   │                       refused entry keeps focus. `blurHandled` stops the blur
│   │                       re-settling an edit Escape or Enter already settled.
│   │                       Two OPTIONAL props (copy in a row): `onErrorChange`, from ONE
│   │                       effect keyed on the error, so every path that sets or clears
│   │                       it reports; `commitUnchanged`, a dirty commit calls onCommit
│   │                       even when it parses to `value` (for a value that is a default)
│   ├── NameField.tsx       commits on blur/Enter only, empty reverts; Enter blurs
│   │                       too (fu 212). Invs 5, 9
│   ├── Toolbar.tsx         project name, Add board, Cut list, undo/redo, the Select /
│   │                       Move / Tape trio, view toggles, and the "Select a part to
│   │                       move" hint. The Move button stays ENABLED — the hint
│   │                       explains the state instead of removing the control
│   ├── TapeReadout.tsx     the tape's DOM overlay. A real <input> outside the Canvas
│   │                       (not drei Html), inside `.app-shell` so the cut list's
│   │                       `inert` covers it. Owns the axis chip (the app's existing
│   │                       brass-on-graphite idiom, NOT a fifth off-palette hue) and
│   │                       the cause-carrying TapeError ('no-direction' |
│   │                       'unparseable' | 'degenerate' | null) with TWO clearing
│   │                       effects rather than one over-wide one. Invs 27, 28
│   ├── GuidesList.tsx      one row per guide, an x per row, Clear all. NO selection
│   │                       model, deliberately: a guide's marker is a known-bad hit
│   │                       target, so there is no click-the-guide path to get wrong
│   ├── ProjectMenu.tsx     the caret-triggered project list: switch, duplicate, the
│   │                       inline duplicate error (fu 159) — cause-carrying like
│   │                       TapeError, per-ROW so two rows cannot be confused, and
│   │                       cleared by ONE effect keyed on `open` rather than beside
│   │                       each of six close paths (inv 34's argument),
│   │                       two-step inline delete, + New project, Import. NOT an ARIA
│   │                       menu, decided rather than omitted — a row is a name plus
│   │                       two independent actions, which is grid-shaped, so plain
│   │                       buttons in DOM (Tab) order are the interaction and
│   │                       `aria-current` marks the open project. Its Escape and
│   │                       outside-click are bound to the menu's OWN subtree and are
│   │                       NOT inv 27's business (see design §4.1). The arm/disarm
│   │                       swap renders a <button> at the same sibling index in both
│   │                       branches, which is the only reason focus survives it —
│   │                       giving either branch a `key` silently breaks that. Rendered
│   │                       ONLY when libraryAvailable (inv 30)
│   ├── SettingsDialog.tsx  key (password field, Forget key) + model. Cut-list overlay
│   │                       pattern, not <dialog> (spec §6.2 as-built note). A NEWLY
│   │                       TYPED key is shape-checked (one run of printable ASCII, NO
│   │                       prefix rule) and then verified via the `checkKey` prop
│   │                       (App passes `checkAnthropicKey`, one free GET /v1/models):
│   │                       401/403 refuses with the API's reason; anything else saves
│   │                       with a note (fu 174)
│   ├── GenerateDialog.tsx  the form, the per-run rows, Cancel. Same overlay pattern
│   ├── JoineryDialog.tsx   Add joinery…: the sites, the run, the result. Overlay pattern
│   ├── PartsList.tsx  FileMenu.tsx   PartsList: plain click selects, a modified click
│   │                       toggles; `aria-pressed` per row. Each row is [eye][name]: the
│   │                       eye's label is "Hide <name>" / "Show <name>" (`setHidden`); a
│   │                       hidden row's name button is `disabled`. **Show all (N)**
│   │                       renders inside PartsList, under the Parts heading, only
│   │                       while something is hidden. A linked row (a shaped part) adds
│   │                       a chain icon AFTER the name button (so the button's name stays
│   │                       the part's), `role="img"`, `aria-label="Linked, N parts"`; an
│   │                       assembly row whose definition has 2+ placements adds `×N`
│   │                       (`aria-label="Shared, N copies"`, from `TreeRow.copies`). The list
│   │                       is a tree (`treeRows`); an eye is disabled under a hidden
│   │                       ancestor and on the open assembly
│   ├── CopyInRow.tsx       Copy in a row…: the inline form, local state only until Apply.
│   │                       Rendered INSIDE each Properties panel's selection-keyed root, so a
│   │                       selection change remounts it closed and reset. `rowLayout` is the one
│   │                       source of the summary, so the line shows what Apply will do; the
│   │                       measurement field is keyed on the mode. Apply is disabled while
│   │                       the field shows a refusal (`onErrorChange`, fu 218), and a typed
│   │                       Pitch/Across equal to the default sticks (`commitUnchanged`)
│   ├── Properties.tsx      2+ selected: `GroupProperties` — Length/Width/Thickness/Grain/
│   │                       Material + Duplicate/Hide others/Delete, each edit one `updateBoards`;
│   │                       `shared` compares EXACT stored values; the root is keyed on the
│   │                       selection so a change resyncs. Otherwise board fields + Cuts,
│   │                       and **Hide others** (`hideUnselected`) beside Duplicate in
│   │                       both panels; CutRow is its own component so a
│   │                       cut's error dies with the cut. Stop short of near/far
│   │                       end; a stop pair leaving no cut is refused (only on a transition INTO
│   │                       it, so a board shrink cannot lock the row), and changing
│   │                       `across` RESETS the stops. A cut stored sideways to how the
│   │                       sheet reads it shows a note + **Match the cut list** (one
│   │                       undo, `storedAsShape`; not for a tenon shoulder, a cut
│   │                       removing nothing, a default tie, or a refused re-store —
│   │                       fu 195, 198). The word comes from `cutShape`. Turn offers
│   │                       0/90/180/270 through `updateBoard` (single-part panel only).
│   │                       Links (inv 45): the group panel shows **Link** whenever
│   │                       `linkPlan` is non-null, the "will match" line when its
│   │                       `changing` is non-empty, and **Unlink** when any selected
│   │                       part is linked. A linked part's single panel shows a block
│   │                       under the name: the count, **Select linked**, **Unlink**;
│   │                       the count is a selector returning a NUMBER, not a memo
│   │                       over the boards (inv 43's selector rule)
│   │                       One assembly selected: `InstanceProperties` — name, Turn,
│   │                       Duplicate / Ungroup / Group / Hide others / Delete, Copy in a row;
│   │                       when its definition has 2+ placements, "Shared by N copies", **Select
│   │                       copies** (another copy at the open level) and **Make Unique** (by
│   │                       instance REFERENCES, inv 46). A mixed selection shows no size fields
│   ├── diagramScale.ts     fitView / bandOn (ordering-guarded). MAX_ASPECT /
│   │                       MAX_HEIGHT / MIN_WIDTH are browser-settled. Pure
│   ├── diagramLabels.ts    LABEL_SIZE / CHAR_W / labelHeight / labelWidth / packRow
│   │                       (axis-agnostic, reused verbatim for rotated columns) /
│   │                       fitLabel, whose `requireDetail` option REMOVES THE
│   │                       MIDDLE RUNG — full or index, never a bare name — for
│   │                       a caller whose detail lines carry a FACT rather than
│   │                       only numbers (fu 161). An ARGUMENT, never a search of
│   │                       the strings for the word. The arithmetic substitute
│   │                       for getComputedTextLength(), 0 under jsdom. Inv 19.
│   │                       Pure
│   ├── PartDiagram.tsx     one view as SVG. Formats NOTHING. The hatch is an SVG
│   │                       <pattern> fill — foreground content, so it survives print
│   │                       with background graphics off
│   ├── SheetLayout.tsx     one SVG per sheet; labels via fitLabel, never packRow
│   │                       (rects are already disjoint). Formats nothing. THE
│   │                       ONLY CALLER passing fitLabel's `requireDetail`, as
│   │                       `p.turned` (fu 161) — the tier decision stays in
│   │                       fitLabel, NOT as an override here, or the ladder has
│   │                       two deciders. Exports PAD so its tests size parts
│   │                       from labelWidth rather than keeping a second copy
│   └── CutList.tsx         the printable sheet, derived every render — no cached
│                           copy, so nothing can go stale. Owns Escape-to-close, takes
│                           focus on mount, owns both toggles as local view state
└── App.tsx                 layout, autosave/restore, the `.app-shell` that goes
                            `inert` behind ANY modal (`modalOpen = cutListOpen ||
                            dialog !== null`, inv 27), the `newIds` badge set, the `.viewport-stack`
                            TapeReadout positions against, `showGuides` as local
                            prop-drilled view state (it joins `shortcutsSuspended`,
                            NOT the store's `tool`). M, T, X/Y/Z, Ctrl/Cmd+A, H / Shift+H / Alt+H,
                            Escape, Delete and undo/redo all live in the ONE existing
                            keydown effect — inv 27. Plain and Shift+H match by `e.key`
                            (a code match would make Dvorak's `d` hide); only Alt+H
                            matches `e.code === 'KeyH'` (Option+H types `˙`). Ctrl/Cmd+H
                            is unbound (Cmd+H hides the browser on a Mac).
                            Delete removes every selected part.
                            Escape's ladder: grabbed → tapeAxis → tapeAnchor → tool.
                            Also owns `pending` (the autosave write, held as a
                            CAPTURED-PAIR THUNK — inv 29) and `switchToken`, the
                            one in-flight token every adopting handler bumps
                            (inv 32)
```

Deployment scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`security-headers.conf`.



### Invariants (full text, as of 2026-10-07)


Each cost real debugging. They are load-bearing, not style. **Do not renumber them** —
these numbers are cited from code comments, the specs and `docs/follow-ups.md`. The
worked examples behind several of them are in `docs/history.md`.

1. **The document is the source of truth.** No component may hold geometry state not
   derived from it, and nothing may write to a Three.js object's transform as a way of
   recording a change.
2. **`position` is the min-corner**, not the centre; `boardCenter` exists because
   Three.js meshes are centre-origin and the document is not. `reorientedPosition` is the
   only home for the reorient pivot and takes the whole patch (`Partial<Board>`), because
   a patch that also changes a dimension needs the pivot computed from *post-patch*
   extents. `grain` and `cuts` are deliberately absent from the reorient predicate —
   neither changes a board's extents, which is also why cut edits get their own store
   actions instead of going through `updateBoard`. **A snap move reaches the predicate and
   correctly fails it**: `commitSnapMove` patches `position` only, and a snap move
   translates, never turns. A future tool that both moves *and* turns in one gesture must
   carry its own `position` in the same patch, or it will be pivoted on top of its own
   translation.
3. **The `dragging` ref guard in `Gizmo.tsx`.** `TransformControls` computes motion from
   state captured at drag start; syncing the document into the proxy mid-drag makes it
   fight itself. The symptom is jitter or drift, not a crash.
4. **Gesture snapshots are lazy** — taken on the first `edit()` inside a gesture, not in
   `beginGesture()`. Eager snapshotting leaves no-op undo entries, so `Ctrl+Z` appears to
   do nothing.
5. **A field holding a local draft — `DimensionField` and `NameField` both — skips its
   adopt-external-changes effect while focused, and that effect never re-fires afterward,
   so blur must resync the display from the stored value and must not commit when the
   field was untouched.** Two failure modes if either half is missing. Commit an untouched
   field and it rewrites exact stored values with display-rounded ones (0.7" → 11/16").
   Skip the resync and the field shows a stale number *indefinitely* once an external
   change (a reorient, an undo, a gizmo drag) lands while it has focus: the effect is keyed
   on the value, so nothing re-runs it just because focus later leaves — only a remount.
   **Stored values are exact; display rounds.**

   **A MIXED field is the sharpest case (multi-select).** `DimensionField`'s `value: null`
   shows an empty box; an untouched blur there must write nothing, because a commit would set
   every selected part to one value with no sign on screen. The test for it asserts the ERROR
   state as well as the absence of a write: with the dirty guard deleted, blur commits `''`,
   which `parseLength` refuses, so "nothing written" alone survives the mutation.
6. **`add_header` does not merge across nginx levels.** A `location` block containing any
   `add_header` discards everything inherited — which is why `security-headers.conf` is
   `include`d in every block rather than set once on the server.
7. **`autoSave` must never throw.** It reports failure via `storage.available`, which
   drives the warning banner.
8. **Board names are unique, enforced in four places** — `addBoard`, `duplicateBoard`, the
   name-field commit, and `migrateDocument`. Creation-only enforcement is not enough: an
   imported or hand-edited file would violate it. `createBoard` cannot dedupe (no view of
   the document), so any new call site that adds a board must pass its name through
   `uniqueName` itself. `validateBoard` trims before the blank check, so `dedupeNames`
   never receives something that trims to `''`.

   **Restated for assemblies (inv 46): a name is unique among its SIBLINGS**, the parts AND
   assemblies of one container (a definition, or the root), checked together. Two drawers may
   each have a "Front". The enforcement points gain Group and Ungroup, and a new assembly is
   `Assembly N`, unique among its siblings. Paths are therefore unique too. That is what makes
   `flatDocument`'s display names (`Cabinet › Drawer › Front`) unique.
9. **`NameField` commits once, on blur or Enter — never per keystroke.** An emptied name
   reverts, which is only possible with a single commit: writing per keystroke and
   correcting on blur takes the gesture's undo snapshot before the correction lands,
   leaving an entry that undoes to nothing. Its `onCommit` returns the *stored* name,
   because dedup can store something other than what was typed. Without invariant 5's
   `dirty` guard, an untouched field blurring after an external rename writes stale local
   text back over it — a silent write, worse for being invisible until something reads it.
10. **The gizmo size clamp writes `size` *before* the library's `updateMatrixWorld`, never
    `handle.scale` after it.** `size` is an input to three-stdlib's scale computation, so
    the library bakes the correction itself; correcting the output lands in the re-bake
    trap invariant 3's neighbouring comment documents. The clamp is two-sided *and* has a
    floor on the cap itself (`GIZMO_MIN_CAP_INCHES`) — a board-relative ceiling alone
    shrinks the gizmo for small parts the moment they are selected.
11. **Migration steps run on raw data, before `validateBoard`, in version order.**
    `validateBoard` falls back to `0` for an unknown rotation, so a fold running after it
    turns every saved 270° board a quarter turn the wrong way — a different shape on
    screen, not a redundant one. `addPostureToV3` has the same failure mode: the posture
    fallback is `'flat'`, a perfectly legal value, so a `standing: true` board reaching the
    validator first comes out lying down — silently, and only for files that already exist.
    **Upgrade first, validate second, one version at a time.**
12. **Grain textures are cached at module level and never disposed; per-board variation
    lives in the `uv` attribute, never on the texture.** `texture.repeat`/`offset`/
    `rotation` are per-texture state on an object every board shares — writing them per
    board makes every board on screen fight over one mapping. The per-board offset is
    zeroed on any axis a `FacePlan` marks `fit`: the whole tile shows either way there, so
    an offset only shifts the seam into the middle of the face.
13. **~~`axisDimensions` had a second copy in the viewport.~~ RETIRED in v3** — now
    single-sourced in `document/geometry.ts`; the drift test was deleted, not forgotten,
    because the two things it compared are one thing. *(Number kept deliberately.)*
    Since v8 `axisDimensions` is derived from `axisFrame`, which adds direction: invariant 44.
14. **`bandRadius` is `hypot(d, k·delta)`, and the tile is seamless by two different
    mechanisms.** Because `r = hypot(d, k·delta)`, the in-plane offset `sqrt(r² − d²)` is
    exactly `k·delta` — evenly spaced whatever the cut distance `d`; a "simpler" radius
    reintroduces a seam that only shows on a wide board. That covers *u* only. *v* is
    seamless because `bandRadius` is even in `k` and the seed bucket is
    `Math.abs(k) % half`, so the pattern **folds about the pith line** rather than
    repeating. `grainTexture.ts`'s `woodCut` comment states this precisely — agree with it,
    don't restate a looser version.
15. **Anything memoising on what `boardUVs` reads must key on `boardUVSignature`, not a
    hand-written field list.** v3 added `grain` without updating `BoardMesh`'s dep array,
    so grain silently stopped turning on screen while the document stayed correct — which
    is what made it look like it worked, and no per-task review could see it (added in one
    task, consumed by the stale memo in another). Joinery added `cuts` for the same reason.
    The signature excludes `position`/`name` so dragging doesn't rebuild geometry every
    frame, and it is **identical for every solid of a board** — anything caching per solid
    must not key on it alone (`BoardMesh` builds all geometries in one memo). **A dep entry
    over a value nothing subscribes to is this same failure mode in disguise.**
16. **Edge lines come from the cell grid, not from the solids.** The remainder around a
    dado is L-shaped in section, so the canonical case leaves three abutting solids across
    a *continuous* uncut face and per-solid `EdgesGeometry` draws lines corresponding to no
    real edge. Merging cannot fix this and is not meant to. `boardEdges` tests the up-to-
    four cells around each candidate segment and draws unless the configuration is flat;
    cells outside the board count as empty, which makes the silhouette, the convex corners
    and the concave shoulders fall out of **one rule**. Contiguous drawn cells merge into
    one segment — without that, a cut anywhere fragments lines on faces it never touches.
    **The general rule: a marker or a line must sit on a feature that is actually drawn** —
    also why the volume centre is not a snap point, and why `boardSnapPoints` is filtered
    through `stockProbe`.
17. **UVs are parent-relative, and `FIT` resolves against the board, not the solid.**
    `boardUVs(board, solid)` looks a sub-box up in the *board's* tiling, so the figure runs
    continuously across a dado instead of restarting — which is what makes a cut read as
    stock removed from one board rather than two boards pushed together. `FIT` means "show
    the whole tile on this axis", and the tile belongs to the board; fitting it to the
    solid would squeeze plywood's whole ply stack into the stock a ¼" dado left.
    `FacePlan` carries `tileInches` (size, not count) precisely so `FIT` and fixed tiling
    are one division.
18. **On the cut list, dimensions collapse at display precision and cuts must match
    exactly**, and neither may be relaxed to match the other. A stock dimension rounded to
    1/16" costs nothing — two boards 0.02" apart are one board to anyone cutting them, and
    splitting the row makes the sheet lie about how much stock to buy. A *cut* rounded the
    same way costs the joint: two dados 0.02" apart are two setups, and collapsing them
    tells the user to run one. **Round what is bought, never what is machined.** This is
    not the float-`===` hazard `cutLabel` had — that compared a *subtraction result*
    against a bound, where the arithmetic introduces the error; here both sides are stored
    values, and exact comparison is correct precisely because nothing computes them on the
    way in.
19. **`LABEL_SIZE` has exactly one home, and `--font-num` on diagram text is
    load-bearing.** `LABEL_SIZE` is applied to the `<svg>` as a `fontSize` attribute;
    `styles.css` must **never** set a `font-size` on diagram text. `labelWidth`'s
    arithmetic (character count × `CHAR_W`) is only true of the size the browser actually
    renders, so a second `font-size` in CSS is a value a future edit drifts out of step
    with silently. The font-family matters identically: `--font-num` is a **monospace**
    stack, which is what makes a fixed per-glyph advance true at all. Swap it for a
    proportional face and `labelWidth` returns a number unrelated to what's drawn,
    `packRow` starts stacking labels, and **every unit test still passes** — because the
    tests assert the arithmetic, not the render.

    **The third clause, and the one a panel edit reaches first: THE MEASURED STRING AND
    THE DRAWN STRING MUST BE THE SAME STRING.** A label's full text has to be assembled
    *before* it reaches `fitLabel`/`packRow`, which means in the module that builds it —
    `nesting.ts` for a sheet part, `diagram.ts` for a view — never in the component. This
    is why `PlacedPart.dims` carries the word `turned` itself rather than `SheetLayout`
    writing `{p.turned && ' turned'}` beside it (follow-up 92): a panel-side concatenation
    measures one string and draws a longer one, which is this invariant's stated failure
    mode arriving by a different door, with the same green suite. A panel putting a bare
    literal next to measured text looks like exactly the sort of thing panels do, so the
    prohibition is worth stating rather than inferring — and it is the rule any second
    mark on a sheet label must land against, follow-up **161**'s remedy included.

    The other half of the clause is what makes it checkable: **a glyph outside the
    monospace stack breaks the advance and nothing on screen says so**, so a non-ASCII
    mark must be measured in a browser before it is trusted. Done once, and it is the
    reason a symbol was rejected for 92 — in Chromium at the applied 20px, ASCII letters,
    digits, `"` and the already-present `×` all advance 12.0345 against `CHAR_W`'s 12.4,
    an over-estimate in the safe direction (too wide costs a tier; too narrow overflows
    the box). `docs/browser-verification-turned-label.md` carries the table.
20. **`depthField.ts` shares `cuts.ts`'s split/cover skeleton but not its operation, and
    `boardSolids` is not reusable here.** `boardSolids` **drops** each cell whose centre
    falls inside any cut — a bit, in 3D. `buildDepthField` **assigns** each cell the
    maximum depth among covering cuts — a number, in 2D. It has no merge step, correctly:
    the hatch is a `patternUnits="userSpaceOnUse"` pattern, so equal-depth neighbours
    already render indistinguishably, and the one place a *count* matters is `diagram.ts`'s
    crossing-depth `Set`. Agreement is asserted by `depthField.agreement.test.ts`, not
    assumed — and that test's first version passed with the cover step broken, because it
    asserted only *coverage*. **Any future agreement test between a 2D derivation and its
    3D source must assert the value the derivation claims to compute, not just where it
    claims to differ from zero.**
21. **The empty-solids placeholder must stay a mesh, not a wireframe.** When `boardSolids`
    returns `[]`, `BoardMesh` draws a translucent ghost box at the AABB. Dropping the fill
    for just the outline silently breaks selection: `THREE.Line` raycasting registers a hit
    only within ~1" of a drawn line, leaving the whole interior dead to the pointer — the
    part looks right in every screenshot and is unclickable except near an edge. That is a
    viewport-parity rule: **a part you can see is a part you can click.** The fill is the
    hit target, the outline the legibility; keep both, and test a change here by clicking
    the **middle** of a ghost face, never its edge. `depthWrite` is off so a part with no
    stock never occludes one that has some, and the placeholder rides in the existing
    `geometries` memo — a second memo would need its own hand-written dep list, which is
    invariant 15 exactly.
22. **`nesting.ts`'s fits-test carries an epsilon, the deliberate OPPOSITE of invariant 18,
    not a relaxation.** There, both sides are stored values a user typed. Here one side *is
    computed*: `shelf.used` accumulates by addition, so the test compares a running sum
    against a bound — the shape that made `cutLabel` wrong 2.8% of the time. **Apply the
    tolerance that matches the arithmetic you actually have.** What reaches the tolerance
    is narrower than it looks, and the round's own plan got this wrong: sixteenths and
    sixty-fourths are dyadic rationals and sum exactly in IEEE 754, so a 15,298-case sweep
    came back bit-identical with and without `EPS`. It earns its keep only because
    `parseLength` also accepts decimals and millimetres (÷25.4).
23. **The shelf-height guard (`placeOn`'s `fits(f.h, shelf.h)`) is the SOLE enforcer of
    guillotine cuttability, and a self-derived test bound cannot catch its removal.** The
    whole justification for shelf packing is that every shop cut runs edge to edge, which
    holds only if a shelf never takes a part taller than the one that opened it — nothing
    in the sort order guarantees it. The obvious test (derive each shelf's band from the
    parts inside it) silently **cannot fail**, because a spilling part just grows its own
    recorded band; deleting the guard passed 19/19. The fix bounds each part against the
    **next** shelf's start, a bound the parts under test cannot move. **Any future test of
    a "cannot exceed its container" property must bound against a value the thing under
    test does not itself produce.**
24. **A held point holds a world position, so anything that moves the boards under it must
    drop it.** `grabbed.at` is a captured `[x, y, z]`, not a live reference — it is what
    `commitSnapMove` subtracts. `tapeAnchor` is the second instance (the distance and the
    typed-offset direction both derive from it) and `tapeHover` the third, which it earned
    the hard way: a hover would normally be too transient, except `TapeTool` **latches** it
    while anchored, so it can sit unreplaced across arbitrarily many edits. All three clear
    through one helper, `dropHeldIfGone`, which keeps its **guard-first shape** (return
    before any grid arithmetic when no field is relevant) — adding a field is exactly how
    that gets lost.

    Three distinct reasons a field is cleared, not interchangeable:

    - **The world moved.** `undo`, `redo`, `replaceDocument` (open/import/autosave-restore
      all route through it, and the named board may not exist in the new document at all),
      and `deleteBoard`/`updateBoard` — the last two **conditionally**, since an edit to
      another board changes nothing. `updateBoard` is live: nothing disables Properties in
      Move mode and `commitSnapMove` even selects the board it moved, so a Length edit
      typed right after a grab can relocate it out from under its own point. Committing
      after any of these applies a delta derived from a position that describes nothing —
      undoable, but not obviously wrong. **A future action that rewrites `doc.boards`
      wholesale joins this list** — that is the test, not "does it touch positions",
      because a wholesale rewrite invalidates a grab by removing its owner as easily as by
      moving it. **`undo` and `redo` clear only when the restored document is a DIFFERENT
      object** (`restore` in `store.ts`): the undo of a hide or show restores the same
      object, nothing moved, and clearing there would drop a measurement the hide itself was
      forbidden to drop. See invariant 43.
    - **The feature underneath was destroyed.** `addCut`/`updateCut`/`removeCut` — routed
      *around* `updateBoard` by invariant 2, which is why they needed their own clear and
      could be given a better one. It is **point-precise, not board-precise**:
      `dropHeldIfGone(boardId)` runs **after** the `edit()` and keeps the point iff it is
      still among that board's `snapPointsFor` output. Holding a box corner while editing a
      mid-face dado usually keeps the grab; a rabbet pulled flush with the board's end
      makes that corner stop being offered and the grab drops, by the same rule. Two things
      are easy to undo by "tidying": the comparison is exact `===` (invariant 18's reason),
      and the call must sit **after** `edit()`.
    - **The user retargeted the tool.** Only `grabbed`, because Move's grab candidates are the
      SELECTED parts' points. Every selection write — `selectBoard`, `toggleSelected`,
      `selectAll`, and `edit()`'s `selection` callback (so `addBoard`/`duplicateBoards` inherit
      it) — goes through `selectionPatch`, which drops the grab exactly when its owner leaves
      `selectedIds`. Toggling out a selected part that is NOT the owner keeps the grab, and
      that part becomes a target. `commitSnapMove` also refuses outright when
      `grabbed.owner.id` is not in `selectedIds`, before any `edit()`, deliberately leaving
      `grabbed` in hand.

    Four further rules, each load-bearing:

    - **A PROHIBITION: no selection write — `selectionPatch`, and so `selectBoard`,
      `toggleSelected`, `selectAll` and `edit()`'s selection callback — may clear
      `tapeAnchor` or `tapeHover`.** No part of the retargeting reason reaches the tape,
      which has no selected-board restriction — measuring from one board to another is most
      of what it exists for, and "measure from this board to the one I am about to add" is
      a live path through `addBoard`. Stated as a prohibition because *"add
      `tapeAnchor: null` beside every `grabbed: null`"* is exactly what a tidying pass would
      do and would look like consistency. Store tests exist to catch it.
    - **`clearGuides` clears both tape fields unconditionally**, which is right: every guide
      is going, so a guide-owned anchor is invalid and a board-owned one is cheap to drop.
      The *hover* going unconditionally is defensible **only** because the anchor is nulled
      in the same statement — no anchor, no latch. That is a property of the statements
      that do it (`setTool`, `clearGuides`, `replaceDocument`, and `undo`/`redo` through
      `restore` when the document changes), not a licence to add another.
    - **THE ASYMMETRY, a trap in both directions.** At `updateBoard` the tape fields are
      point-precise while **`grabbed` keeps a board-precise clause**, so renaming the
      grabbed board cancels the grab — deferred because it is shipped Move-tool behaviour,
      not because the argument fails to reach it. The board-precise clause fires **first**
      and pre-empts the survival test below it, so **deleting it silently converts
      `grabbed` to point-precise**, and **adding one for either tape field silently
      re-breaks the rename case** — caught only by the "keeps" tests, never the "drops"
      ones.
    - **The enumeration lives in ONE place** — `tapeHover`'s declaration in `store.ts`.
      Point at it; do not restate a count anywhere else, which is how a comment went stale
      once already.
25. **The snap move is deliberately NOT rounded to `SNAP_INCHES`, the exact opposite of
    what `Gizmo.tsx` does — both correct.** The gizmo snaps because a free drag lands on
    arbitrary numbers. A snap move's entire purpose is the *exact* coincidence of two
    points: if both boards already sit on 1/16" boundaries the delta is exact and a snap is
    a no-op, so the only case where rounding does anything is the case where it silently
    breaks the result the user just asked for — by a sixteenth, with the display rounding
    to the same string either way (invariant 5) so nothing on screen shows it. **The rule:
    round what a free drag produced; touch nothing that is already an exact position or a
    difference of two of them.** Compare invariant 22, the same argument in the other
    direction. This covers three more operations: a click-placed guide (`hit.at`), a
    ray-typed guide (`offsetPoint`), and — the one easiest to think you've already
    satisfied — an **axis-placed** guide, which *looks* like it should land on the grid
    because a person typing `3` along Y from an on-grid corner does. Verified rather than
    argued: `0.01` along X from `x = 5` reads back out of `localStorage` as exactly `5.01`.
    **A row of copies is a fifth** (`copyInRow`): the step comes from typed values (gap,
    pitch, or span) and is never rounded, and copy k is computed from the ORIGINAL as
    `position + k·step·sign`, never from the previous copy, because a running sum drifts by an
    ulp per copy.
26. **`grabbed` is a `BoardSnapPoint`, and that is what makes eight reads correct.** The
    guide-points round widened `SnapOwner` with a `{ type: 'guide' }` member, and that edit
    is silent by construction: both members carry an `id: string`, so every `owner.id` read
    keeps typechecking while quietly meaning something else. Eight reads in `store.ts`
    assume it names a **board** (enumerated in the guide-points design §3 and pointed at
    from `grabbed`'s declaration — do not restate the list). Seven are correct only *by
    accident*, because a guide can never reach `grabbed` — an accident holding solely via a
    filter two modules away in `MoveTool`. **A comment cannot enforce that; a type can.**
    So the three providers are annotated `BoardSnapPoint[]`, `pickSnapPoint` is generic in
    the candidate type, and `grabbed`/`grabSnapPoint` take the narrow type.

    The consequence that reads as a gap and is the win: **the "a guide-owned grab must be
    declined" store test was deleted, because that state cannot be constructed in
    TypeScript at all.** Do **not** add a runtime `if (grabbed.owner.type !== 'board')`
    guard to `commitSnapMove` to make it writable again. One runtime narrowing on that path
    *does* survive and is not vestigial: the self-snap guard tests
    `target.owner.type === 'board'` before comparing ids, because the *target* genuinely
    can be a guide, and without it a guide whose id collided with the grabbed board's would
    read as a self-snap.

    The price of the wide type, before adding a fourth held field: `tapeAnchor`/`tapeHover`
    are `SnapPoint` on purpose — **the difference between them and `grabbed` IS the
    documentation of which can hold a guide** — and they pay in five runtime `owner.type`
    tests. `pickSnapPoint`'s generic is currently **unrealized** (both call sites pass a
    union), and `MoveTool` still narrows at entry via `isBoardOwned`, a written-out type
    predicate — narrowing the *property* inline does not narrow the *value*.
27. **Every window-level shortcut goes into `App`'s ONE existing keydown effect, and any
    new `window` listener must take the modal-open flag explicitly.** *(Since the Generate
    round the flag is `modalOpen = cutListOpen || dialog !== null`. Read every
    `cutListOpen` below as `modalOpen`; the reasoning is unchanged. A dialog's real
    exposure is focus on the sheet or a button, not typing, which `isTextEntry` already
    covers. That is spec §6.4 as corrected.)* While the cut list
    is open the rest of the app carries `inert`, removing the subtree from the tab order,
    hit-testing and the a11y tree in one attribute — the failure mode being *silently
    editing the document while reading a sheet that shows no selection*, since `NameField`,
    the project-name field and every `DimensionField` commit on change or blur. But `inert`
    **cannot touch a `window` listener**, which never sees which subtree an event came
    from. So `App`'s effect early-returns on `cutListOpen`, and `Viewport` takes it as the
    `shortcutsSuspended` prop for `f`/`Home` — without which `f` re-frames the camera
    invisibly and hands back a moved view.

    The effect's guards are the reason to join it rather than mere tidiness. `cutListOpen`
    means nothing arms a tool or seeds a distance box behind a sheet, and Escape closes the
    sheet while leaving a grab behind it untouched — behaviour a second listener would have
    to re-derive and could drift from. `isTextEntry` at the top is *why only the first
    character of a typed length needs capturing*: once the input has focus, every later
    keystroke matches that guard and reaches the field directly. **That same guard is why
    `TapeReadout` needs its own X/Y/Z branch beside Escape's — forced, not redundant, since
    `App`'s listener never sees another key once the box has focus.** One spelling detail
    is load-bearing there: the modifier test is part of the *condition*, not an early
    `return` like `M`'s and `T`'s, because `Ctrl+Z` is `e.key === 'z'` and a returning
    guard would swallow undo.

    `shortcutsSuspended` and `showGuides` are prop-drilled local view state while
    `tool`/`grabbed` are in the store — one rule applied to three fan-outs, not a
    contradiction. `tool` has four consumers at three depths; a single flag with one
    consumer does not earn shared state.
28. **`TapeReadout` must stay unconditionally mounted.** `tapeTyped`'s anchor-loss clear is
    owned by an effect inside it — the right home, and a coupling. It renders nothing
    without an anchor, so hiding it behind `tool === 'tape'` looks free; it is not. Since
    the typed capture **appends** rather than replaces, breaking the mount turns the
    consequence from a cosmetic flicker into a silently wrong placement. The append is
    load-bearing too: a pointerdown on the canvas blurs the input while the anchor lives,
    so the tool's central gesture is *type `1`, orbit to see the face, type `2`* — and
    replacing would answer `2` while the box read `1` the whole way round. **The displayed
    text and the next keystroke's effect must not disagree.**
29. **The active project id is an EXPLICIT ARGUMENT to `autoSave(id, doc)`, never adapter
    state — and the mechanism is not the one the plan claimed.** If the id lived inside the
    adapter, a debounce armed while project A was open would fire after a switch and write
    **A's document into B's slot**: no error, no visual difference, B's work gone on the next
    read. The signature is what stops it, because a future edit that drops the id has to
    delete an argument rather than merely forget an ordering.

    **State the protection precisely; the plan got this wrong and mutation testing corrected
    it.** What makes the race unreachable is the id being **captured in the same effect
    closure as `doc`**, plus **`doc` changing on every switch** — so the effect's existing
    cleanup clears the pending timer before the new one arms. With `[doc]` alone the race
    test still passes; the dep entry is belt-and-braces *for the race*.

    **But `activeId`'s dep-array entry is genuinely load-bearing for a different reason, and
    a reader who deletes it because "the race doesn't need it" will break autosave
    silently.** There is exactly one path where `activeId` changes and `doc` does **not** —
    the restore effect's edit-wins branch, which adopts `activeId` while keeping the user's
    in-progress document. Drop the entry and that adoption never re-runs the effect: the
    `!activeId` guard then kills **every save for the rest of the session**, while
    `SaveIndicator` goes on reading *Saved locally*. **Do not remove it, and do not
    re-justify it with the race.**

    **A third thing, and the one a tidying pass reaches for: the cleanup CANCELS the
    outgoing write, so every switch must FLUSH it first.** Cancelling closed the race and
    nobody asked whether the write ever happened — it did not, and the outgoing project's
    last ≤600 ms of edits were discarded on every switch, the central gesture of the
    library. So `App` holds the pending write as **ONE record** and every switch handler
    awaits `flushAutoSave()` before `setActiveId`/`replaceDocument`.
    **A PROHIBITION: do not split that record into separate refs, and do not read `activeId`
    back off state inside the flush** — holding the pair together is what makes the crossing
    race *structural* rather than timed, since every flush path then writes a matched pair
    whatever it reads. Two refs can be updated a render apart, and the failure is A's
    document in B's slot, silently. The detail lives in `App.tsx`'s comment on `pending`;
    point at it rather than restating it.

    **The record is `{ write, timer }`, NOT `{ id, doc, timer }`, and that is the prohibition
    being enforced rather than restated (follow-up 158).** `write` is a thunk built inside the
    autosave effect — the one scope where `activeId` and `doc` are each other's counterpart,
    because the effect reran for exactly those two values, so there is no argument to pass and
    none to swap. The flush holds no id and no document, so the forbidden line
    `storage.autoSave(activeId, p.doc)` does not compile. Before this it did, and passed all 51
    `App.test.tsx` tests. **Do not "restore inspectability" by putting the id or the document
    back on the record** — reading either one back is exactly how the mismatch becomes writable
    again.
30. **`sloyd.autosave.v1` is never deleted and never written after adoption, and adoption
    fires on exactly ONE condition: the index key is ABSENT.** That key *is* the user's
    project on a pre-library build, Sloyd has no server-side state, and there is nothing to
    restore from — so it costs a few kilobytes and it is this round's entire rollback story.
    Deleting it to be tidy converts a free rollback into an unrecoverable one, which is why
    `browser.ts` carries a comment saying so at the point where deleting it would be natural.

    **Absence is tested on the RAW `getItem` result, before any `JSON.parse`.** A
    present-but-unusable index — corrupt JSON, an empty string, or an unrecognised `layout`,
    in particular a **newer** one — must never be treated as an absent one. Treating it as
    absent silently clobbers real project data with a fresh single-entry index built from the
    now-stale legacy document. So it **refuses and writes nothing**, degrading to a genuinely
    read-only legacy session with `available === false` and the storage banner showing (not a
    session that claims to save and doesn't, and not one that resumes writing to the stale
    legacy key). **The reasoning, which is the part to carry forward: the document layer
    already refuses a `version` it does not understand rather than guessing at it — that is
    what the v6 bump bought — and the storage layer owes exactly the same refusal to a
    `layout` it does not understand.** Adoption is retried on the next boot for free, since
    the absent index is the only thing that triggers it.

    Two neighbouring branches are **not** adoption and must not become it: an index that
    parses but whose `activeId` names a missing project falls back to another loadable
    project, and one with `projects: []` creates a fresh `Untitled`. Both refuse to re-adopt,
    for one reason — an index exists, so adoption already happened, and the legacy document
    is stale **by definition**.
31. **Write the project key, verify it reads back, THEN commit the index — and that ordering
    lives in exactly ONE private primitive (`writeVerifiedProject`) that every writer which
    commits a NEW index row calls.** An index row pointing at a key that never landed is a
    project the list offers and cannot open. The narrowing is exact, not hedging: `autoSave`
    is a writer and does **not** call it, because it overwrites a key an existing row already
    names and adds no row at all. What it owes instead is the mirror rule — **`autoSave`
    REFUSES an id with no index row**, since `touchEntry` only ever updates a row that already
    exists, so writing would leave a project key nothing lists while the succeeding index
    write flipped `available` back to `true` and the indicator went on reading *Saved locally*.
    That is the same gap as this invariant's, seen from the other side: a row without a key
    versus a key without a row. Refusing is not throwing, so invariant 7 is intact. The ordering had grown **two** homes (`adopt`, `addUntitledProject`) and was on its
    way to a third (`createProject`) before it was collapsed: a safety rule written out three
    times is a rule that holds in two places after the next edit.

    **A passing test cannot prove this one, and the round has the receipt:** a reviewer
    rewrote `adopt` to commit the index *first* and deleted the round-trip check, and 22/22
    still passed. What covers it is a storage double that **accepts writes but drops
    `sloyd.project.*` on read**, asserting the index key stays null — the bound comes from
    outside the code under test, invariant 23's rule applied to an ordering instead of a
    container.

    The same seam carries the other half: **every mutating operation reads the index through
    `readIndexForWrite` and refuses when it is unusable**, writing nothing and reporting
    `available = false`. Reads may keep degrading gracefully (`listProjects` returns `[]`);
    mutations may not. This is enforced **at the seam**, not by a convention that every caller
    checks `libraryAvailable` first — a convention that has to hold in `App.tsx` to protect
    `localStorage` is not a seam. `deleteProject` refuses **before touching the project key
    itself**: a partial delete (key gone, corrupt index left alone) is worse than no delete.
32. **Every handler that adopts a new active project bumps ONE shared in-flight token, and
    the rule is: THE LAST HANDLER TO START OWNS THE OUTCOME.** All four — `openProject`,
    `onNewProject`, `onDeleteProject`, `importIntoLibrary` — are async before they mutate, so
    two can be out at once (click a row, reopen the caret, pick another; or pick New while the
    first load is still in flight). No wrong-slot write is possible, because every write is a
    matched pair by invariant 29; the casualty is quieter, which is why it shipped — the
    **persisted** `activeId` ends on the project the user did not finish on, and the next boot
    opens it.

    Three parts, none of them optional:

    - **One token, not four guards.** Each handler bumps `switchToken` on entry and re-reads it
      after its awaits; one that finds it moved abandons its adoption. Four separate guards
      would each have to re-derive the sentence above, and the one that shipped got it wrong —
      `openProject`'s boolean re-entry guard **declined** the second click, which ends the
      session on the row the user did *not* click last. Do not reintroduce a decline.
    - **The token check must sit on the same side as the write that moves the persisted id.**
      This is why `onNewProject` and `importIntoLibrary` pass
      `createProject(doc, { activate: false })` and call `setActiveProject` themselves *after*
      the check. Letting the adapter activate what it writes puts the persisted move **before**
      the check, so a superseded handler leaves the persisted id on a document nobody is
      looking at — this invariant's own casualty, surviving its own fix. `browser.ts` had
      already ruled this way for `duplicateProject`; these are the next callers it warned about.
    - **`onDeleteProject` is the documented exception, not an oversight.** Its index write is
      intrinsic — the project is gone and the adapter must name a replacement in the same write
      — so its token check covers adoption only. Bounded by the replacement always being
      loadable and by `autoSave` refusing an id the index does not name. Follow-up 160 filed
      that residue and **closed it without a source change**: the id-argument it named cannot
      work (the handler captures `activeId` before its awaits, so it names the project being
      deleted), and the residue is unreachable here anyway because **every index write in
      `deleteProject` lands in the same synchronous run as its index read** — now a stated
      prohibition on the method plus two tests that call it WITHOUT awaiting it. The general
      form: an adapter with real async I/O owes atomic read-modify-write on the index, which
      every index writer needs, not just this one.

    The bump sits **before** `openProject`'s `id === activeId` early return, so last-click-wins
    holds uniformly: clicking the open row while a switch is out means "stay here". **Mutate
    any test of this** — a supersede guard is a refusal, the shape invariants 23 and 31 and
    follow-up 155 all say admits a test that observes the end state and cannot see the skipped
    step.

33. **A duplicate id is repaired on LOAD, by one helper, and the FIRST occurrence keeps its
    id.** `takeId(raw, seen)` in `document.ts` is the only place that decides what id a
    board, guide or cut gets. Before it, `validateBoard` minted an id only when one was
    **missing**, so two boards both arriving as `id: 'a'` both kept it — and that is not
    cosmetic: `buildNesting`'s tiebreak (`a.id.localeCompare(b.id)`) needs a total order or
    the sheet layout can reorder between renders, `SheetLayout` keys its groups by board id,
    and a duplicate guide id makes `removeGuide` delete two rows at once. Reachable through
    Import, which is the only door a hand-edited or badly-merged file comes through.

    Four things about it, each of which a reasonable edit gets wrong:

    - **Re-mint the LATER one, never all of them.** Re-minting every id satisfies every
      distinctness assertion equally well and quietly rewrites the ids in every file that was
      already correct. The tests pin the survivor by its literal fixture value for this
      reason, not just the set's size.
    - **`seen.add` lives inside `takeId`.** A call site that forgets it turns the rule into a
      no-op — every id looks unseen — and no test of that call site's own behaviour notices.
    - **Cut ids are scoped PER BOARD, board and guide ids per document.** `Properties.tsx`
      keys `CutRow` by cut id within one board and the store looks a cut up by
      `(boardId, cutId)`, so two boards may each carry a cut called `c1` and neither is wrong.
      Widening cut ids to one document-wide set is a silent behaviour change. **Since v11 a
      Shape's cut ids are scoped to the shape** (its users read one set), and the v10→v11
      migration compares link members' cuts BY ID: a document-wide set would have re-minted
      later members' cut ids and left them unlinked.
    - **A guide with NO id is still dropped, not minted.** `validateGuides`' existing rule is
      untouched: missing is malformed data, a duplicate is a good guide wearing a taken label.

    **What makes re-minting safe is a property of the schema, not a coincidence:** nothing
    inside a document references a board or guide id. `Board.cuts` is inline, `GuidePoint` is
    `{ id, at }`, and every id lookup in the app reads runtime state set after a load
    (`selectedId`, `grabbed.owner.id`, the `find` calls in the store and viewport). **A future
    field that points at a board BY ID breaks this**, and would make the repair a two-pass
    rewrite rather than a single expression. `Instance.definition` and `ShapedBoard.shape` do
    point at ids, but at DEFINITION and SHAPE ids, which are resolved by dropping, never
    re-minting (the assemblies and v11 bullets below), so no reference is ever rewritten.

    Threaded as one `seen` set through `rawBoards.map`, **not** a `dedupeIds` pass beside
    `dedupeNames` — a name needs a replacement computed *from* its siblings and so cannot be
    decided one at a time, while an id needs nothing from them but "is this taken". A second
    pass would leave two deciders for one field. And unlike invariant 8's four-place
    enforcement, this needs no creation-time half: `nextId` is a monotonic counter and Import
    replaces a document rather than merging into one, so load is the only place ids collide.

    **Restated for assemblies (inv 46).**
    - **Part and instance ids are unique WITHIN their container** (a definition, or the root),
      checked together in one `seen` set.
    - **Definition ids are unique across the document.**
    - **Cut ids stay per board.**
    - So every occurrence path (`i1/i2/b3`) is unique.
    - **`/` is reserved:** `takeId` re-mints a part or instance id containing it.
    - **The one thing in a document that points at an id is `Instance.definition`.** A
      duplicate DEFINITION id is resolved by DROPPING the later definition, never by re-minting
      it, so no reference ever needs rewriting. The single-pass repair above still holds.
      Round 2 (shared definitions) needs exactly this scope.
    - **Since v11: shape ids are unique document-wide**, and the first keeps its id. A malformed
      shape claims no id. A shaped part's `shape` is the second thing in a document that points
      at an id, and it too is resolved by DROPPING: a duplicate shape is dropped, and a part
      naming a missing shape is dropped (`dropUnresolved`). Nothing is ever re-minted, so no
      reference is rewritten. A shape's cut ids are scoped to the shape, which is why its users
      share them. A definition id of literally `ROOT` is dropped, because that is the
      write-back's root storage id.


34. **The gesture flags are STATE so that `replaceDocument` can reach them, and that is the
    ONLY place they are reset — and NOTHING may subscribe to them.** `gesturing` and
    `gestureSnapshotTaken` were `let` bindings in the store factory's closure, which meant a
    component unmounting **while a gesture was open** (ordinary in RTL, where `cleanup()`
    tears the tree down and jsdom fires no blur; reachable in the browser wherever a focused
    field is removed rather than blurred) left `gesturing` true for the rest of the session.
    Invariant 4's lazy snapshot then skips every undo snapshot from that point on — no error,
    just missing undo entries in code that never opened a gesture, which reads as a defect in
    whatever runs next. They are fields now, so the one action that already rewrites
    everything which must not outlive a document clears them too.

    Three parts, and the last two are prohibitions:

    - **In the state is what makes a clearing rule enumerable.** A flag reset by convention
      at every call site is the shape invariant 24 had to write out; the reason those rules
      can be enumerated at all is that they are in the state. `Gizmo.tsx`'s two mid-drag
      `endGesture` effects stay the primary guard regardless — nothing about a mid-drag
      unmount implies a document is about to be replaced.
    - **A PROHIBITION: they must NOT join the `grabbed: null` list in `undo`/`redo`** (one
      list now, in `restore`, which both share).
      Invariant 24's own trap, one field over: it is exactly what a tidying pass does and it
      looks like consistency. A gesture belongs to the component that opened it and an undo
      does not end it, so clearing them there splits one focused field's gesture in half
      after a Ctrl+Z — a behaviour change with no defect behind it. A pointer sits on
      `restore`.
    - **A PROHIBITION: no component may read either field.** They are public by necessity
      and private by intent. The whole cost argument for the move is that every `useStore`
      call site passes a selector returning a bare field or a single element reference — no
      object or array literals, which re-render on every `set()` regardless — so the one
      `set()` per gesture boundary (focus, blur, gizmo mousedown and mouseup, never per
      frame) re-renders nothing. A single `useStore((s) => s.gesturing)` for an "editing…"
      indicator puts a re-render on every gesture boundary and quietly costs what the check
      bought.

    **The test for any of this asserts an UNDO ENTRY, never a flag value.**
    `expect(gesturing).toBe(false)` after `replaceDocument` cannot fail — the field
    initialises false, so it passes with the reset deleted (follow-up 155's shape). Leave a
    gesture open, replace the document, edit, assert `past` grew. Two related mutations
    survive and are recorded rather than chased: `gestureSnapshotTaken: false` in
    `replaceDocument` is symmetry with `endGesture`, not coverage, and `takeSnapshot =
    gesturing` could be `= true` — both unobservable because `!gesturing` short-circuits the
    snapshot test and `beginGesture` clears the flag anyway.


35. **`FACE_AXES` carries each UV axis's SIGN, and the flip is applied BEFORE the swap.** The
    table records which world axis each of `BoxGeometry`'s default UV axes runs along; it used
    to discard which *way*, on a stated argument — *"signs are irrelevant, grain is
    mirror-symmetric"* — that is true of a whole board and false of a solid. `boardUVs` looks
    a **solid** up in the **board's** tiling (invariant 17), so a solid's span is a sub-range,
    and reversing the axis puts that sub-range on the wrong side of the face. Two solids
    meeting at a split plane then disagree about the coordinate there: a 3/4" plywood panel
    with a 1/4" dado handed **v = 0 from one side and v = 1 from the other**, butting the
    outermost ply against the innermost — one double-width light band mid-stack and a part-ply
    at each edge.

    Four parts, each of which a reasonable edit gets wrong:

    - **THE FLIP MUST HAPPEN BEFORE THE SWAP.** A sign belongs to the pair (face, *geometry*
      axis), which is the same thing as the drawn u/v **only when `swap` is false**. Flipping
      after the swap applies `+X`'s u sign to the drawn v — precisely the upright faces the
      defect showed on. It is the plausible wrong version, it is what a tidying pass reaches
      for, and no uv-range assertion notices it (mutated: it reds four tests, all of them
      new).
    - **The sign lives IN `FACE_AXES`, not in a parallel table.** A second thing indexed by
      face that has to agree with the first is invariant 13's shape, promoted before it can
      drift.
    - **THREE OF TWELVE AXES RUN BACKWARDS** — `+X`'s u, `+Y`'s v, `-Z`'s u — and that table
      belongs to three.js, not to us. It is read back off a real `BoxGeometry` by a test, so a
      library bump fails there rather than silently un-fixing this. Do not hardcode it from
      memory.
    - **Why it hid for so long, which is the test lesson:** an uncut board shows the whole tile
      either way, solid wood's figure is near-random so a mirror reads as a different board,
      MDF has no structure, and plywood's edge is the ONE texture where position within the
      tile means something. **Every uv assertion in `grainTiling.test.ts` was blind to it, and
      so was a 48-case sweep written during the diagnosis**, because all of them assert a
      *scale* (`tileInches`, min, max) and the defect was a *direction* — `[0,1]` reversed has
      the same span. **A test that reads only the extremes of a mapping cannot see the
      mapping.** What catches it is one interior number: `uv - position / tileInches` is
      `boardUVs`' additive constant, so it must be identical for every vertex of every solid of
      a board. Varying *within* a face means a reversed axis; differing *between* solids means
      a misplaced sub-range.


36. **Generation never adopts a project.** `useGenerations` writes through
    `createProject(doc, { activate: false })` and NOTHING else: no `switchToken` bump, no
    `replaceDocument`, no store action. Opening a generated design goes through
    `openProject` like any other row. Two things depend on it. The user is never pulled out
    of the project they are editing by a run that finishes in the background. And
    invariant 32's race stays closed, because a handler that does not adopt cannot be
    superseded. It is also **the whole reason Generate could be exercised against
    production**: it adds rows and writes into nothing that exists. A future "open it when
    done" convenience must call `openProject`, not adopt inline.

37. **The generation history is append-only, and `LlmMessage` is `unknown` so it stays
    that way.** A repair round sends every earlier turn back **verbatim**, including the
    assistant turn exactly as the API returned it: thinking blocks, fallback blocks and
    all. Editing a past turn breaks thinking-block validation and any prompt-cache prefix.
    The client parses the design from text after the last fallback block but **returns
    the untouched turn** for the history. Do not "clean up" the stored turn to just the
    JSON. The type is opaque so that the code outside `llm/` cannot read into a turn and
    therefore cannot rewrite one. A test pins the appended turn **by identity**.

38. **`overlap` is measured between SOLIDS, and so are the contacts `hangs` reads.**
    `worldSolids` (designCheck.ts, exported, the ONE home of this mapping) maps each part's
    `boardSolids` to world space with invariant 2's mapping, never `solidWorldBox`
    (centre-relative). Two parts overlap when
    any of their solids share more than `TOUCH` = 1/32 on all three axes, so a cut explains
    an overlap by removing the stock, and a tenon seated in its mortise is not one. A design
    with no cuts has one solid per part, equal to its box, so Generate is unchanged.
    **The contacts `hangs` reads are ALSO computed between solids** (`solidContactsOf`,
    aggregated per part): a seated tenon's box interpenetrates the leg's box, so box contacts
    would report every mortise-and-tenon rail as hanging. **So do joinery's blockers, trims
    and pass-through test** (`recipes.ts`, via `worldSolids`; fu 203): a pre-cut design is
    never refused for stock a cut removed. Only `checkDesign`'s grounding (`connected`),
    `tips` and `faceContacts` (sites) stay box-based. Do not raise `TOUCH` to make joints
    pass, and do not drop the check.

39. **Support means HELD, not touching: every part off the floor must be held, and the piece
    must not tip.** `unsupported` (the old rule) only asks whether a part connects to the
    floor through face contacts, in any direction, so a shelf hanging by four corner patches
    under its rails passed it. That is the user's real workbench, now a test fixture.
    `hangs` asks whether each part is held, in one of three ways:

    - **(a) Resting:** a face contact on its bottom.
    - **(b) Between:** both faces of the X or the Z pair covered **≥ 50%**.
    - **(c) Lapped:** a face contact on a broad face (normal to its smallest extent; ties
      all count). A contact on its **top** counts only when the part above is on the floor,
      or **still reaches the floor with this part removed** AND is held by its other
      contacts (one level; inside that test a top contact never counts).

    `tips` requires the **grounded** parts' volume-weighted centre of mass to sit at least
    min(1in, s/4) inside the convex hull of what touches the floor.

    Five things a reasonable edit gets wrong, each from a measured case:

    - **COVERAGE, not two-sidedness, is what catches the workbench shelf.** Legs touch BOTH
      of its ends, so "held between two parts" passes it; it fails because each end is only
      19% covered.
    - **(c) exists so face-mounted parts pass.** A backrest or an apron screwed to a post's
      face has nothing under it and nothing opposite it. Without (c), ordinary designs fail
      and spend the user's money on repair rounds for nothing.
    - **The top-face clause is three user rulings deep, and each closed a hole a reviewer
      PROVED by probe:**
      1. A crate set on the hanging shelf "held" it, so the top face was excluded.
      2. That failed cleats under a seat, so it counts again when the part above is held
         without this part.
      3. A box, or two lapped uprights, standing on the shelf then held each other, so the
         part above must also still reach the floor without this part.

      **A PROHIBITION: do not drop (c), the coverage threshold, or either half of the
      top-face clause to "simplify".** Each one exists because removing it was shown, by
      construction, to pass a hanging part or fail a sound one.
    - **One fault, one report.** A part on the floor, already `unsupported`, or named in an
      `overlap` is never also `hangs`; a floating part adds no weight to `tips`. Contact and
      overlap are disjoint **by definition** (coincident face planes mean a shared span ≤
      TOUCH on that axis), so overlap can never hold anything.
    - **`groundedSet` is the ONE grounding walk**, shared by `unsupported` and the top-face
      clause, with an optional skip. A second walk is two deciders for one question.

    **Known limits are follow-up 176.** The main one is mutual lapping: two parts glued face
    to face each "hold" the other. Read it before tightening anything.

40. **Anything that decides "same cut" from a list of `Cut`'s fields must be checked against
    the type by the compiler.** Two readers did when this was written: `cutSignature`, which
    groups cut-list rows, and `boardUVSignature`, which is BoardMesh's memo key. The linking
    round added a third, `sameShared` (`links.ts`, invariant 45), which compares cuts through
    `CUT_GEOMETRY_KEYS` plus the id. Both were hand-written field lists.
    Adding `stopMin`/`stopMax` to `Cut` without adding them to the first would have grouped a
    mortised leg with a through-dadoed one: one row, one setup, half the legs cut wrong, and
    every existing test green. So `CUT_GEOMETRY_FIELDS` (in `cuts.ts`) is a table that
    `satisfies Record<Exclude<keyof Cut, 'id'>, true>`, every reader derives from it, and a new
    `Cut` field fails `tsc` until it is listed. This is invariant 15 one layer over: a
    hand-written list of what a computation reads goes stale silently. The second reader was
    missed when the table was first written, and the 3D view kept drawing a through-dado after
    a stop edit — found by the whole-branch review, which is why the table now lives in
    `cuts.ts` beside `Cut`'s geometry rather than in the cut list. **Do not replace the table
    with a list in a function body**, and do not add a field to the table's exclusions without
    a written reason.

    **Since the components round**, `sameShared` decides which v10 link members become one shape
    (cut ids included), and joinery's write-back compares cuts by geometry through
    `CUT_GEOMETRY_KEYS` (ids excluded). Both derive from the table.

    **The table decides which FIELDS make two cuts the same; `cutsThatRemoveStock` decides
    which CUTS are compared at all** (follow-up 178). A cut a board edit has left removing
    nothing is left out of `cutSignature`, so it cannot split a row. The consequence that
    reads like a bug and is not: the row key now depends on each board's EXACT dimensions
    through that test, not only the display-rounded ones. A 10" board and a 10.02" board each
    carrying a dado at offset 10.01 split into two rows that print the same size — correctly,
    because one of them really has a sliver cut and the other has none. That is invariant
    18's rule (round what is bought, never what is machined). Do not "fix" it by rounding.

41. **Joinery has one converter, never adopts, and is blamed only for what it caused.**
    `pocketFor` (`generate/joints/pocket.ts`) is the ONLY place a world box becomes a `Cut`; it
    is tested by probing every pose against the box itself, never against hand-written cuts,
    because a pose mistake there is a plausible cut in the wrong place. It throws on a box
    that removes the whole board, snaps within 1e-9 of 0 or a board end, and takes `across`
    as the dimension with the most boundary contact (order alone mislabelled a stopped dado
    a "notch"). That choice is then re-stored through `storedAsShape`, against the board WITH
    its existing cuts, so a joined cut's stored `across` is the direction the cut sheet prints
    (fu 195). The re-stored cut removes the same stock: its boundaries are reproduced to the
    bit wherever the schema can express them, and otherwise (millimetre values: a far stop under
    half the board's dimension, or rarely a width's far end) land within one ulp, on the side
    that keeps the run.
    A re-store the sheet would read differently (word, run, position axis, which ends are
    stopped) is refused: `storedAsShape` returns the original, and Properties offers nothing.
    A later growth through `rebaseCuts` now follows the shape, not the stored form
    (follow-up 199, closed). `useJoinery` writes only through `createProject(doc, { activate: false })` —
    invariant 36 extended. And only problems the joinery INTRODUCED drive repairs:
    `runJoinery` checks the original and the joined design and compares problems by `kind`
    plus their `parts` names (the field exists for this), NEVER by message text, which
    carries coordinates that the joinery itself changes. A hand-made design's existing
    faults are reported once as "already in the original", not repaired at the user's
    expense. **A recipe's refusal is decided before ANY mutation** (trim, move, carry, cut):
    a site skipped after it had started leaves a half-joined part that the sheet and the
    checks then misreport (fu 183, 185). A throw is not a refusal either: every `resize`
    asks `cutIntoEnd` (rebaseCuts' throwing condition) first (fu 203).

42. **A group move rounds the GROUP's min corner once and adds ONE delta to every part; the
    single-part gizmo path stays separate.** `moveGroupTo` takes the ABSOLUTE wanted min
    corner (TransformControls fires every frame, so a delta would accumulate), rounds it to
    `SNAP_INCHES`, subtracts the group's current min, and hands that one delta to
    `translateBoards` — the same helper `commitSnapMove` uses, unrounded there. Rounding each
    part's corner instead pulls an off-grid part onto the grid and breaks the layout by up to
    a sixteenth, with the display rounding to the same string (invariant 25's argument, one
    level up). And one selected part does NOT go through `moveGroupTo`: `old + (snap(t) - old)`
    is not bit-identical to `snap(t)` for a non-dyadic `old`, so routing it there would change
    shipped single-part behaviour invisibly. **Do not "unify" the two paths**, and do not
    round inside `translateBoards`.

    The selection has ONE writer for a user's selection change, `selectionPatch`; a second
    place that assigns `selectedIds` there is a second decider for invariant 24's grab rule.
    (`replaceDocument`, `undo` and `redo` only reconcile it with a document that replaced the
    boards; `undo`/`redo` and the hide actions still write it THROUGH `selectionPatch`, with
    the new hidden set, so a hidden part never stays selected — invariant 43.) A selection change
    mid-drag ends the gizmo's gesture and abandons the rest of that drag (`Gizmo.tsx`).

43. **Hidden-ness is view state with one gate, and a hide moves nothing.** `hiddenIds` is not in
    the document and not saved (no schema change), but it is undone: a history entry is
    `{ doc, hiddenIds }`.

    - **The writer rule.** The four user actions — `hideSelected`, `hideUnselected`, `showAll`,
      `setHidden` — all go through `applyHidden`, which never runs `edit()` and never replaces
      `doc`. Everything else only RECONCILES the set with a document: `restore` (undo/redo,
      filtered to the restored parts), `replaceDocument` (clears it) and `deleteBoards`
      (drops the deleted ids, fu 213; since components, `reconcileHidden` filters against
      `itemPaths` after Delete, Group and Ungroup, so other copies' ids are reconciled too). A fifth user action that writes `hiddenIds` directly
      is a second decider.
    - **One entry, the SAME document.** A hide that changes the set pushes exactly one entry
      holding the current `doc` object, no copy, and clears `future`; autosave does not fire.
      A hide that changes nothing pushes nothing (invariant 4).
    - **Hidden parts are never selected, structurally.** `selectionPatch` drops hidden ids from
      every selection it writes, so `selectBoard`, `toggleSelected` and `selectAll` cannot
      select one, every hide re-runs it, and a grab owned by a part being hidden drops
      (invariant 24's retargeting rule). Do not move this filter out to the callers.
    - **A hide is refused while `gesturing`.** It pushes its own entry, so inside a gesture it
      would land between the lazy snapshot (invariant 4) and the drag's later frames, and one
      Ctrl+Z would undo part of the drag with the hide. `applyHidden` reads the flag; no
      component may (invariant 34). In practice only a gizmo drag can be open: the keys are
      blocked in text fields, and the eye or Hide others blurs a field first.
    - **Undo and redo keep the held points when the restored document is the same object.**
      Only then; a different object still clears all four (invariant 24).
    - **A PROHIBITION: no hide or show may clear `tapeAnchor` or `tapeHover`.** Each holds a
      real position on a real part, and hiding moves nothing. Measuring from a part and then
      hiding it is legitimate. Tests assert both survive each action.
    - **The selector rule.** `visibleBoards` returns a new array whenever anything is hidden, so
      inside a `useStore` selector it would re-render on every `set()` (invariant 34's cost
      argument). Select `boards` and `hiddenIds` as bare fields and filter in a `useMemo` or a
      handler. Every viewport reader goes through `visibleBoards`; a hand-written filter is a
      second decider.

    A hidden part is still entirely part of the design: the cut list, nesting, diagrams,
    joinery, Generate, `checkDesign`, export and autosave read `doc.boards` unchanged.

44. **`axisFrame` is the ONE home of the turn table, and every crossing between a part's frame
    and the world goes through its helpers.** `rotation` is `0 | 90 | 180 | 270`, each a TRUE
    rotation about the vertical, counter-clockwise seen from above; `axisFrame(board)` gives,
    per world axis, the dimension it carries and whether it is `reversed` (the part's 0 on the
    world MAX side). The crossings are `toWorldOffset` / `fromWorldOffset`,
    `spanToWorldOffset` / `spanFromWorldOffset` and `endFacing`, all in `geometry.ts`. Before
    v8 there was no direction: `axisDimensions` only said WHICH dimension, so 90° was a mirror
    across the X=Z diagonal and identical parts could never face their cuts toward (−X, +Z).
    Invariant 13 is this rule's ancestor: one mapping, one file.

    - **Never `board[dim] - u` at a call site.** That is a second copy of the table, and it is
      invariant 13's failure mode with a sign in it. No file branches on `rotation`'s value
      except `axisFrame` itself, the migration (`foldRotationToV2`, `trueTurnsToV8`),
      `generated.ts`'s `orient` and Properties' Turn select. **The one legitimate hand-written
      reflection is `mirrorCutAlong`**: it maps a part's frame to the same part's frame
      inside the migration, not a part to the world. Do not "tidy" it onto the helpers. **It
      CLIPS BEFORE IT REFLECTS** on the position axis: `validateCuts`' clamp, in its order
      (offset into `[0, size]`, then width into `[0, size − offset]`), then
      `offset = size − (lo + width)` as ONE sum; a cut the clamp would drop goes back raw for
      `validateCuts` to drop. Reflecting the raw interval first migrated an overhang wider,
      resurrected a cut the loader had dropped, and left a ~7e-16 sliver solid on a decimal cut
      flush with the far end (`size − offset − width`). **Nothing is snapped**: a v7 cut 1e-10
      short of an end left a real sliver, and §4 keeps it. A cut flush with the NEAR end
      stores `width = size − offset`, exact by Sterbenz, so it lands exactly flush with the far
      end (on a millimetre board `(size − w) + w` can fall an ulp short: a ~1e-15 sliver).
      Each of the four (clip, one sum, no snap, near-end exact width) is pinned by its own
      test; the last by a millimetre board and a near/far millimetre sweep that assert solid
      COUNTS, because `sameSet` rounds at 1e-9 and cannot see a sliver.
    - **Turn 0 is the pre-v8 mapping for every posture**, so a 0° part means exactly what it
      always did. Within a posture the four turns are proper rotations of turn 0: no turn
      changes handedness. Postures still differ in handedness among themselves (follow-up
      215); this round did not touch that.
    - **The proof is equivariance: turn r+90 is turn r rotated a quarter about the part's
      centre**, for `worldSolids`, `solidWorldBox`, `pointToLocalXYZ` (edges),
      `boardSnapPoints` and `cutSnapPoints` (`turns.test.ts`), `pocketFor` (all 12 poses),
      joinery (180°), and `boardUVs`' interior constant (invariant 35's number). **The fixture
      is `chiralPart` because a symmetric fixture passes a mirror** — the bug this round
      removed is exactly one a symmetric part cannot see. All three cuts are off-centre on every
      axis, so each alone is one-handed. And
      the plan-supplied `boardSnapPoints` equivariance test could not fail until `c3` took a
      box corner, because no lattice point sat in removed stock: invariant 23's shape (a
      test whose fixture cannot reach the guarded branch). Mutate any new equivariance test.
    - **In `boardUVs` the reflection is per GEOMETRY axis, before invariant 35's sign and
      swap.** Reflecting the swapped axis is the plausible wrong version; Task 4's mutation
      reds 9 tests (flat at 180° alone is blind to it, since both horizontals reverse).
    - **`trueTurnsToV8` is NOT idempotent.** It mirrors the cuts of a 90° part along h0, so
      running it twice undoes it. The `d.version < 8` guard in `migrateDocument` is the only
      thing that stops a v8 file being re-mirrored on every load.
    - **Generate stays at 0° and 90°.** `orient` loops `[0, 90]` on purpose: its parts start
      uncut, so a true 90° and the old one look identical, and joinery then cuts through the
      new mapping. A turn is not a group field (multi-select spec §1).

45. **A link is a SHAPE its users point to: the shared fields are stored once, so its users cannot
    differ** (components round, schema 11; before it a link was a label on self-contained parts,
    kept equal by propagation and a load repair). A linked part is a `ShapedBoard`, storing only
    `id`, `name`, `position`, `rotation` and `shape`. The `Shape` holds `length`, `width`,
    `thickness`, `material`, `grain`, `posture` and `cuts`. Every reader of placed parts reads
    resolved `Board`s and knows nothing about shapes.

    - **`LINK_FIELDS` (`links.ts`) is still the ONE shared-versus-own table**, `satisfies
      Record<keyof Board, …>`.
      - `Shape` and `ShapedBoard` are derived from it, so a new REQUIRED `Board` field fails
        `tsc` until it is classified (invariant 40's argument).
      - An OPTIONAL own field would be dropped silently by `copyBoard`'s shaped literal
        (follow-up 231): classify it with care.
    - **`resolveBoard` (`shapes.ts`) is the ONE place a shape is read into a part.**
      - It returns a plain part as the same object.
      - It builds the shared part from `SHARED_KEYS` and copies cuts per cut, so no two parts
        hold one Cut object.
      - `worldParts` resolves before it places.
      - A resolved part carries `shape` (the id) for the UI; a STORED plain part never does.
    - **Write-back sends shared fields of a shaped part to its Shape** (`applyWorldEdits`,
      invariant 46). So an edit, a cut added, changed or removed, or a posture change reaches
      every user in ONE `edit()`, with no propagation code.
      - The one surviving propagation is `shapeMates` in `updateBoards`: posture is shared,
        a min corner is not, so every other user is re-pivoted about its OWN centre
        (invariant 2).
      - The board-precise `grabbed` clause still covers the targets only; every held point is
        judged after the edit (`judgeHeld`).
    - **`linkPlan` is still the ONE decider for Link**, read by the store and the group panel.
      - The FIRST selected part is the source.
      - A selected linked part brings every user of its shape.
      - A no-op Link or Unlink pushes no entry (invariant 4).
      - Link points every member at one shape: the source's own shape if it has one, else a
        new one.
    - **A shape with one stored user dissolves**: that user becomes a plain part carrying the
      fields, cut ids kept (`dissolveShapes`). This runs on load, after Unlink, and after
      Delete. Users are counted as STORED parts: one part placed by three copies of a drawer
      is one user.
    - **Copies:**
      - a copy of a SHAPED part is a ShapedBoard on the same shape;
      - a copy of a plain part is plain, with fresh cut ids and no `shape` key;
      - cut ids are scoped to the shape (invariant 33).
    - **Joinery keeps sharing where identical** (follow-up 223 closed). `writeBackFlat` groups a
      shape's users by their new shared fields, comparing cuts by GEOMETRY (`CUT_GEOMETRY_KEYS`,
      not ids, since `pocketFor` mints ids per board). The first user's group keeps the shape,
      and each group takes its first member's cut ids. Comparison is exact: a last-bit
      difference splits, which is the safe direction.
    - **Retired, and must not come back as a second mechanism:** `Board.link` (read only from a
      file below v11 by `linksToShapes`), `repairLinks`, `dissolveSingletons` and `mates`
      propagation.

46. **The tree has ONE composition step and ONE walk, and every edit is written back through
    `treeEdit.ts`.** A document is a definition/instance tree (v10): the root's `boards` and
    `instances`, plus `definitions`. A part's stored `position`, `rotation` and min-corner rule
    (invariant 2) are in its CONTAINER's frame. An instance's `position` is its frame's ORIGIN.

    - **`placeBoard` / `placeInstance` (`frames.ts`) are the only places a frame is applied**:
      (origin + R(p)) + `cornerShift`, with R a quarter turn about the vertical (90 maps (x,y,z)
      to (z,y,−x)). A second hand-written composition is invariant 44's failure mode, one level
      up.
    - **`worldParts` (`tree.ts`) is the only walk that produces placed parts.** The viewport,
      the gizmo, the Move and Tape tools, the store and the panels read it. A reader that walks
      `definitions` itself is a second decider. It is cached per document object (a WeakMap),
      and each part keeps its OWN name. Path names come only from `flatDocument`, which the cut
      list, nesting, joinery and joinery's `checkDesign` read, so Properties never stores a path as a name.
    - **Every edit is written back through `treeEdit.ts`, changed fields only.** `position` is
      compared element by element, and a changed one goes down as a DELTA, level by level.
      Every move is a world delta rotated into the container's frame (`translateItems`), never
      an absolute position through world space.
    - **TWO write-back rules, on purpose.**
      - **A Properties edit keeps the STORED local position** on a dimension change: it is an
        edit of the part in its own frame (spec §5.2).
      - **Joinery keeps WORLD geometry.** `applyWorldEdits(..., { keepWorld: true })` is passed
        only by `writeBackFlat`, because joinery's output IS world geometry and the checks ran
        on it.
      - Without `keepWorld`, a rail lengthened inside an assembly turned 90° or 180° grows the
        wrong way and pulls its tenons out (the Task 11 critical, tested at all four turns).
      - **Do not unify them, and a new caller must pick one.**
    - **A new frame starts at origin `[0, 0, 0]`, turn 0, so Group moves nothing, bit for bit.**
      Ungroup is exact for direct child parts only, because folding a nested frame reorders the
      additions.
    - **Joinery runs on `flatDocument` and maps back by index.** It throws on a part-count
      mismatch. The tree is what `useJoinery` saves. Anything that reads sites or joints off
      the document must use the flat one: `App.tsx`'s joinery dialog read the tree, found 0
      sites on a grouped design, and no per-task review could see it.
    - **A selection is one level.** `selectionPatch` keeps only direct children of `openPath`,
      and `isCovered` is the one ancestor test (`i3` covers `i3/b1`, not `i30/b1`). Hidden ids
      and the tape's held points are re-keyed on Group and Ungroup, which are refused while
      `gesturing` (invariant 43's argument).
    - **Load repair** (`repairTree`, `dropUnresolved`, `pruneShapes`, `dissolveShapes`) runs in
      `migrateDocument` on every load. Its order is in the components spec §2.3. The copy of a
      definition placed twice runs ONLY below v11 (`copyShared`).
    - **A definition may be placed many times** (components round). So:
      - **Write-back keys on the STORAGE target, not the path.** `storageKey` is
        `<definition id or ROOT>:<part id>`, the same for every placement of one stored part.
        Edits to one target merge field by field, and DISAGREEING edits THROW.
      - **The store sends at most ONE edit per storage target** (`oneEditPerTarget`). That is
        why no user action reaches the throw. A new store caller of `mapWorld` that can reach
        two placements of one part must dedupe the same way.
      - **An edit inside a definition moves parts in EVERY copy,** so every held point is judged
        after it (`judgeHeld`). Group, Ungroup and Delete inside a shared definition re-key
        hidden ids and tape points under EVERY placement of the edited container
        (`rekeyEverywhere`), then reconcile `hiddenIds` against `itemPaths`.
      - **Make Unique** (`makeUniqueItem`) copies ONE level and KEEPS ids, so occurrence paths,
        hidden ids and held points survive it unchanged. It is offered by instance REFERENCES,
        not placements.
      - **A twin placement of a selected stored part is never a Move target**
        (`moveCandidates`).
      - **Joinery's `writeBackFlat` splits definitions whose placements' results differ,**
        shallowest-first by deepest placement (root-first BFS breaks on a drawer placed both at
        the root and in shared cabinets). Then it sends one edit per storage key.


### Open follow-ups digest (as of 2026-10-07)


**`docs/follow-ups.md` is the authoritative list** — 1-231, consciously deferred rather
than missed, each written up in place with its closure where it has one. Read the entries
for the area you are about to touch before starting; several are "correct but untested",
which is exactly what a refactor breaks silently.

The handful worth knowing without opening that file:

- **130** — semi-infinite construction lines, the one genuinely open item on the tape
  surface. Narrowed but not closed by cardinal guides: typed offsets are enough as a
  *mechanism*; what is still wanted is the line as a *visual*. **It was chosen and then
  immediately set aside on 2026-08-31, with no reason given** — so it is neither fresh
  ground nor argued against, and this bullet no longer calls it "the most likely next
  round". Ask before assuming it is wanted. Note the cost 26a puts on it: axis lines bounded
  to `SCENE_EXTENT` with dash scaling are exactly the extent- and precision-sensitive class
  that software GL hid a shipped grid bug inside, so it needs a human on real hardware.
- **147** — should a locked axis outlive a commit? A §3.1 amendment and a human decision,
  not a bug fix. **The user was asked and ruled SHIP AS-IS**, so it is open by decision:
  one keystroke per guide is worth the single-sentence rule, revisit only with real use.
- **148** — CLOSED 2026-08-31. `store.ts` held `gesturing` and `gestureSnapshotTaken` as
  module-level closure variables `replaceDocument` could not reach, so a component
  unmounting mid-gesture leaked them into every later test in the file and silently broke
  undo bookkeeping. Both are store state now. Read its closure before writing a test whose
  subject is a reset: the obvious assertion (`gesturing === false`) cannot fail, and the
  one that works asserts an undo entry.
- **140** — CLOSED 2026-08-31, and worth reading for how rather than what: it was closed by
  neither remedy it named. The heavy case was not expensive geometry, it was a test calling
  a pure function 4,650 times for one unchanging board. 1,549 ms → 11 ms inside a full-suite
  run, no `testTimeout`, no source change.
- **159** — CLOSED 2026-08-31. A failed duplicate now names its cause inline on the failing
  row. Read its closure before touching that handler: the cause is read off
  `storage.available` (the ADAPTER flag, never the React `available`, which is a render
  behind), and the read's position relative to `setAvailable` is deliberately documented as
  NOT mattering — a surviving mutation, recorded so nobody preserves an ordering that means
  nothing.
- **92** — CLOSED 2026-08-31. Both halves: `formatDims` is now the single home of
  `length × width` in `nesting.ts`, and a turned part's label says `turned` in words. Read
  its closure before adding anything to a sheet label — the word rides on
  `PlacedPart.dims` rather than the panel because `fitLabel` must measure the string it
  draws, and a non-ASCII symbol was rejected for invariant 19's reason, measured in a
  browser rather than argued.
- **160** — CLOSED 2026-08-31, and the second entry in two rounds closed by rejecting the
  remedy it named. `deleteProject` taking the caller's intended active id cannot work — the
  handler captures `activeId` before its awaits — and the residue is unreachable on this
  adapter because every index write in `deleteProject` is synchronous with its index read.
  Read its closure before making any storage method genuinely async: the reachability of both
  160 and 157 rests on `BrowserStorageAdapter` being synchronous-bodied throughout, which is
  why those races can only be built by hanging a mock.
- **161** — CLOSED 2026-08-31 by the remedy it named, after the design question was put to
  the user with the affected band measured (~12" to ~20" of part width on a 96" sheet). The
  rule lives in `fitLabel` as `requireDetail`, NOT as a panel-side override of the tier —
  read the closure before adding a fourth tier or a second caller. `SheetLayout` got its
  first tests in the same round, and the wiring mutation is caught only by them.
- **162** — CLOSED 2026-08-31. The bullet is gone, but read the closure before touching
  that list: the `<ol>`-with-no-prefix version is REJECTED at the rule itself, because the
  number in the part's rectangle comes from `nextIndex` and a list marker would come from DOM
  position — one value, two deciders. Also records what it really was: the one list in the
  app that never got the `list-style: none; padding: 0` reset the other four all have.
- **163** — CLOSED 2026-08-31, and the one entry of the day that came from a bug report. Read
  its closure before adding a UV assertion of any kind: the sweep written while diagnosing it
  passed with the bug live, because it asserted a scale and the defect was a direction. Also
  read it before touching a plywood edge for a *different* reason — it carries a measured,
  deliberately-unfixed finding about ply legibility at 3/4" that the user was shown and ruled
  on.
- **164** — CLOSED 2026-10-03 by the batch variety round. Read its closure before touching
  the planner: it records why per-run hints were rejected, and the one residue seen live
  (two benches distinct in structure but alike from above).
- **165** — CLOSED 2026-10-03 by the held and stable round; invariant 39 is the rule. Read
  its closure for the workbench evidence and the three rulings on (c).
- **176 / 177** — the held rules' known limits (mutual lapping, edge-attached trim hangs by
  design, corner-region `tips` distance) and the one thing not seen live: the model
  REPAIRING a `hangs` or `tips` violation, since nothing triggered one.
- **167** — prompt caching DOES work (1,271 cached tokens per run, measured); the entry's
  original premise was wrong. The real gap is a batch's cold parallel start. Still low value.
- **174** — CLOSED 2026-10-03 by the key check round. Read its closure before touching
  Settings' Save: the free verification call saves anyway on anything but a 401/403, and
  **there is deliberately no prefix rule** (a working key does not start with `sk-ant-api`).
- **215** — OPEN, a question rather than a bug: postures differ in handedness (flat and
  upright one way, on-edge the other), so a posture change mirrors a one-handed part's cuts,
  and which hand the cut sheet's drawings assume is not established. The quarter turns round
  kept turn 0 equal to each posture's old frame so nothing got worse. Read it before touching
  posture or linking parts across postures.
- **221** — a hand-edited linked file whose cuts have no ids unlinks on load, failing safe
  (since v11: those members stay plain parts instead of joining the shape). **223** is CLOSED by
  the components round: joinery keeps linked parts with identical cuts on one shape.
- **224-231** — the assemblies and components rounds' residues. 224 is CLOSED by the
  components round. 225 is out of scope by decision (mirrored instances, a cut list by assembly).
  The rest are low:
  - 226: an emptied assembly lingers;
  - 227: a covered row's eye label, and ` › ` inside a part name;
  - 229: ungrouping in one copy can un-hide another copy's lifted parts;
  - 230: no store-side twin-target guard;
  - 231: record-only.
- **171** — joinery is BUILT (2026-10-04, "Add joinery…"); refine by instruction is now **179**.
  Read invariants 38 and 41 and follow-ups 180–206 before touching `generate/joints/`. 180–204
  are CLOSED (182, 186, 188, 191 and 201–203 by the joinery residues round; 202
  and 204 by decision). Open: 205 (an end-cut refusal reads the cut's STORED form) and 206 (the
  half-lap coplanar check ignores axis), both safe refusals.
- **178** — CLOSED 2026-10-04. A cut a board edit has left removing nothing is hidden from
  the cut list, its drawings and the snap points, and flagged on its Properties row; it is
  KEPT, so growing the board back restores it. Read the closure before adding a reader of
  `board.cuts` that prints or counts cuts: it should probably read `cutsThatRemoveStock`.
- **26a** — **read this before touching anything in the viewport.** Browser verification on
  this host runs on software GL (llvmpipe, no GPU), which returns 1.0 for `pow(0.0, 0.0)`
  where real hardware returns NaN. That difference hid a grid bug completely — it looked
  correct in every screenshot and shipped as a camera-following disc. Anything resting on
  undefined or precision-sensitive shader behaviour needs a human looking at real hardware.
- **70 / 79 / 84** — an actual print-to-PDF render is still unverified; this host's
  Playwright exposes no `pdf()`. Every print check to date used `emulateMedia`.
- **76** — a recorded *negative* finding: hatch versus cross-hatch is not reliably
  distinguishable at screen size on its own. The legend line carries the distinction.

**One chain runs through the whole ledger and is the single most useful thing to know
before executing a plan: code and justifications supplied verbatim by a plan, spec, brief
or reviewer have been wrong at least ten times** (64, 68 ×2, 80, 87, 88, 107, 118, 126,
141 ×4-5, and 155 for the project-library round's own six). The recurring shapes: a fixture
that passes for the wrong reason, a test bound derived from the thing under test, a constant
whose stated justification doesn't reproduce, and a claim copied into several documents
before any code existed. They were caught because implementers were told to fix the *code*
rather than the *expectation*, and to stop and escalate when they believed an expectation was
itself wrong.

**A FIFTH SHAPE — and note it is NOT a fifth instance: 140 does not join the count or the
list above, because the wrong text was this ledger's own rather than a plan's, and the count
is taken from 155's derivation.** The shape: **a remedy an entry NAMES is a hypothesis
recorded at diagnosis time, not a prescription.** Follow-up **140** is the worked example. It
called its heavy test case irreducible geometry and named two fixes — raise `testTimeout`, or
split the case — and both would have turned the suite green while leaving the actual cause in
place: the test was calling a pure function **4,650 times** for one unchanging board.
**Measure before adopting the remedy an entry names**, on any entry whose diagnosis rests on
something being inherently expensive, inherently racy, or otherwise not worth looking at
again. Done once and worth repeating cheaply: after 140 was closed, every other test file was
checked for the same shape and none had it — the slowest remaining test in the suite is 831 ms
and is jsdom-bound, not a probe loop.

**Follow-up 160 is the second worked example, and it extends the shape in two directions —
read it before acting on any entry's named remedy.** 140's named remedies were merely
wasteful; 160's was **impossible**, and the entry could not have known: `onDeleteProject`
captures `activeId` before its awaits, so the "intended active id" it proposed passing would
have named the project being deleted. Adopting it on the entry's authority would have written
a dangling id and made things worse. Second, and the part 140 does not teach: **check
REACHABILITY, not only cost.** 160 described a race that cannot occur on this adapter at all,
because every `BrowserStorageAdapter` method is synchronous-bodied and no two of `App`'s four
adopting handlers can overlap in production. The round that closed it changed no source and
shipped a prohibition plus two tests instead. **So the question to ask of a named remedy is
three-part: is it possible, is the problem reachable, and does the remedy address the actual
cause** — and the entry's own text is evidence for none of the three.

**The project library round is the sharpest single data point in that chain and is worth
knowing as a number: SIX DISTINCT plan-supplied tests were shown, by mutation, to be
incapable of failing** — and one of them was hiding a real shipped bug rather than merely
being weak. Follow-up **155** enumerates all six and derives the count (the round's own ledger
reaches six one entry earlier, having logged the same observation twice); take the number from
there rather than restating it. **Mutate the test, don't just run it**, on anything
whose whole justification is an ordering, a refusal, or a "cannot exceed" property.

Host-level open items (proxy auth, Cloudflare, monitoring) are in `DEPLOYMENT.local.md`.


### Architecture, layer order and versioning (as of 2026-10-07)


Static single-page app. No server, no database, no backend API, no env vars. **One
outbound call exists**: Generate calls `api.anthropic.com` straight from the browser with
the user's own key (`dangerouslyAllowBrowser`). The key lives only in `sloyd.llm.v1` and the
CSP's `connect-src` allows only that origin. There is still no server-side state.

**Governing rule: the plain-JSON document is the source of truth; the Three.js scene is
derived from it and is never authoritative.** A document is
`{ version, name, units, stock, guides, boards, instances, definitions, shapes }`: the root's
parts and assemblies, the assembly definitions they place, and the shared part shapes
(invariants 45, 46). Dragging a board in the
viewport computes a number, writes it to the document, and the scene re-renders from the
updated document — never the reverse. This is what keeps undo, save/load and export
simple: they only ever serialize or restore the document.

**A board's `position` is the min-corner** of its world bounding box, not its centre.
This matters anywhere geometry or the gizmo touches position math (invariant 2).

#### Layer order

Each layer depends only on the ones before it:

1. **`units`** — the bottom layer, imports nothing. `length.ts` (fractional inches),
   `quantity.ts` (decimal board/square feet).
2. **`document`** — schema, geometry, validation, versioned migration.
3. **`store`** (Zustand + snapshot undo/redo) and **`storage`** (the `StorageAdapter`
   seam).
4. **`llm`** — the provider seam (`LlmClient`, `LlmMessage` opaque). Imports NOTHING from
   the app, so a second provider is a second implementation and nothing else.
5. **`generate`** — the prompt and the run loop. Imports only `document` and `llm`.
   `useGenerations.ts` sits beside `App.tsx`, not in here, because it owns React state and
   the storage writes.
6. **`viewport`** (react-three-fiber) and **`panels`** (React forms) — both read/write
   through the store and both import `document` directly for types and constants.
   `panels` also imports the `storage` singleton. These are legitimate downward imports.

**The `→ units` edges are settled, and the rule is one sentence: a module takes the edge
when it produces a string a person reads off the page, and not otherwise.** Four do —
`document/cutlist.ts` (a row's grouping key *is* formatted strings, because part identity
is defined as "prints identically"), `document/diagram.ts`, `document/nesting.ts` (all
three importing `formatLength`, so one dimension cannot read differently in two places on
one sheet) and `viewport/TapeTool.tsx` (`parseLength`, because the live preview must know
what the typed text *means* before it can place a marker). One deliberately does **not**:
`document/snapPoints.ts` — a snap point is three numbers, a kind and an owner, and nothing
about it is ever printed. Do not generalise to "everything under `document` imports
`formatLength` now." The per-file arguments are in `docs/history.md`.

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`. Nothing else touches `localStorage` or the filesystem directly. A
future desktop build would be a second implementation of that interface, not a parallel
code path.

#### Versioning

Every document carries a `version`, and every load path (open, import, autosave-restore)
runs through `migrateDocument` before the document is trusted. `CURRENT_VERSION` is **11**
and migration is a real chain: each step runs on raw data, in version order, one version
at a time, before any board reaches `validateBoard` (invariant 11).

**Two shapes of step, and picking the wrong one is the trap.**

- **Per-board** (v1→v2 `foldRotationToV2`, v2→v3 `addPostureToV3`, v3→v4 `addCutsToV4`,
  v7→v8 `trueTurnsToV8`) — a `rawBoards.map` running *before* `validateBoard`, because that
  validator's fallback for a missing field is a legal-but-wrong value rather than an absence.
  v8 is per-board for its own reason, not that one: it rewrites existing cuts as a function
  of the RAW `rotation`, `posture` and the size of the part's h0 dimension, so it must see
  them before anything defaults them. It touches only a board with `rotation === 90` and at
  least one cut, and leaves a malformed cut field for `validateCuts` to judge rather than
  throwing.
- **Document-level** (v4→v5 `stock`, v5→v6 `guides`, v6→v7 `Cut.stopMin`/`stopMax`,
  v8→v9 `Board.link`) — **no `rawBoards.map` step at
  all**. Read defensively off the raw document and defaulted, the way `units.precision`
  already was. `stock.kerf` defaults to `0.125` when absent, non-numeric or outside
  `[0, 1)` — *defaulted, not clamped to the nearest boundary*. v9→v10 (`instances`,
  `definitions`) is document-level too: both default to `[]`. `guides` defaults to `[]`,
  and `validateGuides` drops a malformed guide rather than refusing the file, because a
  saved document must always open and a guide has no nearest-legal-value to clamp toward.
  `stopMin`/`stopMax` default to `0` in `validateCuts`. An absent `link` was an unlinked
  part; since v11 `link` is read ONLY from a file below v11, into the migration's legacy map, and
  a v11 file's stray `link` is ignored. v10→v11 adds `shapes` (default `[]`): `validateShapes`
  drops a malformed shape (claiming no id) and a duplicate id (the first wins), and a definition
  whose id is literally `ROOT` is dropped (the write-back's root storage id).

**A version bump is for the refusal gate at the far end, not for upgrading old files** —
an absent field defaults cleanly regardless of `CURRENT_VERSION`. But the two bumps were
argued differently and copying the wrong argument would be a mistake. v5's harm is a
**wrong number**: a v4 build drops a user-set kerf and prints a different sheet count.
v6's is plainer and weaker and is still what the gate is for: **silent data loss on
round-trip** — a v5 build opens a v6 file, drops every guide, autosaves, and they are gone
with nothing indicating it. Guides produce no number; nothing on the cut list reads them.
Read which argument applies to *your* field rather than inheriting one.

v7's argument is the strongest of the three: **wrong geometry**. A v6 build opening a v7
file ignores the stops, shows a blind mortise as a through-dado with nothing saying so, and
autosaves that shape back.

v8's argument is the same as v7's, **wrong geometry**, twice over. A v7 build opening a v8
file reads 180 and 270 as invalid and falls back to 0, and it reads a v8 90° part with cuts
through the old mirror, so those cuts land mirrored along the part's h0. Either way it shows
a different part and autosaves it. **v8's step is NOT idempotent**: it
mirrors, so running it twice undoes it. The `d.version < 8` guard is the only thing keeping a
v8 file from being re-mirrored on every load.

v9's argument is v6's, **silent data loss on round-trip**: a v8 build opens a v9 file, drops
every `link`, autosaves, and the links are gone. It is silent precisely because every linked
part is self-contained (its own size and cuts), so the v8 build shows exactly the same
parts. v10's argument is v9's, made stronger: a v9 build opening a v10 file drops `instances` and
`definitions`, so EVERY PART INSIDE AN ASSEMBLY VANISHES, and it autosaves. `repairTree` runs
after validation on every load (invariant 46).

v11's argument is the strongest yet, **silent data loss**: a v10 build would see shaped parts
with no size, and its load repair would copy every shared definition, un-sharing every component,
then autosave. **The v10→v11 step (`linksToShapes`) runs AFTER validation**, guarded by
`d.version < 11`, before `repairTree`. It is the one step not run on raw data, because it needs
validated values and world order to judge which members are equal (spec §8.3). Each link becomes
one `Shape` built from its first member; equal members become shaped parts with nothing moved; a
differing member stays plain. `repairTree(doc, { copyShared: version < 11 })` copies a definition
placed twice only for an older file, and a v11 file's stray `link` is ignored. `repairLinks` is
retired: users of one shape cannot differ, by construction.

Full detail: `docs/superpowers/specs/` (design), `docs/superpowers/plans/`
(implementation), `docs/history.md` (what shipped and why).

