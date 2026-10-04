# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Deployment specifics for this host live in `DEPLOYMENT.local.md` (gitignored).
>
> **This file holds the rules that govern new work.** The reasoning behind each round —
> what it did, why, what its browser pass could and could not confirm — lives in
> `docs/history.md`, split out on 2026-08-14 when this file passed 195KB. Prohibitions
> that were embedded in those narratives have been promoted into the Invariants section
> below; where the two disagree, this file wins.

---

## What Sloyd is

Modelling and planning for woodworking projects: lay out the parts of a build in 3D,
see how they fit, and get the numbers you need at the bench (dimensions, cut list).
Not a general-purpose CAD tool — the domain assumptions (boards, stock thickness,
fractional inches) are the point.

The name is from *sloyd* (Swedish *slöjd*), the Scandinavian handicraft education
tradition built around hand woodworking.

## Status

Static SPA, containerized, **1519/1519 tests passing across 55 files** (the ~1-in-4 `depthField.agreement.test.ts` flake is closed — follow-up 140), schema
`CURRENT_VERSION` **7**.

**PRODUCTION MATCHES `master` as of 2026-10-04 with the cut words round live** — bundle `index-Cw_EeWuY.js`, CSS `index-DqhKBEnY.css` (unchanged), merge commit `8c9be52`, **schema 7**. Before it the same day: joinery `index-Ci7lVCzJ.js` (`d2a14ac`), phantom cut `index-B2Yuq550.js` (`e7bf3bc`), stopped cuts `index-CoHIAVxf.js` (`c054ede`), which bumped the schema to 7 (rolling back past it strands v7 documents; export first). Before it, 2026-10-03: key check `index-BhhW2iNw.js` (`d0ba83b`), held and stable `index-B9DOKF_H.js` (`a0f452f`), batch variety `index-CHx6ZAo-.js` (`b46b28d`). The Generate round's own deploy, earlier the same day, is described next. It served
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
findings: 164, a batch converging on one design, now CLOSED (below); and 165, a support
check that passes a badly supported part, still open.

**The cut lines round (follow-ups 192–194, 2026-10-04) is on branch `cutlines`, live-checked by the user, NOT yet merged.** `cutShape` is the one description of a cut; the setup line and the drawing both format from it, and a with-grain channel says `groove` (`docs/browser-verification-cut-lines.md`). No schema change. Its open questions are follow-ups 195–197.

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

**Nothing is pending.** `DEPLOYMENT.local.md` carries every runbook entry and bundle hash.

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
174 (the key check) is done too. Ask before starting anything.
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
`version: 6`, and any image understanding less **refuses** it rather than silently
dropping the guides — the gate working as designed, and the silent-data-loss case the
bump was argued from. Autosave lives in the browser, so rolling back past the
guide-points deploy would strand any project saved since; export first. Rolling back a
round that changed no schema costs nothing but the round itself.

## Architecture

Static single-page app. No server, no database, no backend API, no env vars. **One
outbound call exists**: Generate calls `api.anthropic.com` straight from the browser with
the user's own key (`dangerouslyAllowBrowser`). The key lives only in `sloyd.llm.v1` and the
CSP's `connect-src` allows only that origin. There is still no server-side state.

**Governing rule: the plain-JSON document is the source of truth; the Three.js scene is
derived from it and is never authoritative.** A document is
`{ version, name, units, stock, guides: [...], boards: [...] }`. Dragging a board in the
viewport computes a number, writes it to the document, and the scene re-renders from the
updated document — never the reverse. This is what keeps undo, save/load and export
simple: they only ever serialize or restore the document.

**A board's `position` is the min-corner** of its world bounding box, not its centre.
This matters anywhere geometry or the gizmo touches position math (invariant 2).

### Layer order

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

### Versioning

