# UI polish — design

Date: 2026-10-11. Status: approved in conversation (palette, header layout, side panel, dialogs, viewport
colours); this file is its written form. Mockups: `.superpowers/brainstorm/1898185-1791706960/content/`
(`palette.html` option A, `layout.html` option B, `sidepanel-v2.html`) — gitignored, kept locally for reference.
No schema change; rollback is free.

## 1. What and why

Recent rounds each added a control or two, and the chrome no longer fits. Measured on the dev server
2026-10-11:

- **At 1440×900 the header overflows**: "Add board", "Cut list" and "Add joinery…" wrap to two lines; the
  ⚙ button overlaps the Origin checkbox; "Guides" is drawn over "Saved locally"; the page scrolls 2px
  sideways. The Move tool's "Select a part to move" hint is inserted into the same row, so it gets worse
  with that tool active.
- **Properties, assembly selected**: the Mirrored checkbox and its label split (label below); six actions wrap
  into a 3×2 grid with two-line labels; "Copy in a row…" sits alone on a row.
- **Properties, part with a cut**: the panel scrolls; labels such as "Stop short of near end" wrap; the cut's
  Remove button is full width. Guides holds a fixed slot at the bottom even when empty.
- **Dialogs**: the cut list's Diagrams select and Sheet layouts checkbox are unstyled browser defaults;
  Generate's "Generations" legend and radios are misaligned with the rest of the form.

The user's decisions:

- **Regroup and restyle, keep every control.** No behaviour change except one (§4.5, Guides opens itself).
- **Primary screen 1920+**; 1366 must still work cleanly. Below 1366 is not designed for.
- **Palette A: grey toolbar, walnut panels, honey-oak accent, pale maple viewport.**
- **Layout B: the header holds project-level actions; viewport controls float over the viewport.**
- **Side panel**: actions under the name (three visible, the rest under More ▾), Delete as a right-aligned
  trash icon, fields side by side, cuts as cards, Guides as a collapsible footer that opens itself.

Out of scope: any change to what a control does, to wording in dialogs, to the printed cut list, to the
viewport's geometry or shaders, to keyboard shortcuts.

## 2. Palette

Tokens in `styles.css` `:root` are renamed to say what they are, and the file's header comment rewritten for
the new look ("grey and walnut" in place of "graphite and brass"). The tick rule under the toolbar stays as
the signature, its majors in the accent.

| Role | Token | Value |
|---|---|---|
| Toolbar / floating chrome | `--grey-900` `--grey-850` `--grey-800` `--grey-700` | `#22211f` `#2a2927` `#32302e` `#3a3836` |
| Grey rules / text on grey | `--grey-rule` `--grey-ink` | `#4b4946` `#c8c3bb` |
| Panels, dialogs, sheet | `--walnut-950` `--walnut-900` `--walnut-850` `--walnut-800` `--walnut-700` | `#1f1914` `#2b241e` `#322920` `#3a3027` `#4a3d31` |
| Walnut rules | `--rule` `--rule-soft` | `#463b31` `#382f27` |
| Ink | `--ink` `--ink-dim` `--ink-faint` | `#ece4d6` `#b3a898` `#857a6c` |
| Accent (was brass) | `--accent` `--accent-bright` `--accent-dim` `--on-accent` | `#c8955a` `#e3b47c` `#7d5a33` `#23190f` |
| Alert / warn | unchanged names; values re-checked for contrast on walnut | |

- Every `--graphite-*` and `--brass*` reference is replaced mechanically (no `--graphite`/`--brass` survives;
  a grep is the check). Exact values may be nudged during the live pass for contrast; the roles do not change.
- **Contrast floor**: `--ink-dim` on `--walnut-900` and `--grey-ink` on `--grey-850` at ≥ 4.5:1;
  `--accent` text on walnut ≥ 4.5:1 (use `--accent-bright` where it falls short). Measured, recorded in the
  browser-verification doc.
- **Invariant 19 stands**: `--font-num` stays monospace; no CSS font-size on diagram text.
- **Print**: the `@media print` block keeps forcing black on white. Its rules that name `--brass`
  (follow-up comments at styles.css ~1148) follow the rename and must print the same as before.

### 2.1 Viewport colours (constants, not CSS)

| Constant | File | Now | New |
|---|---|---|---|
| `GROUND` | `viewport/Viewport.tsx` | `#e6e3dd` | `#ebe3d4` |
| grid `cellColor` / `sectionColor` | `viewport/Viewport.tsx` | `#c6c1b8` / `#958f84` | `#d3c7b3` / `#9c8f7b` |
| hemisphere `groundColor` | `viewport/Viewport.tsx` | `#b9b2a6` | `#bfb29e` |
| `SELECTED` (emissive) | `viewport/BoardMesh.tsx` | `#c99a4e` | `#c8955a` |
| snap marker colours, `RING_COLOR` | `viewport/SnapMarker.tsx` | — | unchanged; the comment's ground/grid/brass values updated |
| `AXIS_COLOR` | `viewport/OriginAxes.tsx` | — | unchanged |

