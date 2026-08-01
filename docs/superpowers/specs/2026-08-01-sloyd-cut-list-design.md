# Sloyd cut list — the numbers you take to the bench

> A model that is correct on screen still has to become a stack of parts. This turns
> the document into a sheet you can print and carry: what stock to buy, what to cut
> from it, and what joinery each part needs.

Joinery shipped first on purpose. The reason given at the time was that a cut list
which does not know about dados reports the wrong numbers — and that turns out to be
half right, in a way worth stating up front because it shapes this whole design:

**A cut does not change a part's stock dimensions.** Invariant 2 says so directly —
a cut removes stock from *inside* the board's AABB, so it changes no extent. The
rough stock for a dadoed rail is the same as for an undadoed one. What joinery
actually buys the cut list is a *second kind of output*: the per-part setup lines
that tell you where to put the dado once the part is cut to size. The v1 roadmap
called this "a setup sheet carrying joinery measurements to the bench", and
`cutLabel` was written in the joinery pass explicitly "for the panel today and the
cut list later".

So this release is two outputs on one sheet, not one output corrected for joinery.

---

## 1. What the cut list is

A derived, read-only view of the document: parts grouped by material and thickness,
identical parts collapsed into quantity rows, and each row's joinery printed beneath
it. It is opened from the toolbar, read on screen, and printed.

It adds no state, no schema field, and no version. Everything it shows is computed
from `Board` and `Cut` at render time. If the implementation finds itself wanting to
*store* something the cut list needs, that is a signal that derived state has leaked
into the document — re-derive instead, and escalate rather than adding version 5.

---

## 2. `src/document/cutlist.ts` — a leaf, and the reason it is one

The derivation is a pure function over the document. It lives in `src/document/`
alongside `cuts.ts`, not in `panels/`.

```ts
export function buildCutList(doc: SloydDocument): CutList;
```

This is the part of the feature worth testing hardest, and putting it in a `.tsx`
would make it reachable only through the DOM. `cuts.ts` is the precedent: pure,
imports only `./geometry` and `./types`, never `./document`, and carries the joinery
test suite on its own. `cutlist.ts` follows that shape, importing `./types`,
`./geometry` (`positionAxisOf`), `./cuts` (`cutLabel`), and `../units/length`
(`formatLength`).

### The one layering amendment, stated rather than slipped in

CLAUDE.md currently says `units` and `document` are **both leaves** — "each imports
nothing from the rest of the app". `cutlist.ts` breaks that: it imports
`formatLength` from `units`.

This is deliberate and the architecture section should be amended to match, because
the alternative is worse. The tolerance rule below is *defined* as "two parts collapse
when they print identically", so the grouping key must be produced by the same
function that prints. Reimplementing `formatLength`'s tick rounding inside `document`
to preserve the leaf property would recreate exactly the drift hazard that invariant
13 was retired for — two copies of one rule, kept in agreement only by a test that
exists to catch them disagreeing.

The edge is safe: `units` imports nothing, so `document → units` creates no cycle and
no inversion. It makes `units` strictly the bottom layer rather than a sibling leaf.
It is also natural rather than grudging — `units.precision` already lives
*in the document*, so the document layer already owns the precision value; it simply
had no reason to consume it until now.

**Rejected alternative:** injecting the formatter (`buildCutList(doc, format)`) keeps
`document` a leaf and makes the contract explicit, but it moves the definition of part
identity to the call site, where a second caller passing a different formatter would
silently get different grouping. One rule, one place beats one fewer import.

### Output shape

```ts
interface CutList {
  groups: CutListGroup[];
}

interface CutListGroup {
  /** MATERIALS key. */
  material: string;
  /** Exact inches. */
  thickness: number;
  /** e.g. `Pine — 3/4"` */
  label: string;
  rows: CutListRow[];
}