Every document carries a `version`, and every load path (open, import, autosave-restore)
runs through `migrateDocument` before the document is trusted. `CURRENT_VERSION` is **7**
and migration is a real chain: each step runs on raw data, in version order, one version
at a time, before any board reaches `validateBoard` (invariant 11).

**Two shapes of step, and picking the wrong one is the trap.**

- **Per-board** (v1→v2 `foldRotationToV2`, v2→v3 `addPostureToV3`, v3→v4 `addCutsToV4`) —
  a `rawBoards.map` running *before* `validateBoard`, because that validator's fallback
  for a missing field is a legal-but-wrong value rather than an absence.
- **Document-level** (v4→v5 `stock`, v5→v6 `guides`, v6→v7 `Cut.stopMin`/`stopMax`) — **no `rawBoards.map` step at
  all**. Read defensively off the raw document and defaulted, the way `units.precision`
  already was. `stock.kerf` defaults to `0.125` when absent, non-numeric or outside
  `[0, 1)` — *defaulted, not clamped to the nearest boundary*. `guides` defaults to `[]`,
  and `validateGuides` drops a malformed guide rather than refusing the file, because a
  saved document must always open and a guide has no nearest-legal-value to clamp toward.
  `stopMin`/`stopMax` default to `0` in `validateCuts`.

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

Full detail: `docs/superpowers/specs/` (design), `docs/superpowers/plans/`
(implementation), `docs/history.md` (what shipped and why).