The snap colours were chosen against the old ground; the new ground is the same lightness, slightly warmer.
They are re-checked in the live pass; one that loses legibility is a decision for the user, not a silent
change. **Follow-up 26a**: the browser here renders with llvmpipe; the user looks once on real hardware after
the deploy. Colour constants only, no shader change.

## 3. Header and viewport overlays (layout B)

### 3.1 Header (`Toolbar.tsx`)

Left to right: brand · project name + ProjectMenu ▾ · divider · **+ Add board** (primary) · Cut list ·
**Claude ▾** · divider · Undo · Redo · *spacer* · ⚙ · save indicator · Export.

- Every label is one line (`white-space: nowrap`); the header never scrolls or wraps at ≥ 1366. Checked by
  `scrollWidth === clientWidth` on the header at 1366 and 1920, with the Generate progress label at its
  longest ("Generating 3/3…").
- **Claude ▾** is a disclosure button opening a popup of three buttons: Generate…, Refine…, Add joinery…, each
  with a one-line description underneath (the current `title` text, shortened). While a batch runs the trigger
  reads `Claude · Generating 2/3…` (today's label moves onto the trigger).
- **Popup pattern**: the same as `ProjectMenu` — deliberately not an ARIA menu: `aria-expanded` on the
  trigger, plain `<button>`s inside, Escape bound on the popup's own subtree, outside-pointerdown on `window`
  only for the popup's open lifetime, closes on focusout and after any item is chosen. **Invariant 27**: no
  new window `keydown` listener. One small shared component (`panels/Popover.tsx`, trigger + popup + those
  closing rules) is used by Claude ▾ and More ▾ (§4.2); ProjectMenu is left as it is (its arm/disarm focus
  rules are its own, CLAUDE.md "ProjectMenu.tsx").

### 3.2 Viewport overlays (`panels/ViewportControls.tsx`, new)

Rendered inside `.viewport-stack` (so `.app-shell`'s `inert` still covers them), absolutely positioned, on
grey chrome at 92% opacity with a small shadow:

- **Top-left — tools**: a segmented control, Select | Move | Tape, buttons with `aria-pressed`, the same
  `title` text and shortcuts as today. The `setTool` calls are unchanged.
- **Top-right — view**: Perspective | Orthographic (two buttons, `aria-pressed`; clicking the one already
  pressed does nothing; the other calls `onToggleProjection`), then Grid | Origin | Guides as toggle buttons
  with `aria-pressed` (replacing checkboxes; same `onToggle*` props, same state).
- **Bottom-left — the Move hint** ("Select a part to move"), shown on exactly today's condition. The tape
  readout stays bottom-right, unmoved and still unconditionally mounted (**invariant 28**).
- The overlays take pointer events only on their own boxes; the canvas still gets everything else. A click on
  an overlay must not select or deselect a part (checked live: click a chip with a part selected).

`Toolbar`'s props for tools and view move to `ViewportControls`; App wires both. Toolbar's tests for those
controls move with them and assert `aria-pressed` instead of `checked`.

## 4. Side panel

### 4.1 Frame

- Width `clamp(380px, 20vw, 420px)` (384px at 1920, 380px at 1366). Measured, not chosen: the assembly's action
  row (Duplicate · Ungroup · Hide others · More ▾) is 302px in the fallback UI font, + 4px gap + ~30px trash,
  + 2×15px padding + the thin scrollbar + 1px border ≈ 375px. (An earlier draft said 300px; it cannot fit.)
- **Parts** list: `max-height: 35vh`, scrolls on its own.
- **Properties**: fills the remaining height and scrolls.
- **Guides**: a footer (§4.5).

### 4.2 Header of Properties

- The name field (or "N parts selected" / "N items selected") with a small **kind chip** to its right: `Part`,
  `Assembly`, nothing for a multi-selection.
- **Action row**, one line, directly under the name: three visible buttons, **More ▾**, and a right-aligned
  **trash icon button** (`aria-label="Delete"`, `title="Delete"`, alert colour, inline SVG, not a glyph). The
  row must fit at the panel's minimum width (380px) with the longest set (an assembly with copies) — checked live.

| Selection | Visible | Under More ▾ (only those that show today under the same conditions) |
|---|---|---|
| One part | Duplicate · Group · Hide others | Copy in a row… |
| One assembly | Duplicate · Ungroup · Hide others | Copy mirrored · Copy in a row… · Select copies · Make Unique · Group |
| Several | Link (when `plan` allows) · Duplicate · Group, else Duplicate · Group · Hide others | the rest of today's row (Unlink, Ungroup, Hide others when not visible) · Copy in a row… |

The conditions that show or hide each action are today's, unchanged; only the container changes. The linked
part's own block ("Select linked" / "Unlink", Properties.tsx ~528) and refusal/link notes stay where they are.

- **Copy in a row…** from More ▾ opens today's inline `CopyInRow` form under the action row. Its `open` state
  is lifted to a prop so the menu item can open it; its form and behaviour are unchanged.

### 4.3 Fields

- Section headings keep the annotation style. Labels move above their controls (small, `--ink-dim`).
- Dimensions (renamed heading **Size**): Length · Width · Thickness in one row of three. Position: X · Y · Z
  in one row of three.
- **Orientation & stock**: Posture · Turn, then Grain runs · Material, as a 2×2 grid. For a multi-selection,
  **Stock**: Grain runs · Material. For an assembly, **Orientation**: Turn · Mirrored (a checkbox with its label
  inline, fixing today's split).
- `DimensionField`/`NameField` are reused unchanged; only their wrapper layout changes (**invariants 5, 9**).
  Field errors (`.field-error`) span the full row under the field that raised them.

### 4.4 Cuts

- The heading shows a count (`Cuts · 1`).
- Each cut is a card: its word (Dado, Rabbet…) and a small ✕ button in the card header, keeping today's
  accessible name exactly (`Remove cut (${word}, offset …)`, Properties.tsx ~181; a test matches it); its fields in a 2-up
  grid; the stop fields labelled "Stop short — near end" / "— far end" on one line.
- **+ Add cut** under the cards.

### 4.5 Guides footer (the one behaviour change)

- A disclosure: `Guides · N` with a caret; closed by default; when open it shows today's `GuidesList`
  unchanged (rows, ✕, Clear all).
- **Opens by itself when the guide count goes up** (a guide was placed). It does not close by itself. The
  open state is component-local view state: not in the document, store, undo or storage.
- Tests: closed by default; opens when a guide is added; stays as the user left it when a guide is removed or
  on any other store change; manual toggle works.

## 5. Dialogs and sheet

Applies to `.cutlist-sheet`, Generate, Add joinery, Refine, Settings, RepairNotice and the storage banner:

- Walnut surfaces (`--walnut-900`, inner surfaces `--walnut-850`), grey is not used inside dialogs. Popups that
  drop from the toolbar (the project menu, Claude ▾) are grey, as in the approved layout mockup; More ▾ in the
  side panel is walnut.
- Form fields: label above the control, the side panel's control style. One rule set styles `select`,
  `input[type=checkbox]`, `input[type=radio]` across the app (`accent-color: var(--accent)` plus size and
  alignment), so no native default survives in the cut list head.
- Generate: Max width · Max depth · Max height as one row of three; the Generations radios inline after their
  legend, aligned with the other labels.
- Buttons: one primary per dialog (accent), the rest secondary; same order as today.
- **No wording, flow or content changes.** The printed cut list must print identically: compare
  `emulateMedia('print')` screenshots of the same document before and after.

## 6. Invariants and rules touched

- **27**: no new window keydown listener; popups copy ProjectMenu's scoped pattern.
- **28**: TapeReadout stays unconditionally mounted, in its corner.
- **19**: `--font-num` monospace; no diagram font-size in CSS.
- **5, 9**: field components unchanged.
- **43**: "Hide others" keeps going through `hideUnselected`; nothing new writes `hiddenIds`.
- `.app-shell` inert covers every new overlay (they live inside it).
- CLAUDE.md's "ProjectMenu.tsx" rule: ProjectMenu is not refactored onto `Popover`.

## 7. Verification

- `npm test` green; `npm run build` green. Test churn is expected where controls move (Toolbar → 
  ViewportControls; Properties actions behind More ▾ — tests open More first). A moved test keeps its
  assertion; only the route to the button changes. New tests: Popover closing rules, the Claude ▾ items,
  ViewportControls `aria-pressed` and callbacks, the action-row split per selection kind, the Guides footer
  (§4.5). Mutate the Guides auto-open test (remove the effect → red) and the More ▾ split test.
- Live pass on the dev server (Playwright, user may watch) at **1920×1080 and 1366×768**: header
  `scrollWidth === clientWidth`; no element overlaps another in the header (bounding-box check); the assembly
  action row fits at 300px; overlay clicks do not change the selection; Escape and outside-click close both
  popups; contrast ratios measured; snap markers legible on the new ground; print emulation matches before.
- Recorded in `docs/browser-verification-ui-polish.md` with screenshots in `docs/img/`.
- Deploy per the deployment rule (bundle hash, CSP header, `localStorage` cleared in the verifying browser),
  then the user glances at the viewport on real hardware (26a).
