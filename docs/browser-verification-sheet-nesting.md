# Browser verification: sheet-goods nesting

Task 8 of the sheet-nesting plan. This round added a purchasing-sheet count and an SVG
layout per sheet to the cut list, for material groups that are sheet goods (plywood,
MDF). None of the `SheetLayout`/`buildNesting` output had ever been rendered before this
pass — everything below was checked in a real browser, not asserted on mocks, per this
repo's standing rule (and the standing warning from follow-ups 58 and 81: a print-colour
defect survived one task review and one implementer self-review before, caught only by
rendering the page).

## How this was driven

Playwright MCP against `npm run dev -- --port 5199` (backgrounded), Chromium, software
GL (llvmpipe — see invariant 26a; irrelevant here since nothing in this round touches a
WebGL shader, but noted for completeness).

Rather than clicking twelve boards into existence through the UI, a v5 document was
built by hand (validated against `src/document/types.ts` and the schema notes in
`src/document/document.ts`) and written directly to `localStorage` under
`sloyd.autosave.v1` (the key `AUTOSAVE_KEY` in `src/storage/browser.ts`), then the page
was reloaded so `App`'s restore effect ran it through `migrateDocument`. This loaded
cleanly with no console errors, confirming the document was well-formed for v5 (`stock:
{ kerf }`, `cuts: []` on every board, all enum fields valid).

The project ("Sheet Nesting Verification") contained:

- **8 plywood parts** of mixed sizes: Side Panel L/R (48"×24"), Top/Bottom (36"×20"),
  Shelf 1/2 (34"×18"), Back Cleat (20"×3" — the sliver), Turned Divider (22"×16",
  `grain: 'width'`), Too Long Rail (100"×6" — forces `unplaceable`).
- **2 MDF parts**: MDF Base (30"×20"), MDF Insert (15"×10").
- **1 solid-lumber part**: Leg (28"×1-1/2", pine, `posture: 'upright'`), to confirm a
  non-sheet group shows neither a count nor a layout.

## Checks and observed results

**1. Sheet count in the heading matches the number of drawings rendered.**
Read via `document.querySelectorAll('.cutlist-layout-head')` and
`.cutlist-layout-count`:
- MDF: heading said "· 1 sheet (96" × 48")"; exactly one `<figure>` ("Sheet 1") rendered.
- Plywood: heading said "· 2 sheets (96" × 48")"; exactly two `<figure>`s ("Sheet 1",
  "Sheet 2") rendered.
Confirmed programmatically, not just by eye.

**2. No label bleeds outside its rectangle; the sliver shows an index with a matching
key entry; the key numbers contiguously.**
The Back Cleat (20"×3") and, unexpectedly but correctly, the Turned Divider (22"×16",
whose *turned* footprint on the sheet was 16" wide × 22" tall — narrow enough that
neither the two-line "full" tier nor the single-line "name" tier fit) both fell to the
`index` tier on Plywood Sheet 1, rendering as bare `1` and `2` inside their rectangles
with a matching key list below:
```
1. Turned Divider — 22" × 16"
2. Back Cleat — 20" × 3"
```
Numbered contiguously (1, 2 — not sparse), matching `nextIndex`'s counting rule in
`SheetLayout.tsx`. A programmatic check (`getBBox()` on every `<text>` inside a part's
`<g>`, compared against that part's own `<rect>` bounds, ±0.5 unit tolerance) found
**zero label bleeds** across all three rendered sheets (10 placed parts total, several
carrying two-line labels).

**3. The unplaceable part is named in its own line, and no sheet was opened for it.**
`Too Long Rail (100" × 6") does not fit a 96" × 48" sheet.` rendered as its own
`<p class="cutlist-unplaceable">` directly under the Plywood group heading, styled in
the alert colour on screen. It does not appear in either Plywood sheet's part list
(confirmed both visually and via the DOM query above — Sheet 1 has 5 parts, Sheet 2 has
3, both accounted for by the other 7 plywood parts).

**4. Parts do not overlap and none crosses the sheet outline.**
Checked programmatically as well as by eye: for every rendered sheet, every
`.cutlist-layout-part` rect's `x`/`y`/`width`/`height` was read from the SVG and checked
against the sheet's `viewBox` (0 out-of-bounds rects across 10 parts) and against every
other part on the same sheet pairwise (0 overlapping pairs). Visually confirmed in two
full-page screenshots (`cutlist-full.png`, `cutlist-scroll2.png` during this session).

**5. The turned part's rectangle reads taller than wide, consistent with its
placement, and its label matches the row above.**
Turned Divider has `grain: 'width'`, so `footprintsOf` swaps it: on the sheet its footprint
is `w = board.width (16")`, `h = board.length (22")` — turned. Its drawn rectangle in
Sheet 1 was visibly taller than wide (≈120×190 px in the screenshot), and its key-list
entry read `22" × 16"` — the board's own `length × width`, matching the cut-list row
above it exactly (`1 × 22" × 16" — Turned Divider`), not the swapped placed dimensions.
This confirms `PlacedPart.dims` is built from the board's own dimensions, never
re-derived from the placed, possibly-swapped `w`/`h`, per the doc comment in
`nesting.ts`.

**6. The "Sheet layouts" checkbox toggles the drawings; the count stays visible when
off.**
Unchecked: `document.querySelectorAll('.cutlist-layout').length` → `0` (all layout
figures removed from the DOM). The two group headings still read
`" · 1 sheet (96\" × 48\")"` and `" · 2 sheets (96\" × 48\")"` — confirmed via
`.cutlist-layout-count` text content, unchanged before and after the toggle. Re-checking
the box brought all three figures back. This is the intended behaviour per
`CutList.tsx`'s comment (the count is derived from `buildCutList`, independent of the
`layouts` view-state boolean that only gates the `<SheetLayout>` render).

