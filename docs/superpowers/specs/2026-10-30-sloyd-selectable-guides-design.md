# Sloyd — selectable guides (fu 591)

Date: 2026-10-30. Status: draft, for the user's approval.

The user asked for this on 2026-10-30. They skipped the design questions ("skip the questions"), so every open
call below is **Claude's call**, marked **(call)**, for the user to override while reading.

## 1. Intent

Today a guide point or construction line can be removed only by its × in the Guides footer list. To find the right
row, you have to read coordinates and match them to what you see. The user wants to work with guides the way they
already work with parts:

- **click** a guide point or a line in the viewport, or its row in the Guides list, to select it;
- see the selected guide **emphasised** in the viewport, and its row highlighted in the list;
- **delete** it with Delete/Backspace and **hide** it with H, the same keys as parts.

### Goals

- Select guides by click in the viewport (Select tool only) and in the Guides list.
- Delete the selection as ONE undo entry.
- Hide and show guides as view state, undoable like a part hide. A hidden guide is not drawn and is not snapped to.
- Make a thin dashed line a fair click target (inv 21's lesson: a part you can see is a part you can click).

### Non-goals

- No properties panel for a guide. Properties keeps its empty state (§6).
- Guides are not moved by drag. A line's typed coordinates stay in the list. Points stay delete-and-replace (fu 585, fu 130).
- Saved views do not store hidden guides (no schema change; §9 follow-up).
- Mixed selections (parts and guides together) are not supported.
- No guide selection while exploded (§7).

### Anti-goals

- A click meant for a part that selects a line instead, because the line runs across the part. Occlusion decides (§4.2).
- An orbit drag that ends near a line and selects it.
- A Tape or Move click that changes the selection.
- Hiding a guide that silently drops the tape's anchor (inv 43's prohibition, carried over).

## 2. This reverses two standing decisions

1. `GuidesList`'s doc comment: "DELIBERATELY NO SELECTION MODEL — no selectedGuideId, no Delete-key path, nothing
   touching selectedIds". The reason given was that Properties is a panel for boards. This spec keeps Properties
   board-only (§6), which answers that concern. The comment, and its `docs/module-map.md` per-file rule, are rewritten.
2. Round 1 spec §5 (`2026-10-29-sloyd-construction-lines-design.md`): "Picking a line in the viewport … does not exist,
   and must not". The reason given was `THREE.Line`'s raycast threshold, a poor hit target. This spec does NOT raycast
   lines. It picks in SCREEN SPACE, by pixel distance to the projected segment, the same way `pickOnLine` already finds
   a point on a line (§4). `ConstructionLine` keeps `raycast={() => null}`, and its comment is updated to say why: the
   pick happens elsewhere. Round 1 spec §5 gets an *Amended* note pointing here.

## 3. State

### 3.1 Two new fields, beside the part ones (call)

The guide state lives in `selectedGuideIds: string[]` and `hiddenGuideIds: string[]`, NOT inside `selectedIds` and
`hiddenIds`. These are the reasons:

- Ids are opaque, and they are unique only per kind (inv 33's scopes). An imported file can hold a board and a guide
  with the same id.
- `selectionPatch` keeps only `parentPath(id) === openPath`, so inside an open assembly it would drop every guide id.
- `deleteBoards`, `hideSelected`, align, stretch, X-ray `fadedFor`, the Gizmo and Properties all read `selectedIds` as
  parts.
- `restore` filters `hiddenIds` against existing parts. Saved views copy `hiddenIds` into `views[].hidden`, so a guide
  id there would change what gets saved, and `goToView` would show the guide again.

Both fields are view state: never in the document, never autosaved. Order is insertion order, with no duplicates.

### 3.2 Selection: one writer, two kinds, mutually exclusive (call)

`selectionPatch` stays the ONE writer of a user's selection change (inv 42) and now writes both fields. A selection is
**either parts or guides**:

- `selectionPatch(ids, …)`, the existing part path, sets `selectedGuideIds: []` whenever it writes a non-empty part
  selection. An empty part selection leaves the guide selection alone, so the store's internal re-assertions of an
  empty part selection do not wipe a guide selection. The builder must check every existing caller of `selectionPatch`
  with `[]` against this rule and say in the plan which ones are user clears (§3.3).
- A guide selection is written through `selectionPatch` too, by a guide form (for example
  `selectionPatch({ guides: ids })`; the shape is the builder's). Writing a non-empty guide selection sets
  `selectedIds: []`, with everything an existing part-selection change does (the `grabbed` drop, the `stretchGuide`
  drop).
- Selection rules for guide ids: drop ids not in `doc.guides` and ids in `hiddenGuideIds`. A guide has no assembly
  level, so `openPath` does not filter it, and a guide selection does not close an open assembly.

### 3.3 Store actions (names are the builder's)

| Action | Behaviour |
|---|---|
| `selectGuide(id, toggle)` | Without toggle: the selection becomes `[id]`. With toggle: add or remove `id` within the guide selection. Toggling while PARTS are selected starts a new guide selection `[id]` (the kinds never mix). |
| `selectGuides(ids)` / clear | Used by Escape and the miss (§5). |
| `removeGuides(ids)` | Every named guide, as ONE undo entry. `readOnly()` refuses at entry (inv 47). `dropHeldOwnedBy` runs for each id before the edit (inv 24). Unknown ids are ignored. `removeGuide(id)` (the list's ×) may become `removeGuides([id])`. |
| `hideSelectedGuides()`, `hideOtherGuides()`, `setGuideHidden(id, hidden)` | Through ONE gate (§3.4). |
| `showAll()` | Existing. Now shows hidden parts AND hidden guides, as one entry. |

The clear on a miss in the viewport (`clearOnMiss` → `selectBoard(null)`) must clear BOTH kinds, because it is the
user's "select nothing". The builder makes that an explicit clear of both, not a side effect of the empty-parts rule
in §3.2.

### 3.4 Hidden guides: inv 43's gate, widened (call)

`applyHidden` becomes the ONE writer of BOTH hidden sets. A guide hide joins the same undo mechanism as a part hide:

- `HistoryEntry` gains `hiddenGuideIds`. The entry still holds the SAME `doc` object, so no copy is made and autosave
  does not fire.
- Consecutive part and guide hide/show toggles share ONE run and ONE undo entry, with the same run rules as today. A run
  back at its start leaves no entry.
- `restore` (undo/redo) reconciles `hiddenGuideIds` against the guides that exist. `replaceDocument` resets it to `[]`.
- `goToView` does NOT touch `hiddenGuideIds`, because saved views are board-only.
- A guide hide is refused while `gesturing`, as a part hide is.
- **PROHIBITION, carried over: no guide hide or show may clear `tapeAnchor` or `tapeHover`.** A held point holds a world
  position, and the tape goes on measuring from it. Do NOT reach for `dropHeldOwnedBy` here.

Reconciling on delete: `removeGuides`, `clearGuides`, undo and `replaceDocument` drop ids that are gone from both new
fields.

### 3.5 One visible-guides helper

A hidden guide is not drawn, and it is not a snap candidate. That includes a CROSSING involving a hidden line, and
every line-face hit of a hidden line. There is ONE filter, for example `visibleGuides(guides, hiddenGuideIds)` beside
`visibleBoards`. Every reader of `doc.guides` for drawing or snapping reads through it: `GuideMarkers`, `GuideLines`,
TapeTool's `guideCandidates` / `lineFaceCandidates` / `pickOnLine` lines, MoveTool's guide candidates, and the §4 pick.
Inv 43's rule applies: never return its array from a selector. Filter in a memo.

Hidden guides stay in: the Guides list (dimmed, with a shown eye; §6), the document, autosave, export, and the Plans
sheet's Construction lines (as hidden PARTS still draw on Plans; call).

## 4. The viewport pick

### 4.1 Where and when

- **Select tool only.** In Move and Tape, a click on a guide does what it does today: a snap, never a selection.
- **Guides shown and not exploded.** That is the condition `GuideMarkers` and `GuideLines` are mounted under today
  (`showGuides && explode === 0`). With guides off, nothing is picked.
- The click must not have travelled. Use the same rule BoardMesh uses for a part (`watchClickPairs` / its threshold),
  so an orbit drag that ends near a line selects nothing.
- Guide, part and miss are decided in ONE place, for one click. A parallel listener that races R3F's `onClick` /
  `onPointerMissed` is not acceptable. The builder picks the mechanism, for example: a canvas-level pointer handler that
  runs the guide pick first and suppresses the part click and the miss when a guide wins. The plan states it.

### 4.2 Which guide, and guide versus part

Distances are in screen pixels, at the radius the tools already use for snap markers (the builder names the constant).

- **Points**: the distance to the projected point. Guide markers draw with `depthTest: false`, so a point in radius
  wins over a part behind it. That keeps a visible target clickable.
- **Lines**: the distance from the cursor to the projected visible segment (`lineSpan` for an oblique line,
  ±`SCENE_EXTENT` for an axis line), using the closest point between the cursor ray and the line. That is the math
  `pickOnLine` already does for oblique lines. Factor it out into ONE pure helper that both callers use, with no
  `snapToGrid` on the selection path, and give it an axis-line branch. Lines are depth-tested, so a line wins only
  when that closest point is NEARER the camera than the first part the cursor ray hits (a small depth tolerance is the
  builder's). A line hidden behind a part cannot be clicked through it.
- Among guides in radius, the nearest on screen wins, and ties go to the nearer depth (as `pickSnapPoint` does). A point
  and a line through it at the same distance: the point wins (call; it is the smaller target).
- A part is considered only if it is visible, not hidden and kept by the section (`keptBySection`, inv 51), which is
  what a part click already obeys.
- Modifiers: Shift, Ctrl and Cmd toggle (`isToggleModifier`), as for parts.

### 4.3 Hover

In the Select tool, the pointer over a pickable guide shows a pointer cursor. Nothing else changes on hover (call; the
emphasis in §6 is for selection only). If the pick is too costly to run on every pointer move, hover may be dropped,
and the plan says so.

## 5. Keys (App's ONE keydown effect, inv 27)

All of these are in the existing effect, behind the existing `modalOpen` and text-entry guards.

| Key | With a guide selection |
|---|---|
| Delete / Backspace | `removeGuides(selectedGuideIds)`. The existing early return while `grabbed` or `tapeAnchor` is set applies unchanged. |
| H | Hide the selected guides (they leave the selection, as hidden parts do). |
| Shift+H | Hide every OTHER guide, parts untouched (call). |
| Alt+H | `showAll`: parts and guides (§3.3). This applies with or without a selection. |
| Escape | A new LAST rung: after the open-assembly rung, clear a guide selection. |
| Ctrl/Cmd+A | Unchanged: parts only, so it clears the guide selection (§3.2). |

With a part selection, every key behaves exactly as today.

## 6. What it looks like

- **Viewport, selected point**: drawn at SnapMarker's full (non-resting) size, the size a hovered guide grows to today.
  The resting marker beside it is unchanged.
- **Viewport, selected line**: drawn at full opacity and a heavier width than a placed line (stronger than the tape
  preview's 1.6, still dashed). The look is owed to the user by eye.
- **Guides list, row**: the row's text becomes a button that selects (with modifiers that toggle), with `aria-pressed`
  and a selected-row style, following PartsList's row pattern. A click in a line's `DimensionField` or on × never
  selects. Each row gains an eye, PartsList's own icon, that hides or shows that guide (`setGuideHidden`). A hidden row
  is dimmed.
- **Selecting a guide in the viewport opens the Guides footer** if it is closed and scrolls the row into view (call).
  The footer's open state stays its own (`GuidesFooter`). This is one more reason it opens, beside a count going up.
- **Properties**: no guide panel. With a guide selected, the panel shows its existing empty state plus one line, for
  example `1 guide selected — Delete removes it, H hides it.` (words are the builder's; a count when there are several).

## 7. Exploded (inv 47)

Guides are not drawn while exploded, and the Guides list is inside `EditLock`. So:

- `setExplode` above 0 clears the guide selection (call).
- `removeGuides` refuses at entry (`readOnly()`), as `removeGuide` does now.
- Guide hide/show while exploded: the list's eyes are inside `EditLock`, so they are disabled. The keys can only reach a
  guide selection, and exploding cleared that. Alt+H (`showAll`) keeps its current exploded behaviour, now covering both
  sets.

## 8. Tests the plan must carry

Store:
- the selection exclusivity both ways;
- the empty-parts re-assertion keeps a guide selection, and the miss clears both;
- `removeGuides`: one undo entry, `dropHeldOwnedBy` for each id, refused when exploded;
- a hide/show run mixing parts and guides is one entry, and undo shows them again;
- the prohibition (a guide hide keeps `tapeAnchor` and `tapeHover`);
- reconcile on undo, clear and replace;
- `goToView` leaves hidden guides alone.

Pure:
- the pick helper on axis and oblique lines, the depth rule, points beating lines, and the radius;
- the `pickOnLine` refactor keeps its tests byte for byte.

Snapping: a hidden point, a hidden line, a crossing with a hidden line and a hidden line's face hit are not
candidates. Mutate the filter: drop it, and one test must fail per reader.

Panels: GuidesList row select and toggle; field and × clicks do not select; the eye toggles; a hidden row is dimmed.

App: the keys table in §5, including the `grabbed`/`tapeAnchor` early return.

The viewport click wiring has no unit tests, by design. It is verified in the browser (§10).

## 9. Docs this round must change

- `GuidesList.tsx` doc comment and its `docs/module-map.md` per-file rule (reversed, §2). The `GuideLines.tsx` comment
  and its per-file rule ("never a click target", reworded: never a RAYCAST target, picked in screen space). The
  `GuideMarkers.tsx` comment (selected size).
- Invariants, full text in `docs/invariants.md` and condensed in CLAUDE.md:
  - 42: `selectionPatch` writes both kinds, mutually exclusive;
  - 43: `applyHidden` writes both hidden sets; the prohibition covers guide hides; hidden guides are not drawn or
    snapped, through ONE filter;
  - 47: exploding clears the guide selection; `removeGuides` refuses.
  - Whether this is one new invariant (65) or edits to 42/43/47 is the builder's call, stated in the plan.
- Round 1 spec §5: an *Amended* note.
- Follow-ups recorded: hidden guides in saved views (would need a schema bump); a guide properties panel; dragging a
  guide. Close fu 591 when shipped.
- `docs/rounds.md`, `docs/history.md`, the CLAUDE.md Status block, at deploy.

No schema change. Rolling back costs nothing.

## 10. Browser verification (the user's Chrome, dev server)

A `docs/browser-verification-selectable-guides.md`. At least:

1. Click a point, then a line, in clear space; each is selected and its row highlighted.
2. Click a line where it crosses in FRONT of a part: the line is selected. Click where the part hides it: the part is
   selected.
3. An orbit drag ending on a line selects nothing.
4. Delete removes the selection, and Ctrl+Z restores it.
5. H hides; the hidden guide no longer snaps in Tape; Alt+H shows it; Ctrl+Z after H shows it.
6. Exploding clears the guide selection.
7. In Tape and Move, a click on a guide snaps and does not select.

By eye: the selected line's and point's look (§6).
