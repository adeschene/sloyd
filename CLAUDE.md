# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Deployment specifics for this host live in `DEPLOYMENT.local.md` (gitignored).

---

## Status

**v1 shipped**, followed by a polish pass (unique board names, `NameField`,
`Delete`/`Backspace`, origin axes, a settled grid, a stable gizmo), follow-ups 29-30
(a gizmo size ceiling, a separate origin-lines checkbox), **v2** (two-state grain
orientation, schema version 2, the reorient-pivot fix, wood grain textures), and now
**v3**: posture (a board can finally stand up), part-local grain (any of a board's
three dimensions, not just its length), and log-derived grain textures — and then a
short post-v3 pass fixing two bugs found in use (`DimensionField` and `NameField`
both displaying, and in `NameField`'s case writing, stale text after an external
change landed while the field had focus) plus a plywood-grain regression from v3
itself — then **joinery** (a board can have stock removed from it), the **cut list**
(the numbers you take to the bench), **cut list diagrams** (each part's joinery drawn
on the sheet, because the prose setup lines are hard to read at the bench), a
**label layout round** closing the diagrams' one user-visible gap: labels that
overlapped or bled past the outline because nothing measured the text being placed —
a **per-face diagrams round**, closing the diagrams' other one: perpendicular
cuts on the same face used to fragment into two disconnected figures instead of
drawing together, crossing, in one — a **board-feet round**, adding the
purchasing number (board feet for solid stock, square feet for sheet goods) beside the
bench numbers already on the sheet — a **sheet-nesting round**, closing the cut
list's last §7 non-goal: a sheet count and a guillotine-cuttable layout drawing for
every sheet-goods group, schema version 5 — and now **snap-move**, a SketchUp-style
Move tool: grab a corner, edge midpoint or face centre of one board, click one on
another, and the first board moves so the two points coincide exactly. Snap-move is
**not** a cut-list descendant, unlike the five rounds before it; it is the first work
on the viewport's *interaction* surface since the gizmo size ceiling (follow-up 29),
and the first new tool the app has had — followed immediately by a **selected-board
grabs** round narrowing that tool's grab set to the currently selected board, which is
the first correction snap-move needed in use — and now **cut-aware snap points**, which
closes follow-up 99 by having every `Cut` contribute snap points of its own (a dado's
floor rectangle and the two shoulder lines at its mouth), so the operation the Move tool
most obviously exists for — seat a shelf into a side panel's dado — can finally be done
exactly rather than by snapping to a face centre and nudging. None of those three made a
schema change — `CURRENT_VERSION` stayed 5 through all of them — and now **guide points
and the tape measure**, which does: press `T`, click a snap point to anchor, hover a
second to read the distance in an overlay, then click to place a persistent **guide
point** or type a length to place one that far along the anchor→hover ray. Guides are
document data (**schema version 6**), snappable by the Move tool, drawn as smaller
"resting" markers that grow when hovered, hidden by a Guides checkbox, and listed in a
sidebar panel — and then **type-anywhere distance entry**, a short round making that
typed path reachable rather than merely present — and now **cardinal guide points**, which
gives the tape a **world-axis lock**: with an anchor set, `X`, `Y` or `Z` locks that axis
and a typed distance places a guide that far along it, so a guide can go 3" straight up
from a corner without a second snap point happening to lie in that direction. No schema
change — `CURRENT_VERSION` stays 6 and no migration step was added. Static SPA,
containerized, 828/828 tests passing across 33 files.

Host-specific deployment detail — hostname, container name, proxy configuration, and
the manual steps a human has to perform — lives in `DEPLOYMENT.local.md`, which is
gitignored. Read that file before deploying; it is not in the public repo.

**The cut list line of work is CLOSED as of 2026-08-01** — cut list, diagrams, label
layout, per-face views and board feet are all shipped and merged to `master`. Do not
treat any of the five as in-flight.

**The cardinal guides round is NOT in production and is NOT merged**, which is what keeps
the paragraph below true. It sits complete on `feat/cardinal-guides`, verified against the
dev server (`docs/browser-verification-cardinal-guides.md`), awaiting a whole-branch review
and a merge the user performs. Rolling back past it would cost nothing at all if it does
ship: it changes no schema, so a document saved by it reads `version: 6` and the current
production image opens it unchanged, guides and all.

**Production matches `master` as of 2026-08-04, both of that day's rounds included.** The
tape measure and guide points (`dbca088`, bundle `index-BFdaQ-al.js` →
`index-BV9UlR3E.js`) and then type-anywhere distance entry (`1e61eae`,
`index-BV9UlR3E.js` → `index-BvW6so6V.js`) were each merged and deployed the same day, as
cut-aware snap points, snap-move and selected-board grabs were before them — unlike the
three rounds before *those*, which sat merged and held back at the user's choice. **The
live schema frontier is now v6, not v5** — the paragraph further down describing v5 as the
first bump to reach production is history, not the current gate; see the v6 rollback note
below it. `DEPLOYMENT.local.md` carries both runbook entries and what each could and could
not confirm live: the guide-points deploy confirmed the tool's *arming* surface only, and
the type-anywhere deploy confirmed **nothing** of its own change, because the readout
renders only once the tape is anchored and anchoring needs a board — so the standing
localStorage rule below applied totally rather than partially. `sloyd.autosave.v1` was
confirmed absent in the verifying browser after both.

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

## What Sloyd is

Modelling and planning for woodworking projects: lay out the parts of a build in 3D,
see how they fit, and get the numbers you need at the bench (dimensions, cut list).
Not a general-purpose CAD tool — the domain assumptions (boards, stock thickness,
fractional inches) are the point.

The name is from *sloyd* (Swedish *slöjd*), the Scandinavian handicraft education
tradition built around hand woodworking.

## Architecture

Static single-page app. No server, no database, no API, no env vars.

**Governing rule: the plain-JSON document is the source of truth; the Three.js scene
is derived from it and is never authoritative.** A document is
`{ version, name, units, stock, guides: [...], boards: [...] }` — `stock` (the
sheet-nesting round's addition, `{ kerf: number }`) is the first document-level field
alongside `units` that isn't `boards`, and `guides` (the guide-points round's addition,
`GuidePoint[]`) is the second. Dragging a board in the viewport computes a
number, writes it to the document, and the scene re-renders from the updated document
— never the reverse. This is what keeps undo, save/load, and export simple: they only
ever serialize or restore the document.

Module dependency order (each layer only depends on the ones before it):

