# Sloyd — parametric resize (stretch)

**Date:** 2026-10-28 · **Status:** approved by the user 2026-10-28; plan `docs/superpowers/plans/2026-10-28-sloyd-parametric-resize.md`.

**Origin:** `docs/feature-gaps.md`, "Parametric resize" ("Fusion users praise resizing a piece and having parts follow"). The user
picked it on 2026-10-28 and asked for a design without the brainstorm questions. Every choice below is Claude's call unless it is
marked as *the user's*. §12 lists those calls for checking, most important first.

## 1. Intent

Today, making a finished design 6" wider means editing every part by hand. You lengthen the top and both long aprons, then move the
two right-hand legs, then move every mortise, hole and end cut that sat near the right-hand end of the parts you lengthened. It
takes a dozen edits, and missing one leaves a joint that no longer meets.

This round makes it **one typed number**. Select the table (or the parts of it), type the new overall width, and press Stretch.
Everything past a **stretch line** moves out by the difference. Every part that crosses the line gets longer by the difference.
Its features follow the side of the line they are on.

### Which "parametric" (the main call)

There are two readings:

- **Fusion's.** Sizes are stored parameters and constraints ("apron length = top length − 2 × overhang"), re-solved on every edit.
  This needs a stored constraint model, a schema bump, a solver, and UI to author and debug constraints. Every existing feature
  would also have to say how it reads a constraint.
- **SketchUp's "stretch".** Nothing is stored. A resize is one geometric operation: insert (or remove) length at a line. The
  relations are *read off the geometry at the moment of the edit*, as the box-joint recogniser and stretchers already do (invs 60,
  61).

**This spec takes the stretch reading.** It covers the job the gap row describes ("resize a piece and have the parts follow") with
no schema change, so rolling back costs nothing. It fits the project's habit of recognising relations instead of storing them, and
it ships narrow. Stored parameters stay possible later. Nothing here forecloses them, and a stretch would still be how a solved
parameter change gets applied.

## 2. Goals, non-goals, anti-goals

**Goals**

- With an assembly selected, or two or more items, show the selection's **overall size** on X, Y and Z. You type a new size on one
  axis, place the stretch line (the middle by default), see what will grow, move and stay, and apply it.
- One undo entry. Exact: no grid rounding (inv 25). Refused while exploded or mid-gesture.
- Every feature of a part that grows either **follows correctly or refuses**, with a sentence that names the part and what is in
  the way, so the user can move the line.
- Shrinking works the same way, with a negative difference.

**Non-goals (v1)**

- Stored parameters, constraints or formulas (§1).
- Stretching on two axes in one action. Do one axis, then the other: two undo entries.
- Stretching one part on its own. Its size fields already exist; a part-level stretch line is follow-up S1.
- Re-laying a feature across the line: a hole row (pitch kept, more holes), a box joint or dovetail layout, a curve. They refuse
  (§5). Follow-ups S2 and S3.
- Moving guides, hardware counts, saved views' cameras, or anything outside the selection.
- A viewport drag handle for the stretch. Follow-up S4.

**Anti-goals.** It would be a failure, even if it works, if:

- a joint that met before no longer meets, with no refusal (a mortise left behind while its apron moved);
- a part grows in **thickness**, which changes stock that was bought;
- the stretch edits a copy or linked part the user didn't select, or edits two placements of one assembly differently, silently;
- a refusal changes anything, or one click makes several undo entries;
- a result lands a hair off: rounded, accumulated, or a joint 1e-12 open that the checks read as a gap.

## 3. Terms

- **The items** are `selectedIds` at the open level, as for Align (`selectionPatch`: one level, hidden ids dropped, inv 43). One
  selected assembly counts, so the section shows for an assembly alone.
- **The extent** is `partsBounds` over every world part the items cover (`isCovered`): leaned boxes (inv 57 R2), hidden parts inside
  a selected assembly included. Hidden parts are still part of the piece (inv 43), so they stretch too.