**7. The solid-lumber group shows no count and no layout.**
The Pine group heading rendered as plain `Pine — 1-1/2"` with no `.cutlist-layout-count`
span (confirmed by DOM query returning only 2 `.cutlist-layout-count` elements total,
both under MDF and Plywood — none under Pine) and no `<figure class="cutlist-layout">`
between the Pine subtotal and the Plywood heading. Matches `group.nesting` being
`undefined` for a non-sheet-good group.

## Print check (the reason this task exists)

`page.emulateMedia({ media: 'print' })`, then computed styles (not stylesheet text):

```js
['.cutlist-layout-count','.cutlist-layout-head','.cutlist-unplaceable','.cutlist-layout-key']
  .map(s => [s, getComputedStyle(document.querySelector(s)).color])
```
Result — **every one `rgb(0, 0, 0)`**:
```
[".cutlist-layout-count", "rgb(0, 0, 0)"]
[".cutlist-layout-head",  "rgb(0, 0, 0)"]
[".cutlist-unplaceable",  "rgb(0, 0, 0)"]
[".cutlist-layout-key",   "rgb(0, 0, 0)"]
```

```js
[getComputedStyle(document.querySelector('.cutlist-layout-part')).fill,
 getComputedStyle(document.querySelector('.cutlist-layout-sheet')).stroke,
 getComputedStyle(document.querySelector('.cutlist-layout svg')).fill]
```
Result — **exactly as expected**: `rgb(255, 255, 255)`, `rgb(0, 0, 0)`, `rgb(0, 0, 0)`.

Additionally checked, because follow-up 81's exact defect shape (a more specific
*screen* rule outranking an enumerated print rule) was the standing worry named in the
task brief:

- `.cutlist-subtotal .cutlist-stock` (the group subtotal — the two-class selector that
  broke exactly this way for board feet in follow-up 81) → `rgb(0, 0, 0)`. **Not**
  brass. The matching two-class print override this round's CSS carries
  (`src/styles.css` around line 770, per the code comment referencing follow-ups 58/81)
  is doing its job.
- An SVG `<text>` element inside a rendered layout (a part label) →
  `getComputedStyle(text).fill` → `rgb(0, 0, 0)`.

A full-page screenshot was taken under the same print emulation
(`cutlist-print.png`/`cutlist-print-top.png` this session) and inspected by eye, not
just by computed style — per the task brief's explicit instruction that a computed-style
check confirms the cascade but not the composition. The rendered print page shows: the
toolbar/sidebar/viewport fully hidden (only `.cutlist-overlay` visible, per the
`@media print` rule hiding `.app > *:not(.cutlist-overlay)`); every heading, row, group
subtotal, unplaceable line, sheet caption and key-list entry in solid black on white;
every part rectangle white-filled with a black outline; every sheet outline black. No
element read as unexpectedly grey, brass, or otherwise off-black in the screenshot.

**No print-colour defect found in this round.** The CSS at `src/styles.css` (searched
around the `@media print` block) already carries an explicit comment naming follow-ups
58 and 81 and stating why the two-class `.cutlist-subtotal .cutlist-stock` override and
the `.cutlist-layout svg { fill: #000; }` / `.cutlist-layout-part { fill: #fff; stroke:
#000; }` / `.cutlist-layout-sheet { stroke: #000; }` rules were each added — this
verification pass confirms that reasoning holds in a rendered browser, it does not
surface a new instance of the defect.

## What was NOT verified

- **A real print-to-PDF render.** This host's Playwright exposes no `pdf()` (Chromium
  headless without a display backend for PDF generation on this VPS). `emulateMedia`
  reproduces the `@media print` cascade and was screenshotted, but that is not the same
  artifact a user's browser produces via File → Print → Save as PDF. This is the same
  standing gap follow-ups 70, 79 and 84 already record for the diagrams and board-feet
  rounds — carried forward unchanged for sheet nesting, not newly discovered here.
- **A sheet dense enough to need three or more shelves**, or a sheet where the packer's
  shelf-first-fit-decreasing choice visibly wastes material a human would pack tighter —
  the fixture here produced at most 2 shelves per sheet. The packing *algorithm* itself
  is unit-tested (per the design doc); this pass verified the *rendering* of whatever the
  algorithm produced, not the algorithm's packing quality.
- **Real hardware GL.** Not applicable to this round's own code (no shader/WebGL path
  is touched by `SheetLayout`/`buildNesting`), but noted per the repo's standing rule
  that software-GL findings on this host don't generalize to real hardware — irrelevant
  here since the SVG layouts are plain DOM/SVG, not a Three.js scene.

## Console

Checked at every step (`browser_console_messages`, level `warning`, cumulative). **Zero
errors** throughout the session. The only warnings present are pre-existing and
unrelated to this round: `THREE.Clock` deprecation, `THREE.WebGLShadowMap`
(`PCFSoftShadowMap` → `PCFShadowMap`) deprecation, and a software-GL "GPU stall due to
ReadPixels" performance message from the 3D viewport — none reference React, the cut
list, `SheetLayout`, or `nesting.ts`.

## Conclusion

Every check in the task brief passed, verified both by eye (four screenshots) and
programmatically (DOM/SVG geometry queries and computed-style reads) rather than by
reading the stylesheet. No defect was found; no code was changed. The one open item is
the pre-existing, already-recorded print-to-PDF gap.