1. **`units`**, then **`document`**. `units` is the bottom layer and imports nothing;
   `length.ts` parses/formats fractional inches (e.g. `24 1/2"`) and `quantity.ts` — the
   board-feet round's addition, a second leaf beside it — formats decimal board-feet and
   square-feet quantities. `document` sits directly above it and owns the document
   schema, board geometry, validation, and versioned migration. `document/names.ts` is a
   leaf alongside it, importing only the `Board` type. **`document/snapPoints.ts` (the
   snap-move round's addition) is the second such leaf, and it is the first new one
   since the three `formatLength` edges below were declared settled — it does not take
   that edge.** A snap point carries no printed string: it is three numbers, a kind and
   an owner, and nothing about it is ever read off a page. So the "prints identically"
   argument that justifies the three imports below simply does not reach it. Worth
   stating rather than leaving to inference, because "everything under `document`
   imports `formatLength` now" would be the wrong generalisation to carry into the next
   leaf. The cut-aware snap points round widened `snapPoints.ts` *sideways* without
   touching that: it now imports `./cuts` as well as `./types` and `./geometry`, because
   the local→world mapping needs `cuts.ts`'s `Point` type and `geometry.ts` sits below
   `cuts.ts` and so cannot host it. It still does **not** import `../units`, which is
   the point of this paragraph — a snap point still carries no printed string, and no
   amount of new geometry changes that.

   **The cut list added the one edge between them:** `document/cutlist.ts` imports
   `formatLength` from `units`, because a row's grouping key is built out of formatted
   strings. Part identity is defined as *"prints identically"* — two boards belong on
   one row when the numbers a person reads off the sheet are the same — so the key
   must be produced by the very function that does the printing. Comparing raw floats
   instead would split a row over a difference no one can see or cut to. The edge
   creates no cycle (`units` still imports nothing, and nothing above `document`
   changed), so this is a layer boundary moving by one, not a violation. Injecting the
   formatter as a parameter was considered and rejected: it would move the definition
   of part identity out to whichever call site passed the function, which is exactly
   the decision that should live in one place next to the grouping code.

   **The cut list diagrams made it a settled boundary rather than a one-off.**
   `document/diagram.ts` is the *second* thing in `document` to import `formatLength`
   from `units`, for the identical reason: a diagram's labels have to be produced by
   the same function that prints the row text next to it, or a dimension could read
   differently in the two places a person looks at it on one sheet. One `document →
   units` import could be argued as an exception; two, for the same reason, is the
   edge the layer order actually has.

   **The board-feet round widened the same edge rather than opening a new one.**
   `cutlist.ts` also imports `formatBoardFeet`/`formatSquareFeet` from
   `units/quantity.ts`. This is a different justification from the `formatLength` edge
   above — board feet is not a grouping key, so the "prints identically" argument
   doesn't reach it — but `cutlist.ts` already crossed into `units`, so nothing new
   opens: it is the cheapest available answer to "where does this go."

   **The sheet-nesting round opened its own `document → units` import rather than
   widening an existing one, because `nesting.ts` isn't `cutlist.ts`.** `document/
   nesting.ts` imports `formatLength` directly, for the same reason `cutlist.ts` and
   `diagram.ts` did: `PlacedPart.dims` and `UnplaceablePart.dims` are printed strings,
   and the function that prints a dimension anywhere on the sheet has to be the one
   that prints it here too, or a turned part's layout label could read differently
   from the cut-list row for the same board (this exact defect shipped in Task 7's
   first draft and was fixed — see follow-up 90). This is now the *third* leaf under
   `document` making the identical `formatLength` import, which is what makes it a
   settled boundary rather than something to keep re-litigating per file.
2. **`store`** (Zustand + snapshot-based undo/redo) and **`storage`** (the
   `StorageAdapter` seam) — both sit above `document`.
3. **`viewport`** (react-three-fiber scene, camera, grid, gizmo) and **`panels`**
   (React forms: toolbar, parts list, properties panel) — both read/write through the
   store, and both also import `document` directly for its exported types and
   constants (`panels` for `MATERIALS`, `DocumentError`, `Rotation`, `uniqueName` and
   `buildCutList`; `viewport` for geometry helpers, and — since the snap-move round —
   `boardSnapPoints` plus the `SnapPoint`/`SnapKind` types, which `MoveTool`,
   `SnapMarker` and `snapPick` all take from `document`, joined since the cut-aware snap
   points round by `snapPointsFor` (what `MoveTool` now calls in both branches) and
   `sameSnapPoint` (which moved *down* into `document/snapPoints.ts` so the store could
   reach it, and which `snapPick.ts` now imports rather than owns). `store` takes the
   same two, which is the whole reason `sameSnapPoint` had to move: the store cannot
   import from `viewport`.) `panels` additionally imports the `storage` adapter singleton
   for export/import. These are legitimate downward imports, not a layering
   violation — `document` and `storage` sit below both.

   **The type-anywhere round opened the FIRST `viewport → units` edge, and it is the
   first import of its kind in the repo.** `viewport/TapeTool.tsx` imports `parseLength`
   from `units/length.ts`. Legal without argument — `units` is the bottom layer and
   imports nothing, `viewport` sits two layers above it, and no cycle is possible in
   that direction — but it is recorded here for the same reason the three `document →
   units` edges above each got a paragraph: so the next file that needs it follows a
   stated boundary instead of re-deciding one. It is also *appropriate* rather than
   merely permitted. The tape's live preview has to know what the text the user typed
   MEANS in inches before it can place a marker, and deciding that is the entire job of
   `parseLength` — the one function in the app that owns the fractional-inch grammar.
   The alternatives are both worse in the way the `formatLength` edges already
   litigated: re-deriving the parse in the viewport puts a second answer to "how long is
   `1-1/2`" in the codebase, and parsing in the panel and passing a number through the
   store makes the store hold a derived value beside the string it was derived from.
   Note what this edge is NOT: `viewport` still does not import `formatLength`, because
   nothing in the 3D scene prints a length — the readout that does is a `panels`
   component. A marker is a position, not a label, which is the same distinction that
   keeps `document/snapPoints.ts` off this edge entirely.

Notable modelling detail: a board's `position` is the **min-corner** of its world
bounding box, not its center. This matters anywhere geometry or the gizmo touches
position math.

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`. Nothing else touches `localStorage` or the filesystem directly. A
future desktop build would be a second implementation of that same interface, not a
parallel code path.

**Versioning:** every document carries a `version` field, and every load path (open,
import, autosave-restore) runs through `migrateDocument` before the document is
trusted. This is what lets the schema evolve (e.g. for the cut list) without breaking
files saved by earlier versions. `CURRENT_VERSION` is 6, and migration is a real
chain: each step runs on raw data, in version order, one version at a time
(`if (d.version < 2) …; if (d.version < 3) …; if (d.version < 4) …`), before any board
reaches `validateBoard`. A v1 file walks 1→2→3→4 — `foldRotationToV2` (180→0, 270→90)
first, then `addPostureToV3` (`standing` → `posture`, `grain` defaulted), then
`addCutsToV4` (`cuts` defaulted to `[]`) — which is the worked example every future
migration step should match. See invariant 11 for why the steps run where they do.
`addCutsToV4` is the mildest step in the chain (its default is empty, and
`validateBoard`'s fallback would be the same empty array) and it runs in the same
place anyway, on purpose: the chain's value is that every step has one shape, so the
next step that *does* have a divergent fallback inherits the correct structure rather
than depending on its author noticing.

**The v4→v5 step breaks that shape on purpose, and is the first step in the chain that
is NOT a `rawBoards.map` call.** `foldRotationToV2`, `addPostureToV3` and `addCutsToV4`
are all per-board upgrades, run before `validateBoard` because that validator's
fallback for a missing field is a legal-but-wrong value rather than an absence
(invariant 11). `stock: { kerf: number }` is a **document-level** field — there is no
per-board version of a kerf — so it has no `rawBoards.map` step at all. It is handled
the way `units.precision` already was: read defensively off the raw document
(`d.stock`), and defaulted to `0.125` when absent, non-numeric, or outside `[0, 1)`.
The version bump is not needed to upgrade an old file — an absent `stock` defaults
cleanly regardless of `CURRENT_VERSION`. It is needed for the refusal gate at the
*other* end: without the bump, a v4 build would open a file carrying a user-set kerf,
silently drop the field on save, and print a different sheet count than the build that
wrote it — a wrong purchasing number with nothing to indicate anything was lost. See
the sheet-nesting design's §2.2 for the full argument, which is the same one that
justified `addCutsToV4` despite its default matching the validator's own fallback: the
chain's value is that every version number means something definite, not that every
step changes what a fresh document looks like.

**The v5→v6 step is the SECOND of that shape, which is what makes it the pattern for
document-level fields rather than an exception — but its bump argument is a different
one, and copying v5's wording would have been wrong.** `guides: GuidePoint[]` is
document-level (there is no per-board version of a guide), so like `stock` it has **no
`rawBoards.map` step at all**: it is read defensively off the raw document and defaulted
to `[]` when absent or not an array, and `validateGuides` then drops any guide whose `at`
is not three finite numbers or whose `id` is not a non-empty string — never refusing the
file, because a saved document must always open. What does *not* carry over is v5's
justification. Guides produce no number: nothing on the cut list, in the nesting or in the
board-feet totals reads them, so a v5 build and a v6 build print exactly the same sheet.
The argument here is plainer and weaker, and it is still what the gate exists for:
**silent data loss on round-trip** — a v5 build opens a v6 file, drops every guide the
user placed, autosaves, and they are gone with nothing on screen indicating it. As with
v5, the bump is **not** needed to upgrade an old file. See the guide-points design's §2.2,
which states this explicitly so the next person adding a document-level field reads which
of the two arguments applies to theirs rather than inheriting the wrong one.

Full detail: `docs/superpowers/specs/` (design) and `docs/superpowers/plans/`
(implementation plan). This section is a summary, not a replacement for either.

## Where things live

```
src/
├── units/
│   ├── length.ts             parseLength / formatLength. Imports nothing.
│   └── quantity.ts           formatBoardFeet / formatSquareFeet — decimal quantities,
│                             two places fixed, not the fractional-inch precision
│                             length.ts uses. Imports nothing; a sibling leaf, not a
│                             widening of length.ts (a volume is not a length)
├── document/
│   ├── types.ts             Board, GuidePoint, SloydDocument (now carries
│   │                        `stock: { kerf }` and `guides: GuidePoint[]`),
│   │                        Rotation, Posture, Grain, MATERIALS (`sheet` is now a
│   │                        `SheetStock` object, not a boolean), SheetStock,
│   │                        isSheetGood, sheetStockOf
│   ├── geometry.ts          axisDimensions (single source) / boardExtents /
│   │                        boardCenter / reorientedPosition
│   ├── names.ts             uniqueName / dedupeNames. Imports only Board.
│   ├── cuts.ts              cutRegion / boardSolids (split, drop, merge) /
│   │                        boardEdges / solidWorldBox / cutLabel / stockProbe
│   │                        (builds the shared cell grid once and returns a
│   │                        predicate: does a board-local point touch any
│   │                        remaining stock? boardEdges' four-cell configuration
│   │                        test generalised from a segment to a point — up to
│   │                        eight cells — with CLOSED spans, so a point landing
│   │                        on a split plane sees both sides). Pure; imports
│   │                        only ./geometry and ./types, never ./document
│   ├── cutlist.ts           buildCutList: group by material+thickness, collapse
│   │                        identical parts into rows, phrase each cut as a setup
│   │                        line; accumulates each row's and group's exact stock
│   │                        (board feet, or square feet for sheet goods) as the
│   │                        grouping loop visits each board — never from the row's
│   │                        rounded, representative dimensions. Pure; imports
│   │                        ./types, ./geometry, ./cuts, ../units/length and
│   │                        ../units/quantity — never ./document
│   ├── depthField.ts        buildDepthField: split a face at every cut boundary on
│   │                        both in-plane axes, cover each cell with the MAXIMUM
│   │                        depth among covering cuts (0 if none), emitted one rect
│   │                        per cell — no merge step. Same split/cover skeleton as
│   │                        cuts.ts's boardSolids, one dimension down, with a
│   │                        different cover operation — see invariant 20. Pure;
│   │                        imports only ./geometry and ./types
│   ├── diagram.ts           buildDiagrams: one view per (face, from) — near/far
│   │                        split into separate views so perpendicular cuts on one
│   │                        face draw together instead of fragmenting it (follow-up
│   │                        72) — board inches, cut bands and labels, built on
│   │                        depthField for crossing regions. Pure; the second thing
│   │                        in ./document to import from ../units/length
│   ├── nesting.ts           buildNesting: shelf first-fit-decreasing packer for one
│   │                        sheet-goods group's boards (never CutListRows — the
│   │                        fourth 55/55a instance). Takes stock size, rotation
│   │                        policy and kerf; emits placed parts, an unplaceable list
│   │                        and formatted labels. The fits-test carries an epsilon —
│   │                        see the new invariant below. Pure; imports ./types and
│   │                        ../units/length — the third leaf under ./document to
│   │                        import from units, never ./document
│   ├── snapPoints.ts        boardSnapPoints: a board's box candidates — the
│   │                        3x3x3 lattice of {min, mid, max} per world axis,
│   │                        minus the volume centre; the count of axes at `mid`
│   │                        names the kind (0 corner, 1 edge-mid, 2 face-centre).
│   │                        26 on an uncut board, but NOT unconditionally 26:
│   │                        since design §5.1 the lattice is filtered through
│   │                        stockProbe too, so a rabbet's flush-end mouth row is
│   │                        withheld — with one explicit exception, a board whose
│   │                        cuts consumed it entirely (boardSolids empty) keeps
│   │                        all 26, because the ghost box IS drawn (invariant 21).
│   │                        cutSnapPoints: the up-to-15 a cut defines (floor
│   │                        rectangle 9 + the two shoulder lines at the mouth 6,
│   │                        the mouth's middle row excluded because it spans the
│   │                        opening), offering those touching remaining stock —
│   │                        15 for a dado, 12 for a rabbet, with no cutLabel
│   │                        branch. snapPointsFor: the union, called in BOTH of
│   │                        MoveTool's branches. sameSnapPoint lives here rather
│   │                        than in viewport/snapPick.ts because the store needs
│   │                        it and cannot import viewport — one home, not a
│   │                        re-export. guideSnapPoints: one candidate per guide,
│   │                        the guide-points round's whole provider — the third
│   │                        one, and the first that is not over boards.
│   │                        offsetPoint(anchor, toward, distance): the tape's one
│   │                        subtraction, returning null for a zero-length
│   │                        direction (§1.2) or a non-finite distance rather than
│   │                        letting NaN into the document. towardFor(anchor,
│   │                        axis, hover): the cardinal round's addition and the
│   │                        tape's ONE direction source in both modes — locked,
│   │                        the anchor plus exactly 1" along the world axis (so
│   │                        offsetPoint's zero-length refusal is unreachable
│   │                        there); unlocked, the hover unchanged. Called from
│   │                        BOTH TapeTool's preview memo and TapeReadout's
│   │                        commit(), which is what keeps the marker and the
│   │                        placement agreeing under the lock the way round 2's
│   │                        shared offsetPoint kept them agreeing on the ray.
│   │                        The axis WINS over a hover, never falls back to it
│   │                        (§5.1). tapeAxisFromKey(key): the one X/Y/Z mapping,
│   │                        beside the type it produces rather than in either of
│   │                        the two keyboard handlers that call it. Exports
│   │                        TapeAxis ('x' | 'y' | 'z'), whose doc comment carries
│   │                        the world-vs-board-local argument. Exports SnapKind (now
│   │                        four, 'guide' added) / SnapOwner / SnapPoint /
│   │                        BoardSnapPoint — the owner is a discriminated union so
│   │                        guides and the tape measure added a member rather than
│   │                        reopening the picker, and BoardSnapPoint is what makes
│   │                        the widening safe (invariant 26). Pure; imports
│   │                        ./types, ./geometry and ./cuts (for Point and
│   │                        stockProbe) — notably NOT ../units, unlike cutlist.ts,
│   │                        diagram.ts and nesting.ts: a snap point carries no
│   │                        printed string, so that boundary is untouched here
│   └── document.ts          create / validate / migrate (v1->v2->v3->v4->v5->v6
│                            chain, v5 and v6 document-level rather than per-board
│                            — see Architecture); validateGuides (drop malformed,
│                            never refuse the file); createGuide; re-exports the
│                            other nine
├── store/store.ts           Zustand store, snapshot undo/redo, gesture coalescing;
│                            also `tool` ('select' | 'move' | 'tape') and three
│                            HELD POINTS as view state beside selectedId —
│                            `grabbed` (BoardSnapPoint | null, the narrow type on
│                            purpose: invariant 26), `tapeAnchor` and `tapeHover`
│                            (both SnapPoint | null, wide because either can hold a
│                            guide) — with setTool / grabSnapPoint / cancelGrab /
│                            commitSnapMove / setTapeAnchor / clearTapeAnchor /
│                            setTapeHover, plus addGuide / removeGuide /
│                            clearGuides, plus dropHeldIfGone(boardId) — the
│                            guide-points round's generalisation of
│                            dropGrabIfGone over all three fields, which
│                            addCut/updateCut/removeCut AND updateBoard each call
│                            AFTER their edit(): a held point survives iff it is
│                            still among that board's snapPointsFor output. Which
│                            writers are survival-tested, which are
│                            owner-conditional and which are blanket is enumerated
│                            at `tapeHover`'s declaration, which is the single
│                            source of truth for it — see invariants 24, 25 and 26.
│                            Plus `tapeAxis` (TapeAxis | null) and setTapeAxis,
│                            the cardinal round's addition: NOT a fourth held
│                            point and deliberately NOT invariant 24's fourth
│                            instance — it holds an enum, not a world position,
│                            so it cannot go stale and must not be given clearing
│                            rules by analogy. Its one rule is structural (an
│                            axis with no anchor names no ray, so it lives
│                            exactly as long as tapeAnchor) and is stated as a
│                            RULE over the anchor-clearing set at `tapeAxis`'s
│                            own declaration rather than as a list of writers.
│                            Read it there; do not restate a count of them
├── storage/
│   ├── types.ts             the StorageAdapter interface
│   └── browser.ts           BrowserStorageAdapter + the `storage` singleton
├── viewport/
│   ├── Viewport.tsx         Canvas, lights, grid, shadow receiver, camera keys;
│   │                        renders <MoveTool />, <TapeTool /> and (when
│   │                        showGuides) <GuideMarkers />, hides <Gizmo /> outside
│   │                        select mode, gates onPointerMissed, crosshair cursor.
│   │                        Sits inside App's `.viewport-stack` wrapper, which is
│   │                        what TapeReadout positions against
│   ├── BoardMesh.tsx        one board, derived from the document each render;
│   │                        falls back to a translucent ghost box at the AABB
│   │                        when boardSolids is empty — see invariant 21. Takes a
│   │                        required `selectable` prop gating onClick, so the Move
│   │                        tool's commit click cannot select the board it drops
│   │                        onto
│   ├── MoveTool.tsx         the Move tool: pointerdown/move/up on gl.domElement
│   │                        (canvas-relative pixels are what pickSnapPoint wants,
│   │                        and it avoids an invisible full-screen plane every
│   │                        other hit test would then have to exclude), hover held
│   │                        in a ref and committed to state only on change, and
│   │                        the grabbed + hovered markers. The candidate memo is
│   │                        TWO sets, not one set with a filter: before a grab,
│   │                        only the SELECTED board's points (empty when nothing
│   │                        is selected, so nothing is grabbable); after a grab,
│   │                        every board's points minus the grabbed board's own,
│   │                        so the self-snap case draws no marker. Targets are
│   │                        deliberately unrestricted — see design §3. BOTH
│   │                        branches go through snapPointsFor, so a cut shoulder
│   │                        is both grabbable and — the point of the cut-aware
│   │                        round — a TARGET on the board that is not selected.
│   │                        Guides join the POST-GRAB branch only (targets, never
│   │                        grab sources) and only when showGuides; `guides` and
│   │                        `showGuides` sit in the dep list BESIDE selectedId,
│   │                        which invariant 15 is about. The pre-grab branch
│   │                        needs no board-owned filter — it is already one
│   │                        board's points (follow-up 132)
│   ├── TapeTool.tsx         the Tape tool: MoveTool's sibling, same raw-DOM
│   │                        pointer handling on gl.domElement, same picker. Its
│   │                        candidate set withholds NOTHING in either direction —
│   │                        no self-snap case (measuring corner-to-corner on one
│   │                        board is ordinary) and no selected-board restriction
│   │                        (measuring BETWEEN boards is most of what it is for,
│   │                        which is why design §4.2's two selection clears are
│   │                        prohibitions). Reads s.tapeHover directly rather than
│   │                        holding a second copy, so marker, line and readout
│   │                        cannot diverge; LATCHES the hover while anchored,
│   │                        because the only route to typing a distance is off
│   │                        the canvas. Draws the measuring line (drei <Line>,
│   │                        solid, toneMapped off so it matches the marker hue).
│   │                        SUBSCRIBES to tapeAxis (not merely lists it in a dep
│   │                        array — a dep entry over a value nothing subscribes
│   │                        to is invariant 15's failure mode wearing the right
│   │                        clothes), derives the preview through towardFor so
│   │                        the marker and the placement share one direction
│   │                        source, and while an axis is locked with nothing
│   │                        typed draws NO line at all — a decision, not an
│   │                        omission; the honest alternative is follow-up 130's
│   │                        construction line. A click while locked RE-ANCHORS
│   │                        and keeps the lock instead of placing a guide
│   ├── GuideMarkers.tsx     every guide in the document, drawn whenever guides
│   │                        are shown and independent of any tool — a guide is
│   │                        document data, so it is visible in select mode too.
│   │                        Reuses SnapMarker in its RESTING variant; the hovered
│   │                        marker is drawn by whichever tool is hovering it, on
│   │                        top and at full size, which is what produces the
│   │                        growth
│   ├── SnapMarker.tsx       one screen-constant, always-on-top marker
│   │                        (depthTest off, so an occluded candidate's pick is
│   │                        visible). Owns the four off-palette colours, the ring
│   │                        and MARKER_PX/RING_PX/RESTING_PX — all browser-settled.
│   │                        RESTING_PX is the guide-only smaller, ringless
│   │                        variant: guides are the only points drawn when nothing
│   │                        hovers them, so growth is what replaces "the marker
│   │                        appeared" as the pick confirmation (design §5.2)
│   ├── snapPick.ts          pickSnapPoint: nearest candidate in SCREEN space
│   │                        within radiusPx, ties broken by depth (nearer the
│   │                        camera wins), and an exact depth tie keeps the
│   │                        first-found — which is what makes a guide sitting on
│   │                        a board point deterministic for a fixed candidate
│   │                        order (follow-up 133). GENERIC in the candidate type
│   │                        since the guide-points round, so a board-only array
│   │                        yields a BoardSnapPoint; currently unrealized, both
│   │                        call sites pass a union. Plus PICK_RADIUS_PX.
│   │                        sameSnapPoint is
│   │                        no longer here — it moved down into document/
│   │                        snapPoints.ts so the store could reach it, and this
│   │                        file imports it from there (one home, not a
│   │                        re-export, so there is no second name for it to be
│   │                        found under). `project` is a callback, not a camera —
│   │                        that is what keeps THREE out and makes it
│   │                        unit-testable. Pure
│   ├── pointer.ts           CLICK_DRAG_SLOP_PX, shared by BoardMesh and MoveTool
│   │                        rather than copied — the follow-up 64 drift shape
│   ├── OriginAxes.tsx       origin axis lines, R=X G=Y(up) B=Z; dashed = negative
│   ├── gridDensity.ts       grid tier ladder (1in -> 1ft -> 12ft). Pure.
│   ├── screenScale.ts       px-per-inch + screen-stable dash scale. Pure.
│   ├── Gizmo.tsx            TransformControls, 1/16" snapping
│   ├── gizmoScale.ts        gizmo size ceiling + grabbable floor. Pure.
│   ├── extent.ts            SCENE_EXTENT, shared by Viewport and OriginAxes
│   ├── grainFaces.ts        faceGrainKinds (per-face cut) + grainFamily; re-exports
│   │                        axisDimensions from document/geometry.ts. Pure.
│   ├── grainTiling.ts       per-face UVs: tile size, swap, per-board offset,
│   │                        boardUVSignature. Pure.
│   ├── grainLog.ts          the log a board was cut from: ring radii (bandRadius),
│   │                        wobble, seededRandom/hash. Pure.
│   └── grainTexture.ts      seeded canvas grain textures, cached, never disposed
├── panels/
│   ├── DimensionField.tsx   the validating fractional-inch input; min/max
│   │                        REFUSE out-of-range entry rather than clamping
│   ├── NameField.tsx        part name; commits on blur/Enter, empty reverts
│   ├── Toolbar.tsx          project name, Add board, Cut list, undo/redo, the
│   │                        Select / Move / Tape button trio, view toggles
│   │                        (Grid, Origin, Guides); plus the "Select a part to
│   │                        move" hint, shown when move is armed with nothing
│   │                        selected. The Move button stays ENABLED — the hint
│   │                        explains the state instead of removing the control
│   ├── TapeReadout.tsx      the tape's DOM overlay: the measured distance and the
│   │                        typed-length input. A real <input> outside the Canvas
│   │                        (not drei Html), so parseLength and the app's own
│   │                        field styling apply; renders nothing without an
│   │                        anchor. Placed inside `.app-shell` on purpose, so the
│   │                        cut list's `inert` still covers it. Owns the AXIS
│   │                        CHIP (the app's existing active-control idiom, brass
│   │                        on graphite — not a fifth off-palette hue), and the
│   │                        CAUSE-CARRYING refusal that closes follow-up 144:
│   │                        TapeError is 'no-direction' | 'unparseable' |
│   │                        'degenerate' | null, printed as one line in the
│   │                        hint's own slot, with TWO clearing effects rather
│   │                        than one over-wide one — [text] clears only
│   │                        unparseable, [hovered, axis] only the two a pick or
│   │                        a lock can answer. Also owns a TWIN X/Y/Z branch in
│   │                        its onKeyDown beside Escape's, which is forced
│   │                        rather than redundant: App's listener early-returns
│   │                        on isTextEntry, so once this box has focus it never
│   │                        sees another key
│   ├── GuidesList.tsx       one row per guide, coordinates through formatLength
│   │                        at the document's precision, an x per row and a Clear
│   │                        all. NO selection model, deliberately — design §7
│   ├── PartsList.tsx  FileMenu.tsx
│   ├── Properties.tsx       board fields + the Cuts section; CutRow is its own
│   │                        component so a cut's error dies with the cut
│   ├── diagramScale.ts      fitView (uniform scale + sliver clamp + height ceiling) /
│   │                        bandOn (axis-agnostic centred widening to MIN_FEATURE,
│   │                        ordering-guarded). Pure.
│   ├── diagramLabels.ts     LABEL_SIZE / CHAR_W / labelHeight (LABEL_BOX_H = 25, a
│   │                        rounded-up bound on the measured 23.68-unit glyph box,
│   │                        argument-free — see invariant on why) / labelWidth
│   │                        (character count × monospace advance)
│   │                        / packRow (ideal centres in, non-overlapping centres
│   │                        out, axis-agnostic) / fitLabel (the sheet-nesting
│   │                        round's addition — a three-tier fallback ladder, full
│   │                        / name / index, for a label that has no neighbour to
│   │                        pack against because it lives inside its own disjoint
│   │                        rect). Pure; the arithmetic substitute for
│   │                        getComputedTextLength(), which is 0 under jsdom.
│   ├── PartDiagram.tsx      one view, drawn as SVG: outline, hatched/cross-hatched
│   │                        cut and crossing regions, leader rows below for
│   │                        horizontal-axis cuts and rotated (-90°) leader columns
│   │                        at left for vertical-axis cuts (both packed via
│   │                        packRow). Formats nothing — every label string arrives
│   │                        from buildDiagrams
│   ├── SheetLayout.tsx      one SVG per sheet in a nesting: outlined parts, light
│   │                        fill, waste left white; labels via fitLabel's ladder,
│   │                        never packRow (every label's rect is already disjoint).
│   │                        NOT an extension of PartDiagram — a sheet with parts on
│   │                        it and a board with cuts in it are different drawings
│   │                        that happen to both be SVG. Formats nothing — every
│   │                        string, including a placed part's dims, arrives from
│   │                        buildNesting
│   └── CutList.tsx          the printable sheet: derives from the document on every
│                            render, owns Escape-to-close and takes focus on mount,
│                            calls formatLength never, and owns the Diagrams toggle
│                            (none / joinery only / all) and the Sheet layouts toggle
│                            (on / off) — both local view state
└── App.tsx                  layout, autosave/restore effects, undo keybindings, the
                             `.app-shell` wrapper that goes `inert` behind the
                             cut list, the `.viewport-stack` wrapper TapeReadout
                             positions against, and `showGuides` as local view
                             state prop-drilled to Viewport and Toolbar (it joins
                             `shortcutsSuspended`, NOT the store's `tool`). `M`,
                             `T`, `X`/`Y`/`Z` and Escape all live inside the ONE
                             existing keydown effect, inheriting its cutListOpen
                             and text-entry guards rather than adding a listener.
                             The axis block's modifier test is part of its
                             CONDITION rather than an early return like M's and
                             T's, because Ctrl+Z is `e.key === 'z'` and a
                             returning guard would swallow undo; it acts only
                             when the tape is armed AND anchored, and otherwise
                             falls THROUGH rather than swallowing the key.
                             Escape's ladder is now grabbed -> tapeAxis ->
                             tapeAnchor -> leave tool
```

Deployment scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`security-headers.conf`.

## Invariants — break these and things fail in confusing ways

Each of these cost real debugging during v1. They are load-bearing, not style.

1. **The document is the source of truth.** No component may hold geometry state that
   isn't derived from it, and nothing may write to a Three.js object's transform as a
   way of recording a change.
2. **`position` is the min-corner**, not the center. `boardCenter` exists because
   Three.js meshes are center-origin and the document is not. Reorienting a board
   pivots it about itself — `reorientedPosition` in `document/geometry.ts` is the
   only place that arithmetic lives, and `store.updateBoard` is what applies it,
   whenever a patch changes `rotation` or `posture` without carrying its own
   `position`. `reorientedPosition` takes the whole patch (`Partial<Board>`), not just
   `{ rotation, posture }` — a patch that also changes a dimension needs the pivot
   computed from the *post-patch* extents, and `store.updateBoard` passes the patch
   straight through rather than reconstructing a narrower object, for the same
   undefined-overwrite reason that once justified the narrower one. `grain` is
   deliberately absent from this predicate — it changes which faces show which cut,
   never a board's extents, so reorienting on a grain change would be a no-op pivot.
   **`cuts` is absent for the same reason**, and that is also why cut edits get their
   own store actions (`addCut`/`updateCut`/`removeCut`) instead of going through
   `updateBoard`: a cut removes stock from *inside* the board's AABB, so it changes
   no extent and moves nothing. **A snap move reaches the predicate and correctly
   fails it**, which is worth stating because it is the one caller that hands
   `updateBoard` a bare `position`: `commitSnapMove` patches `position` only, so
   `reorienting` is false, `reorientedPosition` is never consulted, and the explicit
   position passes straight through. That is right rather than incidental — a snap move
   translates, it never turns. A future tool that both moves and turns a board in one
   gesture must carry its own `position` in the same patch (which wins over the pivot,
   per the rule above) or it will be pivoted on top of its own translation.
3. **The `dragging` ref guard in `Gizmo.tsx`.** `TransformControls` computes motion from
   state captured at drag start; syncing the document into the proxy mid-drag makes it
   fight itself. The symptom is jitter or drift, not a crash.
4. **Gesture snapshots are lazy** — taken on the first `edit()` inside a gesture, not in
   `beginGesture()`. Eager snapshotting leaves no-op undo entries, so `Ctrl+Z` appears
   to do nothing.
5. **A field holding a local draft — `DimensionField` and `NameField` both — skips
   its adopt-external-changes effect while focused, and that effect never re-fires
   afterward, so blur must resync the display from the stored value and must not
   commit when the field was untouched.** Two distinct failure modes if either half
   is missing. Commit an untouched field and it rewrites exact stored values with
   display-rounded ones (0.7" → 11/16") — the original reason for the `dirty` guard.
   Skip the resync instead and the field shows a stale number *indefinitely* once an
   external change (a posture/rotation reorient, an undo, a future gizmo drag) lands
   while the field has focus: the effect is keyed on `[value, precision]` (or on
   `value` alone for `NameField`), so once it's skipped once for being mid-edit,
   nothing makes it re-run just because focus later leaves — only a remount (e.g.
   reselecting the part) shows the correct value again. Stored values are exact;
   display rounds.
6. **`add_header` does not merge across nginx levels.** A `location` block containing any
   `add_header` discards everything inherited — which is why `security-headers.conf` is
   `include`d in every block rather than set once on the server.
7. **`autoSave` must never throw.** It reports failure via `storage.available`, which
   drives the warning banner.
8. **Board names are unique, and enforced in four places** — `addBoard`,
   `duplicateBoard`, the name-field commit, and `migrateDocument`. Creation-only
   enforcement is not enough: an imported or hand-edited file would violate it.
   `createBoard` cannot dedupe (it has no view of the document), so any new call
   site that adds a board must pass its name through `uniqueName` itself.
   `validateBoard` trims before checking for blank — a whitespace-only name is
   blank too — so `migrateDocument` never hands `dedupeNames` something that
   trims to `''`.
9. **`NameField` commits once, on blur or Enter — never per keystroke.** An
   emptied name reverts, and that is only possible with a single commit: writing
   per keystroke and correcting on blur takes the gesture's undo snapshot before
   the correction lands, leaving an entry that undoes to nothing. Its `onCommit`
   returns the stored name because dedup can store something other than what was
   typed. The `dirty` guard (invariant 5) buys a second thing beyond the display
   staleness: without it, `commit()` ran unconditionally on every blur, so an
   untouched field blurring after an external rename landed wrote the *stale local
   text back over it* — a silent write, not just a stale display, and worse for
   being invisible until the next time something read the name.
10. **The gizmo size clamp writes `size` *before* the library's `updateMatrixWorld`,
    never `handle.scale` after it.** `size` is an input to three-stdlib's scale
    computation, so the library bakes the correction itself and nothing needs
    recomposing. Correcting the output instead lands in the re-bake trap that
    invariant 3's neighbouring comment block documents at length. Related: the clamp
    is two-sided *and* has a floor on the cap itself (`GIZMO_MIN_CAP_INCHES`) — a
    board-relative ceiling alone governs close range too and shrinks the gizmo for
    small parts the moment they are selected.
11. **Migration steps run on raw data, before `validateBoard`, in version order.**
    `validateBoard` falls back to `0` for an unknown rotation, so a fold that ran
    after it would turn every saved 270° board a quarter turn the wrong way — and
    unlike 0-vs-180, that is a different shape on screen, not just a redundant one.
    The v2→v3 step (`addPostureToV3`) has the same failure mode: `validateBoard`'s
    posture fallback is `'flat'`, a perfectly legal value, so a `standing: true`
    board that reached the validator before gaining a `posture` would come out lying
    down — silently, and only for files that already exist. Upgrade first, validate
    second, one version at a time.
12. **Grain textures are cached at module level and never disposed; per-board
    variation lives in the `uv` attribute, never on the texture.** `texture.repeat`/
    `offset`/`rotation` are per-texture state on an object every board shares —
    writing them per board would make every board on screen fight over one mapping.
    The per-board offset in `boardUVs` is zeroed on any axis a `FacePlan` marks
    `fit`: the whole tile is shown either way on a `FIT` axis, so an offset there
    buys no variation and only shifts the pattern's seam into the middle of the
    face — exactly what `FIT` exists to avoid on wood ends and plywood's ply stack.
13. **~~`axisDimensions` had a second copy in the viewport, kept from drifting off
    `document`'s `boardExtents` only by a dedicated test.~~ RETIRED in v3.** Before
    v3 the mapping from board dimensions to world axes was implicit in a boolean and
    had to be restated in two files that could disagree; a test existed solely to
    catch that drift. v3 moved `axisDimensions` into `document/geometry.ts` as the
    single source, with `boardExtents` now a direct expression of it in the same
    file and the viewport importing rather than reimplementing it. The drift test
    was deleted, not forgotten — there is nothing left for it to catch, since the
    two things it compared are now one thing.
14. **`bandRadius` is `hypot(d, k·delta)`, not an arbitrary choice of curve — and
    the tile is seamless by two different mechanisms, not one.** Because
    `r = hypot(d, k·delta)`, the in-plane offset `sqrt(r² − d²)` comes out as
    exactly `k·delta` — evenly spaced, whatever the cut distance `d`. A "simpler"
    radius (e.g. `r = k·delta` directly) reintroduces a seam that only shows up on
    a wide board, because the in-plane spacing would then vary with `d`. That
    property alone does not make the tile seamless, though: it is what the *u*
    direction (along the grain) relies on. The *v* direction (across the grain,
    the tile's two edges) is seamless for a different reason — `bandRadius` is
    even in `k` and the seed bucket is `Math.abs(k) % half`, so band `−k` is the
    exact mirror of band `+k` about the pith line, and the tile's two v edges
    carry that same mirrored curve. That is mirror symmetry, not translational
    periodicity — the pattern does not repeat every `SIZE`, it folds about the
    pith line. `grainTexture.ts`'s `woodCut` comment says this precisely; treat
    this entry as agreeing with that comment, not restating a looser version of it.
15. **Anything that memoises on what `boardUVs` reads must key on
    `boardUVSignature`, not a hand-written field list.** v3 added `grain` to what
    `boardUVs` reads (via `facePlans` → `ranks`) without updating `BoardMesh`'s memo
    dependency array, so a board's grain silently stopped turning on screen while the
    document stayed correct and the per-face material maps updated normally — which
    is exactly what made it look like it worked. No single per-task review could see
    it: the field was added in one task and consumed by the stale memo in another.
    The browser gate caught it by pixel-diffing before/after screenshots; the fix
    keys the memo on `boardUVSignature`, a derived signature that lives next to the
    code deciding what it must cover, and deliberately excludes `position`/`name` so
    dragging a board does not rebuild its geometry every frame. Joinery added `cuts`
    to it for exactly the same reason — cuts change which solids exist, so a memo
    that missed them would leave a dado invisible while the document stayed correct.
    One more thing the signature is *not*: it is identical for every solid of a
    board, because it describes the board. Anything caching per solid must not key
    on it alone. `BoardMesh` sidesteps this by building all the geometries in one
    memo that returns an array, so they are rebuilt together.
16. **Edge lines come from the cell grid, not from the solids.** The remainder around
    a dado is L-shaped in section, and an L is not a box — so the canonical case (a
    ¾"-wide, ¼"-deep dado at 6" across a 24" board) leaves three abutting solids
    covering the board's *continuous* uncut bottom face, and per-solid `EdgesGeometry`
    draws lines across it at 6 and 6¾ that correspond to no real edge. Merging in
    `boardSolids` reduces the solid count; it cannot fix this, and it is not meant to.
    `boardEdges` instead tests the up-to-four cells around each candidate segment and
    draws unless the configuration is flat (all four filled, none filled, or exactly
    two sharing a face). Cells outside the board count as empty, which is what makes
    the outer silhouette, the convex corners and the concave dado shoulders all fall
    out of one rule. `BoardMesh`'s own comment calls edge lines "the single biggest
    readability win", so this is legibility, not polish. Contiguous drawn cells on a
    line are merged into one segment — without that, a cut anywhere on the board
    fragments the lines on faces it never touches.
17. **UVs are parent-relative, and `FIT` resolves against the board, not the solid.**
    `boardUVs(board, solid)` looks a sub-box's coordinates up in the *board's* tiling,
    so the grain figure runs continuously across a dado instead of restarting at its
    edges — which is what makes a cut read as stock removed from one board rather than
    two boards pushed together. The per-board UV offset stays the board's (invariant
    12) for the same reason. `FIT` is where this is easy to get backwards: it means
    "show the whole tile on this axis", and the tile belongs to the board, so fitting
    it to the solid would squeeze plywood's whole five-ply stack into the stock that
    survived a ¼" dado when the correct picture is the plies the cut left behind.
    `FacePlan` carries `tileInches` (tile *size*) rather than a tile count precisely
    so that `FIT` and fixed tiling are one division: `u = coordinate / tileInches`.
18. **On the cut list, dimensions collapse at display precision and cuts must match
    exactly.** The two halves of a row key are built by two deliberately different
    code paths — `formatLength(n, doc.units.precision)` for every dimension, and for a
    cut the three enum fields (`face`, `from`, `across`) verbatim with raw `String(n)`
    on the three numbers (`offset`, `width`, `depth`) — and neither may be relaxed to
    match the other, in either direction. The reason is what each error costs at the bench. A
    stock dimension rounded to the nearest 1/16" costs nothing: two boards 0.02" apart
    are one board to anyone cutting them, and splitting them into two rows over a
    difference no saw can hold makes the sheet lie about how much stock to buy. A
    *cut* rounded the same way costs the joint — two dados 0.02" apart are two setups,
    and collapsing them onto one row tells the user to run one, which is a part that
    does not fit and stock already consumed. So: round what is bought, never what is
    machined. This is **not** the float-`===` hazard `cutLabel` had (see joinery's
    lesson list, item 3). That bug compared a *subtraction result* against a bound,
    where the arithmetic itself introduces the error; here both sides are stored
    values compared to stored values, and two cuts a user entered identically hold
    identical doubles. Exact comparison is the correct tool precisely because nothing
    computes these numbers on the way in.
19. **`LABEL_SIZE` has exactly one home, and `--font-num` on diagram text is
    load-bearing, not cosmetic.** `LABEL_SIZE` (`diagramLabels.ts`) is applied to the
    `<svg>` element as a `fontSize` attribute; `styles.css` must never set a
    `font-size` on diagram text (`.cutlist-diagram-overall`,
    `.cutlist-diagram-leader text`). The reason is stronger than the usual
    single-source-of-truth argument: `labelWidth`'s arithmetic (character count ×
    `CHAR_W`) is only true of the size the browser actually renders, so a second
    `font-size` living in the CSS — even one that happened to agree with
    `LABEL_SIZE` today — would be a value a future edit could drift out of step with
    silently, exactly the shape follow-up 64 already recorded once for spacing
    constants. The font-family matters for the same load-bearing reason: `--font-num`
    is a monospace stack, which is what makes a fixed units-per-glyph advance true in
    the first place. Swap it for a proportional face and every glyph's width varies,
    `labelWidth` returns a number with no relationship to what's drawn, and `packRow`
    starts placing labels on top of each other while every unit test still passes —
    because the tests assert the arithmetic, not the render. See follow-up 66 for the
    bounded, not universal, headroom that arithmetic rests on.
20. **`depthField.ts` shares `cuts.ts`'s split/cover skeleton but not its
    operation, and `boardSolids` is not reusable here.** Both split a board (or a
    face) at every cut boundary into a grid of cells. `boardSolids` then **drops**
    each cell whose centre falls inside any cut — a boolean keep/drop decision, one
    dimension (3D). `buildDepthField` instead **assigns** each cell the maximum depth
    among the cuts covering it, 0 if none — a numeric decision, one dimension down
    (2D, one face). Reaching for `boardSolids` to compute a face's depth field would
    not fit: it has no maximum to report, only a bit. Unlike `boardSolids`,
    `buildDepthField` has no merge step: it emits one `FaceCell` per grid rect and
    stops there, which is correct rather than incomplete — the hatch each cell renders
    with is an SVG `<pattern>` (`patternUnits="userSpaceOnUse"`), so adjacent cells of
    equal depth already render indistinguishably from one merged region, and the one
    place a *count* of distinct regions matters (the crossing legend) is handled by
    `diagram.ts` deduplicating crossing depths into a `Set`, not by merging cells.
    Agreement between the two is asserted by a test, `depthField.agreement.test.ts`,
    not assumed from the shared skeleton — a cell must have depth > 0 exactly when
    `boardSolids` removed stock at the corresponding column. That test's first version
    passed with the cover step broken: it asserted only *coverage* (which cells were
    cut), and a `Math.max → depths[0]` mutation — reporting the depth of an arbitrary
    covering cut instead of the correct maximum — passed all cases, because coverage
    agreement doesn't imply depth agreement. The fix asserts each region's actual
    depth value against `boardSolids`, not merely whether it was cut; after the fix,
    the same mutation fails with the exact wrong number (`0.375` where `0.125` was
    expected). Any future agreement test between a 2D derivation and its 3D source must assert
    the value the derivation claims to compute, not just where it claims to differ
    from zero.
21. **The empty-solids placeholder must stay a mesh, not a wireframe.** When
    `boardSolids` returns `[]` — a board its own cuts have consumed, follow-ups 48
    and 49 — `BoardMesh` draws a translucent ghost box at the board's AABB. The
    obvious "simplification" is to drop the fill and keep only the outline, since
    the outline is what carries the shape. That silently breaks selection:
    `THREE.Line` raycasting registers a hit only within
    `raycaster.params.Line.threshold` (default 1 world unit, so 1 inch here) of a
    drawn line, which leaves the whole interior of the ghost dead to the pointer.
    The part would look right in every screenshot and be unclickable everywhere
    except within an inch of an edge. That is a viewport-parity rule, not a
    recovery-path one: a part you can see is a part you can click, everywhere
    else in this app. (Recovery never depended on it — the parts list has always
    selected a consumed board by id, and Ctrl+Z has always reverted the edit that
    caused it. The pre-fix defect was that the part was invisible, not that it
    was unreachable.) The fill is the hit target; the outline is the legibility.
    Keep both, and test
    a change here by clicking the MIDDLE of a ghost face, never its edge. Related:
    the ghost's `depthWrite` is off so a part with no stock never occludes one that
    has some, and the placeholder deliberately rides in the existing `geometries`
    memo rather than a new one — a second memo would need its own hand-written
    dependency list, which is invariant 15's failure mode exactly.
22. **`nesting.ts`'s fits-test carries an epsilon, and this is the deliberate OPPOSITE
    of invariant 18 — not a relaxation of it.** Invariant 18 says a cut-list row's
    dimensions collapse at display precision but its cuts must match exactly, because
    both sides of that comparison are stored values a user typed, and two cuts entered
    identically hold identical doubles — nothing computes them on the way in. Here one
    side of the comparison *is* computed: `shelf.used` accumulates by addition as each
    part is placed (`x = shelf.used + kerf`, `shelf.used = x + f.w`), so `fits(x + f.w,
    stock.length)` compares a running sum against a bound — the same shape
    `cutSignature`'s comment names as the hazard that made `cutLabel` wrong 2.8% of the
    time. Tolerating float error here is the same rule as invariant 18's, applied to
    the opposite arithmetic: round nothing that is machined, tolerate float error where
    float error is what you actually have. **What actually reaches the tolerance is
    narrower than it first looks, and the round's own plan got this wrong.** A plan
    comment claimed reverting the fits-test to an exact `<=` would fail "this test and
    nothing else" — false, because the fixture it pointed at (four 24" parts on a 96"
    sheet) sums to exactly `96` in binary float, so it never touched `EPS` at all. A
    15,298-case sweep across every 1/16" and 1/64" up to 96", against four kerfs, came
    back bit-identical with and without the epsilon: sixteenths and sixty-fourths are
    dyadic rationals, and sums of dyadic rationals are exact in IEEE 754. `EPS` earns
    its keep only because `parseLength` also accepts plain decimals and millimetres
    (÷25.4, not exact in binary) — fifteen 6.4"-decimal parts summed on one shelf land
    at `96.00000000000001"`, a hair over the sheet, and only the tolerance keeps the
    fifteenth part off a second one. See follow-up 87 — the sixth instance of the
    plan-supplied-justification lesson (64, 68, 80), and the first one caught by a
    mutation sweep rather than by a human reading the fixture.
