# Browser verification — custom materials, chunk 1

**Date:** 2026-10-14 · **Branch:** `custom-materials-1` (head `764d7d0`) · **Where:** the dev server on `localhost:5181`
(the origin holding the user's stored key and three projects), driven through the Playwright MCP, WebGL on llvmpipe
(software GL, fu 26a). **Spec:** `docs/superpowers/specs/2026-10-14-sloyd-custom-materials-design.md` §4, §6.
**Paid:** two calls, each approved by the user — a compile probe (≈ 1¢) and one Refine (≈ $0.03).

Starting state, recorded first: projects "Untitled", "Shaker Side Table", "Shaker Side Table — joined" (active);
`sloyd.llm.v1` present; no `sloyd.shop.v1`, no `sloyd.materials.v1`.

## Results (read from the DOM and from `localStorage`)

| # | Step | Read back |
|---|---|---|
| 1 | Materials & prices (from the cut list) → Add material ×3: Ash (solid), Baltic birch 5×5 (veneered, 60 × 60), Hardboard (plain, 96 × 48 default); colours set; Save | `sloyd.materials.v1` = layout 1 with the three, ids `m-s-…`, `m-v-…`, `m-p-…`; `sloyd.shop.v1` gained the three ids with their default buying |
| 2 | New project "Live materials — A"; Properties' Material select | one optgroup "Your library": Ash, Baltic birch 5×5, Hardboard; picking Ash → the stored project is version 15, `materials: [Ash]`, the part names `m-s-…`; the viewport tints the board Ash (screenshot `live-2-ash.png`, workspace) |
| 2b | Undo | the part back to `pine`, `materials: []` — one entry reverts both |
| 3 | Part set to Baltic birch 5×5, 50 × 50 × 1/2 | cut list "Baltic birch 5×5 — 1/2" · 1 sheet (60" × 60")", Sheet 1 holds the part; Buying "buy 1 sheet · no price" |
| 4 | Two parts selected (Shift-click in the parts list, "2 PARTS SELECTED"), Material → New material… | the dialog opened with one new row of kind **Veneered sheet** (the selection's kind); named "Birch ply 4×8", Save → both parts `m-v-…`, `materials` = [Birch ply 4×8]; one Undo → both parts back to Baltic birch, the copy pruned |
| 5 | Board set to Ash, Export | the file: version 15, `materials` = [Baltic birch 5×5, Ash] (exactly the used ones) |
| 5b | New project B → dialog → "Delete Ash from your library" → Save; Import the file | library without Ash; the imported project's picker: "This project" Baltic birch 5×5, Ash; "Your library" the rest; the dialog's Ash row: "Only in this project · Add to library" |
| 5c | Add to library → Save | library holds Ash again under the SAME id `m-s-t7721mpmxm` |
| 6 | Imported project: Ash's colour → #b09070, Save; open the original project A | A's dialog: "Differs from your library · Use library version"; using it → A's copy #b09070 (and the library's) |
| 7 | Explode 0.5, then cut list → Materials & prices… | "Add material" and "Ash: name" disabled, `title` "Slide Explode back to 0 to edit"; "Oak: price per board foot" enabled |

Dialog layout (screenshot `live-1-dialog-new.png`, workspace): built-in price fieldsets, then each new material's
fieldset — Name, Colour, Kind (select, new rows only), sheet size for sheet kinds, then Prices; a ✕ on unsaved rows.

Console: no errors. Only the existing three.js deprecations (`PCFSoftShadowMap`, `THREE.Clock`), llvmpipe's "GPU stall
due to ReadPixels" and React's DevTools notice.

Side effect worth knowing: one stray first attempt at step 4 (Ctrl+A did not reach the selection) created a library
entry "Sapele" (a veneered sheet) — removed with the cleanup below.

## Paid checks (fu 322)

- **Compile probe:** Refine's schema for project A (enum = the seven built-ins + `m-v-11rosydxpx`, `m-s-t7721mpmxm`;
  2,406 chars against Generate's 2,372), max_tokens 16, from inside the dev page with the stored key (never read out):
  HTTP 200, `req_011Cg1QMMMwRho2oZCqsS4XQ`, stop `max_tokens`, 1,847 in / 16 out. The per-project grammar compiles.
- **Refine** on "Live materials — A" (Ash board + Baltic birch board), instruction "Make the Ash board cherry.":
  Done, ≈ $0.03, saved "Live materials — A — refined"; change list "Board: Ash → Cherry"; 0 new issues, 1 already
  present (the two boards overlap — the fixture's, not Refine's). The saved project: version 15, `materials` =
  [Baltic birch 5×5] (Ash pruned, nothing uses it), parts `cherry` and `m-v-11rosydxpx` — the untouched custom
  material survived the round trip through the model.

## Cleanup

The four projects this check made (A, B, A's import, A — refined) were deleted through the project menu; the active
project switched back to "Shaker Side Table — joined"; `sloyd.materials.v1` and `sloyd.shop.v1` (both created by this
check) removed by name. Read back: the three original projects, `sloyd.llm.v1` present, `sloyd.autosave.v1`,
`sloyd.library.v1`, nothing else. The exported file was deleted from `.playwright-mcp/`; the page was navigated to
`about:blank` and the dev server stopped.

## Chunk 2 — nominal names (2026-10-14, branch `custom-materials-2`, head `ccd57be`)

Same origin (`localhost:5181`), same start state (three projects, the key, no library or prices keys). Free: no API call.

| Step | Read back |
|---|---|
| New project "Live nominal", + Add board (pine 24 × 5½ × ¾) | Properties shows "Nominal size" = `1×6`; the cut list row reads `1 × 24" × 5-1/2" 1×6 Board`; Buying `Buy 1 × 1×6 × 6′ · no price` |
| Nominal size → 2×4 | the stored part is thickness 1.5 × width 3.5; one Undo → back to 0.75 × 5.5 |
| Material → Oak | the Nominal size select is gone; the oak row has no name; Buying stays by the board foot |
| + Add board → Material → New material… → "SPF", Sold in nominal sizes on | the new row's prices switched to By the piece with the 29-size yard list; Save assigned SPF |
| SPF part → Nominal size 2×4, length 90 | row `1 × 90" × 3-1/2" 2×4 Board (1)`; Buying `Buy 1 × 2×4 × 8′ · no price`; layout caption `2×4 × 8′ — board 1` (screenshot `live-cutlist.png`, workspace) |

The `×` and `′` glyphs render cleanly in the row, the Buy line and the caption; drawings keep actual dimensions. Console:
no errors (the existing three.js/GL warnings only). Cleanup: "Live nominal" deleted through the project menu, the active
project switched back, `sloyd.materials.v1` and `sloyd.shop.v1` (created by this check) removed by name; read back as at
the start; navigated to `about:blank`, dev server stopped.
