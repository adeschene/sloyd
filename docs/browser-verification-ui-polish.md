# Browser verification — UI polish

Date: 2026-10-11. Dev server (Vite, port 5180), Playwright, software GL (fu 26a: layout and DOM, not shading).
Viewports: **1920×1080** and **1366×768**. Spec: `docs/superpowers/specs/2026-10-11-sloyd-ui-polish-design.md` §7.
Plan: `docs/superpowers/plans/2026-10-11-sloyd-ui-polish.md`. Branch `ui-polish`, tip `6477c4b` when checked.

Each task ran its own live check as it landed (Tasks 1–8, summarised below with their screenshots). Task 9 then ran
the whole-app pass fresh at both sizes. Every session started and ended with `localStorage.clear()`, read back as
`localStorage.length === 0`. Console: 0 errors; the only warnings are the known Three.js deprecations
(THREE.Clock, PCFSoftShadowMap).

## 1. Header (Task 4 Step 7, re-run in Task 9)

The plan's header readout (`.toolbar` scrollWidth vs clientWidth, page scrollWidth vs `innerWidth`, every header
button under 34px high, no two header boxes overlapping):

| Viewport | fits | docFits | oneLine | overlap |
|---|---|---|---|---|
| 1920×1080 | true | true | true | false |
| 1366×768 | true | true | true | false |

Screenshots (Task 4, with Claude ▾ open): `docs/img/ui-polish-header-1920.png`, `docs/img/ui-polish-header-1366.png`.

