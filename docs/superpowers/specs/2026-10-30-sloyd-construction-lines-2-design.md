# Construction lines, round 2 — design

The five follow-ups the construction-lines round left open (fu 578–582), built as one round:

| fu | What it adds | § |
|---|---|---|
| 578 | **Oblique lines**: a line through any two snap points, such as along a leaning leg | 2 |
| 581 | **Where a line meets a part's face**, as a snap point | 3 |
| 579 | **A line at a typed offset in one gesture**: step the anchor by a typed distance, then place | 4 |
| 580 | **Editing a line**: type its coordinates in the Guides list | 5 |
| 582 | **Lines on the Plans sheet** | 6 |

Chosen 2026-10-30 by the user ("Go ahead with the construction-line follow-ups"). **The user skipped the design questions, so
every decision below is Claude's call unless it says otherwise.** The calls are listed in §11 for review. The round-1 spec,
`2026-10-29-sloyd-construction-lines-design.md`, and its Amended block still govern everything this spec does not change.

---

## 1. Goals, non-goals, anti-goals

**Goals**

- Sight along and snap to a line that runs in any direction, not only along X, Y or Z.
- Snap to the exact spot where a line enters or leaves a part, such as the mortise centre where a leg line meets the apron's face.
- Get "a line 3" in from that edge" without leaving a stray guide point behind.
- Fix a line placed at the wrong height by typing the right number, rather than deleting it and placing it again.
- Print the lines on the Plans sheet when you want them there.

**Non-goals** (each recorded as a follow-up when this round ships)

- Editing an oblique line's two points, or changing any line's axis. Delete it and place it again.
- Moving or editing a guide **point** (fu 130 keeps "delete and place again" for points).
- Dragging a line in the viewport. Picking a line stays impossible (round 1 §5).
- Lines on the part diagrams, the cut list or the labels; lines in the Plans ISO, assembly and section figures (§6).
- A slid point on an oblique line landing on the drag grid in world coordinates (§2.4 explains why it cannot).
- A face hit on a hole's wall or inside a bore (§3.2).

**Anti-goals** (the round fails if it does any of these, even if it works)

- Anything that changes a project with no oblique lines, or a Plans sheet with the new option off. Both must stay byte for byte as before.
- A snap point that sits in air: on the far side of a cut, inside a bore, or on a boundary between two cells of one part (inv 16: a marker sits on a drawn feature).
- A held point (anchor, hover, grab) that survives the line or part it was taken from being moved, edited or removed (inv 24).
- An axis line's crossing, or its face hit on a square face, that is anything but exact (inv 25).

---

## 2. Oblique lines — fu 578, schema 32

### 2.1 The gesture

Anchor the tape on a point. With **no axis locked and nothing typed**, hover a second point and press **Enter**. A line is placed
through the two points, and the anchor clears, as after any placement.

Today that state raises `unparseable` ("Can't read that as a length"), which tells the user nothing. Now it places a line. A typed
distance still places a guide point along anchor→hover (unchanged). With nothing hovered, Enter still raises `no-direction`.

The one decider grows a parameter, and both Enter sites keep calling it (round 1 §3.2, inv 27):

```ts
tapeLineFor(anchor, axis, typed, hover): NewLine | null
// NewLine = { at; axis } | { at; to }
```

| State | Result |
|---|---|
| axis locked, nothing typed | an axis line through the anchor (round 1, unchanged) |
| no axis, nothing typed, hover ≠ anchor | a line through anchor and hover |
| anything else | `null` (the point path runs, or the key falls through) |

**When anchor→hover is exactly axis-parallel**, meaning two of the three coordinates are `===`, the result is an **axis line**,
canonical as in round 1. So a line between two corners of a square leg is the same axis line the lock would have placed. It is
exact and gets round 1's crossings.

The readout hint, with no lock and nothing typed:

- with a hover: `Enter for a line through both points, or type a distance`
- without a hover: today's `Type a distance, Enter to place`
- when the line would be a duplicate (§2.2): `That line is already there; type a distance`

The preview (round 1 §3.5) gains the same case: no lock, nothing typed, and a hover draws the line Enter would place, at preview
strength.

