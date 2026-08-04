# Cardinal-direction guide points — design

Anchor the tape on a snap point, press **X**, **Y** or **Z** to lock a world
axis, type a distance, press Enter. A guide lands that far along that axis from
the anchor, with no second feature required to define the direction.

Chosen 2026-08-04 by the user immediately after confirming both tape rounds work
in real use. Recorded as follow-up **145**, which **narrows** follow-up 130's
semi-infinite construction lines item rather than closing it: what was promoted
is the cardinal-direction case specifically, not arbitrary 3D placement.

---

## 1. The problem, stated as a constraint rather than a wish

A guide can currently land in exactly two places, and **both require a second
snap point to already exist**:

- Clicking while anchored places one **on** the hovered snap point — close to
  redundant, and the user's own verdict on the round-1 shape was *"I can
  effectively only duplicate existing grab-points, which adds nothing."*
- Typing a length places one along the **anchor→hover ray**
  (`offsetPoint(anchor, toward, distance)`).

The ray is what makes the typed path valuable, and it is also the whole
constraint: **the direction is always borrowed from a second existing feature.**
So the tool can only measure *between things that already exist*. There is no way
to put a guide 3" straight up from a corner, or 6" out along Z from a face
centre, unless some other snap point happens to lie in that direction — and in a
project of rectangular parts, the direction you want is usually one that no
feature points along yet.

Cardinal placement removes exactly that, and nothing more.

---

## 2. World axes, and the "central question" collapses

The roadmap paragraph in CLAUDE.md called world-versus-board-local *"the central
one"*, on the reasoning that a board carries `rotation` and `posture`, so for a
turned board *"3 inches along the board"* and *"3 inches along X"* are different
points.

**They are not different points.** `axisDimensions` (`src/document/geometry.ts`)
maps a board's length/width/thickness onto the world axes, and by construction it
is always a **permutation** of `[X, Y, Z]`: `posture` names which dimension is up
and `rotation` is only 0 or 90 about Y, so each of the three board dimensions
lands on exactly one world axis and no two share one. There is no oblique case
to reach, because the document cannot express one.

So board-local axes reach **the same six directions** world axes do. Board-local
would buy a *label* — "3 inches along the length" — never a *capability*. That
turns the question from a design fork into a naming affordance a later round can
add without a schema change, without a new reachable position, and without
touching this round's arithmetic.

Two consequences worth stating, because both were argued as costs of the
board-local branch and both simply stop existing:

- **The guide-anchor asymmetry is gone.** An anchor on a guide is owned by no
  board (`SnapOwner`'s `guide` member), so board-local axes would be unreachable
  from it and the tool would have needed a fallback rule for that case. World
  axes are available from every anchor, so there is no case to write.
- **Nothing needs to read `axisDimensions` at all.** This round adds no
  dependency on board orientation, which is what keeps §4's helper a pure
  function of three coordinates and an enum.

### 2.1 Six directions out of three axes, with no new arithmetic

`offsetPoint`'s doc comment already documents `distance < 0` as one of the three
supported values of one free parameter, and `canBeginLength`'s set is
`{0-9, ., -}` — the `-` is there because `parseLength`'s sign strip accepts a
leading one (`length.ts:25`). Verified: `parseLength('-3')` returns `-3`, and
`parseLength('-1-1/2')` returns `-1.5` (sign strip, then `MIXED_RE`).

So **three axes plus a signed distance covers all six directions**, and
`offsetPoint` does not change. Typing `3` while locked to X goes +X; typing `-3`
goes −X. This is the strongest available answer to the roadmap's *"extend rather
than duplicate"* instruction: the round adds a direction *source*, not a second
placement path.

---

## 3. `tapeAxis` — a new store field that is deliberately NOT invariant 24's fourth instance

`tapeAxis: TapeAxis | null` where `TapeAxis = 'x' | 'y' | 'z'`. It joins `tool`,
`tapeAnchor`, `tapeHover` and `tapeTyped` as view state: outside the document,
outside the undo stack, never saved.

It sits beside three fields that hold **captured world positions** and therefore
carry invariant 24's clearing rules, and it must not inherit them. It follows
**`tapeTyped`'s** reasoning instead: `'x'` means the same thing after an undo, a
resize, a deleted cut or a wholesale `replaceDocument`. There is no world under
it to move. Giving it clearing rules by analogy would be the exact mistake
`tapeTyped`'s declaration in `store.ts` already warns about — and here it would
be worse than cosmetic, because it would silently unlock an axis mid-measurement
on every unrelated edit.

### 3.1 Its one rule is structural: the axis lives exactly as long as the anchor

An axis with no anchor names no ray — there is no origin for the offset to run
from, and the readout that displays the lock does not render without an anchor
(`TapeReadout.tsx:98`). So:

- **Everywhere `tapeAnchor` becomes null, `tapeAxis` becomes null.** Deliberately
  stated as a rule over that set rather than as a list of writers: `store.ts`
  nulls the anchor from nine places today (`setTool`, `clearTapeAnchor`,
  `clearGuides`, `undo`, `redo`, `replaceDocument`, `deleteBoard`, `removeGuide`
  and `dropHeldIfGone`), some conditionally, and a list copied into a design
  document is a count that goes stale — which CLAUDE.md records having happened
  once already. The implementation should satisfy the rule at each site, and the
  store tests should pin the rule, not the number.
- **`setTapeAnchor` PRESERVES it.** This is the half that is easy to get
  backwards, and it is what makes re-anchoring under a lock work (§5.2): walking
  along a row of corners placing a guide 3" up from each must not require
  re-pressing `Y` at every stop.

Stated as one rule rather than enumerated per writer, because the enumeration
already exists once — at `tapeHover`'s declaration, which CLAUDE.md names as the
single source of truth for which writers are survival-tested, which are
owner-conditional and which are blanket. `tapeAxis` is none of those three: it is
a plain dependent of the anchor's existence. Point at this section from the field
declaration; do not restate a writer list anywhere else.

`setTapeAxis(axis)` is a **toggle**: setting the axis already locked clears it.
It is a no-op with no anchor, so the keyboard branches in §6 need no guard of
their own beyond arming.

`tapeTyped` is deliberately **not** cleared when the axis changes. A half-typed
`3 1/2` is a distance along whatever ray is current, and re-aiming should not
destroy the number the user is in the middle of entering — the same reason the
capture appends rather than replaces.

---

## 4. One direction source, called from both call sites

```ts
export function towardFor(
  anchor: [number, number, number],
  axis: TapeAxis | null,
  hover: [number, number, number] | null,
): [number, number, number] | null
```

Lives in `src/document/snapPoints.ts`, beside `offsetPoint`. Locked → `anchor`
plus the axis unit vector; unlocked → `hover`; neither → `null`. Pure, imports
nothing new, and — like everything else in that module — carries no printed
string, so the `document → units` boundary stays untouched.

**Both `TapeTool`'s preview memo and `TapeReadout`'s `commit()` call it and then
hand the result to the existing `offsetPoint`.** That is the point of the shape.
The round-2 design's guarantee was that *"the marker and the placement agree by
construction rather than by two pieces of code being written to match"*, and it
rested on both paths sharing `offsetPoint`. Axis mode changes what `toward` is,
so if each side computed its own `toward` the guarantee would be half true — the
arithmetic shared, the direction not. One function, two call sites, guarantee
intact.

Two properties fall out rather than being written:

- **The zero-length null is unreachable in axis mode.** The synthesized `toward`
  is exactly 1" from the anchor, so `offsetPoint`'s `length === 0` guard cannot
  fire. It stays where it is — it is still live on the ray path, which is what it
  was written for (a cursor returning to the point it started on).
- **A locked placement is exact, never rounded.** Invariant 25 gains its fourth
  operation, by inheritance rather than by a new decision: the position is
  `anchor + unit × distance`, with no `SNAP_INCHES` step anywhere in the path. A
  guide exists to be snapped *to*, so rounding it would move it off the number
  the user typed while the display rounds to the same string either way
  (invariant 5).

### 4.1 What changes in `TapeTool`

- The `preview` memo (`TapeTool.tsx:275`) loses its `!hovered` gate — that gate
  is precisely what makes axis mode draw nothing today. It gains `axis` in its
  dependency list. The memo stays **derived every render and never stored**,
  which is unchanged and is the reason a fourth held world position never
  appears.
- `lineEnd` (`TapeTool.tsx:291`) becomes `preview ?? (axis ? null : hovered?.at)
  ?? null`. Locked with nothing typed yet draws **no line**, and that is a
  decision rather than an omission: the honest thing to draw there would be a
  semi-infinite axis line, which is follow-up 130's construction line and is
  explicitly out of scope (§8). The readout's axis chip is the confirmation that
  the lock landed.
- The hover is still picked, still published to the store and still drawn while
  locked — it just contributes no direction. Not clearing it is what makes
  unlocking restore the ray path instantly rather than requiring a fresh pick.

---

## 5. Behaviour under a lock

### 5.1 Hover is inert, and this is the trap it closes

While `tapeAxis` is set, **`tapeHover` contributes nothing** to the preview, to
the measuring line's direction, or to Enter. The alternative — hover wins when
present, axis as fallback — was rejected for a concrete reason rather than on
taste: `TapeTool` **latches** the hover while anchored (invariant 24's third
instance exists because of that latch), so a hover captured before the lock can
sit unreplaced across an arbitrary number of events and would silently supply a
direction the user cannot see and did not choose. A lock that can be overridden
by a stale value is not a lock.

The marker for the hovered point is still drawn. It says *"this is what you would
snap to if you unlocked"*, which is true, and suppressing it would make the tool
look broken while locked.

### 5.2 A click re-anchors and keeps the lock

- **On a snap point:** `setTapeAnchor(hit)`, axis preserved. No guide is placed.
  The typed distance is the only way to place while locked, which is what the
  lock is for — and it means walking a row of corners placing a guide 3" up from
  each is click, type, Enter, click, type, Enter.
- **On empty space:** `clearTapeAnchor()`, which drops the axis with it (§3.1) —
  the same cancel the tool has today.

Placing a guide at the clicked point while locked was rejected: a click and Enter
would then place guides in two different positions while one direction is drawn
on screen, which is the disagreement the lock exists to prevent.

---

## 6. Keyboard — two branches, both in existing handlers

**`App`'s existing keydown effect** takes X/Y/Z, below the `cutListOpen` guard
and the `isTextEntry` guard, beside the `M` and `T` blocks it matches in shape.
No new `window` listener: CLAUDE.md's standing rule is that a window listener
never sees which subtree an event came from, so every one needs the cut-list flag
explicitly, and inheriting is how that is satisfied. Modifier chords are left
alone, as `M` and `T` leave them.

The branch acts only when `tool === 'tape' && tapeAnchor`, and otherwise **falls
through** rather than returning — a key that was not handled has not been
handled, which is the rule the type-anywhere capture states for its own early
return. No conflict exists today: the app binds `m`, `t`, `f`, `Home`, `Escape`,
`Delete`/`Backspace` and the undo chords, and nothing else.

**`TapeReadout`'s own `onKeyDown` takes them too**, and this is not redundancy —
it is forced. Once the first digit lands, the input has focus, so `isTextEntry`
at the top of `App`'s effect early-returns and **X/Y/Z cannot reach `App` at
all**. Escape already has a branch there for exactly this reason
(`TapeReadout.tsx:172`); the axis keys follow its precedent. Without it the axis
could never be changed once typing started, which is the most likely correction a
user makes.

### 6.1 Escape's ladder gains a rung

`App`'s ladder is currently `grabbed` → `tapeAnchor` → leave tool, and its shape
is *back out one level at a time*. An axis is a level, so it becomes:

```
grabbed → tapeAxis → tapeAnchor → leave tool
```

`TapeReadout`'s Escape keeps its own shape — same ladder, its own steps: clear
the axis if there is one and stay in the box, otherwise clear the anchor and
blur, so a second Escape reaches the window listener and leaves the tool.

---

## 7. Follow-up 144, folded in — `error` carries its cause

`TapeReadout`'s `error` is a boolean today, so the box can go red without saying
why. Follow-up 144 filed that as a knowingly-made trade and named the remedy;
this round is what makes it stop being cosmetic, because **axis mode turns "no
target" from a refusal into a legitimate state by construction**.

```ts
type TapeError = 'no-direction' | 'unparseable' | 'degenerate' | null;
```

- `no-direction` — `commit()` with no `toward` at all. Reachable on the ray path
  only; in axis mode `towardFor` always returns a direction.
- `unparseable` — `parseLength` returned null.
- `degenerate` — `offsetPoint` returned null (a zero-length direction, i.e. the
  hover is on the anchor). Reachable on the ray path only, for §4's reason.

A short reason renders beside the box, in the app's existing hint idiom
(`--ink-dim`, as `.tape-readout-hint` already is) rather than as a new visual
weight.

### 7.1 Each cause is cleared by the thing that actually cures it

The current single effect is keyed `[text, hovered]`, which means **any new hover
cures every error** — including an unparseable number, which a hover has nothing
to say about. That is tolerable today and wrong under a lock, where a hover cures
nothing at all. So the clear splits by what re-answers the failed question:

- **`unparseable`** is cleared by a change to `text`. A new character is a new
  answer to *"can this be read as a length"*.
- **`no-direction`** and **`degenerate`** are cleared by a change to `hovered`
  **or** to `axis`. Both are new answers to *"is there a direction"* — and adding
  `axis` is the whole point: pressing `X` after a no-target refusal genuinely
  cures it, and under the old boolean the red would have survived until Enter
  proved otherwise.

Note what this preserves: `commit()` still sets the error **without touching
`tapeTyped`**, and it remains the only caller that sets one, so no single event
both raises an error and clears it. The red still survives until the next thing
that could plausibly fix it, which is the property the round-2 effect was written
around.

Note also what it removes: in axis mode a hover change now clears **nothing**,
because neither cause a hover cures is reachable there. That is the boolean's
defect, fixed rather than guarded around with a mode conditional — a
mode-conditional boolean would be follow-up 144 with extra steps.

---

## 8. Non-goals

Recorded as decisions, not omissions.

- **No schema change.** `CURRENT_VERSION` stays 6, `validateGuides` is untouched,
  no migration step. A guide placed along an axis is *the same document data* as
  one placed along a ray: `GuidePoint` is `{ id, at }` with `at` a bare world
  position. Nothing about how a guide was created is stored, and nothing should
  be.
- **No axis lines.** This round places a *point* along an axis. Follow-up 130's
  semi-infinite construction lines remain open; 145 narrows their motivation
  (reach along an axis from one feature) without providing a line at all.
- **No arbitrary free placement.** A guide at a typed x,y,z with no anchor is
  still not asked for and still not a goal.
- **No board-local axes.** §2 shows they add no reachable position. If the
  *labelling* is wanted later it is a display change over the same mechanism, and
  it will have to answer the guide-anchor case §2 shows this round does not have.
- **No cursor-direction axis inference.** SketchUp infers axis locking from the
  direction of an initial drag; doing that here needs a cursor world position
  with no snap point under it, which the tool has no way to obtain today — it
  would mean a ground-plane or screen-plane projection, a new mechanism rather
  than a new use of one.
- **No second capture path and no second preview.** The type-anywhere capture in
  `App`'s keydown effect and the derived preview in `TapeTool` are extended, not
  duplicated. Two of either would be two places for the same rule to disagree.

---

## 9. Testing

**Unit (`document/snapPoints.test.ts`).** `towardFor`'s three unit vectors, its
`hover` passthrough, and its null when neither is available. That a locked
`offsetPoint` is exact and unrounded for an off-grid distance — invariant 25's
fourth operation, pinned rather than argued. That a negative distance lands on
the opposite side of the anchor, for each axis.

**Store.** The §3.1 lifecycle, both halves, because only one of them is caught by
the obvious tests: every anchor-clearing writer drops the axis, and
**`setTapeAnchor` keeps it**. A test that only checks the drops passes under a
rule that clears the axis unconditionally, which would break re-anchoring
silently. Plus the toggle, and that `setTapeAxis` with no anchor is a no-op.

**RTL (`TapeReadout`).** Each of the three error causes, and each of its cures —
including the two the boolean could not express: that a hover does **not** clear
`unparseable`, and that pressing an axis key **does** clear `no-direction`.

**Browser (`docs/browser-verification-cardinal-guides.md`).** Required, per the
repo's rule that the r3f viewport is verified by driving a real browser. Against
the dev server, never production — `sloyd.autosave.v1` in the user's browser *is*
their project.

- Preview position along each of X, Y and Z read out of `localStorage` after
  placement rather than judged by eye, at **two board postures**, because a flat
  unrotated board at the origin cannot distinguish a correct mapping from several
  wrong ones (the trap the cut-points round recorded for local→world).
- A negative distance placing on the opposite side.
- The re-anchor-under-lock gesture: click, type, Enter, click, type, Enter, with
  the axis pressed once.
- The **two-keystroke** check, which is the only one able to distinguish a landed
  focus from a failed one: press `X`, type `3`, then `5`, and confirm the box
  reads `35` — a failed focus would drop the second character.
- X/Y/Z reaching the axis from **inside** the focused input (the §6 branch), which
  no jsdom test can prove, since it is about which handler the event reaches.
- Escape's four-rung ladder.

### 9.1 What a test cannot settle here

The axis chip's legibility and placement in the readout is browser-settled in the
sense of follow-up 60, not test-settled. So is the answer to whether "locked with
nothing typed draws no line" reads as *waiting* or as *broken* — §4.1 chose it on
scope grounds, and if the browser pass says it reads as broken, the finding gets
recorded with what it costs rather than fixed by importing §8's construction
line.