## Where things live

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
│   ├── types.ts            Board, GuidePoint, SloydDocument, Rotation, Posture,
│   │                       Grain, MATERIALS, SheetStock, isSheetGood, sheetStockOf
│   ├── geometry.ts         axisDimensions (SINGLE SOURCE, inv 13) / boardExtents /
│   │                       boardCenter / reorientedPosition (inv 2)
│   ├── names.ts            uniqueName / dedupeNames (inv 8). Imports only Board.
│   │                       NAMES ONLY — id uniqueness is `takeId` in
│   │                       document.ts (inv 33), for the reason stated there
│   ├── cuts.ts             cutRegion / boardSolids (split, drop against the UNION,
│   │                       merge) / boardEdges (inv 16) / solidWorldBox / cutLabel /
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
│   │                       `cutShape` is the ONE description of a cut (word, run axis,
│   │                       position, stops at closed ends, as numbers); `cutLabel` is
│   │                       its word, and the setup line AND the drawing format from it,
│   │                       never from stored fields (fu 192). `groove` when the run axis
│   │                       is the grain on a material with grain (fu 193).
│   │                       It and `cutLabel` take an optional precomputed `solids`
│   │                       (one `boardSolids` per board) — skip it, cut list ~3.5×
│   │                       slower. Home of
│   │                       `CUT_GEOMETRY_FIELDS` / `CUT_GEOMETRY_KEYS` (inv 40)
│   ├── tenons.ts           findTenons: a tenon from the end cuts leaving one tongue
│   │                       (ℓ ≤ L/2, ≥ 2 cuts, exactly one remaining rectangle).
│   │                       The sheet prints one line per tenon
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
│   │                       (floor rectangle 9 + the mouth's opening, every point
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
│   │                       LOCAL→WORLD IS `position[axis] +
│   │                       local[axisDimensions(board)[axis]]` — neither
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
│   │                       workbench is `fixtures/simple-workbench.sloyd`
│   └── document.ts         create / validate / migrate (inv 11); validateGuides;
│                           createGuide; `takeId`, the ONE home of the
│                           id-uniqueness rule for boards, guides and cuts
│                           (inv 33); re-exports the rest
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
│       │                   dimension order (a stopped dado read as a "notch")
│       ├── sites.ts        findSites / rangesOf. Rule 3 needs a thin panel (<= 1/2in)
│       │                   and the contact reaching the panel's edge along the
│       │                   RECEIVING part's thickness axis (a centre partition otherwise
│       │                   lost half the back)
│       ├── recipes.ts      applyJoints; re-grounds a floored design. A rabbet moves the
│       │                   panel once and trims parts butting its moving face; a
│       │                   half-lap needs coplanar partners, ALIGNS E (never moves it
│       │                   by t) and skips a drop blocked by another part
│       └── choose.ts       JOINERY_PROMPT / JOINT_SCHEMA / parseChoices / defaults
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
│   │                       select mode, gates onPointerMissed
│   ├── BoardMesh.tsx       one board per render; ghost box when boardSolids is empty
│   │                       (inv 21). Required `selectable` prop, so the Move tool's
│   │                       commit click cannot select the board it drops onto
│   ├── MoveTool.tsx        raw pointer events on gl.domElement. Candidates are TWO
│   │                       SETS, not one set with a filter: pre-grab the SELECTED
│   │                       board's points only, post-grab every board's minus the
│   │                       grabbed board's own. Guides are POST-GRAB only — targets,
│   │                       never grab sources. Dep list is inv 15's failure mode
│   ├── TapeTool.tsx        MoveTool's sibling; withholds NOTHING either way. LATCHES
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
│   ├── gizmoScale.ts       size ceiling + grabbable floor. Pure
│   ├── extent.ts           SCENE_EXTENT, shared by Viewport and OriginAxes
│   ├── grainFaces.ts       faceGrainKinds + grainFamily; re-exports axisDimensions
│   ├── grainTiling.ts      per-face UVs, boardUVSignature. FACE_AXES carries each UV
│   │                      axis's world axis AND ITS SIGN, and boardUVs applies the
│   │                      sign BEFORE the swap (inv 35) — a whole board hides a
│   │                      reversed axis, a SOLID does not. Invs 12, 15, 17, 35. Pure
│   ├── grainLog.ts         bandRadius (inv 14), wobble, seededRandom / hash. Pure
│   └── grainTexture.ts     seeded canvas textures, cached, never disposed
├── panels/
│   ├── DimensionField.tsx  min/max REFUSE out-of-range entry rather than clamping,
│   │                       because silently correcting a number the user just typed
│   │                       loses a measurement. Inv 5
│   ├── NameField.tsx       commits on blur/Enter only, empty reverts. Invs 5, 9
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
│   ├── PartsList.tsx  FileMenu.tsx
│   ├── Properties.tsx      board fields + Cuts; CutRow is its own component so a
│   │                       cut's error dies with the cut. Stop short of near/far
│   │                       end; a stop pair leaving no cut is refused (only on a transition INTO
│   │                       it, so a board shrink cannot lock the row), and changing
│   │                       `across` RESETS the stops
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
                            NOT the store's `tool`). M, T, X/Y/Z, Escape and undo/redo
                            all live in the ONE existing keydown effect — inv 27.
                            Escape's ladder: grabbed → tapeAxis → tapeAnchor → tool.
                            Also owns `pending` (the autosave write, held as a
                            CAPTURED-PAIR THUNK — inv 29) and `switchToken`, the
                            one in-flight token every adopting handler bumps
                            (inv 32)
