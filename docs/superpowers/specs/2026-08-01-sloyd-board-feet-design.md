# Board feet on the cut list — design

**Date:** 2026-08-01
**Status:** approved, not yet implemented
**Closes:** the first half of the cut list design's §7 non-goal
("board-feet and sheet totals")

The cut list's §7 deferred this with a reason rather than an omission: *"the natural
next output, and cheap once `buildCutList` exists — but it is a purchasing number, not
a bench number, and this release is about the bench."* That reason has expired, not
been overturned. The bench release shipped; this adds the purchasing number beside it.

---

## 1. What the number is

Board feet, the unit solid lumber is sold in: **144 cubic inches**.

```
board feet = length × width × thickness / 144
```

Sheet goods are not sold this way, so they do not report it — see §4.

### The one domain rule that matters: stock, not remainder

The volume is computed from a board's **stock dimensions**, and `cuts` are ignored
entirely. A dado does not reduce the board you buy. The stock leaves the yard whole and
the joinery happens afterward, in your shop, out of material you have already paid for.

This is worth stating loudly because it is the *inverse* of what every other consumer
of `cuts` does. `boardSolids` removes stock; `buildDepthField` reports how much was
removed; `buildDiagrams` draws it. A future reader who has been working in `cuts.ts`
will arrive here primed to subtract, and subtracting is wrong. So the rule goes in the
code as a comment, not only in this document.