### 2.2 The document

```ts
export interface GuidePoint { id; at; axis?: undefined; to?: undefined }
export interface GuideLine  { id; at; axis: TapeAxis; to?: undefined }   // round 1, unchanged
export interface GuideRay   { id; at: Vec3; to: Vec3; axis?: undefined } // through `at` and `to`
export type Guide = GuidePoint | GuideLine | GuideRay;
```

`to?: undefined` on the other two kinds does the job `axis?: undefined` did in round 1: the compiler makes every reader filter.
The names (`GuideRay`, `isGuideRay`, an `isAnyLine` for "an axis line or an oblique one") are the builder's. The helpers live
beside round 1's `isGuidePoint`/`isGuideLine`.

- `at` and `to` are the two picked points, stored exactly as picked. They are not normalised, so both stay on the snap points the
  user clicked, which is what lets a slide measure from `at` (§2.4).
- `at` and `to` must differ. An oblique line is never axis-parallel (§2.1 stores those as axis lines).
- **Sameness is the unordered pair, exactly:** `(at, to)` or `(to, at)`, every coordinate `===`. A second line through two
  *different* points of the same infinite line is kept. Judging collinearity needs a tolerance, and a near-duplicate line costs
  nothing. `addGuideLine` refuses an exact duplicate before `edit()`, as in round 1.

### 2.3 The bump, argued for this field

A build at 31 runs `validateGuides`. It would read an oblique line as an entry with no `axis`, which is a point, and keep it as a
guide **point** at `at`. Its next autosave would write it that way: the line is lost and a stray point is left behind. **So a 32
file must be refused by a 31 build.**

`CURRENT_VERSION` goes 31 → 32. The step adds nothing. `validateGuides` changes as follows:

- A point and an axis line load exactly as at 31. Every 31 file loads byte for byte as before.
- An oblique line is kept when `at` and `to` are each three finite numbers and differ.
- An entry with `to` present but malformed is **dropped**, never degraded to a point.
- An entry with both `axis` and `to` is dropped.
- An entry whose `to` makes it axis-parallel is **kept as an axis line**. The loader canonicalises it: `axis` is set and
  `at[axis]` is zeroed. That form can only come from a hand-edited file, and §2.1's rule says it is that line.

`docs/versioning.md` gets the 31→32 row. Rolling back past this round refuses every project saved at 32, so export first. Fu 556's
"schema 32 now" becomes "schema 33 now".

### 2.4 Snapping to an oblique line

**Sliding.** `pickOnLine` takes oblique lines too. The closest approach between the line and the cursor ray uses the general
formula, with the line's direction `u = (to − at)/|to − at|`. Round 1's axis form is the special case, and the axis path keeps its
own arithmetic so its results stay exactly as before. A ray parallel to the line offers nothing, as in round 1.

**What rounds.** The slid point's **distance from `at` along the line** is rounded with `snapToGrid`, so a slide reads 3", 3-1/16"
and so on from the first picked point. Its world coordinates are `at + t·u`, computed, not on the world grid, and that cannot be
helped: a line at an arbitrary slope passes through almost no grid points. Inv 25's list gains the entry. It is still "round what a
free drag produced", applied to the only free coordinate.

The clamp to the drawn extent works as in round 1 (B1). The extent is the part of the line inside the `±SCENE_EXTENT` box, which
§2.5 clips.

**Crossings.** Two lines cross when they meet:

- **Axis × axis:** round 1's `===` test, exact, unchanged.
- **Any pair involving an oblique line:** the closest approach between the two lines. They cross when the gap is under
  `CROSS_TOLERANCE` = 1e-6" (a named constant), and the crossing point is the midpoint of the closest-approach segment. Parallel
  lines never cross. These crossings are **computed, not exact**, and inv 25's crossing entry says "exact for two axis lines".

Owners are as in round 1 (`{ type: 'guide', id, cross }`, kind `'line-cross'`).

### 2.5 Drawing

