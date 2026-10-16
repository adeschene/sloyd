# Sloyd — Plans sheet part balloons (design)

Date: 2026-10-16. Follow-up 252 ("Numbered callouts linking the exploded figure to cut-list rows"). Status: approved 2026-10-16;
plan `docs/superpowers/plans/2026-10-16-sloyd-plans-balloons.md`.

## 1. Purpose and rulings

The exploded isometric on the Plans sheet names no part; a reader matches it to the cut list by eye. Balloons put a
number on the figure that is printed on the cut-list row it stands for: "which board is this, and what size".

User rulings (brainstorm, 2026-10-16):

- **R1 Part balloons first.** Feature callouts (hole sizes and positions, fu 333; angles, fu 279; curve radius and
  rise, fu 362) are a later round: they need the drawing to tag its lines by feature, which it does not today.
- **R2 One number per cut-list row.** Four identical legs are one row and one number.
- **R3 The exploded view only.** The Front/Side/Plan elevations keep their dimensions and get no balloons.
- **R4 One balloon per row.** It points at one of the row's parts; the row's quantity is on the cut list.
- **Approach A** (chosen over balloons searching free space beside each part, and numbers drawn on the parts): balloon
  columns left and right of the figure, each balloon with a leader to a point on a line drawn for its part.

Non-goals this round, each staying a follow-up: feature callouts (333, 279, 362); balloons on the elevations; one
number per part; balloons moved by hand (positions in the document need a schema bump); numbers in the viewport or
Properties.

## 2. Numbering — `document/cutlist.ts`

`CutListRow` gains two fields, set in `buildCutList` after its existing sort:

```ts
number: number;      // 1-based position in display order: groups as sorted (material label, thickness descending),
                     // rows within a group as sorted (length, width descending, then key)
boardIds: string[];  // the ids of the row's parts, in document order — `worldParts` ids (flatDocument keeps them)
```

- **One home.** The number is the row's position, assigned once, in the module that sorts. The Plans sheet calls the
  same `buildCutList(flatDocument(doc))`, so a balloon and its row cannot disagree.
- **Per document state.** Editing a part can re-sort rows and so renumber them; a printout reflects the state it was
  printed from. Nothing is stored: no schema change.
- **Hidden parts** are in the cut list (inv 43) and drawn on the sheet, so they are numbered and ballooned like any
  other part.
- Every board is in exactly one row's `boardIds`.

### 2.1 The cut list prints the number

Each row gains a leading number column (`cutlist-num`) before its quantity: `3   4 × 28" × 1-3/4"   Leg A, Leg B, …`.
It prints (it is the cross-reference to a printed Plans sheet), in black like the row's other text.

**Decision owed before this step is built:** a sheet layout's key also numbers 1, 2, 3 (its parts on one sheet, fu 162),
and it prints on the same cut list. If the two series can read as one, either the key moves to letters or the number
column gets a `#` heading. Both are rendered on the dev server and the user chooses from screenshots; the plan's first
task carries the choice.

## 3. Placement — `panels/planBalloons.ts`

Pure functions beside `planLayout.ts` and `planDims.ts`, tested without rendering. Input: the exploded `Drawing` (its
visible segments, each tagged with its `part`), the rows (`number`, `boardIds`), and the figure's drawing rectangle.

### 3.1 Anchor (one per row)

- Among the row's parts, the one with the greatest total visible line length in the exploded view; a tie goes to the
  first part in `boardIds`.
- The anchor is the midpoint of that part's longest visible segment (a tie goes to the first in the drawing's order) —
  on a line actually drawn for the part (inv 16's rule: a marker sits on a drawn feature).
- A row none of whose parts has a visible segment gets no balloon (§4.2).

### 3.2 Columns

- An anchor left of the drawing's horizontal centre goes to the LEFT column, otherwise the RIGHT.
- Within a column, balloons are ordered by their anchor's height and packed along the vertical with `packRow`: each
  sits level with its anchor if it can, a crowd cascades, none overlap; the column spans the figure's height (§3.4).
- Leaders in one column do not cross each other where ordering decides it; leaders to anchors at very different depths
  may still cross (accepted).

### 3.3 The balloon

- A circle whose radius fits the widest number on the figure, measured (`labelWidth`, `labelHeight`; inv 19), plus a
  pad — every balloon on a figure is one size. The number is centred in it.
- A leader runs from the circle's edge toward the anchor and ends in a small dot ON the anchor.

### 3.4 Room

- A column exists only on a side with at least one balloon; its width (the balloon's diameter plus clearance) comes
  out of `PLAN_WIDTH`, so the drawing scales down to make room.
- **With no balloons the layout is exactly today's** (`layoutSingle`'s numbers and the SVG unchanged).
- Height: a column first fits within `ISO_MAX_HEIGHT` (640). If its packed balloons need more, the figure grows taller,
  up to `TRIO_MAX_HEIGHT` (1250, the cap that already fits a printed Letter page).
- Past that, the rows that do not fit are listed in the figure's note (§4.2), never dropped silently.

## 4. Rendering — `panels/PlanFigure.tsx`

### 4.1 Drawing

`ExplodedFigure` computes the cut list (memoised on `doc`), the balloon layout (on the drawing and the rows), and draws,
after the part lines: each leader, its dot, its circle and its number.

- Classes `plans-balloon` (circle and number) and `plans-leader` (leader and dot) in `styles.css`, reading the sheet's
  surface roles: the number in `--ink`, the circle a step dimmer, the leader thin and dim so it reads as annotation and
  not a part edge. Black in the print block, as the sheet's lines are.
- The balloons follow the sheet's DEFERRED explode amount with the figure (fu 263). At 0 an assembled piece hides many
  parts, and those rows go to the note.

### 4.2 The note

Under the figure, in the sheet's existing notes list, only when needed:

- `Not visible in this view: 7, 9.` — rows with no visible segment.
- `Not ballooned (no room): 33–40.` — rows past the height cap (§3.4).

### 4.3 Unchanged

The elevations and their dimension bands; the part diagrams; a sheet layout key's numbering (unless §2.1's decision
changes it); the viewport. Balloons carry row numbers, never lengths, so the units (inv 52) do not touch them.

### 4.4 Cost

Placement reads the visible segments `drawView` already returns for the figure: one walk over them, no second
hidden-line pass.

## 5. Testing

Every new test fails before its code exists or is mutated (the house rule).

- **`cutlist.test`**: numbers run 1…N in display order across groups; every board in exactly one row's `boardIds`; a
  fixture whose edit re-sorts rows renumbers them.
- **`planBalloons.test`**: the anchor lies on a visible segment of the chosen part (the most visible one; the tie);
  the side split at the centre; a packed column never overlaps; each leader ends on its own anchor (fu 71; mutated by
  crossing them); a row with no visible segment goes to the note; no rows gives exactly today's layout; rows past the
  height cap go to the note.
- **`CutList.test`**: the number column renders each row's number.
- **`PlansSheet.test`**: one balloon per row in the exploded figure and none in the elevations; balloon numbers match
  the cut list's; at explode 0 a hidden part's row is in the note.
- **Live, on the dev server**: a small table (about 6 rows) and a bookcase (about 15 rows), screenshots for the user's
  eye; print emulation for page fit. The real print stays owed with fu 254.

## 6. Build order

One chunk: numbering (§2, with §2.1's decision), then placement (§3), then the figure (§4). No schema change: deploying
or rolling back costs nothing.