- **Axis `k`**: world X, Y (up) or Z (+Z the front).
- **The line** is a world plane `x_k = s`, with `s` strictly inside the extent: `min_k < s < max_k`. Anything else is refused, as
  `The stretch line must be inside the selection.`
- **The difference** is `δ = typed size − (max_k − min_k)`. With `|δ| ≤ 1e-9` there is nothing to do: no edit, no undo entry
  (align's I1).
- **Past the line** means on the +k side. Everything past it moves by `+δ`; nothing before it moves. *Claude's call:* a fixed min
  side (left, bottom, back) matches how a woodworker measures, and lets a typed line read as "from the left". A centred stretch is
  a line at the middle, which is the default.

## 4. Classifying the selection — `stretchPlan` (`src/document/stretch.ts`, new, pure)

**ONE planner.** The panel's live preview and the store action both call it. It returns either a refusal sentence or the full
result: every world part's after-state, plus the grows, moves and stays lists.

The walk is **top-down over the tree**, so a placement that ends up whole on one side moves as a placement:

1. **A node** (an item, or a placement or part inside a spanning assembly) is judged by its world extent on `k`:
   - `max_k ≤ s`: it **stays**, unchanged.
   - `min_k ≥ s`: it **moves** whole by `δ`. An assembly moves as ONE placement change (`translateItems`'s lowering). Its
     definition is not edited, so its other copies are untouched.
   - otherwise it **spans**. A spanning assembly is descended into: steps 1–2 are applied to its children. A spanning part goes to
     step 2.
2. **A spanning part** grows by `δ` along the part dimension `d` that axis `k` maps to (`axisDimensions`, inv 44). It is refused
   when:
   - `d` is its **thickness**: `<part> would get thicker — the line runs through its thickness; move the line.` *Claude's call*:
     §12 (2).
   - it **leans** (inv 57: a lean's resize keeps a pivot, which a stretch can't honour on a crossing line): `<part> leans, so it
     can't be stretched — move the line off it.` A leaning part that moves whole is fine; its pivot moves with it.
   - it carries a **compound end cut** (`hasCompoundCut`, inv 59): same sentence form, `has a compound end cut`.
   - a **shrink** leaves it `≤ 0` long on `d`, or any feature fails §5.
3. **Shrinking (`δ < 0`)** removes the band `(s, s + |δ|)`. Parts and placements past the line move back into it. Overlaps that
   result are not refused: the design checks report them, as for any move (as a result of Ruling 9 below, a shrink never moves a part
   into the stayed side, so this applies only to grows and spanning parts). A spanning part must clear the band (§5). A node that
   would move but starts in the band, the line itself included (`s ≤ min_k < s + |δ|`, amended for Ruling 9; in code `min_k < s + |δ| − 1e-9` for a node that moves), refuses: `<name> sits in the wood this
   shrink removes — move the line or shrink less.` (`<name>` the part's or assembly's own), decided in the walk, in tree order,
   before any document is built. One starting exactly at `s + |δ|` lands on the line and passes. *(Amended at the final review,
   Ruling 7: such a node moved back past the line, so the result was not the typed size — the apron table's aprons, starting at
   x 1.75, shrunk 48 → 46 at x 1.5, landed at −0.25 and the table came out 46.25 wide while the preview said 46.)*
   *(Ruling 9: the band includes the line itself. A node with min exactly `s` is also in it: the same aprons at line 1.75 moved −2 to
   x −0.25 and the table came out 46.25 wide. The lower bound is inclusive; the upper stays open, so min exactly `s + |δ|` passes.)*

**What the plan does NOT refuse**: an overlap or a gap the stretch creates between parts that do not span. The design checks
report those, and so does the preview's count.

## 5. A growing part's features — follow or refuse

Each feature is judged in the part's own terms on `d`, at the line's station `t = s − (the part's world min on k)`, read through
`axisFrame` (inv 44; a turned or mirrored part reads its own direction). Every field of `Board` (`types.ts`) is listed. A feature's
**span on `d`** comes from its ONE home (`cutRegion`, `holes.ts`, `curves.ts`, `profilePath.ts`, `angleCuts.ts`, `roundTenons.ts`,
`dovetails.ts`, `bandModel.ts`), never re-derived here.

| Field | Wholly before `t` | Wholly past `t` | Straddles `t` |
|---|---|---|---|
| `length`/`width` | — | — | the one that is `d` becomes `was + δ` |
| `thickness` | — | — | refused (§4.2) |
| `position` | min corner kept (it is before the line) | — | — |
| `cuts` (rectangular) | unchanged | shifted `+δ` on `d` | its span on `d` grows by `δ` (a through or run-out cut keeps running out). Shrink: refused unless the span covers the whole removed band |
| `angleCuts` | unchanged | shifted (an end cut at the far end stays at that end) | refused (a taper's angle would change): `<part>'s taper crosses the stretch line` |
| `holes` | unchanged | the row shifted `+δ` on `d` | refused (the pitch can't stretch; S2): `<part>'s hole row crosses the stretch line` |
| `curves` | unchanged | shifted | refused (an arc can't stretch) |
| `profiles` | unchanged | shifted (a stopped run's stop follows its side) | a run along `d` grows by `δ`; any other refused |
| `bands` | follow automatically (per side, the whole run) | | |
| `cornerRule`, `grain`, `material`, `posture`, `rotation`, `hardware` | unchanged | | |
| `tenons` (round) | a tenon on the min end unchanged | on the max end: unchanged in part terms, so it follows the end | refused (the line passes through a tenon) |
| `dovetails` / box-joint notches (`cornerJointed`) | unchanged | follow the end, when `d` is the corner's `dim` and `t` lies outside every zone | refused when `d` is the corner's **J** (the layout is a function of J's span, and the mate is a partition partner), or when `t` lies in a zone: `<part> has box joints / dovetails across the stretch line` (S3) |
| `lean`, compound cuts | refused (§4.2) | | |
| `shape`, `mirrored` | §6 | | |

**The rules behind the table:**

- **"Wholly past" is strictly past.** The feature's min on `d` is `≥ t` (`> t − 1e-9`). "Wholly before" means max `≤ t`. A feature
  that touches the line counts as being on the side its body is on.
- **The arithmetic lives in each kind's home.** *(Amended in planning:* each kind's EXISTING `rebase…` helper is called once per
  feature: on the near end's numbers for a feature before the line, on the far end's for one past it. Only rectangular cuts get a new
  helper, `stretchCut` in `cuts.ts`, because their rebase is private to joinery and refaces cuts.*)* **`resizeEnd`'s rebase is NOT the stretch rule.** It keeps cuts fixed in the WORLD while an end moves, which is
  the opposite of what a stretch needs. A stored station measured from the min end shifts when its feature is past the line. One
  measured from the max end shifts when its feature is BEFORE the line. Each kind's helper settles both by the feature's place, not
  its storage.
- **The faults rule** (invs 50, 53, 54, 58, 62) is unchanged: a fault the stretch causes on a feature it follows is KEPT and noted,
  never clamped. A refusal is reserved for the table's "refused" cells.

## 6. Copies and links — refuse, never split

`writeBackParts` writes ONE edit per storage key. Two placements of one definition, or two users of one Shape, can need different
results. One may span while the other sits on one side, or one may not be selected at all. Then one would silently take the
other's result. **The plan refuses that before any mutation.**

- **Definitions:** when the walk edits INSIDE a definition (a part in it grows or moves while the placement itself does not move
  whole), every placement of that definition anywhere in the document must be in the selection, and its lowered subtree result must
  be identical. Compare like `writeBackFlat`'s `subtreeSignature`. Otherwise:
  `<assembly> has copies this stretch would change differently — Make Unique first.`
  *Claude's call:* refuse, unlike joinery, which splits silently. A stretch is the user's own edit, and an unasked-for copy is the
  surprise listed in the anti-goals.
- **Shapes (links):** every user of a Shape whose shared fields change must change identically, read through its own `mirrored`
  flag. That is the box-joint planner's link post-condition, here checked before `edit()`. Otherwise:
  `<part> is linked to <other part>, which this stretch changes differently — Unlink first.`
- **Write-back mode (inv 46): `keepWorld`**, through `writeBackParts`, as box joints do. The plan's after-states are world geometry.
  Whole-placement moves go through `translateItems`, in the same `edit()`.

Two common cases pass without refusing. Two mirrored end frames of a table that are copies of one definition, deepened on Z, grow
identically in their own terms. Widening on X moves one frame whole and leaves the other.

## 7. The store — `stretchItems(axis, size, line)`

- Refuse at entry while exploded (`readOnly()`, inv 47) or `gesturing`.
- `stretchPlan` on ONE snapshot. A refusal returns its sentence, and nothing is written.
- ONE `edit()`: the placement moves (`translateItems`) and the part write-back (`writeBackParts`, keepWorld). One undo entry (inv 4).
- `judgeHeld()` once afterwards (inv 24).
- **Exact** (inv 25 gains "stretch" in its list): `δ` is computed once and added. Nothing is rounded to the grid, in imperial or
  metric. The typed size and line come through `parseLength` with the document's units (inv 52).
- Selection unchanged.

## 8. The panel — "Overall size"

In `InstanceProperties` (one assembly) and `GroupProperties` (two or more items), inside `EditLock`, after Align:

```
 OVERALL SIZE
   Width (X)  [ 48"     ]   Height (Y) [ 29 1/4" ]   Depth (Z) [ 22" ]
   Stretch at [ 24"     ] from the left            [Middle]
   48" → 54":  grows Top, Front apron, Back apron · moves 2 · 2 stay
   [Stretch]   [Cancel]
```

- The three fields show the current extent. **Typing does not apply on blur**, unlike `DimensionField`. A changed field arms that
  axis. Changing a second field re-arms to it: one axis at a time. *Claude's call:* a multi-part edit this large deserves an
  explicit button, and inv 5's blur-commit rule is about one stored value.
- **Stretch at** appears once an axis is armed. It defaults to the middle, is measured from the min face (`from the left` /
  `from the bottom` / `from the back`), and `[Middle]` resets it.
- **The preview line** comes from `stretchPlan` in a memo: the change, the grown parts by name (up to 4, then `+N`), and counts of
  moved and staying items. On a refusal, the sentence shows instead as a `field-error` (`role="status"`), and Stretch is disabled.
- **The line in the viewport:** while an axis is armed, a translucent plane is drawn at `s` across the extent. It is view state, never
  in the document or undo, and cleared on Cancel, Stretch, a selection change or explode. *Claude's call*: §12 (5).
- All copy lives in `stretchText.ts`, which imports `units` (it prints lengths, the → units edge rule).

## 9. What does not change

- **No schema change**, nothing stored, so rollback is free. A document no stretch touched is byte-for-byte as before. No load path
  changes.
- The checks, joinery, Generate, Refine, cut list, Plans, weight and labels are untouched. A stretched part is an ordinary part.
- Align, Copy in a row, the Move tool and Properties size fields are unchanged.

## 10. Tests

Every expectation is computed by hand in the test, never by `stretch.ts`. Fixtures: a four-leg apron table (mortised aprons,
pinned holes), a bookcase (shelf-pin rows, dadoed shelves, plywood back), and a stretcher base.

**Plan**
- Table, widen X by 6 at the middle. Top and both long aprons grow exactly 6. The right legs move exactly 6. The left legs and short
  aprons stay. Each right-leg mortise moves with its leg. Each long apron's far tenon or cut shifts 6, and its near one doesn't move.
- Table, raise Y by 2 at the middle. The legs grow, and the aprons and top move up 2. The legs' mortises (past the line) shift 2 in
  part terms, whichever end they are stored from. A test stores one from each end.
- Shrink by 2: the mirror of the above, exact. A shrink whose band hits a hole row refuses.
- Line through a shelf's thickness: the thickness sentence. Line through a shelf-pin row: the hole-row sentence. Line between rows:
  passes.
- Stretcher base widened: every rung grows, and every tenon is still `seatedIn` after (inv 58, 60).
- Leaning leg spanning: refused. Moving whole: passes, pivot moved by `δ`.
- Dovetailed drawer box lengthened along the dovetails' `dim`, with the line outside the zones: passes, and the partition holds (fu
  `expectPartition`). Lengthened on J: refused.
- A turned (90) and a mirrored part: features follow by their WORLD side. A chiral fixture (`chiralPart`, inv 44).
- Copies: two placements on opposite sides move or stay as placements, with the definition untouched (the same object). One copy
  spanning and one unselected: refused. Two mirrored frames deepened: pass, and the definition is written once.
- Links: a linked pair that grows identically passes, and the Shape is still one. A pair that diverges is refused.
- The line on the extent's face or outside it: refused. `|δ| ≤ 1e-9`: no-op.

**Store**
- One undo entry, and undo restores every number exactly. A refusal writes nothing: the document is the same object, with no entry.
  Refused while exploded.
- A metric project with an off-grid result stays off-grid.
- A held tape anchor on a moved part is dropped; one on an unmoved part is kept (inv 24).

**Panel**
- Shown for an assembly and for 2+ items, hidden for one part. The fields show the extent. Arming, the default middle, `[Middle]`, the
  preview text, a refusal disabling Stretch, Cancel restoring. Disabled while exploded.

**Mutate** (each must turn a test red):
- Use `resizeEnd`'s rebase in place of the stretch rule: the mortise-stored-from-min test fails.
- Drop the definition comparison: the unselected-copy test fails.
- Allow thickness growth: the shelf test fails.
- Round `δ` to the grid in metric: the exactness test fails.

## 11. Verification, and what the build owes

- Dev server, in the user's Chrome (the browser memory): build the apron table. Widen it 6", raise it 2" and shrink it back, reading
  positions and sizes back from the store. Screenshot the preview line and the plane. Show a refusal by putting the line through a
  hole row. Undo each.
- Production: bundle hash, CSP, and `localStorage` cleared. No paid runs.
- **New invariant 64**, full in `docs/invariants.md` and condensed in CLAUDE.md. **CLAUDE.md is at about 59.9KB**, so the build owes
  a trim (detail moved out, not rules) before the condensed text goes in. Inv 25 gains "stretch". `docs/module-map.md` gains
  `stretch.ts` and `stretchText.ts`, and the panel. `docs/feature-gaps.md` row updated. No `docs/versioning.md` change.

## 12. Claude's calls, for checking

1. **"Parametric" means a stretch, not stored constraints** (§1). Nothing is stored, there is no schema bump, and rollback is free.
2. **Thickness never grows.** A line through a part's thickness refuses rather than silently moving or keeping that part. *The
   alternative:* move it if its centre is past the line. That is quieter, but a shelf could jump. A part spanning on its WIDTH does
   grow (a glued-up top, a plywood back). A square leg's "width" grows too if the line runs through it, and the preview shows it.
3. **Copies and links refuse; they never split** (§6). Joinery splits silently; a stretch is your own edit.
4. **The min side stays fixed**, everything past the line moves `+δ`, and the default line is the middle.
5. **The UI:** overall-size fields in the assembly and multi-selection panels, a typed line, a live preview, and an explicit
   Stretch button (no commit on blur). A plane is drawn in the viewport while an axis is armed. The plane is the one piece with no
   unit tests (viewport), and it is cheap to drop.
6. **Refused in v1:** hole rows, curves, tapers and tenons crossing the line, and box joints and dovetails on their J. Each refusal
   names the part, so the user can move the line.
7. **Follow-ups:**
   - **S1:** a stretch line for a single part.
   - **S2:** a hole row across the line, re-laid at its pitch.
   - **S3:** corner joints across J, re-planned for both mates in lockstep.
   - **S4:** a viewport drag handle.
   - **S5:** stretching on two axes at once.