An oblique line is drawn dashed across the part of it inside the `±SCENE_EXTENT` box: the parametric line clipped against the six
box planes. A line that misses the box draws nothing. It is drawn in one neutral colour; the builder picks it from the guide family
and the user judges it by eye. Every other rule is round 1's: depth-tested, the dash scale held constant on screen, hidden while
exploded and by the Guides toggle, not clipped by the section plane.

### 2.6 The Guides list

An oblique line's row reads `Line through 1", 2", 3" and 4", 5-1/2", 6"`, every length through `formatLength` (inv 52). The remove
label is `Remove line through …` with the same text. It has no edit fields (§5).

---

## 3. Where a line meets a part — fu 581

### 3.1 The candidate

For every line (axis or oblique) and every part offered as a snap source (visible, kept by the section, as board points are today),
each point where the line **passes between air and wood** on the part's surface is a candidate:

```ts
{ kind: 'line-face', at, owner: { type: 'guide', id: lineId, board: partId } }
```

- **Computed on `worldBodies`** (`drawing.ts`), the ONE world-body source. It is hole-free, convex, and composes posture and lean.
  Each body is clipped against the line (Cyrus–Beck over its planes), which gives an entry point and an exit point.
- **Only the true surface.** A boundary between two bodies of one part, such as two pocket cells or the pieces of a split curve, is
  not a surface. An entry or exit is kept only where one side of it, just along the line, is in none of the part's bodies (probed at
  ±ε along the line). Sloped faces from angle cuts and leans count: the hit is computed.
- **Not in a bore.** A hit inside a hole's mouth sits on air in the drawn mesh, so it is dropped. The test uses the holes module's
  own piece test (`holePieces`/`holeEnvelope`); the builder states which in the plan. The bore's wall is not offered (§1 non-goal).
