# Construction lines — design

A construction line is an axis-parallel line through a point, running to the edge of
the scene. It is placed with the Tape tool, drawn in the viewport, and snapped to:
anywhere along it, and exactly where two lines cross. It answers follow-up 130's open
bullet, *"the line as a **visual** — something to sight along and to snap other things to
at positions nobody typed"* (fu 130, narrowed by fu 145's cardinal guides).

Chosen 2026-10-29 by the user from `docs/feature-gaps.md` (the last open gap, §4). **The
user skipped the design questions, so every decision below is Claude's call unless it
says otherwise.** The calls are listed in §12 for review.

---

## 1. Goals, non-goals, anti-goals

**Goals**

- Place a line along X, Y or Z through any snap point the tape can anchor on: a corner,
  an edge midpoint, a face centre, a cut point, a guide point, or a point on another line.
- Show it in the viewport across the whole scene so you can sight along it.
- Snap to it with the Tape and Move tools: **on the line** (sliding, the coordinate along
  the line rounded to the drag grid) and **where two lines cross** (exact).
- Remove one line or all of them from the Guides list, and undo either.

**Non-goals** (each its own follow-up when this round ships)

- Oblique lines, along a leaning leg or between two arbitrary points. Only the three
  world axes.
- A line through a typed offset in one gesture. That takes two steps today: place a
  guide point at the offset, then anchor on it and place the line.
- Moving or editing a line. Delete it and place it again, as fu 130 already rules for
  guide points.
- Where a line meets a part's face, as a snap point.
- Lines on the Plans sheet, the part diagrams, the cut list or the labels.
- Lines as Move-tool grab sources. You snap a part onto a line; you never snap a line
  onto a part (fu 130's last bullet, unchanged).

**Anti-goals** (this round fails if it does any of these, even if it works)

- A line that hides the parts it runs through, or one that makes the scene unreadable
  once there are ten of them.
- Sliding along a line that leaves a guide or part at 7.3829".
- Anything that changes a line-free project's behaviour, or the placement of guide
  points.

---

## 2. The document — schema 31

### 2.1 Shape: a line is a guide with an `axis`

```ts
export interface GuidePoint {
  id: string;
  at: [number, number, number];
  /** Never present on a point. Typed `undefined` so a GuideLine is NOT assignable to a GuidePoint (§2.3). */
  axis?: undefined;
}

/** A construction line (construction-lines spec §2): parallel to `axis` through `at`. */
export interface GuideLine {
  id: string;
  /** World position, inches; the coordinate ON `axis` is always 0 (canonical, §2.2). */
  at: [number, number, number];
  axis: TapeAxis; // 'x' | 'y' | 'z'
}

export type Guide = GuidePoint | GuideLine;
// SloydDocument.guides: Guide[]
```

Lines live in the same `guides` array as points. That shape reuses the most existing
code without change:

- Refine's two carries in `generate/run.ts` (`guides: doc.guides`) carry lines for free.
- `takeId`'s duplicate-id repair in `validateGuides` covers both kinds in one scope.
- `removeGuide`'s two inv 24 clauses (the held anchor and hover owned by the removed
  guide) already key on `owner.type === 'guide'`, which is what a point on a line is
  owned by (§4.1). Only the intersection's second owner is new (§4.2).
- `clearGuides`, the footer count (`Guides · N`) and the `showGuides` toggle cover lines
  with no new path.

The cost is that some readers assume every guide is a point. There are two:
`guideSnapPoints` (the one funnel into both `moveCandidates` and `TapeTool`) and
`GuideMarkers`. Both filter to points (§2.3).

### 2.2 Canonical storage

A line is an axis plus two fixed coordinates; the coordinate along the axis means
nothing. **It is stored as 0.** `addGuideLine` writes it that way, and the loader
normalises it (a non-zero value is set to 0, never a reason to drop the entry). Two
lines are the same line when their `axis` and all three `at` values are `===`. Being
canonical means sameness is exact equality, with no tolerance and no "ignore one
coordinate" rule.