**Focus return, with real clicks** (Playwright mouse clicks at the button's centre, not DOM `.click()`), at 1366×768:
- Focus parked on `<body>`; a real click on ⚙ (`aria-label="Settings"`) opened Settings; a real click on its
  Cancel closed it. `document.activeElement` was the ⚙ button (`BUTTON`, label "Settings"). This closes the Task 4
  note that a DOM click left focus on `<body>` — a real click focuses the button, as a user's would on Chromium.
- Claude ▾ → Generate… → Cancel (all real clicks): `document.activeElement` was the `Claude ▾` trigger.

**Popups close** (real clicks and key presses, 1920×1080): Claude ▾ open → Escape closes it and focus is on its
trigger; open again → a click outside closes it. More ▾ in the side panel likewise: Escape closes it **and leaves
the selection alone** (the Escape is stopped on the popover's subtree, inv 27), an outside click closes it.

## 2. Viewport overlays (Task 3)

Tools top-left, Perspective/Orthographic and Grid/Origin/Guides top-right, the Move hint bottom-left, the tape
readout bottom-right (inv 28, unconditionally mounted). Clicking Grid, Orthographic and Perspective with a part
selected kept the part's row `aria-pressed="true"` — an overlay click does not reach the canvas. Tape tool + Grid
click: no tape readout appeared. Screenshot: `docs/img/ui-polish-overlays.png`.

## 3. Side panel (Task 6 Step 8, re-run in Task 9)

One part with one cut selected (Add board, + Add cut):

| Viewport | `.field label`s | tallest label | `.panel-props` scrollHeight / clientHeight |
|---|---|---|---|
| 1920×1080 | 18 | 13px (none ≥ 18) | 922 / 922 — the whole panel and the cut card show without scrolling |
| 1366×768 | 18 | 13px (none ≥ 18) | 725 / 610 — scrolls, as expected at this height |

- **Width error spans the row** (1366): typed `abc` in Width, Enter. `.field-error` "Enter a measurement, e.g. 3/4
  or 1-1/2" is 338.98px wide; its grid is 339px. Escape restored the stored `5-1/2"`.
- **Assembly** (two boards, Ctrl+A, Group): the Mirrored checkbox and its text share one line at both sizes (label
  20px high, box 14px inside it).
- The refused-posture back-fill was not checked: no fixture gives one (as in Task 6).

Screenshots: `docs/img/ui-polish-part-1920.png`, `docs/img/ui-polish-assembly-1366.png` (Task 6).

## 4. Action row (Task 5; screenshot retaken in Task 9)

Worst case at 1366×768 (Assembly 1 duplicated, the copy selected): visible `Duplicate · Ungroup · Hide others`,
More ▾, trash. `.action-bar` 26.8px high (one line), 349px wide; the sidebar sits at its 380px floor. More ▾ holds
`Copy mirrored · Copy in a row… · Select copies · Make Unique · Group` and its popup stays inside the sidebar
(Task 5: [1095–1303]×[405–563] within [986–1366]×[0–768]; the trash's right edge 1351 = the panel's content edge).
Screenshot `docs/img/ui-polish-actions.png`, retaken after a reload on a cleared `localStorage`, so the storage
banner Task 5's capture showed (it had cleared storage mid-session) is gone.

## 5. Guides footer (Task 7)

1366×768 with 12 boards: Parts capped at 269px (35vh) and scrolls; Properties 416px visible; the closed footer 30px.
A guide placed with the Tape tool (two clicks) opened the footer by itself ("GUIDES · 1 ▾"). Screenshot
`docs/img/ui-polish-guides.png` (1920×1080).

## 6. Dialogs and the cut list sheet (Task 8, plus Task 9 at 1366)

Every select in every dialog carries `.input`; checkboxes and radios take the oak accent (`accent-color`
rgb(200, 149, 90)). Generate's Max width/depth/height sit in one row of three; Refine's likewise; Settings is three
stacked label-over-control fields; Copy in a row's Gap/Pitch/Fit radios sit inline with spacing.
Screenshots: `docs/img/ui-polish-dialog-{cutlist,generate,refine,joinery,settings,project-menu,copy-row}.png`.

**Generate at 1366×768** (Task 9; Task 8 checked 1920 only): the "Generations" legend (top 180.5, bottom 193.5)
and its three radio labels (top 180, bottom 194, left 515 / 556 / 597, after the legend's right edge at 495) are one
line; the fieldset is 14px high. Screenshot `docs/img/ui-polish-dialog-generate-1366.png`.

## 7. Print

Task 8 compared `emulateMedia('print')` full-page screenshots of the same three-board document with a dado, Sheet
layouts on and Diagrams "All parts": `docs/img/ui-polish-print-before.png` (taken before Task 1's first edit) and
`docs/img/ui-polish-print-after.png`. Both 1905×1322; `ImageChops.difference(...).getbbox()` is `None` —
**pixel-identical**.

## 8. Contrast

Final token values from `src/styles.css` `:root`, WCAG 2.x ratios computed with `src/palette.test.ts`'s formula
(that test asserts each ≥ 4.5:1 and passes):

| Text | on | Ratio |
|---|---|---|
| `--walnut-ink` `#ece4d6` | `--walnut-900` `#2b241e` | 12.11 |
| `--walnut-ink-dim` `#b9ad9c` | `--walnut-900` | 6.93 |
| `--walnut-ink-dim` | `--walnut-800` `#3a3027` | 5.83 |
| `--walnut-ink-faint` `#a09482` | `--walnut-900` | 5.13 |
| `--grey-ink` `#ece9e4` | `--grey-850` `#2a2927` | 12.00 |
| `--grey-ink-dim` `#c8c3bb` | `--grey-850` | 8.29 |
| `--grey-ink-dim` | `--grey-700` `#3a3836` | 6.66 |
| `--accent` `#c8955a` | `--walnut-900` | 5.75 |
| `--accent-bright` `#e3b47c` | `--grey-900` `#22211f` | 8.49 |
| `--on-accent` `#23190f` | `--accent` | 6.49 |
| `--alert` `#e8806a` | `--walnut-900` | 5.62 |
| `--alert` | `--walnut-800` | 4.73 |

**Values that differ from spec §2's table** (§2 allows nudges; the roles did not change): the spec's single ink
scale became one per material. Walnut ink-dim `#b3a898` → `#b9ad9c` and ink-faint `#857a6c` → `#a09482` (the spec's
faint measures 3.64:1 on walnut-900, below the floor); grey gained its own scale, `--grey-ink` `#ece9e4`, with the
spec's `#c8c3bb` as `--grey-ink-dim`. These came with the plan's `:root` (Task 1); no value was nudged during a live
pass. The lowest pair is `--alert` on `--walnut-800` at 4.73.

## 9. Snap markers on the maple ground

Fixture: two 24 × 5-1/2 × 3/4in flat boards, one moved to Z 14. Move tool, the board at the origin selected, one of
its corners grabbed; then the second board's points hovered. Screenshot `docs/img/ui-polish-snaps.png` (three crops
at 3×, 1920×1080): corner (green `#2e9e5b`), edge midpoint (cyan `#22b8d4`, the short top edge), face centre
(violet `#8a5fd0`, the top face). Each marker drew where hovered (DOM-free check: a screenshot diff against the
un-hovered frame, bounding box 14×14px at the point, centre pixel exactly the marker colour).

Fill against the new ground `#ebe3d4` (against the old `#e6e3dd` in brackets): corner 2.67 (2.66), edge-mid 1.86
(1.85), face 3.56 (3.54), guide `#4f6fd0` 3.65 (3.63). The ring `#f5f2ec` is 1.14 on the ground (1.15 before): it was
made for walnut and all but vanishes on maple, as it did on the old ground.

**Judgement: all three are legible; the cyan edge midpoint is the weakest.** On the ground it reads by hue, not by
lightness (1.86:1), and at 1× it is a 14px disc. It is unchanged by this round — the old ground gave the same ratios
to two decimals — so nothing regressed; whether to darken it is a decision for the user (spec §2.1), recorded as a
follow-up, not changed here. The guide marker was not hovered (no guide placed); its ratio is above the face
centre's. Markers were checked at 1920×1080 only; they are drawn at a fixed screen size, so 1366 changes nothing
about their contrast.

Note for anyone repeating this: on software GL a marker sometimes does not appear in a screenshot taken right after
a hover; moving 3px off and back and waiting 1.5s drew it reliably.

## 10. Final-review fix wave (2026-10-11)

Dev server, Playwright (Chromium), 1366×768 and 1920×1080. Fixture written straight into `localStorage`: two
projects, Alpha (2 guides, active) and Beta (3 guides); a 24 × 5-1/2 × 3/4in board added in Beta. `localStorage`
cleared afterwards, `localStorage.length === 0` confirmed (re-read after 1.5s, nothing re-written).

**Guides footer on load and switch (finding 3).** 1366: page load opens Alpha → `Guides · 2`, `aria-expanded="false"`.
Project menu → Beta → `Guides · 3`, `false`. A guide placed with the Tape tool (corner click, `6`, `X`, Enter) →
`Guides · 4`, `true`. 1920: reload (Beta, 4 guides) → `false`. In the unit suite the restored `activeId` and document
land in ONE render: a render log of the footer showed the unkeyed instance only ever at count 0 and the keyed one
mounting at the restored count, never an old instance seeing the new count.

**An errored field keeps its cell (finding 2).** Board selected, `abc` typed in Width, Enter:

| | Length (x, y, w) | Width | Thickness | focus after |
|---|---|---|---|---|
| 1366 before | 1002, 266, 107.7 | 1117.7, 266, 107.7 | 1233.3, 266, 107.7 | — |
| 1366 after | 1002, 266, 107.7 | 1117.7, 266, 107.7 | 1233.3, 266, 107.7 | Width |
| 1920 before | 1552, 266, 112 | 1672, 266, 112 | 1793, 266, 112 | — |
| 1920 after | 1552, 266, 112 | 1672, 266, 112 | 1793, 266, 112 | Width |

Width stays in column 2, Thickness in column 3 (grid `107.656px 107.672px 107.656px` at 1366); the error
"Enter a measurement, e.g. 3/4 or 1-1/2" wraps inside Width's cell, and the row grows to fit it. Escape then blur
restored `5-1/2"`. Screenshot `docs/img/ui-polish-field-error-in-cell.png` (1366).

**Cut card rows (finding 1).** Field boxes (x, y, w) after "+ Add cut":

| Row | 1366 | 1920 |
|---|---|---|
| Cut into \| From | 1011,601,157 \| 1176,601,157 | 1561,898,159 \| 1728,898,159 |
| Runs across (full) | 1011,651,321 | 1561,948,325 |
| Stop short — near end \| — far end | 1011,701,157 \| 1176,701,157 | 1561,998,159 \| 1728,998,159 |
| From the end \| Cut width | 1011,749,157 \| 1176,749,157 | 1561,1046,159 \| 1728,1046,159 |
| Depth | 1011,797,157 | 1561,1094,159 |

Screenshot `docs/img/ui-polish-cut-card-stops-row.png` (1366).

**Header with the longest label (finding 6).** The Claude trigger's text node set to `Claude · Generating 3/3…` via
the DOM (accessible text `Claude · Generating 3/3… ▾`):

| | header `scrollWidth`/`clientWidth` | overlaps | one line | trigger | free space |
|---|---|---|---|---|---|
| 1366 | 1366 / 1366 | none (10 controls) | yes — every control centred at y 23, trigger 1 line box, 28.8px tall | 512–699px (187.3px) | Redo ends 794, Settings starts 1134: 340px |
| 1920 | 1920 / 1920 | none | yes, y 23 | 512–699px | Redo 794 → Settings 1688: 894px |

Screenshot `docs/img/ui-polish-header-longest-1366.png`.

**New-badge ink (finding 5).** A `.project-row-new` span measured in the page: `rgb(35, 25, 15)` on
`rgb(200, 149, 90)`, **6.49:1** (was 4.39:1 with `--raised-2`).

**Accessible-name and text changes the plan's Global Constraints did not list (finding 8).** All are mandated by the
spec; the constraint list named only the grain select, the overlay toggles and the Claude trigger.

- The stop fields: "Stop short of near end" / "Stop short of far end" → **"Stop short — near end"** / **"Stop short —
  far end"** (spec §4.4).
- The cut button: "Add cut" → **"+ Add cut"** (spec §4.4).
- A new **Perspective** button beside Orthographic (spec §3.2): the projection is a two-button segmented pair, each
  with `aria-pressed`; before, Orthographic was a single toggle.
- The assembly note: "Assembly — double-click it in the view to edit its parts." → **"Double-click it in the view to
  edit its parts."** — the kind chip (`ASSEMBLY`) now carries the word (spec §4.2).

## Not verified here

- **Real-GPU rendering** of the new ground, grid, hemisphere ground colour and the oak selection emissive
  (follow-up 26a): llvmpipe renders them here. The user looks once on real hardware after the deploy.
- **Real print-to-PDF** (follow-ups 70/79/84 still stand): only `emulateMedia('print')`.
- **Other browsers.** Chromium on Linux only. Popover's fix for browsers that do not focus a button on click is
  pinned only by simulated events; ProjectMenu keeps the latent handler (follow-up 250).
- **The deploy.** Not deployed; production still serves the mirrored-instances build.
