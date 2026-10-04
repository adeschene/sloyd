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