### 2.3 Readers that must not see a line as a point

`axis?: undefined` on `GuidePoint` makes `Guide[]` **not** assignable to
`GuidePoint[]`, so any reader typed for points stops compiling until it filters. That is
the reason for the field: without it a `GuideLine` is structurally a `GuidePoint` plus a
field, and every point reader would accept lines silently. The filter is
`isGuidePoint(g)` / `isGuideLine(g)`, defined beside the types in `document/types.ts`
(or `snapPoints.ts`; the builder picks one home and exports it from `document.ts`).

### 2.4 The bump, argued for this field

A build at 30 rebuilds each guide field by field, `{ id, at }`. It would load a line as
a guide **point** at `at`, with the along-axis coordinate 0, and its next autosave would
write it that way. The line is lost and a stray point is left near the origin. **So a 31
file must be refused by a 30 build.** Rolling back past this round refuses every project
saved at 31: export first.

`CURRENT_VERSION` 30 → 31. The step adds nothing. `validateGuides` now:

- keeps a point exactly as before (`{ id, at }`; a well-formed point file loads byte for
  byte as before);
- keeps a line when `axis` is `'x' | 'y' | 'z'` and `at` is three finite numbers, then
  zeroes `at[axis]`;
- **drops** an entry whose `axis` is present but not one of the three (a malformed line
  never degrades to a point);
- refuses nothing on content.

Duplicate lines in a file are KEPT (the loader repairs ids, not content). The store
refuses to add one (§3.3). `docs/versioning.md` gains the 30→31 row. CLAUDE.md's fu 556
line ("schema 31 now") becomes "schema 32 now".

---

## 3. Placing a line — the Tape tool

### 3.1 The gesture

Anchor the tape on a point, press **X**, **Y** or **Z** to lock an axis (the cardinal
guides round, unchanged), then press **Enter with nothing typed**. A line is placed
through the anchor along that axis, and the anchor and axis clear, the same as after a
guide point is placed. A typed distance followed by Enter still places a guide point
(unchanged).

Clearing the anchor after placing keeps this the same as placing a point. Keeping the
anchor would open the "repeat the gesture" question that fu 147 holds open by decision.

### 3.2 One decider for both Enter sites

Enter reaches the tape from two places today. Only one of them handles it:

1. **The readout input's `onKeyDown`** (`TapeReadout.tsx`). With empty text this now
   places the line instead of raising `unparseable`.
2. **App's window keydown effect.** It has no Enter branch today, and the input is not
   autofocused, so Enter with nothing typed and the focus elsewhere does nothing. A new
   branch inside App's ONE keydown effect (inv 27), with the modifier test and
   `modalOpen` part of the condition, handles: Tape tool, anchored, axis locked,
   `tapeTyped` empty → place the line.

Both call one function, so the two sites cannot disagree:

```ts
// snapPoints.ts, beside towardFor
export function tapeLineFor(anchor: [number, number, number] | null, axis: TapeAxis | null,
                            typed: string): { at: [number, number, number]; axis: TapeAxis } | null
```

It returns the canonical line when there is an anchor, an axis, and `typed.trim() === ''`;
otherwise null. The readout's `commit()` calls it first. When it returns a line,
`commit()` calls `addGuideLine` and `clearTapeAnchor`. When it returns null, `commit()`
runs the point path unchanged. App's branch calls it and does the same, with no error
path: when it returns null the key falls through as it does today.

### 3.3 `addGuideLine(at, axis)` — the store action