- **Exact where it can be (inv 25).** For an **axis line meeting a face square to it** (the face plane's normal is ±that axis), the
  hit's coordinate along the axis is the plane's own constant, assigned directly and never computed back through `t`. The other two
  are the line's stored values. `a + (c − a)` is not always `c` in floating point, so the assignment is the rule, and a test pins it.
  Every other hit is computed.

The owner is the **line**, with the part on `board`. That keeps inv 26 whole: a guide-owned point can never be a grab, so a face hit
is a Move **target** only, like every line candidate. A face hit on a part being moved is **not** a target, for the same reason the
moving parts' own points are excluded: it moves with them.

`SnapKind` gains `'line-face'`, with a marker hue the builder picks and the user judges by eye. Priority is unchanged: face hits are
discrete candidates, so they win over sliding (round 1 §4.1).

**Cost.** Lines × parts × bodies, rebuilt only when the document or the guides change: memoised on `doc` (which owns `guides`), in
the same place the candidate list is built today. A perf guard pins it: 20 lines against the shaker-table fixture, under the guard
budget's rule (the minimum of 9 runs, lowered only).

### 3.2 Held points (inv 24)

A face hit depends on **two** things, the line and the part, so it is dropped when either changes:

- **The line goes or moves:** `ownedByGuide(p, id)` is already true for `owner.id === id`, so `removeGuide` and the new line edit
  (§5) drop it with no new clause.
- **The part moves or changes:** today `judgeHeld`/`dropHeldIfGone` judge only board-owned held points. They now also judge a held
  point with `owner.board`, point-precisely as always. It survives when the same line's hits on that part, recomputed on the
  post-edit document, still include it (`sameSnapPoint`, which compares `board` too). `deleteBoard`'s owner-conditional clause drops
  it when its part goes. `rekeyHeld` re-keys `owner.board` the way it re-keys a board owner.

The enumeration at `tapeHover`'s declaration gains one sentence for `board`. It is not restated anywhere else.

---

## 4. A line at a typed offset in one gesture — fu 579

### 4.1 The gesture: step the anchor

Anchored, with a distance typed and a direction (an axis lock or a hover), **Shift+Enter moves the anchor** to the offset point
instead of placing a guide point there. Nothing is added to the document. The text clears, because a fresh anchor starts a fresh
measurement (the readout's existing effect). The axis lock is kept, as `setTapeAnchor` keeps it today.

"A line 3" in from the front edge, running along X" is then: click a front corner, **Z**, type **3**, **Shift+Enter**, **X**,
**Enter**. That is one unbroken gesture with no stray point. Steps chain: Shift+Enter again moves the anchor on from the stepped
point.

- It takes the same direction and distance as the point path, from the same `towardFor`/`offsetPoint`, and raises the same three
  errors.
- Shift+Enter with nothing typed does what Enter does (a line, or the errors).
- Only the readout input handles a typed Shift+Enter, because typed text means focus is in the input. App's window Enter branch
  (round 1) treats Shift+Enter as Enter; its modifier test excludes Ctrl, Meta and Alt only.
- The hint, with a distance typed: `Along Z — Enter to place, Shift+Enter to move the anchor there` (with a lock), or
  `Enter to place, Shift+Enter to move the anchor there` (without).

### 4.2 The stepped anchor and inv 24

```ts
{ kind: 'offset', at, owner: base.owner, base: SnapPoint }
```

`base` is the **root** feature point the steps started from. A stepped point is never a base: stepping a stepped anchor keeps its
`base`. `owner` is a copy of `base.owner`.

**It survives exactly as long as its base would.** Every held-point judgement (`dropHeldIfGone`'s survival test, `judgeHeld`'s
owner collection, `ownedByGuide`, the line-face rule of §3.2) judges `p.base ?? p`. This is sound: the stepped position is derived
from the base's position and two numbers the user typed, and the base surviving point-precisely means its position is unchanged.
`rekeyHeld` re-keys the owner on both the point and its base.

`sameSnapPoint` compares `base` as well. `SnapKind` gains `'offset'`, with a marker hue (the builder's, judged by eye). A stepped
anchor is only ever `tapeAnchor`. It is never a hover, a grab or a candidate, so it never enters `pickSnapPoint`.

---

## 5. Editing a line — fu 580

### 5.1 The list row

An **axis line's** row in the Guides list shows its two fixed coordinates as `DimensionField`s:

```
Line along X · Y [12"] · Z [3-1/2"]     ×
```

The fields follow inv 5 and DimensionField's own rules: a local draft while focused; on blur, resync from the stored value; no
commit when untouched; parsing through `parseLength` with the document's units (inv 52). The along-axis coordinate is not shown, as
in round 1, because it means nothing. An oblique line's row stays text (§2.6), and a guide point's row is unchanged.

### 5.2 The store action

```ts
moveGuideLine(id: string, at: [number, number, number]): boolean
```

- `readOnly()` refuses at entry (exploded, inv 47). The list is inside `EditLock` already.
- The typed value is stored **exactly** (inv 25's typed entries). The result is canonicalised (`at[axis] = 0`).
- An unchanged value is a no-op before `edit()`: no undo entry, redo left alone.
- **A move onto another existing line is refused** before `edit()` and returns false. The field then resyncs to the stored value on
  blur, as a refused DimensionField edit does elsewhere.
- Otherwise there is ONE `edit()` and ONE undo entry per committed field.
- **Inv 24:** every held point owned by the line (`ownedByGuide`: slid points, crossings, face hits, and stepped anchors whose base
  is one of those) is dropped before the edit, with the same clauses `removeGuide` uses. Those clauses are moved into one shared
  helper so the two actions cannot drift apart.
- An oblique line, or an unknown id, returns false.

The Guides footer, its count and `clearGuides` are unchanged.

---

## 6. Lines on the Plans sheet — fu 582

### 6.1 The option

The Plans sheet toolbar gains a **Construction lines** checkbox. It is **off by default**, it is sheet view state (a `useState`
beside the explode amount, never in the document, undo or autosave), and it is disabled when the document has no lines. **With it
off, the sheet is byte for byte as before** (anti-goal 1), and a test pins that.

### 6.2 What is drawn

With the option on, each line is drawn in the **whole piece's three orthographic views (Front, Side, Plan)**, and nowhere else:

- **Not in assembly figures.** They draw a definition in its own frame, and a line is a world annotation.
- **Not in the ISO figure,** where a line across the scene would bury the piece.
- **Not in the section figure.**
- **Not on the part diagrams, the cut list or the labels.**

In a view:

- A line **parallel to the view direction** projects to a point and is not drawn (an X line in the Side view).
- Any other line is projected and **clipped to the view's drawing bounds** (`Drawing.bounds`), so it runs across the figure and
  stops at it. A line that falls wholly outside the bounds is not drawn.
- It is drawn as a thin **chain line** (long dash, short dash), the drafting convention for construction and centre lines,
  distinct from the dashed hidden lines. It is drawn over everything and never occluded.
- It is **not dimensioned** and adds nothing to the balloons, the keys or `planDims`.
- The figure's bounds do **not** grow to fit a line, so turning the option on never re-lays out the sheet.

The projection and clipping are a pure helper (`planLines(guides, view, bounds)`, beside `drawView`) and are unit-tested.
`PlanFigure` draws its segments. The print path draws what the sheet shows.

---

## 7. Invariants touched

- **Inv 24.** A held point may carry `board` (a face hit, §3.2) or `base` (a stepped anchor, §4.2); survival is judged on
  `base ?? point`, and on the line and the part for a face hit. `moveGuideLine` drops through `removeGuide`'s helper. The
  enumeration at `tapeHover` gains its sentences there only.
- **Inv 25.** Entries are added or changed:
  - a typed line edit is exact;
  - an axis line's hit on a face square to it is exact;
  - a slid point on an oblique line rounds its distance from `at`;
  - "a line crossing (exact)" becomes "a crossing of two axis lines (exact)".
- **Inv 26.** Unchanged in substance: every new candidate is guide-owned, so it is never a grab.
- **Inv 27.** `tapeLineFor` stays the one decider for both Enter sites. Shift+Enter's step lives in the readout input only (§4.1).
- **Inv 33.** Oblique lines share `guides`' `takeId` scope.
- **Inv 47.** `moveGuideLine` refuses at entry while exploded.
- **Inv 51.** Face hits obey `keptBySection` like part points (they are on parts); the lines themselves stay exempt.

`docs/invariants.md` gets the full wording, and CLAUDE.md the condensed form. No new invariant number. The `construction lines` row
in CLAUDE.md's ONE-homes table gains `lineFaceHits`, `planLines` and `moveGuideLine`.

---

## 8. Touch list

| Site | Change |
|---|---|
| `document/types.ts` | `GuideRay`, `to?: undefined` on the other kinds |
| `document/document.ts` | `validateGuides` (§2.3), `CURRENT_VERSION` 32 |
| `document/snapPoints.ts` | `tapeLineFor`'s hover; oblique `sameLine`; `lineCrossings` (oblique pairs); `lineFaceHits`; `SnapKind` (`line-face`, `offset`); `SnapOwner.board`; `SnapPoint.base`; `sameSnapPoint`; `ownedByGuide` on `base` |
| `document/drawing.ts` (or a new sibling) | `planLines` |
| `viewport/snapPick.ts` | `pickOnLine` (oblique) |
| `viewport/moveCandidates.ts`, `MoveTool.tsx`, `TapeTool.tsx` | face hits as candidates (the moving parts' own excluded); the oblique preview |
| `viewport/GuideLines.tsx`, `SnapMarker.tsx` | oblique drawing; three hues |
| `panels/TapeReadout.tsx`, `App.tsx` | §2.1, §4.1 |
| `store/store.ts` | `moveGuideLine`; the shared drop helper; `judgeHeld`/`dropHeldIfGone`/`deleteBoard`/`rekeyHeld` for `board` and `base`; `setTapeAnchor` taking a stepped anchor |
| `panels/GuidesList.tsx` | edit fields; the oblique row |
| `panels/PlansSheet.tsx`, `PlanFigure.tsx` | §6 |
| `docs/versioning.md`, `invariants.md`, `module-map.md`, CLAUDE.md, `follow-ups.md` | §2.3, §7; fu 578–582 closed, new follow-ups for §1's non-goals |

---

## 9. Testing

Unit tests come first, by kind of code. **Every test justified by an ordering, a refusal or an exactness property is mutated** (the
working agreement), and the plan names each mutation.

- **Loader:** a 31 file loads byte for byte. An oblique line is kept. A malformed `to` is dropped. `axis` and `to` together are
  dropped. An axis-parallel `to` becomes an axis line. Ids are re-minted across all three kinds. A 32 file is refused by a 31 build.
- **`tapeLineFor`:** each table row in §2.1. An axis-parallel hover gives an axis line. Hover equal to the anchor gives null.
- **`lineCrossings`:** oblique × axis and oblique × oblique meet within tolerance and miss outside it. Parallel lines never cross.
  Axis × axis results are unchanged (the round-1 tests stay green untouched).
- **`pickOnLine`:** an oblique slide rounds its distance from `at` (imperial and metric). The axis path's results are identical to
  round 1's.
- **`lineFaceHits`:** entry and exit on a plain part. An axis line on a square face is exact, `===` the plane constant (mutate the
  assignment into `at + t·u` and watch it fail). No hit on a cell boundary of a pocketed part. No hit in a bore mouth. A hit on a
  sloped face. A leaning part. A line that misses gives nothing.
- **Store, held points:**
  - a face hit held as the anchor is dropped when its part is resized, kept when its part is renamed, and dropped when its line is
    edited or removed;
  - a stepped anchor survives and dies with its base (board, guide and crossing bases);
  - `rekeyHeld` re-keys both `board` and `base`.
- **Store, `moveGuideLine`:** one undo entry; an unchanged value makes none and leaves redo intact; a duplicate is refused; it is
  refused while exploded; the stored value is exact; it drops held points owned by the line.
- **Readout and App:** Enter places an oblique line from both sites; Shift+Enter steps the anchor and adds no guide; the
  `no-direction` and `unparseable` errors still fire where they should; Ctrl+Enter does nothing; the hints.
- **List:** the edit fields commit on blur and Enter, resync on a refused edit, and do not commit untouched; the oblique row's text,
  metric and imperial.
- **Plans:** `planLines` projects, skips an edge-on line, and clips to the bounds. A sheet with the option off is byte for byte as
  before, against a document with lines.
- **Perf:** §3.1's guard.
- **Browser** (the dev server in the user's Chrome; `docs/browser-verification-construction-lines-2.md`):
  - an oblique line along a leaning leg;
  - a slide reading 3" from the first point;
  - an oblique crossing;
  - face hits on a plain part, a pocketed part (none at the cell seam) and a bored part (none in the mouth);
  - Move a part onto a face hit;
  - the stepped-anchor gesture end to end;
  - edit a line's Y, then undo;
  - Plans with the option on and off, and a print preview;
  - reload.

  **By eye, owed to the user:** the oblique colour, the `line-face` and `offset` hues, and the chain line on Plans.

---

## 10. Rollout

One round, one merge, built task by task with a review after each. Oblique lines (§2) go first, because §3, §5 and §6 must handle
both kinds of line. Schema 32: the rollback boundary becomes the production commit this round replaces (`fb1e133`, schema 31),
which refuses every project saved at 32, so export first. Deploy and verify per CLAUDE.md's deployment rule.

## 11. Claude's calls, for review

1. All five in one round, one schema bump (32), and oblique lines first.
2. An oblique line is placed with **Enter on a hover, no lock, nothing typed**, which replaces today's unhelpful `unparseable` in that
   state (§2.1).
3. A two-point line that is exactly axis-parallel is stored as an **axis line** (§2.1, §2.3).
4. Oblique sameness is the **exact unordered pair**, not collinearity (§2.2).
5. An oblique slide rounds its **distance from the first picked point**, not world coordinates (§2.4).
6. Crossings involving an oblique line use a **1e-6" tolerance** and are computed, not exact (§2.4).
7. A face hit is **owned by the line**, with the part on `board`, so it can never be a grab (§3.1).
8. The typed-offset gesture is **Shift+Enter to step the anchor**, not a "line here" key (§4.1). It is general, it chains, and it
   leaves no point.
9. A stepped anchor lives and dies with the **base** it was stepped from (§4.2).
10. Editing is **typed coordinates on axis lines only**. There is no drag, no axis change, no oblique editing, and guide points stay
    as fu 130 rules (§5).
11. Plans lines are **opt-in per sheet**, in the **piece's three orthographic views only**, as **chain lines**, never resizing the
    figure (§6).

---

## Amended (plan and build)

Decisions made after this spec was approved. Where one contradicts the text above, this block governs.

- **A1 (§2.4, `lineSpan`'s parameter; plan).** `lineSpan(line, extent)` returns the parameter range as DISTANCE FROM `at` along
  `lineDir`. For an axis line `at[axis]` is 0, so that distance is the world coordinate and the range is `[-extent, extent]`; for an
  oblique line it is the clipped slab range. One convention serves `pickOnLine`'s clamp, the drawing and `lineFaceHits`' `t`.
- **A2 (§5.2, the refused edit; plan).** The spec says a refused move "resyncs on blur". The row uses `DimensionField`'s existing refusal channel
  (its `onCommit` may return a string): `moveGuideLine` returning false makes the row return `That line is already there`, which the
  field shows as its own error, and nothing is stored (as the field's min/max refusals work). The inline `·` separators of §5.1's row
  sketch are gone: the row is `Line along X`, then two labelled fields. The wrapped layout is owed to a browser look (fu 589).
- **A3 (§3.1, the bore test; build, Task 4).** The spec leaves the test to the builder. It uses `holes.ts`' `insideHole`, not the
  plan's `s/R(s)` formula: that formula keeps a hit in a tilted through-bore's exit mouth (the bit is not unit on a tilted row), and a
  test pins it. Stricter, never looser. Cost if wrong: none.
- **A4 (§3.1, exact assignment; build, Task 4).** The exact-assignment mutation (assign the plane constant vs `at + t·u`) cannot
  fail for a STORED axis line, since `at[axis] = 0` makes `a + t·u` exactly `t`, the face constant. The assignment stays as the
  spec's rule, and the test asserts both. Cost if wrong: none.
- **A5 (§9, tests; build, Task 4).** Y-line dado tests were added: the plan's X-line case crossed no cell seam and could not catch
  the probe mutation. Cost if wrong: none.
- **A6 (§3.1, hues; build, Tasks 4–5).** `line-face` is `#341c00`, because the first pick `#683808` failed fu 249's CVD floor against
  `corner`; `offset` is `#f00058`, meeting the same floors. The oblique line colour is `OBLIQUE_COLOR` `#8a7fb0`. All three are the
  builder's values, owed to the user by eye. Cost if wrong: none (the T5 ruling that Task 5 adds `SNAP_COLORS.offset` meeting the floors). Round 1's `line` and `line-cross` hues were never checked against fu 249's floors (8.0–10.7
  against the guide hue); the user kept them by eye on 2026-10-30, so they are left (fu 589).
- **A7 (§4.1, the hint; build, Task 6).** Typed, no axis lock and no hover keeps `Type a distance, Enter to place`: there is no
  direction to step along. Spec §4.1's "(without)" means without a LOCK, with a hover. Cost if wrong: one hint string.
- **A8 (§2.1 and §4, shared schema bump; build, Task 1).** Task 1 reported DONE_WITH_CONCERNS (the oblique line not yet drawn or listed, and extra 32→33 sentinel bumps); ruling: the concerns are later tasks' scope (Tasks 2 and 3). Cost if wrong: none. The schema 31→32 gate tests and several older version sentinels moved
  from 32 to 33 as "newer than current" fixtures; fu 556 now reads "schema 33 now".
- **A9 (§8, SnapMarker; plan).** `SNAP_COLORS` is a `Record<SnapKind, …>`, so the `'offset'` hue landed in Task 5 with the kind
  rather than in Task 6. Cost if wrong: none.
- **A10 (§2.1 and §4.1, the Enter wiring; plan pre-flight).** Task 1 wires the hover into `commit()` and App's Enter as written;
  Task 2 still writes its Enter-on-hover tests (which may pass on arrival) and proves them by mutation: drop the hover argument and
  watch them fail. Cost if wrong: none.
- **Deferred to follow-ups** (not rulings): editing an oblique line, an axis change, guide points, dragging, lines in ISO/assembly/
  section figures, bore-wall hits (fu 583–588); build-time residue (fu 589).
