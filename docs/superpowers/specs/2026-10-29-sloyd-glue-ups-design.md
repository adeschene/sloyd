# Sloyd — glue-ups from narrow stock

**Date:** 2026-10-29 · **Status:** approved by the user 2026-10-29 (option A, §2); plan `docs/superpowers/plans/2026-10-29-sloyd-glue-ups.md`. DEPLOYED 2026-10-29 (`31dc0f6`), then amended in §4 (fu 564: cap 24, fewest strips wins) and DEPLOYED (`4420042`).

**Origin:** follow-up 268 ("A part wider than every stock board is 'too wide'; edge-gluing narrower boards is not
modelled"), picked by the user 2026-10-29 from `docs/feature-gaps.md`'s residue. The user asked for the spec without the
brainstorm questions, so every choice below is Claude's call unless marked *the user's*; the calls are listed in §10 for
checking, and §2 holds the one decision that is the user's to make.

**Builds on:** the lumber yield and cost round (`docs/superpowers/specs/2026-10-12-sloyd-lumber-yield-cost-design.md`,
`document/purchase.ts` `byThePiece`), the shelf packer (`nesting.ts`, invs 22, 23), edge banding's `cutStock` (inv 54),
and the metric fit rule (`fitsStock`, fu 354). Every rule there still holds unless this document says otherwise.

## 1. Intent

A tabletop, a cabinet side or a workbench top is almost always wider than any board a yard sells. At the bench you rip
narrower boards, joint their edges and glue them into a panel. Sloyd does not know that. Buying says the part `fits no
pine stock — too wide`, counts it in `(N parts not placed)`, and buys nothing for it. So the purchase is wrong in the
one place a big-box buyer needs it most: the default pine stock tops out at 1×12 (11¼"), so any pine top wider than
that is left out of the board count and the total.

**Goal:** when no listed stock is wide enough for a part, Buying plans it as a glue-up. It splits the part into equal
strips that the stock can supply, packs the strips like any other part, and says so in one note.

**Where "too wide" exists today, and so where this round acts.** Only in by-the-piece buying (`byThePiece`):
- Board-foot materials (the hardwoods' default) have no widths. Their line is net board feet times a waste factor, which
  already buys enough wood for a glue-up.
- Sheet goods are not edge-glued. A part bigger than the sheet is the sheet nesting's own unplaceable case.

Both are unchanged.

**Goals**
- A part that is too wide today, and only that, is bought as a glue-up of N equal strips. Its boards, price and layouts
  join the material's buy line, and it no longer counts as "not placed".
- One note per glued part names the strip count, the strip size and why: `Top (3/4" × 22" × 40"): glue up from 2 strips,
  3/4" × 11-1/8" × 41" — no pine stock is 22" wide`.
- The board layouts draw the strips, labelled by the part's name and strip number.

**Non-goals (v1)**
- Changing what any other part buys. See the anti-goals.
- The cut list, the Labels sheet, the Plans sheet, the viewport, weight, checks, joinery, Generate, Refine: all are
  unchanged. They are built from the document alone, and the document does not change (§2, option A).
- A user-chosen strip count, or glue-ups for board-foot materials (§2, option B).
- Face lamination (a part TOO THICK for every stock) and scarf or finger-jointed length (a part TOO LONG). Both keep their
  refusal reasons; they are follow-ups.
- End-grain parts (grain through the thickness). They stay refused with their own note, exactly as today; an end-grain
  cutting board is a different glue-up.
- Edging strips (`stripBoard`) are never glued up.
- Choosing the strip count by price, or gluing narrow stock in place of planing a wider board when that is cheaper.

**Anti-goals** (a failure even if it works):
- **Any change for a part that gets a board today.** A glue-up runs ONLY where today's answer is `too wide`. Every
  project with no too-wide part buys byte for byte what it bought before: the same lines, notes, layouts, cost and total.
- A glue-up that cannot actually be ripped from the boards bought. Every strip is packed onto a real board by the same
  packer and fit test (`fitsStock`) as every other part; nothing is estimated.
- A silent glue-up. Every glued part has its note, and Buying never presents a glued part as one board.

## 2. Stored or derived — THE OPEN DECISION (the user's)

**Option A — derived in Buying (recommended, and the rest of this spec).** No schema change. The glue-up is decided
from the shop's stock list each time Buying is built, only where that list has nothing wide enough. A rollback costs
nothing.

The limit is that the cut list cannot show it. The cut list is built from the document, and the document cannot see the
shop's stock widths, which are browser-level (`sloyd.shop.v1`). So the cut list prints the panel's finished size as
today, and the strips appear only in Buying's note and layouts. That suits the big-box buyer, whose problem this is. It
gives the hardwood buyer nothing, but that buyer's purchase is not wrong today.

**Option B — a stored glue-up on the part (a later round if wanted).** `Board.glueUp?: { strips: number }`, SHARED
(inv 45), set in a Properties section, for any solid long-grain part whatever its buying mode. The cut list would then
print a setup line (`Glue up from 4 strips, each …`), board-foot net would include the strip allowances, and Buying
would pack the user's strips rather than deriving them. It costs schema 30 (2026-10-29: counterbores took 30, so this would now cost schema 31). Its harm argument: a build at 29 rebuilds
each part through `validateBoard`, drops the unknown key, and the next autosave erases every glue-up silently. Rolling
back past it would strand every project saved since.

**Recommendation:** A now. It closes fu 268 as written, it is narrow, and it costs nothing to roll back. Record B as a
follow-up, to take up when a real hardwood project wants its strips on the cut list. If the user picks B instead, this
spec is rewritten around the stored field, and A's derivation becomes B's default suggestion for N.

## 3. When a part is glued up

`byThePiece` today sorts every cut-stock part (`cutStock`: a banded part at its CORE, inv 54) into one of three outcomes:
- a thickness `t`: the thinnest listed thickness ≥ the part's on which some size holds its grain footprint;
- `too thick`;
- `too long` or `too wide`.

**A part is a glue-up candidate exactly when today's reason is `too wide`**, it is a part rather than an edging strip,
and its grain is not `thickness` (end grain is refused before this point, as today). Nothing else changes. In
particular, a part that fits some board today is never glued up, even where gluing would be cheaper than planing a
thicker board.

## 4. The plan for one glued part

Notation, from the part's grain footprint `f = grainFootprint(part)`:
- `L = f.w`, the length along the grain;
- `W = f.h`, the width across it, which is what is too wide.

**Allowances (§10, call 2), fixed constants in `purchase.ts`, in inches:**
- `GLUE_WIDTH_ALLOWANCE = 1/8`, added to each strip's width. It covers jointing both glue edges and the final rip to width.
- `GLUE_LENGTH_ALLOWANCE = 1`, added to each strip's length. It covers trimming both ends square after glue-up, because
  strips slide when clamped.

**Steps:**
1. **Strip length:** `Ls = L + GLUE_LENGTH_ALLOWANCE`.
2. **Thickness:** take the thinnest listed thickness `t` with `thickEnough(t, part.thickness)` (the existing test,
   metric-aware) that has at least one size holding `Ls` along its length (`fitsStock(Ls, s.length, units)`) and wider
   than the width allowance. The planing note follows the existing rule unchanged: when `t` reads thicker than the part,
   `plane … stock to …`.
3. **Strip count:** `Wmax` is the widest such size's width at `t`. Then `N` is the smallest integer ≥ 2 such that
   `fitsStock(W / N + GLUE_WIDTH_ALLOWANCE, Wmax, units)`. N has no cap (§10, call 4). It is found by trying N = 2, 3, …,
   which ends because `Wmax > GLUE_WIDTH_ALLOWANCE`.
4. **The strips:** N plain solid boards, never stored. Each has:
   - id `${part.id}#glue:${k}`, for k = 1…N (the `#glue:` tag cannot collide with edging's `#band:`);
   - name `${part.name} strip ${k} of ${N}`;
   - `length = Ls`, `width = W / N + GLUE_WIDTH_ALLOWANCE`, `thickness = part.thickness`;
   - `grain: 'length'`, the part's material, and no features of any kind (the part's cuts, holes, curves and the rest are
     machined in the glued panel, after glue-up).
   They are EXACT; nothing is rounded before packing (inv 18: what is machined is never rounded).
5. **Packing:** the strips join the parts at thickness `t` and go through the existing pack, the price-plan search and the
   swap-down unchanged. They may share a board with each other or with other parts, and the swap-down may move them to a
   narrower size than `Wmax`. The plan is a heuristic, as the packer already is.
6. **No thickness works** (no qualifying thickness has a size long enough for `Ls`): the part stays unplaceable, with a
   reason that says why the glue-up failed: `… fits no pine stock — too wide, and too long to glue up (strips need 1"
   to trim)`. A part that is both too wide and too long for every board today reads `too wide` today, and now reads this
   line. This is the reachable refusal that the glue-up keeps (§7).

**Worked example (for the tests).** Default pine stock (¾" × {1½ … 11¼} × {72, 96}), saw kerf ⅛", part `Top` ¾" × 22" × 40",
grain along the length:
- `Ls = 41`; `t = 3/4`; `Wmax = 11.25`.
- N = 2: `22/2 + 0.125 = 11.125 ≤ 11.25`, so two strips of ¾" × 11⅛" × 41".
- Packed: one shelf 11⅛ high, `41 + 0.125 + 41 = 82.125 ≤ 96`. One 11¼ × 96 board. The swap-down cannot use 72"
  (82.125 > 72).
- Buy line `Buy 1 × 3/4" × 11-1/4" × 96" · …`; unplaceable 0.

Boundaries:
- A 22¼" top is still N = 2: `11.125 + 0.125 = 11.25`, an exact fit, within the fit test's epsilon.
- A 22½" top is N = 3: `11.25 + 0.125 > 11.25`. Without the allowance it would be N = 2; this is the allowance's
  mutation test.

**Amended 2026-10-29 after deploy (fu 564, the user's ruling: "cap the strip count, fewest strips wins").** Steps 2 and 3 are
replaced: at EVERY qualifying thickness with a size long enough for `Ls` (and wider than the width allowance), N is the fewest strips
that fit that thickness's widest such size, counted only up to `GLUE_MAX_STRIPS = 24` (Claude's call for the number). The thickness
needing the FEWEST strips wins; a tie goes to the thinner (less to plane; Claude's call). Over the cap at every such thickness, the
part is refused: `… — too wide, and it would take more than 24 strips to glue up`. Fewest strips does not weigh price (fu 558): it can
choose planed thicker stock that costs more. §10 call 4 ("N uncapped") is withdrawn.

## 5. What Buying prints

- **The note**, one per glued part, in the parts' order among the other notes (§10, call 3):
  `${name} (${partDims}): glue up from ${N} strips, ${stripDims} — no ${material} stock is ${W} wide`.
  - `partDims` is the existing `partDims` (the finished part, project units).
  - `stripDims` is `formatSize([thickness, width, length])` of one strip, displayed at the project's precision.
  - `W` is `formatLength(W)`.
  - Metric reads mm throughout, as the existing notes do.
  - The string is built in `purchase.ts` (inv 19).
  - A planing note for the same part keeps its existing wording, after the glue-up note.
- **The buy line, cost and swap-down note (fu 273)** count the strips' boards like any others. There is no separate
  glue-up line.
- **Layouts:** each strip is a placed part named `Top strip 1 of 2`. Where the layout falls back to numbers (the `index`
  tier), a strip takes the CUT-LIST ROW NUMBER of its part, so every strip of a panel shares the number the panel has
  on the cut list and the Plans sheet, as two parts of one row already do. The key entry's name still says which strip
  it is. The panel's `rowNumbers` map gains each glue strip's id → its part's row number. How it learns them is the
  builder's choice: the purchase entry can list `{ stripId, partId }` pairs, or the id can be parsed at `#glue:`. A
  test pins the shared number either way.
- **The total:** a glued part is no longer "not placed", so `(N parts not placed)` falls by one per glued part. The cost
  rises by its boards. Both changes are intended. A project whose only unplaceable part is now glued drops the tail.

## 6. Modules

| Module | Change |
|---|---|
| `document/purchase.ts` | the candidate test (§3), the plan (§4), the strips joining their thickness group, the note (§5), the two constants, the new refusal reason |
| `panels/CutList.tsx` | `rowNumbers` maps glue strip ids to their part's row number (§5) |
| `docs/module-map.md`, `docs/follow-ups.md`, `docs/feature-gaps.md`, `docs/rounds.md` | on shipping, as every round |

That is all. `nesting.ts`, `banding.ts`, `cutlist.ts`, the storage seam, the shop settings and their validation, the
Lumber & prices dialog and the schema are all untouched. There is no new invariant: this is a rule inside `byThePiece`. A
condensed line goes into the cut list, nesting and Buying row of CLAUDE.md's "Where things live" table only if the
builder finds a rule worth guarding there (§10, call 6).

## 7. Testing

Expected values are hand-derived in the test, never read back from `purchase.ts`. Each new test is mutated once and must
fail (the working agreement).

- **Byte for byte:** every existing `purchase.test.ts` case whose parts all get a board today passes unchanged.
  - Add one guard: a project mixing ordinary parts, a too-long part and a too-thick part. Its whole `Purchase` equals
    what it was before this round, written out by hand.
- **Rewritten:** the cases that assert `too wide` today now assert the glue-up instead:
  - the `lists a part no stock holds` case (the `wide` part, ¾" × 8" × 30" against stock A, ¾" × 5½" × 96": N = 2, strips
    ¾" × 4⅛" × 31", since `8/2 + 1/8 = 4.125 ≤ 5.5`; it now shares A boards with `ok`, so re-derive the board count and
    the `$… (2 parts not placed)` total by hand);
  - the metric `wide` note;
  - `287 mm is too wide`;
  - `89.5 reads 90 and is too wide`.
  Each keeps its original point, and asserts the new outcome where it used to assert unplaceable. `286 mm` still buys
  a 1×12 with no glue-up.
- **The worked example and its boundaries (§4):** 22" → N = 2, one 1×12×8′; 22¼" → N = 2 (exact fit); 22½" → N = 3.
  - Mutations: drop the width allowance (22½" becomes N = 2); drop the length allowance (§4 step 6's case becomes
    placeable).
- **Thickness:** a too-wide ¾" part whose ¾" list is short but whose 1" list is long enough for `Ls` glues up at 1", with
  the planing note.
- **Refusal kept:** a ¾" × 20" × 95½" part against a list of ¾" × 11¼" × 96" only (NOT the default pine list: its 2×
  sizes at 10′ and 12′ would glue it up from 1½" stock, planed) reads `too wide, and too long to glue up …` and counts as not
  placed (`Ls = 96.5 > 96`).
- **Not a candidate:** a too-wide end-grain part keeps its end-grain note. A too-thick part and a too-long part keep their
  reasons. A banded panel glues up its CORE: the strips' width comes from `cutStock`'s core width, and its edging strips
  pack as before.
- **Shares and swaps:** the strips pack with other parts on one board when they fit (assert the board count). The
  swap-down moves a strip pair to a narrower priced size when it is cheaper (hand-derived prices).
- **Metric:** a 600 mm-wide 19 mm part reads mm in its note, with the strip width at whole mm.
- **Layouts:** the strip ids are on the boards. The CutList panel test shows a glued part's strips keyed with the part's
  row number in the index tier.
- **Browser:** on the dev server, in the user's Chrome per the deployment rule, open a pine table with a 22" top. Check
  Buying's line, the note, the layout's two strips and the total by eye. Leave the test project in place.

## 8. Rollback

There is no schema change, so a rollback to `e09003b` costs nothing. A project opened in the older build reads exactly
as it was, with the part `too wide` again.

## 9. Follow-ups to record when the round ships

- Option B, the stored glue-up (schema 30; now 31, counterbores having taken 30, 2026-10-29), if the user does not take it now.
- Typed glue allowances (a shop setting, or the document's `stock`).
- Choosing N, or gluing in place of planing, by price.
- Face lamination for a part too thick for every stock.
- Scarf or finger-jointed length for a part too long.
- End-grain glue-ups (cutting boards).
- Glue lines on the panel in the viewport and on the Plans sheet.
- A Labels-sheet sticker per strip.

## 10. Claude's calls, for checking

1. **Option A over B** (§2), with B as a follow-up. This is the user's decision; A is Claude's recommendation.
2. **Fixed allowances, ⅛" per strip in width and 1" in length** (§4). They are constants, not settings, so the shop
   settings' layout and validation stay untouched. Typing them is a follow-up.
3. **One note per glued part, and no separate buy line**: the strips' boards join the material's ordinary buy line (§5).
4. **N uncapped**, as the fewest equal strips that fit the widest long-enough size at the thinnest thickness that has one
   (§4). Equal widths, not "as many full-width boards plus a remainder", because equal strips are how panels are glued
   and they balance the grain.
5. **The strip's displayed width is rounded to display precision like every other dimension**, not up (§5). The fit test
   uses the exact width, and the ⅛" allowance absorbs a 1/32" display rounding.
6. **No new invariant.** The byte-for-byte guard test (§7) carries the anti-goal.
7. **Edging strips and end-grain parts are never glued up** (§3).
8. **Strips share the part's cut-list row number in the layouts** (§5).