- `readOnly()` refuses at entry (exploded, inv 47), like `removeGuide`.
- Canonicalises `at` (§2.2).
- **A duplicate is a no-op before `edit()`.** It makes no undo entry and leaves redo
  alone, the same rule `removeGuide` follows. The anchor still clears. The readout shows
  a hint, `That line is already there`, through a new `TapeError` cause
  `'duplicate-line'`, cleared like the others when the text or the anchor changes (the
  cardinal spec's §7.1).
- Otherwise one `edit()`, one undo entry; it does not change `selectedIds` (like
  `addGuide`).

### 3.4 The readout

- The hint reads `Along X — Enter for a line, or type a distance` while locked with
  nothing typed, and `Along X — Enter to place` once a number is typed (today's text).
- The axis chip is unchanged.

### 3.5 The preview — a deliberate reversal of the cardinal round

Today, locked with nothing typed draws **nothing** (cardinal spec §4.1: `lineEnd`
becomes `null`; "the honest thing to draw there would be a semi-infinite axis line,
which is follow-up 130's construction line and is explicitly out of scope"). That
round's §9.1 also named a 1" stub as the remedy if the empty state read as broken.

**This round draws the line that Enter would place** in that state: a preview through
the anchor along the axis, in the construction-line style (§5) at preview strength. That
is the thing the cardinal round set aside because it was this round's job. The stub is
not needed. Once a number is typed the preview goes and the existing measuring line and
marker take over, unchanged.

---

## 4. Snapping to lines

Lines add two kinds of candidate, and both go wherever `guideSnapPoints` goes today: the
Tape tool's anchor and hover, and the Move tool's TARGET (never its grab, inv 26). Both
obey the `showGuides` toggle, as guide points do. Both are exempt from the section cut's
`keptBySection` filter, as guide points are (inv 51: "guides exempt").

### 4.1 On the line (sliding)

A new pure helper in `viewport/snapPick.ts`, THREE-free like `pickSnapPoint`:

```ts
export function pickOnLine(lines: GuideLine[], project: Projector, cursor: {x,y},
                           ray: { origin: Vec3; dir: Vec3 }, radiusPx: number,
                           units: Units): SnapPoint | null
```

- A line is clipped to the scene box (`±SCENE_EXTENT` on its axis) and projected through
  `project`. A line whose on-screen segment comes within `radiusPx` of the cursor is a
  candidate.
- The point taken is the point on the 3D line closest to the cursor's ray (the
  closest-approach parameter between the two lines). Its coordinate **along the line's
  axis** is then rounded with `snapToGrid(v, units)` (1/16" or 1 mm), and the other two
  are the line's own, exact. This follows inv 25: "round what a free drag produced,
  nothing else". The rounding is what stops a guide or part landing at 7.3829".
- When more than one line qualifies, the nearest on screen wins, ties to the nearer depth
  (`pickSnapPoint`'s rule).
- When the cursor ray is parallel to the line (looking straight down it) there is no
  unique closest point. The line yields no candidate.
- It returns `{ kind: 'line', at, owner: { type: 'guide', id } }`.

**Priority: a discrete candidate within `PICK_RADIUS_PX` always wins over sliding.**
`pickSnapPoint` runs first over every discrete candidate (board points, guide points,
crossings). `pickOnLine` runs only when that returns null. So a corner the line passes
through is picked as the corner (exact), and a crossing is picked as the crossing.

The camera ray reaches the helper as plain arrays from the tool's pointer handler (the
same place the `Projector` callback is built), so the module stays THREE-free and
unit-tested.

### 4.2 Where two lines cross

Two lines along different axes cross exactly when they share the coordinate on the third
axis. An X line `(·, y₁, z₁)` and a Z line `(x₂, y₂, ·)` cross when `y₁ === y₂`, at
`(x₂, y₁, z₁)`. A Y line pairs with X or Z the same way. Every value comes straight from
stored coordinates, with no arithmetic, so the test is `===` with no epsilon, and the
point is exact (inv 25).

`lineCrossings(guides, extent)` in `snapPoints.ts` returns one candidate per crossing pair
inside the box `±extent` (the callers pass `SCENE_EXTENT`; `document` cannot import
`viewport/extent.ts`, layer order), `{ kind: 'line-cross', at, owner: { type: 'guide', id: a, cross: b } }`,
with `a < b` by array order so each pair appears once. Three lines meeting at one point
yield up to three candidates at the same `at`. That is harmless: `pickSnapPoint` takes the
first, and they all mean the same position. It is O(n²) over lines; projects carry tens.

**The two-owner member.** fu 130 recorded that crossings would need `SnapOwner` to grow a
two-owner member. It grows by an optional field, not a new member:

```ts
export type SnapOwner =
  | { type: 'board'; id: string }
  | { type: 'guide'; id: string; cross?: string };
```

`cross` is present only on a crossing. Every reader that asks "is this point owned by
guide G" must test `id === G || cross === G`. There are two such readers. One is
`removeGuide`'s two inv 24 clauses (anchor and hover), the place a held point is dropped
when the guide under it goes. The other is `sameSnapPoint`, which compares `cross` as
well. The enumeration of which writers clear which held field stays where it lives, at
`tapeHover`'s declaration in `store.ts`. This round adds a sentence there about `cross`
and does not restate the list.

`SnapKind` gains `'line'` and `'line-cross'`. Each gets its marker hue in `SnapMarker`
(the builder's call, from the guide hue family; the user judges it by eye).

### 4.3 The anchor on a line

A tape anchor can be a slid point or a crossing. Locking an axis and typing a distance
from it works unchanged. Placing a line from it works too: anchoring on a point of an X
line, pressing Z and Enter places a Z line through that point, which crosses the first.

---

## 5. Drawing

`viewport/GuideLines.tsx`, mounted beside `GuideMarkers` under the same `showGuides`
condition, draws each line as a dashed segment across the scene box, `±SCENE_EXTENT` on
its axis.

- **Colour by axis**, from `OriginAxes`' `AXIS_COLOR` (X red, Y green, Z blue), so a line
  says which way it runs. Thin, dashed, at reduced opacity. The dash scale is held
  constant on screen the way `OriginAxes` holds its own (fu 27: a `useFrame`). That code
  is reused or shared, not copied.
- **Depth.** Lines are depth-tested, so a part in front of a line hides it, as in SketchUp.
  A line seen through a part would make the part harder to read, which is anti-goal 1.
  The user rules on it by eye in the browser pass. The fallback is a second pass at low
  opacity with no depth test.
- Not clipped by the section plane, the same as guide markers.
- Not moved by explode: a line is a world annotation, like a guide point. Lines show in
  Save image when guides do: whatever that path does for guide markers, it does for lines
  (the builder confirms which and states it in the verification doc).
- Picking a line in the viewport (click to select) does not exist, and must not: a line
  is removed from the list, for the reason `GuidesList`'s comment gives about
  `THREE.Line` raycast thresholds.
- Performance: one `LineSegments` geometry for all lines, rebuilt only when `guides`
  changes (memoised on the array). Tens of lines cost nothing measurable, so no perf
  guard is added.

---

## 6. The Guides list

`GuidesList` shows points and lines in document order. A line's row names the axis and
the two coordinates that fix it, through `formatLength` with the document's units
(inv 52):

```
Line along X · Y 12" · Z 3 1/2"     ×
```

The remove button's `aria-label` is `Remove line along X at Y 12", Z 3 1/2"`. Removing a
line goes through `removeGuide(id)` (§2.1). The footer title stays `Guides · N`, counting
both kinds. The list stays inside `EditLock` (inv 47). The empty-state text becomes
`No guides. Use the Tape tool to place a point or a line.`

The Tape button's tooltip in `ViewportControls` gains a clause: `…; lock X, Y or Z and
press Enter for a construction line`. The Guides toggle's title becomes `Show guide
points and lines`.

---

## 7. Invariants touched

- **Inv 24.** `removeGuide`'s clauses widen to `cross` (§4.2). The single enumeration at
  `tapeHover` gains a sentence. No new held field, and lines never move, so removal is
  the only way a line can leave a held point stale.
- **Inv 25.** Two entries join the list. A crossing is exact. A slid point rounds only its
  along-line coordinate, through `snapToGrid`. A Move to a slid target moves by the exact
  delta to that rounded point.
- **Inv 26.** Unchanged: a line point is a wide `SnapPoint`, a legal target, never a grab.
- **Inv 27.** The new Enter branch sits in App's one keydown effect. The modifier test is
  part of its condition, and it takes `modalOpen`.
- **Inv 33.** Lines share `guides`' `takeId` scope. A line with no id is dropped, as a
  guide with no id is.
- **Inv 47.** `addGuideLine` refuses at entry while exploded, and the list is locked.
- **Inv 51.** Lines and their candidates are exempt from the section, as guides are.

`docs/invariants.md` gets the inv 24 and 25 wording in full, and CLAUDE.md the condensed
form. No new invariant number.

---

## 8. Touch list (every `guides` site today)

| Site | Change |
|---|---|
| `document/types.ts` | `GuidePoint.axis?: undefined`, `GuideLine`, `Guide`, `guides: Guide[]` |
| `document/document.ts` `createDocument`, `validateGuides`, `CURRENT_VERSION` | default unchanged; §2.4 |
| `document/snapPoints.ts` | `SnapOwner.cross`, `SnapKind`, `sameSnapPoint`, `guideSnapPoints` filters to points, `lineCrossings`, `tapeLineFor` |
| `viewport/snapPick.ts` | `pickOnLine` |
| `viewport/moveCandidates.ts`, `MoveTool.tsx` | crossings as targets; slide fallback for the target only |
| `viewport/TapeTool.tsx` | crossings and slide for anchor and hover; §3.5 preview |
| `viewport/GuideMarkers.tsx` | points only (compile forces it, §2.3) |
| `viewport/GuideLines.tsx` (new), `Viewport.tsx` | §5 |
| `viewport/SnapMarker.tsx` | two hues |
| `panels/TapeReadout.tsx` | §3.2, §3.4, `'duplicate-line'` |
| `App.tsx` | the Enter branch (§3.2) |
| `store/store.ts` | `addGuideLine`; `removeGuide`'s `cross`; `tapeHover`'s sentence |
| `panels/GuidesList.tsx`, `ViewportControls.tsx` | §6 |
| `generate/run.ts` (both carries) | none: lines ride `guides`. A test pins it |
| `docs/versioning.md`, `docs/invariants.md`, `docs/module-map.md`, CLAUDE.md | §2.4, §7 |

---

## 9. Testing

- **Loader:** a point file at 30 loads byte for byte as before. A line keeps, and its
  along-axis value is zeroed. A bad `axis` drops the entry. A duplicate id is re-minted
  across kinds. A 31 file is refused by a build that believes it is 30 (the gate test
  every bump has).
- **`tapeLineFor`:** each of the three missing inputs returns null; whitespace counts as
  empty; the result is canonical.
- **`lineCrossings`:** a crossing is found exactly at `===` and missed one ulp off; two
  parallel lines never cross; each pair appears once; a crossing outside the scene box is
  not offered. **Mutate it** (`!==`, dropping the box test, emitting both orders) and see
  a test fail (the working agreement).
- **`pickOnLine`:** a stub `Projector` (orthographic, in the style of `snapPick.test.ts`).
  The along-axis coordinate rounds to the grid, imperial and metric; the fixed
  coordinates are exact; the nearer of two lines wins; a parallel ray gives null; a
  discrete point inside the radius beats the line at the call site (test the composed
  picker, not only the helper).
- **Store:** `addGuideLine` makes one undo entry; a duplicate makes none and leaves redo
  intact (assert the undo stack, never a flag, inv 34); it is refused while exploded;
  removing line A drops an anchor that is a crossing of A and B, and removing C leaves it
  alone; Refine's carry keeps lines (both `run.ts` sites).
- **Readout and App:** Enter with nothing typed under a lock places a line from both
  sites; Enter without a lock still raises `unparseable`; a typed number still places a
  point; Ctrl+Enter and a modal-open Enter do nothing.
- **List:** a line's row text and label, metric and imperial.
- **Viewport:** no unit tests (by design). Browser verification against the dev server in
  the user's Chrome, recorded in `docs/browser-verification-construction-lines.md`:
  place lines on all three axes; check the preview; slide the tape along a line and read
  the grid-rounded coordinate; snap to a crossing; move a part's corner onto a line and
  onto a crossing; toggle Guides; check under the section cut and while exploded; undo
  and redo; check the list; reload, which tests autosave. **By eye, owed to the user:**
  line colour and opacity, depth behaviour (§5), the two marker hues.

---

## 10. Rollout

One chunk, one merge. Schema 31: the rollback boundary becomes this round's parent
(production `4f73858`), which refuses every project saved at 31, so export first. Deploy
and verify per CLAUDE.md's deployment rule (bundle hash, CSP, cleared production storage).

## 11. Left to the builder

The home of `isGuidePoint`/`isGuideLine`; the marker hues; sharing `OriginAxes`'
dash-scale code; the exact closest-approach formula and its parallel threshold (stated
and tested); where in each tool's pointer handler the ray is built.

## 12. Claude's calls, for review

1. Lines share the `guides` array, with `axis` as the discriminator (§2.1), rather than a
   new top-level field.
2. Schema bump to 31 (§2.4). Rollback past it refuses projects saved since.
3. **Reversing the cardinal round's "locked, nothing typed draws nothing"**: it now
   previews the line (§3.5).
4. Enter with nothing typed under a lock is the gesture (§3.1). There is no new key.
5. The anchor clears after placing, as for points (fu 147 stays as decided).
6. A duplicate line is refused with a hint, not stored twice (§3.3).
7. Crossings are in this round, through an optional `cross` on the guide owner (§4.2).
   Line-meets-face is not.
8. A slid point rounds its along-line coordinate to the drag grid (§4.1).
9. Lines are hidden behind parts (depth-tested), pending your eye (§5).
10. Lines are colour-coded by axis (§5).

---

## Amended (plan and build)

Decisions made after this spec was approved. Where one contradicts the text above, this block governs.

- **A1 (§3.3, duplicate line; plan).** The spec says a duplicate clears the anchor and shows a
  `'duplicate-line'` error. But `TapeReadout` renders nothing once the anchor clears, so that
  hint could never be seen, and App's Enter path has no error channel at all. Instead: a
  duplicate is a no-op that **keeps** the anchor and axis. The hint is DERIVED, not an error
  state: while locked with nothing typed, the readout computes `tapeLineFor(...)`. If an
  equal line already exists it reads `Along X — that line is already there; type a
  distance`. There is no `'duplicate-line'` `TapeError`. Both Enter sites behave the same.
- **A2 (§5, explode; plan).** `GuideMarkers` is mounted only when `showGuides && explode === 0`.
  Lines use the same condition, so they are hidden while exploded rather than drawn
  unmoved. Save image draws guide markers (they are not gated on `clean`), so it draws lines
  too.
- **B1 (§4.1, past the drawn end; build).** A cursor past a line's drawn end (`±SCENE_EXTENT`)
  offers no slide point: `pickOnLine` returns null rather than clamping the point onto the
  end.
- **B2 (§6, the Guides list; build).** The list prints coordinates through `formatLength`
  (`3-1/2"`), not the hand-typed `3 1/2"` the spec shows.
- **B3 (§5, drawing; build).** Each construction line is its own drei `Line`, not one batched
  `LineSegments`. An X or Z line at exactly `y = 0` is lifted by `OriginAxes`' `GROUND_LIFT`,
  for display only, so it wins the depth test against the grid.
- **B4 (§5, hues; build).** `SNAP_COLORS` picks `line` `#4a86b8` and `line-cross` `#3a4a8c`;
  a placed line's opacity is 0.55 and the preview's 0.9. These are the builder's values, owed
  to the user by eye.