interface CutListRow {
  /** The identity string this row was grouped by. Stable, and the React key. */
  key: string;
  qty: number;
  /** Board names, in document order. Unique per invariant 8. */
  names: string[];
  /** Exact inches, for sorting and for tests. */
  length: number;
  width: number;
  thickness: number;
  grain: Grain;
  /** e.g. `24" × 3-1/2"` — length × width, already formatted. */
  dims: string;
  /** One line per cut, already formatted. Empty when the row has no joinery. */
  setup: string[];
}
```

Rows carry both the exact numbers and the formatted strings. The exact numbers exist
for sorting and for tests to assert against; **the panel renders only `dims`,
`setup`, `qty` and `names`.** That is what keeps display rounding to one place.

---

## 3. What makes two parts one row

Identity is: **material, thickness, length, width, grain, and joinery.**

`posture` and `rotation` are excluded. They say where a part sits in the model, not
how it is cut from stock — four legs of a table are one row whether they are modelled
upright or lying flat, and a cut list that split them would be reporting the model's
staging rather than the shop's work.

`grain` is included. A part whose fibres run along its width is laid out on the board
differently from one running along its length, so collapsing those would produce a row
you cannot actually cut as a batch. This is the one field where the call could
reasonably go the other way; it goes this way because the sheet's purpose is batching
work at the bench.

`position` and `id` are excluded, obviously. `name` is excluded from identity but
collected into `names`.

### Tolerance is display precision, expressed as the key itself

The grouping key is built by running every *number* through `formatLength` at
`doc.units.precision` and concatenating the results with `|` — a character
`formatLength` never emits (its output is digits, `-`, `/` and `"`), so no combination
of values can collide by running two fields together. Every *enum* field — `material`,
`grain`, `face`, `from`, `across` — goes into the key verbatim; all of them are
lowercase identifiers containing no `|`.

That is the whole tolerance rule. Two rows that print identically *are* one row, by
construction — there is no separate comparison step that could disagree with what the
user sees. There is no epsilon anywhere, and no float `===` on a dimension, which is
the trap that made `cutLabel` wrong about 2.8% of the time at realistic board sizes.

A consequence worth naming: at precision 16, two boards 1/32" apart collapse, and
their row prints the rounded value. This is correct for a shop sheet — the user chose
the precision they cut to — but it means the cut list is *not* a faithful report of
exact stored values, and never claims to be.

### The joinery signature — exact, and deliberately not display precision

A row's cuts must match as well. Each cut renders to a canonical string —
`face`, `from`, `across` verbatim, then `offset`, `width` and `depth` as their **exact
numbers** (`String(n)`), not formatted; `id` excluded, since it is identity rather than
geometry. The strings are sorted, and the sorted list is joined into the key.

**This is the one place the display-precision rule does not apply, and the asymmetry is
the point.** A stock dimension rounded to the precision you cut to costs you nothing —
you were going to cut to that precision anyway. A dado *location* rounded the same way
costs you the joint: two dados 1/32" apart are two different setups, and a sheet that
merged them would print one offset and quietly be wrong about the other part. So
dimensions collapse at display precision; cuts must match exactly.

Note that this is a comparison of two numbers for equality within a key string, not a
float `===` on a computed value — the hazard that made `cutLabel` wrong 2.8% of the
time was comparing a *subtraction result* against a bound. These are stored values
compared to stored values, and two cuts entered as the same number are the same number.
The failure mode of being too strict is a split row, which is visible and harmless; the
failure mode of being too loose is a wrong measurement, which is neither.

Sorting is what makes the signature order-independent: two boards carrying the same
two dados collapse regardless of which cut was added first. A board with no cuts
contributes an empty signature, so undadoed parts group with each other and never with
dadoed ones.

### Ordering is fixed, not a preference

- Groups: by material label ascending, then thickness descending.
- Rows within a group: by length descending, then width descending, then `key` as the
  final tiebreak so the output is fully deterministic.
- Names within a row: document order.

Determinism matters for the same reason it did in `mergeAlong` — tests assert on it,
and React keys off it.

---

## 4. The setup lines

Each row's `setup` is derived from the cuts shared by every part in that row — they are
identical by construction, so the first part to land in the row supplies them.

**Computed during grouping, not from the finished row.** `cutLabel(board, cut)` takes a
`Board`, because dado-versus-rabbet depends on the board's dimensions and not on the cut
alone. So the setup lines are built while the board is in hand — as the row is created —
rather than reconstructed afterward from `CutListRow`, which deliberately does not carry
a board. Nothing downstream of `buildCutList` needs one.

One line per cut, phrased part-locally, so the numbers are already the ones you take
to the bench:

> `3/4" dado, 1/4" deep — into the thickness face (min side), 6" from the width min
> end, running across the length`

Reading the template off the `Cut` type:

- `width` and `cutLabel(board, cut)` open the line — the label is derived, never
  stored, exactly as joinery designed it.
- `depth` follows.
- `face` and `from` say which face it is cut into and from which side.
- `offset` is measured along the **position axis**, obtained from
  `positionAxisOf(face, across)` — implied, never stored, so a cut can never name the
  same dimension twice.
- `across` says which dimension it runs fully across.

Every number goes through `formatLength`. Dimension names appear as
`length`/`width`/`thickness` — the part-local vocabulary the panel already uses — never
as world axes.

The panel may wrap this across two lines for readability; the module produces one
string per cut and does not concern itself with layout.

---

## 5. The panel

**Entry point.** A `Cut List` button in `Toolbar.tsx` opens a full-screen modal over
the app. The only new state is an `open` boolean held locally in `App.tsx` alongside
the existing layout state — nothing goes into the store, because nothing here is
undoable. It closes on Escape and on a close button.

**`src/panels/CutList.tsx`** is a dumb renderer over `buildCutList`'s output: group
headers, then rows as `qty × dims` with names, then indented setup lines under any row
that has them. It derives from the store's document on every render — no cached copy,
so it cannot go stale. It formats nothing itself.

An empty document renders "No parts yet" rather than an empty table.

**Print.** A `Print` button calls `window.print()`, and an `@media print` block hides
everything but the sheet — toolbar, viewport, panels, the modal's overlay chrome and
backgrounds, and the close and print buttons themselves. This is CSS over the same
DOM, deliberately not a second render path: there is no "print version" that can drift
from what was on screen.

---

## 6. Testing

`cutlist.test.ts` carries the weight, and can, because the module is pure:

- Two identical boards collapse to `qty: 2` with both names.
- Boards differing only in `posture`, `rotation`, `position` or `name` collapse.
- Boards differing in `material`, `thickness`, `length`, `width` or `grain` do not.
- Precision boundary: two boards 1/32" apart collapse at precision 16 and split at
  precision 32.
- Joinery signature: same two cuts added in opposite order collapse; a differing
  `depth` splits; a cut-bearing board never collapses with a cut-free one.
- Joinery is exact, dimensions are not: two boards whose *lengths* differ by 1/32"
  collapse at precision 16, while two boards whose *dado offsets* differ by 1/32" do
  not — one test asserting both halves, since the asymmetry is the design.
- Setup lines: a dado and a rabbet each produce the expected string, including the
  position axis for every `face`/`across` pairing.
- Ordering: groups and rows come out in the specified order, deterministically.
- Sheet goods group by thickness like anything else.
- Empty document yields `{ groups: [] }`.

`CutList.test.tsx` covers rendering, the quantity and setup markup, and the empty
state, following `Properties.test.tsx`.

The print stylesheet gets a browser check, not a unit test — consistent with how the
viewport is verified here, and with the warning in follow-up 26a about trusting this
host's software GL for anything visual. The cut list touches no shader, so a
screenshot is sufficient.

---

## 7. Non-goals

Recorded as decisions, not omissions.

- **Board-feet and sheet totals.** The natural next output, and cheap once
  `buildCutList` exists — but it is a purchasing number, not a bench number, and this
  release is about the bench.
- **Sheet-goods nesting layout.** A real packing problem; its own spec.
- **CSV, clipboard, and file export.** The print view covers taking the sheet to the
  shop. Adding an export format means a `StorageAdapter` method and a format decision,
  neither of which the printed sheet needs.
- **Follow-ups 48 and 49.** A board whose cuts remove all its stock renders as nothing
  in the viewport. The cut list is unaffected — it reports stock dimensions, which such
  a board still has — so folding the fix in here would blur what this change is. They
  stay open, and stay panel/viewport bugs.
- **Name run-collapsing.** `Leg 1..4` reads better than `Leg 1, Leg 2, Leg 3, Leg 4`,
  but it requires inferring numbering from free-text names, and gets it wrong the first
  time someone names a part `2x4 Blocking`. Names are listed in full.
- **Any schema change.** See §1.