23. **The shelf-height guard (`placeOn`'s `fits(f.h, shelf.h)`) is the SOLE enforcer of
    guillotine cuttability, and a self-derived test bound cannot catch its removal.**
    The whole justification for shelf packing over a denser maxrects layout (design §4)
    is that every cut a shop makes runs edge to edge — which is only true if a shelf
    never holds a part taller than the part that opened it. That one guard is the only
    line in `nesting.ts` enforcing it; nothing about the sort order guarantees it (the
    sort only orders sheets' *first* parts by height, `placeOn`'s guard is what keeps
    every later part on the shelf no taller). The obvious way to test the property —
    derive each shelf's band from the parts placed inside it — silently can't fail: a
    part that spills past its shelf just grows that shelf's own recorded band to match,
    so "every part falls inside its band" stays true by construction. Deleting the
    guard entirely passed the task's full test file, 19/19. The fix bounds each part
    against the *next* shelf's start (or the sheet edge for the last shelf) — a bound
    the parts under test cannot move — plus a dedicated regression fixture (an MDF
    rail wide enough to open a shelf, and a stick whose flipped orientation would stand
    taller than that shelf). Any future test of a "cannot exceed its container" property
    must bound against a value the thing under test does not itself produce; see
    follow-up 88 for the full account.
24. **A grab holds a world position, so anything that moves the boards under it must
    drop it.** `grabbed.at` is a `[x, y, z]` captured at grab time, not a reference to
    anything that updates — it is what `commitSnapMove` subtracts from the target to get
    its delta. So five store actions clear it *because they move boards under a live
    grab*, and all five are load-bearing rather than defensive: `undo` and `redo` (either
    can move the grabbed board out from under the captured point), `replaceDocument`
    (open, import and autosave-restore all route through it, and the board the grab names
    may not exist in the new document at all), and `deleteBoard` and `updateBoard` —
    which both clear **conditionally**, only when the affected board is the grabbed one,
    since an edit to some *other* board changes nothing about the captured position.
    `updateBoard`'s case is the one Properties can reach live in Move mode: nothing
    disables the panel while a point is grabbed, and `commitSnapMove` even selects the
    board it just moved, so a Length or Posture edit typed into Properties right after a
    grab routes through `updateBoard` and can relocate the grabbed board out from under
    its own point. Committing after any of these five would apply a delta derived from a
    position that no longer describes anything: the board moves by a wrong amount, with
    nothing on screen to indicate why, and the wrong amount is undoable but not obviously
    wrong. **A future action that rewrites `doc.boards` wholesale joins this list** —
    that is the test, not "does it touch positions", because a wholesale rewrite can
    invalidate the grab by removing its owner as easily as by moving it. Note this list
    is not everything that nulls `grabbed`: `setTool`, `cancelGrab`, and all three of
    `commitSnapMove`'s own paths that reach the end of a gesture — the successful move,
    the board-not-found path, and the zero-delta early return — do too, for their own
    reasons (`setTool`'s is that a snap point carried into a different tool has nothing
    that can consume it; the zero-delta return's is that the gesture is over even though
    no edit was worth making).
    **The selected-board grabs round added one more to that second list, for a reason
    that is neither of the two above: the user retargeted the tool.** Since only the
    selected board's points are grab candidates, a selection that lands on a different
    board means the point in hand is one the user could no longer have picked up — so
    `edit()` clears the grab when its optional `selection` callback resolves to
    something other than the grabbed board's id (which is what makes `addBoard` and
    `duplicateBoard` inherit the behaviour rather than each having to remember it), and
    `selectBoard` applies the same rule directly. `commitSnapMove` carries the
    action-level half: it refuses outright when `grabbed.owner.id !== selectedId`,
    before any `edit()`, and deliberately leaves `grabbed` in hand — the state should be
    unreachable, and discarding it quietly would hide that it wasn't.
    Only the five above are here because the world moved.
    **The cut-aware snap points round added three more — `addCut`, `updateCut` and
    `removeCut` — for a THIRD reason, and with a NARROWER rule than any of the above.**
    The five world-moved actions invalidate a *captured position*: the board slides out
    from under a point that still exists. A cut edit can do something else — it can
    destroy the **feature underneath the point**, or create one, so the point itself
    stops being on offer. `removeCut` deletes the shoulder being carried; `updateCut`
    moves it; `addCut` can overlap an older cut and take its floor away through
    `stockProbe`. These three do not inherit `updateBoard`'s conditional clear because
    they are deliberately routed *around* `updateBoard` (a cut changes no extent, so
    reorienting on a cut change would be a no-op pivot — invariant 2's own reasoning),
    which is exactly why they needed their own and could be given a better one. The clear
    is therefore **point-precise, not board-precise**: `dropGrabIfGone(boardId)` runs
    **after** the `edit()`, and keeps the grab iff the grabbed point is still among that
    board's `snapPointsFor` output. Holding a box corner while editing a cut on the same
    board usually **keeps** the grab, because the corner usually did not move — a
    mid-face dado touches no box point — but not always: `boardSnapPoints` itself
    withholds a box point once `stockProbe` finds no stock left under it (the round's
    own filter, added after a rabbet's flush end reached a box corner), so a cut edited
    to consume that corner's stock (a rabbet pulled flush with the board's end) makes
    the point stop being on offer and the grab **drops**, by the same rule that drops a
    grabbed shoulder rather than by a separate case. Holding the shoulder you just
    deleted **drops** it; a cut edit on another board is untouched, per
    the existing conditional shape. Two things are load-bearing and easy to undo by
    "tidying": the comparison is exact `===` on the three coordinates, correct for
    invariant 18's reason (both sides are produced by the same arithmetic from the same
    stored values, and nothing computes a difference on the way in), and the call must
    sit **after** `edit()`, since the whole question is what the board offers once the
    edit has landed. A blanket clear would be simpler and wrong — see follow-up 127 for
    the two cases the store tests do not reach.

    **The guide-points round added `tapeAnchor` as this invariant's SECOND instance and
    `tapeHover` as its THIRD, generalised `dropGrabIfGone` into `dropHeldIfGone` over all
    three, and left one asymmetry that must not be tidied away.** An anchor holds a world
    position captured at click time exactly as a grab does — the readout's distance and
    the direction a typed offset runs along both derive from `tapeAnchor.at` — so if the
    world moves under it, a guide placed from it lands somewhere the user never pointed
    at. A *hover* would normally be too transient to qualify, and that is what makes the
    third instance worth stating: `TapeTool` **latches** the hover while anchored (the
    only route to typing a distance is off the canvas and into the readout), so it can
    sit unreplaced across an arbitrary number of edits, and the reachable path is the one
    this invariant already records for `grabbed` — anchor on board A, hover a point on
    board B, leave the canvas, edit board B's Length in Properties. `tapeAnchor` correctly
    survives that, which is precisely why a live anchor says nothing about the target
    being current. One helper over all three rather than a second copy, for follow-up
    113's reason; `dropHeldIfGone` keeps the original's **guard-first shape**, returning
    before any grid arithmetic when none of the three fields is relevant, and adding a
    field is exactly how that would be lost. Four things about the three fields' clearing
    are load-bearing:

    - **`clearGuides` clears both tape fields UNCONDITIONALLY**, and that is right rather
      than sloppy: every guide is going, so any guide-owned anchor is invalid and a
      board-owned one is cheap to drop, and narrowing would buy one edge case at the cost
      of a reader's certainty that no stale anchor survives. The *hover* going
      unconditionally is defensible **only** because the anchor is nulled in the same
      statement — no anchor, no latch, since `TapeReadout` renders nothing without one and
      every commit path returns on it. That is a property of the five statements that do
      it (`setTool`, `clearGuides`, `undo`, `redo`, `replaceDocument`), not a licence to
      add a sixth.
    - **A PROHIBITION: `edit()`'s selection callback and `selectBoard` must NOT clear
      `tapeAnchor` or `tapeHover`.** Those two drop a *grab* for a reason specific to the
      Move tool — its grab candidates are the selected board's points, so a selection
      landing elsewhere means the user retargeted the tool. None of that reaches the tape,
      which has no selected-board restriction at all: measuring from one board to another
      is most of what it exists for, and "measure from this board to the one I am about to
      add" is a live path through `addBoard`. Stated as a prohibition rather than left as
      an absence because *"add `tapeAnchor: null` beside every `grabbed: null`"* is exactly
      what a tidying pass would do, and it would look like consistency. Store tests exist
      to catch it.
    - **THE ASYMMETRY, and it is a trap in both directions.** At `updateBoard` the two
      tape fields are point-precise (they route through `dropHeldIfGone(id)` after the
      edit) while **`grabbed` keeps a board-precise clause**, so renaming the grabbed board
      cancels the grab. That is deferred *because it is shipped Move-tool behaviour from
      two rounds back*, **not** because the argument fails to reach it — `updateBoard` is
      the only rename path, and `{ name }`/`{ material }`/`{ grain }` move no point. The
      tape needed the fix because nulling the anchor nulls the latched hover and unmounts
      the readout, destroying the whole measurement; a cancelled grab costs one click.
      Mechanically: the board-precise `grabbed` clause fires **first** and pre-empts the
      survival test below it, which is exactly what made `tapeAnchor`'s old clause a no-op.
      So **deleting the `grabbed` clause would silently convert it to point-precise**, and
      **adding one back for either tape field would silently re-break the rename case** —
      caught only by the two "keeps" tests, never by the "drops" ones, which pass under
      either rule. See follow-up 134.
    - **The enumeration lives in ONE place** — `tapeHover`'s declaration in `store.ts`,
      which says which writers are survival-tested, which are owner-conditional and which
      are blanket. Point at it; do not restate a count anywhere else, which is how a
      comment in this file went stale once already.