The cut list already takes this position implicitly — `CutListRow` prints stock
dimensions for a board whose cuts remove all of it (that was the reasoning that kept
follow-ups 48 and 49 out of the cut list's scope). Board feet makes the position
explicit and arithmetic.

---

## 2. Exact, not representative — the correctness fork

**Rows are representative.** Follow-up 55 records it and invariant 18 explains why: two
boards belong on one row when their dimensions *print* identically at display
precision, not when they are equal. A row's `length`/`width`/`thickness` are the first
board's.

For a printed dimension that discrepancy is invisible by construction — the row prints
the representative's numbers, and every other board on the row prints the same numbers,
because printing identically is what put them there. **Board feet breaks that
symmetry, because it is a sum.** The error does not stay bounded by display precision:
it multiplies by `qty` and then accumulates again across every row in the group.

Two boards 24" and 24.02" long, both printing `24"`, are one row correctly. They are
not the same purchase.

**Decision: a row accumulates each board's exact volume as the grouping loop visits
it.** `buildCutList` already walks every board and does `row.qty += 1`; the exact
volume accumulates at precisely that point. No second pass over `doc.boards`, and — the
reason this beats computing totals separately — a row and its group subtotal are
summed from the same numbers in the same pass, so they cannot disagree.

`CutListRow`'s representative contract is untouched: `length`/`width`/`thickness` stay
exactly what they are today. The new field sits alongside them and is documented as
the one number on the row that is *not* the representative's.

### The visible consequence, stated rather than hidden

A row's board feet may not exactly equal `qty ×` the dimensions printed beside it.
That is correct — the printed dimensions are rounded and the total is not — but it is
the kind of arithmetic a careful user will check on the sheet and find "wrong". It is
recorded in `docs/follow-ups.md` as a third instance of the 55/55a shape, next to the
two that already exist, rather than left to be rediscovered.

Rounding the volumes to match the printed dimensions instead was considered and
rejected: it would make the sheet self-consistent by making the purchasing number
wrong, which is the wrong direction on a number whose entire job is telling you how
much lumber to buy. Invariant 18's rule — *round what is bought, never what is
machined* — is about the **display precision of a dimension**, not a licence to round
the input to a total.

---

## 3. What prints where

Per-row and per-group. **No document-wide grand total.**

```
Pine — 3/4"
  2 ×  24" × 5-1/2"    Leg 1, Leg 2         1.38 bd ft
  1 ×  36" × 7-1/4"    Rail                 1.36 bd ft
                              Pine — 3/4":   2.73 bd ft

Plywood — 3/4"
  3 ×  24" × 30"       Panel 1, Panel 2, Panel 3
                                          15.00 sq ft
                           Plywood — 3/4": 15.00 sq ft
```

- **Per row**, quantity included — this is what tells you which part is eating your
  stock, which a subtotal alone cannot.
- **Per group**, summing that group's rows. A group is one material at one printed
  thickness, which is exactly the granularity you buy at.
- **No grand total.** Pine board feet and walnut board feet sum to a real number but
  not a useful one — you buy per species, at different prices. Board feet and sheet
  square feet cannot be added at all. A total that spans both units would be a number
  with no referent. Omitted deliberately; if it is ever wanted, it must be split by
  unit kind.

---

## 4. Sheet goods report area, not volume

Plywood and MDF are sold by the sheet. Reporting board feet for them would be
arithmetic no one buying plywood uses — and the domain assumptions are supposed to be
the point of this app.

```
square feet = length × width / 144
```

Keyed off **`isSheetGood`**, which already exists in `document/types.ts` and already
carries the doc comment explaining that sheet goods are a different domain thing from
solid stock. No new predicate, no new material metadata.

**A group is uniform in material, therefore uniform in unit.** No group ever mixes the
two, no row ever has to choose, and (per §3) there is no grand total that would have to
add them. The units split costs one branch and no structure.

**Sheet count stays deferred.** "You need 2 sheets" is the number a buyer actually
wants, but it requires a stock sheet size the document does not store (4×8 is an
assumption, not a fact about the project), and an honest count is a 2D packing
problem — which the cut list's §7 already sent to its own spec. Square feet is the
honest thing this design can say: the number you compare against a sheet, without
pretending to have solved nesting.

---

## 5. Where the formatting lives

Board feet is a **decimal** — conventionally two places — and it is the first number on
this sheet that is not a fractional inch. `units/length.ts` has no decimal formatter;
its whole exported surface is `MM_PER_INCH`, `parseLength` and `formatLength`.

**Decision: a new leaf, `src/units/quantity.ts`, exporting `formatBoardFeet` and
`formatSquareFeet`.**

The reasoning is about what `units` *is*. `units` owns how measured quantities print
for this app; `length.ts` prints lengths. A volume is not a length, and widening
`length.ts` to print one would make the filename a lie. A sibling leaf keeps each file
honest about its own quantity.

**This is a new boundary call, not an application of the settled one.** The existing
`document → units` edge (`cutlist.ts` and `diagram.ts` importing `formatLength`) rests
on a specific argument: a *row's identity* must be spelled by the same function that
prints it. Board feet is not an identity key — nothing groups by it — so that argument
does not reach this case and should not be cited for it. The actual justification is
simpler and worth stating on its own terms: **`cutlist.ts` already imports from
`units`, so this adds no new layer edge at all.** It widens an edge that exists, which
is the cheapest available answer to "where does this go".

Precision is two decimal places for both units, fixed. Not user-configurable: the
document's `units.precision` is a *fractional-inch denominator* (16 means sixteenths),
which is meaningless applied to a decimal volume. Feeding it to a decimal formatter
would be a category error that happens to typecheck.

No rounding up. A yard that sells in whole board feet is applying a purchasing policy;
reporting the true number and letting the user round is honest, and the reverse is not
recoverable.

---

## 6. The panel

`CutList.tsx` continues to format nothing — every string arrives ready from
`buildCutList`, the rule the row text and the diagram labels both already follow. The
panel adds two pieces of markup (a row cell, a group subtotal line) and no arithmetic.

**`@media print` is a first-class requirement here, not an afterthought.** The sheet
strips to ink on white, and a subtotal line — visually distinct, probably right-aligned
and rule-separated — is exactly the kind of element that gets styled into invisibility
or into an unreadable dark-on-dark. Follow-up 58 already recorded one instance of this
in this same modal. Verified in a browser, not assumed.

---

## 7. Testing

`document/cutlist.ts` is pure and unit-tested; TDD applies, unlike the viewport work
that preceded this.

The tests that carry weight:

1. **Exact-versus-representative.** Two boards 0.02" apart in length, collapsed onto
   one row, must sum *both* true volumes — not twice the representative's. This is the
   §2 fork, and it is the one test that fails if someone later "simplifies" the
   accumulator to `qty × representative volume`. Written first.
2. **The units split.** A solid-stock group reports board feet; a sheet-goods group
   reports square feet; thickness is absent from the sheet-goods arithmetic.
3. **Cuts are ignored.** A board with a dado reports the same board feet as an
   identical board without one — the §1 rule, pinned so that a future reader who
   "fixes" it by subtracting removed stock gets a failing test and this document's
   reasoning.
4. **Group subtotal equals the sum of its rows.** Cheap, and it is what guarantees the
   single-pass accumulation stayed consistent.
5. **Formatting.** Two decimal places, both units, including a value that rounds
   (0.005 cases) and a zero-ish value.

Browser: the print check from §6, and one look at a real sheet to confirm the numbers
read as purchasing information rather than competing with the bench numbers.

---

## 8. Non-goals

Recorded as decisions, not omissions.

- **A waste factor.** Real buyers add 15–20%. It is a per-user purchasing preference,
  it is a trivial mental multiply on a number now printed for them, and adding it means
  a settings surface this app does not have. Declined.
- **Sheet count and nesting.** See §4.
- **A document-wide grand total.** See §3.
- **Cost.** Board feet × price-per-board-foot is the obvious next step and is a
  genuinely different feature: it needs per-material prices, which are user data the
  document has no place for yet, and they change per purchase.
- **Any schema change.** `CURRENT_VERSION` stays 4. Everything here derives from
  dimensions already stored — the same property that made the cut list and the diagrams
  schema-free.
- **Changing what a row is.** The grouping key is untouched. Board feet is derived
  *from* rows; it does not participate in forming them, and must not — grouping by a
  computed total would collapse parts that are not the same part.