```

Deployment scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`security-headers.conf`.


## Invariants — break these and things fail in confusing ways

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
      moving it.
    - **The feature underneath was destroyed.** `addCut`/`updateCut`/`removeCut` — routed
      *around* `updateBoard` by invariant 2, which is why they needed their own clear and
      could be given a better one. It is **point-precise, not board-precise**:
      `dropHeldIfGone(boardId)` runs **after** the `edit()` and keeps the point iff it is
      still among that board's `snapPointsFor` output. Holding a box corner while editing a
      mid-face dado usually keeps the grab; a rabbet pulled flush with the board's end
      makes that corner stop being offered and the grab drops, by the same rule. Two things
      are easy to undo by "tidying": the comparison is exact `===` (invariant 18's reason),
      and the call must sit **after** `edit()`.
    - **The user retargeted the tool.** Only `grabbed`, because Move's grab candidates are
      the selected board's points. `edit()`'s optional `selection` callback clears it when
      it resolves elsewhere (so `addBoard`/`duplicateBoard` inherit it), as does
      `selectBoard`. `commitSnapMove` also refuses outright when
      `grabbed.owner.id !== selectedId`, before any `edit()`, deliberately leaving
      `grabbed` in hand — the state should be unreachable, and discarding it quietly would
      hide that.

    Four further rules, each load-bearing:

    - **A PROHIBITION: `edit()`'s selection callback and `selectBoard` must NOT clear
      `tapeAnchor` or `tapeHover`.** No part of the retargeting reason reaches the tape,
      which has no selected-board restriction — measuring from one board to another is most
      of what it exists for, and "measure from this board to the one I am about to add" is
      a live path through `addBoard`. Stated as a prohibition because *"add
      `tapeAnchor: null` beside every `grabbed: null`"* is exactly what a tidying pass would
      do and would look like consistency. Store tests exist to catch it.
    - **`clearGuides` clears both tape fields unconditionally**, which is right: every guide
      is going, so a guide-owned anchor is invalid and a board-owned one is cheap to drop.
      The *hover* going unconditionally is defensible **only** because the anchor is nulled
      in the same statement — no anchor, no latch. That is a property of the five statements
      that do it (`setTool`, `clearGuides`, `undo`, `redo`, `replaceDocument`), not a
      licence to add a sixth.
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
      Widening cut ids to one document-wide set is a silent behaviour change.
    - **A guide with NO id is still dropped, not minted.** `validateGuides`' existing rule is
      untouched: missing is malformed data, a duplicate is a good guide wearing a taken label.

    **What makes re-minting safe is a property of the schema, not a coincidence:** nothing
    inside a document references a board or guide id. `Board.cuts` is inline, `GuidePoint` is
    `{ id, at }`, and every id lookup in the app reads runtime state set after a load
    (`selectedId`, `grabbed.owner.id`, the `find` calls in the store and viewport). **A future
    field that points at a board BY ID breaks this**, and would make the repair a two-pass
    rewrite rather than a single expression.

    Threaded as one `seen` set through `rawBoards.map`, **not** a `dedupeIds` pass beside
    `dedupeNames` — a name needs a replacement computed *from* its siblings and so cannot be
    decided one at a time, while an id needs nothing from them but "is this taken". A second
    pass would leave two deciders for one field. And unlike invariant 8's four-place
    enforcement, this needs no creation-time half: `nextId` is a monotonic counter and Import
    replaces a document rather than merging into one, so load is the only place ids collide.


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
    - **A PROHIBITION: they must NOT join the `grabbed: null` list in `undo`/`redo`.**
      Invariant 24's own trap, one field over: it is exactly what a tidying pass does and it
      looks like consistency. A gesture belongs to the component that opened it and an undo
      does not end it, so clearing them there splits one focused field's gesture in half
      after a Ctrl+Z — a behaviour change with no defect behind it. Pointers sit at both
      sites.
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
    `checkDesign`'s `solidBoxesOf` maps each part's `boardSolids` to world space with
    invariant 2's mapping, never `solidWorldBox` (centre-relative). Two parts overlap when
    any of their solids share more than `TOUCH` = 1/32 on all three axes, so a cut explains
    an overlap by removing the stock, and a tenon seated in its mortise is not one. A design
    with no cuts has one solid per part, equal to its box, so Generate is unchanged.
    **The contacts `hangs` reads are ALSO computed between solids** (`solidContactsOf`,
    aggregated per part): a seated tenon's box interpenetrates the leg's box, so box contacts
    would report every mortise-and-tenon rail as hanging. Grounding (`connected`), `tips`
    and `faceContacts` (sites) stay box-based. Do not raise `TOUCH` to make joints pass, and
    do not drop the check.

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
    the type by the compiler.** Two readers do: `cutSignature`, which groups cut-list rows,
    and `boardUVSignature`, which is BoardMesh's memo key. Both were hand-written field lists.
    Adding `stopMin`/`stopMax` to `Cut` without adding them to the first would have grouped a
    mortised leg with a through-dadoed one: one row, one setup, half the legs cut wrong, and
    every existing test green. So `CUT_GEOMETRY_FIELDS` (in `cuts.ts`) is a table that
    `satisfies Record<Exclude<keyof Cut, 'id'>, true>`, both readers derive from it, and a new
    `Cut` field fails `tsc` until it is listed. This is invariant 15 one layer over: a
    hand-written list of what a computation reads goes stale silently. The second reader was
    missed when the table was first written, and the 3D view kept drawing a through-dado after
    a stop edit — found by the whole-branch review, which is why the table now lives in
    `cuts.ts` beside `Cut`'s geometry rather than in the cut list. **Do not replace the table
    with a list in a function body**, and do not add a field to the table's exclusions without
    a written reason.

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
    a "notch"). `useJoinery` writes only through `createProject(doc, { activate: false })` —
    invariant 36 extended. And only problems the joinery INTRODUCED drive repairs:
    `runJoinery` checks the original and the joined design and compares problems by `kind`
    plus their `parts` names (the field exists for this), NEVER by message text, which
    carries coordinates that the joinery itself changes. A hand-made design's existing
    faults are reported once as "already in the original", not repaired at the user's
    expense.

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 1519 tests across 55 files
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck. A green suite proves nothing about `tsc`; run
`npm run build` before claiming anything compiles.

## Open follow-ups

**`docs/follow-ups.md` is the authoritative list** — 1-197, consciously deferred rather
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
- **171** — joinery is BUILT (2026-10-04, "Add joinery…"); refine by instruction is now **179**.
  Read invariants 38 and 41, and follow-ups 180–194 (180, 181 and 189 are closed by the cut words round, 192–194 by the cut lines round; the round's residues: cut-list words for a
  tenon and a closed shelf housing, the default-tenon cap's edges, opposite-face tenons,
  half-lap stacks), before touching `generate/joints/`.
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

## Deployment

Sloyd builds to static files served by nginx from a multi-stage image
(`docker compose up -d --build`). No bind mounts, no named volumes, no `.env` — there is
deliberately no server-side state to persist, because the document lives entirely in the
browser behind `StorageAdapter`. The nginx config does SPA-fallback routing so a refresh
on a deep route resolves to `index.html` rather than 404ing.

**Everything host-specific — hostname, container name, network, proxy setup, and the
manual steps only a human can do — is in `DEPLOYMENT.local.md` (gitignored).** Read it
before deploying or touching anything on the host. See also the deployment rule stated
once in the Status section: production is verified by page load, features against the dev
server.

## Working agreements

- Build incrementally: small v1, then widen. Prefer shipping a narrow thing that works.
- Design docs live in `docs/superpowers/specs/`; read the latest before changing behavior.
- **No pull requests.** Solo repo — commit to `master`, or branch and merge locally
  (`git merge --no-ff`, verify the merged tree, then delete the branch). Don't open PRs.
- TDD where it pays. `units` is tested hardest on purpose: a quiet bug there produces wrong
  measurements, and wrong measurements waste lumber. **The r3f viewport has no unit tests
  by design — verify it by driving a real browser, not by asserting on mocks.**
- When a review finding conflicts with what a plan or spec says, that's a human decision,
  not one to resolve silently either way.
- Prefer closing latent bugs over deferring them, including ones only reachable on a future
  platform — the storage seam exists precisely so a desktop build stays cheap.
- **This file is the rules; `docs/history.md` is the record.** When a round ships, add a
  table row and promote any new prohibition into an invariant — do not paste the narrative
  back in here.