25. **The snap move is deliberately NOT rounded to `SNAP_INCHES`, and this is the exact
    opposite of what `Gizmo.tsx` does — both are correct.** The gizmo snaps to 1/16"
    because a free drag lands on arbitrary numbers and a board should come to rest
    somewhere a person can measure to. A snap move's entire purpose is the *exact*
    coincidence of two points, and the two cases divide cleanly: if both boards already
    sit on 1/16" boundaries the delta is exact and a snap is a no-op, so the only case
    where rounding does anything at all is the case where it silently breaks the result
    the user just asked for, by a sixteenth, with the display rounding to the same string
    either way (invariant 5) so nothing on screen shows it. Anyone "tidying" this by
    reusing the gizmo's snap would be applying one rule uniformly to two operations that
    differ in kind. Compare invariant 22, which makes the same shape of argument in the
    other direction for `nesting.ts`'s epsilon: apply the tolerance that matches the
    arithmetic you actually have — round what a free drag produced, tolerate float error
    where float error is what you have, and touch neither where the number is a
    difference of two stored positions. Verified rather than argued: Task 9 dropped a
    board onto a target at `y = 0.01` (off the 1/16" grid) and read `0.010000000000000009`
    back out of `localStorage` — IEEE-754 noise from the corner-offset arithmetic, not a
    snap, which would have landed on `0` exactly.

    **A tape-placed guide is unrounded for the identical reason**, and the two halves of
    the tape agree: a click places a guide at `hit.at`, the hovered candidate's own
    position, and a typed length places one at `offsetPoint(anchor, hover, d)` —
    `anchor + dir × d` with no rounding step in either path. A guide exists to be snapped
    *to*, so rounding it to 1/16" would move it off the feature it was placed on and make
    the subsequent snap land somewhere the user did not point at, while the display
    rounds to the same string either way (invariant 5) so nothing on screen shows it.
    Same rule, third operation: round what a free drag produced, and touch nothing that
    is already an exact position or a difference of two of them.

    **An AXIS-placed guide is the fourth operation, and it is the one where the rule is
    easiest to think you have already satisfied.** `towardFor` returns the anchor plus
    exactly one inch along the axis, `offsetPoint` normalises that to a unit vector, and
    the result is `anchor[i] + distance` on one index with the other two copied through —
    so a locked placement is arithmetic on an exact position and a parsed number, and
    nothing in it wants rounding. The temptation here is different from the gizmo's: the
    axis path *looks* like it should land on the grid, because a person typing `3` along
    Y from a corner on the grid does land on it, and the only case where a snap would do
    anything is the case where it silently breaks the number the user typed. Verified
    rather than argued: a locked `0.01` along X from a corner at `x = 5` read back out of
    `localStorage` as exactly `5.01` (not `5`, not `5.0625`) — see
    `docs/browser-verification-cardinal-guides.md`.
26. **`grabbed` is a `BoardSnapPoint`, and that is what makes eight reads correct.** The
    guide-points round widened `SnapOwner` with a `{ type: 'guide'; id: string }` member,
    and that edit is silent by construction: both members carry an `id` of type `string`,
    so every existing `owner.id` read keeps typechecking while quietly meaning something
    else. Eight reads in `store.ts` assume `owner.id` names a **board** — enumerated in
    the guide-points design's §3 and pointed at from `grabbed`'s own declaration; do not
    restate the list here. Seven of those eight are correct only *by accident* even
    unfixed, because a guide-owned value can never reach `grabbed` — and that accident
    holds solely because of a filter enforced two modules away in `MoveTool`, which is
    exactly the kind of thing the next round breaks. **A comment cannot enforce it; a type
    can.** So `boardSnapPoints`, `cutSnapPoints` and `snapPointsFor` are annotated
    `BoardSnapPoint[]` (each already produced exactly that), `pickSnapPoint` became
    generic in the candidate type, and `grabbed`/`grabSnapPoint` take the narrow type.
    The providers construct `owner` with a narrowed literal, so tsc — not a reviewer —
    holds the property those eight reads depend on.

    The consequence that reads as a gap and is the win: **the "a guide-owned grab must be
    declined" store test was deleted, because that state cannot be constructed in
    TypeScript at all.** Follow-up 118's shape. Do **not** add a runtime
    `if (grabbed.owner.type !== 'board')` guard to `commitSnapMove` to make it writable
    again.

    **One runtime narrowing survives on the grab path, and it is not vestigial.**
    `commitSnapMove`'s self-snap guard tests `target.owner.type === 'board'` before
    comparing ids, because the *target* genuinely can be a guide — the tool targets
    everything. Without the type test, a guide whose id happened to collide with the
    grabbed board's would read as a self-snap and the move would be silently refused.

    The price of the wide type is also worth knowing before adding a fourth held-point
    field: `tapeAnchor` and `tapeHover` are `SnapPoint` on purpose — **the difference
    between them and `grabbed` IS the documentation of which can hold a guide** — and they
    pay for it in five runtime `owner.type` tests (`heldOnBoard` inside `dropHeldIfGone`,
    two in `deleteBoard`, two in `removeGuide`). Any new field typed `SnapPoint` inherits
    that, and the type buys it nothing. Related and separate: `pickSnapPoint`'s generic is
    currently **unrealized** — both call sites pass a union-typed array, so `T` never
    resolves to `BoardSnapPoint` anywhere in the repo today. It is correct and free; it is
    not load-bearing for anything that compiles now, and `MoveTool` still narrows at the
    point of entry via `isBoardOwned` (a written-out type predicate, because
    `SnapPoint` is an interface whose `owner` is the union — narrowing the *property*
    inline does not narrow the *value*, which is how the plan's spelling failed to
    compile; see follow-up 141).

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 828 tests across 33 files
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck. A green suite proves nothing about `tsc`; run
`npm run build` before claiming anything compiles.

## Open follow-ups

`docs/follow-ups.md` lists everything found during v1 review, the two polish passes,
v2, v3, the post-v3 fixes, joinery, the cut list and its diagrams rounds, the
board-feet round, the sheet-nesting round, the snap-move round, the selected-board grabs
round, the cut-aware snap points round, the guide-points round, the type-anywhere round
and the cardinal guides round, consciously deferred
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
so it is not re-derived. **148** is the most portable entry here and has nothing to do with
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

**No successor has been chosen.** The roadmap paragraph that used to sit in the status
section was this round; nothing has replaced it yet, and `docs/follow-ups.md`'s open entries
— 130's construction lines and 147 among them — are where the next conversation should
start.

One entry is a lesson rather than a defect and is worth reading before touching anything
in the viewport: **26a**. Browser verification on this host runs on software GL
(llvmpipe, no GPU), which returns 1.0 for `pow(0.0, 0.0)` where real hardware returns
NaN. That difference hid a grid bug completely — it looked correct in every screenshot
and shipped as a camera-following disc. Anything resting on undefined or
precision-sensitive shader behaviour needs a human looking at real hardware.

Host-level open items (proxy auth, Cloudflare, monitoring) are in
`DEPLOYMENT.local.md`, not in the public repo.

## Deployment

Sloyd builds to static files served by nginx from a multi-stage image
(`docker compose up -d --build`). No bind mounts, no named volumes, no `.env` — there
is deliberately no server-side state to persist, because the document lives entirely in
the browser behind `StorageAdapter`. The nginx config does SPA-fallback routing so a
refresh on a deep route resolves to `index.html` rather than 404ing.

**Everything host-specific — hostname, container name, network, proxy setup, and the
manual steps only a human can do — is in `DEPLOYMENT.local.md` (gitignored).** Read it
before deploying or touching anything on the host.

## Working agreements

- Build incrementally: small v1, then widen. Prefer shipping a narrow thing that works.
- Design docs live in `docs/superpowers/specs/`; read the latest before changing behavior.
- **No pull requests.** Solo repo — commit to `master`, or branch and merge locally
  (`git merge --no-ff`, verify the merged tree, then delete the branch). Don't open PRs.
- TDD where it pays. `units` is tested hardest on purpose: a quiet bug there produces
  wrong measurements, and wrong measurements waste lumber. The r3f viewport has no unit
  tests by design — verify it by driving a real browser, not by asserting on mocks.
- When a review finding conflicts with what a plan or spec says, that's a human
  decision, not one to resolve silently either way.
- Prefer closing latent bugs over deferring them, including ones only reachable on a
  future platform — the storage seam exists precisely so a desktop build stays cheap.
